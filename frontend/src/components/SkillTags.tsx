import type { Skill } from '../types';

/** Renders a Task's required Skills as small pill tags (REQ-3.1). */
export function SkillTags({ skills }: { skills: Skill[] }) {
  if (skills.length === 0) {
    return <span style={{ color: '#888' }}>—</span>;
  }

  return (
    <span style={{ display: 'inline-flex', gap: '0.25rem', flexWrap: 'wrap' }}>
      {skills.map((skill) => (
        <span
          key={skill.id}
          style={{
            background: '#eef',
            border: '1px solid #ccd',
            borderRadius: 12,
            padding: '0.1rem 0.5rem',
            fontSize: '0.85em',
          }}
        >
          {skill.name}
        </span>
      ))}
    </span>
  );
}
