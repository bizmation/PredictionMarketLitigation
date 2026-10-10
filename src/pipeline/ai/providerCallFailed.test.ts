import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeepInfraProvider } from "./gateway";
import { resolveCostPolicy } from "./costPolicy";

const MODEL = "zai-org/GLM-5.3-Flash";
const NOW = "2026-10-04T19:12:00.000Z";
const KEY = "PRIVATE-provider-key";
const TOKEN = "PRIVATE-gateway-key";
const ACCOUNT = "00112233445566778899aabbccddeeff3c16";
const GATEWAY = "default";
const MESSAGE = "PRIVATE completion text that must stay out of the log";
const REASONING = "PRIVATE reasoning trace that must stay out of the log";
const policy = resolveCostPolicy("deepinfra", MODEL, NOW);

function configured(): Env {
  return {
    DEEPINFRA_API_KEY: KEY,
    AI_GATEWAY_TOKEN: TOKEN,
    AI_GATEWAY_ID: GATEWAY,
    CLOUDFLARE_ACCOUNT_ID: ACCOUNT
  } as Env;
}

async function failChat(fetchImpl: typeof fetch) {
  vi.stubGlobal("fetch", fetchImpl);
  const provider = createDeepInfraProvider(configured())!;
  const complete = await provider.prepare!(new AbortController().signal);
  return complete({
    model: MODEL,
    prompt: "PRIVATE prompt",
    policy,
    now: () => NOW
  });
}

function expectRouting(
  entry: Record<string, unknown>,
  headersReceived: boolean
) {
  expect(entry).toMatchObject({
    event: "provider_call_failed",
    provider: "deepinfra",
    model: MODEL,
    gatewayId: GATEWAY,
    accountIdLast4: "3c16",
    urlHost: "gateway.ai.cloudflare.com",
    urlPath: "/v1/****3c16/default/custom-deepinfra/v1/openai/chat/completions",
    hasAuthorization: true,
    hasGatewayAuth: true,
    dispatchedAt: NOW,
    headersReceived
  });
  expect(entry.elapsedMs).toEqual(expect.any(Number));
  expect(entry.elapsedMs as number).toBeGreaterThanOrEqual(0);
}

function expectNoSecrets(calls: unknown[]) {
  const logged = JSON.stringify(calls);
  expect(logged).not.toContain(KEY);
  expect(logged).not.toContain(TOKEN);
  expect(logged).not.toContain(ACCOUNT);
  expect(logged).not.toContain("PRIVATE prompt");
  expect(logged).not.toContain(MESSAGE);
  expect(logged).not.toContain(REASONING);
  expect(logged).not.toContain("Bearer");
  expect(logged).not.toContain("secret.example");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DeepInfra chat failure diagnostics", () => {
  it.each(["AbortError", "TimeoutError"])(
    "logs a %s as timeout with elapsedMs and no secrets",
    async (errorName) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const error = new Error(`socket ${KEY}`);
        error.name = errorName;
        await expect(
          failChat(async () => {
            throw error;
          })
        ).rejects.toMatchObject({
          code: "provider_error",
          message: "DeepInfra gateway request failed."
        });
        expect(warn).toHaveBeenCalledTimes(1);
        const entry = warn.mock.calls[0]![0] as Record<string, unknown>;
        expect(entry).toMatchObject({ stage: "timeout", errorName });
        expect(entry).not.toHaveProperty("status");
        expect(entry).not.toHaveProperty("bodyPrefix");
        expectRouting(entry, false);
        expectNoSecrets(warn.mock.calls);
      } finally {
        warn.mockRestore();
      }
    }
  );

  it("logs a network failure without a response", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(
        failChat(async () => {
          throw new TypeError(`connect ${KEY} ${TOKEN}`);
        })
      ).rejects.toMatchObject({
        code: "provider_error",
        message: "DeepInfra gateway request failed."
      });
      expect(warn).toHaveBeenCalledTimes(1);
      const entry = warn.mock.calls[0]![0] as Record<string, unknown>;
      expect(entry).toMatchObject({
        stage: "network",
        errorName: "TypeError"
      });
      expect(String(entry.errorMessage)).not.toContain(KEY);
      expect(entry).not.toHaveProperty("status");
      expectRouting(entry, false);
      expectNoSecrets(warn.mock.calls);
    } finally {
      warn.mockRestore();
    }
  });

  it("logs an HTTP 5xx with a capped bodyPrefix and aigLogId", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const body = `line1\nBearer ${KEY}\n${TOKEN}\n${ACCOUNT}\n${"x".repeat(200)}`;
    try {
      await expect(
        failChat(
          async () =>
            new Response(body, {
              status: 503,
              headers: {
                "cf-aig-log-id": "aig-log-1",
                Location: "https://secret.example/next"
              }
            })
        )
      ).rejects.toMatchObject({
        code: "provider_error",
        message: "DeepInfra gateway request failed."
      });
      expect(warn).toHaveBeenCalledTimes(1);
      const entry = warn.mock.calls[0]![0] as Record<string, unknown>;
      expect(entry).toMatchObject({
        stage: "http",
        status: 503,
        responseType: "default",
        aigLogId: "aig-log-1",
        errorName: "Error",
        errorMessage: "HTTP 503"
      });
      expect(entry.bodyPrefix).toEqual(expect.any(String));
      expect(String(entry.bodyPrefix)).toHaveLength(180);
      expect(String(entry.bodyPrefix)).not.toContain("\n");
      expect(String(entry.bodyPrefix)).toContain("bearer [redacted]");
      expect(entry).not.toHaveProperty("finishReason");
      expectRouting(entry, true);
      expectNoSecrets(warn.mock.calls);
    } finally {
      warn.mockRestore();
    }
  });

  it.each([
    ["302", 302, "default"],
    ["opaque redirect", 0, "opaqueredirect"]
  ] as const)(
    "logs a refused %s with status and response type and does not read the body",
    async (_label, status, responseType) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      let read = false;
      try {
        await expect(
          failChat(async () => {
            const response = {
              ok: status === 302 ? false : true,
              status,
              type: responseType,
              headers: {
                get(name: string) {
                  if (name.toLowerCase() === "location")
                    return "https://secret.example/next";
                  if (name.toLowerCase() === "cf-aig-log-id")
                    return "aig-redir";
                  return null;
                }
              },
              json: async () => {
                read = true;
                return {};
              },
              text: async () => {
                read = true;
                return `moved ${KEY}`;
              }
            };
            return response as Response;
          })
        ).rejects.toMatchObject({
          code: "provider_error",
          message: "DeepInfra gateway request failed."
        });
        expect(read).toBe(false);
        expect(warn).toHaveBeenCalledTimes(1);
        const entry = warn.mock.calls[0]![0] as Record<string, unknown>;
        expect(entry).toMatchObject({
          stage: "redirect_refused",
          status,
          responseType,
          aigLogId: "aig-redir"
        });
        expect(entry).not.toHaveProperty("bodyPrefix");
        expectRouting(entry, true);
        expectNoSecrets(warn.mock.calls);
      } finally {
        warn.mockRestore();
      }
    }
  );

  it("logs invalid JSON without the planted secret", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(
        failChat(
          async () =>
            new Response(`not-json ${KEY} ${TOKEN} ${ACCOUNT}`, {
              status: 200,
              headers: { "cf-aig-log-id": "aig-bad" }
            })
        )
      ).rejects.toMatchObject({
        code: "provider_error",
        message: "DeepInfra gateway request failed."
      });
      expect(warn).toHaveBeenCalledTimes(1);
      const entry = warn.mock.calls[0]![0] as Record<string, unknown>;
      expect(entry).toMatchObject({
        stage: "invalid_body",
        status: 200,
        responseType: "default",
        errorName: "SyntaxError",
        aigLogId: "aig-bad"
      });
      expect(entry).not.toHaveProperty("errorMessage");
      expect(String(entry.bodyPrefix)).not.toContain(KEY);
      expect(entry).not.toHaveProperty("finishReason");
      expectRouting(entry, true);
      expectNoSecrets(warn.mock.calls);
    } finally {
      warn.mockRestore();
    }
  });

  it("logs finish reason and token counts from a parsed failure body and not the message", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(
        failChat(async () =>
          Response.json(
            {
              choices: [
                {
                  finish_reason: "length",
                  message: { content: MESSAGE, reasoning: REASONING }
                }
              ],
              usage: {
                prompt_tokens: 12,
                completion_tokens: 2048,
                completion_tokens_details: { reasoning_tokens: 2000 }
              }
            },
            {
              status: 503,
              headers: { "cf-aig-log-id": "aig-reason" }
            }
          )
        )
      ).rejects.toMatchObject({
        code: "provider_error",
        message: "DeepInfra gateway request failed."
      });
      expect(warn).toHaveBeenCalledTimes(1);
      const entry = warn.mock.calls[0]![0] as Record<string, unknown>;
      expect(entry).toMatchObject({
        stage: "http",
        status: 503,
        finishReason: "length",
        completionTokens: 2048,
        reasoningTokens: 2000,
        aigLogId: "aig-reason"
      });
      expect(entry).not.toHaveProperty("bodyPrefix");
      expectRouting(entry, true);
      expectNoSecrets(warn.mock.calls);
    } finally {
      warn.mockRestore();
    }
  });
});

describe("DeepInfra chat degraded diagnostics", () => {
  function okBody(choice: {
    finish_reason: string;
    content: unknown;
  }): unknown {
    return {
      id: "req_ok",
      model: MODEL,
      choices: [
        {
          finish_reason: choice.finish_reason,
          message: { content: choice.content, reasoning: REASONING }
        }
      ],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 2048,
        completion_tokens_details: { reasoning_tokens: 2000 }
      }
    };
  }

  async function completeOk(body: unknown) {
    return failChat(async () =>
      Response.json(body, {
        status: 200,
        headers: { "cf-aig-log-id": "aig-ok" }
      })
    );
  }

  it("warns when finish_reason is length and content is empty", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(
        completeOk(okBody({ finish_reason: "length", content: "" }))
      ).resolves.toEqual({
        text: "",
        inputTokens: 12,
        outputTokens: 2048,
        accountingIssue: undefined,
        providerRequestId: "req_ok"
      });
      expect(warn).toHaveBeenCalledTimes(1);
      const entry = warn.mock.calls[0]![0] as Record<string, unknown>;
      expect(entry).toMatchObject({
        event: "provider_call_degraded",
        provider: "deepinfra",
        model: MODEL,
        finishReason: "length",
        completionTokens: 2048,
        reasoningTokens: 2000,
        aigLogId: "aig-ok",
        headersReceived: true
      });
      expect(entry.elapsedMs).toEqual(expect.any(Number));
      expectRouting({ ...entry, event: "provider_call_failed" }, true);
      expect(entry).not.toHaveProperty("status");
      expectNoSecrets(warn.mock.calls);
    } finally {
      warn.mockRestore();
    }
  });

  it("warns when content is null even if finish_reason is stop", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(
        completeOk(okBody({ finish_reason: "stop", content: null }))
      ).resolves.toEqual({
        text: "",
        inputTokens: 12,
        outputTokens: 2048,
        accountingIssue: "non_text_output",
        providerRequestId: "req_ok"
      });
      expect(warn).toHaveBeenCalledTimes(1);
      const entry = warn.mock.calls[0]![0] as Record<string, unknown>;
      expect(entry).toMatchObject({
        event: "provider_call_degraded",
        finishReason: "stop",
        completionTokens: 2048,
        reasoningTokens: 2000,
        aigLogId: "aig-ok"
      });
      expectRouting({ ...entry, event: "provider_call_failed" }, true);
      expectNoSecrets(warn.mock.calls);
    } finally {
      warn.mockRestore();
    }
  });

  it("does not warn for finish_reason stop with non-empty content", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(
        completeOk(okBody({ finish_reason: "stop", content: MESSAGE }))
      ).resolves.toEqual({
        text: MESSAGE,
        inputTokens: 12,
        outputTokens: 2048,
        accountingIssue: undefined,
        providerRequestId: "req_ok"
      });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("DeepInfra chat failure review fixes", () => {
  it("logs Response.json(null) as unknown with status 200 and TypeError", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(
        failChat(async () => Response.json(null))
      ).rejects.toMatchObject({
        code: "provider_error",
        message: "DeepInfra gateway request failed."
      });
      expect(warn).toHaveBeenCalledTimes(1);
      const entry = warn.mock.calls[0]![0] as Record<string, unknown>;
      expect(entry).toMatchObject({
        stage: "unknown",
        status: 200,
        errorName: "TypeError"
      });
      expectNoSecrets(warn.mock.calls);
    } finally {
      warn.mockRestore();
    }
  });

  it.each([
    [
      "error",
      {
        error: {
          type: "server_error",
          code: "overloaded",
          message: `busy ${KEY}`
        }
      }
    ],
    [
      "errors[0]",
      {
        errors: [{ type: "server_error", code: 503, message: `busy ${KEY}` }]
      }
    ]
  ] as const)(
    "logs scrubbed API %s fields from a non-OK JSON body and not the message",
    async (_label, extra) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        await expect(
          failChat(async () =>
            Response.json(
              {
                ...extra,
                choices: [
                  {
                    message: { content: MESSAGE, reasoning: REASONING }
                  }
                ]
              },
              { status: 500, headers: { "cf-aig-log-id": "aig-json" } }
            )
          )
        ).rejects.toMatchObject({
          code: "provider_error",
          message: "DeepInfra gateway request failed."
        });
        expect(warn).toHaveBeenCalledTimes(1);
        const entry = warn.mock.calls[0]![0] as Record<string, unknown>;
        expect(entry).toMatchObject({
          stage: "http",
          status: 500,
          errorType: "server_error",
          errorCode: _label === "error" ? "overloaded" : "503",
          errorMessage: "busy [redacted]",
          aigLogId: "aig-json"
        });
        expect(entry).not.toHaveProperty("bodyPrefix");
        expectNoSecrets(warn.mock.calls);
      } finally {
        warn.mockRestore();
      }
    }
  );

  it("scrubs a secret that straddles the 180-character cut", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const message = `${"y".repeat(175)}${KEY}`;
    try {
      await expect(
        failChat(async () => {
          throw new Error(message);
        })
      ).rejects.toMatchObject({
        code: "provider_error",
        message: "DeepInfra gateway request failed."
      });
      expect(warn).toHaveBeenCalledTimes(1);
      const entry = warn.mock.calls[0]![0] as Record<string, unknown>;
      expect(entry).toMatchObject({ stage: "network", errorName: "Error" });
      expect(String(entry.errorMessage)).toHaveLength(180);
      expect(String(entry.errorMessage)).not.toContain("PRIVA");
      expect(String(entry.errorMessage)).not.toContain(KEY);
      expectNoSecrets(warn.mock.calls);
    } finally {
      warn.mockRestore();
    }
  });

  it("logs an abort while reading a non-OK body as timeout", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const error = new Error(`read ${KEY}`);
      error.name = "AbortError";
      await expect(
        failChat(async () => {
          const response = {
            ok: false,
            status: 503,
            type: "default",
            headers: {
              get(_name: string): string | null {
                return null;
              }
            },
            text: async (): Promise<string> => {
              throw error;
            },
            json: async () => ({})
          };
          return response as Response;
        })
      ).rejects.toMatchObject({
        code: "provider_error",
        message: "DeepInfra gateway request failed."
      });
      expect(warn).toHaveBeenCalledTimes(1);
      const entry = warn.mock.calls[0]![0] as Record<string, unknown>;
      expect(entry).toMatchObject({
        stage: "timeout",
        status: 503,
        errorName: "AbortError"
      });
      expectNoSecrets(warn.mock.calls);
    } finally {
      warn.mockRestore();
    }
  });
});
