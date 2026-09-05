-- seed.sql — REQ-1.9: Alice (Frontend), Bob (Backend), Carol (Frontend, Backend),
-- Dave (Backend). Idempotent, because entrypoint.sh re-runs it on every container
-- start against a volume that may already hold the data (REQ-7.4).
--
-- These MUST stay three separate statements (design §3.4). A data-modifying CTE
-- is not visible to the rest of the same statement in Postgres, so folding these
-- into one statement would make step 3's joins see the tables as they were before
-- step 2 ran — matching zero rows on a fresh database and silently seeding no
-- skill links at all.

-- 1. Skills
INSERT INTO skills (name) VALUES ('Frontend'), ('Backend')
  ON CONFLICT (name) DO NOTHING;

-- 2. Developers
INSERT INTO developers (name)
SELECT v.name
FROM (VALUES ('Alice'), ('Bob'), ('Carol'), ('Dave')) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM developers d WHERE d.name = v.name);

-- 3. Developer ↔ Skill links
INSERT INTO developer_skills (developer_id, skill_id)
SELECT d.id, s.id
FROM (VALUES
  ('Alice','Frontend'), ('Bob','Backend'),
  ('Carol','Frontend'), ('Carol','Backend'), ('Dave','Backend')
) AS v(dev_name, skill_name)
JOIN developers d ON d.name = v.dev_name
JOIN skills     s ON s.name = v.skill_name
ON CONFLICT DO NOTHING;
