import { applyD1Migrations, env } from "cloudflare:test";

/**
 * Apply pending D1 migrations before every workers-project test file.
 *
 * Setup files may run more than once; applyD1Migrations only applies
 * un-applied migrations, so it is safe to call here.
 * [Source: Cloudflare Vitest integration — applyD1Migrations]
 */

type TestEnv = {
  DB: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};

type D1Migration = {
  name: string;
  queries: string[];
};

const testEnv = env as unknown as TestEnv;
await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
