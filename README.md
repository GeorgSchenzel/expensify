# Expensify — Personal Finance Tracker

Self-hosted expense tracking with CSV import, rule-based auto-categorization and an
analytics dashboard. A Rust (axum + SQLite) JSON API with a React single-page frontend.

## Quick start

```bash
devenv shell          # or `direnv allow` once; provides rust, node, just, sqlite
just backend          # terminal 1: API on :3030
just frontend         # terminal 2: UI on http://localhost:5173
```

Then open the UI, create a few categories and rules under **Rules & Categories**, and
import [`examples/transactions.csv`](examples/transactions.csv) on the **Import CSV** page.
The fastest way to write rules is the **Categorize** page: uncategorized transactions,
grouped by merchant keyword, next to a rule builder that shows live how many transactions
the rule would categorize. Click a group or a suggested word to prefill the pattern, pick
(or create) a category, and press Enter; the rule is saved and applied at once. Rules can
also be run over existing transactions from **Rules & Categories → Apply rules**.

Production-style: `just start` builds everything and serves the UI and API together
from the backend at http://127.0.0.1:3030.

Without devenv you need Rust ≥ 1.85, Node ≥ 22.22 and [just](https://just.systems).

## Commands

| Command | Description |
|---|---|
| `just backend` | Backend API on :3030 |
| `just frontend` | Vite dev server with hot reload on :5173 (proxies `/api` to the backend) |
| `just build` | Release binary + frontend bundle |
| `just start` | Build, then serve the whole app from the backend |
| `just test` | Backend unit and API tests |
| `just check` | `cargo fmt --check`, clippy (`-D warnings`), TypeScript |
| `just import-legacy [path]` | Copy data from the old Next.js app's database (default `old/data/sqlite.db`); idempotent |
| `just reset-db` | Delete the local database (asks first) |
| `devenv up` | Runs backend and frontend together as devenv processes |

## Configuration

Environment variables (set automatically by the justfile and devenv):

| Variable | Default | |
|---|---|---|
| `DATABASE_URL` | `sqlite://<repo>/data/fin.db` | Created with its directory on first start; migrations run automatically |
| `BIND_ADDR` | `127.0.0.1:3030` | Backend listen address |
| `STATIC_DIR` | — | If set, the backend also serves the built frontend (SPA fallback) |
| `RUST_LOG` | `info,sqlx=warn` | Log filter |

## Architecture

```
backend/                 Rust: axum, sqlx (SQLite), embedded migrations
  migrations/            schema (applied on startup)
  src/money.rs           exact amount parsing → integer cents
  src/csv_import.rs      row → transaction: dates, amounts, currency, dedup hash
  src/rules_engine.rs    CONTAINS / REGEX rules, first match wins
  src/routes/            REST handlers under /api
  src/legacy.rs          importer for the old app's database
frontend/                Vite + React 19, TanStack Query/Table, Recharts, shadcn/ui
examples/transactions.csv
old/                     the original Next.js app (reference only)
```

### API

| Method & path | |
|---|---|
| `GET /api/categories` · `POST` · `PUT /{id}` · `DELETE /{id}` | Deleting a category removes its rules and uncategorizes its transactions |
| `GET /api/rules` · `POST` · `DELETE /{id}` · `PUT /api/rules/order` | Order is a full list of rule ids |
| `POST /api/rules/preview` | `{ pattern, type, isCaseInsensitive }` → what a new rule would match right now (dry run, same matcher as import) |
| `POST /api/rules/apply` | `{ "includeCategorized": false }` → runs rules over existing transactions; by default only uncategorized ones, never clears a category |
| `GET /api/transactions?from&to&cat&uncategorized&amountMin&amountMax&search` | Dates `yyyy-MM-dd`, inclusive; `cat` repeatable; `uncategorized=true` |
| `GET /api/transactions/stats` | `{ total, uncategorized }` |
| `PATCH /api/transactions/{id}` · `POST /api/transactions/bulk-category` | `{ "categoryId": id \| null }` |
| `POST /api/import` | `{ rows, mapping }` → `{ inserted, skipped, errors }` |
| `GET /api/dashboard?from&to&cat&groupBy=week\|month\|year` | Totals, pie, stacked bars, monthly/yearly trend lines |

Errors are always `{ "error": "message" }` with a 4xx/5xx status.

### Import pipeline

The browser parses the CSV (PapaParse; UTF-8 or Windows-1252, comma or semicolon) for the
preview and column mapping, then sends rows plus mapping to `POST /api/import`. The
backend parses dates and amounts, hashes `date__amount__description` (SHA-256, identical to
the old app so migrated data still deduplicates), applies rules in priority order and
inserts in a single transaction, skipping known hashes.

- **Dates:** `yyyy-MM-dd` (optionally followed by a time), `dd.MM.yyyy`, `dd/MM/yyyy`.
  Stored as calendar dates, so no time-zone shifts.
- **Amounts:** `-1.234,56`, `1,234.56`, `€ 12,50`, `12,50-`, `(12.50)` and similar. Stored
  as integer cents. Ambiguous values like `1.000` and values with more than two decimals
  are reported as row errors instead of being guessed.
- **Credit/debit mode:** credit → positive, debit → negative, whatever sign the cell has.

## Example data

`examples/transactions.csv` holds fictional transactions from May to October 2026. Rules
that categorize most of them:

| Pattern | Type | Category |
|---|---|---|
| `billa\|spar\|hofer\|lidl` | REGEX | Groceries |
| `restaurant`, `café`, `pizzeria`, `sushi` | CONTAINS | Dining |
| `netflix`, `spotify` | CONTAINS | Subscriptions |
| `rent` | CONTAINS | Housing |
| `wiener linien\|öbb` | REGEX | Transport |
