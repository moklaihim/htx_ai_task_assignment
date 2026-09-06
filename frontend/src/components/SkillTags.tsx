import type { Skill } from '../types';

/** Renders a Task's required Skills as small pill tags. */
export function SkillTags({ skills }: { skills: Skill[] }) {
  if (skills.length === 0) {
    return <span className="skill-tags--empty">—</span>;
  }

  return (
    <span className="skill-tags">
      {skills.map((skill) => (
        <span key={skill.id} className="skill-tag">
          {skill.name}
        </span>
      ))}
    </span>
  );
}
