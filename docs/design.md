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
│   ├── entrypoint.sh          # CMD — runs migrate → seed → server (3.3, 7.2)
│   ├── db/
│   │   ├── migrations/       # 001_init.sql, 002_… — plain SQL, applied in order
│   │   ├── migrate.ts        # ~40-line runner, applies migrations/*.sql
│   │   ├── seed.sql          # idempotent data (REQ-1.9)
│   │   └── seed.ts           # thin runner: reads seed.sql, executes it via `pg`
│   └── src/
│       ├── index.ts          # Express app entry
│       ├── db/               # pg Pool + query helpers
│       ├── routes/           # HTTP layer: parse, validate, respond
│       ├── services/         # business rules (skill match, Done rule, tree build)
│       ├── llm/              # Gemini client + prompt
│       └── types/            # shared TS types
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    └── src/
        ├── main.tsx
        ├── api/              # typed fetch wrappers
        ├── pages/
        └── components/
```

Routes are kept thin and business rules live in `services/` so the two rules that
actually matter — skill matching (REQ-1.8) and the recursive Done rule (REQ-5.3) —
sit in plain functions that can be unit-tested without starting an HTTP server.

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

1. Creates `schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ)`
   if absent.
2. Reads `db/migrations/`, sorts filenames.
3. For each file not already in `schema_migrations`: run it and record it, both
   inside one transaction, so a failing migration leaves no partial state.

Applied files are never re-run, so startup is safe to repeat (REQ-7.4).

**Triggered by** `backend/entrypoint.sh`, which the Dockerfile sets as `CMD`:

```sh
#!/bin/sh
set -e
node dist/db/migrate.js
node dist/db/seed.js
node dist/index.js
```

`set -e` stops the chain if any step fails — a broken migration must not be followed
by a seed attempt against a schema that isn't there. This script is the only place
migrations run; there is no separate manual step and no `npm run migrate` a reviewer
needs to remember. It runs every time the `backend` container starts, which is what
makes 3.3's idempotency guarantee load-bearing rather than incidental — a second
`docker-compose up` re-triggers the same three steps against the same volume, and
the migration table plus `ON CONFLICT` clauses are what make that a no-op instead of
an error.

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
against the same `pg` Pool `migrate.ts` uses. Invoked from `entrypoint.sh`, right
after migrations, as shown in 3.3.

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
| `[]` | field absent | User supplied none and the LLM legitimately returned none |
| `[]` | `true` | The LLM call was attempted and failed (REQ-6.4) |

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

**Error shape**, consistent across all endpoints:

```json
{ "error": { "code": "SKILL_MISMATCH", "message": "Bob does not have the required skill: Frontend" } }
```

Codes: `VALIDATION_ERROR`, `NOT_FOUND`, `SKILL_MISMATCH`, `SUBTASKS_NOT_DONE`.
A machine-readable `code` lets the frontend branch on the failure type; the `message`
is what gets shown to the user.

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
GROUP BY tree.id, tree.title, tree.status, tree.parent_task_id, d.id, d.name;
```

`json_agg … FILTER` collects each task's skills into one JSON array in the same
query, so there is no second round trip and no N+1. `COALESCE(…, '[]')` turns a task
with no skills into an empty array rather than `[null]`.

**Row mapping.** With no ORM, nothing converts column names automatically: `pg`
returns keys exactly as the database names them, so a row arrives as
`{ id, title, status, parent_task_id, assignee_id, assignee_name, skills }`. A small
`toTaskRow(row)` function in `src/db/` maps each row to the camelCase shape the rest
of the code and the API contract use, and folds `assignee_id`/`assignee_name` into
the nested `assignee` object (or `null`). Every query result passes through it, so
column naming stays confined to the `db/` layer rather than leaking into services and
routes.

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

### 4.5 Creating a tree (REQ-2.1, REQ-5.7)

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
assigned real `id`s. It is stripped before sending.

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
      - DATABASE_URL=postgresql://...@db:5432/...
      - LLM_BASE_URL=${LLM_BASE_URL:-https://generativelanguage.googleapis.com}
      - LLM_MODEL=${LLM_MODEL:-gemini-2.0-flash}
      - LLM_TIMEOUT_MS=${LLM_TIMEOUT_MS:-10000}
      - LLM_MODE=${LLM_MODE:-live}
      - LLM_API_KEY=${LLM_API_KEY}
    depends_on:
      db: { condition: service_healthy }

  frontend:
    build: ./frontend
    ports: ["3000:80"]
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

### 7.2 Images

Both use multi-stage builds — the toolchain needed to compile is not needed to run,
and leaving it out keeps the images small.

- **backend**: build stage installs all dependencies and compiles TS → JS. Runtime
  stage copies `dist/`, production-only `node_modules`, the `db/migrations/` and
  `db/seed.sql` files, and `entrypoint.sh` onto `node:20-alpine`, setting it as
  `CMD ["./entrypoint.sh"]` — this is what actually runs the sequence in 3.3 each
  time the container starts.
- **frontend**: build stage runs `vite build`; runtime stage copies `dist/` into
  `nginx:alpine` with a config that serves the SPA and proxies `/api` to `backend`.

The nginx config falls back to `index.html` for unknown paths, so deep-linking to
`/tasks/new` or refreshing that page works — without it, nginx would look for a file
at that path and return 404.

### 7.3 Startup

The backend entrypoint runs, in order: the migration runner (3.3), then the
idempotent seed (3.4), then the server. Both steps are safe to repeat, so restarting
a container against an existing volume is a no-op rather than an error.

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

- `POST /tasks` with a nested body → all nodes created with correct `parent_task_id`.
- `POST /tasks` with an invalid body → `400`, and no rows written.
- `PATCH /assign`: Bob → Frontend task → `400 SKILL_MISMATCH`; Carol → same → `200`.
- `PATCH /status` → `Done` with a `To-do` grandchild → `400 SUBTASKS_NOT_DONE`;
  after the grandchild is `Done`, the same call → `200`.
- `GET /tasks` → top-level only, subtasks nested, skills arrays populated.
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