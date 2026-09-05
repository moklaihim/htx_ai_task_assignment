import { describe, expect, it } from 'vitest';
import { parseSkillIds } from '../../src/llm/parseSkills.js';
import type { Skill } from '../../src/types/task.js';

/** The seeded skill set (REQ-1.9) — ids as `seed.sql` produces them. */
const SEEDED: Skill[] = [
  { id: 1, name: 'Frontend' },
  { id: 2, name: 'Backend' },
];

describe('parseSkillIds (6.3, REQ-6.5)', () => {
  describe('valid responses', () => {
    it('maps one skill name to its seeded id', () => {
      expect(parseSkillIds('{"skills":["Frontend"]}', SEEDED)).toEqual([1]);
      expect(parseSkillIds('{"skills":["Backend"]}', SEEDED)).toEqual([2]);
    });

    it('maps both skill names, permitted for a single title (REQ-6.5)', () => {
      expect(parseSkillIds('{"skills":["Frontend","Backend"]}', SEEDED)).toEqual([1, 2]);
    });

    it('tolerates surrounding whitespace and differing case', () => {
      expect(parseSkillIds('{"skills":[" frontend ","BACKEND"]}', SEEDED)).toEqual([1, 2]);
    });

    it('de-duplicates a repeated name', () => {
      expect(parseSkillIds('{"skills":["Frontend","Frontend"]}', SEEDED)).toEqual([1]);
    });
  });

  describe('unknown names — model-invented skills never reach the database', () => {
    it('drops an unseeded name and keeps the valid ones', () => {
      expect(parseSkillIds('{"skills":["Frontend","Blockchain","DevOps"]}', SEEDED)).toEqual([1]);
    });

    it('fails when every returned name is unrecognised', () => {
      expect(() => parseSkillIds('{"skills":["Blockchain"]}', SEEDED)).toThrow(
        /no valid skill names/,
      );
    });

    it('never returns an id that is not in the seeded set', () => {
      const ids = parseSkillIds('{"skills":["Frontend","Backend","Mobile","QA"]}', SEEDED);
      const seededIds = new Set(SEEDED.map((skill) => skill.id));

      expect(ids.every((id) => seededIds.has(id))).toBe(true);
    });
  });

  describe('malformed responses', () => {
    it('rejects text that is not JSON at all', () => {
      expect(() => parseSkillIds('Sure! The skills are Frontend and Backend.', SEEDED)).toThrow(
        /unparseable JSON/,
      );
    });

    it('rejects truncated JSON', () => {
      expect(() => parseSkillIds('{"skills":["Front', SEEDED)).toThrow(/unparseable JSON/);
    });

    it('rejects valid JSON of the wrong shape', () => {
      expect(() => parseSkillIds('{"result":["Frontend"]}', SEEDED)).toThrow(
        /unexpected response shape/,
      );
      expect(() => parseSkillIds('["Frontend"]', SEEDED)).toThrow(/unexpected response shape/);
      expect(() => parseSkillIds('"Frontend"', SEEDED)).toThrow(/unexpected response shape/);
      expect(() => parseSkillIds('{"skills":"Frontend"}', SEEDED)).toThrow(
        /unexpected response shape/,
      );
    });

    it('ignores non-string entries but still uses the usable ones', () => {
      expect(parseSkillIds('{"skills":["Frontend",7,null]}', SEEDED)).toEqual([1]);
    });

    it('quotes the offending response in the error, collapsed to one line', () => {
      expect(() => parseSkillIds('not\n  json', SEEDED)).toThrow('unparseable JSON: not json');
    });
  });

  describe('empty responses', () => {
    it('fails on an empty skills array (design §5.3)', () => {
      expect(() => parseSkillIds('{"skills":[]}', SEEDED)).toThrow(/no valid skill names/);
    });

    it('fails on empty text', () => {
      expect(() => parseSkillIds('', SEEDED)).toThrow(/unparseable JSON/);
    });

    it('fails on a JSON null', () => {
      expect(() => parseSkillIds('null', SEEDED)).toThrow(/unexpected response shape/);
    });

    it('fails when no skills are seeded at all, rather than inventing ids', () => {
      expect(() => parseSkillIds('{"skills":["Frontend"]}', [])).toThrow(/no valid skill names/);
    });
  });
});
