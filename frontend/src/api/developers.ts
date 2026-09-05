import { getJson } from './client';
import type { Developer } from '../types';

/** `GET /developers` (REQ-2.6). */
export function fetchDevelopers(): Promise<Developer[]> {
  return getJson<Developer[]>('/developers');
}

/** `GET /developers/:id` (REQ-2.7). */
export function fetchDeveloper(id: number): Promise<Developer> {
  return getJson<Developer>(`/developers/${id}`);
}
