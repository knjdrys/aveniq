/** In-memory registry for active practice tests (not persisted — they are ephemeral). */
import { PracticeTest } from '../../services/examService';

const tests = new Map<string, PracticeTest>();

export function putTest(t: PracticeTest): void {
  tests.set(t.id, t);
}
export function getTest(id: string): PracticeTest | undefined {
  return tests.get(id);
}
export function updateTest(t: PracticeTest): void {
  tests.set(t.id, t);
}
