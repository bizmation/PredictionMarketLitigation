# US state geometry

Vendored from [us-atlas 3.0.1](https://github.com/topojson/us-atlas/releases/tag/v3.0.1)
`states-10m.json` (Census 2017 cartographic states, quantized).

This is **not** `states-albers-10m.json`. That file is already projected to
975×610; `geoAlbersUsa().fitSize` would double-project it.

Source: https://github.com/topojson/us-atlas/blob/v3.0.1/states-10m.json

Fills join on `properties.name` (e.g. `"New Jersey"`, `"District of Columbia"`).
Feature `id` is two-digit FIPS and is unused — the seed has no FIPS column.

Served as `/geo/states-10m.json`. That path is not in Wrangler
`run_worker_first`; Cloudflare serves it as a static asset.
