# Expensify — personal finance tracker (Rust backend + React frontend).
# Run `just` to list recipes. Inside `devenv shell` every tool is provided.

set shell := ["bash", "-euo", "pipefail", "-c"]

root := justfile_directory()

# Absolute path, so the database is the same no matter which directory a command runs in.
export DATABASE_URL := env("DATABASE_URL", "sqlite://" + root / "data" / "fin.db")
export BIND_ADDR := env("BIND_ADDR", "127.0.0.1:3030")
export BACKEND_URL := "http://" + BIND_ADDR

# List available recipes
default:
    @just --list --unsorted

# Install frontend dependencies (exactly as locked)
install:
    cd frontend && npm ci

# Run the backend API on :3030
backend:
    cd backend && cargo run

# Run the frontend dev server on :5173 (proxies /api to the backend)
frontend: _ensure-deps
    cd frontend && npm run dev

# Build the optimised backend binary and the frontend bundle
build: _ensure-deps
    cd frontend && npm run build
    cd backend && cargo build --release

# Build, then serve the whole app from the backend at http://$BIND_ADDR
start: build
    STATIC_DIR="{{ root }}/frontend/dist" "{{ root }}/backend/target/release/fin-backend"

# Run all tests
test:
    cd backend && cargo test

# Formatting, lints and type checks (what CI should run)
check: _ensure-deps
    cd backend && cargo fmt --check
    cd backend && cargo clippy --all-targets -- -D warnings
    cd frontend && npm run typecheck

# Format the Rust code
fmt:
    cd backend && cargo fmt

# Copy data from the old Next.js app's SQLite database (safe to run repeatedly)
import-legacy path=(root / "old" / "data" / "sqlite.db"):
    cd backend && cargo run -- import-legacy "{{ absolute_path(path) }}"

# Delete the local database (asks for confirmation)
[confirm("Delete the local database? This cannot be undone.")]
reset-db:
    rm -f "{{ root }}/data/fin.db" "{{ root }}/data/fin.db-wal" "{{ root }}/data/fin.db-shm"

# Remove build artefacts
clean:
    cd backend && cargo clean
    rm -rf frontend/dist

_ensure-deps:
    @[ -d frontend/node_modules ] || (cd frontend && npm ci)
