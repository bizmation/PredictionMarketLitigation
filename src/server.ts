import { routeAgentRequest } from "agents";
import { AIChatAgent } from "@cloudflare/ai-chat";
import { z } from "zod";

import {
  ADMIN_CACHE_HEADERS,
  isAdminApiPath,
  isAdminSessionPath,
  isAgentsPath,
  requireOperator
} from "./shared/lib/adminGuard";
import { handlePublicApi } from "./shared/api/publicRouter";
import {
  ApiError,
  badRequest,
  budgetStopped,
  conflict,
  internalError,
  notFound
} from "./shared/api/errors";
import { jsonError } from "./shared/api/respond";
import { getDb } from "./shared/db/client";
import * as draftsRepo from "./shared/db/repos/draftsRepo";
import * as modeRepo from "./shared/db/repos/modeRepo";
import * as runsRepo from "./shared/db/repos/runsRepo";
import { IsoDateSchema } from "./shared/schemas/common";
import { ModePostBodySchema } from "./shared/schemas/mode";
import { etCalendarDate } from "./shared/lib/schedule";
import {
  createWorkersAiProvider,
  type LlmProvider
} from "./pipeline/ai/gateway";
import { decide } from "./pipeline/gate/approval";
import { submitTurn } from "./pipeline/steering/submitTurn";
import { SteeringPostBodySchema } from "./shared/schemas/steering";
import {
  DailyRunWorkflow,
  kickDailyRun,
  startOperatorRun
} from "./pipeline/workflow/dailyRun";

export { DailyRunWorkflow };

/**
 * Mirror of adminGuard's internal normalizePath. That module is frozen —
 * story 3.10's routes ride the guard without changing it — so this file keeps
 * its own copy so the new handlers match exactly the paths the guard admits.
 */
function normalizeAdminPath(pathname: string): string {
  let decoded = pathname;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return pathname.replace(/\/{2,}/g, "/");
    }
  }
  return decoded.replace(/\/{2,}/g, "/");
}

const DecisionBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }).strict(),
  z
    .object({ action: z.literal("edit"), editedBody: z.string().trim().min(1) })
    .strict(),
  z
    .object({
      action: z.literal("reject"),
      rejectReason: z.string().trim().min(1),
      private: z.boolean().optional()
    })
    .strict()
]);

const OperatorRunBodySchema = z
  .object({
    origin: z.enum(["manual", "catch-up"]),
    scheduledFor: IsoDateSchema.optional(),
    supersedePriorPublish: z.boolean().optional()
  })
  .strict();

export class ChatAgent extends AIChatAgent<Env> {
  maxPersistedMessages = 100;
  chatRecovery = true;

  /**
   * Demo tools, Workers AI, and MCP add/remove are stripped (story 3.14).
   * Operator steering is POST /api/admin/runs/:runId/steering so spend and
   * Evidence stay on the Run. The Durable Object remains for 1.2/1.5 wiring.
   */
  async onChatMessage() {
    return new Response(
      "Steering is submitted through the approval-queue channel, not this agent.",
      { headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }
}

export default {
  async fetch(request: Request, env: Env) {
    // Story 1.4 — the admin perimeter runs before anything else routes.
    //
    // Cloudflare Access will sit in front of this at the edge from story 1.5,
    // but the edge is not the only door: this Worker stays reachable at its
    // workers.dev hostname and at preview URLs, where the Access header is
    // forgeable. requireOperator verifies the JWT signature and audience, so
    // those doors answer 403 rather than serving the operator's surface.
    const { pathname } = new URL(request.url);

    // /oauth/* is deliberately NOT guarded here, unlike /agents/* below.
    // ChatAgent no longer attaches MCP servers (story 3.14); the path stays
    // unguarded so an existing OAuth callback cannot 403 a leftover flow.

    // Story 1.5 — the agent surface is operator-only too. ChatAgent's demo
    // tools and MCP add/remove are gone (3.14); the door stays locked so
    // /agents is not a second unprojected LLM path.
    if (isAgentsPath(pathname)) {
      const gate = await requireOperator(request, env);
      if (gate instanceof Response) return gate;

      return (
        (await routeAgentRequest(request, env)) ||
        new Response("Not found", { status: 404, headers: ADMIN_CACHE_HEADERS })
      );
    }

    if (isAdminApiPath(pathname)) {
      const gate = await requireOperator(request, env);
      if (gate instanceof Response) return gate;

      // Story 1.4's AC4, display-name half — closed 2026-08-10, once Part B
      // gave the admin surface a real Access session to read.
      //
      // The admin shell renders client-side from a static document, so it has
      // no server-injected identity: without this it showed "Not signed in" to
      // an operator who had just passed an Access challenge. That is the
      // inverse of the honesty rule the chrome is built around — a surface
      // must not understate its protection any more than overstate it.
      //
      // ONLY displayName crosses the wire. access.ts types the operator's
      // `email` as "never render this publicly", and story 3.13 puts this same
      // name into mode-change audit entries on the PUBLIC ops. surface, so the
      // field that leaves here has to be the one that is safe to publish.
      // Sending the whole operator object would quietly make the email
      // publishable by a later caller that just spreads what it was given.
      if (isAdminSessionPath(pathname)) {
        if (request.method !== "GET" && request.method !== "HEAD") {
          return new Response("Method not allowed", {
            status: 405,
            headers: { ...ADMIN_CACHE_HEADERS, allow: "GET, HEAD" }
          });
        }
        return Response.json(
          { displayName: gate.operator.displayName },
          { headers: ADMIN_CACHE_HEADERS }
        );
      }

      // Story 3.10 — the operator's door. The routes below match the SAME
      // normalized path the guard above admitted; without this an encoded or
      // double-slashed path would clear the guard and fall into the 404
      // placeholder instead of answering.
      const adminPath = normalizeAdminPath(pathname);

      if (adminPath === "/api/admin/queue") {
        if (request.method !== "GET" && request.method !== "HEAD") {
          return new Response("Method not allowed", {
            status: 405,
            headers: { ...ADMIN_CACHE_HEADERS, allow: "GET, HEAD" }
          });
        }
        try {
          return Response.json(
            { items: await draftsRepo.listPending(getDb(env)) },
            { headers: ADMIN_CACHE_HEADERS }
          );
        } catch (error) {
          console.error(
            JSON.stringify({
              event: "admin_api.error",
              path: pathname,
              message: error instanceof Error ? error.message : String(error)
            })
          );
          return jsonError(internalError(), {
            headers: ADMIN_CACHE_HEADERS
          });
        }
      }

      const decisionMatch = /^\/api\/admin\/drafts\/([^/]+)\/decision$/.exec(
        adminPath
      );
      if (decisionMatch) {
        if (request.method !== "POST") {
          return new Response("Method not allowed", {
            status: 405,
            headers: { ...ADMIN_CACHE_HEADERS, allow: "POST" }
          });
        }
        let draftId: string;
        try {
          draftId = decodeURIComponent(decisionMatch[1]!);
        } catch {
          return jsonError(badRequest("Malformed draft ID."), {
            headers: ADMIN_CACHE_HEADERS
          });
        }
        try {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return jsonError(badRequest("Malformed JSON body."), {
              headers: ADMIN_CACHE_HEADERS
            });
          }
          const parsed = DecisionBodySchema.safeParse(body);
          if (!parsed.success) {
            return jsonError(badRequest("Invalid decision body."), {
              headers: ADMIN_CACHE_HEADERS
            });
          }
          const common = {
            draftId,
            operator: { displayName: gate.operator.displayName },
            now: new Date().toISOString()
          };
          let result: Awaited<ReturnType<typeof decide>>;
          if (parsed.data.action === "approve") {
            result = await decide(getDb(env), {
              ...common,
              action: "approve"
            });
          } else if (parsed.data.action === "edit") {
            result = await decide(getDb(env), {
              ...common,
              action: "edit",
              editedBody: parsed.data.editedBody
            });
          } else {
            // `private` moves the reason into the private column: the public
            // wire field and the gate.decided payload get null, the text only
            // ever lands in reject_reason_private.
            const reason = parsed.data.rejectReason;
            result = await decide(getDb(env), {
              ...common,
              action: "reject",
              rejectReason: parsed.data.private === true ? null : reason,
              rejectReasonPrivate: parsed.data.private === true ? reason : null
            });
          }
          switch (result.status) {
            case "not_found":
              return jsonError(notFound(`Draft '${draftId}' not found.`), {
                headers: ADMIN_CACHE_HEADERS
              });
            case "already_decided":
              return jsonError(conflict("Draft already decided."), {
                headers: ADMIN_CACHE_HEADERS
              });
            case "invalid":
              return jsonError(badRequest("Invalid decision body."), {
                headers: ADMIN_CACHE_HEADERS
              });
            case "decided":
              return Response.json(result.record, {
                headers: ADMIN_CACHE_HEADERS
              });
          }
        } catch (error) {
          console.error(
            JSON.stringify({
              event: "admin_api.error",
              path: pathname,
              message: error instanceof Error ? error.message : String(error)
            })
          );
          return jsonError(internalError(), { headers: ADMIN_CACHE_HEADERS });
        }
      }

      // Story 3.12 — live/last status is the same row the public log uses.
      if (adminPath === "/api/admin/loop") {
        if (request.method !== "GET" && request.method !== "HEAD") {
          return new Response("Method not allowed", {
            status: 405,
            headers: { ...ADMIN_CACHE_HEADERS, allow: "GET, HEAD" }
          });
        }
        try {
          const items = await runsRepo.listRuns(getDb(env));
          return Response.json(
            { latest: items[0] ?? null },
            { headers: ADMIN_CACHE_HEADERS }
          );
        } catch (error) {
          console.error(
            JSON.stringify({
              event: "admin_api.error",
              path: pathname,
              message: error instanceof Error ? error.message : String(error)
            })
          );
          return jsonError(internalError(), {
            headers: ADMIN_CACHE_HEADERS
          });
        }
      }

      if (adminPath === "/api/admin/runs") {
        if (request.method !== "POST") {
          return new Response("Method not allowed", {
            status: 405,
            headers: { ...ADMIN_CACHE_HEADERS, allow: "POST" }
          });
        }
        try {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return jsonError(badRequest("Malformed JSON body."), {
              headers: ADMIN_CACHE_HEADERS
            });
          }
          const parsed = OperatorRunBodySchema.safeParse(body);
          if (!parsed.success) {
            return jsonError(badRequest("Invalid run trigger body."), {
              headers: ADMIN_CACHE_HEADERS
            });
          }
          const now = new Date();
          const result = await startOperatorRun(getDb(env), env.DAILY_RUN, {
            origin: parsed.data.origin,
            scheduledFor: parsed.data.scheduledFor ?? etCalendarDate(now),
            supersedePriorPublish: parsed.data.supersedePriorPublish,
            now
          });
          switch (result.status) {
            case "started":
              return Response.json(result.run, {
                headers: ADMIN_CACHE_HEADERS
              });
            case "conflict":
              return jsonError(
                conflict(
                  "A run is already in flight or awaiting approval for this date."
                ),
                { headers: ADMIN_CACHE_HEADERS }
              );
            case "supersede_required":
              return jsonError(
                new ApiError(
                  409,
                  "supersede_required",
                  "Confirm supersede of the prior published Run.",
                  { priorRunId: result.priorRunId }
                ),
                { headers: ADMIN_CACHE_HEADERS }
              );
            case "workflow_unavailable":
              return jsonError(internalError(), {
                headers: ADMIN_CACHE_HEADERS
              });
          }
        } catch (error) {
          console.error(
            JSON.stringify({
              event: "admin_api.error",
              path: pathname,
              message: error instanceof Error ? error.message : String(error)
            })
          );
          return jsonError(internalError(), { headers: ADMIN_CACHE_HEADERS });
        }
      }

      if (adminPath === "/api/admin/mode") {
        if (request.method !== "POST") {
          return new Response("Method not allowed", {
            status: 405,
            headers: { ...ADMIN_CACHE_HEADERS, allow: "POST" }
          });
        }
        try {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return jsonError(badRequest("Malformed JSON body."), {
              headers: ADMIN_CACHE_HEADERS
            });
          }
          const parsed = ModePostBodySchema.safeParse(body);
          if (!parsed.success) {
            return jsonError(badRequest("Invalid mode body."), {
              headers: ADMIN_CACHE_HEADERS
            });
          }
          const result = await modeRepo.set(getDb(env), {
            mode: parsed.data.mode,
            threshold: parsed.data.threshold,
            actor: gate.operator.displayName,
            now: new Date().toISOString()
          });
          return Response.json(result, { headers: ADMIN_CACHE_HEADERS });
        } catch (error) {
          console.error(
            JSON.stringify({
              event: "admin_api.error",
              path: pathname,
              message: error instanceof Error ? error.message : String(error)
            })
          );
          return jsonError(internalError(), { headers: ADMIN_CACHE_HEADERS });
        }
      }

      const steeringMatch = /^\/api\/admin\/runs\/([^/]+)\/steering$/.exec(
        adminPath
      );
      if (steeringMatch) {
        if (request.method !== "POST") {
          return new Response("Method not allowed", {
            status: 405,
            headers: { ...ADMIN_CACHE_HEADERS, allow: "POST" }
          });
        }
        let runId: string;
        try {
          runId = decodeURIComponent(steeringMatch[1]!);
        } catch {
          return jsonError(badRequest("Malformed run ID."), {
            headers: ADMIN_CACHE_HEADERS
          });
        }
        try {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return jsonError(badRequest("Malformed JSON body."), {
              headers: ADMIN_CACHE_HEADERS
            });
          }
          const parsed = SteeringPostBodySchema.safeParse(body);
          if (!parsed.success) {
            return jsonError(badRequest("Invalid steering body."), {
              headers: ADMIN_CACHE_HEADERS
            });
          }
          const db = getDb(env);
          const result = await submitTurn(
            db,
            {
              db,
              provider: createWorkersAiProvider(env) as LlmProvider
            },
            {
              runId,
              content: parsed.data.content,
              private: parsed.data.private,
              draftId: parsed.data.draftId,
              intent: parsed.data.intent,
              key: parsed.data.key,
              revertToVersion: parsed.data.revertToVersion,
              guidanceItemId: parsed.data.guidanceItemId,
              revoke: parsed.data.revoke,
              actorDisplayName: gate.operator.displayName
            }
          );
          switch (result.status) {
            case "not_found":
              return jsonError(notFound(`Run '${runId}' not found.`), {
                headers: ADMIN_CACHE_HEADERS
              });
            case "invalid":
              return jsonError(badRequest(result.message), {
                headers: ADMIN_CACHE_HEADERS
              });
            case "budget_stopped":
              return jsonError(
                budgetStopped(
                  "Run spend reached the budget ceiling; the change did not apply.",
                  result.turn
                ),
                { headers: ADMIN_CACHE_HEADERS }
              );
            case "ok":
              return Response.json(result.turn, {
                headers: ADMIN_CACHE_HEADERS
              });
          }
        } catch (error) {
          console.error(
            JSON.stringify({
              event: "admin_api.error",
              path: pathname,
              message: error instanceof Error ? error.message : String(error)
            })
          );
          return jsonError(internalError(), { headers: ADMIN_CACHE_HEADERS });
        }
      }

      // No other admin handlers exist yet — 4.6 feedback moderation.
      // Reaching here means the caller IS the operator and simply asked
      // for something that does not exist. The guard above is what this
      // placeholder exists to prove.
      return new Response("Not found", {
        status: 404,
        headers: ADMIN_CACHE_HEADERS
      });
    }

    // Story 2.1 — public F1 REST. Read-only until Story 2.9 added the one
    // public mutation (POST /api/poll/votes). After admin/agents guards so
    // `/api/admin/*` cannot fall into the public router unguarded.
    const publicResponse = await handlePublicApi(request, env, pathname);
    if (publicResponse) return publicResponse;

    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  },
  // Story 3.3 — dual-UTC crons (16:00Z / 17:00Z). kickDailyRun applies the
  // ET-hour guard BEFORE create so the off-hour twin never occupies the
  // deterministic instance id.
  async scheduled(controller: ScheduledController, env: Env) {
    await kickDailyRun(env.DAILY_RUN, new Date(controller.scheduledTime));
  }
} satisfies ExportedHandler<Env>;
