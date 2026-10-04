# Project instructions

## Cloudflare credentials

Cloudflare Secrets Store is the project default for new secrets (Patrick's decision, 2026-10-04). Store credentials at account level with the required consumer scope, and bind only to the intended Worker/environment. Read Secrets Store bindings asynchronously with `.get()`; do not assume they are plain strings. Use local-only fixture credentials for tests. Never commit or log secret values.

Preserve existing per-Worker secrets until explicitly migrated; do not copy a credential into both systems by default. Non-sensitive configuration identifiers are not credentials. Staging remains `pml-build`; production remains `pml` until separately authorized cutover.
