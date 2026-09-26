// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunLog } from "./RunLog";
import { EvidenceDetail } from "./EvidenceDetail";
import { LoopControls } from "../admin/LoopControls";
import { DEFAULT_APPROVAL_MODE } from "../../shared/schemas/mode";

const id = "run-20260926-c034";
const row = {
  id,
  origin: "manual",
  mode: "hitl",
  status: "awaiting",
  startedAt: "2026-09-26T15:00:00.000Z",
  completedAt: null,
  spendCents: 3,
  spendCurrency: "USD",
  budgetCents: 500,
  scheduledFor: null,
  eventCount: 0,
  approvalOutcome: null,
  reportedCostCents: 3,
  unmeasuredCallCount: 0
};
const policy = {
  version: "bounded-text-v1",
  verifiedAt: "2026-09-26T14:01:49.000Z",
  validUntil: "2026-10-03T14:01:49.000Z",
  sources: ["https://openrouter.ai/anthropic/claude-sonnet-4"]
};
const calls = [
  {
    id: "fractional",
    runId: id,
    role: "drafter",
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4",
    tokens: { input: 1, output: 1 },
    costCents: 1,
    costBasis: "provider_reported",
    reportedCostCents: 1,
    reportedCostUsd: "0.001",
    admissionBoundCents: 124,
    estimatedCostCents: 1,
    accountingIssue: null,
    policy
  },
  {
    id: "rounded-only",
    runId: id,
    role: "reviewer",
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4",
    tokens: { input: 1, output: 1 },
    costCents: 2,
    costBasis: "provider_reported",
    reportedCostCents: 2,
    admissionBoundCents: 124,
    estimatedCostCents: 1,
    accountingIssue: null,
    policy
  }
];
function stub(latest: unknown, llmCalls = calls) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => ({
      ok: true,
      json: async () =>
        String(input).includes("/api/mode")
          ? DEFAULT_APPROVAL_MODE
          : String(input).includes("/api/admin/loop")
            ? { latest }
            : String(input).includes(`/api/runs/${id}`)
              ? { ...(latest as object), drafts: [], evidence: [], llmCalls }
              : { items: [latest] }
    }))
  );
}
function mount(surface: string) {
  render(
    surface === "log" ? (
      <RunLog />
    ) : surface === "controls" ? (
      <LoopControls />
    ) : (
      <EvidenceDetail runId={id} />
    )
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe.each(["log", "controls", "evidence"])(
  "fetched accounting: %s",
  (surface) => {
    it("labels known aggregates as sums of rounded-up charges", async () => {
      stub(row);
      mount(surface);
      await act(async () => {});
      const text = document.body.textContent!;
      expect(text.toLowerCase()).toContain(
        "sum of rounded-up reported charges"
      );
      expect(text).toContain(surface === "controls" ? "3 cents" : "$0.03");
      if (surface === "evidence") {
        expect(text).toContain("Provider-reported charge: $0.001 USD");
        expect(text).toContain("Provider-reported charge: $0.02 (rounded up)");
        expect(text).toContain("Cost policy: bounded-text-v1");
        expect(text).toContain(`Prices verified: ${policy.verifiedAt}`);
        expect(text).toContain(`Policy expires: ${policy.validUntil}`);
        expect(
          document.querySelector(`a[href="${policy.sources[0]}"]`)
        ).not.toBeNull();
      }
    });
    it("shows unknown totals with the number of calls without charges", async () => {
      stub({ ...row, reportedCostCents: null, unmeasuredCallCount: 1 }, [
        calls[0]!,
        {
          ...calls[1]!,
          reportedCostCents: null,
          reportedCostUsd: undefined,
          costBasis: "conservative_bound",
          accountingIssue: "missing_or_invalid_reported_cost"
        }
      ] as typeof calls);
      mount(surface);
      await act(async () => {});
      const text = document.body.textContent!;
      expect(text).toContain("unknown");
      expect(text).toContain("1 calls without reported charges");
      if (surface === "evidence")
        expect(text).toContain("Reported charge is missing or invalid");
    });
  }
);
describe.each(["log", "controls"])(
  "malformed fetched accounting: %s",
  (surface) => {
    it.each([
      { reportedCostCents: -1 },
      { reportedCostCents: 0.5 },
      { reportedCostCents: "3" },
      { unmeasuredCallCount: -1 },
      { unmeasuredCallCount: 0.5 },
      { unmeasuredCallCount: "1" },
      { unmeasuredCallCount: null }
    ])("refuses malformed monetary fields %j", async (invalid) => {
      stub({ ...row, ...invalid });
      mount(surface);
      await act(async () => {});
      expect(document.body.textContent).not.toContain(id);
      expect(document.body.textContent?.toLowerCase()).not.toContain(
        "sum of rounded-up reported charges"
      );
    });
  }
);
