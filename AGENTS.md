# Project instructions

## Cloudflare credentials

Cloudflare Secrets Store is the project default for new secrets (Patrick's decision, 2026-10-04). Store credentials at account level with the required consumer scope, and bind only to the intended Worker/environment. Read Secrets Store bindings asynchronously with `.get()`; do not assume they are plain strings. Use local-only fixture credentials for tests. Never commit or log secret values.

Preserve existing per-Worker secrets until explicitly migrated; do not copy a credential into both systems by default. Non-sensitive configuration identifiers are not credentials. Staging remains `pml-build`; production remains `pml` until separately authorized cutover.

## Cursor Cloud specific instructions

Cloud agent builds run `bash .cursor/install.sh` from `.cursor/environment.json`. The script runs `npm ci`, installs `uv` 0.13.0 and `uvx` into `/usr/local/bin`, and installs a uv-managed Python 3.12. The binaries go on the default PATH because install and start are non-interactive login shells, where Ubuntu's `~/.bashrc` returns before a home-directory PATH edit would apply.

`bmad-create-story` and `bmad-dev-story` resolve customization with this command. `{project-root}` is the repository root. `{skill-root}` is `.agents/skills/bmad-create-story` or `.agents/skills/bmad-dev-story`:

```bash
uv run {project-root}/_bmad/scripts/resolve_customization.py --skill {skill-root} --project-root {project-root} --key workflow
```

The same command with `--key workflow.on_complete` runs when each workflow finishes. The script requires Python >= 3.11 (`tomllib`).

`.cursor/mcp.json` registers the Context7 stdio server the same way root `.mcp.json` does, with the package pinned (`npx -y @upstash/context7-mcp@4.3.0`). Cursor reads the API key from the environment as `${env:CONTEXT7_API_KEY}`. Set `CONTEXT7_API_KEY` in Cursor Secrets when authenticated quota is required. The key stays out of the repository.

Cloud Agents load MCP servers from the Cloud Agents UI. A committed `.cursor/mcp.json` configures the Cursor IDE. To give cloud agents Context7 (`resolve-library-id`, `query-docs`), add an HTTP server in the MCP menu at [cursor.com/agents](https://cursor.com/agents), or team-wide under Dashboard → Plugins & MCPs:

- Name: `context7` (use `context7-api-key` when the Context7 OAuth plugin is also installed, so the two servers do not share a name)
- Type: URL
- URL: `https://mcp.context7.com/mcp`
- Header name: `Context7-API-Key`
- Header value: the key from [context7.com/dashboard](https://context7.com/dashboard), pasted directly

Use the hyphenated header name. Cursor's cloud proxy drops header names that contain underscores. Enable the server, then start a new cloud agent so the tools are attached.

Once this checkout contains `.cursor/environment.json`, that file is the environment source and overrides a personal or team dashboard environment. Builds are created from the default branch, so `uv` is on new agents after this file is on `main` and a Cloud Agent build succeeds.
