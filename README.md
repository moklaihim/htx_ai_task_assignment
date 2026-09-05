# Task Assignment Application

A small task/subtask tracker: developers have skills, tasks require skills, and a
task can only be assigned to a developer who has every skill it requires. Built for
the HTX Software Engineering take-home test.

- [Setup & Run](#setup--run)
- [Architecture](#architecture)
- [Data Model](#data-model)
- [API Reference](#api-reference)
- [Library Justifications](#library-justifications)
- [Testing](#testing)
- [Assumptions](#assumptions)

---

## Setup & Run

Requirements: Docker and Docker Compose. Nothing else — no local Node.js, no local
Postgres, no `npm install` on the host.

```
git clone <repo-url>
cd htx_ai_task_assignment
cp .env.example .env      # then paste the provided LLM_API_KEY into it
docker compose up
```

Open **http://localhost:3000**. The Task List Page shows four seeded developers
(Alice, Bob, Carol, Dave) with no tasks yet — create one from "New Task".

That's the entire setup. No database to create by hand, no migration command, no
seed command, no build step: the backend's `entrypoint.sh` runs the migration
runner, then the idempotent seed, then the server, in that order, every time the
`backend` container starts (safe to repeat — a second `docker compose up` against
the same volume is a no-op). Anything beyond the four commands above would be a
defect.

**Changing the LLM key or mode later** — edit `.env` and run `docker compose up`
again (no `--build`). The key and `LLM_MODE` are container *environment* values, not
build arguments, so a new value takes effect on the next start with no rebuild and
is never baked into an image layer.

**Health checks** (used by `depends_on: condition: service_healthy` and useful for
debugging): `GET /health` returns 200 once the process is running; `GET /health/db`
returns 200 only once it can run a query against Postgres, 503 otherwise.

### Environment variables

Everything the app reads is listed in [`.env.example`](.env.example):

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | no | `app` / `app` / `taskdb` | Postgres credentials/database, shared with `DATABASE_URL` |
| `DATABASE_URL` | no | `postgresql://app:app@db:5432/taskdb` | Backend's Postgres connection string (`db` is the compose service name) |
| `DB_CONNECTION_TIMEOUT_MS` | no | `3000` | How long the backend waits for a pooled connection before `/health/db` reports 503 |
| `FRONTEND_PORT` | no | `3000` | Host port the SPA is published on |
| `LLM_BASE_URL` | no | `https://generativelanguage.googleapis.com` | Gemini API origin |
| `LLM_MODEL` | no | `gemini-3.5-flash` | Gemini model id |
| `LLM_TIMEOUT_MS` | no | `10000` | Per-call deadline before the LLM request is aborted |
| `LLM_MODE` | no | `live` | `live` calls Gemini; `stub`/`fail` are test doubles (see [Testing](#testing)) |
| `LLM_API_KEY` | **yes** | — | The only value with no committed default; never commit a real key |

`LLM_API_KEY` is the one variable with no default — everything else ships with a
committed, non-sensitive default so a reviewer never has to look them up. If it's
missing or blank, the app still starts and runs normally; every skill-inference
attempt simply fails and falls back to an empty Skills list with a notification
(see REQ-6.4 in [`docs/requirements.md`](docs/requirements.md)), rather than the
container refusing to start.

---

## Architecture

Three independently deployable services, each in its own container, plus one
external HTTP dependency:

```
┌──────────────┐      HTTP/JSON      ┌──────────────┐      SQL      ┌────────────┐
│   frontend   │ ──────────────────► │   backend    │ ────────────► │  postgres  │
│ React + Vite │ ◄────────────────── │ Express + TS │ ◄──────────── │            │
│  (nginx)     │                     │              │               │            │
└──────────────┘                     └──────┬───────┘               └────────────┘
                                            │ HTTPS
                                            ▼
                                     ┌──────────────┐
                                     │  Gemini API  │
                                     │  (external)  │
                                     └──────────────┘
```

- **frontend** — a React SPA (Vite build), served at runtime by nginx. Client-side
  routing (React Router) switches between the Task List Page and the Task Creation
  Page with no full page reload. nginx also proxies `/api/*` to the backend,
  stripping the prefix, so the browser never needs CORS configuration and the
  backend never needs to know about the `/api` prefix.
- **backend** — Express on Node.js/TypeScript. Thin routes in `src/routes/` parse
  and validate the request (Zod) and call plain, unit-testable functions in
  `src/services/` for the two rules that matter most: skill matching and the
  recursive "Done" rule. `src/db/` holds raw SQL query functions against `pg`
  directly — no ORM. `src/llm/` is the only thing that talks to Gemini, and it is
  called only from the backend, never from the browser, which is also what keeps
  the API key server-side.
- **postgres** — the single source of truth. Schema and seed data are applied by a
  small migration runner and an idempotent seed script, both triggered by the
  backend's `entrypoint.sh` on every container start.
- **Gemini (external)** — called once per Task/subtask node created with an empty
  Skills list, to infer which of the two seeded skills (`Frontend`, `Backend`) the
  title implies. A failure here never fails the request — the task is still
  created, just with an empty Skills list and a flag noting inference failed.

### Repository layout

```
/
├── docker-compose.yml
├── .env.example              # committed template
├── README.md
├── docs/                     # requirements.md, design.md, phase-N.md
├── e2e/                      # Playwright specs against the compose stack
│   ├── playwright.config.ts
│   ├── helpers/              # shared locators + Docker Compose LLM_MODE control
│   └── specs/
├── backend/
│   ├── Dockerfile             # multi-stage: compile, then a production-only runtime
│   ├── entrypoint.sh           # CMD — migrate → seed → serve, every start
│   ├── db/
│   │   ├── migrations/        # 001_init.sql — plain SQL, applied in filename order
│   │   ├── migrate.ts         # ~40-line runner
│   │   ├── seed.sql           # idempotent seed data
│   │   └── seed.ts
│   ├── src/
│   │   ├── index.ts           # process entry — reads PORT, calls listen()
│   │   ├── app.ts              # createApp() — no listen(), so tests can bind their own port
│   │   ├── db/                 # pg Pool + raw SQL query helpers
│   │   ├── routes/             # HTTP layer: parse, validate, respond
│   │   ├── schemas/            # Zod request schemas
│   │   ├── services/           # skill matching, Done rule, tree building
│   │   ├── errors/              # AppError — one factory per error code
│   │   ├── middleware/          # errorHandler, asyncHandler
│   │   ├── llm/                  # Gemini client, prompt, config, stub/fail doubles
│   │   └── types/
│   └── test/                    # unit/, integration/, helpers/
└── frontend/
    ├── Dockerfile               # multi-stage: vite build, then nginx runtime
    ├── nginx.conf                # serves the SPA, proxies /api, SPA fallback routing
    └── src/
        ├── api/                  # typed fetch wrappers, one file per resource
        ├── types/                # hand-kept mirror of backend/src/types
        ├── lib/                   # pure helpers (tree building, draft state)
        ├── pages/                 # TaskListPage, TaskCreationPage
        └── components/            # TaskRow, TaskFormNode (recursive), controls, Toaster
```

### How the pieces interact

1. The browser loads the SPA from nginx and calls `/api/*`, which nginx proxies to
   `backend:4000`.
2. The backend validates the request (Zod), applies business rules (skill match,
   Done rule) against Postgres via `pg`, and — for `POST /tasks` nodes with no
   skills — calls Gemini before opening the database transaction.
3. `GET /tasks` reads every task row once and rebuilds the parent/child tree in
   memory (`buildForest`), rather than issuing one query per level: an arbitrarily
   deep tree is fetched in one query and one pass.
4. Every mutating endpoint (`POST /tasks`, both `PATCH`s) responds with the updated
   Task in the same shape `GET` uses, so the frontend can apply the response
   directly to its in-memory tree without a follow-up fetch.

---

## Data Model

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│  developers │────────►│ developer_skills │◄────────│   skills    │
│  id         │  1   *  │  developer_id FK │  *   1  │  id         │
│  name       │         │  skill_id     FK │         │  name       │
└──────┬──────┘         │  PK(both)        │         └──────┬──────┘
       │                └──────────────────┘                │
       │ 1                                                  │ 1
       │ *                                                  │ *
       │                ┌──────────────────┐                │
       │                │   task_skills    │                │
       │                │  task_id      FK │────────────────┘
       │                │  skill_id     FK │
       │                │  PK(both)        │
       │                └────────▲─────────┘
       │                         │ *
       │                         │ 1
       │                ┌────────┴─────────┐
       └───────────────►│      tasks       │
      (assignee_id FK)  │  id              │
                        │  title           │
                        │  status          │
                        │  assignee_id  FK │
                        │  parent_task_id  │──┐ self-reference
                        │  created_at      │  │ (arbitrary nesting depth)
                        └──────────▲───────┘  │
                                   └──────────┘
```

- **`developers`** — id, name. Skills and assigned tasks are both many-to-many/
  one-to-many relations expressed through the other tables, not columns here.
- **`skills`** — id, unique name (seeded with exactly `Frontend` and `Backend`).
  Not owned by a developer or a task; either can reference it.
- **`tasks`** — id, title, `status` (a Postgres `ENUM`: `To-do` / `In Progress` /
  `Done`, so an invalid value is rejected by the database, not just the app),
  nullable `assignee_id` (`ON DELETE SET NULL` — a task outlives a deleted
  developer by becoming unassigned), and a nullable, self-referential
  `parent_task_id` (`ON DELETE CASCADE` — deleting a task removes its whole
  subtree). `NULL` means top-level; one column supports unlimited nesting depth
  with no schema change per level. **Subtasks are rows in `tasks`, not a separate
  table** — a subtask has every property a top-level task has, and one table gives
  that for free instead of duplicating every column and every rule.
- **`developer_skills`** / **`task_skills`** — junction tables for the two
  genuinely many-to-many relationships: a developer can have many skills and a
  skill can belong to many developers; a task can require many skills and a skill
  can be required by many tasks.

Cycles are impossible by construction: a task's parent is set only at creation,
pointing at a row created earlier in the same tree, and no endpoint re-parents an
existing task — so the graph can only ever be a tree, with no runtime cycle check
needed.

There is no `skill_inference_failed` column: that flag describes what happened
during one `POST /tasks` request, not a stored property of the task, so it's
returned in the response and then forgotten (see [API Reference](#api-reference)).

---

## API Reference

All responses are JSON. Errors share one shape:

```json
{ "error": { "code": "SKILL_MISMATCH", "message": "Bob does not have the required skill: Frontend" } }
```

Error codes: `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `SKILL_MISMATCH` (400),
`SUBTASKS_NOT_DONE` (400).

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/health` | — | `200 {"status":"ok"}` | — |
| GET | `/health/db` | — | `200 {"status":"ok","db":"up"}` | `503 {"status":"error","db":"down"}` |
| GET | `/tasks` | — | `200 Task[]` (top-level only, subtasks nested inside) | — |
| GET | `/tasks/:id` | — | `200 Task` (with nested subtasks) | `404` unknown id |
| POST | `/tasks` | `CreateTaskInput` | `201 Task` (tree, `skillInferenceFailed` on affected nodes) | `400` invalid body / unknown skill id |
| PATCH | `/tasks/:id/assign` | `{"assigneeId": number \| null}` | `200 Task` | `400 SKILL_MISMATCH`, `404` unknown task/developer |
| PATCH | `/tasks/:id/status` | `{"status": "To-do" \| "In Progress" \| "Done"}` | `200 Task` | `400 SUBTASKS_NOT_DONE`/`VALIDATION_ERROR`, `404` |
| GET | `/developers` | — | `200 Developer[]` | — |
| GET | `/developers/:id` | — | `200 Developer` | `404` unknown id |
| GET | `/skills` | — | `200 Skill[]` | — |

### Task shape (`GET`, and the responses of every mutating endpoint)

```json
{
  "id": 1,
  "title": "As a logged-in user, I want to update my profile information...",
  "status": "To-do",
  "assignee": { "id": 3, "name": "Carol" },
  "skills": [ { "id": 1, "name": "Frontend" }, { "id": 2, "name": "Backend" } ],
  "subtasks": [
    {
      "id": 2,
      "title": "Build the profile edit form",
      "status": "To-do",
      "assignee": null,
      "skills": [ { "id": 1, "name": "Frontend" } ],
      "subtasks": []
    }
  ]
}
```

### `POST /tasks` request — recursive, one call for the whole tree

```json
{
  "title": "Parent task",
  "skillIds": [1],
  "subtasks": [
    { "title": "Child A", "skillIds": [], "subtasks": [
      { "title": "Grandchild A1", "skillIds": [2], "subtasks": [] }
    ]},
    { "title": "Child B", "skillIds": [], "subtasks": [] }
  ]
}
```

`skillIds` and `subtasks` are both optional, defaulting to `[]`. An empty
`skillIds` on any node is what triggers LLM skill inference for that node — the
LLM is never invoked for a node the user gave explicit skills to.

### `skillInferenceFailed` (POST response only)

Each node in the `POST /tasks` response carries an optional boolean,
`skillInferenceFailed`. It appears **only** here, never in `GET` responses,
because it describes what happened during that one request rather than a stored
property of the task:

```json
{
  "id": 3,
  "title": "Child A",
  "status": "To-do",
  "assignee": null,
  "skills": [],
  "skillInferenceFailed": true,
  "subtasks": []
}
```

`true` means inference was attempted (the node's `skillIds` was empty) and either
the LLM call failed or its response named no seeded skill — the task is still
created, with an empty `skills` list.

### Developer shape (`GET /developers`, `GET /developers/:id`)

```json
{
  "id": 3,
  "name": "Carol",
  "skills": [ { "id": 1, "name": "Frontend" }, { "id": 2, "name": "Backend" } ],
  "assignedTasks": [ { "id": 2, "title": "Build the profile edit form", "status": "To-do" } ]
}
```

### Skill shape (`GET /skills`)

```json
[ { "id": 1, "name": "Frontend" }, { "id": 2, "name": "Backend" } ]
```

---

## Library Justifications

Required by the source PDF, not chosen: TypeScript, React, Node.js, PostgreSQL,
Docker. Everything below is a real choice, with the alternative that was rejected.

| Choice | Why | Alternative rejected |
|---|---|---|
| **Express** | Mandated by the PDF. Minimal, stable, no framework conventions to explain. | — |
| **`pg` (node-postgres), raw SQL** | Direct control over queries. The two hardest parts of this build — the recursive descendant check for the Done rule, and fetching an arbitrarily deep task tree — are both natural in SQL and awkward or impossible to express through an ORM's query API. Nothing sits between the code and the database. | Prisma / TypeORM — an extra abstraction to explain, and both would still need raw SQL escape hatches for the recursive queries |
| **Plain `.sql` migration files + a small runner** | Migrations are readable SQL applied in filename order, tracked in a `schema_migrations` table. About 40 lines of runner code, fully inspectable. | `node-pg-migrate` — a reasonable tool, but adds a dependency and its own CLI conventions for what is a handful of files here |
| **Zod** | One schema validates the recursive `POST /tasks` body *and* infers the TypeScript type from it, so validation and types can't drift apart. Recursive schemas are directly supported, which matters for arbitrarily nested subtasks. | Hand-written validation — verbose, and easy to miss a nesting level |
| **Vite** | Fast dev server, first-class TS + React templates, builds to static files nginx serves directly. | Create React App (no longer maintained) |
| **React Router** | Client-side navigation between the two pages, satisfying the single-page-application requirement. | Conditional rendering on state — works, but no URLs, no back button |
| **Vitest** | One test runner for both halves of the repo. On the frontend it reuses the existing Vite config, so TS handling and path aliases are already correct with no second build setup. On the backend it runs TypeScript tests with no separate transform step. | Jest — needs its own TS toolchain configured; `node:test` — no extra dependency, but a separate runner from the frontend's, so two ways of writing tests in one repo |
| **Playwright** | End-to-end coverage through a real browser against the running Docker Compose stack — the only way to verify things like "the Update button is disabled until the value changes". Runs the same way in CI or locally. | Cypress — comparable; Playwright chosen for simpler multi-browser setup and no separate dashboard concepts |
| **nginx (frontend runtime)** | Serves the built static bundle and proxies `/api` to the backend, avoiding CORS configuration entirely. | Serving the SPA from Express (mixes concerns, loses static-file caching) |
| **Gemini** | Free tier, following the PDF's own suggestion, for LLM skill inference. | — |

**Not used: Supertest.** Integration tests start the Express app in a setup hook
and call it with Node's built-in global `fetch`. Supertest would only wrap that in
a chainable assertion API — one more dependency for no capability the tests need.

---

## Testing

Three layers, each covering what the layer below cannot:

- **Unit** (`backend/test/unit/`, Vitest) — pure functions, no database, no
  network: skill matching, tree building, subtask insertion, LLM response
  parsing.
- **Integration** (`backend/test/integration/`, Vitest + `fetch`) — the Express
  app started against a real, disposable Postgres database per test file. Covers
  every endpoint's success and error paths, including the recursive Done rule and
  all three `LLM_MODE`s.
- **End-to-end** (`e2e/`, Playwright) — a real browser against the full
  Docker Compose stack. Run with:

  ```
  cd e2e
  npm install
  npx playwright install --with-deps chromium   # first time only
  npm test
  ```

  Requires the stack already running (`docker compose up -d` from the repo root).
  Eight scenarios (E2E-1 through E2E-8) cover task creation, assignment,
  status updates, arbitrarily deep subtask trees, the recursive Done rule, and
  both LLM outcomes (`stub` success, `fail` fallback) — the last two are run by
  recreating the `backend` container with `LLM_MODE` forced to `stub`/`fail`
  (`e2e/helpers/composeEnv.ts`), so the suite makes no live Gemini call and spends
  no API quota, and restores the container to `.env`'s configured mode afterward.

Backend unit/integration tests run with:

```
cd backend
npm install
npm test               # both layers
npm run test:unit
npm run test:integration   # needs a reachable Postgres — the compose db, or a local install
```

---

## Assumptions

Everything below is a real decision made where the source PDF left a gap, so a
reviewer can distinguish stated requirements from decisions made to fill them:

1. **Status values** — the PDF only names "To-do", "Done", "etc." This build uses a
   fixed enum of `To-do`, `In Progress`, `Done`. Anything beyond `To-do`/`Done` is
   an addition, not a stated requirement.
2. **Skill matching rule** — "can only be assigned to a Developer with the
   Skill(s) required" is read as: the developer must have ALL required skills (a
   superset), not just one overlapping skill.
3. **One assignee per Task** — the wireframe shows a single assignee dropdown, so
   this build assumes single-assignee, not multi-assignee.
4. **LLM provider** — Gemini, for its free tier, following the PDF's own
   suggestion.
5. **"Without specified Skill(s)"** is read as an empty Skills array at creation
   time — not `null`, not an omitted field.
6. **LLM failure handling** — not specified by the PDF; a safe fallback is
   defined (create with empty skills rather than fail the request).
7. **Subtasks are treated as full Tasks in their own right** — same title field,
   same optional skills field, same LLM classification path. A subtask's required
   skills are inferred from *its own* title, standalone. A subtask never copies or
   inherits skills from its parent task's skills.
8. **Task List "..." column** — the PDF's Task List wireframe shows an unlabelled
   "..." column between Skills and Status. This is read as an indication that
   further task attributes *may* be displayed, not as a requirement for any
   specific additional column. No extra column is implemented.

Full requirement-by-requirement detail lives in
[`docs/requirements.md`](docs/requirements.md); the reasoning behind every design
decision lives in [`docs/design.md`](docs/design.md).
