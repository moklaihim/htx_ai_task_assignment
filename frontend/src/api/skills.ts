import { getJson } from './client';
import type { Skill } from '../types';

/** `GET /skills`. */
export function fetchSkills(): Promise<Skill[]> {
  return getJson<Skill[]>('/skills');
}
