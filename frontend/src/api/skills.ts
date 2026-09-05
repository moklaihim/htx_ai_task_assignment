import { getJson } from './client';
import type { Skill } from '../types';

/** `GET /skills` (REQ-2.8). */
export function fetchSkills(): Promise<Skill[]> {
  return getJson<Skill[]>('/skills');
}
