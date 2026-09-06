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

Requirements: Docker and Docker Compose. Nothing else needed on the host.

```
git clone <repo-url>
cd htx_ai_task_assignment
cp .env.example .env      # paste your Gemini API key into LLM_API_KEY
docker compose up -d --build
```

Open **http://localhost:3000**. Four developers (Alice, Bob, Carol, Dave) are
seeded with no tasks yet — create one from "New Task".

Migrations and seed data are applied automatically on every backend start — no
manual DB setup, migration command, or seed command needed.

**Reset the database** — at any point later, if you want to wipe all data and
start clean (e.g. after testing, or to re-seed from scratch), just run:
```
docker compose down -v
docker compose up -d --build
```

**Changed the LLM key or mode?** Edit `.env`, then `docker compose up -d` — no
rebuild needed, since these are runtime env values, not build args.

### Environment variables

Full list in [`.env.example`](.env.example). Only `LLM_API_KEY` is required —
everything else has a working default. Without a key, the app still runs; skill
inference just fails gracefully (empty Skills list + notification).

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | `postgresql://app:app@db:5432/taskdb` | Backend's Postgres connection |
| `FRONTEND_PORT` | `3000` | Host port the SPA is published on |
| `LLM_MODEL` | `gemini-3.8-flash` | Gemini model id |
| `LLM_MODE` | `live` | `live`/`stub`/`fail` (see [Testing](#testing)) |
| `LLM_API_KEY` | — | **Required.** Never commit a real key |

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

- **frontend** — React SPA (Vite build) served by nginx, which also proxies
  `/api/*` to the backend so the browser never needs CORS config.
- **backend** — Express/TypeScript. Routes validate input (Zod) and delegate to
  services for the two key rules: skill matching and the recursive "Done" rule.
  Raw SQL via `pg` — no ORM. Only the backend talks to Gemini, keeping the API
  key server-side.
- **postgres** — single source of truth. Schema and seed data are applied by a
  migration runner and idempotent seed script on every container start.
- **Gemini (external)** — called when a Task/subtask is created with no Skills
  specified, to infer them from the title. A failure never blocks task creation.

### Repository layout

```
/
├── docker-compose.yml
├── .env.example
├── docs/                # requirements.md, design.md, phase-N.md
├── e2e/                 # Playwright specs against the compose stack
├── backend/
│   ├── db/              # migrations/, migrate.ts, seed.sql, seed.ts
│   ├── src/
│   │   ├── db/          # pg Pool + raw SQL query helpers
│   │   ├── routes/      # HTTP layer: parse, validate, respond
│   │   ├── schemas/     # Zod request schemas
│   │   ├── services/    # skill matching, Done rule, tree building
│   │   ├── llm/         # Gemini client, prompt, stub/fail doubles
│   │   └── ...          # errors/, middleware/, types/
│   └── test/            # unit/, integration/
└── frontend/
    └── src/
        ├── api/         # typed fetch wrappers, one file per resource
        ├── pages/       # TaskListPage, TaskCreationPage
        └── components/  # TaskRow, TaskFormNode (recursive), controls, Toaster
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

- **`developers`** — id, name. Skills and assigned tasks are relations expressed
  through the other tables, not columns here.
- **`skills`** — id, unique name (seeded with `Frontend` and `Backend`).
- **`tasks`** — id, title, `status` (a Postgres `ENUM`: `To-do` / `In Progress` /
  `Done`), nullable `assignee_id` (`ON DELETE SET NULL` — a task becomes
  unassigned if its developer is deleted), and a nullable, self-referential
  `parent_task_id` (`ON DELETE CASCADE` — deleting a task removes its subtree).
  `NULL` means top-level; one column supports unlimited nesting depth.
  **Subtasks are rows in `tasks`, not a separate table** — same columns, same
  rules, no duplication.
- **`developer_skills`** / **`task_skills`** — junction tables for the two
  many-to-many relationships (developer↔skill, task↔skill).

Cycles in the `tasks` self-reference are impossible by construction: a task's
`parent_task_id` is set only at creation and never changed afterward, so the
task/subtask graph can only ever be a tree.

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
| POST | `/tasks` | `CreateTaskInput` | `201 Task` (tree, inference markers on inferred nodes) | `400` invalid body / unknown skill id |
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

### Inference markers (POST response only)

Each node in the `POST /tasks` response carries at most one of three optional
booleans: `skillInferenceApplied`, `skillInferenceFailed` and
`skillInferenceUnclassifiable`. They appear **only** here, never in `GET`
responses, because they describe what happened during that one request rather
than a stored property of the task. The task is created either way.

`skillInferenceApplied: true` — the `skills` on this node were **chosen by the
LLM**, not by the user. Without it the two are indistinguishable (a populated
`skills` array looks the same either way), so the UI could not confirm what
inference actually did:

```json
{
  "id": 2,
  "title": "Build the profile edit form",
  "status": "To-do",
  "assignee": null,
  "skills": [ { "id": 1, "name": "Frontend" } ],
  "skillInferenceApplied": true,
  "subtasks": []
}
```

`skillInferenceFailed: true` — inference was attempted (the node's `skillIds`
was empty) and **something went wrong**: the LLM call failed, timed out, or came
back unusable.

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

`skillInferenceUnclassifiable: true` — inference **succeeded**, and the answer is
that the title does not describe a software task. Titles are free text, so
"buy eggs" or "123145" are ordinary inputs; the prompt and response schema give
the model an explicit way to say so (`{"classifiable": false, "skills": []}`)
rather than leaving it to guess a skill:

```json
{
  "id": 4,
  "title": "buy eggs",
  "status": "To-do",
  "assignee": null,
  "skills": [],
  "skillInferenceUnclassifiable": true,
  "subtasks": []
}
```

The three are deliberately separate: the last two share an empty `skills` array
and only one of them means the system is broken, while the first shares a
populated one with skills the user picked. The Task Creation Page reports each
with its own toast colour — green for skills the LLM chose (naming them), red
for a failure, neutral slate for a title it declined to classify.

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
Docker. Everything below is a real choice.

| Choice | Why |
|---|---|
| **Express** | Express was chosen as the most established option, with minimal, well-known conventions for a project this size. |
| **`pg` (node-postgres), raw SQL** | The most straightforward fit for this project's scale — a handful of queries, two of which (the recursive descendant check for the Done rule, and fetching an arbitrarily deep task tree) are natural in SQL. An ORM would add an abstraction layer nothing here needs. |
| **Plain `.sql` migration files + a small runner** | Migrations are readable SQL applied in filename order, tracked in a `schema_migrations` table. About 40 lines of runner code, fully inspectable. |
| **Zod** | One schema validates the recursive `POST /tasks` body *and* infers the TypeScript type from it, so validation and types can't drift apart. Recursive schemas are directly supported, which matters for arbitrarily nested subtasks. |
| **Vite** | Fast dev server, first-class TS + React templates, builds to static files nginx serves directly. |
| **React Router** | Client-side navigation between the two pages, satisfying the single-page-application requirement. |
| **Vitest** | One test runner for both halves of the repo. On the frontend it reuses the existing Vite config, so TS handling and path aliases are already correct with no second build setup. On the backend it runs TypeScript tests with no separate transform step. |
| **Playwright** | End-to-end coverage through a real browser against the running Docker Compose stack — the only way to verify things like "the Update button is disabled until the value changes". Runs the same way in CI or locally. |
| **nginx (frontend runtime)** | Serves the built static bundle and proxies `/api` to the backend, avoiding CORS configuration entirely. |
| **Gemini** | Free tier, following the PDF's own suggestion, for LLM skill inference. |
| **`@google/genai` (official SDK)** | Simpler and more intuitive than a hand-rolled `fetch` client — typed request/response, and a `Type`-checked response schema that guarantees the shape of the model's answer instead of manually parsing it. |

**Not used: a CSS or component library.** The UI is two pages of tables, form
fields and buttons — a small enough surface that a component library (MUI,
Chakra) or a utility framework (Tailwind) would add more setup and complexity
than it saves. Plain CSS (`frontend/src/styles.css`) is a single stylesheet with
a `:root` token block (palette, radius, type, shadows) and component classes
that consume it.

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
  Nine scenarios (E2E-1 through E2E-9) cover task creation, assignment,
  status updates, arbitrarily deep subtask trees, the recursive Done rule, and
  all three LLM outcomes (`stub` success, `fail` fallback, and a title the model
  declines to classify) — the last three are run by recreating the `backend`
  container with `LLM_MODE` forced to `stub`/`fail`
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
   defined (create with empty skills rather than fail the request), and the
   user is shown a message informing them that inference failed.
7. **Subtasks are treated as full Tasks in their own right** — same title field,
   same optional skills field, same LLM classification path. A subtask's required
   skills are inferred from *its own* title, standalone. A subtask never copies or
   inherits skills from its parent task's skills.
8. **Titles that aren't software tasks** — the PDF assumes every title is a user
   story, but the title is a free-text field, so "buy eggs" or "123145" are
   ordinary inputs. Read as: the LLM must be able to decline ("this is not a
   software task") rather than guess, and a declined title is reported to the user
   as information, not as a failure. See
   [Inference markers](#inference-markers-post-response-only).

Full requirement-by-requirement detail lives in
[`docs/requirements.md`](docs/requirements.md); the reasoning behind every design
decision lives in [`docs/design.md`](docs/design.md).
