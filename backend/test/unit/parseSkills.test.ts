import { describe, expect, it } from 'vitest';
import { parseSkillInference } from '../../src/llm/parseSkills.js';
import type { Skill } from '../../src/types/task.js';

/** The seeded skill set (REQ-1.9) — ids as `seed.sql` produces them. */
const SEEDED: Skill[] = [
  { id: 1, name: 'Frontend' },
  { id: 2, name: 'Backend' },
];

/** The ids of a classification, or a failure if it wasn't one. */
function ids(rawText: string, seeded: Skill[] = SEEDED): number[] {
  const result = parseSkillInference(rawText, seeded);
  if (!result.classifiable) {
    throw new Error(`expected a classification, got classifiable:false for ${rawText}`);
  }
  return result.skillIds;
}

describe('parseSkillInference (6.3, REQ-6.5)', () => {
  describe('valid responses', () => {
    it('maps one skill name to its seeded id', () => {
      expect(ids('{"classifiable":true,"skills":["Frontend"]}')).toEqual([1]);
      expect(ids('{"classifiable":true,"skills":["Backend"]}')).toEqual([2]);
    });

    it('maps both skill names, permitted for a single title (REQ-6.5)', () => {
      expect(ids('{"classifiable":true,"skills":["Frontend","Backend"]}')).toEqual([1, 2]);
    });

    it('tolerates surrounding whitespace and differing case', () => {
      expect(ids('{"classifiable":true,"skills":[" frontend ","BACKEND"]}')).toEqual([1, 2]);
    });

    it('de-duplicates a repeated name', () => {
      expect(ids('{"classifiable":true,"skills":["Frontend","Frontend"]}')).toEqual([1]);
    });

    it('classifies a response that omits the flag entirely', () => {
      // The schema marks `classifiable` required, so this is a model ignoring
      // its schema. "Classify what you were given" is the safer reading — the
      // alternative silently discards skills the model did return.
      expect(ids('{"skills":["Frontend"]}')).toEqual([1]);
    });
  });

  describe('unclassifiable titles (REQ-6.8) — not a failure', () => {
    it('reports classifiable:false rather than throwing', () => {
      expect(parseSkillInference('{"classifiable":false,"skills":[]}', SEEDED)).toEqual({
        classifiable: false,
      });
    });

    it('lets the flag override skills the model listed anyway', () => {
      // Self-contradiction; the refusal is the answer the model was asked to
      // decide first, and the only one that cannot put a wrong skill on a task.
      expect(parseSkillInference('{"classifiable":false,"skills":["Frontend"]}', SEEDED)).toEqual({
        classifiable: false,
      });
    });

    it('is a distinct outcome from a failure, not an exception', () => {
      expect(() => parseSkillInference('{"classifiable":false,"skills":[]}', SEEDED)).not.toThrow();
    });

    it('ignores a non-boolean flag rather than treating it as a refusal', () => {
      expect(ids('{"classifiable":"no","skills":["Backend"]}')).toEqual([2]);
    });
  });

  describe('unknown names — model-invented skills never reach the database', () => {
    it('drops an unseeded name and keeps the valid ones', () => {
      expect(ids('{"classifiable":true,"skills":["Frontend","Blockchain","DevOps"]}')).toEqual([1]);
    });

    it('fails when every returned name is unrecognised', () => {
      expect(() => parseSkillInference('{"classifiable":true,"skills":["Blockchain"]}', SEEDED)).toThrow(
        /no valid skill names/,
      );
    });

    it('never returns an id that is not in the seeded set', () => {
      const result = ids('{"classifiable":true,"skills":["Frontend","Backend","Mobile","QA"]}');
      const seededIds = new Set(SEEDED.map((skill) => skill.id));

      expect(result.every((id) => seededIds.has(id))).toBe(true);
    });
  });

  describe('malformed responses', () => {
    it('rejects text that is not JSON at all', () => {
      expect(() =>
        parseSkillInference('Sure! The skills are Frontend and Backend.', SEEDED),
      ).toThrow(/unparseable JSON/);
    });

    it('rejects truncated JSON', () => {
      expect(() => parseSkillInference('{"skills":["Front', SEEDED)).toThrow(/unparseable JSON/);
    });

    it('rejects valid JSON of the wrong shape', () => {
      expect(() => parseSkillInference('{"result":["Frontend"]}', SEEDED)).toThrow(
        /unexpected response shape/,
      );
      expect(() => parseSkillInference('["Frontend"]', SEEDED)).toThrow(/unexpected response shape/);
      expect(() => parseSkillInference('"Frontend"', SEEDED)).toThrow(/unexpected response shape/);
      expect(() => parseSkillInference('{"skills":"Frontend"}', SEEDED)).toThrow(
        /unexpected response shape/,
      );
    });

    it('rejects a refusal that omits the skills array, rather than reading it as one', () => {
      // Shape first: without `skills` this is not a classification response at
      // all, and trusting half of a malformed payload would be guessing.
      expect(() => parseSkillInference('{"classifiable":false}', SEEDED)).toThrow(
        /unexpected response shape/,
      );
    });

    it('ignores non-string entries but still uses the usable ones', () => {
      expect(ids('{"classifiable":true,"skills":["Frontend",7,null]}')).toEqual([1]);
    });

    it('quotes the offending response in the error, collapsed to one line', () => {
      expect(() => parseSkillInference('not\n  json', SEEDED)).toThrow('unparseable JSON: not json');
    });
  });

  describe('empty responses', () => {
    it('fails on an empty skills array that claims to be classifiable (design §5.3)', () => {
      // The model contradicted itself: it called the title a software task and
      // then named nothing. REQ-6.8's honest answer is `classifiable:false`.
      expect(() => parseSkillInference('{"classifiable":true,"skills":[]}', SEEDED)).toThrow(
        /no valid skill names/,
      );
    });

    it('fails on an empty skills array with no flag at all', () => {
      expect(() => parseSkillInference('{"skills":[]}', SEEDED)).toThrow(/no valid skill names/);
    });

    it('fails on empty text', () => {
      expect(() => parseSkillInference('', SEEDED)).toThrow(/unparseable JSON/);
    });

    it('fails on a JSON null', () => {
      expect(() => parseSkillInference('null', SEEDED)).toThrow(/unexpected response shape/);
    });

    it('fails when no skills are seeded at all, rather than inventing ids', () => {
      expect(() => parseSkillInference('{"classifiable":true,"skills":["Frontend"]}', [])).toThrow(
        /no valid skill names/,
      );
    });
  });
});
