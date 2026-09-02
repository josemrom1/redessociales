# Social Posting Pipeline (GitHub Actions)

This repository includes a complete GitHub Actions pipeline that generates social post text with Gemini and publishes through a platform adapter (Buffer implemented), with safe dry-run support.

## Required secrets

Set these in **Repository Settings → Secrets and variables → Actions**:

1. `GEMINI_API_KEY`
2. `BUFFER_ACCESS_TOKEN`
3. `BUFFER_PROFILE_ID`

Optional repository variable:

1. `GEMINI_MODEL` (default: `gemini-1.5-flash`)

## Workflow

File: `.github/workflows/social-posting.yml`

Triggers:

1. Daily schedule (`0 8 * * *`) — runs in dry-run mode by default.
2. Manual dispatch with inputs:
   - `dry_run` (boolean)
   - `platform` (currently `buffer`)
   - `prompt_key` (from `config/prompts.json`)
   - `topic` (optional override)

## Local run

```powershell
$env:GEMINI_API_KEY="your-key"
$env:BUFFER_ACCESS_TOKEN="your-buffer-token"
$env:BUFFER_PROFILE_ID="your-buffer-profile-id"
node scripts/social-pipeline.js --dry-run --platform buffer --prompt-key daily-default --topic "AI productivity"
```

Output artifacts are written to `output/` as JSON logs.

## Safe testing (recommended)

Use dry-run mode first:

1. Manually trigger workflow with `dry_run=true`, or
2. Run locally with `--dry-run`.

The script fails loudly when required secrets are missing or when API/publish requests fail.

## Config files

1. `config/prompts.json`: named prompt templates.
2. `config/platform-limits.json`: per-platform post length limits.

## Adapter design

Publisher selection goes through `getPublisherAdapter(platform)` in `scripts/social-pipeline.js`. `buffer` is implemented; additional platforms can be added by introducing another publisher function and wiring it in the adapter selector.
