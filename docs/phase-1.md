# Phase 1 — Walking Skeleton

**Goal**: three containers start together and can reach each other. No business
logic. This phase exists so that every later phase can assume the plumbing works.

**Entry state**: empty repository with `.git` initialised.

**Branch**: `git checkout -b phase-1-skeleton`

**Context to load**: `requirements.md` §0; `design.md` §1, §5.1, §7.

**Size**: ~1h with an AI coding assistant (~20 min generating scaffolding and
config files, ~40 min running and verifying the exit check — original hand-written
estimate ~2h).

**Commit per task, not per phase.** Each task below is a commit. Message format:

```
<phase>.<task>: <what changed> (REQ-x.y)

e.g.  1.3: scaffold Express backend with /health endpoint (REQ-0.3)
```

A repo with one commit called "final" tells a reviewer nothing about how the work
was done — this is what "use Git to manage and track changes" in the PDF's
Important Notes is checked against.

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
- [ ] Any deviation from design.md during this phase is reflected back into design.md
- [ ] Merge back to main: `git checkout main && git merge --no-ff phase-1-skeleton`
- [ ] Tag: `git tag phase-1-skeleton`
- [ ] Delete the branch: `git branch -d phase-1-skeleton`
