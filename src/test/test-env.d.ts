/**
 * Test-only binding injected by vitest.config.ts via Miniflare.
 * `D1Migration` is the shape returned by readD1Migrations.
 */
type D1Migration = {
  name: string;
  queries: string[];
};

interface Env {
  TEST_MIGRATIONS?: D1Migration[];
}
