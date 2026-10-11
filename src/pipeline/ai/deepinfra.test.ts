import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  complete,
  createDeepInfraProvider,
  DEEPINFRA_CATALOG_USER_AGENT,
  llmProvidersFromEnv
} from "./gateway";
import { resolveCostPolicy } from "./costPolicy";
import { insertRun } from "../../shared/db/repos/runsRepo";
import { accountingForRun } from "../../shared/db/repos/llmAccountingRepo";
import {
  DEEPINFRA_CHAT_TIMEOUT_MS,
  PROVIDER_TIMEOUT_MS
} from "../../shared/lib/timeouts";

const db = (env as Env).DB;
const NOW = "2026-10-04T19:12:00.000Z";
const MODEL = "zai-org/GLM-5.3-Flash";
const WORKERS_REDIRECT_ERROR =
  'Invalid redirect value, must be one of "follow" or "manual" ("error" won\'t be implemented since it does not make sense at the edge; use "manual" and check the response status code)';
const policy = resolveCostPolicy("deepinfra", MODEL, NOW);
const configured = {
  ...env,
  DEEPINFRA_API_KEY: "PRIVATE-provider-key",
  AI_GATEWAY_TOKEN: "PRIVATE-gateway-key",
  AI_GATEWAY_ID: "default",
  CLOUDFLARE_ACCOUNT_ID: "account"
} as Env;
const catalog = () => [
  {
    model_name: MODEL,
    type: "text-generation",
    reported_type: "text-generation",
    max_tokens: 1048576,
    deprecated: null,
    replaced_by: null,
    private: 0,
    tags: ["openai", "reasoning", "json", "multimodal"],
    pricing: {
      type: "tokens",
      cents_per_input_token: 0.000015,
      cents_per_output_token: 5e-5,
      rate_per_input_token_cached: 0.2,
      discount: 0.5,
      discount_ends_at: null,
      short: null,
      full: null,
      table: null,
      rate_per_input_token_cache_write: null,
      rate_per_service_tier_priority: null,
      rate_per_service_tier_flex: null,
      rate_per_explicit_cache_write_token: null,
      explicit_cache_granularity_tokens: null
    }
  }
];
const responseBody = () => ({
  choices: [
    {
      message: { content: "PRIVATE completion", reasoning: "PRIVATE reasoning" }
    }
  ],
  usage: {
    prompt_tokens: 1000,
    completion_tokens: 100,
    estimated_cost: 12345,
    cost: 12345
  }
});
let seq = 0;
async function setup(model = MODEL) {
  const runId = `run-20261004-${(++seq).toString(16).padStart(4, "0")}`;
  await insertRun(db, {
    id: runId,
    origin: "scheduled",
    mode: "hitl",
    status: "running",
    startedAt: NOW,
    completedAt: null,
    spendCents: 0,
    spendCurrency: "USD",
    budgetCents: 100,
    scheduledFor: "2026-10-04"
  });
  await db
    .prepare(
      `INSERT INTO gateway_config (id,version,roles_json,default_budget_cents,updated_at) VALUES ('current',1,?,100,?) ON CONFLICT(id) DO UPDATE SET roles_json=excluded.roles_json,default_budget_cents=100`
    )
    .bind(JSON.stringify({ drafter: { provider: "deepinfra", model } }), NOW)
    .run();
  return {
    operationKey: "draft:1:drafter",
    role: "drafter" as const,
    runId,
    prompt: "PRIVATE prompt"
  };
}
const deps = () => ({
  db,
  providers: llmProvidersFromEnv(configured),
  now: () => NOW
});
function http(body: unknown = responseBody(), metadata: unknown = catalog()) {
  const inference = vi.fn(async (_url: unknown, _init?: RequestInit) =>
    Response.json(body)
  );
  const fetcher = vi.fn(async (url: unknown, init?: RequestInit) => {
    if (init?.redirect === "error") {
      throw new TypeError(WORKERS_REDIRECT_ERROR);
    }
    if (url === "https://api.deepinfra.com/models/list") {
      const headers = new Headers(init?.headers);
      expect([...headers.keys()].sort()).toEqual(["accept", "user-agent"]);
      expect(headers.get("accept")).toBe("application/json");
      expect(headers.get("user-agent")).toBe(DEEPINFRA_CATALOG_USER_AGENT);
      expect(headers.get("authorization")).toBeNull();
      expect(init?.redirect).toBe("manual");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Response.json(metadata);
    }
    return inference(url, init);
  });
  vi.stubGlobal("fetch", fetcher);
  return { fetcher, inference };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("DeepInfra central gateway", () => {
  it("resolves Secrets Store within each request and never falls back on lookup failure", async () => {
    const input = await setup();
    const get = vi.fn(async () => "PRIVATE-store-key");
    const providers = llmProvidersFromEnv({
      ...configured,
      DEEPINFRA_API_KEY: { get }
    });
    expect(get).not.toHaveBeenCalled();
    const { inference } = http();
    await complete({ ...deps(), providers }, input);
    expect(get).toHaveBeenCalledTimes(1);
    expect(
      Object.fromEntries(new Headers(inference.mock.calls[0]![1]!.headers))
    ).toMatchObject({
      authorization: "Bearer PRIVATE-store-key"
    });
    get.mockRejectedValueOnce(new Error("PRIVATE Store failure"));
    const second = await setup();
    await expect(
      complete({ ...deps(), providers }, second)
    ).rejects.toMatchObject({
      code: "gateway_not_configured",
      message: "Provider credentials unavailable."
    });
    expect(get).toHaveBeenCalledTimes(2);
    expect(inference).toHaveBeenCalledTimes(1);
    expect(await accountingForRun(db, second.runId)).toMatchObject({
      totalCents: 0,
      issueCount: 0
    });
    expect(
      await db
        .prepare(
          "SELECT state,liability_cents FROM llm_operations WHERE run_id=?"
        )
        .bind(second.runId)
        .first()
    ).toBeNull();
    get.mockResolvedValueOnce("  ");
    const third = await setup();
    await expect(
      complete({ ...deps(), providers }, third)
    ).rejects.toMatchObject({ code: "gateway_not_configured" });
    expect(inference).toHaveBeenCalledTimes(1);
  });
  it("aborts a hung inference at the central deadline and keeps its liability", async () => {
    const input = await setup();
    const { inference } = http();
    let entered!: () => void;
    const reached = new Promise<void>((r) => (entered = r));
    let requestSignal: AbortSignal | undefined;
    inference.mockImplementation(async (_url, init) => {
      requestSignal = init?.signal ?? undefined;
      entered();
      return new Promise<Response>((_resolve, reject) =>
        requestSignal!.addEventListener(
          "abort",
          () => reject(new Error("PRIVATE abort")),
          { once: true }
        )
      );
    });
    vi.useFakeTimers();
    const pending = complete(deps(), input);
    const check = expect(pending).rejects.toMatchObject({
      code: "provider_error"
    });
    await reached;
    expect(PROVIDER_TIMEOUT_MS).toBe(60_000);
    expect(DEEPINFRA_CHAT_TIMEOUT_MS).toBe(120_000);
    await vi.advanceTimersByTimeAsync(PROVIDER_TIMEOUT_MS);
    let settled = false;
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(requestSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(
      DEEPINFRA_CHAT_TIMEOUT_MS - PROVIDER_TIMEOUT_MS + 1
    );
    await check;
    expect(requestSignal?.aborted).toBe(true);
    expect(await accountingForRun(db, input.runId)).toMatchObject({
      totalCents: 16,
      uncertainCents: 16,
      issueCount: 1
    });
    expect(
      await db
        .prepare("SELECT state, issue FROM llm_operations WHERE run_id=?")
        .bind(input.runId)
        .first()
    ).toEqual({ state: "uncertain", issue: "provider_outcome_unknown" });
    expect(inference).toHaveBeenCalledTimes(1);
  });

  it.each(["DEEPINFRA_API_KEY", "AI_GATEWAY_ID", "CLOUDFLARE_ACCOUNT_ID"])(
    "fails closed on missing %s without changing other registrations",
    async (key) => {
      const input = await setup();
      const e = {
        ...configured,
        OPENROUTER_API_KEY: "existing",
        [key]: " "
      } as Env;
      expect(createDeepInfraProvider(e)).toBeNull();
      const { inference } = http();
      await expect(
        complete({ ...deps(), providers: llmProvidersFromEnv(e) }, input)
      ).rejects.toMatchObject({ code: "gateway_not_configured" });
      expect(inference).not.toHaveBeenCalled();
    }
  );
  it("preserves Workers AI/OpenRouter, and needs no optional gateway token", () => {
    expect(
      llmProvidersFromEnv({
        ...configured,
        AI: {} as Ai,
        OPENROUTER_API_KEY: "existing",
        AI_GATEWAY_TOKEN: undefined
      }).map((p) => p.name)
    ).toEqual(["workersai", "openrouter", "deepinfra"]);
  });
  it.each(["PRIVATE-gateway-key", undefined])(
    "sends the exact bounded request and publishes token-estimated evidence with gateway token %s",
    async (token) => {
      const input = await setup();
      const localEnv = { ...configured, AI_GATEWAY_TOKEN: token };
      const localDeps = { ...deps(), providers: llmProvidersFromEnv(localEnv) };
      const { inference } = http();
      const result = await complete(localDeps, input);
      expect(result).toMatchObject({
        provider: "deepinfra",
        model: MODEL,
        costCents: 1,
        text: "PRIVATE completion"
      });
      expect(inference).toHaveBeenCalledTimes(1);
      const [url, init] = inference.mock.calls[0]!;
      expect(url).toBe(
        "https://gateway.ai.cloudflare.com/v1/account/default/custom-deepinfra/v1/openai/chat/completions"
      );
      expect(init).toMatchObject({
        method: "POST",
        redirect: "manual"
      });
      expect(init!.headers).toBeInstanceOf(Headers);
      const headers = new Headers(init!.headers);
      expect(Object.fromEntries(headers)).toMatchObject({
        authorization: "Bearer PRIVATE-provider-key",
        "cf-aig-max-attempts": "1",
        "cf-aig-skip-cache": "true"
      });
      expect(headers.get("cf-aig-authorization")).toBe(
        token ? `Bearer ${token}` : null
      );
      expect(headers.get("user-agent")).toBeNull();
      expect(JSON.parse(init!.body as string)).toEqual({
        model: MODEL,
        messages: [{ role: "user", content: "PRIVATE prompt" }],
        max_tokens: 2048,
        reasoning_effort: "none",
        reasoning: { enabled: false },
        stream: false,
        n: 1
      });
      const worker = (await import("../../server")).default;
      const publicResponse = await worker.fetch(
        new Request(`https://pml.example.com/api/runs/${input.runId}`),
        localEnv
      );
      expect(publicResponse.status).toBe(200);
      const detail = (await publicResponse.json()) as {
        llmCalls: unknown[];
        spendCents: number;
      };
      expect(detail.spendCents).toBe(1);
      expect(detail.llmCalls).toEqual([
        expect.objectContaining({
          provider: "deepinfra",
          model: MODEL,
          costBasis: "token_estimate",
          admissionBoundCents: 16,
          estimatedCostCents: 1,
          reportedCostCents: null,
          reportedCostUsd: null,
          reportedCostSource: null
        })
      ]);
      expect(JSON.stringify(detail)).not.toContain("PRIVATE");
      expect(await complete(localDeps, input)).toEqual(result);
      expect(inference).toHaveBeenCalledTimes(1);
    }
  );
  it.each<[string, unknown]>([
    ["missing model", []],
    ["duplicate model", [...catalog(), ...catalog()]],
    ...[
      { deprecated: true },
      { replaced_by: "replacement" },
      { max_tokens: 1048575 },
      { private: 1 },
      { tags: [] },
      { reported_type: "image-generation" }
    ].map(
      (change) =>
        [JSON.stringify(change), [{ ...catalog()[0], ...change }]] as [
          string,
          unknown
        ]
    ),
    ...[
      { cents_per_input_token: 0.000016 },
      { cents_per_output_token: 0.000051 },
      { cents_per_input_token: -1 },
      { cents_per_input_token: "NaN" },
      { cents_per_input_token: null },
      { cents_per_output_token: {} },
      { type: "unknown" },
      { rate_per_input_token_cached: 1.1 },
      { rate_per_input_token_cache_write: 0.2 },
      { rate_per_service_tier_priority: 1.2 },
      { table: [] },
      { new_billable_dimension: 0.1 }
    ].map(
      (change) =>
        [
          JSON.stringify(change),
          [
            {
              ...catalog()[0],
              pricing: { ...catalog()[0]!.pricing, ...change }
            }
          ]
        ] as [string, unknown]
    )
  ])(
    "rejects catalog %s before reservation or inference",
    async (_label, metadata) => {
      const input = await setup();
      const { inference } = http(responseBody(), metadata);
      await expect(complete(deps(), input)).rejects.toMatchObject({
        code: "cost_policy_invalid"
      });
      expect(inference).not.toHaveBeenCalled();
      expect(await accountingForRun(db, input.runId)).toMatchObject({
        totalCents: 0
      });
      expect(
        await db
          .prepare("SELECT id FROM llm_operations WHERE run_id=?")
          .bind(input.runId)
          .first()
      ).toBeNull();
    }
  );
  it.each(["expired", "unsupported"])(
    "rejects %s policy before HTTP",
    async (kind) => {
      const input = await setup(kind === "unsupported" ? "wrong-model" : MODEL);
      const { fetcher } = http();
      await expect(
        complete(
          {
            ...deps(),
            now: () => (kind === "expired" ? policy.validUntil : NOW)
          },
          input
        )
      ).rejects.toMatchObject({ code: "cost_policy_invalid" });
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
  it("names an HTTP 403 catalog refusal without secrets", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const body = `line1\nBearer SECRET-KEY\n${"x".repeat(200)}\n\n  more   spaces`;
    const bodyPrefix = "line1 bearer [redacted] " + "x".repeat(156);
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(body, { status: 403 }))
      );
      await expect(
        createDeepInfraProvider(configured)!.preflight!({
          model: MODEL,
          policy,
          now: () => NOW
        })
      ).rejects.toMatchObject({
        code: "cost_policy_invalid",
        message: "cost_policy_invalid: deepinfra_preflight (http 403)",
        detail: expect.objectContaining({
          stage: "deepinfra_preflight",
          status: 403,
          errorName: "Error",
          errorMessage: "HTTP 403",
          bodyPrefix
        })
      });
      expect(bodyPrefix).toHaveLength(180);
      expect(bodyPrefix).not.toContain("\n");
      expect(bodyPrefix).not.toContain("SECRET-KEY");
      const logged = JSON.stringify(warn.mock.calls);
      expect(logged).not.toContain("SECRET-KEY");
      expect(logged).toContain("cost_policy_invalid");
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "cost_policy_invalid",
          stage: "deepinfra_preflight",
          status: 403,
          errorName: "Error",
          errorMessage: "HTTP 403",
          bodyPrefix
        })
      );
    } finally {
      warn.mockRestore();
    }
  });
  it.each([
    ["302", 302, () => new Response("moved", { status: 302 })],
    [
      "opaque redirect",
      0,
      (): Response =>
        ({
          ok: true,
          status: 0,
          type: "opaqueredirect",
          json: async () => catalog(),
          text: async (): Promise<string> => ""
        }) as Response
    ]
  ] as const)(
    "rejects a catalog %s before reservation",
    async (_label, status, respond) => {
      const input = await setup();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const inference = vi.fn();
      try {
        vi.stubGlobal(
          "fetch",
          vi.fn(async (url: unknown, init?: RequestInit) => {
            expect(init?.redirect).toBe("manual");
            const headers = new Headers(init?.headers);
            expect(headers.get("accept")).toBe("application/json");
            expect(headers.get("user-agent")).toBe(
              DEEPINFRA_CATALOG_USER_AGENT
            );
            expect(headers.get("authorization")).toBeNull();
            expect(init?.signal).toBeInstanceOf(AbortSignal);
            if (url === "https://api.deepinfra.com/models/list")
              return respond();
            return inference(url, init);
          })
        );
        await expect(complete(deps(), input)).rejects.toMatchObject({
          code: "cost_policy_invalid",
          message: `cost_policy_invalid: deepinfra_preflight (http ${status})`,
          detail: expect.objectContaining({
            stage: "deepinfra_preflight",
            status,
            ...(status === 302 ? { bodyPrefix: "moved" } : {})
          })
        });
        expect(inference).not.toHaveBeenCalled();
        const policyLog = warn.mock.calls
          .map((call) => call[0])
          .find(
            (entry) =>
              typeof entry === "object" &&
              entry != null &&
              (entry as { event?: unknown }).event === "cost_policy_invalid"
          );
        expect(policyLog).toMatchObject({
          event: "cost_policy_invalid",
          stage: "deepinfra_preflight",
          status,
          ...(status === 302 ? { bodyPrefix: "moved" } : {})
        });
        expect(policyLog).not.toHaveProperty("field");
        if (status === 0) expect(policyLog).not.toHaveProperty("bodyPrefix");
        await expectFree(input.runId);
      } finally {
        warn.mockRestore();
      }
    }
  );
  it("records a Workers redirect TypeError from the catalog with no status", async () => {
    const input = await setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new TypeError(WORKERS_REDIRECT_ERROR);
        })
      );
      await expect(complete(deps(), input)).rejects.toMatchObject({
        code: "cost_policy_invalid",
        message: "cost_policy_invalid: deepinfra_preflight",
        detail: expect.objectContaining({
          stage: "deepinfra_preflight",
          errorName: "TypeError",
          errorMessage: WORKERS_REDIRECT_ERROR
        })
      });
      const policyLog = warn.mock.calls
        .map((call) => call[0])
        .find(
          (entry) =>
            typeof entry === "object" &&
            entry != null &&
            (entry as { event?: unknown }).event === "cost_policy_invalid"
        );
      expect(policyLog).toMatchObject({
        event: "cost_policy_invalid",
        stage: "deepinfra_preflight",
        errorName: "TypeError",
        errorMessage: WORKERS_REDIRECT_ERROR
      });
      expect(policyLog).not.toHaveProperty("status");
      await expectFree(input.runId);
    } finally {
      warn.mockRestore();
    }
  });
  it("keeps the catalog HTTP status when the error body cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        text: async () => {
          throw new Error("unreadable");
        }
      }))
    );
    await expect(
      createDeepInfraProvider(configured)!.preflight!({
        model: MODEL,
        policy,
        now: () => NOW
      })
    ).rejects.toMatchObject({
      code: "cost_policy_invalid",
      message: "cost_policy_invalid: deepinfra_preflight (http 403)",
      detail: expect.objectContaining({
        stage: "deepinfra_preflight",
        status: 403
      })
    });
  });
  it("names the catalog field that failed", async () => {
    const input = await setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      http(responseBody(), [{ ...catalog()[0], deprecated: true }]);
      await expect(complete(deps(), input)).rejects.toMatchObject({
        code: "cost_policy_invalid",
        message: "cost_policy_invalid: deepinfra_preflight",
        detail: expect.objectContaining({
          stage: "deepinfra_preflight",
          field: "deprecated"
        })
      });
      expect(JSON.stringify(warn.mock.calls)).not.toContain("PRIVATE");
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "cost_policy_invalid",
          stage: "deepinfra_preflight",
          field: "deprecated"
        })
      );
    } finally {
      warn.mockRestore();
    }
  });
  it("records a thrown catalog fetch without secrets", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new TypeError("Bearer SECRET-KEY network down");
        })
      );
      await expect(
        createDeepInfraProvider(configured)!.preflight!({
          model: MODEL,
          policy,
          now: () => NOW
        })
      ).rejects.toMatchObject({
        code: "cost_policy_invalid",
        message: "cost_policy_invalid: deepinfra_preflight",
        detail: expect.objectContaining({
          stage: "deepinfra_preflight",
          errorName: "TypeError",
          errorMessage: expect.stringContaining("bearer [redacted]")
        })
      });
      expect(JSON.stringify(warn.mock.calls)).not.toContain("SECRET-KEY");
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "cost_policy_invalid",
          stage: "deepinfra_preflight",
          errorName: "TypeError",
          errorMessage: expect.stringContaining("bearer [redacted]")
        })
      );
    } finally {
      warn.mockRestore();
    }
  });
  it("does not relabel revalidation as a catalog failure", async () => {
    http();
    await expect(
      createDeepInfraProvider(configured)!.preflight!({
        model: MODEL,
        policy,
        now: () => policy.validUntil
      })
    ).rejects.toMatchObject({
      code: "cost_policy_invalid",
      message: "cost_policy_invalid: revalidate_before_inference"
    });
  });
  it("bounds the entire metadata body deadline", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: () => new Promise(() => {})
    }));
    vi.stubGlobal("fetch", fetcher);
    const pending = createDeepInfraProvider(configured)!.preflight!({
      model: MODEL,
      policy,
      now: () => NOW
    });
    const check = expect(pending).rejects.toMatchObject({
      code: "cost_policy_invalid"
    });
    await vi.advanceTimersByTimeAsync(PROVIDER_TIMEOUT_MS + 1);
    await check;
    expect(PROVIDER_TIMEOUT_MS).toBe(60_000);
    expect(DEEPINFRA_CHAT_TIMEOUT_MS).toBe(120_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["missing usage", {}],
    ["fractional", { prompt_tokens: 1.5, completion_tokens: 1 }],
    ["negative", { prompt_tokens: -1, completion_tokens: 1 }],
    ["wrong type", { prompt_tokens: "1", completion_tokens: 1 }],
    ["output over limit", { prompt_tokens: 1, completion_tokens: 2049 }],
    ["input over limit", { prompt_tokens: 1048577, completion_tokens: 1 }]
  ])("retains conservative liability for %s", async (_label, usage) => {
    const input = await setup();
    const { inference } = http({ ...responseBody(), usage });
    await expect(complete(deps(), input)).rejects.toMatchObject({
      code: "accounting_uncertain"
    });
    expect(await accountingForRun(db, input.runId)).toMatchObject({
      totalCents: 16,
      issueCount: 1
    });
    await expect(complete(deps(), input)).rejects.toMatchObject({
      code: "accounting_uncertain"
    });
    expect(inference).toHaveBeenCalledTimes(1);
  });
  it("never uses reasoning as content", async () => {
    const input = await setup();
    http({
      ...responseBody(),
      choices: [{ message: { content: null, reasoning: "PRIVATE reasoning" } }]
    });
    await expect(complete(deps(), input)).rejects.toMatchObject({
      code: "accounting_uncertain"
    });
    expect(await accountingForRun(db, input.runId)).toMatchObject({
      totalCents: 16,
      issueCount: 1
    });
  });
  it.each(["failure", "aborted"])(
    "retains liability on %s without exposing error text",
    async (kind) => {
      const input = await setup();
      const { inference } = http();
      inference.mockImplementation(async () => {
        throw new Error(`PRIVATE key ${kind}`);
      });
      await expect(complete(deps(), input)).rejects.toMatchObject({
        code: "provider_error",
        message: "DeepInfra gateway request failed."
      });
      expect(await accountingForRun(db, input.runId)).toMatchObject({
        totalCents: 16,
        issueCount: 1
      });
      await expect(complete(deps(), input)).rejects.toMatchObject({
        code: "accounting_uncertain"
      });
      expect(inference).toHaveBeenCalledTimes(1);
    }
  );
  it("atomically enforces a 100-cent campaign across Runs near exhaustion, including replay", async () => {
    const campaignNow = "2026-10-05T00:00:00.000Z";
    const campaignDeps = () => ({ ...deps(), now: () => campaignNow });
    const firstInput = await setup();
    const secondInput = await setup();
    const prior = await setup();
    await db
      .prepare("INSERT INTO llm_periods VALUES (?,?,?,?,?)")
      .bind(
        "deepinfra-campaign",
        campaignNow,
        policy.validUntil,
        100,
        "Acceptance USD 1"
      )
      .run();
    await db
      .prepare(
        "INSERT INTO llm_calls (id,run_id,role,provider,model,cost_cents,currency,created_at) VALUES (?,?, 'drafter','deepinfra',?,84,'USD',?)"
      )
      .bind("prior-deepinfra", prior.runId, MODEL, campaignNow)
      .run();
    const { inference } = http();
    let release!: () => void;
    let entered!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const reached = new Promise<void>((r) => (entered = r));
    inference.mockImplementation(async () => {
      entered();
      await held;
      return Response.json(responseBody());
    });
    const first = complete(campaignDeps(), firstInput);
    await reached;
    expect(
      await db
        .prepare(
          "SELECT total_cents FROM llm_period_accounting WHERE period_id='deepinfra-campaign'"
        )
        .first()
    ).toEqual({ total_cents: 100 });
    await expect(complete(campaignDeps(), firstInput)).rejects.toMatchObject({
      code: "operation_pending"
    });
    await expect(complete(campaignDeps(), secondInput)).rejects.toMatchObject({
      code: "budget_stopped"
    });
    release();
    const result = await first;
    expect(await complete(campaignDeps(), firstInput)).toEqual(result);
    expect(inference).toHaveBeenCalledTimes(1);
    expect(
      await db
        .prepare(
          "SELECT total_cents FROM llm_period_accounting WHERE period_id='deepinfra-campaign'"
        )
        .first()
    ).toEqual({ total_cents: 85 });
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
async function expectFree(runId: string) {
  expect(await accountingForRun(db, runId)).toMatchObject({
    totalCents: 0,
    issueCount: 0
  });
  expect(
    await db
      .prepare("SELECT id FROM llm_operations WHERE run_id=?")
      .bind(runId)
      .first()
  ).toBeNull();
}

describe("DeepInfra request-scoped preparation and identity", () => {
  it.each(["DEEPINFRA_API_KEY", "AI_GATEWAY_TOKEN"] as const)(
    "times out hanging %s with no liability or late dispatch",
    async (field) => {
      const input = await setup();
      const entered = deferred<void>();
      const secret = deferred<string>();
      const get = vi.fn(() => {
        entered.resolve();
        return secret.promise;
      });
      const providers = llmProvidersFromEnv({
        ...configured,
        [field]: { get }
      });
      const { inference } = http();
      vi.useFakeTimers();
      const pending = complete({ ...deps(), providers }, input);
      const check = expect(pending).rejects.toMatchObject({
        code: "gateway_not_configured",
        message: "Provider credentials unavailable."
      });
      await entered.promise;
      await vi.advanceTimersByTimeAsync(PROVIDER_TIMEOUT_MS + 1);
      await check;
      await expectFree(input.runId);
      secret.resolve("PRIVATE late secret");
      await Promise.resolve();
      await Promise.resolve();
      expect(inference).not.toHaveBeenCalled();
      expect(get).toHaveBeenCalledTimes(1);
      await expectFree(input.runId);
    }
  );
  it.each(["DEEPINFRA_API_KEY", "AI_GATEWAY_TOKEN"] as const)(
    "sanitizes throwing and blank %s lookups before reservation",
    async (field) => {
      const { inference } = http();
      for (const result of ["throw", "blank"]) {
        const input = await setup();
        const get = vi.fn(async () => {
          if (result === "throw") throw new Error("PRIVATE error");
          return "  ";
        });
        await expect(
          complete(
            {
              ...deps(),
              providers: llmProvidersFromEnv({
                ...configured,
                [field]: { get }
              })
            },
            input
          )
        ).rejects.toMatchObject({
          code: "gateway_not_configured",
          message: "Provider credentials unavailable."
        });
        expect(get).toHaveBeenCalledTimes(1);
        await expectFree(input.runId);
      }
      expect(inference).not.toHaveBeenCalled();
    }
  );
  it("revalidates policy after delayed Store lookup and incurs no liability at expiry", async () => {
    const input = await setup();
    const entered = deferred<void>();
    const secret = deferred<string>();
    let time = NOW;
    const providers = llmProvidersFromEnv({
      ...configured,
      DEEPINFRA_API_KEY: {
        get: () => {
          entered.resolve();
          return secret.promise;
        }
      }
    });
    const { inference } = http();
    const pending = complete({ ...deps(), providers, now: () => time }, input);
    const check = expect(pending).rejects.toMatchObject({
      code: "cost_policy_invalid"
    });
    await entered.promise;
    time = policy.validUntil;
    secret.resolve("PRIVATE key");
    await check;
    expect(inference).not.toHaveBeenCalled();
    await expectFree(input.runId);
  });
  it("isolates both prepared Store credentials across concurrent invocations", async () => {
    const first = await setup();
    const second = await setup();
    const firstKey = deferred<string>();
    const firstToken = deferred<string>();
    const entered = deferred<void>();
    const keyGet = vi
      .fn()
      .mockImplementationOnce(() => {
        entered.resolve();
        return firstKey.promise;
      })
      .mockResolvedValueOnce("PRIVATE key two");
    const tokenGet = vi
      .fn()
      .mockImplementationOnce(() => firstToken.promise)
      .mockResolvedValueOnce("PRIVATE token two");
    const providers = llmProvidersFromEnv({
      ...configured,
      DEEPINFRA_API_KEY: { get: keyGet },
      AI_GATEWAY_TOKEN: { get: tokenGet }
    });
    const { inference } = http();
    const a = complete({ ...deps(), providers }, first);
    await entered.promise;
    await complete({ ...deps(), providers }, second);
    firstKey.resolve("PRIVATE key one");
    firstToken.resolve("PRIVATE token one");
    await a;
    expect(
      inference.mock.calls.map((call) =>
        Object.fromEntries(new Headers(call[1]!.headers))
      )
    ).toEqual([
      expect.objectContaining({
        authorization: "Bearer PRIVATE key two",
        "cf-aig-authorization": "Bearer PRIVATE token two"
      }),
      expect.objectContaining({
        authorization: "Bearer PRIVATE key one",
        "cf-aig-authorization": "Bearer PRIVATE token one"
      })
    ]);
    expect(keyGet).toHaveBeenCalledTimes(2);
    expect(tokenGet).toHaveBeenCalledTimes(2);
  });
  it.each([MODEL, "different-model", null])(
    "checks supplied model %s and preserves receipt correlation",
    async (model) => {
      const input = await setup();
      const { inference } = http({
        ...responseBody(),
        model,
        id: "chatcmpl-safe_123"
      });
      if (model === MODEL) await complete(deps(), input);
      else {
        await expect(complete(deps(), input)).rejects.toMatchObject({
          code: "accounting_uncertain"
        });
        await expect(complete(deps(), input)).rejects.toMatchObject({
          code: "accounting_uncertain"
        });
      }
      const receipt = await db
        .prepare(
          "SELECT provider_request_id, issue, result_json FROM llm_operations WHERE run_id=?"
        )
        .bind(input.runId)
        .first();
      expect(receipt).toMatchObject({
        provider_request_id: "chatcmpl-safe_123",
        issue: model === MODEL ? null : "returned_model_mismatch"
      });
      if (model !== MODEL) {
        expect(receipt!.result_json).toBeNull();
        expect(await accountingForRun(db, input.runId)).toMatchObject({
          totalCents: 16,
          issueCount: 1
        });
      }
      expect(inference).toHaveBeenCalledTimes(1);
    }
  );
  it.each(["unsafe\nheader", "x".repeat(201), { raw: "PRIVATE" }])(
    "omits unsafe correlation IDs",
    async (id) => {
      const input = await setup();
      http({ ...responseBody(), id });
      await complete(deps(), input);
      expect(
        await db
          .prepare(
            "SELECT provider_request_id FROM llm_operations WHERE run_id=?"
          )
          .bind(input.runId)
          .first()
      ).toEqual({ provider_request_id: null });
    }
  );
});

describe("DeepInfra pre-dispatch validation and HTTP failures", () => {
  it.each(["DEEPINFRA_API_KEY", "AI_GATEWAY_TOKEN"] as const)(
    "rejects invalid %s header values before paid ownership",
    async (field) => {
      const { inference } = http();
      for (const secret of [
        "PRIVATE\rkey",
        "PRIVATE\nkey",
        "PRIVATE\0key",
        "PRIVATE\u0100key"
      ]) {
        const input = await setup();
        const providers = llmProvidersFromEnv({
          ...configured,
          [field]: { get: async () => secret }
        });
        await expect(
          complete({ ...deps(), providers }, input)
        ).rejects.toMatchObject({
          code: "gateway_not_configured",
          message: "Provider credentials unavailable."
        });
        await expectFree(input.runId);
      }
      expect(inference).not.toHaveBeenCalled();
    }
  );
  it.each(["non-2xx", "invalid JSON"])(
    "retains liability and sanitizes %s inference failures",
    async (kind) => {
      const input = await setup();
      const { inference } = http();
      inference.mockImplementation(
        async () =>
          new Response("PRIVATE invalid upstream response", {
            status: kind === "non-2xx" ? 503 : 200,
            headers: { "Content-Type": "application/json" }
          })
      );
      await expect(complete(deps(), input)).rejects.toMatchObject({
        code: "provider_error",
        message: "DeepInfra gateway request failed."
      });
      expect(await accountingForRun(db, input.runId)).toMatchObject({
        totalCents: 16,
        issueCount: 1
      });
      await expect(complete(deps(), input)).rejects.toMatchObject({
        code: "accounting_uncertain"
      });
      expect(inference).toHaveBeenCalledTimes(1);
      expect(inference.mock.calls[0]![1]!.redirect).toBe("manual");
    }
  );
  it.each([
    [
      "302",
      (): Response =>
        ({
          ok: false,
          status: 302,
          type: "default",
          json: async () => responseBody()
        }) as Response
    ],
    [
      "opaque redirect",
      (): Response =>
        ({
          ok: true,
          status: 0,
          type: "opaqueredirect",
          json: async () => responseBody()
        }) as Response
    ]
  ] as const)(
    "keeps an uncertain reservation when the chat fetch is a %s",
    async (_label, respond) => {
      const input = await setup();
      const { inference } = http();
      let read = false;
      inference.mockImplementation(async () => {
        const response = respond();
        const json = response.json.bind(response);
        return {
          ...response,
          json: async () => {
            read = true;
            return json();
          },
          text: async () => {
            read = true;
            return "";
          }
        } as Response;
      });
      await expect(complete(deps(), input)).rejects.toMatchObject({
        code: "provider_error",
        message: "DeepInfra gateway request failed."
      });
      expect(read).toBe(false);
      expect(await accountingForRun(db, input.runId)).toMatchObject({
        totalCents: 16,
        issueCount: 1
      });
      expect(
        await db
          .prepare(
            "SELECT state, issue, liability_cents FROM llm_operations WHERE run_id=?"
          )
          .bind(input.runId)
          .first()
      ).toEqual({
        state: "uncertain",
        issue: "provider_outcome_unknown",
        liability_cents: 16
      });
      expect(
        await db
          .prepare("SELECT id FROM llm_calls WHERE run_id=?")
          .bind(input.runId)
          .first()
      ).toBeNull();
    }
  );
  it("keeps an uncertain reservation when the chat fetch throws the Workers redirect TypeError", async () => {
    const input = await setup();
    const { inference } = http();
    inference.mockImplementation(async () => {
      throw new TypeError(WORKERS_REDIRECT_ERROR);
    });
    await expect(complete(deps(), input)).rejects.toMatchObject({
      code: "provider_error",
      message: "DeepInfra gateway request failed."
    });
    expect(await accountingForRun(db, input.runId)).toMatchObject({
      totalCents: 16,
      issueCount: 1
    });
    expect(
      await db
        .prepare(
          "SELECT state, issue, liability_cents FROM llm_operations WHERE run_id=?"
        )
        .bind(input.runId)
        .first()
    ).toEqual({
      state: "uncertain",
      issue: "provider_outcome_unknown",
      liability_cents: 16
    });
  });
  it("releases real D1 liability when policy expires after claim and before inference", async () => {
    const input = await setup();
    const { inference } = http();
    const provider = createDeepInfraProvider(configured)!;
    const prepare = provider.prepare!.bind(provider);
    let time = NOW;
    provider.prepare = async (signal) => {
      const prepared = await prepare(signal);
      return async (args) => {
        expect(
          await db
            .prepare(
              "SELECT state,liability_cents FROM llm_operations WHERE run_id=?"
            )
            .bind(input.runId)
            .first()
        ).toEqual({ state: "dispatched", liability_cents: 16 });
        time = policy.validUntil;
        return prepared(args);
      };
    };
    await expect(
      complete({ ...deps(), providers: [provider], now: () => time }, input)
    ).rejects.toMatchObject({ code: "cost_policy_invalid" });
    expect(inference).not.toHaveBeenCalled();
    expect(await accountingForRun(db, input.runId)).toMatchObject({
      totalCents: 0,
      issueCount: 0
    });
    expect(
      await db
        .prepare(
          "SELECT state,liability_cents FROM llm_operations WHERE run_id=?"
        )
        .bind(input.runId)
        .first()
    ).toEqual({ state: "released", liability_cents: 0 });
  });

  function overloadBody(code: string) {
    return {
      error: {
        type: "invalid_request_error",
        code,
        message: "Model busy, retry later"
      }
    };
  }
  function overloadResponse(
    code = "engine_overloaded",
    status = 429,
    logId: string | null = "aig-overload"
  ) {
    return Response.json(overloadBody(code), {
      status,
      ...(logId == null ? {} : { headers: { "cf-aig-log-id": logId } })
    });
  }

  it("retries a 429 engine_overloaded once and settles the same reservation", async () => {
    const input = await setup();
    const { inference } = http();
    let calls = 0;
    let entered!: () => void;
    const reached = new Promise<void>((resolve) => (entered = resolve));
    inference.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        entered();
        return overloadResponse();
      }
      return Response.json(responseBody(), {
        headers: { "cf-aig-log-id": "aig-ok" }
      });
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
    const pending = complete(deps(), input);
    await reached;
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await pending;
    expect(result).toMatchObject({
      provider: "deepinfra",
      model: MODEL,
      text: "PRIVATE completion"
    });
    expect(calls).toBe(2);
    expect(
      await db
        .prepare("SELECT COUNT(*) AS n FROM llm_calls WHERE run_id=?")
        .bind(input.runId)
        .first()
    ).toEqual({ n: 1 });
    expect(
      await db
        .prepare(
          "SELECT state, issue, liability_cents FROM llm_operations WHERE run_id=?"
        )
        .bind(input.runId)
        .first()
    ).toEqual({ state: "settled", issue: null, liability_cents: 0 });
    const logged = warn.mock.calls.map(
      (call) => call[0] as Record<string, unknown>
    );
    expect(logged).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "provider_call_failed",
          attempt: 1,
          status: 429,
          errorCode: "engine_overloaded",
          aigLogId: "aig-overload",
          elapsedMs: expect.any(Number),
          deadlineElapsedMs: expect.any(Number),
          dispatchedAt: NOW
        }),
        expect.objectContaining({
          event: "provider_call_attempt",
          attempt: 2,
          status: 200,
          aigLogId: "aig-ok",
          elapsedMs: expect.any(Number),
          deadlineElapsedMs: expect.any(Number),
          dispatchedAt: NOW
        })
      ])
    );
    warn.mockRestore();
  });

  it("releases a persistent 429 engine_overloaded with no uncertain cents", async () => {
    const at = "2026-10-04T20:00:00.000Z";
    const input = await setup();
    await db
      .prepare("INSERT INTO llm_periods VALUES (?,?,?,?,?)")
      .bind(
        `overload-${input.runId}`,
        at,
        "2026-10-04T21:00:00.000Z",
        500,
        "overload-test"
      )
      .run();
    const localDeps = { ...deps(), now: () => at };
    const { inference } = http();
    let calls = 0;
    let entered!: () => void;
    const reached = new Promise<void>((resolve) => (entered = resolve));
    inference.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) entered();
      return overloadResponse();
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
    const pending = complete(localDeps, input);
    const failed = expect(pending).rejects.toMatchObject({
      code: "provider_error",
      message: "DeepInfra gateway request failed."
    });
    await reached;
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(15_000);
    await failed;
    expect(calls).toBe(3);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toBe(3);
    expect(await accountingForRun(db, input.runId)).toMatchObject({
      uncertainCents: 0,
      issueCount: 0,
      totalCents: 0
    });
    const row = await db
      .prepare(
        "SELECT state, issue, liability_cents, response_evidence_json FROM llm_operations WHERE run_id=?"
      )
      .bind(input.runId)
      .first<{
        state: string;
        issue: string | null;
        liability_cents: number;
        response_evidence_json: string;
      }>();
    expect(row?.state).toBe("released");
    expect(row?.issue).toBeNull();
    expect(row?.liability_cents).toBe(0);
    expect(JSON.parse(row!.response_evidence_json)).toEqual({
      reason: "provider_definite_refusal",
      status: 429,
      errorCode: "engine_overloaded",
      aigLogId: "aig-overload"
    });
    const attempts = warn.mock.calls.map(
      (call) => call[0] as Record<string, unknown>
    );
    expect(attempts.map((entry) => entry.attempt)).toEqual([1, 2, 3]);
    for (const entry of attempts) {
      expect(entry).toMatchObject({
        event: "provider_call_failed",
        status: 429,
        errorCode: "engine_overloaded",
        aigLogId: "aig-overload",
        elapsedMs: expect.any(Number),
        deadlineElapsedMs: expect.any(Number),
        dispatchedAt: at
      });
    }
    warn.mockRestore();
    vi.useRealTimers();
    await expect(complete(localDeps, input)).rejects.toMatchObject({
      code: "result_unavailable"
    });
    expect(calls).toBe(3);
    const other = await setup();
    inference.mockImplementation(async () => Response.json(responseBody()));
    await expect(
      complete(localDeps, { ...other, operationKey: "draft:9:drafter" })
    ).resolves.toMatchObject({ text: "PRIVATE completion" });
  });

  async function flushTasks() {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  }

  it("does not retry a 429 engine_overloaded when under 80s would remain", async () => {
    const input = await setup();
    const { inference } = http();
    let calls = 0;
    let entered!: () => void;
    const reached = new Promise<void>((resolve) => (entered = resolve));
    inference.mockImplementation(
      () =>
        new Promise((resolve) => {
          calls += 1;
          entered();
          setTimeout(() => resolve(overloadResponse()), 40_000);
        })
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
    const pending = complete(deps(), input);
    const failed = expect(pending).rejects.toMatchObject({
      code: "provider_error",
      message: "DeepInfra gateway request failed."
    });
    await reached;
    vi.advanceTimersByTime(40_000);
    await flushTasks();
    await failed;
    expect(calls).toBe(1);
    vi.advanceTimersByTime(5_000);
    await flushTasks();
    expect(calls).toBe(1);
    expect(await accountingForRun(db, input.runId)).toMatchObject({
      uncertainCents: 0,
      issueCount: 0
    });
    const row = await db
      .prepare(
        "SELECT state, liability_cents, response_evidence_json FROM llm_operations WHERE run_id=?"
      )
      .bind(input.runId)
      .first<{
        state: string;
        liability_cents: number;
        response_evidence_json: string;
      }>();
    expect(row?.state).toBe("released");
    expect(row?.liability_cents).toBe(0);
    expect(JSON.parse(row!.response_evidence_json)).toEqual({
      reason: "provider_definite_refusal",
      status: 429,
      errorCode: "engine_overloaded",
      aigLogId: "aig-overload"
    });
    expect(warn.mock.calls.map((call) => call[0])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "provider_call_retry_stopped",
          attempt: 2,
          reason: "min_remaining",
          deadlineElapsedMs: expect.any(Number)
        })
      ])
    );
  });

  it.each([
    ["429 without engine_overloaded", () => overloadResponse("rate_limited")],
    ["400", () => overloadResponse("engine_overloaded", 400)],
    ["422", () => overloadResponse("invalid", 422)],
    ["5xx", () => overloadResponse("engine_overloaded", 503)]
  ])("keeps an uncertain reservation on %s", async (_label, respond) => {
    const input = await setup();
    const { inference } = http();
    inference.mockImplementation(async () => respond());
    await expect(complete(deps(), input)).rejects.toMatchObject({
      code: "provider_error",
      message: "DeepInfra gateway request failed."
    });
    expect(inference).toHaveBeenCalledTimes(1);
    expect(await accountingForRun(db, input.runId)).toMatchObject({
      totalCents: 16,
      uncertainCents: 16,
      issueCount: 1
    });
    expect(
      await db
        .prepare("SELECT state, issue FROM llm_operations WHERE run_id=?")
        .bind(input.runId)
        .first()
    ).toEqual({ state: "uncertain", issue: "provider_outcome_unknown" });
    await expect(complete(deps(), input)).rejects.toMatchObject({
      code: "accounting_uncertain"
    });
  });

  it("keeps an uncertain reservation when overload is followed by a 503", async () => {
    const input = await setup();
    const { inference } = http();
    let calls = 0;
    let entered!: () => void;
    const reached = new Promise<void>((resolve) => (entered = resolve));
    inference.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        entered();
        return overloadResponse();
      }
      return overloadResponse("server_error", 503, "aig-503");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
    const pending = complete(deps(), input);
    const failed = expect(pending).rejects.toMatchObject({
      code: "provider_error"
    });
    await reached;
    await vi.advanceTimersByTimeAsync(5_000);
    await failed;
    expect(calls).toBe(2);
    expect(
      warn.mock.calls.map((call) => (call[0] as { attempt?: number }).attempt)
    ).toEqual([1, 2]);
    expect(
      await db
        .prepare("SELECT state, issue FROM llm_operations WHERE run_id=?")
        .bind(input.runId)
        .first()
    ).toEqual({ state: "uncertain", issue: "provider_outcome_unknown" });
    expect(await accountingForRun(db, input.runId)).toMatchObject({
      uncertainCents: 16,
      issueCount: 1
    });
  });

  it("keeps an uncertain reservation when the chat fetch throws", async () => {
    const input = await setup();
    const { inference } = http();
    inference.mockImplementation(async () => {
      throw new TypeError("network down");
    });
    await expect(complete(deps(), input)).rejects.toMatchObject({
      code: "provider_error"
    });
    expect(inference).toHaveBeenCalledTimes(1);
    expect(
      await db
        .prepare(
          "SELECT state, issue, liability_cents FROM llm_operations WHERE run_id=?"
        )
        .bind(input.runId)
        .first()
    ).toEqual({
      state: "uncertain",
      issue: "provider_outcome_unknown",
      liability_cents: 16
    });
    await expect(complete(deps(), input)).rejects.toMatchObject({
      code: "accounting_uncertain"
    });
  });

  it("releases a persistent 429 engine_overloaded when the log id header is absent", async () => {
    const input = await setup();
    const { inference } = http();
    let calls = 0;
    let entered!: () => void;
    const reached = new Promise<void>((resolve) => (entered = resolve));
    inference.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) entered();
      return overloadResponse("engine_overloaded", 429, null);
    });
    vi.useFakeTimers();
    const pending = complete(deps(), input);
    const failed = expect(pending).rejects.toMatchObject({
      code: "provider_error"
    });
    await reached;
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(15_000);
    await failed;
    expect(calls).toBe(3);
    const row = await db
      .prepare(
        "SELECT state, liability_cents, response_evidence_json FROM llm_operations WHERE run_id=?"
      )
      .bind(input.runId)
      .first<{
        state: string;
        liability_cents: number;
        response_evidence_json: string;
      }>();
    expect(row?.state).toBe("released");
    expect(row?.liability_cents).toBe(0);
    expect(JSON.parse(row!.response_evidence_json)).toEqual({
      reason: "provider_definite_refusal",
      status: 429,
      errorCode: "engine_overloaded"
    });
    expect(JSON.parse(row!.response_evidence_json)).not.toHaveProperty(
      "aigLogId"
    );
  });

  it("stops at 3 overload fetches while more than 80s of the deadline remains", async () => {
    const input = await setup();
    const { inference } = http();
    let calls = 0;
    let entered!: () => void;
    const reached = new Promise<void>((resolve) => (entered = resolve));
    inference.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) entered();
      return overloadResponse();
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
    const pending = complete(deps(), input);
    const failed = expect(pending).rejects.toMatchObject({
      code: "provider_error"
    });
    await reached;
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(15_000);
    await failed;
    expect(calls).toBe(3);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toBe(3);
    const logged = warn.mock.calls.map(
      (call) => call[0] as Record<string, unknown>
    );
    expect(logged.map((entry) => entry.event)).toEqual([
      "provider_call_failed",
      "provider_call_failed",
      "provider_call_failed"
    ]);
    const third = logged[2]!.deadlineElapsedMs as number;
    expect(third).toBeLessThan(40_000);
    expect(120_000 - third).toBeGreaterThanOrEqual(80_000);
  });

  it("keeps an uncertain reservation when the release version no longer matches", async () => {
    const input = await setup();
    const { inference } = http();
    let calls = 0;
    let entered!: () => void;
    const reached = new Promise<void>((resolve) => (entered = resolve));
    inference.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) entered();
      return overloadResponse();
    });
    vi.useFakeTimers();
    const pending = complete(deps(), input);
    const failed = expect(pending).rejects.toMatchObject({
      code: "provider_error",
      message: "DeepInfra gateway request failed."
    });
    await reached;
    await db
      .prepare(
        "UPDATE llm_operations SET version = version + 1 WHERE run_id = ?"
      )
      .bind(input.runId)
      .run();
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(15_000);
    await failed;
    expect(calls).toBe(3);
    expect(await accountingForRun(db, input.runId)).toMatchObject({
      uncertainCents: 16,
      issueCount: 1
    });
    expect(
      await db
        .prepare(
          "SELECT state, issue, liability_cents FROM llm_operations WHERE run_id=?"
        )
        .bind(input.runId)
        .first()
    ).toEqual({
      state: "uncertain",
      issue: "provider_outcome_unknown",
      liability_cents: 16
    });
  });

  it("does not fetch again when the policy expires during the overload backoff", async () => {
    const input = await setup();
    const { inference } = http();
    let calls = 0;
    let time = NOW;
    let entered!: () => void;
    const reached = new Promise<void>((resolve) => (entered = resolve));
    inference.mockImplementation(async () => {
      calls += 1;
      entered();
      time = policy.validUntil;
      return overloadResponse();
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
    const pending = complete({ ...deps(), now: () => time }, input);
    const failed = expect(pending).rejects.toMatchObject({
      code: "provider_error"
    });
    await reached;
    await vi.advanceTimersByTimeAsync(5_000);
    await failed;
    expect(calls).toBe(1);
    expect(
      await db
        .prepare(
          "SELECT state, liability_cents, response_evidence_json FROM llm_operations WHERE run_id=?"
        )
        .bind(input.runId)
        .first<{
          state: string;
          liability_cents: number;
          response_evidence_json: string;
        }>()
    ).toMatchObject({ state: "released", liability_cents: 0 });
    expect(warn.mock.calls.map((call) => call[0])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "provider_call_retry_stopped",
          attempt: 2,
          reason: "policy_invalid",
          deadlineElapsedMs: expect.any(Number)
        })
      ])
    );
  });

  it("keeps an uncertain reservation when overload is followed by a network failure", async () => {
    const input = await setup();
    const { inference } = http();
    let calls = 0;
    let entered!: () => void;
    const reached = new Promise<void>((resolve) => (entered = resolve));
    inference.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        entered();
        return overloadResponse();
      }
      throw new TypeError("network down");
    });
    vi.useFakeTimers();
    const pending = complete(deps(), input);
    const failed = expect(pending).rejects.toMatchObject({
      code: "provider_error"
    });
    await reached;
    await vi.advanceTimersByTimeAsync(5_000);
    await failed;
    expect(calls).toBe(2);
    expect(await accountingForRun(db, input.runId)).toMatchObject({
      uncertainCents: 16,
      issueCount: 1,
      totalCents: 16
    });
    expect(
      await db
        .prepare(
          "SELECT state, issue, liability_cents FROM llm_operations WHERE run_id=?"
        )
        .bind(input.runId)
        .first()
    ).toEqual({
      state: "uncertain",
      issue: "provider_outcome_unknown",
      liability_cents: 16
    });
  });

  it("keeps an uncertain reservation when overload is followed by a timeout", async () => {
    const input = await setup();
    const { inference } = http();
    let calls = 0;
    let entered!: () => void;
    const reached = new Promise<void>((resolve) => (entered = resolve));
    inference.mockImplementation((_url, init) => {
      calls += 1;
      if (calls === 1) {
        entered();
        return new Promise((resolve) => {
          setTimeout(() => resolve(overloadResponse()), 1);
        });
      }
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const abort = () =>
          reject(new DOMException("The operation was aborted.", "AbortError"));
        if (signal?.aborted) {
          abort();
          return;
        }
        signal?.addEventListener("abort", abort, { once: true });
      });
    });
    vi.useFakeTimers();
    const pending = complete(deps(), input);
    const failed = expect(pending).rejects.toMatchObject({
      code: "provider_error"
    });
    await reached;
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(1);
    vi.advanceTimersByTime(5_000);
    await flushTasks();
    expect(calls).toBe(2);
    vi.advanceTimersByTime(DEEPINFRA_CHAT_TIMEOUT_MS - 5_001);
    await flushTasks();
    await failed;
    expect(calls).toBe(2);
    expect(await accountingForRun(db, input.runId)).toMatchObject({
      uncertainCents: 16,
      issueCount: 1
    });
    expect(
      await db
        .prepare(
          "SELECT state, issue, liability_cents FROM llm_operations WHERE run_id=?"
        )
        .bind(input.runId)
        .first()
    ).toEqual({
      state: "uncertain",
      issue: "provider_outcome_unknown",
      liability_cents: 16
    });
  });

  it.each([
    [
      "3xx redirect",
      () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://evil.example/private" }
        })
    ],
    [
      "429 with a non-JSON body",
      () => new Response("not-json", { status: 429 })
    ]
  ])(
    "makes one fetch and does not release a chat %s",
    async (_label, respond) => {
      const input = await setup();
      const { inference } = http();
      inference.mockImplementation(async () => respond());
      await expect(complete(deps(), input)).rejects.toMatchObject({
        code: "provider_error",
        message: "DeepInfra gateway request failed."
      });
      expect(inference).toHaveBeenCalledTimes(1);
      expect(
        await db
          .prepare(
            "SELECT state, issue, liability_cents, response_evidence_json FROM llm_operations WHERE run_id=?"
          )
          .bind(input.runId)
          .first()
      ).toEqual({
        state: "uncertain",
        issue: "provider_outcome_unknown",
        liability_cents: 16,
        response_evidence_json: null
      });
    }
  );
});
