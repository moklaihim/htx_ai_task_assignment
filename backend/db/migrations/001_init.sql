-- 001_init.sql — initial schema.
-- Status is a Postgres ENUM so the database itself rejects anything outside
-- the three fixed values, rather than trusting the application layer.
CREATE TYPE task_status AS ENUM ('To-do', 'In Progress', 'Done');

CREATE TABLE developers (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE skills (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE developer_skills (
  developer_id INT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  skill_id     INT NOT NULL REFERENCES skills(id)     ON DELETE CASCADE,
  PRIMARY KEY (developer_id, skill_id)
);

CREATE TABLE tasks (
  id             SERIAL PRIMARY KEY,
  title          TEXT        NOT NULL,
  status         task_status NOT NULL DEFAULT 'To-do',
  assignee_id    INT         REFERENCES developers(id) ON DELETE SET NULL,
  parent_task_id INT         REFERENCES tasks(id)      ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE task_skills (
  task_id  INT NOT NULL REFERENCES tasks(id)  ON DELETE CASCADE,
  skill_id INT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, skill_id)
);

CREATE INDEX idx_tasks_parent   ON tasks(parent_task_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
