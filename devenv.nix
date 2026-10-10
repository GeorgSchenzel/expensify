# Development environment: `devenv shell` for a shell with every tool,
# `devenv up` to run backend and frontend together.
{ pkgs, config, ... }:

{
  packages = [
    pkgs.just
    pkgs.sqlite # inspect the database: sqlite3 data/fin.db
  ];

  # Rust toolchain from nixpkgs: rustc, cargo, clippy, rustfmt, rust-analyzer.
  languages.rust.enable = true;

  # react-router 8 requires Node >= 22.22.
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_24;
    npm.enable = true;
  };

  env = {
    DATABASE_URL = "sqlite://${config.devenv.root}/data/fin.db";
    BIND_ADDR = "127.0.0.1:3030";
    BACKEND_URL = "http://127.0.0.1:3030";
    RUST_LOG = "info,sqlx=warn";
  };

  processes = {
    backend.exec = "cd ${config.devenv.root}/backend && cargo run";
    frontend.exec = "cd ${config.devenv.root}/frontend && npm ci --no-audit --no-fund && npm run dev";
  };

  enterShell = ''
    echo "Expensify dev shell — run 'just' to list commands."
    echo "  rust $(rustc --version | cut -d' ' -f2) · node $(node --version) · just $(just --version | cut -d' ' -f2)"
  '';

  enterTest = ''
    just check
    just test
  '';
}
