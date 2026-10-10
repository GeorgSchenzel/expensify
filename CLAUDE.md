# CLAUDE.md

Personal finance tracker: Rust API in `backend/`, React SPA in `frontend/`. `old/` is the
original Next.js app, kept for reference only. Do not edit it.

## Commands

`just backend` + `just frontend` (two terminals), `just test`, `just check` (fmt, clippy -D warnings, tsc). Run
`just check && just test` before calling a change done. Tools come from `devenv shell`.

## Invariants

- **Money is integer cents** (`amount_cents`). The API exposes `amount` as a decimal number;
  convert only in `money.rs`. Never parse amounts with floats.
- **Dates are calendar dates** stored as `yyyy-MM-dd` text. Frontend helpers `toDateKey` /
  `fromDateKey` convert to local Dates; never use `toISOString()` for dates (time-zone shift).
- **Dedup hash** (`csv_import::transaction_hash`) must stay byte-compatible with the old app:
  `{yyyy-MM-dd}T00:00:00.000Z__{js number string}__{trimmed description}`. Changing it
  re-imports every previously seen transaction.
- **Rule order** is `priority ASC` (ties: `created_at`, `id`); first match wins. Reorder
  requests must list every rule id, otherwise the API returns 409.
- Regexes use the Rust `regex` crate (no look-around/backreferences); rule creation
  validates with the same builder the importer uses.
- Chart series are keyed by **category id** (`__uncategorized__` for none), never by name.
- Dashboard aggregates are computed in memory in `routes/dashboard.rs` (comparisons, pace and
  recurring detection need data outside the range). Income ignores the category filter. The
  flow chart folds small categories into a frontend-only `__other__` series.
- Schema changes: add a new file in `backend/migrations/`; never edit an applied migration.

## Frontend

- Server state goes through TanStack Query (`src/lib/queries.ts`); after a mutation,
  invalidate the affected keys with `useInvalidate()`.
- Filter state lives in URL search params.
- The Categorize page's match counts come from `POST /api/rules/preview` (backend matcher).
  `lib/grouping.ts` and `Highlight` are display-only heuristics; never derive counts from them.
- `components/ui/` are shadcn components (Tailwind v4 syntax: `max-h-(--var)`, not
  `max-h-[--var]`). `date-range-picker.tsx` deliberately uses `mode="single"` with custom
  range modifiers; react-day-picker's range mode blocks the nav arrows.
