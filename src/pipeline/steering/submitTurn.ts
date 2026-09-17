import type { Db } from "../../shared/db/client";
import * as draftsRepo from "../../shared/db/repos/draftsRepo";
import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import * as pipelineConfigRepo from "../../shared/db/repos/pipelineConfigRepo";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import * as steeringTurnsRepo from "../../shared/db/repos/steeringTurnsRepo";
import {
  ConfigProposalSchema,
  PIPELINE_CONFIG_KEY,
  PollSourcesSchema,
  isForbiddenPipelineConfigKey,
  type PollSource
} from "../../shared/schemas/pipelineConfig";
import type { DraftRecord } from "../../shared/schemas/run";
import {
  toPublicSteeringTurn,
  type PublicSteeringTurn,
  type SteeringTurnRecord
} from "../../shared/schemas/steering";
import { resolveRoleModel } from "../config/modelRoles";
import { evidenceId } from "../connectors/connector";
import { enforceDraftGuardrails, parseToolRequest } from "../ai/actionPolicy";
import {
  complete,
  invokeTool,
  GatewayError,
  type GatewayDeps
} from "../ai/gateway";
import { draftAndReview } from "../agents/draftAndReview";
import { appendStmt } from "../projector/evidence";
import {
  buildConfigSteerPrompt,
  buildInterrogationPrompt,
  buildStewardPrompt
} from "../agents/StewardAgent";

/**
 * Story 3.15/3.16/3.17 — persist one operator steering turn. `ask`
 * (default) grounds a steward interrogation and never writes a Draft.
 * `revise` inserts a child Draft under the same Run and re-runs drafter →
 * guardrails → reviewer. `config` versions `poll_sources` (conversational
 * apply via steward JSON, or structured revert). The operator turn is
 * persisted first and is never rolled back if steward/`complete()` fails.
 * Does not call `afterPackaging`, `autoApproveRun`, `decide`, or F1 apply.
 * Steward `complete()` runs on ask and conversational config, not revise
 * or revert.
 */

const SUBMITTABLE = new Set(["running", "awaiting"]);

export type SubmitTurnInput = {
  runId: string;
  content: string;
  private: boolean;
  draftId?: string;
  intent?: "ask" | "revise" | "config";
  key?: string;
  revertToVersion?: number;
  actorDisplayName: string;
};

export type SubmitTurnResult =
  | { status: "ok"; turn: PublicSteeringTurn }
  | { status: "not_found" }
  | { status: "invalid"; message: string }
  | { status: "budget_stopped"; turn: PublicSteeringTurn };

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

async function persistTurnReceipt(
  db: Db,
  turn: SteeringTurnRecord,
  createdAt: string
): Promise<void> {
  const payload = publicTurnPayload(turn);
  await db.batch([
    steeringTurnsRepo.insertStmt(db, turn),
    appendStmt(db, {
      id: evidenceId(turn.runId, "steering.turn", turn.id),
      runId: turn.runId,
      event: "steering.turn",
      payload,
      createdAt
    }),
    appendStmt(db, {
      id: evidenceId(turn.runId, "steering.applied", turn.id),
      runId: turn.runId,
      event: "steering.applied",
      payload: { effect: "none", turnId: turn.id, draftId: turn.draftId },
      createdAt
    })
  ]);
}

async function askSteward(
  db: Db,
  gatewayDeps: GatewayDeps,
  input: {
    turn: SteeringTurnRecord;
    loadedDraft: DraftRecord | null;
    content: string;
    now: () => string;
  }
): Promise<string | null> {
  const mapping = await resolveRoleModel(db, "steward");
  if (!mapping) return null;
  try {
    const prompt =
      input.loadedDraft != null
        ? buildInterrogationPrompt({
            content: input.content,
            draft: input.loadedDraft,
            evidence: await evidenceRepo.listByRun(db, input.turn.runId)
          })
        : buildStewardPrompt({
            content: input.content,
            draftId: input.turn.draftId
          });
    const result = await complete(gatewayDeps, {
      role: "steward",
      runId: input.turn.runId,
      prompt
    });
    try {
      await denyToolShaped(gatewayDeps, input.turn.runId, input.turn.id, [
        result.text
      ]);
    } catch {
      // Persist already succeeded.
    }
    await db.batch([
      appendStmt(db, {
        id: evidenceId(
          input.turn.runId,
          "steering.applied",
          input.turn.id,
          "reply"
        ),
        runId: input.turn.runId,
        event: "steering.applied",
        payload: {
          effect: "none",
          turnId: input.turn.id,
          draftId: input.turn.draftId,
          reply: input.turn.private ? null : result.text,
          private: input.turn.private
        },
        createdAt: input.now()
      })
    ]);
    return result.text;
  } catch {
    return null;
  }
}

async function reviseDraft(
  db: Db,
  gatewayDeps: GatewayDeps,
  input: {
    turn: SteeringTurnRecord;
    parent: DraftRecord;
    content: string;
    now: () => string;
  }
): Promise<
  | { status: "ok"; revisedDraftId: string }
  | { status: "budget_stopped" }
  | { status: "invalid" }
> {
  const latest = await draftsRepo.getById(db, input.parent.id);
  if (latest == null || latest.outcome != null) {
    return { status: "invalid" };
  }
  const siblings = await draftsRepo.listByRun(db, latest.runId);
  if (
    draftsRepo.hasInFlightSuccessor(latest, siblings) ||
    !draftsRepo.isPendingReadyTip(latest, siblings)
  ) {
    return { status: "invalid" };
  }

  const n = latest.revisionIndex + 1;
  const childId = draftsRepo.revisionDraftId(latest.id, n);
  await draftsRepo.insertDraft(db, {
    id: childId,
    runId: latest.runId,
    targetEntityType: latest.targetEntityType,
    targetEntityId: latest.targetEntityId,
    diff: latest.diff,
    body: latest.body,
    tier2Only: latest.tier2Only,
    confidence: null,
    evalSummary: null,
    parentDraftId: latest.id,
    revisionIndex: n,
    createdAt: input.now()
  });

  let budgetStopped = false;
  try {
    const result = await draftAndReview(db, input.parent.runId, gatewayDeps, {
      revisionInstruction: input.content
    });
    budgetStopped = result.budgetStopped;
  } catch {
    // Turn already persisted; in-flight child stays non-ready when eval
    // was not stamped.
  }

  const child = await draftsRepo.getById(db, childId);
  if (child == null || child.evalSummary == null) {
    return budgetStopped ? { status: "budget_stopped" } : { status: "invalid" };
  }

  try {
    await enforceDraftGuardrails(db, input.parent.runId, gatewayDeps);
    await db.batch([
      appendStmt(db, {
        id: evidenceId(input.parent.runId, "draft.revised", childId),
        runId: input.parent.runId,
        event: "draft.revised",
        payload: {
          draftId: childId,
          parentDraftId: input.parent.id,
          turnId: input.turn.id,
          revisionIndex: n
        },
        createdAt: input.now()
      }),
      appendStmt(db, {
        id: evidenceId(
          input.parent.runId,
          "steering.applied",
          input.turn.id,
          "revised"
        ),
        runId: input.parent.runId,
        event: "steering.applied",
        payload: {
          effect: "revised",
          turnId: input.turn.id,
          draftId: childId,
          parentDraftId: input.parent.id
        },
        createdAt: input.now()
      })
    ]);
  } catch {
    return { status: "invalid" };
  }

  return { status: "ok", revisedDraftId: childId };
}

function isBudgetStopped(err: unknown): boolean {
  return err instanceof GatewayError && err.code === "budget_stopped";
}

function stripMarkdownFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function parseConfigProposal(
  text: string
): { key: string; value: unknown } | null {
  try {
    const parsed = ConfigProposalSchema.safeParse(
      JSON.parse(stripMarkdownFence(text))
    );
    if (!parsed.success) return null;
    return { key: parsed.data.key, value: parsed.data.value };
  } catch {
    return null;
  }
}

function refusalReason(key: string): string {
  return isForbiddenPipelineConfigKey(key) ? "not chat-mutable" : "unknown key";
}

async function recordConfigRefusal(
  db: Db,
  input: {
    turn: SteeringTurnRecord;
    key: string;
    reason: string;
    now: () => string;
  }
): Promise<void> {
  await db.batch([
    appendStmt(db, {
      id: evidenceId(input.turn.runId, "config.steered", input.turn.id),
      runId: input.turn.runId,
      event: "config.steered",
      payload: {
        turnId: input.turn.id,
        refused: true,
        key: input.key,
        reason: input.reason
      },
      createdAt: input.now()
    })
  ]);
}

async function recordConfigSuccess(
  db: Db,
  input: {
    turn: SteeringTurnRecord;
    key: typeof PIPELINE_CONFIG_KEY;
    version: number;
    prior: PollSource[];
    next: PollSource[];
    now: () => string;
  }
): Promise<void> {
  await db.batch([
    appendStmt(db, {
      id: evidenceId(input.turn.runId, "config.steered", input.turn.id),
      runId: input.turn.runId,
      event: "config.steered",
      payload: {
        turnId: input.turn.id,
        key: input.key,
        version: input.version,
        prior: input.prior,
        next: input.next
      },
      createdAt: input.now()
    }),
    appendStmt(db, {
      id: evidenceId(
        input.turn.runId,
        "steering.applied",
        input.turn.id,
        "steered"
      ),
      runId: input.turn.runId,
      event: "steering.applied",
      payload: {
        effect: "steered",
        turnId: input.turn.id,
        key: input.key,
        version: input.version
      },
      createdAt: input.now()
    })
  ]);
}

async function steerPipelineConfig(
  db: Db,
  gatewayDeps: GatewayDeps,
  input: {
    turn: SteeringTurnRecord;
    content: string;
    key?: string;
    revertToVersion?: number;
    now: () => string;
  }
): Promise<
  | { status: "ok"; version: number; reply: string | null }
  | { status: "refused"; reply: string | null }
  | { status: "invalid" }
  | { status: "budget_stopped" }
> {
  if (input.revertToVersion != null) {
    if (input.key !== PIPELINE_CONFIG_KEY) {
      return { status: "invalid" };
    }
    try {
      const row = await pipelineConfigRepo.revertTo(db, {
        revertToVersion: input.revertToVersion,
        actor: input.turn.actorDisplayName,
        createdAt: input.now()
      });
      try {
        await recordConfigSuccess(db, {
          turn: input.turn,
          key: PIPELINE_CONFIG_KEY,
          version: row.version,
          prior: row.prior,
          next: row.next,
          now: input.now
        });
      } catch {
        // Version write already committed; Evidence is best-effort.
      }
      return { status: "ok", version: row.version, reply: null };
    } catch {
      return { status: "invalid" };
    }
  }

  const mapping = await resolveRoleModel(db, "steward");
  if (!mapping) return { status: "invalid" };

  const effective = await pipelineConfigRepo.getEffectivePollSources(db);
  try {
    const result = await complete(gatewayDeps, {
      role: "steward",
      runId: input.turn.runId,
      prompt: buildConfigSteerPrompt({
        content: input.content,
        pollSources: effective.sources
      })
    });
    try {
      await denyToolShaped(gatewayDeps, input.turn.runId, input.turn.id, [
        result.text
      ]);
    } catch {
      // Persist already succeeded.
    }
    if (parseToolRequest(result.text) != null) {
      return { status: "invalid" };
    }
    const proposal = parseConfigProposal(result.text);
    if (proposal == null) return { status: "invalid" };
    const reply = input.turn.private ? null : result.text;
    if (proposal.key !== PIPELINE_CONFIG_KEY) {
      await recordConfigRefusal(db, {
        turn: input.turn,
        key: proposal.key,
        reason: refusalReason(proposal.key),
        now: input.now
      });
      return { status: "refused", reply };
    }
    const parsed = PollSourcesSchema.safeParse(proposal.value);
    if (!parsed.success) return { status: "invalid" };
    const row = await pipelineConfigRepo.appendVersion(db, {
      newValue: parsed.data,
      actor: input.turn.actorDisplayName,
      createdAt: input.now()
    });
    try {
      await recordConfigSuccess(db, {
        turn: input.turn,
        key: PIPELINE_CONFIG_KEY,
        version: row.version,
        prior: row.prior,
        next: row.next,
        now: input.now
      });
    } catch {
      // Version write already committed; Evidence is best-effort.
    }
    return { status: "ok", version: row.version, reply };
  } catch (err) {
    if (isBudgetStopped(err)) return { status: "budget_stopped" };
    return { status: "invalid" };
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

  const intent = input.intent ?? "ask";
  const run = await runsRepo.getRunById(db, input.runId);
  if (!run) return { status: "not_found" };
  if (!SUBMITTABLE.has(run.status)) {
    return {
      status: "invalid",
      message: `Run is ${run.status}; steering is closed.`
    };
  }

  let loadedDraft: DraftRecord | null = null;
  const draftId = input.draftId;
  if (draftId != null) {
    const draft = await draftsRepo.getById(db, draftId);
    if (!draft || draft.runId !== run.id) {
      return {
        status: "invalid",
        message: "Draft does not belong to this Run."
      };
    }
    if (draft.outcome != null) {
      return {
        status: "invalid",
        message: "Draft is not pending."
      };
    }
    loadedDraft = draft;
  }

  if (intent === "revise") {
    if (run.status !== "awaiting") {
      return {
        status: "invalid",
        message: "Run is not awaiting; revise is closed."
      };
    }
    if (draftId == null || loadedDraft == null) {
      return {
        status: "invalid",
        message: "Revise requires a pending draftId."
      };
    }
    const siblings = await draftsRepo.listByRun(db, run.id);
    if (
      draftsRepo.hasInFlightSuccessor(loadedDraft, siblings) ||
      !draftsRepo.isPendingReadyTip(loadedDraft, siblings)
    ) {
      return {
        status: "invalid",
        message: "Draft is not the current ready chain tip."
      };
    }
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

  await persistTurnReceipt(db, turn, createdAt);

  const denyId = turn.id;
  const denyTexts = [content];
  if (loadedDraft != null) denyTexts.push(loadedDraft.body);
  try {
    await denyToolShaped(gatewayDeps, run.id, denyId, denyTexts);
  } catch {
    // Deny is best-effort after persist; the turn + applied receipt stay.
  }

  if (intent === "revise" && loadedDraft != null) {
    const revised = await reviseDraft(db, gatewayDeps, {
      turn,
      parent: loadedDraft,
      content,
      now
    });
    const publicTurn = toPublicSteeringTurn(
      turn,
      null,
      revised.status === "ok" ? revised.revisedDraftId : null
    );
    if (revised.status === "budget_stopped") {
      return { status: "budget_stopped", turn: publicTurn };
    }
    if (revised.status === "invalid") {
      return {
        status: "invalid",
        message: "Revision did not complete."
      };
    }
    return { status: "ok", turn: publicTurn };
  }

  if (intent === "config") {
    const steered = await steerPipelineConfig(db, gatewayDeps, {
      turn,
      content,
      key: input.key,
      revertToVersion: input.revertToVersion,
      now
    });
    if (steered.status === "budget_stopped") {
      return {
        status: "budget_stopped",
        turn: toPublicSteeringTurn(turn, null, null, null)
      };
    }
    if (steered.status === "invalid") {
      return {
        status: "invalid",
        message: "Config did not apply."
      };
    }
    if (steered.status === "refused") {
      return {
        status: "ok",
        turn: toPublicSteeringTurn(turn, steered.reply, null, null)
      };
    }
    return {
      status: "ok",
      turn: toPublicSteeringTurn(turn, steered.reply, null, steered.version)
    };
  }

  const reply = await askSteward(db, gatewayDeps, {
    turn,
    loadedDraft,
    content,
    now
  });
  return { status: "ok", turn: toPublicSteeringTurn(turn, reply, null) };
}
