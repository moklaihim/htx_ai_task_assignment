# Phase 4 — Frontend Pages

**Goal**: both pages working against the real API, flat tasks only.

**Entry state**: phase 3 complete. `git checkout main`, confirm `HEAD` is at the
`phase-3-api` tag or later — the phase-3 branch itself will already be deleted.

**Branch**: `git checkout -b phase-4-frontend`

**Context to load**: `requirements.md` §3, §4; `design.md` §4.2, §6.1, §6.2, §6.4, §6.5.

**Size**: ~3h with an AI coding assistant (~1.5h generating components — the
Update-button pattern in 4.5/4.6 is small but should be reviewed line by line since
it encodes three distinct states — ~1.5h manually clicking through the exit check,
since "the button stays disabled until the value changes" is a claim about the
browser that only a human clicking it actually confirms. Original hand-written
estimate ~6h).

**Commit per task, not per phase.** Each task below is a commit. Message format:

```
<phase>.<task>: <what changed> (REQ-x.y)

e.g.  4.5: add AssigneeControl with disabled/enabled Update button (REQ-3.4)
```

A repo with one commit called "final" tells a reviewer nothing about how the work
was done — this is what "use Git to manage and track changes" in the PDF's
Important Notes is checked against.

| # | Task | Requirement | Acceptance |
|---|---|---|---|
| 4.1 | React Router with `/` and `/tasks/new`. Navigation is client-side. | REQ-0.7 | No full page reload between pages |
| 4.2 | Typed fetch wrappers in `src/api/`, importing the shared types from 3.1. | — | An API shape change breaks compilation |
| 4.3 | Toaster component: non-modal, auto-dismissing, stacks multiple messages. | — | Dismisses on its own after a few seconds |
| 4.4 | Task List Page: table of title, skills, status, assignee, matching the PDF wireframe. | REQ-3.1 | — |
| 4.5 | `AssigneeControl`: dropdown + Update button, three-state behavior from design §6.4. Options filtered by the same superset rule as 3.6. | REQ-3.2–3.4 | Button disabled until the value changes; dropdown disabled while saving |
| 4.6 | `StatusControl`: same pattern, all three statuses always listed. | REQ-3.5, 3.6 | — |
| 4.7 | Both controls revert to the last saved value on a 400 and show the server's message as an error toast. | REQ-3.4, 3.6 | UI never shows a value the server rejected |
| 4.8 | Task Creation Page: title input, skill multi-select from `GET /skills`, no assignee field, Save posts and navigates back. | REQ-4.1–4.5 | — |

**Note on 4.3**: this task builds the generic Toaster mechanism only — a
non-modal, auto-dismissing notification surface with no specific message wired to
it yet. It isn't tagged against REQ-4.6 because that requirement is specifically
about the LLM skill-inference failure notification, which doesn't exist until the
LLM integration lands in phase 6 (see phase-6.md task 6.7, which does the wiring
and carries the REQ-4.6 tag). Building the mechanism here is still worthwhile: it's
generic UI infrastructure the assignee/status controls in 4.5–4.7 also use for their
own success/error toasts.

**Exit check**
- [ ] Create a task on `/tasks/new`; it appears on the list with the skills chosen
- [ ] The assignee dropdown on a Frontend-only task offers Alice and Carol but not Bob
- [ ] The Update button is disabled until a different value is selected, and the dropdown locks while the request is in flight
- [ ] Both pages work through `docker-compose up`, not only in the Vite dev server
- [ ] Any deviation from design.md during this phase is reflected back into design.md
- [ ] Merge back to main: `git checkout main && git merge --no-ff phase-4-frontend`
- [ ] Tag: `git tag phase-4-frontend`
- [ ] Delete the branch: `git branch -d phase-4-frontend`
