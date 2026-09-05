# Phase 7 — E2E, Containerization, Documentation

**Goal**: the submission itself — verified from a clean clone, documented for a
reviewer.

**Entry state**: phase 6 complete. `git checkout main`, confirm `HEAD` is at the
`phase-6-llm` tag or later — the phase-6 branch itself will already be deleted.

**Branch**: `git checkout -b phase-7-e2e-docs`

**Context to load**: `requirements.md` §7, §8, §10; `design.md` §2, §7, §8.3.

**Size**: ~3h with an AI coding assistant (~1h generating e2e specs and a README
draft — ~2h that doesn't compress: the clean-clone rehearsal in 7.7 means actually
deleting the local checkout and starting over from `git clone`, and README claims
about "no manual setup" are only true once verified this way, not once written.
Original hand-written estimate ~5h).

**Commit per task, not per phase.** Each task below is a commit. Message format:

```
<phase>.<task>: <what changed> (REQ-x.y)

e.g.  7.6: write README covering setup, design, API, and library justifications (REQ-8.1)
```

A repo with one commit called "final" tells a reviewer nothing about how the work
was done — this is what "use Git to manage and track changes" in the PDF's
Important Notes is checked against.

| # | Task | Requirement | Acceptance |
|---|---|---|---|
| 7.1 | Playwright setup against the compose stack. | REQ-0.9 | — |
| 7.2 | Write E2E-1 to E2E-6 from design §8.3. | REQ-0.9 | — |
| 7.3 | Write E2E-7 and E2E-8 with `LLM_MODE` set per scenario. | REQ-0.9 | No live LLM call, no quota use |
| 7.4 | Review both Dockerfiles: multi-stage, production-only dependencies at runtime, `db/` and `entrypoint.sh` present in the backend image. | REQ-7.1, 7.2 | — |
| 7.5 | Confirm `.env.example` lists every variable the app reads, and that changing `LLM_API_KEY` needs no rebuild. | REQ-7.5 | Change key → `docker compose up` → new key in use |
| 7.6 | README: setup and run, architecture, data model, API reference, library justifications from design §2, and the assumptions from `requirements.md` §10. | REQ-8.1–8.5 | — |
| 7.7 | Full clean-clone rehearsal into an empty directory, following only the README. | REQ-7.4 | Exactly the four commands in design §7.3 |

**Exit check**
- [ ] All eight e2e scenarios pass against a freshly built stack
- [ ] Clean clone → `cp .env.example .env` → paste key → `docker compose up` → working app, no fifth step
- [ ] `git log` shows incremental commits across all seven phases
- [ ] `git grep -i` for the API key across all history finds nothing
- [ ] Every requirement in `requirements.md` is demonstrably satisfied
- [ ] Any deviation from design.md during this phase is reflected back into design.md
- [ ] Merge back to main: `git checkout main && git merge --no-ff phase-7-e2e-docs`
- [ ] Tag: `git tag v1.0-submission`
- [ ] Delete the branch: `git branch -d phase-7-e2e-docs`

---

## Final traceability check

Before you push and submit manually, walk `requirements.md` top to bottom and point
each requirement at the thing that satisfies it — an endpoint, a component, a test,
or a README section. Anything you cannot point at is unfinished, regardless of how
complete the code looks. This is the same check the panel will perform against the
PDF, run one step earlier.

Two easy things to miss, both from the PDF's own Part 7: the README must justify the
library choices (REQ-8.4), and — when you push manually — the repository must
actually be public, since a private repo the panel cannot open fails everything
else by default.
