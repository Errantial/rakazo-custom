# Custom Rakazo development

## Start here

This checkout comes from https://github.com/elie222/rakazo at commit
`5e8ed855fe950ec5ffa03a94eb166ec71d69b736` (2026-10-30 setup).
Custom work starts on `custom/development`. The original repository is the
`upstream` remote. `origin` also fetches upstream because the development runner
requires `origin/main`; its push URL is disabled. No personal fork has been configured.

```bash
pnpm install --frozen-lockfile
pnpm sandbox:build
./scripts/dev-local.sh
```

The launcher clears inherited database URLs so this checkout uses its own `.env`.
Plain `pnpm dev` gives shell variables precedence; avoid it when the shell has
another project's `DATABASE_URL`.

Open the URL printed by `pnpm dev` (normally http://127.0.0.1:5173).
Create your own account and connect a model during onboarding. No model or
third-party service credentials have been configured. Stop development with Ctrl-C.
The API, worker, web UI, and sandbox supervisor are launched together.

The ignored `.env` contains independent random local credentials and is mode 0600.
Never commit it. Keep `ENCRYPTION_KEY` and database backups together securely;
changing that key can make stored credentials unreadable. `.env.example` documents
optional services. Keep API and worker configuration consistent.

Postgres is managed with the source Compose stack, published only at
127.0.0.1:55433. The runtime login is `rakazo_app`; migrations use the separate
owner login. `pnpm dev` generates Prisma and applies migrations automatically.

```bash
# Start the configured database after stopping it:
docker compose --env-file .env \
  -f infra/compose/docker-compose.yml \
  -f infra/compose/docker-compose.postgres-host.yml up postgres -d
# Stop without deleting database data:
docker compose --env-file .env \
  -f infra/compose/docker-compose.yml stop postgres
```

Avoid `pnpm compose:down`: it includes `-v` and deletes database volumes.
If the configured database is unreachable, `pnpm dev` falls back to a separate
shared development Postgres container on port 54318; check its startup output.
Do not assume that fallback database contains the data from the configured one.

## Where to customize

- `apps/web`: React/Vite product UI, also hosted by Electron.
- `apps/api`, `apps/worker`: HTTP/auth and background execution.
- `apps/desktop`: Electron shell; use Existing instance to connect to this dev stack.
- `apps/mobile`: Expo client; native builds need their platform SDKs and signing.
- `apps/www`: separate Astro marketing site.
- `packages/core`, `packages/contracts`: shared domain behavior and contracts.
- `packages/db`: Prisma schema, persistence, row-level security, and migrations.
- `packages/adapters`, `packages/adapter-kit`: model/computer/service boundaries.
- `packages/ui-tokens`, `packages/ui-web`, `packages/chat-ui`: shared design system.
- `infra/sandboxes/computer`: Docker computer image; rebuild after changing it.

Read `AGENTS.md` and `CONTRIBUTING.md` before changes. Keep common behavior in
shared packages and account for web, desktop, and mobile. Preserve optional,
provider-neutral integrations; test emulators are not a production runtime.
Use semantic UI tokens rather than hardcoded product colors.
Database migrations must work with the previous release during rolling upgrades;
follow the deferred drop rules in `AGENTS.md`.

## Checks

```bash
pnpm lint
pnpm check --concurrency=1
pnpm test
pnpm build
# Docker-dependent product checks:
pnpm test:integration
pnpm test:e2e
```

Prefer targeted checks while iterating. Default unit tests are offline; live
canaries/evals require explicit setup and can cost money. Desktop E2E opens real
windows; leave routine desktop E2E to CI. Production and mobile/desktop packaging
need additional platform configuration; see the release guides in `docs/`.

## Keep a custom version maintainable

When ready, point `origin` at your own fork and replace its disabled push URL:

```bash
git remote set-url origin https://github.com/YOUR_ACCOUNT/YOUR_FORK.git
git remote set-url --push origin https://github.com/YOUR_ACCOUNT/YOUR_FORK.git
git push -u origin custom/development
```

Keep `origin/main` current: the dev runner uses it to detect branch-only migrations.
Use `git fetch upstream` and review/merge upstream changes deliberately, especially
migrations and changes to `.env.example`. Keep custom changes focused and committed.
Do not run the production updater over a custom checkout without reviewing its
behavior; published upstream images do not include your source changes.

Retain upstream license and attribution notices when distributing modified code;
review `LICENSE` and use your own branding and release identities for the custom
product. Check desktop bundle IDs, mobile app IDs, OAuth redirects, deep links,
update channels, domains, and signing configuration before distributing builds.

## Original server setup (historical)

Node 24 is installed; pnpm 9.15.0 is installed under `~/.local/bin` (on PATH).
Docker Engine and Compose are installed as system services. Docker access is
provided through a socket ACL and a `docker.socket` systemd drop-in. This access
is powerful; only trusted code should use the Docker socket.

The root filesystem is small. Dependency storage and Docker/containerd data use
`/mnt/data/rakazo-development` on the larger data disk. Root `node_modules` is a bind mount (persisted in `/etc/fstab`), and
pnpm uses a store there via the user configuration in `~/.config/pnpm/rc`. These are machine-local choices,
not repository requirements; a fresh clone elsewhere uses normal storage.
Docker configuration is in `/etc/docker/daemon.json`; containerd storage is set
in `/etc/containerd/config.toml`. Do not remove that data directory while in use.

Services bind to loopback for development. On a remote machine, use an SSH tunnel
for the printed web port. Public deployment needs HTTPS, restricted signup,
backups, and the production configuration in `docs/self-host-production.md`.

## Setup verification

Dependencies were installed from the frozen lockfile, Prisma was generated,
and all 187 migrations applied to the dedicated database. The Docker computer
image built successfully; Python and Chromium executable smoke checks passed.
The targeted API health and root environment-loading suites passed (10 tests).
Lint completed with upstream warnings and informational diagnostics.
`pnpm check --concurrency=1` passed all 22 tasks. Use this lower concurrency
on this machine to avoid memory pressure from parallel checks.

The development stack was verified with web HTTP 200 and API `/ready` HTTP 200
(`ok: true`, `degraded: false`); the worker logged ready. This setup run selected
web port 5183, API port 3110, and supervisor port 7101. Future starts may choose
the default block again. Use the printed URL. The server stack was subsequently stopped and removed for migration to a laptop.
Model-backed bot execution, full integration/E2E suites, and native app packaging
have not been verified.

## Move development to a laptop

The custom work is preserved in `rakazo-custom.bundle` with all upstream refs.
The original server checkout, local secrets, database, containers, and dependency
files are removed after bundle verification. Machine-specific paths above describe
the original setup; do not recreate its mounts or service configuration on a laptop.

From a fresh upstream clone, fetch the bundle and switch to the custom branch:

```bash
git clone https://github.com/elie222/rakazo.git
cd rakazo
git fetch /path/to/rakazo-custom.bundle refs/heads/custom/development:refs/heads/custom/development
git switch custom/development
```

Install a supported Node version, pnpm 9.15.0, and Docker using the laptop's normal
setup. Copy `.env.example` to `.env`, generate new independent credentials as
instructed in the upstream README, and install dependencies with the frozen lockfile.
Build the computer image, then run `./scripts/dev-local.sh`. Docker Desktop needs
`SANDBOX_CONTROL_VIA_LOOPBACK=true`. Use the printed URL and connect a model during
onboarding. The server database and credentials are intentionally not in the bundle.
