import {
  GatewayConfigSchema,
  RoleModelConfigSchema,
  type GatewayConfig,
  type RoleModelConfig
} from "../../schemas/gateway";
import type { GatewayRole } from "../../schemas/vocabulary";
import type { Db } from "../client";

/**
 * Story 3.2 — `gateway_config` repo. The versioned role→model config is a
 * singleton (`id = 'current'`, checked in DDL) — `readConfig` loads the whole
 * row, `getRoleModel` resolves one role to its `{ provider, model }`, and
 * `setRoleModel` writes a changed mapping with a version bump (the audited
 * change record). Snake_case rows in, camelCase Zod-mapped objects out.
 */

type GatewayConfigRow = {
  id: string;
  version: number;
  roles_json: string;
  default_budget_cents: number | null;
  updated_at: string;
};

function mapConfig(row: GatewayConfigRow): GatewayConfig {
  return GatewayConfigSchema.parse({
    id: row.id as "current",
    version: row.version,
    roles: JSON.parse(row.roles_json),
    defaultBudgetCents: row.default_budget_cents,
    updatedAt: row.updated_at
  });
}

export async function readConfig(db: Db): Promise<GatewayConfig | null> {
  const row = await db
    .prepare(
      `SELECT id, version, roles_json, default_budget_cents, updated_at
         FROM gateway_config WHERE id = 'current'`
    )
    .first<GatewayConfigRow>();
  return row ? mapConfig(row) : null;
}

/**
 * Resolve one role to its model mapping. Returns `null` when no config row
 * exists OR the role has no mapping — the caller distinguishes the two against
 * the gateway error vocabulary (`role_not_configured`).
 */
export async function getRoleModel(
  db: Db,
  role: GatewayRole
): Promise<RoleModelConfig | null> {
  const config = await readConfig(db);
  const mapping = config?.roles[role];
  if (!mapping) return null;
  return RoleModelConfigSchema.parse(mapping);
}

/**
 * Upsert a role→model mapping, bumping the singleton version. The whole
 * `roles` object is read-modify-written so unknown keys are dropped by the
 * Zod round-trip rather than persisted.
 */
export async function setRoleModel(
  db: Db,
  input: {
    role: GatewayRole;
    provider: string;
    model: string;
    updatedAt: string;
  }
): Promise<GatewayConfig> {
  const next = RoleModelConfigSchema.parse({
    provider: input.provider,
    model: input.model
  });
  const current = await readConfig(db);
  const roles = current
    ? { ...current.roles, [input.role]: next }
    : { [input.role]: next };
  const defaultBudgetCents = current?.defaultBudgetCents ?? null;

  // The version increment lives in the UPSERT's SET clause so concurrent
  // writers cannot clobber each other; the `roles` object above remains the
  // read-modify-written value (last write wins on content).
  await db
    .prepare(
      `INSERT INTO gateway_config
         (id, version, roles_json, default_budget_cents, updated_at)
       VALUES ('current', 1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         version = version + 1,
         roles_json = excluded.roles_json,
         default_budget_cents = excluded.default_budget_cents,
         updated_at = excluded.updated_at`
    )
    .bind(JSON.stringify(roles), defaultBudgetCents, input.updatedAt)
    .run();

  return readConfig(db) as Promise<GatewayConfig>;
}
