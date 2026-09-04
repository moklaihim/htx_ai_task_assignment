# Tasks — Task Assignment Application

Implementation plan derived from `design.md`, which is derived from `requirements.md`.
Work proceeds one phase at a time. Each phase is sized for a single working session
and ends in a state you can verify before starting the next.

---

## How to use this document

**One phase per session.** Each phase below opens with a *Context to load* block
listing exactly which documents and files are needed. Starting a fresh session at a
phase boundary and loading only that block is the point of the structure — a long
session accumulates decisions that drift out of view, and the failure that produces
is code that quietly contradicts an earlier decision rather than code that looks
wrong. Reading the current files is ground truth; remembering an earlier
conversation is not.

**Commit per task, not per phase.** Each task below is a commit. Message format:

```
<phase>.<task>: <what changed> (REQ-x.y)

e.g.  3.4: add PATCH /tasks/:id/assign with skill validation (REQ-2.4)
```

This is what "use Git to manage and track changes" in the PDF's Important Notes is
checked against — a panel looking at a repo with one commit called "final" learns
nothing about how the work was done. It also makes drift cheap to find: if phase 6
contradicts something phase 3 established, `git diff` across the boundary shows it.

**Exit checks are not optional.** A phase is done when its exit block passes, not
when the code is written. Finding a broken Done-rule in phase 5 is minutes of work;
finding it in phase 7 means unpicking whatever was built on top of it.

**If an exit check fails**, fix it inside that phase. Do not carry a known failure
forward with a note to come back to it.

**Rough sizing** is given per phase to help pace against the 3-day window (5 with
the extension the PDF permits), assuming an AI coding assistant is used for
implementation. Each figure is split into generation time (fast, since it's mostly
following a pattern already fixed by `design.md`) and verification time (not fast,
since it's a human confirming the generated code is actually correct — the
seed.sql bug caught in `design.md` §3.4 is exactly the kind of plausible-looking
mistake this step exists to catch). Total across all seven phases: **~16 hours**,
against **~31 hours** if written by hand. These are estimates, not commitments, and
verification time in particular should not be compressed below what's shown — the
PDF's own Important Notes require being "familiar with the code," which generation
speed doesn't provide on its own.

---

## Phase 1 — Walking Skeleton

**Goal**: three containers start together and can reach each other. No business
logic. This phase exists so that every later phase can assume the plumbing works.

**Entry state**: empty repository with `.git` initialised.

**Context to load**: `requirements.md` §0; `design.md` §1, §7.

**Size**: ~1h with an AI coding assistant (~20 min generating scaffolding and
config files, ~40 min running and verifying the exit check — original hand-written
estimate ~2h).

| # | Task | Requirement | Acceptance |
|---|---|---|---|
| 1.1 | Create the folder structure from design §1 (`backend/`, `frontend/`, `docs/`, `e2e/`). Move the three spec documents into `docs/`. | — | Structure matches design §1 |
| 1.2 | Write `.gitignore`: `node_modules`, `dist`, `.env`, Playwright artifacts. | REQ-7.5 | `.env` is ignored before any key exists |
| 1.3 | Scaffold the backend: TypeScript, Express, `pg`. `GET /health` returns `{status:"ok"}`. | REQ-0.3, 0.5 | `curl localhost:PORT/health` → 200 |
| 1.4 | Add `src/db/pool.ts` (pg Pool from `DATABASE_URL`) and `GET /health/db` running `SELECT 1`, returning 503 on failure. | REQ-0.4, 0.8 | Returns 503 with Postgres stopped, 200 with it running |
| 1.5 | Scaffold the frontend: Vite + React + TypeScript. One page calling `/api/health` and rendering the result. | REQ-0.6 | Page shows the backend's response |
| 1.6 | Write `backend/Dockerfile` (multi-stage per design §7.2). | REQ-7.2 | Image builds |
| 1.7 | Write `frontend/Dockerfile` + `nginx.conf`: serve the build, proxy `/api` to `backend`, fall back to `index.html`. | REQ-7.1 | Image builds |
| 1.8 | Write `docker-compose.yml` per design §7.1: three services, Postgres healthcheck, `depends_on: condition: service_healthy`. | REQ-0.1, 0.2, 7.3 | — |
| 1.9 | Write `.env.example` with every variable from design §5.1 plus `DATABASE_URL`. Create local `.env`. | REQ-7.5 | — |

**Exit check**
- [ ] `docker-compose up` from a clean clone brings all three services up
- [ ] `http://localhost:3000` renders and shows a healthy backend response
- [ ] `/health/db` returns 200, proving the backend reached Postgres through the compose network
- [ ] Stopping the db container makes `/health/db` return 503, not crash the backend
- [ ] Tag: `git tag phase-1-skeleton`

---

## Phase 2 — Database

**Goal**: schema, migration runner, and seed data, all applied automatically on
container start.

**Entry state**: phase 1 complete.

**Context to load**: `requirements.md` §1; `design.md` §3.

**Size**: ~1.5h with an AI coding assistant (~30 min generating the schema,
migration runner, and seed — ~1h verifying, since the seed's correctness must be
checked by actually querying `developer_skills`, per design §3.4, not by reading
the SQL and assuming it's right. Original hand-written estimate ~3h).

| # | Task | Requirement | Acceptance |
|---|---|---|---|
| 2.1 | Write `db/migrations/001_init.sql` exactly as design §3.2: enum, five tables, two indexes. | REQ-1.1–1.7, 1.10 | Applies cleanly to an empty database |
| 2.2 | Write `db/migrate.ts`: `schema_migrations` table, sorted filenames, each unapplied file run and recorded in one transaction. Export `runMigrations(pool)`; self-execute only when run directly. | REQ-7.4 | Running twice applies nothing the second time |
| 2.3 | Write `db/seed.sql` as **three separate statements** per design §3.4. | REQ-1.9 | — |
| 2.4 | Write `db/seed.ts`: reads and executes `seed.sql`. Export `runSeed(pool)`; self-execute only when run directly. | REQ-1.9 | — |
| 2.5 | Write `backend/entrypoint.sh` (migrate → seed → server, `set -e`) and set it as the Dockerfile `CMD`. Copy `db/` into the runtime stage. | REQ-7.4 | — |
| 2.6 | Write `src/db/mapping.ts` with `toTaskRow(row)` per design §4.4 — snake_case columns to camelCase, `assignee_id`/`assignee_name` folded into a nested object or `null`. | — | Unit-testable in isolation |

**Exit check**
- [ ] `docker-compose down -v && docker-compose up` produces a schema with all five tables
- [ ] Alice, Bob, Carol, Dave exist with **exactly** the skills in REQ-1.9 — query `developer_skills` and confirm five rows, not zero (this is the bug design §3.4 warns about)
- [ ] `docker-compose restart backend` re-runs migrate and seed with no error and no duplicate rows
- [ ] Inserting a task with an invalid status is rejected by the database
- [ ] Tag: `git tag phase-2-database`

---

## Phase 3 — Backend API (flat)

**Goal**: every endpoint from the API contract, handling single tasks with no
nesting. Subtask support is added in phase 5.

**Entry state**: phase 2 complete.

**Context to load**: `requirements.md` §2; `design.md` §4.1, §4.2, §4.4, §8.1, §8.2.

**Size**: ~2.5h with an AI coding assistant (~1h generating the CRUD endpoints,
which follow the API contract closely — ~1.5h reading and testing the skill-matching
logic in 3.6, since this is the rule the whole app hinges on and needs to be
understood, not just working. Original hand-written estimate ~5h).

| # | Task | Requirement | Acceptance |
|---|---|---|---|
| 3.1 | Define shared types in `src/types/` matching the API contract shapes in design §4.1. | — | Frontend can import them later |
| 3.2 | Error middleware producing the `{error:{code,message}}` shape, with the four codes from design §4.1. | — | Consistent across all routes |
| 3.3 | `GET /skills`, `GET /developers`, `GET /developers/:id` — developers include their skills. | REQ-2.6–2.8 | 404 on unknown developer |
| 3.4 | `GET /tasks`, `GET /tasks/:id` using the query in design §4.4 (`json_agg … FILTER`) plus `buildForest`. | REQ-2.2, 2.3 | Skills come back as an array, never `[null]` |
| 3.5 | `POST /tasks` with a Zod schema for title + `skillIds` only. **No `subtasks` yet.** | REQ-2.1 *(partial)* | 400 on empty title or unknown skill id |
| 3.6 | `developerCanBeAssigned` in `src/services/`, plus unit tests for the full matrix in design §4.2. | REQ-1.8 | All four rows of the matrix pass |
| 3.7 | `PATCH /tasks/:id/assign` using 3.6. Rejects with `400 SKILL_MISMATCH`, accepts `null` to unassign. | REQ-2.4 | Bob → Frontend task = 400; Carol = 200 |
| 3.8 | `PATCH /tasks/:id/status`. **No subtask check yet** — nothing can have subtasks. | REQ-2.5 *(partial)* | Rejects a status outside the enum |
| 3.9 | Integration test harness: disposable database, `runMigrations` + `runSeed` in a setup hook, app started in-process, called with global `fetch`. | REQ-0.9 | Runs without Docker |
| 3.10 | Integration tests for 3.3–3.8. | REQ-0.9 | — |

**Exit check**
- [ ] Every endpoint in the design §4.1 table responds, with the documented status codes
- [ ] Assigning Bob to a Frontend-only task returns 400 `SKILL_MISMATCH`; Carol returns 200
- [ ] A task with no required skills accepts any developer
- [ ] Unit and integration tests pass
- [ ] Tag: `git tag phase-3-api`

---

## Phase 4 — Frontend Pages

**Goal**: both pages working against the real API, flat tasks only.

**Entry state**: phase 3 complete.

**Context to load**: `requirements.md` §3, §4; `design.md` §6.1, §6.2, §6.4, §6.5.

**Size**: ~3h with an AI coding assistant (~1.5h generating components — the
Update-button pattern in 4.5/4.6 is small but should be reviewed line by line since
it encodes three distinct states — ~1.5h manually clicking through the exit check,
since "the button stays disabled until the value changes" is a claim about the
browser that only a human clicking it actually confirms. Original hand-written
estimate ~6h).

| # | Task | Requirement | Acceptance |
|---|---|---|---|
| 4.1 | React Router with `/` and `/tasks/new`. Navigation is client-side. | REQ-0.7 | No full page reload between pages |
| 4.2 | Typed fetch wrappers in `src/api/`, importing the shared types from 3.1. | — | An API shape change breaks compilation |
| 4.3 | Toaster component: non-modal, auto-dismissing, stacks multiple messages. | REQ-4.6 | Dismisses on its own after a few seconds |
| 4.4 | Task List Page: table of title, skills, status, assignee, matching the PDF wireframe. | REQ-3.1 | — |
| 4.5 | `AssigneeControl`: dropdown + Update button, three-state behavior from design §6.4. Options filtered by the same superset rule as 3.6. | REQ-3.2–3.4 | Button disabled until the value changes; dropdown disabled while saving |
| 4.6 | `StatusControl`: same pattern, all three statuses always listed. | REQ-3.5, 3.6 | — |
| 4.7 | Both controls revert to the last saved value on a 400 and show the server's message as an error toast. | REQ-3.4, 3.6 | UI never shows a value the server rejected |
| 4.8 | Task Creation Page: title input, skill multi-select from `GET /skills`, no assignee field, Save posts and navigates back. | REQ-4.1–4.5 | — |

**Exit check**
- [ ] Create a task on `/tasks/new`; it appears on the list with the skills chosen
- [ ] The assignee dropdown on a Frontend-only task offers Alice and Carol but not Bob
- [ ] The Update button is disabled until a different value is selected, and the dropdown locks while the request is in flight
- [ ] Both pages work through `docker-compose up`, not only in the Vite dev server
- [ ] Tag: `git tag phase-4-frontend`

---

## Phase 5 — Subtasks

**Goal**: arbitrary nesting, end to end. This phase completes REQ-2.1 and REQ-2.5,
which phase 3 delivered only in part.

**Entry state**: phase 4 complete.

**Context to load**: `requirements.md` §5; `design.md` §4.3, §4.4, §4.5, §6.3, §9.

**Size**: ~3h with an AI coding assistant (~1h generating the recursive CTE, tree
insert, and `TaskFormNode` — ~2h reading them closely rather than trusting they're
correct. This is deliberately the least-compressed phase: the recursive CTE and the
transactional tree insert are exactly the kind of logic where AI-generated code can
look right and be subtly wrong, the way the seed statement in Phase 2 did. Original
hand-written estimate ~6h).

| # | Task | Requirement | Acceptance |
|---|---|---|---|
| 5.1 | Extend the Zod schema for `POST /tasks` to accept a recursive `subtasks` array (Zod `z.lazy`). | REQ-2.1 *(completes)*, 5.1, 5.2 | Rejects a malformed node at any depth |
| 5.2 | Recursive insert inside one transaction on a single pooled client, per design §4.5 — depth-first, passing each `RETURNING id` down as `parent_task_id`. | REQ-5.7 | A failure mid-tree leaves zero rows |
| 5.3 | `GET /tasks` returns roots only (`parent_task_id IS NULL`) with subtasks nested; `GET /tasks/:id` returns the target as root even when it is itself a subtask. | REQ-2.2, 2.3 | Subtasks never appear twice in `GET /tasks` |
| 5.4 | Recursive-CTE descendant check from design §4.3; wire into `PATCH /status` for `Done` only. | REQ-5.3, 2.5 *(completes)* | Blocks on a non-Done grandchild, not just a child |
| 5.5 | Unit tests: `buildForest` on a three-level tree, on a subtask fetched as root, on an empty set. | REQ-0.9 | — |
| 5.6 | Integration tests: nested create; Done blocked by a grandchild then allowed once it is Done. | REQ-0.9 | — |
| 5.7 | `TaskFormNode` — one recursive component per design §6.3, with `localId`, immutable `addSubtaskTo`, and indentation by depth. | REQ-5.4–5.6 | The same component renders every level |
| 5.8 | Task Creation Page holds the whole draft tree in one state object and serializes it in a single POST. | REQ-5.7 | One network request on Save |
| 5.9 | Task List Page renders subtasks nested and indented under their parent. | REQ-3.1 | — |

**Exit check**
- [ ] "Add Subtask" on a nested node adds a child to *that* node, not to the root
- [ ] A three-level tree saves in one request and reads back with nesting intact
- [ ] Setting a parent to `Done` with a `To-do` grandchild is rejected; after every descendant is `Done`, it succeeds
- [ ] `git grep` shows one form-node component, not one per depth (REQ-5.6)
- [ ] Tag: `git tag phase-5-subtasks`

---

## Phase 6 — LLM Skill Identification

**Goal**: automatic skill inference for nodes created without skills, with visible
failure handling.

**Entry state**: phase 5 complete.

**Context to load**: `requirements.md` §6, REQ-4.6; `design.md` §5.

**Size**: ~2h with an AI coding assistant (~1h generating the client, prompt, and
`LLM_MODE` stub/fail paths — ~1h that doesn't compress, since it means waiting on
real responses from Gemini while iterating the prompt against the three PDF example
titles in 6.9. Original hand-written estimate ~4h).

| # | Task | Requirement | Acceptance |
|---|---|---|---|
| 6.1 | Typed config loaded once at startup for all `LLM_*` variables from design §5.1. Missing key must not stop the server booting. | REQ-6.7 | Backend starts with no key set |
| 6.2 | Gemini client: prompt from design §5.2, JSON response mode, timeout from config. | REQ-6.2 | — |
| 6.3 | Response parsing: map names to seeded skill ids, drop anything unrecognised. Unit tests for valid, malformed, unknown-name, and empty responses. | REQ-6.5 | Model-invented skills never reach the database |
| 6.4 | `LLM_MODE` support: `live`, `stub` (deterministic, no network), `fail` (always throws). | — | Selected by config only |
| 6.5 | Wire into `POST /tasks`: collect empty-`skillIds` nodes across the whole tree, infer concurrently with `Promise.allSettled`, **before** the transaction opens. | REQ-6.1, 6.3 | One slow node does not block its siblings |
| 6.6 | On failure: create with no skills, set `skillInferenceFailed: true` on that node in the response only, log the title and reason server-side. | REQ-6.4, 6.6 | Task creation never fails because of the LLM |
| 6.7 | Frontend reads the flag and shows the non-modal auto-dismissing toast naming the affected task(s). | REQ-4.6 | Save is not blocked or rolled back |
| 6.8 | Integration tests in `stub` and `fail` modes. | REQ-0.9 | — |
| 6.9 | Manually check the three PDF titles in `live` mode against design §5.2. | REQ-6.5 | Results match the reference examples |

**Exit check**
- [ ] A task created with no skills gets skills, with no user action
- [ ] A subtask created with no skills is classified from **its own** title, not the parent's (assumption 7)
- [ ] `LLM_MODE=fail`: the task still saves, skills are empty, the toast appears and auto-dismisses
- [ ] With `LLM_API_KEY` removed entirely, the app still runs and behaves as the failure case
- [ ] The three PDF example titles classify correctly in `live` mode
- [ ] Tag: `git tag phase-6-llm`

---

## Phase 7 — E2E, Containerization, Documentation

**Goal**: the submission itself — verified from a clean clone, documented for a
reviewer.

**Entry state**: phase 6 complete.

**Context to load**: `requirements.md` §7, §8, §10; `design.md` §2, §7, §8.3.

**Size**: ~3h with an AI coding assistant (~1h generating e2e specs and a README
draft — ~2h that doesn't compress: the clean-clone rehearsal in 7.7 means actually
deleting the local checkout and starting over from `git clone`, and README claims
about "no manual setup" are only true once verified this way, not once written.
Original hand-written estimate ~5h).

| # | Task | Requirement | Acceptance |
|---|---|---|---|
| 7.1 | Playwright setup against the compose stack. | REQ-0.9 | — |
| 7.2 | Write E2E-1 to E2E-6 from design §8.3. | REQ-0.9 | — |
| 7.3 | Write E2E-7 and E2E-8 with `LLM_MODE` set per scenario. | REQ-0.9 | No live LLM call, no quota use |
| 7.4 | Review both Dockerfiles: multi-stage, production-only dependencies at runtime, `db/` and `entrypoint.sh` present in the backend image. | REQ-7.1, 7.2 | — |
| 7.5 | Confirm `.env.example` lists every variable the app reads, and that changing `LLM_API_KEY` needs no rebuild. | REQ-7.5 | Change key → `docker-compose up` → new key in use |
| 7.6 | README: setup and run, architecture, data model, API reference, library justifications from design §2, and the assumptions from `requirements.md` §10. | REQ-8.1–8.5 | — |
| 7.7 | Full clean-clone rehearsal into an empty directory, following only the README. | REQ-7.4 | Exactly the four commands in design §7.3 |
| 7.8 | Push to the public remote. Send the repo link and the API key to the four addresses in the PDF. | Part 7.2 | Key sent separately from the repo, never committed |

**Exit check**
- [ ] All eight e2e scenarios pass against a freshly built stack
- [ ] Clean clone → `cp .env.example .env` → paste key → `docker-compose up` → working app, no fifth step
- [ ] `git log` shows incremental commits across all seven phases
- [ ] `git grep -i` for the API key across all history finds nothing
- [ ] Every requirement in `requirements.md` is demonstrably satisfied
- [ ] Tag: `git tag v1.0-submission`

---

## Final traceability check

Before sending, walk `requirements.md` top to bottom and point each requirement at
the thing that satisfies it — an endpoint, a component, a test, or a README section.
Anything you cannot point at is unfinished, regardless of how complete the code
looks. This is the same check the panel will perform against the PDF, run one step
earlier.

Two easy things to miss, both from the PDF's own Part 7: the README must justify the
library choices (REQ-8.4), and the repository must actually be public — a private
repo the panel cannot open fails everything else by default.
