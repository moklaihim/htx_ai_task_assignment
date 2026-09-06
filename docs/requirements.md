# Requirements — Task Assignment Application

Source: HTX Software Engineering Take-Home Test PDF.
Each requirement is written in WHEN / THE SYSTEM SHALL / IF-THEN form so it can be
checked off as done or not-done, with no ambiguity. Section numbers reference the
PDF's own Part numbers where applicable.

---

## 0. Non-Functional / Environment Requirements

- **REQ-0.1**: THE SYSTEM SHALL consist of three independently deployable services:
  frontend, backend, and database.
- **REQ-0.2**: THE SYSTEM SHALL be fully startable via a single `docker compose up`
  command from a clean checkout.
- **REQ-0.3**: THE backend SHALL expose `GET /health`, returning 200 when the process
  is running.
- **REQ-0.4**: THE backend SHALL expose `GET /health/db`, returning 200 only when it
  can successfully execute a query against Postgres.
- **REQ-0.5**: Backend source code SHALL be written in TypeScript running on Node.js,
  using Express.js as the web framework.
- **REQ-0.6**: Frontend source code SHALL be written in TypeScript using React.
- **REQ-0.7**: THE frontend SHALL be a single-page application: navigation between
  the Task List Page and the Task Creation Page SHALL occur client-side, without a
  full browser page reload.
- **REQ-0.8**: THE SYSTEM SHALL persist data in PostgreSQL.
- **REQ-0.9**: THE SYSTEM SHALL include automated tests covering, at minimum: the
  skill-matching rule (REQ-1.8), the recursive Done rule (REQ-5.3), and an
  end-to-end browser run of task creation, assignment, and status update against
  the running stack.

## 1. Data Model (Part 1)

- **REQ-1.1**: A Developer SHALL have a name.
- **REQ-1.2**: A Developer SHALL be able to have zero or more Skills.
- **REQ-1.3**: A Developer SHALL be able to have zero or more Tasks assigned.
- **REQ-1.4**: A Task SHALL have a title.
- **REQ-1.5**: A Task SHALL be able to require zero or more Skills.
- **REQ-1.6**: A Task SHALL have a status, one of: `To-do`, `In Progress`, `Done`.
- **REQ-1.7**: A Skill SHALL be a named entity (e.g. "Frontend", "Backend") that is
  not owned by or unique to a single Developer — many Developers can share a Skill.
- **REQ-1.8**: WHEN a Task is assigned to a Developer, THE SYSTEM SHALL permit the
  assignment only IF the Developer possesses every Skill the Task requires.
- **REQ-1.9**: THE SYSTEM SHALL be seeded on first startup with exactly these four
  Developers: Alice (Frontend), Bob (Backend), Carol (Frontend, Backend), Dave (Backend).
- **REQ-1.10**: A Task SHALL be able to reference at most one parent Task via a
  nullable self-referential relationship in the schema, allowing a Task to be nested
  as a subtask of another Task, and that nesting to repeat to arbitrary depth.

## 2. Backend API — Tasks, Developers, Skills (Part 2)

**Tasks**
- **REQ-2.1**: THE SYSTEM SHALL provide `POST /tasks` to create a Task, accepting a
  title, an optional list of required Skills, and an optional recursive `subtasks`
  array — each entry following the same shape (title, skills, nested subtasks) — so
  that a full task/subtask tree can be created in a single call.
- **REQ-2.2**: THE SYSTEM SHALL provide `GET /tasks` to list every Task with its
  properties (title, skills, status, assignee, subtasks).
- **REQ-2.3**: THE SYSTEM SHALL provide `GET /tasks/:id` to read one Task and all its
  properties, including nested subtasks.
- **REQ-2.4**: THE SYSTEM SHALL provide `PATCH /tasks/:id/assign` to assign a Developer
  to a Task.
  - IF the Developer lacks any Skill the Task requires, THE SYSTEM SHALL reject the
    request with `400` and SHALL NOT change the assignee.
  - IF the Developer possesses every required Skill, THE SYSTEM SHALL update the
    assignee and respond `200` with the updated Task.
- **REQ-2.5**: THE SYSTEM SHALL provide `PATCH /tasks/:id/status` to update a Task's
  status.
  - IF the requested status is `Done` AND the Task has subtasks AND any subtask
    beneath it, checked recursively to full depth, does not have status `Done`,
    THE SYSTEM SHALL reject the request with `400` (see REQ-5.3).
  - OTHERWISE THE SYSTEM SHALL update the status and respond `200` with the updated Task.

**Developers**
- **REQ-2.6**: THE SYSTEM SHALL provide `GET /developers` to list every Developer with
  their properties (name, skills, assigned tasks).
- **REQ-2.7**: THE SYSTEM SHALL provide `GET /developers/:id` to read one Developer and
  all their properties.

**Skills**
- **REQ-2.8**: THE SYSTEM SHALL provide `GET /skills` to list every Skill and its properties.

## 3. Frontend — Task List Page (Part 3)

- **REQ-3.1**: THE Task List Page SHALL display every Task with its title, required
  Skill(s), status, and assignee.
- **REQ-3.2**: THE Task List Page SHALL provide, for each Task row, an assignee
  dropdown and an Update button positioned immediately to its right — one dropdown/
  Update button pair per row.
- **REQ-3.3**: THE assignee dropdown SHALL only offer Developers who possess every
  Skill the Task requires.
- **REQ-3.4**: Each row's Update button SHALL be disabled WHILE its dropdown displays
  the Task's currently assigned Developer, and SHALL become enabled WHEN the user
  selects a different value.
  - WHEN the user clicks that Update button, THE SYSTEM SHALL disable the row's
    assignee dropdown, call `PATCH /tasks/:id/assign`, and re-enable the dropdown once
    the request completes — reflecting the result, success or the `400` rejection, in
    the UI.
- **REQ-3.5**: THE Task List Page SHALL provide, for each Task row, a status dropdown
  and an Update button positioned immediately to its right — one dropdown/Update
  button pair per row.
- **REQ-3.6**: Each row's Update button SHALL be disabled WHILE its dropdown displays
  the Task's current status, and SHALL become enabled WHEN the user selects a
  different value.
  - WHEN the user clicks that Update button, THE SYSTEM SHALL disable the row's
    status dropdown, call `PATCH /tasks/:id/status`, and re-enable the dropdown once
    the request completes — reflecting the result, success or the `400` rejection, in
    the UI.

## 4. Frontend — Task Creation Page (Part 3)

- **REQ-4.1**: THE Task Creation Page SHALL present a form for creating a new Task.
  (Section 5 extends this same page to support subtasks — see REQ-5.4 — rather than
  introducing a separate page.)
- **REQ-4.2**: THE form SHALL let the user enter the Task title.
- **REQ-4.3**: THE form SHALL let the user select zero or more required Skills.
- **REQ-4.4**: THE form SHALL NOT require an assignee at creation time.
- **REQ-4.5**: WHEN the user submits the form, THE SYSTEM SHALL call `POST /tasks`
  and, on success, SHALL reflect the new Task on the Task List Page.
- **REQ-4.6**: WHEN the `POST /tasks` response marks one or more nodes as
  `skillInferenceFailed` (REQ-6.6), THE Task Creation Page SHALL display a
  non-modal notification, auto-dismissing after a few seconds, informing the user
  that automatic skill detection failed for the affected task(s) and that Skills
  were left empty for them. THE affected Task(s) SHALL still be saved with an empty
  Skills list, per REQ-6.4 — this notification is informational only and SHALL NOT
  block or roll back the save.
- **REQ-4.7**: WHEN the `POST /tasks` response marks one or more nodes as
  unclassifiable (REQ-6.8), THE Task Creation Page SHALL display a non-modal,
  auto-dismissing notification that is visually and textually distinct from the
  REQ-4.6 failure notification — stating that no Skills were detected because the
  title does not describe a software task, and SHALL NOT present it as an error.
  THE affected Task(s) SHALL still be saved with an empty Skills list.
- **REQ-4.8**: WHEN the `POST /tasks` response marks one or more nodes as having
  had their Skills chosen by the LLM (REQ-6.9), THE Task Creation Page SHALL
  display a non-modal, auto-dismissing confirmation naming the affected Task(s)
  and, for a single Task, the Skill(s) chosen. IT SHALL be visually distinct from
  the REQ-4.6 and REQ-4.7 notifications, so the three outcomes of inference are
  told apart by colour before the text is read.

## 5. Subtasks (Part 4)

Requirements below (from REQ-5.4 onward) describe the Task Creation Page **after**
the Part 4 modification is applied — i.e. the tree-capable version shown in the
PDF's Part 4.3 wireframe ("Create Task(s)" with per-node "Add Subtask" buttons).
This is the same page defined in REQ-4.1, extended — not a second, separate page.

- **REQ-5.1**: A Task SHALL be able to have zero or more subtasks (schema mechanism
  defined in REQ-1.10).
- **REQ-5.2**: A subtask SHALL have every property a top-level Task has — title,
  required skills, status, assignee, and its own subtasks — so Tasks and subtasks
  share one data shape and nest to arbitrary depth.
- **REQ-5.3**: WHEN a status change to `Done` is requested for a Task or subtask that
  itself has subtasks, THE SYSTEM SHALL permit it only IF every subtask beneath it,
  checked recursively to full depth, already has status `Done`.
- **REQ-5.4**: THE Task Creation Page SHALL let the user add one or more subtasks under
  the top-level Task, and add further subtasks under any subtask, to arbitrary depth.
- **REQ-5.5**: WHEN the user clicks "Add Subtask" on a given node, THE SYSTEM SHALL
  dynamically render a new, independent form component as a child of that specific
  node — not as a sibling of the top-level task.
- **REQ-5.6**: THE SAME reusable form-component type SHALL be used to render the
  top-level Task and every level of nested subtask — one component definition,
  invoked recursively — rather than separate, hard-coded components per nesting depth.
- **REQ-5.7**: WHEN the user submits the Task Creation form, THE SYSTEM SHALL
  serialize the entire task/subtask tree in a single `POST /tasks` request.

## 6. LLM Skill Identification (Part 5)

- **REQ-6.1**: WHEN a Task or subtask is created with an empty required-Skills list,
  THE SYSTEM SHALL call an LLM with the Task's title to infer the required Skill(s).
- **REQ-6.2**: THE SYSTEM SHALL persist the LLM's inferred Skill(s) against that
  Task/subtask before returning the creation response.
- **REQ-6.3**: THE LLM call SHALL happen entirely on the backend; THE SYSTEM SHALL NOT
  require the user to manually trigger skill inference from the frontend.
- **REQ-6.4**: IF the LLM call fails or returns an unparseable response, THE SYSTEM
  SHALL still create the Task with an empty Skills list, rather than failing the
  whole request.
- **REQ-6.5**: THE prompt sent to the LLM SHALL constrain its output to the fixed
  Skill set (`Frontend`, `Backend`), permitting either or both to be returned for a
  single title.

  > Reference examples (PDF Part 5.1) — use these to design and manually verify the
  > prompt; not strict pass/fail requirements, since LLM output for a given title is
  > not guaranteed to be bit-for-bit deterministic:
  > - "As a visitor, I want to see a responsive homepage so that I can easily
  >   navigate on both desktop and mobile devices." → `Frontend`
  > - "As a system administrator, I want audit logs of all data access and
  >   modifications so that I can ensure compliance with data protection
  >   regulations and investigate any security incidents." → `Backend`
  > - "As a logged-in user, I want to update my profile information and upload a
  >   profile picture so that my account details are accurate and personalized."
  >   → `Frontend, Backend`
- **REQ-6.6**: WHEN the LLM call fails or returns an unparseable response for a given
  Task/subtask node, THE `POST /tasks` response SHALL mark that specific node with
  an explicit indicator (e.g. `skillInferenceFailed: true`), distinguishing it from
  any other case where a node's Skills end up empty.
- **REQ-6.7**: Non-sensitive LLM configuration (base URL, model name) SHALL ship as
  committed defaults so no reviewer action is needed for them. THE LLM API key SHALL
  NOT be committed to the repository in any form — not in source, not in a
  Dockerfile, not baked into a built image layer — and SHALL be supplied only at
  container-start time via an environment variable.
- **REQ-6.8**: THE Task title is free text and is not guaranteed to describe a
  software task at all ("buy eggs", "123145", gibberish). THE prompt and the
  response schema SHALL give the LLM an explicit way to answer "this is not a
  software task I can classify", and THE SYSTEM SHALL NOT assign Skills to such a
  title. THE `POST /tasks` response SHALL mark that node with an indicator
  (`skillInferenceUnclassifiable: true`) distinct from REQ-6.6's failure
  indicator, because no failure has occurred — the LLM answered correctly.
- **REQ-6.9**: WHEN the LLM successfully infers Skills for a Task/subtask node,
  THE `POST /tasks` response SHALL mark that node with an indicator
  (`skillInferenceApplied: true`), distinguishing Skills chosen by the LLM from
  Skills the user selected — a populated Skills list is otherwise identical in
  both cases, leaving REQ-4.8's confirmation nothing to key off.

## 7. Containerization (Part 6)

- **REQ-7.1**: THE SYSTEM SHALL provide a Dockerfile for the frontend service.
- **REQ-7.2**: THE SYSTEM SHALL provide a Dockerfile for the backend service.
- **REQ-7.3**: THE SYSTEM SHALL provide a `docker-compose.yml` starting frontend,
  backend, and Postgres together, with the backend waiting on Postgres being ready.
- **REQ-7.4**: WHEN `docker compose up` is run from a clean checkout with no manual
  setup beyond supplying an LLM API key, THE SYSTEM SHALL become fully operational:
  seeded data present, both pages reachable, all API operations functional.
- **REQ-7.5**: THE repository SHALL provide a committed `.env.example` template
  listing every required environment variable, including a placeholder for the LLM
  API key. THE actual `.env` file SHALL be excluded via `.gitignore`. Populating or
  changing the value in `.env` SHALL take effect on the next `docker compose up`
  WITHOUT requiring an image rebuild (i.e. no `--build` flag, no Dockerfile change).

## 8. Documentation & Submission (Part 7)

- **REQ-8.1**: THE repository SHALL contain a `README.md` documenting how to
  configure and run the application, including the `.env` setup described in REQ-7.5.
- **REQ-8.2**: THE README SHALL document the system design — data model, service
  architecture, and how the frontend, backend, and database interact.
- **REQ-8.3**: THE README SHALL document the API: every endpoint from Section 2,
  with request shape, response shape, and status codes.
- **REQ-8.4**: THE README SHALL justify each significant code library and dependency
  chosen.
- **REQ-8.5**: THE README SHALL restate the assumptions listed in Section 10, so a
  reviewer can distinguish stated requirements from decisions made to fill gaps.

## 9. Out of Scope

Not covered, because the source PDF doesn't request them:
- Authentication / authorization — no login is described anywhere in the source document.
- Editing a Task's title or Skills after creation — only status and assignee updates
  are specified.
- Deleting Tasks or Developers.
- Multiple assignees per Task.

## 10. Assumptions

Everything below is a real decision I made where the PDF left a gap. Each should be
restated in the README so it's clear what was assumed versus explicitly required.

1. **Status values** — the PDF only names "To-do", "Done", "etc." I'm assuming a
   fixed enum of `To-do`, `In Progress`, `Done`. Anything beyond `To-do`/`Done` is
   my own addition, not a stated requirement.
2. **Skill matching rule** — "can only be assigned to a Developer with the Skill(s)
   required" is read as: the Developer must have ALL required skills (a superset),
   not just one overlapping skill.
3. **One assignee per Task** — the wireframe shows a single assignee dropdown, so
   I'm assuming single-assignee, not multi-assignee.
4. **LLM provider** — Gemini, for its free tier, following the PDF's own suggestion.
5. **"Without specified Skill(s)"** (Part 5.1) is read as an empty Skills array at
   creation time — not `null`, not an omitted field.
6. **LLM failure handling** — not specified by the PDF; REQ-6.4 defines a safe
   fallback (create with empty skills rather than fail the request).
7. **Subtasks are treated as full Tasks in their own right** — same title field, same
   optional skills field, same LLM classification path. A subtask's required skills
   are inferred from *its own* title, standalone, per REQ-6.1. A subtask never
   copies or inherits skills from its parent Task's skills.
8. **Titles that aren't software tasks** — the PDF's examples are all user stories,
   but the title is a free-text field, so "buy eggs", "123145" or gibberish are
   ordinary inputs. Read as: the LLM must be given an explicit way to decline
   rather than being forced to pick a skill, and a declined title is reported to
   the user as information rather than as a failure (REQ-6.8, REQ-4.7).
9. **Task List "..." column** — the PDF's Task List wireframe shows an unlabelled
   "..." column between Skills and Status. This is read as an indication that further
   Task attributes *may* be displayed, not as a requirement for any specific
   additional column. No extra column is implemented.
