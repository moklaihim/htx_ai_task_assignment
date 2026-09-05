import type { Skill } from '../types';

interface Props {
  skills: Skill[];
  selected: number[];
  onChange: (skillIds: number[]) => void;
}

/**
 * Zero-or-more Skill checkbox group (REQ-4.3). Reused unchanged as the
 * per-node skill picker inside `TaskFormNode` (design §6.3), so every node of
 * a subtask tree picks its skills the same way a top-level task does.
 */
export function SkillMultiSelect({ skills, selected, onChange }: Props) {
  function toggle(id: number) {
    onChange(selected.includes(id) ? selected.filter((skillId) => skillId !== id) : [...selected, id]);
  }

  return (
    <fieldset className="skills-fieldset">
      <legend>Skills</legend>
      <div className="skill-options">
        {skills.map((skill) => (
          <label key={skill.id} className="skill-option">
            <input type="checkbox" checked={selected.includes(skill.id)} onChange={() => toggle(skill.id)} />
            {skill.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
