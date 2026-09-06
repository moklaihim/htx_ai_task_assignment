import { getJson } from './client';
import type { Developer } from '../types';

/** `GET /developers`. */
export function fetchDevelopers(): Promise<Developer[]> {
  return getJson<Developer[]>('/developers');
}

/** `GET /developers/:id`. */
export function fetchDeveloper(id: number): Promise<Developer> {
  return getJson<Developer>(`/developers/${id}`);
}
