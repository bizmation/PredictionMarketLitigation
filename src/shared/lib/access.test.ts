import { SignJWT, exportJWK, generateKeyPair } from "jose";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import { resolveOperator, verifyOperator } from "./access";

/**
 * Access verification tests — no network, no CLOUDFLARE_API_TOKEN.
 *
 * Keys are minted locally and the JWKS endpoint is served by a stubbed fetch,
 * so this file runs in the "workers" project on a machine with zero cloud
 * credentials. That invariant is load-bearing: commit b3dc307 added
 * wrangler.test.jsonc specifically so the whole suite runs offline. Do not
 * introduce a test here that reaches Cloudflare.
 *
 * Each `describe` that needs a distinct JWKS response uses a distinct team
 * domain, because verifyOperator caches one remote key set per domain at
 * module scope (creating it per request would defeat jose's own cache).
 *
 * For the same reason keys are minted once per describe in `beforeAll`, not
 * per test: the cache is keyed by team domain and jose will not refetch after
 * the first resolution, so regenerating keys between tests in one domain would
 * leave later tokens signed by a key the cache has never seen. A real Access
 * team domain has a stable key set — this mirrors that.
 */

const AUD = "test-application-aud-tag";
const OPERATOR = "patrick@example.com";

type Keys = {
  privateKey: CryptoKey;
  jwk: Record<string, unknown>;
  kid: string;
};

async function makeKeys(kid: string): Promise<Keys> {
  const { publicKey, privateKey } = await generateKeyPair("RS256", {
    extractable: true
  });
  const jwk = (await exportJWK(publicKey)) as Record<string, unknown>;
  jwk.kid = kid;
  jwk.alg = "RS256";
  jwk.use = "sig";
  return { privateKey, jwk, kid };
}

/** URLs the stubbed fetch was asked for — asserted in "JWKS endpoint". */
const fetchedUrls: string[] = [];

function stubJwks(keys: Array<Record<string, unknown>>) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    fetchedUrls.push(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    );
    return Response.json(
      { keys },
      { headers: { "content-type": "application/json" } }
    );
  });
}

function stubJwksFailure() {
  vi.stubGlobal("fetch", async () => {
    throw new Error("network down");
  });
}

type TokenOptions = {
  email?: string;
  issuer?: string;
  audience?: string;
  expiresIn?: string | number;
  notBefore?: string | number;
};

async function mintToken(keys: Keys, team: string, opts: TokenOptions = {}) {
  const jwt = new SignJWT({ email: opts.email ?? OPERATOR })
    .setProtectedHeader({ alg: "RS256", kid: keys.kid })
    .setIssuer(opts.issuer ?? team)
    .setAudience(opts.audience ?? AUD)
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? "1h");
  if (opts.notBefore !== undefined) jwt.setNotBefore(opts.notBefore);
  return jwt.sign(keys.privateKey);
}

function envFor(team: string, overrides: Partial<Env> = {}): Env {
  return {
    TEAM_DOMAIN: team,
    POLICY_AUD: AUD,
    OPERATOR_EMAIL: OPERATOR,
    ...overrides
  } as Env;
}

function requestWithHeader(token: string): Request {
  return new Request("https://pml.example.com/api/admin/ping", {
    headers: { "cf-access-jwt-assertion": token }
  });
}

function requestWithCookie(token: string): Request {
  return new Request("https://pml.example.com/api/admin/ping", {
    headers: { cookie: `CF_Authorization=${token}; other=x` }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyOperator — happy path", () => {
  const TEAM = "https://happy.cloudflareaccess.com";
  let keys: Keys;

  beforeAll(async () => {
    keys = await makeKeys("happy-1");
  });
  beforeEach(() => stubJwks([keys.jwk]));

  it("accepts a valid operator token from the header", async () => {
    const token = await mintToken(keys, TEAM);
    const operator = await verifyOperator(
      requestWithHeader(token),
      envFor(TEAM)
    );
    expect(operator).toEqual({ email: OPERATOR, displayName: "Patrick" });
  });

  it("accepts a valid operator token from the CF_Authorization cookie", async () => {
    const token = await mintToken(keys, TEAM);
    const operator = await verifyOperator(
      requestWithCookie(token),
      envFor(TEAM)
    );
    expect(operator?.email).toBe(OPERATOR);
  });

  it("matches the operator email case-insensitively", async () => {
    const token = await mintToken(keys, TEAM, { email: "PATRICK@Example.COM" });
    const operator = await verifyOperator(
      requestWithHeader(token),
      envFor(TEAM)
    );
    expect(operator).not.toBeNull();
  });

  it("uses the configured display name, never the email", async () => {
    const token = await mintToken(keys, TEAM);
    const operator = await verifyOperator(
      requestWithHeader(token),
      envFor(TEAM, { OPERATOR_DISPLAY_NAME: "P. Bland" } as Partial<Env>)
    );
    expect(operator?.displayName).toBe("P. Bland");
    expect(operator?.displayName).not.toContain("@");
  });
});

describe("verifyOperator — rejects invalid tokens (AC2)", () => {
  const TEAM = "https://reject.cloudflareaccess.com";
  let keys: Keys;

  beforeAll(async () => {
    keys = await makeKeys("reject-1");
  });
  beforeEach(() => stubJwks([keys.jwk]));

  it("rejects an expired token", async () => {
    const token = await mintToken(keys, TEAM, { expiresIn: "-1h" });
    expect(
      await verifyOperator(requestWithHeader(token), envFor(TEAM))
    ).toBeNull();
  });

  it("rejects a token not yet valid (nbf in the future)", async () => {
    const token = await mintToken(keys, TEAM, { notBefore: "1h" });
    expect(
      await verifyOperator(requestWithHeader(token), envFor(TEAM))
    ).toBeNull();
  });

  it("rejects a token minted for a different application (wrong aud)", async () => {
    const token = await mintToken(keys, TEAM, {
      audience: "some-other-app-aud"
    });
    expect(
      await verifyOperator(requestWithHeader(token), envFor(TEAM))
    ).toBeNull();
  });

  it("rejects a token from a different issuer", async () => {
    const token = await mintToken(keys, TEAM, {
      issuer: "https://attacker.cloudflareaccess.com"
    });
    expect(
      await verifyOperator(requestWithHeader(token), envFor(TEAM))
    ).toBeNull();
  });

  it("rejects an unsigned alg:none token", async () => {
    const b64 = (o: unknown) =>
      btoa(JSON.stringify(o))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    const token = `${b64({ alg: "none", kid: keys.kid })}.${b64({
      email: OPERATOR,
      iss: TEAM,
      aud: AUD,
      exp: Math.floor(Date.now() / 1000) + 3600
    })}.`;
    expect(
      await verifyOperator(requestWithHeader(token), envFor(TEAM))
    ).toBeNull();
  });

  it("rejects a token signed by an unknown key", async () => {
    const attacker = await makeKeys("attacker-1");
    const token = await mintToken(attacker, TEAM);
    expect(
      await verifyOperator(requestWithHeader(token), envFor(TEAM))
    ).toBeNull();
  });

  it("rejects a malformed token", async () => {
    expect(
      await verifyOperator(requestWithHeader("not-a-jwt"), envFor(TEAM))
    ).toBeNull();
  });

  it("rejects when no token is present at all", async () => {
    const bare = new Request("https://pml.example.com/api/admin/ping");
    expect(await verifyOperator(bare, envFor(TEAM))).toBeNull();
  });

  it("rejects when a cookie header exists but carries no CF_Authorization", async () => {
    const req = new Request("https://pml.example.com/api/admin/ping", {
      headers: { cookie: "session=abc; theme=dark" }
    });
    expect(await verifyOperator(req, envFor(TEAM))).toBeNull();
  });
});

describe("verifyOperator — identity allowlist (AC3)", () => {
  const TEAM = "https://allowlist.cloudflareaccess.com";
  let keys: Keys;

  beforeAll(async () => {
    keys = await makeKeys("allow-1");
  });
  beforeEach(() => stubJwks([keys.jwk]));

  it("rejects a cryptographically valid token for a non-operator identity", async () => {
    const token = await mintToken(keys, TEAM, {
      email: "someone.else@example.com"
    });
    expect(
      await verifyOperator(requestWithHeader(token), envFor(TEAM))
    ).toBeNull();
  });

  it("rejects a valid token carrying no email claim", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: keys.kid })
      .setIssuer(TEAM)
      .setAudience(AUD)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(keys.privateKey);
    expect(
      await verifyOperator(requestWithHeader(token), envFor(TEAM))
    ).toBeNull();
  });
});

describe("verifyOperator — fails closed on misconfiguration", () => {
  const TEAM = "https://misconfig.cloudflareaccess.com";

  it("rejects when TEAM_DOMAIN is missing", async () => {
    const keys = await makeKeys("mis-1");
    stubJwks([keys.jwk]);
    const token = await mintToken(keys, TEAM);
    const env = envFor(TEAM, { TEAM_DOMAIN: undefined } as Partial<Env>);
    expect(await verifyOperator(requestWithHeader(token), env)).toBeNull();
  });

  it("rejects when POLICY_AUD is missing", async () => {
    const keys = await makeKeys("mis-2");
    stubJwks([keys.jwk]);
    const token = await mintToken(keys, TEAM);
    const env = envFor(TEAM, { POLICY_AUD: undefined } as Partial<Env>);
    expect(await verifyOperator(requestWithHeader(token), env)).toBeNull();
  });

  it("rejects when OPERATOR_EMAIL is missing", async () => {
    const keys = await makeKeys("mis-3");
    stubJwks([keys.jwk]);
    const token = await mintToken(keys, TEAM);
    const env = envFor(TEAM, { OPERATOR_EMAIL: undefined } as Partial<Env>);
    expect(await verifyOperator(requestWithHeader(token), env)).toBeNull();
  });

  it("returns null rather than throwing when the JWKS fetch fails", async () => {
    const failTeam = "https://jwks-down.cloudflareaccess.com";
    const keys = await makeKeys("mis-4");
    const token = await mintToken(keys, failTeam);
    stubJwksFailure();
    await expect(
      verifyOperator(requestWithHeader(token), envFor(failTeam))
    ).resolves.toBeNull();
  });
});

describe("verifyOperator — JWKS endpoint", () => {
  const TEAM = "https://jwks-url.cloudflareaccess.com";

  it("fetches the Access certs path, not some other URL", async () => {
    const keys = await makeKeys("url-1");
    fetchedUrls.length = 0;
    stubJwks([keys.jwk]);
    const token = await mintToken(keys, TEAM);
    await verifyOperator(requestWithHeader(token), envFor(TEAM));

    expect(fetchedUrls.length).toBeGreaterThan(0);
    expect(fetchedUrls[0]).toBe(`${TEAM}/cdn-cgi/access/certs`);
  });

  it("strips a trailing slash from TEAM_DOMAIN rather than locking the operator out", async () => {
    const sloppy = "https://trailing.cloudflareaccess.com";
    const keys = await makeKeys("url-2");
    fetchedUrls.length = 0;
    stubJwks([keys.jwk]);
    // The token's iss has no trailing slash — the secret does.
    const token = await mintToken(keys, sloppy);
    const operator = await verifyOperator(
      requestWithHeader(token),
      envFor(sloppy, { TEAM_DOMAIN: `${sloppy}/` } as Partial<Env>)
    );

    expect(operator).not.toBeNull();
    expect(fetchedUrls[0]).toBe(`${sloppy}/cdn-cgi/access/certs`);
  });

  it("tolerates whitespace around OPERATOR_EMAIL", async () => {
    const team = "https://ws.cloudflareaccess.com";
    const keys = await makeKeys("url-3");
    stubJwks([keys.jwk]);
    const token = await mintToken(keys, team);
    const operator = await verifyOperator(
      requestWithHeader(token),
      envFor(team, { OPERATOR_EMAIL: `  ${OPERATOR}\n` } as Partial<Env>)
    );
    expect(operator).not.toBeNull();
  });
});

describe("verifyOperator — CSRF: cookies never authorize a mutation", () => {
  const TEAM = "https://csrf.cloudflareaccess.com";
  let keys: Keys;

  beforeAll(async () => {
    keys = await makeKeys("csrf-1");
  });
  beforeEach(() => stubJwks([keys.jwk]));

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "rejects a cookie-only %s — the browser attaches it cross-site",
    async (method) => {
      const token = await mintToken(keys, TEAM);
      const req = new Request("https://pml.example.com/api/admin/approve", {
        method,
        headers: { cookie: `CF_Authorization=${token}` }
      });
      expect(await verifyOperator(req, envFor(TEAM))).toBeNull();
    }
  );

  it("accepts the same mutation when the token arrives as a header", async () => {
    const token = await mintToken(keys, TEAM);
    const req = new Request("https://pml.example.com/api/admin/approve", {
      method: "POST",
      headers: { "cf-access-jwt-assertion": token }
    });
    expect(await verifyOperator(req, envFor(TEAM))).not.toBeNull();
  });

  it("still accepts a cookie for a safe GET", async () => {
    const token = await mintToken(keys, TEAM);
    expect(
      await verifyOperator(requestWithCookie(token), envFor(TEAM))
    ).not.toBeNull();
  });
});

describe("verifyOperator — cookie shadowing", () => {
  const TEAM = "https://shadow.cloudflareaccess.com";
  let keys: Keys;

  beforeAll(async () => {
    keys = await makeKeys("shadow-1");
  });
  beforeEach(() => stubJwks([keys.jwk]));

  it("finds a valid cookie sitting behind an empty shadowing one", async () => {
    // Anything able to set a cookie on a parent domain could otherwise lock
    // the sole operator out permanently.
    const token = await mintToken(keys, TEAM);
    const req = new Request("https://pml.example.com/api/admin/ping", {
      headers: { cookie: `CF_Authorization=; CF_Authorization=${token}` }
    });
    expect(await verifyOperator(req, envFor(TEAM))).not.toBeNull();
  });

  it("finds a valid cookie behind a garbage shadowing one", async () => {
    const token = await mintToken(keys, TEAM);
    const req = new Request("https://pml.example.com/api/admin/ping", {
      headers: {
        cookie: `CF_Authorization=not-a-jwt; CF_Authorization=${token}`
      }
    });
    expect(await verifyOperator(req, envFor(TEAM))).not.toBeNull();
  });
});

describe("verifyOperator — dev bypass gating (AC7)", () => {
  const TEAM = "https://bypass.cloudflareaccess.com";

  it("returns the stub operator when ACCESS_DEV_BYPASS is exactly 'true'", async () => {
    const bare = new Request("https://localhost/api/admin/ping");
    const env = envFor(TEAM, { ACCESS_DEV_BYPASS: "true" } as Partial<Env>);
    const operator = await verifyOperator(bare, env);
    expect(operator).toEqual({ email: OPERATOR, displayName: "Patrick" });
  });

  it.each([
    "https://pml.example.com/api/admin/ping",
    "https://abc.trycloudflare.com/api/admin/ping",
    "https://pml.someone.workers.dev/api/admin/ping"
  ])("does not bypass for the non-loopback host %s", async (url) => {
    // `wrangler dev --tunnel-name=...` loads .dev.vars AND publishes the dev
    // server publicly. Without this gate that combination hands full operator
    // rights to any caller.
    const env = envFor(TEAM, { ACCESS_DEV_BYPASS: "true" } as Partial<Env>);
    expect(await verifyOperator(new Request(url), env)).toBeNull();
  });

  it.each(["127.0.0.1", "[::1]"])(
    "bypasses on loopback host %s",
    async (host) => {
      const env = envFor(TEAM, { ACCESS_DEV_BYPASS: "true" } as Partial<Env>);
      const req = new Request(`http://${host}:5173/api/admin/ping`);
      expect(await verifyOperator(req, env)).not.toBeNull();
    }
  );

  it.each(["false", "1", "TRUE", "yes", ""])(
    "does not bypass when ACCESS_DEV_BYPASS is %o",
    async (value) => {
      const bare = new Request("https://localhost/api/admin/ping");
      const env = envFor(TEAM, { ACCESS_DEV_BYPASS: value } as Partial<Env>);
      expect(await verifyOperator(bare, env)).toBeNull();
    }
  );

  it("does not bypass when ACCESS_DEV_BYPASS is absent", async () => {
    const bare = new Request("https://localhost/api/admin/ping");
    expect(await verifyOperator(bare, envFor(TEAM))).toBeNull();
  });
});

describe("resolveOperator — diagnostic reasons (private logs only)", () => {
  const TEAM = "https://reasons.cloudflareaccess.com";
  let keys: Keys;

  beforeAll(async () => {
    keys = await makeKeys("reason-1");
  });
  beforeEach(() => stubJwks([keys.jwk]));

  it("reports no-token when nothing is presented", async () => {
    const res = await resolveOperator(
      new Request("https://pml.example.com/api/admin/ping"),
      envFor(TEAM)
    );
    expect(res).toEqual({ operator: null, reason: "no-token" });
  });

  it("reports not-configured when a secret is missing", async () => {
    const token = await mintToken(keys, TEAM);
    const res = await resolveOperator(
      requestWithHeader(token),
      envFor(TEAM, { POLICY_AUD: undefined } as Partial<Env>)
    );
    expect(res).toEqual({ operator: null, reason: "not-configured" });
  });

  it("reports expired distinctly from a bad signature", async () => {
    const expired = await mintToken(keys, TEAM, { expiresIn: "-1h" });
    const res = await resolveOperator(requestWithHeader(expired), envFor(TEAM));
    expect(res).toEqual({ operator: null, reason: "expired" });
  });

  it("reports claim-mismatch for a wrong audience", async () => {
    const token = await mintToken(keys, TEAM, { audience: "other-app" });
    const res = await resolveOperator(requestWithHeader(token), envFor(TEAM));
    expect(res).toEqual({ operator: null, reason: "claim-mismatch" });
  });

  it("reports unknown-key for a token signed by a stranger", async () => {
    const attacker = await makeKeys("attacker-2");
    const token = await mintToken(attacker, TEAM);
    const res = await resolveOperator(requestWithHeader(token), envFor(TEAM));
    expect(res).toEqual({ operator: null, reason: "unknown-key" });
  });

  it("reports wrong-identity for a valid token that is not the operator", async () => {
    const token = await mintToken(keys, TEAM, { email: "other@example.com" });
    const res = await resolveOperator(requestWithHeader(token), envFor(TEAM));
    expect(res).toEqual({ operator: null, reason: "wrong-identity" });
  });

  it("never carries the token or the email in the result", async () => {
    const token = await mintToken(keys, TEAM, { email: "other@example.com" });
    const res = await resolveOperator(requestWithHeader(token), envFor(TEAM));
    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain("other@example.com");
  });
});
