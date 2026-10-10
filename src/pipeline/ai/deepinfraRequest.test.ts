import { describe, expect, it } from "vitest";
import {
  DEEPINFRA_CATALOG_USER_AGENT,
  deepInfraCatalogRequestInit,
  deepInfraChatRequestInit
} from "./gateway";

const CATALOG_URL = "https://api.deepinfra.com/models/list";
const CHAT_URL =
  "https://gateway.ai.cloudflare.com/v1/account/default/custom-deepinfra/v1/openai/chat/completions";

describe("workerd accepts the DeepInfra request inits", () => {
  it("accepts the catalog GET init", () => {
    const init = deepInfraCatalogRequestInit(AbortSignal.timeout(1_000));
    const request = new Request(CATALOG_URL, init);
    expect(request.method).toBe("GET");
    expect(request.redirect).toBe("manual");
    expect(request.headers.get("accept")).toBe("application/json");
    expect(request.headers.get("user-agent")).toBe(
      DEEPINFRA_CATALOG_USER_AGENT
    );
  });

  it("accepts the chat POST init", () => {
    const init = deepInfraChatRequestInit(
      new Headers({
        Authorization: "Bearer fixture",
        "Content-Type": "application/json"
      }),
      AbortSignal.timeout(1_000),
      JSON.stringify({ model: "zai-org/GLM-5.3-Flash" })
    );
    const request = new Request(CHAT_URL, init);
    expect(request.method).toBe("POST");
    expect(request.redirect).toBe("manual");
    expect(request.headers.get("authorization")).toBe("Bearer fixture");
  });
});
