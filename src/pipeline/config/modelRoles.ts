import type { Db } from "../../shared/db/client";
import { getRoleModel, readConfig } from "../../shared/db/repos/roleModelsRepo";
import type { RoleModelConfig } from "../../shared/schemas/gateway";
import type { GatewayRole } from "../../shared/schemas/vocabulary";

/**
 * Story 3.2 — role→model resolution for the gateway.
 *
 * The single source of truth is the versioned `gateway_config` row in D1; this
 * module is the only place a `{ provider, model }` mapping is read from it. The
 * gateway never hardcodes a model id (architecture #Enforcement-Guidelines).
 */

/**
 * Resolve a role to its `{ provider, model }` mapping, or `null` when the role
 * has no mapping (the gateway maps `null` to a typed `role_not_configured`
 * error).
 */
export async function resolveRoleModel(
  db: Db,
  role: GatewayRole
): Promise<RoleModelConfig | null> {
  return getRoleModel(db, role);
}

/**
 * The fallback budget ceiling for Runs without their own `budget_cents`.
 * Returns `null` when no config row is recorded — the gateway reads that as
 * fail-closed (deny), never unlimited.
 */
export async function defaultBudgetCents(db: Db): Promise<number | null> {
  const config = await readConfig(db);
  return config?.defaultBudgetCents ?? null;
}
