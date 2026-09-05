# Phase 3 — Backend API (flat)

**Goal**: every endpoint from the API contract, handling single tasks with no
nesting. Subtask support is added in phase 5.

**Entry state**: phase 2 complete. `git checkout main`, confirm `HEAD` is at the
`phase-2-database` tag or later — the phase-2 branch itself will already be deleted.

**Branch**: `git checkout -b phase-3-api`

**Context to load**: `requirements.md` §2; `design.md` §4.1, §4.2, §4.4, §8.1, §8.2.

**Size**: ~2.5h with an AI coding assistant (~1h generating the CRUD endpoints,
which follow the API contract closely — ~1.5h reading and testing the skill-matching
logic in 3.6, since this is the rule the whole app hinges on and needs to be
understood, not just working. Original hand-written estimate ~5h).

**Commit per task, not per phase.** Each task below is a commit. Message format:

```
<phase>.<task>: <what changed> (REQ-x.y)

e.g.  3.7: add PATCH /tasks/:id/assign with skill validation (REQ-2.4)
```

A repo with one commit called "final" tells a reviewer nothing about how the work
was done — this is what "use Git to manage and track changes" in the PDF's
Important Notes is checked against.

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
- [ ] Any deviation from design.md during this phase is reflected back into design.md
- [ ] Merge back to main: `git checkout main && git merge --no-ff phase-3-api`
- [ ] Tag: `git tag phase-3-api`
- [ ] Delete the branch: `git branch -d phase-3-api`
