import type { Db } from "../../shared/db/client";
import * as draftsRepo from "../../shared/db/repos/draftsRepo";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import * as steeringTurnsRepo from "../../shared/db/repos/steeringTurnsRepo";
import {
  toPublicSteeringTurn,
  type PublicSteeringTurn,
  type SteeringTurnRecord
} from "../../shared/schemas/steering";
import { resolveRoleModel } from "../config/modelRoles";
import { evidenceId } from "../connectors/connector";
import { parseToolRequest } from "../ai/actionPolicy";
import { complete, invokeTool, type GatewayDeps } from "../ai/gateway";
import { appendStmt } from "../projector/evidence";
import { buildStewardPrompt } from "../agents/StewardAgent";

/**
 * Story 3.14 — persist one operator steering turn and public Evidence.
 * Does not write mode, budget, YOLO, guardrails, or ALLOWED_TOOLS.
 * `complete({ role: "steward" })` runs only when a mapping exists; failures
 * of that call never roll back the turn.
 */

const SUBMITTABLE = new Set(["running", "awaiting"]);

export type SubmitTurnInput = {
  runId: string;
  content: string;
  private: boolean;
  draftId?: string;
  actorDisplayName: string;
};

export type SubmitTurnResult =
  | { status: "ok"; turn: PublicSteeringTurn }
  | { status: "not_found" }
  | { status: "invalid"; message: string };

function publicTurnPayload(turn: SteeringTurnRecord): Record<string, unknown> {
  const projected = toPublicSteeringTurn(turn);
  return {
    actor: projected.actor,
    draftId: projected.draftId,
    private: projected.private,
    content: projected.content,
    turnId: projected.id
  };
}

async function denyToolShaped(
  gatewayDeps: GatewayDeps,
  runId: string,
  draftId: string,
  texts: string[]
): Promise<void> {
  for (const text of texts) {
    const requested = parseToolRequest(text);
    if (requested == null) continue;
    await invokeTool(gatewayDeps, {
      role: "steward",
      runId,
      draftId,
      tool: requested.tool
    });
    return;
  }
}

export async function submitTurn(
  db: Db,
  gatewayDeps: GatewayDeps,
  input: SubmitTurnInput
): Promise<SubmitTurnResult> {
  const content = input.content.trim();
  if (content.length === 0) {
    return { status: "invalid", message: "Content is required." };
  }

  const run = await runsRepo.getRunById(db, input.runId);
  if (!run) return { status: "not_found" };
  if (!SUBMITTABLE.has(run.status)) {
    return {
      status: "invalid",
      message: `Run is ${run.status}; steering is closed.`
    };
  }

  let draftBody: string | null = null;
  const draftId = input.draftId;
  if (draftId != null) {
    const draft = await draftsRepo.getById(db, draftId);
    if (!draft || draft.runId !== run.id) {
      return {
        status: "invalid",
        message: "Draft does not belong to this Run."
      };
    }
    draftBody = draft.body;
  }

  const now = gatewayDeps.now ?? (() => new Date().toISOString());
  const newId = gatewayDeps.newId ?? (() => crypto.randomUUID());
  const createdAt = now();
  const turn: SteeringTurnRecord = {
    id: `st:${run.id}:${newId()}`,
    runId: run.id,
    draftId: draftId ?? null,
    actorDisplayName: input.actorDisplayName,
    role: "steward",
    content,
    private: input.private,
    createdAt
  };

  const payload = publicTurnPayload(turn);
  await db.batch([
    steeringTurnsRepo.insertStmt(db, turn),
    appendStmt(db, {
      id: evidenceId(run.id, "steering.turn", turn.id),
      runId: run.id,
      event: "steering.turn",
      payload,
      createdAt
    }),
    appendStmt(db, {
      id: evidenceId(run.id, "steering.applied", turn.id),
      runId: run.id,
      event: "steering.applied",
      payload: { effect: "none", turnId: turn.id, draftId: turn.draftId },
      createdAt
    })
  ]);

  // Synthetic id: never a Draft row, so invokeTool cannot stamp guardrail_fail.
  const denyId = turn.id;
  const denyTexts = [content];
  if (draftBody != null) denyTexts.push(draftBody);
  try {
    await denyToolShaped(gatewayDeps, run.id, denyId, denyTexts);
  } catch {
    // Deny is best-effort after persist; the turn + applied receipt stay.
  }

  const mapping = await resolveRoleModel(db, "steward");
  if (mapping) {
    try {
      const result = await complete(gatewayDeps, {
        role: "steward",
        runId: run.id,
        prompt: buildStewardPrompt({
          content,
          draftId: turn.draftId
        })
      });
      try {
        await denyToolShaped(gatewayDeps, run.id, denyId, [result.text]);
      } catch {
        // Same as above: persist already succeeded.
      }
    } catch {
      // Persist already succeeded; a retry must not duplicate the turn.
    }
  }

  return { status: "ok", turn: toPublicSteeringTurn(turn) };
}
