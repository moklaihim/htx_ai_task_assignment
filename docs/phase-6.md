# Phase 6 — LLM Skill Identification

**Goal**: automatic skill inference for nodes created without skills, with visible
failure handling.

**Entry state**: phase 5 complete. `git checkout main`, confirm `HEAD` is at the
`phase-5-subtasks` tag or later — the phase-5 branch itself will already be deleted.

**Branch**: `git checkout -b phase-6-llm`

**Context to load**: `requirements.md` §6, REQ-4.6; `design.md` §5, §6.2, §6.4.

**Size**: ~2h with an AI coding assistant (~1h generating the client, prompt, and
`LLM_MODE` stub/fail paths — ~1h that doesn't compress, since it means waiting on
real responses from Gemini while iterating the prompt against the three PDF example
titles in 6.9. Original hand-written estimate ~4h).

**Commit per task, not per phase.** Each task below is a commit. Message format:

```
<phase>.<task>: <what changed> (REQ-x.y)

e.g.  6.6: create task with empty skills and skillInferenceFailed flag on LLM failure (REQ-6.4)
```

A repo with one commit called "final" tells a reviewer nothing about how the work
was done — this is what "use Git to manage and track changes" in the PDF's
Important Notes is checked against.

| # | Task | Requirement | Acceptance |
|---|---|---|---|
| 6.1 | Typed config loaded once at startup for all `LLM_*` variables from design §5.1. Missing key must not stop the server booting. | REQ-6.7 | Backend starts with no key set |
| 6.2 | Gemini client: prompt from design §5.2, JSON response mode, timeout from config. | — | — |
| 6.3 | Response parsing: map names to seeded skill ids, drop anything unrecognised. Unit tests for valid, malformed, unknown-name, and empty responses. | REQ-6.5 | Model-invented skills never reach the database |
| 6.4 | `LLM_MODE` support: `live`, `stub` (deterministic, no network), `fail` (always throws). | — | Selected by config only |
| 6.5 | Wire into `POST /tasks`: collect empty-`skillIds` nodes across the whole tree, infer concurrently with `Promise.allSettled`, **before** the transaction opens. | REQ-6.1, 6.2, 6.3 | One slow node does not block its siblings |
| 6.6 | On failure: create with no skills, set `skillInferenceFailed: true` on that node in the response only, log the title and reason server-side. | REQ-6.4, 6.6 | Task creation never fails because of the LLM |
| 6.7 | Frontend reads the flag and shows the non-modal auto-dismissing toast naming the affected task(s). | REQ-4.6 | Save is not blocked or rolled back |
| 6.8 | Integration tests in `stub` and `fail` modes. | REQ-0.9 | — |
| 6.9 | Manually check the three PDF titles in `live` mode against design §5.2. | REQ-6.5 | Results match the reference examples |

**Note on 6.2 / 6.5**: building the Gemini client (6.2) is infrastructure — calling
it satisfies nothing on its own. REQ-6.2 ("persist the LLM's inferred Skill(s)...
before returning the creation response") is only actually met once 6.5 wires
inference into the `POST /tasks` flow, since that's the point where inferred
`skillIds` reach the tree-insert logic from design §4.5 and get written to
`task_skills`. REQ-6.2 is tagged there rather than on 6.2 for that reason.

**Exit check**
- [ ] A task created with no skills gets skills, with no user action
- [ ] A subtask created with no skills is classified from **its own** title, not the parent's (assumption 7)
- [ ] `LLM_MODE=fail`: the task still saves, skills are empty, the toast appears and auto-dismisses
- [ ] With `LLM_API_KEY` removed entirely, the app still runs and behaves as the failure case
- [ ] The three PDF example titles classify correctly in `live` mode
- [ ] Any deviation from design.md during this phase is reflected back into design.md
- [ ] Merge back to main: `git checkout main && git merge --no-ff phase-6-llm`
- [ ] Tag: `git tag phase-6-llm`
- [ ] Delete the branch: `git branch -d phase-6-llm`
