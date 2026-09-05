import type { Skill } from '../types';

interface Props {
  skills: Skill[];
  selected: number[];
  onChange: (skillIds: number[]) => void;
}

/**
 * Zero-or-more Skill checkbox group (REQ-4.3). Reused unchanged as the
 * per-node skill picker in `TaskFormNode` once subtasks land (design §6.3).
 */
export function SkillMultiSelect({ skills, selected, onChange }: Props) {
  function toggle(id: number) {
    onChange(selected.includes(id) ? selected.filter((skillId) => skillId !== id) : [...selected, id]);
  }

  return (
    <fieldset>
      <legend>Skills</legend>
      {skills.map((skill) => (
        <label key={skill.id} style={{ display: 'block' }}>
          <input type="checkbox" checked={selected.includes(skill.id)} onChange={() => toggle(skill.id)} />
          {skill.name}
        </label>
      ))}
    </fieldset>
  );
}
