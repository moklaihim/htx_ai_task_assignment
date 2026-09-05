# Phase 2 — Database

**Goal**: schema, migration runner, and seed data, all applied automatically on
container start.

**Entry state**: phase 1 complete. `git checkout main`, confirm `HEAD` is at the
`phase-1-skeleton` tag or later — the phase-1 branch itself will already be deleted.

**Branch**: `git checkout -b phase-2-database`

**Context to load**: `requirements.md` §1; `design.md` §3, §4.4.

**Size**: ~1.5h with an AI coding assistant (~30 min generating the schema,
migration runner, and seed — ~1h verifying, since the seed's correctness must be
checked by actually querying `developer_skills`, per design §3.4, not by reading
the SQL and assuming it's right. Original hand-written estimate ~3h).

**Commit per task, not per phase.** Each task below is a commit. Message format:

```
<phase>.<task>: <what changed> (REQ-x.y)

e.g.  2.3: write idempotent seed.sql as three separate statements (REQ-1.9)
```

A repo with one commit called "final" tells a reviewer nothing about how the work
was done — this is what "use Git to manage and track changes" in the PDF's
Important Notes is checked against.

| # | Task | Requirement | Acceptance |
|---|---|---|---|
| 2.1 | Write `db/migrations/001_init.sql` exactly as design §3.2: enum, five tables, two indexes. | REQ-1.1–1.7, 1.10 | Applies cleanly to an empty database |
| 2.2 | Write `db/migrate.ts`: `schema_migrations` table, sorted filenames, each unapplied file run and recorded in one transaction. Export `runMigrations(pool)`; self-execute only when run directly. | REQ-7.4 | Running twice applies nothing the second time |
| 2.3 | Write `db/seed.sql` as **three separate statements** per design §3.4. | REQ-1.9 | — |
| 2.4 | Write `db/seed.ts`: reads and executes `seed.sql`. Export `runSeed(pool)`; self-execute only when run directly. | REQ-1.9 | — |
| 2.5 | Write `backend/entrypoint.sh` (migrate → seed → server, `set -e`) and set it as the Dockerfile `CMD`. Copy `db/` into the runtime stage. | REQ-7.4 | — |
| 2.6 | Write `src/db/mapping.ts` with `toTaskRow(row)` per design §4.4 — snake_case columns to camelCase, `assignee_id`/`assignee_name` folded into a nested object or `null`. | — | Unit-testable in isolation |

**Exit check**
- [ ] `docker compose down -v && docker compose up` produces a schema with all five tables
- [ ] Alice, Bob, Carol, Dave exist with **exactly** the skills in REQ-1.9 — query `developer_skills` and confirm five rows, not zero (this is the bug design §3.4 warns about)
- [ ] `docker compose restart backend` re-runs migrate and seed with no error and no duplicate rows
- [ ] Inserting a task with an invalid status is rejected by the database
- [ ] Any deviation from design.md during this phase is reflected back into design.md
- [ ] Merge back to main: `git checkout main && git merge --no-ff phase-2-database`
- [ ] Tag: `git tag phase-2-database`
- [ ] Delete the branch: `git branch -d phase-2-database`
