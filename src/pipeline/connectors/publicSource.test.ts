import { afterEach, describe, expect, it, vi } from "vitest";

import { COURTLISTENER_POLL_TIMEOUT_MS } from "./courtListener";
import { SourceUnavailableError, type SourceCheckContext } from "./connector";
import { createCftcPressCheck } from "./cftcPress";
import { createLegalNewsLeadsCheck } from "./legalNewsLeads";
import {
  createSeededPageCheck,
  SEEDED_PAGE_ERROR_BODY_MAX_BYTES,
  SEEDED_PAGE_MAX_BYTES,
  SEEDED_PAGE_POLL_TIMEOUT_MS
} from "./publicSource";
import { createScotusDocketCheck } from "./scotusDocket";
import { POLL_SOURCES, type PollSource } from "./sources";

const CFTC = POLL_SOURCES.find((source) => source.name === "CFTC press")!;
const SCOTUS = POLL_SOURCES.find((source) => source.name === "SCOTUS docket")!;

function context(
  beforeRequest: () => Promise<void> = async () => {}
): SourceCheckContext {
  return { signal: new AbortController().signal, beforeRequest };
}

function page(
  status: number,
  body: BodyInit | null = "",
  headers?: HeadersInit
): Response {
  return new Response(body, { status, headers });
}

function streamThatThrows(err: Error): ReadableStream<Uint8Array> {
  return new ReadableStream(
    {
      pull() {
        throw err;
      }
    },
    { highWaterMark: 0 }
  );
}

describe("seeded page checks", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the three poll budgets inside the default step", () => {
    for (const check of [
      createCftcPressCheck(),
      createScotusDocketCheck(),
      createLegalNewsLeadsCheck()
    ]) {
      expect((check as { pollTimeoutMs?: number }).pollTimeoutMs).toBe(
        SEEDED_PAGE_POLL_TIMEOUT_MS
      );
    }
    expect(SEEDED_PAGE_POLL_TIMEOUT_MS).toBe(20_000);
    expect(
      COURTLISTENER_POLL_TIMEOUT_MS + 3 * SEEDED_PAGE_POLL_TIMEOUT_MS
    ).toBeLessThan(10 * 60 * 1000);
  });

  it("returns entities [] and a fetched summary for a 200 that names a docket", async () => {
    const body = "<html>docket 1:26-cv-03659 remains on the index</html>";
    const order: string[] = [];
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => {
        order.push("fetch");
        return page(200, body, { "content-type": "text/html; charset=utf-8" });
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    const items = await createCftcPressCheck()(
      CFTC,
      context(async () => {
        order.push("before");
      })
    );
    expect(order).toEqual(["before", "fetch"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.redirect).toBe("manual");
    expect(new Headers(init?.headers).get("authorization")).toBeNull();
    expect(items).toEqual([
      {
        entities: [],
        fetched: {
          status: 200,
          contentType: "text/html; charset=utf-8",
          bytes: new TextEncoder().encode(body).byteLength
        }
      }
    ]);
    expect(JSON.stringify(items)).not.toContain("1:26-cv-03659");
  });

  it("truncates contentType to 120 characters and allows a null type", async () => {
    const longType = `text/html; ${"a".repeat(200)}`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => page(200, "ok", { "content-type": longType }))
    );
    const [item] = await createCftcPressCheck()(CFTC, context());
    expect(item?.fetched?.contentType).toBe(longType.slice(0, 120));

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const response = page(200, "ok");
        response.headers.delete("content-type");
        return response;
      })
    );
    const [again] = await createScotusDocketCheck()(SCOTUS, context());
    expect(again?.fetched?.contentType).toBeNull();
    expect(again?.entities).toEqual([]);
  });

  it("skips a 429 after one fetch and does not retry", async () => {
    const fetchMock = vi.fn(async () => page(429, "slow down"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
      {
        reason: "http_429",
        detail: { status: 429, detail: "slow down" }
      }
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips a 5xx after one fetch and does not retry", async () => {
    const fetchMock = vi.fn(async () => page(503, "unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createLegalNewsLeadsCheck()(
        POLL_SOURCES.find((source) => source.name === "Legal news leads")!,
        context()
      )
    ).rejects.toMatchObject({
      reason: "http_5xx",
      detail: { status: 503, detail: "unavailable" }
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads at most 8192 error bytes before scrubbing", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (pulled >= 9000) {
            controller.close();
            return;
          }
          const size = Math.min(1024, 9000 - pulled);
          const chunk = new Uint8Array(size);
          chunk.fill(97);
          if (pulled === 0) chunk[0] = 84;
          controller.enqueue(chunk);
          pulled += size;
        }
      },
      { highWaterMark: 0 }
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return {
          status: 403,
          headers: new Headers({ "content-type": "text/html" }),
          body: stream
        } as Response;
      })
    );
    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
      {
        reason: "http_403",
        detail: { status: 403, detail: `T${"a".repeat(179)}` }
      }
    );
    expect(pulled).toBe(SEEDED_PAGE_ERROR_BODY_MAX_BYTES);
  });

  it("does not follow a redirect or read Location", async () => {
    let pulled = false;
    const stream = new ReadableStream(
      {
        pull(controller) {
          pulled = true;
          controller.enqueue(new TextEncoder().encode("secret-body"));
          controller.close();
        }
      },
      { highWaterMark: 0 }
    );
    const fetchMock = vi.fn(async () => {
      return {
        status: 302,
        headers: new Headers({ location: "https://evil.example/secret" }),
        body: stream
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const err = await Promise.resolve(
      createCftcPressCheck()(CFTC, context())
    ).then(
      () => {
        throw new Error("redirect was fetched");
      },
      (caught: unknown) => caught
    );
    expect(err).toBeInstanceOf(SourceUnavailableError);
    expect(err).toMatchObject({ reason: "redirect", detail: { status: 302 } });
    expect(
      JSON.stringify((err as SourceUnavailableError).detail)
    ).not.toContain("evil.example");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(pulled).toBe(false);
  });

  it.each([
    ["backslash", "https://www.cftc.gov\\PressRoom\\PressReleases"],
    ["embedded space", "https://www.cftc.gov/Press Room"],
    ["leading space", " https://www.cftc.gov/PressRoom/PressReleases"],
    ["trailing newline", "https://www.cftc.gov/PressRoom/PressReleases\n"],
    ["malformed percent", "https://www.cftc.gov/PressRoom/%zz"],
    ["empty", ""],
    ["non-https", "http://www.cftc.gov/PressRoom/PressReleases"]
  ])("rejects a %s URL before fetch", async (_label, url) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const before = vi.fn(async () => {});
    await expect(
      createCftcPressCheck()({ ...CFTC, url }, context(before))
    ).rejects.toMatchObject({ reason: "unsafe_url", detail: {} });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(before).not.toHaveBeenCalled();
  });

  it("rejects a foreign origin before fetch and omits the URL", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const before = vi.fn(async () => {});
    const foreign: PollSource = {
      ...CFTC,
      url: "https://example.com/PressRoom/PressReleases"
    };
    await expect(
      createCftcPressCheck()(foreign, context(before))
    ).rejects.toMatchObject({ reason: "unsafe_url", detail: {} });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(before).not.toHaveBeenCalled();
  });

  it("rejects a steered URL that leaves the seeded origin", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const steered: PollSource = {
      name: "SCOTUS docket",
      url: "https://user:pw@www.supremecourt.gov/docket/",
      tier: "tier1"
    };
    const err = await Promise.resolve(
      createScotusDocketCheck()(steered, context())
    ).then(
      () => {
        throw new Error("credentials were fetched");
      },
      (caught: unknown) => caught
    );
    expect(err).toMatchObject({ reason: "unsafe_url", detail: {} });
    expect(JSON.stringify(err)).not.toContain("user:pw");
    expect((err as Error).message).not.toContain("user:pw");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches a same-origin steered path", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      page(200, "ok")
    );
    vi.stubGlobal("fetch", fetchMock);
    const steered: PollSource = {
      ...CFTC,
      url: "https://www.cftc.gov/PressRoom/Other"
    };
    const items = await createCftcPressCheck()(steered, context());
    expect(items[0]?.entities).toEqual([]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://www.cftc.gov/PressRoom/Other"
    );
  });

  it("does not fetch when the factory origin disagrees with the source name", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createCftcPressCheck()(SCOTUS, context())
    ).rejects.toMatchObject({ reason: "unsafe_url" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps TimeoutError to timeout and rethrows AbortError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("timed out", "TimeoutError");
      })
    );
    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
      { reason: "timeout" }
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("aborted", "AbortError");
      })
    );
    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
      { name: "AbortError" }
    );
  });

  it("maps other fetch failures to network", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("boom");
      })
    );
    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
      { reason: "network" }
    );
  });

  it("maps a body-read TypeError to network and does not wrap AbortError", async () => {
    const typeError = new TypeError("read failed");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return {
          status: 200,
          headers: new Headers({ "content-type": "text/html" }),
          body: streamThatThrows(typeError)
        } as Response;
      })
    );
    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
      { reason: "network" }
    );

    const timeout = new DOMException("read timed out", "TimeoutError");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return {
          status: 200,
          headers: new Headers(),
          body: streamThatThrows(timeout)
        } as Response;
      })
    );
    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
      { reason: "timeout" }
    );

    const abort = new DOMException("aborted", "AbortError");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return {
          status: 200,
          headers: new Headers(),
          body: streamThatThrows(abort)
        } as Response;
      })
    );
    const caught = await Promise.resolve(
      createCftcPressCheck()(CFTC, context())
    ).then(
      () => {
        throw new Error("abort was swallowed");
      },
      (err: unknown) => err
    );
    expect(caught).toBe(abort);
    expect(caught).not.toBeInstanceOf(SourceUnavailableError);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return {
          status: 403,
          headers: new Headers(),
          body: streamThatThrows(new TypeError("error body failed"))
        } as Response;
      })
    );
    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
      { reason: "network" }
    );
  });

  it("does not read a 200 whose Content-Length is over the cap", async () => {
    let pulled = false;
    const stream = new ReadableStream(
      {
        pull() {
          pulled = true;
          throw new Error("body was read");
        }
      },
      { highWaterMark: 0 }
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return {
          status: 200,
          headers: new Headers({
            "content-length": String(SEEDED_PAGE_MAX_BYTES + 1)
          }),
          body: stream
        } as Response;
      })
    );
    await expect(createCftcPressCheck()(CFTC, context())).rejects.toMatchObject(
      { reason: "response_too_large", detail: {} }
    );
    expect(pulled).toBe(false);
  });

  it("rejects a 200 body that exceeds the cap while being read", async () => {
    const chunk = new Uint8Array(SEEDED_PAGE_MAX_BYTES + 1);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(chunk, { status: 200 }))
    );
    await expect(
      createSeededPageCheck("https://www.cftc.gov")(CFTC, context())
    ).rejects.toMatchObject({ reason: "response_too_large" });
  });
});
