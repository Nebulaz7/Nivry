# Hermes Runtime Adapter (`docs_report_v1`)

This directory holds the bounded task runner adapter for Nivry (`PLAN.md` §12).

## Scope
- **Supported Task Kind:** `docs_report_v1`
- **Input:** Sanitized local fixture directory (`fixtures/sample-repo/`).
- **Output:** Deterministic markdown documentation report and its lowercase hex SHA-256 hash (`output_sha256`).
- **Safety Boundaries:** No arbitrary remote repository cloning, no shell command injection, and no access to treasury keys or `.env` files.

