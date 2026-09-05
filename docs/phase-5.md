# Phase 5 — Subtasks

**Goal**: arbitrary nesting, end to end. This phase completes REQ-2.1 and REQ-2.5,
which phase 3 delivered only in part.

**Entry state**: phase 4 complete. `git checkout main`, confirm `HEAD` is at the
`phase-4-frontend` tag or later — the phase-4 branch itself will already be deleted.

**Branch**: `git checkout -b phase-5-subtasks`

**Context to load**: `requirements.md` §5; `design.md` §4.3, §4.4, §4.5, §6.2, §6.3, §9.

**Size**: ~3h with an AI coding assistant (~1h generating the recursive CTE, tree
insert, and `TaskFormNode` — ~2h reading them closely rather than trusting they're
correct. This is deliberately the least-compressed phase: the recursive CTE and the
transactional tree insert are exactly the kind of logic where AI-generated code can
look right and be subtly wrong, the way the seed statement in Phase 2 did. Original
hand-written estimate ~6h).

**Commit per task, not per phase.** Each task below is a commit. Message format:

```
<phase>.<task>: <what changed> (REQ-x.y)

e.g.  5.4: add recursive CTE Done-rule check to PATCH /status (REQ-5.3)
```

A repo with one commit called "final" tells a reviewer nothing about how the work
was done — this is what "use Git to manage and track changes" in the PDF's
Important Notes is checked against.

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
- [ ] Any deviation from design.md during this phase is reflected back into design.md
- [ ] Merge back to main: `git checkout main && git merge --no-ff phase-5-subtasks`
- [ ] Tag: `git tag phase-5-subtasks`
- [ ] Delete the branch: `git branch -d phase-5-subtasks`
