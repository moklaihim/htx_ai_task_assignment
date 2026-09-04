# Requirements — Task Assignment Application

Source: HTX Software Engineering Take-Home Test PDF.
Each requirement is written in WHEN / THE SYSTEM SHALL / IF-THEN form so it can be
checked off as done or not-done, with no ambiguity. Section numbers reference the
PDF's own Part numbers where applicable.

---

## 0. Non-Functional / Environment Requirements

- **REQ-0.1**: THE SYSTEM SHALL consist of three independently deployable services:
  frontend, backend, and database.
- **REQ-0.2**: THE SYSTEM SHALL be fully startable via a single `docker-compose up`
  command from a clean checkout.
- **REQ-0.3**: THE backend SHALL expose `GET /health`, returning 200 when the process
  is running.
- **REQ-0.4**: THE backend SHALL expose `GET /health/db`, returning 200 only when it
  can successfully execute a query against Postgres.
- **REQ-0.5**: Backend source code SHALL be written in TypeScript running on Node.js,
  using Express.js as the web framework.
- **REQ-0.6**: Frontend source code SHALL be written in TypeScript using React.
- **REQ-0.7**: THE SYSTEM SHALL persist data in PostgreSQL.

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
  - IF the requested status is `Done` AND the Task has subtasks AND any subtask's
    status is not `Done`, THE SYSTEM SHALL reject the request with `400`.
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
- **REQ-6.5**: Given the title "As a visitor, I want to see a responsive homepage so
  that I can easily navigate on both desktop and mobile devices.", THE SYSTEM SHALL
  infer `["Frontend"]`.
- **REQ-6.6**: Given the title "As a system administrator, I want audit logs of all
  data access and modifications so that I can ensure compliance with data protection
  regulations and investigate any security incidents.", THE SYSTEM SHALL infer `["Backend"]`.
- **REQ-6.7**: Given the title "As a logged-in user, I want to update my profile
  information and upload a profile picture so that my account details are accurate
  and personalized.", THE SYSTEM SHALL infer `["Frontend", "Backend"]`.

## 7. Containerization (Part 6)

- **REQ-7.1**: THE SYSTEM SHALL provide a Dockerfile for the frontend service.
- **REQ-7.2**: THE SYSTEM SHALL provide a Dockerfile for the backend service.
- **REQ-7.3**: THE SYSTEM SHALL provide a `docker-compose.yml` starting frontend,
  backend, and Postgres together, with the backend waiting on Postgres being ready.
- **REQ-7.4**: WHEN `docker-compose up` is run from a clean checkout with no manual
  setup beyond supplying an LLM API key, THE SYSTEM SHALL become fully operational:
  seeded data present, both pages reachable, all API operations functional.

## 8. Out of Scope

Not covered, because the source PDF doesn't request them:
- Authentication / authorization — no login is described anywhere in the source document.
- Editing a Task's title or Skills after creation — only status and assignee updates
  are specified.
- Deleting Tasks or Developers.
- Multiple assignees per Task.

## 9. Assumptions

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
7. **Subtasks inherit all Task behavior**, including their own independent LLM skill
   inference, since Part 4.1 states subtasks have "the same properties as a Task."
