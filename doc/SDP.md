# Software Development Process

A reusable development process distilled from building Kekkonsnap. Applicable to any small-to-mid-scale web project.

**If you are an AI agent**, treat this document as a reference for how this project is built and how to contribute correctly. Follow the conventions described here. If you are setting up a new project using this process, follow the checklist in Section 9.

---

## 1. Planning

### Start with a PLAN.md

Before writing any code, create a `doc/PLAN.md` that covers:

- **Context** — what the project does and who it's for
- **Tech stack table** — every major dependency with rationale
- **Database schema** — tables, fields, relationships
- **User flows** — numbered screens, each with concrete behavior notes
- **API routes** — full route inventory with methods and access rules
- **Architecture decisions** — real-time strategy, auth model, file storage, etc.
- **File structure** — planned directory layout
- **Build order** — phased implementation plan with clear dependencies between phases
- **Verification checklist** — manual and automated checks to confirm the app works

The plan is a living document. Update it when scope or architecture changes. It is the canonical reference for what the system does and why. When in doubt about intended behavior, check `PLAN.md` first.

### Phased build order

Break work into sequential phases where each phase builds on the last:

1. **Foundation** — project scaffold, database schema, auth, design system
2. **Core flow** — the primary user-facing feature set
3. **Secondary flows** — galleries, history, read-only views
4. **Real-time / integrations** — SSE, webhooks, external APIs
5. **Admin** — management UI, moderation tools
6. **Deploy + polish** — Docker, reverse proxy, error states, edge cases

Each phase should be independently testable. Do not move on until the current phase is solid.

## 2. Tech stack choices

### Guiding principles

- **Fewer moving parts** — SQLite over Postgres when you don't need concurrent write throughput. EventEmitter over Redis when you're single-process. Local disk over S3 when you're on one VPS.
- **Standalone output** — build artifacts should run without the full dev toolchain (`next build` -> `standalone` mode, single `server.js`).
- **One language** — TypeScript everywhere (app, tests, scripts, migrations) to reduce context-switching.
- **Pin decisions early** — choose your ORM, CSS framework, and image pipeline before Phase 1 ends. Changing these mid-project is expensive.

### Recommended defaults (2025+)

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) | File-based routing, API routes, SSR, standalone output |
| Language | TypeScript strict | Catches bugs at compile time |
| Database | SQLite + Drizzle ORM | Zero-config, type-safe schema, easy migrations |
| Styling | Tailwind CSS | Utility-first, no context-switching to CSS files |
| Image processing | Sharp | Fast, handles EXIF, WebP compression, thumbnails |
| Auth | JWT (jose) + HttpOnly cookies | Stateless, no session store needed |
| Real-time | SSE via EventEmitter | Simpler than WebSockets for one-way push |
| Deployment | Docker multi-stage + Caddy | Small images, auto HTTPS, zero-config TLS |

Swap any of these based on your project's constraints — the process works regardless of specific tools.

## 3. Test-Driven Development

### Testing philosophy

- **Write tests alongside features, not after.** Each phase in the build order should include its tests.
- **Test at the right level.** Do not mock what you can run for real. Do not spin up browsers for what a unit test covers.
- **Tests are documentation.** A passing test suite is the most trustworthy spec.

### Unit tests (Vitest)

Unit tests cover the "logic layer" — everything below the UI:

- **Database schema** — constraints, cascades, defaults, CRUD operations
- **Auth** — JWT creation/verification, password hashing, session management
- **Business logic** — rate limiting, image processing, fuzzy matching, schedulers
- **API routes** — request/response contracts, error codes, access control

Key practices:

- **In-memory database for speed.** Use SQLite `:memory:` with Drizzle so each test file gets a fresh schema in milliseconds — no test database cleanup needed.
- **Co-locate tests.** Place test files in `__tests__/` directories next to the code they test (`src/lib/__tests__/`, `src/app/api/__tests__/`). Do not put them in a top-level `tests/` directory.
- **Test constraints, not implementations.** Assert on what the database rejects, what the API returns, what the function outputs — not on internal details.

```
vitest.config.ts:
  environment: "node"
  include: ["src/**/__tests__/**/*.test.ts"]
  globals: true
```

### E2E tests (Playwright)

E2E tests cover the "user layer" — real browsers interacting with real pages:

- **Guest flows** — landing, identification, terms, camera, photos, winner reveal
- **Admin flows** — login, dashboard, event management
- **Layout** — no horizontal overflow, header visibility across all pages
- **Visual regression** — per-device screenshot baselines with diff tolerance
- **Cross-device** — test on the actual device profiles your users will have

Key practices:

- **Seed via real API calls.** The `globalSetup` should create test data through the same API your app exposes — not direct DB imports. This tests more of the real stack.
- **Auth fixtures.** Create reusable fixtures like `authedPage` (fully authenticated browser context) and `preTermsPage` (partially authenticated). Cache cookies to avoid rate limit issues.
- **Mock hardware, not APIs.** For camera-dependent features, override `getUserMedia` via `page.addInitScript()` rather than mocking the upload API. Test the real upload path.
- **Multiple device profiles.** Define Playwright projects for each target device. Mobile-first apps need at minimum: small phone, mid phone, large phone, desktop.
- **Sequential, single worker.** Run e2e tests with `workers: 1` and `fullyParallel: false` when tests share server state.
- **Visual regression.** Use `toHaveScreenshot()` with a reasonable diff tolerance (5% works well). Store baselines in git. Regenerate after intentional UI changes.

```
playwright.config.ts:
  fullyParallel: false
  workers: 1
  webServer: { command: "npm run dev", reuseExistingServer: !process.env.CI }
  globalSetup: "./e2e/global-setup.ts"
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.05 } }
```

### When to write which kind of test

| What you're testing | Test type | Why |
|---|---|---|
| Schema constraint (unique, not-null, FK cascade) | Unit | Fast, deterministic |
| API route returns correct status code | Unit | No browser needed |
| Rate limiter blocks after N requests | Unit | Time-sensitive, needs control |
| Image pipeline produces valid WebP | Unit | Binary output validation |
| Guest can identify and reach the camera | E2E | Multi-page flow with cookies |
| Page doesn't overflow on iPhone SE | E2E | Real viewport rendering |
| Admin can pick a winner and announce | E2E | Full stack with SSE |

### Test data strategy

- **Unit tests:** in-memory SQLite, fresh schema per test file, factory functions for common entities.
- **E2E tests:** global setup seeds a test event and guests via HTTP API. Each spec uses fixtures to create authenticated browser contexts. Teardown deletes the test event.
- **Never share mutable state between tests.** Each test must be independent.

## 4. Deployment

### Docker multi-stage build

Three stages minimize the production image:

1. **deps** — `npm ci` only, cached by `package-lock.json`
2. **builder** — full source copy + `npm run build`
3. **runner** — only `standalone/` output, `public/`, static assets, migrations. No `node_modules`, no source.

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER nextjs
CMD ["node", "server.js"]
```

Key points:

- **Non-root user.** Create a `nextjs` user and switch to it before `CMD`.
- **Persistent data volumes.** Mount `/app/data` as a Docker volume for the database and uploads. Never bake data into the image.
- **Env vars at runtime.** Use `${VAR:?error}` syntax in `docker-compose.yml` to fail fast on missing required vars.

### Reverse proxy (Caddy)

Caddy provides auto HTTPS with zero configuration beyond a domain name:

```
yourdomain.com {
    encode gzip

    # SSE — disable buffering for real-time streaming
    @sse path /api/events/*/status
    reverse_proxy @sse app:3000 {
        flush_interval -1
    }

    reverse_proxy app:3000
}
```

Critical details:

- **SSE needs `flush_interval -1`.** Without this, Caddy buffers SSE responses and clients see nothing until the buffer fills.
- **Upload size limits.** Set `request_body { max_size 15MB }` or similar based on your needs.
- **HTTPS is mandatory** for browser APIs like `getUserMedia`, `ServiceWorker`, etc.

### docker-compose.yml

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    volumes:
      - app-data:/app/data
    environment:
      - JWT_SECRET=${JWT_SECRET:?Set JWT_SECRET in .env}
    expose:
      - "3000"

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
    depends_on:
      - app

volumes:
  app-data:
  caddy-data:
```

### Alternative: Tailscale

For testing or private access, Tailscale gives you HTTPS without DNS or port forwarding:

```bash
npm run dev
sudo tailscale serve --bg http://localhost:3000
```

Useful for testing on real devices during development.

## 5. CI/CD

### Recommended pipeline (GitHub Actions or similar)

```
on push / PR:
  1. npm ci
  2. npm run lint
  3. npm test            (unit tests — fast, no browser)
  4. npm run build       (catch build errors)
  5. npx playwright test (e2e — slower, real browsers)
  6. docker build .      (verify the image builds)
```

### Key principles

- **Lint is a test.** Include `next lint` in the unit test suite (or run it separately). Lint errors should break the build, not just warn.
- **Build must succeed.** TypeScript strict mode catches runtime errors at compile time. A passing `npm run build` is a meaningful signal.
- **E2E in CI needs `forbidOnly: true`.** Prevent accidentally committed `.only` from silencing other tests.
- **Retries in CI, not locally.** Use `retries: process.env.CI ? 2 : 0` to handle flaky browser tests in CI without hiding real failures during development.
- **Cache aggressively.** Cache `node_modules/`, `.next/cache/`, Playwright browsers, and Docker layers.

### Deployment trigger

For a self-hosted VPS with systemd services:

```bash
# On the server (triggered by webhook, SSH, or manual):
git pull
make deploy   # stops service, rebuilds, starts service + tunnel
```

For Docker-based deployments:

```bash
git pull
docker compose up -d --build
```

For more sophisticated setups, use a CI step that SSHs into the server or pushes to a container registry.

## 6. Makefile as a task runner

A `Makefile` provides memorable shortcuts that work everywhere:

```makefile
.PHONY: all build start stop restart deploy status logs test test-e2e test-all

all: stop build start

build:
	npm run build

start:
	systemctl --user start myapp

stop:
	systemctl --user stop myapp

restart:
	systemctl --user restart myapp

deploy: stop build start

status:
	systemctl --user status myapp

logs:
	journalctl --user -u myapp -f

test:
	npm test

test-e2e:
	npx playwright test

test-all: test test-e2e
```

Benefits over npm scripts alone:

- `make` is available on every Unix system
- Targets compose naturally (`test-all: test test-e2e`)
- Process management via systemd — auto-restart on failure, auto-start on boot
- Logs via `journalctl` — structured, rotated, persistent

## 7. Development workflow

### Feature development cycle

Follow this order. Do not skip steps.

```
1. Update PLAN.md if the feature changes scope or architecture
2. Write unit tests for the new logic (red)
3. Implement the feature (green)
4. Run `npm test` — all tests must pass
5. Run `npm run build` — TypeScript must compile
6. Manual verification on target devices
7. Write e2e tests for the new user flow
8. Run `npm run test:e2e` — all e2e must pass
9. Commit with a descriptive message
```

### Bug fix cycle

```
1. Reproduce the bug manually
2. Write a failing test that captures the bug
3. Fix the code
4. Confirm the test passes
5. Run full test suite to check for regressions
6. Commit
```

### Code organization conventions

- **Co-locate related code.** Tests next to source (`__tests__/`), not in a separate tree.
- **Flat over nested.** `src/lib/auth.ts` over `src/lib/auth/index.ts` unless you genuinely have multiple files.
- **Components by domain.** `components/camera/`, `components/guest/`, `components/admin/` — not `components/buttons/`, `components/modals/`.
- **API routes mirror the URL.** `src/app/api/admin/[slug]/lock/route.ts` serves `POST /api/admin/:slug/lock`.
- **Scripts in `scripts/`.** CLI tools for setup, seeding, migration — not buried in `src/`.

## 8. Agent onboarding file (`AGENT.md`)

**If you are an AI agent setting up a new project using this process**, create `AGENT.md` at the project root early — ideally right after `PLAN.md`. This file is your counterpart's first read when they join the project (and that counterpart may be a future version of you in a new session, with no memory of this one).

**If you are an AI agent working on an existing project**, check for `AGENT.md` at the project root before doing anything else. If it exists, read it. If it doesn't, suggest creating one.

### Why this file matters

Without `AGENT.md`, every new agent session starts by exploring the codebase file-by-file, often making wrong assumptions about conventions, test frameworks, styling patterns, or architecture. A good `AGENT.md` eliminates this ramp-up and prevents:

- Using the wrong test framework or file layout
- Hardcoding values instead of using existing design tokens or constants
- Creating a new abstraction when one already exists
- Skipping tests, lint, or build checks before calling something "done"
- Introducing patterns that conflict with the project's established conventions

### What to include

Write `AGENT.md` as direct instructions to an AI agent. Use imperative voice. Be specific — not "follow best practices" but "run `npm test` before every commit."

```markdown
# Agent Guide

Instructions for AI coding agents working on this codebase.

## Getting oriented

Read these files in order:
1. `doc/PLAN.md` — Full project spec
2. `src/db/schema.ts` — Database schema
3. `README.md` — Quick start and commands

## Project conventions
- TypeScript strict — no `any`, no `@ts-ignore`
- Tailwind CSS with custom theme tokens in `src/app/globals.css`
- Tests go in `__tests__/` next to the code they test
- [List any "never do this" rules specific to your project]

## Running things
- `npm install` — install deps
- `npm run dev` — dev server
- `npm test` — unit tests
- `npm run build` — production build (also validates TypeScript)
- `npm run lint` — eslint

## Before submitting changes
1. `npm test` — all tests must pass
2. `npm run build` — must compile without errors
3. If you changed UI: verify on mobile viewports
4. If you added a feature: add unit tests for logic, e2e tests for flows
5. If you changed the schema: run `npm run db:generate` for a new migration

## Key architecture notes
- [One sentence per major decision: database, auth, real-time, storage]
- [Call out non-obvious choices: "rate limiting is in-memory, not Redis"]

## Common tasks

### Add a new API route
1. [Step-by-step specific to your project]

### Modify the database schema
1. [Step-by-step specific to your project]

### Add a UI component
1. [Step-by-step specific to your project]
```

### Where to put it

- **`AGENT.md`** at the project root — this is the most common convention across tools.
- Tool-specific variants: `CLAUDE.md` (Claude Code), `.cursorrules` (Cursor), `.windsurfrules` (Windsurf). If you use a specific tool, create its convention file too. Keep `AGENT.md` as the tool-agnostic version.
- Do not put agent instructions inside `README.md`. The README is for humans setting up the project. `AGENT.md` is for agents working on the code. They have different needs.

### Keeping it current

Update `AGENT.md` whenever you:

- Add a new convention or lint rule
- Change the test setup or schema workflow
- Add a tool, framework, or pattern an agent should know about
- Hit a recurring issue where the agent does the wrong thing — add it as a "don't do this"

A stale `AGENT.md` is worse than none. If it says "153 tests" but there are now 166, the agent will be confused when counts don't match. Keep numbers, file paths, and command outputs accurate.

**If you are an agent and you notice `AGENT.md` is out of date** (e.g., test count is wrong, a file path has moved, a convention has changed), propose an update. Keeping this file accurate helps every future session.

### README integration

Add a section to `README.md` pointing to `AGENT.md`:

```markdown
## Working with an AI agent

Point your agent to [`AGENT.md`](AGENT.md) to get oriented.

**First prompt:**

> Read AGENT.md, then read doc/PLAN.md and src/db/schema.ts to understand the project.
```

This lets anyone clone the repo and immediately start working with their preferred agent.

## 9. Checklist for new projects

Follow this order. Each item should be done before moving to the next.

- [ ] Create `doc/PLAN.md` with full spec before writing code
- [ ] Create `AGENT.md` with conventions, architecture notes, and common tasks
- [ ] Set up TypeScript strict, ESLint, Tailwind
- [ ] Define database schema with Drizzle, generate initial migration
- [ ] Write unit tests alongside each module
- [ ] Set up Playwright with target device profiles
- [ ] Create `Dockerfile` (multi-stage), `docker-compose.yml`, `Caddyfile`
- [ ] Create `Makefile` with build/start/stop/test targets
- [ ] Add `.env.example` with all required variables documented
- [ ] Write seed/setup scripts for local development
- [ ] Test on real devices over HTTPS before shipping
