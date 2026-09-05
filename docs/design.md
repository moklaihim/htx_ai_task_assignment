# Design — Task Assignment Application

Companion to `requirements.md`. Every section states **how** a requirement is
satisfied and **why** that approach was chosen over alternatives. Requirement IDs
are referenced throughout so each decision traces back to something that was asked for.

---

## 1. Architecture Overview

Three services, as required by REQ-0.1, each in its own container:

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

The frontend never calls the LLM directly — REQ-6.3 requires inference to happen
entirely on the backend. This also keeps the API key server-side, which REQ-6.7
depends on: a key shipped to the browser would be readable by anyone using the app.

**Repository layout**

```
/
├── docker-compose.yml
├── .env.example              # committed template (REQ-7.5)
├── .env                      # gitignored, holds the real key
├── .gitignore
├── README.md                 # REQ-8.1 … REQ-8.5
├── docs/
│   ├── requirements.md
│   ├── design.md
│   ├── phase-1.md
│   ├── phase-2.md
│   ├── phase-3.md
│   ├── phase-4.md
│   ├── phase-5.md
│   ├── phase-6.md
│   └── phase-7.md
├── e2e/                      # Playwright specs (section 8.3)
│   ├── playwright.config.ts
│   └── specs/
├── backend/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── entrypoint.sh          # CMD — runs migrate → seed → server (3.3, 7.2)
│   ├── db/
│   │   ├── migrations/       # 001_init.sql, 002_… — plain SQL, applied in order
│   │   ├── migrate.ts        # ~40-line runner, applies migrations/*.sql
│   │   ├── seed.sql          # idempotent data (REQ-1.9)
│   │   └── seed.ts           # thin runner: reads seed.sql, executes it via `pg`
│   ├── src/
│   │   ├── index.ts          # process entry — reads PORT, calls listen()
│   │   ├── app.ts            # createApp(): builds the Express app, no listen()
│   │   ├── db/               # pg Pool + query helpers
│   │   ├── routes/           # HTTP layer: parse, validate, respond
│   │   ├── schemas/          # Zod request schemas (4.1)
│   │   ├── services/         # business rules (skill match, Done rule, tree build)
│   │   ├── errors/           # AppError — the four codes as static factories (4.1)
│   │   ├── middleware/        # errorHandler, asyncHandler (4.1)
│   │   ├── llm/               # Gemini client + prompt
│   │   └── types/             # shared TS types
│   └── test/
│       ├── unit/              # pure functions, no database (8.1)
│       ├── integration/       # Express app + disposable Postgres, via fetch (8.2)
│       └── helpers/           # testDatabase.ts, testServer.ts — the harness itself
└── frontend/
    ├── Dockerfile
    ├── .dockerignore
    ├── nginx.conf
    ├── index.html
    ├── vite.config.ts        # dev-only /api proxy mirroring nginx (7.2)
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api/              # typed fetch wrappers (client.ts + one file per resource)
        ├── types/            # hand-kept mirror of backend/src/types (4.2)
        ├── lib/              # developerCanBeAssigned.ts, taskTree.ts — mirrored/pure helpers
        ├── pages/
        └── components/
```

Routes are kept thin and business rules live in `services/` so the two rules that
actually matter — skill matching (REQ-1.8) and the recursive Done rule (REQ-5.3) —
sit in plain functions that can be unit-tested without starting an HTTP server.

`app.ts` is split from `index.ts` for the same reason: integration tests (8.2) need
to build the app and bind it to an ephemeral port themselves, which is impossible if
the entry module calls `listen()` as a side effect of being imported.

---

## 2. Technology Choices & Justification

Required by the PDF, not chosen: TypeScript, React, Node.js, PostgreSQL, Docker.
Everything below is a real choice, with the reasoning REQ-8.4 asks to be documented.

| Choice | Why | Alternative rejected |
|---|---|---|
| **Express** | Mandated by REQ-0.5. Minimal, stable, no framework conventions to explain. | — |
| **`pg` (node-postgres), raw SQL** | Direct control over queries. The two hardest parts of this build — the recursive descendant check (4.3) and fetching an arbitrarily deep tree (4.4) — are both natural in SQL and awkward or impossible to express through an ORM's query API. No generated client, no schema DSL, nothing between the code and the database. | Prisma / TypeORM — an extra abstraction to explain, and both would still need raw SQL escape hatches for the recursive queries |
| **Plain `.sql` migration files + small runner** | Migrations are readable SQL applied in filename order, tracked in a `schema_migrations` table. About 40 lines of runner code, fully inspectable. | `node-pg-migrate` — a reasonable tool, but adds a dependency and its own CLI conventions for what is a handful of files here |
| **Zod** | One schema validates the recursive `POST /tasks` body *and* infers the TypeScript type from it, so validation and types can't drift apart. Recursive schemas are directly supported, which matters for arbitrarily nested subtasks (REQ-2.1). | Hand-written validation — verbose, and easy to miss a nesting level |
| **Vite** | Fast dev server, first-class TS + React templates, builds to static files that nginx serves directly. | Create React App (no longer maintained) |
| **React Router** | Client-side navigation between the two pages, satisfying the SPA requirement (REQ-0.7). | Conditional rendering on state — works, but no URLs, no back button |
| **Vitest** | One test runner for both halves of the repo. On the frontend it reuses the existing Vite config, so TS handling and path aliases are already correct with no second build setup. On the backend the benefit is narrower and worth stating plainly: it runs TypeScript tests without a separate transform step. | Jest — needs its own TS toolchain configured; `node:test` — no extra dependency, but a separate runner from the frontend's, so two ways of writing tests in one repo |
| **Playwright** | End-to-end coverage through a real browser against the running docker-compose stack, which is the only way to verify things like "the Update button is disabled until the value changes" (REQ-3.4). Runs the same way in CI or locally. | Cypress — comparable; Playwright chosen for simpler multi-browser setup and no separate dashboard concepts |
| **nginx (frontend runtime)** | Serves the built static bundle and proxies `/api` to the backend, which avoids CORS configuration entirely. | Serving the SPA from Express (mixes concerns, loses static-file caching) |

**Not used: Supertest.** Integration tests start the Express app in a setup hook and
call it with Node's built-in global `fetch`. Supertest would only wrap that in a
chainable assertion API — one more dependency for no capability the tests need.

---

## 3. Database Design

### 3.1 Entity-relationship

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│  developers │────────►│ developer_skills │◄────────│   skills    │
│  id         │  1   *  │  developer_id FK │  *   1  │  id         │
│  name       │         │  skill_id     FK │         │  name       │
└──────┬──────┘         │  PK(both)        │         └──────┬──────┘
       │                └──────────────────┘                │
       │ 1                                                  │ 1
       │                                                    │
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
                        │  created_at      │  │ (REQ-1.10)
                        └──────────▲───────┘  │
                                   └──────────┘
```

Two junction tables because both relationships are genuinely many-to-many:
a Developer has many Skills and a Skill belongs to many Developers (REQ-1.7); a Task
requires many Skills and a Skill is required by many Tasks (REQ-1.5).

### 3.2 Schema — `db/migrations/001_init.sql`

```sql
CREATE TYPE task_status AS ENUM ('To-do', 'In Progress', 'Done');

CREATE TABLE developers (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE skills (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE developer_skills (
  developer_id INT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  skill_id     INT NOT NULL REFERENCES skills(id)     ON DELETE CASCADE,
  PRIMARY KEY (developer_id, skill_id)
);

CREATE TABLE tasks (
  id             SERIAL PRIMARY KEY,
  title          TEXT        NOT NULL,
  status         task_status NOT NULL DEFAULT 'To-do',
  assignee_id    INT         REFERENCES developers(id) ON DELETE SET NULL,
  parent_task_id INT         REFERENCES tasks(id)      ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE task_skills (
  task_id  INT NOT NULL REFERENCES tasks(id)  ON DELETE CASCADE,
  skill_id INT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, skill_id)
);

CREATE INDEX idx_tasks_parent   ON tasks(parent_task_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
```

**Decisions worth stating explicitly:**

- **`parent_task_id` nullable self-reference** (REQ-1.10). `NULL` means top-level.
  One column supports unlimited nesting depth with no schema change per level.
- **Subtasks are rows in `tasks`, not a separate table** — REQ-5.2 requires a subtask
  to have every property a Task has. One table gives that for free; a separate
  `subtasks` table would need every column duplicated and every rule written twice.
- **`ON DELETE CASCADE` on `parent_task_id`** — deleting a task removes its whole
  subtree rather than leaving orphan rows pointing at a missing parent. Deletion is
  out of scope for the API, but the constraint keeps the data honest.
- **`ON DELETE SET NULL` on `assignee_id`** — a task outliving a developer becomes
  unassigned rather than being deleted.
- **Status as a Postgres `ENUM`, not free text** — REQ-1.6 fixes three values, so the
  database rejects anything else instead of trusting the application layer.
- **No `skill_inference_failed` column.** REQ-6.6 requires the flag on the *response*,
  not in storage: it describes what happened during one request, not a property of
  the task. It is returned in the POST response and then forgotten.

**Cycles are impossible by construction.** A task's parent is set only at creation,
pointing at a row created earlier in the same tree, and no endpoint re-parents an
existing task. So the graph can only ever be a tree — no cycle check is needed.

### 3.3 Migration runner

Migrations are plain SQL files named `001_init.sql`, `002_….sql`. The runner:

1. Creates `schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ
   NOT NULL DEFAULT now())` if absent.
2. Reads `db/migrations/`, sorts filenames.
3. For each file not already in `schema_migrations`: run it and record it, both
   inside one transaction, so a failing migration leaves no partial state.

Applied files are never re-run, so startup is safe to repeat (REQ-7.4).
`runMigrations(pool)` returns the filenames it applied — empty on a repeat run,
which is what the idempotency test asserts on rather than parsing log output.

**Triggered by** `backend/entrypoint.sh`, which the Dockerfile sets as `CMD`:

```sh
#!/bin/sh
set -e
node dist/db/migrate.js
node dist/db/seed.js
node dist/src/index.js
```

`set -e` stops the chain if any step fails — a broken migration must not be followed
by a seed attempt against a schema that isn't there. This script is the only place
migrations run; there is no separate manual step and no `npm run migrate` a reviewer
needs to remember. It runs every time the `backend` container starts, which is what
makes 3.3's idempotency guarantee load-bearing rather than incidental — a second
`docker-compose up` re-triggers the same three steps against the same volume, and
the migration table plus `ON CONFLICT` clauses are what make that a no-op instead of
an error.

**Why `dist/src/index.js` and not `dist/index.js`.** `migrate.ts` and `seed.ts` live
in `backend/db/`, outside `src/`, so `tsconfig.json` compiles both directories
(`rootDir: "."`). The common root is `backend/`, which puts the output at
`dist/db/…` and `dist/src/…`. The alternative — moving the runners into `src/db/` —
would split the SQL from the code that runs it, so the entry-point path moved
instead.

**The runners locate their `.sql` files relative to their own module** (via
`import.meta.url`), never via the working directory, so the same code works when run
from source (`tsx db/migrate.ts`, and the integration tests) and from `dist` in the
container. `npm run build` therefore copies `db/migrations/*.sql` and `db/seed.sql`
next to the compiled output as part of the build.

### 3.4 Seed data (REQ-1.9)

```sql
-- 1. Skills
INSERT INTO skills (name) VALUES ('Frontend'), ('Backend')
  ON CONFLICT (name) DO NOTHING;

-- 2. Developers
INSERT INTO developers (name)
SELECT v.name
FROM (VALUES ('Alice'), ('Bob'), ('Carol'), ('Dave')) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM developers d WHERE d.name = v.name);

-- 3. Developer ↔ Skill links
INSERT INTO developer_skills (developer_id, skill_id)
SELECT d.id, s.id
FROM (VALUES
  ('Alice','Frontend'), ('Bob','Backend'),
  ('Carol','Frontend'), ('Carol','Backend'), ('Dave','Backend')
) AS v(dev_name, skill_name)
JOIN developers d ON d.name = v.dev_name
JOIN skills     s ON s.name = v.skill_name
ON CONFLICT DO NOTHING;
```

**These must be three separate statements, not one statement with CTEs.** In
Postgres, a data-modifying CTE is not visible to the rest of the same statement —
every part sees the snapshot from before the statement started. Written as one
statement, step 3's `JOIN developers` would see the table as it was *before* step 2
inserted anything, match zero rows on a fresh database, and silently insert no
skill links at all. Run as separate statements, each one sees the effects of the
previous.

The seed is idempotent — `ON CONFLICT DO NOTHING` plus the `NOT EXISTS` check means
running it against an already-seeded database changes nothing. This matters because
`docker-compose up` may run more than once against the same volume (REQ-7.4), and
plain `INSERT`s would either duplicate developers or fail on the second run.

**Triggered by** `db/seed.ts` — a few lines that read `seed.sql` and execute it
against the same `pg` Pool `migrate.ts` uses. The whole file is passed to one
`query()` call: `pg` sends it as a simple query, and Postgres runs the statements
sequentially inside one implicit transaction, so statement 3 sees the developers
statement 2 inserted — the sequencing the previous paragraph depends on. Invoked
from `entrypoint.sh`, right after migrations, as shown in 3.3.

**Both `migrate.ts` and `seed.ts` export a callable function** (`runMigrations(pool)`,
`runSeed(pool)`) and only run themselves when executed directly as a script. The
integration tests in 8.2 need to prepare a disposable database in a setup hook, and
they cannot shell out to a container to do it — they import and call these functions
against a test pool. Without this split the same SQL would have to be duplicated in
test fixtures, which is exactly how test and production schemas drift apart.

---

## 4. Backend Design

### 4.1 API contract

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/health` | — | `200 {status}` | — |
| GET | `/health/db` | — | `200 {status,db}` | `503` |
| GET | `/tasks` | — | `200 Task[]` (trees) | — |
| GET | `/tasks/:id` | — | `200 Task` (tree) | `404` |
| POST | `/tasks` | `CreateTaskInput` | `201 Task` (tree) | `400` |
| PATCH | `/tasks/:id/assign` | `{assigneeId: number\|null}` | `200 Task` | `400`, `404` |
| PATCH | `/tasks/:id/status` | `{status: TaskStatus}` | `200 Task` | `400`, `404` |
| GET | `/developers` | — | `200 Developer[]` | — |
| GET | `/developers/:id` | — | `200 Developer` | `404` |
| GET | `/skills` | — | `200 Skill[]` | — |

`GET /tasks` returns only top-level tasks (`parent_task_id IS NULL`), each with its
subtasks nested inside — returning every row flat would list each subtask twice,
once standalone and once inside its parent.

**Task response shape** (`GET`, and the `PATCH` responses):

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

**Create request shape** (REQ-2.1) — recursive, one call for the whole tree (REQ-5.7):

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

`skillIds` and `subtasks` are both optional and default to `[]`. An empty `skillIds`
is the trigger for LLM inference (REQ-6.1, assumption 5).

**The `skillInferenceFailed` field (REQ-6.6).** The `POST /tasks` response uses the
standard Task shape above, with one extra optional boolean field, `skillInferenceFailed`,
on each node. Its three possible states:

| `skills` | `skillInferenceFailed` | Meaning |
|---|---|---|
| non-empty | field absent | Skills were supplied by the user, or inferred successfully |
| `[]` | field absent | Skills were supplied by the user as an explicit empty list — not reachable in the shipped build, since an empty `skillIds` always triggers inference |
| `[]` | `true` | Inference was attempted and did not yield any seeded skill (REQ-6.4) |

**Implementation (phase 6).** The middle row was originally written as "the LLM
legitimately returned none". Phase 6 made that state a *failure* instead, per §5.3's
"JSON with no valid skill names": a response of `{"skills":[]}`, or one naming only
skills that aren't seeded, leaves the task exactly as unclassified as a network error
does, and REQ-6.1's promise is that a task created without skills gets some. Reporting
one silently and the other with a toast would draw a distinction the user cannot act
on. The row is kept in the table because it remains the correct reading of the
response shape — a client must not assume an empty `skills` implies the flag.

Without this field the last two rows would be indistinguishable — both are an empty
`skills` array — and the frontend would have no way to know whether to show the
failure notification required by REQ-4.6. The field appears **only** in the
`POST /tasks` response, never in `GET` responses, because it describes what happened
during that one request rather than a stored property of the task (see 3.2).

Example of a node where inference failed:

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

**Implementation (phase 5).** The recursive `subtasks` array is expressed with
`z.lazy` in `src/schemas/task.ts` — a `z.object({...})` literal cannot reference the
const it is being assigned to, so the self-reference is deferred to parse time, with
an explicit `z.ZodType<CreateTaskRequest, z.ZodTypeDef, CreateTaskInput>` annotation
because TypeScript cannot infer a type defined in terms of itself. One schema applied
at every level is what makes a malformed node rejected at *any* depth. Validation
messages are built by `formatValidationIssues`, which prefixes each issue with its
path (`subtasks.0.subtasks.1.title: title must not be empty`) — without the path, a
failure deep inside a tree would report only "title must not be empty" and leave the
caller no way to tell which node was bad.

**Error shape**, consistent across all endpoints:

```json
{ "error": { "code": "SKILL_MISMATCH", "message": "Bob does not have the required skill: Frontend" } }
```

Codes: `VALIDATION_ERROR`, `NOT_FOUND`, `SKILL_MISMATCH`, `SUBTASKS_NOT_DONE`.
A machine-readable `code` lets the frontend branch on the failure type; the `message`
is what gets shown to the user.

**Implementation.** `src/errors/AppError.ts` pairs each code with the HTTP status
that goes with it (`AppError.notFound(msg)`, `.validation(msg)`, `.skillMismatch(msg)`,
`.subtasksNotDone(msg)`), so a route just `throw`s rather than building the response
body itself. Routes are wrapped in `asyncHandler` (`src/middleware/errorHandler.ts`),
which forwards a rejected promise to `next(err)` — Express 4 does not await handlers,
so an un-caught rejection would otherwise become an unhandled rejection instead of a
response. A single `errorHandler`, registered last, turns any `AppError` into
`{error:{code,message}}` with its status, and anything else into a `500` with the
same shape, so the contract holds even for a bug that wasn't anticipated. A catch-all
route registered just before it turns an unmatched path into `404 NOT_FOUND` rather
than Express's default HTML page, so the shape is consistent even off the documented
routes.

### 4.2 Skill matching (REQ-1.8, REQ-2.4)

Assignment is allowed only when the developer's skills are a **superset** of the
task's required skills (assumption 2):

```ts
function developerCanBeAssigned(devSkillIds: number[], taskSkillIds: number[]): boolean {
  const owned = new Set(devSkillIds);
  return taskSkillIds.every(id => owned.has(id));
}
```

Worked example, using the seeded data:

| Task requires | Bob (Backend) | Carol (Frontend, Backend) |
|---|---|---|
| `[Backend]` | allowed | allowed |
| `[Frontend]` | `400` | allowed |
| `[Frontend, Backend]` | `400` | allowed |
| `[]` | allowed | allowed |

A task with no required skills accepts anyone, which falls out of the rule naturally:
`[].every(...)` is `true`.

The same function is reused on the frontend to filter the assignee dropdown
(REQ-3.3), so the list the user sees and the rule the server enforces cannot diverge.
The server still re-checks — a filtered dropdown is a convenience, not a guarantee.

**Implementation (phase 4).** "Reused" here means a hand-kept copy —
`frontend/src/lib/developerCanBeAssigned.ts` is byte-for-byte the same function as
the backend's, not a cross-package import. The two are separate npm packages built
into separate Docker images from separate build contexts (REQ-0.1), so nothing in
`backend/` is available to copy into the frontend image at build time. The same
applies to the shared response shapes: `frontend/src/types/` mirrors
`backend/src/types/` file-for-file (see §6.5's implementation note).

### 4.3 The recursive Done rule (REQ-2.5, REQ-5.3)

A status change to `Done` is rejected if **any** descendant, at any depth, is not
`Done`. Checking only direct children would be wrong: a child could be `Done` while
its own child is not.

One recursive CTE — the database does the traversal:

```sql
WITH RECURSIVE descendants AS (
  SELECT id, status FROM tasks WHERE parent_task_id = $1
  UNION ALL
  SELECT t.id, t.status
  FROM tasks t
  JOIN descendants d ON t.parent_task_id = d.id
)
SELECT COUNT(*)::int AS blocking FROM descendants WHERE status <> 'Done';
```

`blocking > 0` → reject with `400 SUBTASKS_NOT_DONE`. One round trip regardless of
depth or size, versus one query per level if walked in application code.

Worked example — marking task 1 `Done`:

```
1  Parent          To-do     ← the request target
└─ 2  Child A      Done
   └─ 3  Grandchild  To-do   ← blocking, two levels down
```

The anchor term (`SELECT … WHERE parent_task_id = 1`) finds task 2. The recursive
term joins task 3 onto it. The final count sees task 3 as blocking, so the request is
rejected. A direct-children-only check would have seen only task 2 (`Done`) and
wrongly allowed the change.

Statuses other than `Done` skip the check entirely — nothing prevents moving a parent
back to `To-do`.

**Implementation (phase 5).** `countBlockingDescendants(pool, id)` in
`src/db/tasks.ts` holds the query; `PATCH /tasks/:id/status` calls it only when the
requested status is `Done`, after the 404 check and before the write, and turns a
non-zero count into `400 SUBTASKS_NOT_DONE` with the count in the message. It counts
rather than returning the offending rows because the caller needs only a yes/no.

Note that the worked example's state — a `Done` child above a `To-do` grandchild — is
reachable precisely *because* the rule is one-directional: it is produced by marking
the grandchild `Done`, then the child `Done`, then moving the grandchild back to
`To-do`. Marking the child `Done` while its own child was still `To-do` would itself
have been rejected by the same rule.

### 4.4 Reading trees

SQL returns rows, not nested objects, so a tree is fetched flat and assembled in
memory. The recursive CTE selects exactly the rows in scope; a single pass links
children to parents.

```sql
WITH RECURSIVE tree AS (
  SELECT * FROM tasks WHERE id = $1              -- or: parent_task_id IS NULL, for GET /tasks
  UNION ALL
  SELECT t.* FROM tasks t JOIN tree ON t.parent_task_id = tree.id
)
SELECT tree.id, tree.title, tree.status, tree.parent_task_id,
       d.id AS assignee_id, d.name AS assignee_name,
       COALESCE(
         json_agg(json_build_object('id', s.id, 'name', s.name))
           FILTER (WHERE s.id IS NOT NULL),
         '[]'
       ) AS skills
FROM tree
LEFT JOIN developers  d  ON d.id  = tree.assignee_id
LEFT JOIN task_skills ts ON ts.task_id = tree.id
LEFT JOIN skills      s  ON s.id  = ts.skill_id
GROUP BY tree.id, tree.title, tree.status, tree.parent_task_id, d.id, d.name
ORDER BY tree.id;
```

`json_agg … FILTER` collects each task's skills into one JSON array in the same
query, so there is no second round trip and no N+1. `COALESCE(…, '[]')` turns a task
with no skills into an empty array rather than `[null]`. `ORDER BY tree.id` (added in
phase 5, once trees could actually have more than one child) makes the response
deterministic: a recursive CTE has no defined row order and `buildForest` preserves
whatever order it is handed, so without it a task's subtasks could come back in a
different order on each request. Ordering by id is creation order, which for a tree
written by one depth-first `insertTaskTree` is the order the user entered the nodes in.

**Row mapping.** With no ORM, nothing converts column names automatically: `pg`
returns keys exactly as the database names them, so a row arrives as
`{ id, title, status, parent_task_id, assignee_id, assignee_name, skills }`. A small
`toTaskRow(row)` function in `src/db/mapping.ts` maps each row to the camelCase shape
the rest of the code and the API contract use, and folds `assignee_id`/`assignee_name`
into the nested `assignee` object (or `null`). Every query result passes through it, so
column naming stays confined to the `db/` layer rather than leaking into services and
routes. The raw shape (`DbTaskRow`) is declared next to the mapper; the mapped shapes
(`TaskRow`, `TaskNode`, `Skill`, `TaskStatus`) live in `src/types/task.ts`.

Assembling the rows into a forest, once rows are mapped:

```ts
function buildForest(rows: TaskRow[]): TaskNode[] {
  const byId = new Map(rows.map(r => [r.id, { ...r, subtasks: [] as TaskNode[] }]));
  const roots: TaskNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentTaskId === null ? null : byId.get(node.parentTaskId);
    if (parent) parent.subtasks.push(node);
    else roots.push(node);
  }
  return roots;
}
```

Linear in the number of tasks, no depth limit. Note the `parent` lookup rather than a
bare null check: for `GET /tasks/:id` on a subtask, the target's own parent is outside
the fetched set, so it correctly becomes the root of the returned tree.

At take-home scale this is comfortably fast. If the table grew large, `GET /tasks`
would need pagination over root tasks — noted as a known limit, not built.

**Implementation split.** `src/db/tasks.ts` exposes this as two functions rather
than one parameterized query — `getAllTaskRows(pool)` anchored on
`parent_task_id IS NULL` (`GET /tasks`) and `getTaskTreeRows(pool, id)` anchored on
`id = $1` (`GET /tasks/:id`) — since the two anchors need different `WHERE` clauses
and only one takes a parameter; both share the same `SELECT … FROM tree` fragment
shown above. `buildForest` itself lives in `src/services/buildForest.ts`, alongside
the other pure business rules (4.2, 4.3), not in `db/`.

**`GET /developers` uses a different shape of query.** A developer has *two*
independent one-to-many relations off the same row — skills and assigned tasks —
so the join-plus-`GROUP BY` pattern above would cross-multiply every skill against
every assigned task. `src/db/developers.ts` instead pulls each into its own JSON
array with a correlated subquery:

```sql
SELECT d.id, d.name,
  COALESCE((SELECT json_agg(json_build_object('id', s.id, 'name', s.name))
            FROM developer_skills ds JOIN skills s ON s.id = ds.skill_id
            WHERE ds.developer_id = d.id), '[]') AS skills,
  COALESCE((SELECT json_agg(json_build_object('id', t.id, 'title', t.title, 'status', t.status))
            FROM tasks t WHERE t.assignee_id = d.id), '[]') AS assigned_tasks
FROM developers d;
```

Still one round trip, still `COALESCE`d to `[]`, just two independent subqueries
instead of one join — the right tool once there is more than one child relation to
aggregate per row.

### 4.5 Creating a tree (REQ-2.1, REQ-5.7)

**Phase 3 implemented a flat subset of this**: `POST /tasks` accepted only `title`
and `skillIds`, via an `insertFlatTask` that opened a transaction for its two writes.
**Phase 5 replaced it** with the full recursive version below (`insertTaskTree` in
`src/db/tasks.ts`); LLM inference (steps 2–3) still arrives in phase 6.

The whole tree is created inside **one database transaction**, so a failure part-way
leaves nothing behind rather than a half-built tree:

1. Validate the request body with the recursive Zod schema. Reject with `400` on
   any malformed node, before touching the database.
2. Walk the tree, collecting every node whose `skillIds` is empty.
3. Run LLM inference for those nodes **in parallel** (`Promise.allSettled`) — see 5.2.
4. `BEGIN`. Insert depth-first: `INSERT INTO tasks … RETURNING id`, then pass that id
   as `parent_task_id` to each child and recurse. Insert `task_skills` rows per node.
5. `COMMIT`. Re-read the tree (4.4) and return it, attaching any
   `skillInferenceFailed` flags from step 3.

Inference runs before the transaction opens, not inside it. Holding a transaction
open across several network calls to an external API would keep a database
connection locked for as long as the slowest LLM response takes.

All queries in one request use a single client checked out from the `pg` Pool, since
`BEGIN`/`COMMIT` are connection-scoped — issuing them on pooled connections at random
would not form a transaction.

**Implementation (phase 5).** `insertTaskTree(pool, root)` checks out one client,
`BEGIN`s, and hands it to a private `insertTaskNode(client, node, parentTaskId)` that
inserts the task row, takes the id from `RETURNING`, writes that node's `task_skills`
rows, then recurses into each child with that id as `parent_task_id`. Its awaits are
sequential rather than `Promise.all`: one `pg` client is one connection and cannot run
queries concurrently, and this is the client the transaction is open on. `ROLLBACK` on
any error, `client.release()` in `finally`, so a failed tree neither leaves rows behind
nor leaks the connection.

Step 1's validation is extended slightly beyond the schema: `collectSkillIds`
(`src/services/collectSkillIds.ts`) gathers the de-duplicated skill ids from *every*
node in the tree, and `findMissingSkillIds` checks them in one round trip before the
transaction opens. Checking only the root's ids would let a bad id on a grandchild
through to surface as a foreign-key violation mid-insert — a `500` where the contract
calls for a `400 VALIDATION_ERROR`.

---

## 5. LLM Integration (Part 5)

### 5.1 Configuration (REQ-6.7)

| Variable | Committed default | Notes |
|---|---|---|
| `LLM_BASE_URL` | yes | non-sensitive |
| `LLM_MODEL` | yes (`gemini-2.0-flash`) | non-sensitive |
| `LLM_TIMEOUT_MS` | yes (`10000`) | non-sensitive |
| `LLM_MODE` | yes (`live`) | `live` \| `stub` \| `fail` — see 5.4 |
| `LLM_API_KEY` | **no** | supplied via `.env` at container start |

Read once at startup into a typed config object. If `LLM_API_KEY` is missing the
backend still boots — every inference attempt then fails and falls back per REQ-6.4,
so a reviewer who forgets the key gets a working app with a clear notification
rather than a container that won't start.

The remaining environment variables are not LLM-related but belong in the same
`.env.example` template (REQ-7.5), all with committed defaults:

| Variable | Default | Notes |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `app` / `app` / `taskdb` | consumed by the `db` service |
| `DATABASE_URL` | `postgresql://app:app@db:5432/taskdb` | read by the backend's pg Pool; host is the compose service name |
| `PORT` | `4000` | backend listen port, also the nginx upstream |
| `FRONTEND_PORT` | `3000` | host port the SPA is published on |

### 5.2 Inference

One call per node needing skills, from the node's own title only (assumption 7 — no
parent context, no sibling context). Nodes are inferred concurrently, so a tree with
five unskilled nodes costs roughly one LLM round trip, not five.

Prompt, using the PDF's three examples as few-shot guidance (REQ-6.5):

```
You classify software task descriptions by the skills required to implement them.

Valid skills: Frontend, Backend
Return one or both. Return only JSON: {"skills": ["Frontend"]}

Examples:
"As a visitor, I want to see a responsive homepage so that I can easily navigate
 on both desktop and mobile devices." -> {"skills":["Frontend"]}
"As a system administrator, I want audit logs of all data access and modifications
 so that I can ensure compliance with data protection regulations and investigate
 any security incidents." -> {"skills":["Backend"]}
"As a logged-in user, I want to update my profile information and upload a profile
 picture so that my account details are accurate and personalized."
 -> {"skills":["Frontend","Backend"]}

Task: "<title>"
```

Gemini's `responseMimeType: "application/json"` with a response schema constrains
output to the enum, which removes most parsing failures at the source rather than
handling them after the fact.

Returned names are mapped to `skills.id` values. Anything not matching a seeded
skill name is dropped rather than created — the skill set is fixed at
`Frontend`/`Backend`, and letting the model invent skills would corrupt the
matching rule in 4.2.

**Implementation (phase 6).** `src/llm/prompt.ts` holds the text above
(`buildPrompt(title)`), with the three examples written as single unwrapped lines —
the line breaks in the block above are only this document's column width, and
feeding them to the model would put newlines inside the example titles.
`src/llm/geminiClient.ts` `POST`s it to
`{baseUrl}/v1beta/models/{model}:generateContent` with `temperature: 0`, since
classification wants the most likely answer every time rather than variety. The API
key travels in an `x-goog-api-key` header rather than the `?key=` query parameter
Google's quickstart uses: a URL ends up in access logs and error messages, and the
key must not (REQ-6.7). The configured timeout is enforced with an `AbortController`,
not merely awaited — `fetch` has no default deadline, so a hung connection would
otherwise keep the whole `POST /tasks` request waiting indefinitely.

### 5.3 Failure handling (REQ-6.4, REQ-6.6, REQ-4.6)

Treated as failures: network error, non-2xx, timeout, unparseable JSON, JSON with no
valid skill names.

On failure the node is created with **no skills** and marked
`skillInferenceFailed: true` in the response. The task creation itself always
succeeds — an external API being down must not stop someone recording a task.

`Promise.allSettled` (not `Promise.all`) is deliberate: one node failing must not
cancel inference for its siblings.

The frontend reads the flag and shows a transient, non-blocking notification
(REQ-4.6). Failures are also logged server-side with the task title and the reason,
so a reviewer seeing the toast can find out why in the container logs.

### 5.4 Test double

`LLM_MODE` (default `live`) also accepts `stub` and `fail`. In `stub` mode the client
returns a deterministic classification from keyword matching, with no network call;
in `fail` mode every call throws. This exists so e2e tests (8.3) can cover both the
success and failure paths without depending on an external service, a network
connection, or free-tier quota. The stub is selected by configuration only — the
production path is unchanged.

---

## 6. Frontend Design

### 6.1 Routes (REQ-0.7)

| Route | Page |
|---|---|
| `/` | Task List Page |
| `/tasks/new` | Task Creation Page |

React Router handles both client-side — no full reload, which is what makes this an
SPA rather than two documents.

### 6.2 Component tree

```
App
├── Toaster                       ← transient notifications (REQ-4.6)
├── TaskListPage
│   └── TaskTable
│       └── TaskRow (recursive — renders its own subtasks indented)
│           ├── SkillTags
│           ├── AssigneeControl   ← dropdown + Update button (REQ-3.2–3.4)
│           └── StatusControl     ← dropdown + Update button (REQ-3.5–3.6)
└── TaskCreationPage
    ├── TaskFormNode (recursive)  ← REQ-5.4–5.6
    └── SaveButton
```

**Implementation (phase 4, superseded in phase 5).** Phase 4 was flat tasks only, so
`TaskCreationPage` rendered a plain title `<input>` and `SkillMultiSelect` directly,
with `SkillMultiSelect` written so phase 5 could reuse it unchanged inside
`TaskFormNode`. **Phase 5 replaced that** with the recursive `TaskFormNode` and a
single `DraftNode` tree in `useState`, as §6.3 describes; `SkillMultiSelect` was
indeed reused unmodified. "Save" is a plain `<button type="submit">` inside the form
rather than a separate `SaveButton` component — it holds no state of its own beyond
the surrounding form's, so a dedicated component would only add a file with no
behavior in it.

`Toaster` is a module-level publish/subscribe store (`toast.success`/`toast.error`
functions plus a `Toaster` component that subscribes to them) rather than a React
Context provider wrapping the tree. This lets any component — including ones
outside `App`'s render tree, like a future non-component caller — raise a toast
without needing to be rendered under a `<ToastProvider>`, and keeps `Toaster` a
plain sibling of the pages exactly as drawn above.

`TaskRow` already recursed over `task.subtasks` in phase 4, even though nothing had
subtasks then (every node's `subtasks` array was empty) — the recursion was free
(REQ-2.2's response shape always includes `subtasks: []`) and meant phase 5 needed no
structural change to this component when nesting arrived.

**Implementation (phase 5).** Phase 5 added only presentation to it: an outline
number (`1`, `1.1`, `1.1.1`, matching the PDF wireframe) built from the parent's
outline plus the child's index, and `aria-level`. Indentation alone is a weak cue in
a flat `<table>`, where every row is a DOM sibling whatever it is in the data, and it
conveys nothing to a screen reader — the outline states the nesting, and `aria-level`
exposes the depth that the visual indent gives everyone else.

### 6.3 `TaskFormNode` — one component, every depth (REQ-5.6)

The requirement is a single reusable component invoked recursively, not one
component per nesting level. It renders its own fields, then maps over its children
and renders `TaskFormNode` again for each:

```tsx
function TaskFormNode({ node, onChange, onAddSubtask, depth = 0 }: Props) {
  return (
    <div style={{ marginLeft: depth * 24 }} className="task-form-node">
      <input
        value={node.title}
        onChange={e => onChange({ ...node, title: e.target.value })}
        placeholder="Task title"
      />
      <SkillMultiSelect
        selected={node.skillIds}
        onChange={skillIds => onChange({ ...node, skillIds })}
      />
      <button type="button" onClick={() => onAddSubtask(node.localId)}>
        Add Subtask
      </button>

      {node.subtasks.map(child => (
        <TaskFormNode
          key={child.localId}
          node={child}
          depth={depth + 1}
          onChange={updated => onChange(replaceChild(node, updated))}
          onAddSubtask={onAddSubtask}
        />
      ))}
    </div>
  );
}
```

`depth` drives indentation only — it does not change behavior, and there is no
maximum. This is what produces the wireframe's 1 → 1.1 → 1.1.1 nesting from one
component definition.

**State shape.** The whole form is one tree in `useState` on the page, mirroring the
`POST /tasks` body shape so submit is a direct serialization with no transformation:

```ts
type DraftNode = {
  localId: string;      // crypto.randomUUID(), client-only
  title: string;
  skillIds: number[];
  subtasks: DraftNode[];
};
```

`localId` exists because nodes need stable React `key`s before the server has
assigned real `id`s. It is stripped before sending, by `toCreateTaskInput`, which is
the *only* transformation submit performs — the draft shape is otherwise already the
request body, which is what keeps the whole tree to one `POST` (REQ-5.7). Verified in
the browser against the running stack: building a four-node, three-level tree and
clicking Save issues exactly one `POST /api/tasks`, whose body is the full nested
structure with per-node `skillIds` and no `localId` anywhere.

**Adding a subtask** (REQ-5.5) walks the tree to the node with the matching
`localId` and appends to *that node's* `subtasks` array — not the root's. This is
the difference between the wireframe's nested structure and a flat list:

```ts
function addSubtaskTo(node: DraftNode, targetId: string): DraftNode {
  if (node.localId === targetId) {
    return { ...node, subtasks: [...node.subtasks, emptyNode()] };
  }
  return { ...node, subtasks: node.subtasks.map(c => addSubtaskTo(c, targetId)) };
}
```

Updates are immutable (new objects rather than mutation) so React re-renders
correctly.

**Implementation (phase 5).** `TaskFormNode` (`src/components/TaskFormNode.tsx`)
takes one extra prop over the sketch above — `skills`, the Skill catalogue fetched
once by the page — because `SkillMultiSelect` renders a checkbox per Skill and a
node-level component should not each fetch it. The state helpers (`DraftNode`,
`emptyNode`, `addSubtaskTo`, `replaceChild`, `toCreateTaskInput`) live together in
`src/lib/draftTree.ts` rather than inside the component, so they are plain functions
testable without rendering.

Two details worth naming:

- `onAddSubtask` is passed straight down, unwrapped, while `onChange` is wrapped in
  `replaceChild` at each level. They differ because they address nodes differently:
  `onChange` receives an updated *self* and has to fold it into its parent one hop at
  a time, whereas `onAddSubtask` carries a `localId` that the page resolves against
  the whole tree with `addSubtaskTo`. Wrapping `onAddSubtask` the same way would
  re-target the click at whichever node handled the callback — precisely the
  "adds to the root instead of that node" bug REQ-5.5 rules out.
- `newLocalId()` falls back to a page-local counter where `crypto.randomUUID` is
  undefined. Compose serves the SPA on `http://localhost:3000`, which is a secure
  context, but a reviewer opening it over a LAN address would otherwise crash on the
  first render.

Nodes carry `data-testid="task-form-node"` and `data-depth`, which is what the
end-to-end run asserts nesting against.

### 6.4 The Update-button pattern (REQ-3.2–3.6)

Both `AssigneeControl` and `StatusControl` follow the identical three-state
behavior. Each row owns its own state — updating one row never disables another.

| State | Dropdown | Update button |
|---|---|---|
| Value matches saved value | enabled | **disabled** |
| Value changed, not yet saved | enabled | **enabled** |
| Request in flight | **disabled** | disabled, shows "Saving…" |

```tsx
const [selected, setSelected] = useState(task.assignee?.id ?? null);
const [saving, setSaving] = useState(false);
const dirty = selected !== (task.assignee?.id ?? null);

<select disabled={saving} value={selected ?? ""} onChange={...}>…</select>
<button disabled={!dirty || saving} onClick={submit}>
  {saving ? "Saving…" : "Update"}
</button>
```

On success the row updates and a success toast appears. On `400` the control reverts
to the last saved value and an error toast shows the server's message — so a rejected
assignment or a blocked `Done` leaves the UI matching what is actually stored.

**Implementation.** The "revert to the last saved value" needs no separate
tracking variable: `dirty`/`selected` are compared against the `task` prop directly,
and the parent (`TaskListPage`, via `replaceTaskInTree`) only replaces a task in
state when the `PATCH` **succeeds**. On a `400`, the prop is therefore still the old
value, so the revert is just `setSelected(task.assignee?.id ?? null)` (or
`setSelected(task.status)` for `StatusControl`) — reading the same prop the dropdown
was already comparing against, not a second copy of it. Both controls' `catch` block
does this and calls `toast.error(err.message)`; both `try` blocks call
`onTaskUpdated(updated)` and `toast.success(...)` beforehand.

The assignee dropdown lists only eligible developers (REQ-3.3), using the same
superset check as 4.2. The status dropdown always lists all three statuses — the
`Done` rule depends on subtask state the server owns, so it is enforced server-side
and surfaced as a rejection rather than by hiding the option.

### 6.5 Data fetching

Plain `fetch` behind typed wrappers in `src/api/`, with page-level `useState` +
`useEffect`. No data-fetching library: there are five endpoints and two pages, so
TanStack Query's caching and invalidation would be more configuration than the app
justifies. Response types are shared with the backend via a small `types/` module,
so an API change breaks compilation rather than silently breaking at runtime.

**Implementation.** "Shared" means shape-compatible, not literally imported: since
frontend and backend are independently deployable services built from separate
Docker contexts (`build: ./frontend`, `build: ./backend` in `docker-compose.yml`,
REQ-0.1), `frontend/src/types/{task,developer,error}.ts` is a hand-kept copy of
`backend/src/types/{task,developer,error}.ts`, each file carrying a comment saying
so. `src/api/client.ts` holds one `request()` wrapper — parses the `{error:{code,
message}}` body on a non-2xx response into a thrown `ApiError` — with `getJson`/
`postJson`/`patchJson` on top of it; `tasks.ts`, `developers.ts`, `skills.ts` each
wrap one resource's endpoints using the shared types for both the parameter and
return types. The "breaks compilation" acceptance was proved directly: renaming a
field in `frontend/src/types/task.ts` alone (simulating the backend changing its
response shape without the frontend's copy being updated) fails `tsc -b`, confirming
the coupling is real rather than just documented.

---

## 7. Containerization (Part 6)

### 7.1 Services

```yaml
services:
  db:
    image: postgres:16-alpine
    environment: [POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB]
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER"]
      interval: 5s
      retries: 10

  backend:
    build: ./backend
    environment:
      - PORT=4000
      - DATABASE_URL=${DATABASE_URL:-postgresql://app:app@db:5432/taskdb}
      - LLM_BASE_URL=${LLM_BASE_URL:-https://generativelanguage.googleapis.com}
      - LLM_MODEL=${LLM_MODEL:-gemini-2.0-flash}
      - LLM_TIMEOUT_MS=${LLM_TIMEOUT_MS:-10000}
      - LLM_MODE=${LLM_MODE:-live}
      - LLM_API_KEY=${LLM_API_KEY}
    depends_on:
      db: { condition: service_healthy }

  frontend:
    build: ./frontend
    ports: ["${FRONTEND_PORT:-3000}:80"]
    depends_on: [backend]

volumes:
  pgdata:
```

`condition: service_healthy` (REQ-7.3) waits for Postgres to actually accept
connections. Plain `depends_on` only waits for the container to start, which is not
the same thing — Postgres accepts no connections for the first second or two, and
the backend would crash on its first query.

`${VAR:-default}` supplies committed defaults for non-sensitive settings while
leaving `LLM_API_KEY` with no default, so it must come from `.env` (REQ-6.7, REQ-7.5).
Because these are container *environment* values rather than build arguments,
changing the key takes effect on the next `docker-compose up` with no rebuild — and
the key is never baked into an image layer.

The published frontend port is `${FRONTEND_PORT:-3000}` rather than a hard-coded
`3000`, so a reviewer whose host already has something on port 3000 can move the app
with a one-line `.env` change instead of editing `docker-compose.yml`.

### 7.2 Images

Both use multi-stage builds — the toolchain needed to compile is not needed to run,
and leaving it out keeps the images small. A `.dockerignore` in each service keeps
the host's `node_modules/` and `dist/` out of the build context, so the image never
picks up host-built (wrong-architecture) artifacts.

- **backend**: build stage installs all dependencies, copies `src/` and `db/`, and
  compiles TS → JS (the `.sql` files are copied next to the output by the build
  script, per 3.3). Runtime stage copies `dist/`, production-only `node_modules`,
  the `db/` directory and `entrypoint.sh` onto `node:20-alpine`, setting it as
  `CMD ["./entrypoint.sh"]` — this is what actually runs the sequence in 3.3 each
  time the container starts.
- **frontend**: build stage runs `vite build`; runtime stage copies `dist/` into
  `nginx:alpine` with a config that serves the SPA and proxies `/api` to `backend`.

The `/api` proxy is `proxy_pass http://backend:4000/` with a trailing slash, which
strips the `/api` prefix: the browser calls `/api/health` and the backend sees
`/health`. The backend therefore needs no knowledge of the prefix, and the paths in
section 4.1 are the paths it actually serves. `vite.config.ts` applies the same
rewrite to its dev-server proxy so `npm run dev` behaves identically to the
container.

The nginx config falls back to `index.html` for unknown paths, so deep-linking to
`/tasks/new` or refreshing that page works — without it, nginx would look for a file
at that path and return 404.

### 7.3 Startup

The backend entrypoint runs, in order: the migration runner (3.3), then the
idempotent seed (3.4), then the server. Both steps are safe to repeat, so restarting
a container against an existing volume is a no-op rather than an error — verified by
`docker-compose restart backend`, after which the runner reports no pending
migrations and the developer and skill-link counts are unchanged.

The `/health/db` check (REQ-0.4) opens a pooled connection and runs `SELECT 1`,
answering 503 when that fails. The pool is created with a bounded
`connectionTimeoutMillis` and an `error` handler, because the default is to wait
indefinitely and to surface pool-level failures as an uncaught exception — either
would turn "Postgres is down" into "the backend is down" instead of a 503.

This is what makes REQ-7.4 true. Stated concretely, that requirement means the
reviewer's entire setup is:

```
git clone <repo>
cd <repo>
cp .env.example .env      # then paste the provided LLM_API_KEY into it
docker-compose up
```

and then opening `http://localhost:3000` shows a working app with Alice, Bob, Carol
and Dave already present. No database created by hand, no migration command, no seed
command, no `npm install` on the host, no build step. Anything that would require a
fifth line in that list is a defect against REQ-7.4.

---

## 8. Testing

Three layers, each covering what the layer below cannot.

### 8.1 Unit (Vitest)

Pure functions, no database, no network:

- `developerCanBeAssigned` — the full matrix in 4.2, including the empty-skills case.
- `buildForest` — a three-level tree; a subtask fetched as its own root; an empty set.
- `addSubtaskTo` — appends to a nested target, not the root; leaves siblings untouched.
- LLM response parsing — valid JSON, malformed JSON, unknown skill names, empty array.

### 8.2 Integration (Vitest + `fetch`)

The Express app is started in a setup hook against a real Postgres (a disposable
database, migrated and seeded per run). Tests call it with Node's global `fetch`.

**The harness** (`backend/test/helpers/`, built in 3.9). `testDatabase.ts` connects
to Postgres's own `postgres` maintenance database — same host/user/password as
`DATABASE_URL`, only the database name swapped — to `CREATE DATABASE` a uniquely
named, empty database per call, and to `DROP DATABASE` it afterwards (terminating
any lingering backends first, since Postgres refuses to drop a database still in
use). `testServer.ts` points `DATABASE_URL` at that database *before* dynamically
`import()`-ing `src/db/pool.ts`, `db/migrate.ts`, `db/seed.ts` and `src/app.ts` — the
pool is opened as a module-load side effect, so importing it any earlier would bind
to whatever `DATABASE_URL` happened to be set to first. It then runs
`runMigrations`/`runSeed` and calls `app.listen(0)` for an ephemeral port. Each
integration test file calls this once in a top-level `beforeAll`; Vitest resets the
module registry between test files, so each file's dynamic imports are independent
even when files run concurrently. No Docker is required — only a reachable Postgres
server (REQ-0.9) — so this also runs against a plain local `postgresql@16` install,
not just the compose `db` service.

Phase 3 (3.10) covers what phase 3 actually implements — flat tasks, no subtasks,
no LLM:

- `GET /skills`, `GET /developers`, `GET /developers/:id` → seeded data back, `404`
  on an unknown developer.
- `GET /tasks`, `GET /tasks/:id` → top-level only, skills arrays populated (never
  `[null]`), `404` on an unknown id.
- `POST /tasks` with an invalid body (empty title, unknown skill id) → `400`, and no
  row written.
- `PATCH /assign`: Bob → Frontend-only task → `400 SKILL_MISMATCH`; Carol → same →
  `200`; a task with no required skills accepts any developer; `assigneeId: null`
  unassigns; unknown task/developer id → `404`.
- `PATCH /status` → each of the three valid statuses succeeds; a value outside the
  enum → `400 VALIDATION_ERROR`; unknown task id → `404`.

The remaining scenarios below need subtasks and LLM inference, neither of which
exist until phases 5 and 6:

- `POST /tasks` with a nested body → all nodes created with correct `parent_task_id`.
- `PATCH /status` → `Done` with a `To-do` grandchild → `400 SUBTASKS_NOT_DONE`;
  after the grandchild is `Done`, the same call → `200`.
- LLM in `stub` mode → empty `skillIds` gets filled; in `fail` mode → task still
  created, `skillInferenceFailed: true` present.

### 8.3 End-to-end (Playwright)

Runs a real browser against the full docker-compose stack, with `LLM_MODE` set per
scenario. These cover the interaction rules that no API test can reach.

| ID | Scenario | Verifies |
|---|---|---|
| E2E-1 | Create a task with skills selected → appears on the list with those skills | REQ-4.1–4.5, 3.1 |
| E2E-2 | On a Frontend-only task, open the assignee dropdown | Bob absent, Alice and Carol present (REQ-3.3) |
| E2E-3 | Change assignee: button disabled at first, enabled after change, dropdown disabled mid-request, both settle after success | REQ-3.2, 3.4 |
| E2E-4 | Change status through its own Update button | REQ-3.5, 3.6 |
| E2E-5 | Build a 3-level tree with "Add Subtask" at each level, save, reopen the list | REQ-5.4–5.7; nesting preserved |
| E2E-6 | Set a parent to `Done` while a grandchild is `To-do` → error toast, dropdown reverts; mark all descendants `Done`, retry → succeeds | REQ-5.3, 2.5 |
| E2E-7 | `LLM_MODE=stub`: create a task with no skills → skills appear without user action | REQ-6.1, 6.3 |
| E2E-8 | `LLM_MODE=fail`: create a task with no skills → task saved with no skills, non-modal toast appears and auto-dismisses | REQ-6.4, 4.6 |

E2E-3 and E2E-8 are the reason this layer exists: "the button is disabled until the
value changes" and "a toast appears and then disappears" are statements about the
browser, not about HTTP responses.

Covered by REQ-0.9.

---

## 9. Mapping to Build Phases

Detailed in `phase-1.md` through `phase-7.md`; the boundaries below are what those
documents expand on.

| Phase | Covers | Design sections | Requirements |
|---|---|---|---|
| 1 | Skeleton: three services, health checks | 1, 7.1 | REQ-0.1–0.6, 0.8, 7.1–7.3, 7.5 |
| 2 | Schema, migration runner, seed | 3 | REQ-1.1–1.7, 1.9, 1.10; REQ-7.4 partially |
| 3 | Task/Developer/Skill endpoints, flat (no nesting yet) | 4.1, 4.2, 4.4 | REQ-0.9, 1.8, 2.2–2.4, 2.6–2.8; REQ-2.1 and 2.5 partially |
| 4 | Task List + Creation pages | 6.1, 6.2, 6.4, 6.5 | REQ-0.7, 3.1–3.6, 4.1–4.5 |
| 5 | Subtasks: tree create/read, Done rule, recursive form | 4.3–4.5, 6.3 | REQ-0.9, 2.2, 2.3, 3.1, 5.1–5.7; completes REQ-2.1, 2.5 |
| 6 | LLM inference, failure flag, notification | 5 | REQ-0.9, 4.6, 6.1–6.7 |
| 7 | E2E suite, final containerization, `.env`, README | 7, 8.3, 2 | REQ-0.9, 7.1, 7.2, 7.4, 7.5, 8.1–8.5 |

Two requirements are delivered across two phases, which is deliberate. **REQ-2.1**
(`POST /tasks`) is built in phase 3 accepting title and skills only; phase 5 adds the
recursive `subtasks` array. **REQ-2.5** (`PATCH /status`) is built in phase 3 with no
subtask check, since no task can have subtasks yet; phase 5 adds the recursive Done
rule. Neither is finished until phase 5, and the phase-5 exit check must re-verify
both rather than assuming phase 3 settled them.

`GET /tasks` and `GET /tasks/:id` (REQ-2.2, REQ-2.3) follow the same pattern without
being called out as a formal split: phase 3 delivers them against flat tasks, and
phase 5's tree-reading logic (4.4) is what actually fulfills the "including nested
subtasks" part of their wording. They're listed under both phases in the table above
for that reason.

Unit and integration tests are written within the phase that introduces the code they
cover, not deferred to phase 7. Only the browser-level e2e suite waits, since it needs
the full stack running.

Each phase ends in a verifiable state, so a fault is caught inside the phase that
introduced it rather than several phases later.
</parameter_invoke_name>