import { DailyRunWorkflow } from "../pipeline/workflow/dailyRun";
import type { Db } from "../shared/db/client";
import {
  SourceUnavailableError,
  type SourceCheck
} from "../pipeline/connectors/connector";
import { fixtureCostPolicy } from "./costPolicyFixture";

export const fixture = {
  sourceCalls: 0,
  gatewayConstructions: 0,
  now: "2030-01-01T00:00:00.000Z",
  providerCalls: 0,
  sourceBarrier: undefined as (() => Promise<void>) | undefined,
  providerBarrier: undefined as ((model: string) => Promise<void>) | undefined
};
export const entity = {
  type: "states",
  id: "st-nv",
  body: "Nevada restricted.",
  diff: { operationalStatus: { from: "banned", to: "restricted" } }
};
export class NativeDailyRun extends DailyRunWorkflow {
  protected override sourceChecks(): Record<string, SourceCheck> {
    const check: SourceCheck = async (source) => {
      fixture.sourceCalls++;
      await fixture.sourceBarrier?.();
      if (source.name === "failed")
        throw new SourceUnavailableError("unavailable", {
          token: "secret-fixture"
        });
      return [
        {
          entities: source.name === "empty" ? [] : [entity],
          fetched: { fixture: true }
        }
      ];
    };
    return { material: check, empty: check, failed: check };
  }
  protected override gatewayDeps(db: Db) {
    fixture.gatewayConstructions++;
    return {
      db,
      now: () => fixture.now,
      costPolicy: fixtureCostPolicy,
      provider: {
        name: "native-fixture",
        complete: async ({ model }: { model: string }) => {
          fixture.providerCalls++;
          await fixture.providerBarrier?.(model);
          return {
            text: JSON.stringify(
              model === "drafter"
                ? { body: entity.body, diff: entity.diff }
                : {
                    confidence: 99,
                    citationCompleteness: 100,
                    notes: "Primary source supports the change.",
                    disagrees: false,
                    disagreement: ""
                  }
            ),
            inputTokens: 1,
            outputTokens: 1,
            reportedCostUsd: 0.01
          };
        }
      }
    };
  }
}
export default { fetch: () => new Response("Native Workflow fixture") };
