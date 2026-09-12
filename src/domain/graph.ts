/**
 * Prerequisite graph (req 7, 40).
 * Directed knowledge graph over concepts. Powers:
 *  - missing-prerequisite detection (First-Encounter Engine)
 *  - unlock frontier ("what can I learn next")
 *  - root-cause gap analysis
 */
import { ID } from './types';
import { unique } from './utils';

export interface GraphInput {
  /** conceptId → direct prerequisite ids */
  prerequisites: Map<ID, ID[]>;
}

export interface PrereqGap {
  conceptId: ID;
  /** all transitive ancestors with mastery below threshold, deepest-first teaching order = bottom-up */
  missing: ID[];
  /** the direct chain from the concept down to the missing root */
  chain: ID[];
}

function ancestors(start: ID, prerequisites: Map<ID, ID[]>): { order: ID[]; chain: Map<ID, ID[]> } {
  const seen = new Set<ID>();
  const order: ID[] = [];
  const chain = new Map<ID, ID[]>();
  const visit = (id: ID, path: ID[]) => {
    if (seen.has(id)) {
      // merge path into existing chain entry (diamond dependencies)
      const existing = chain.get(id) ?? [];
      chain.set(id, unique([...existing, ...path]));
      return;
    }
    seen.add(id);
    chain.set(id, path);
    order.push(id);
    const prereqs = prerequisites.get(id) ?? [];
    for (const p of prereqs) visit(p, [...path, p]);
  };
  visit(start, []);
  return { order, chain };
}

/**
 * Find missing prerequisites for a concept, given current mastery per concept.
 * masteryBelow: (conceptId) => boolean — true when the learner's mastery/flag is insufficient.
 */
export function findPrereqGaps(
  conceptId: ID,
  prerequisites: Map<ID, ID[]>,
  masteryBelow: (id: ID) => boolean,
): PrereqGap {
  const { order, chain } = ancestors(conceptId, prerequisites);
  const missing = order.filter(masteryBelow);
  // chain from concept to the deepest missing prerequisite
  const chainPath: ID[] = [];
  if (missing.length > 0) {
    const deepest = missing[missing.length - 1];
    chainPath.push(...(chain.get(deepest) ?? []));
    chainPath.push(deepest);
  }
  return { conceptId, missing, chain: chainPath };
}

/** Detect cycles in the prerequisite graph (data quality guard). */
export function detectCycle(prerequisites: Map<ID, ID[]>): ID[] | null {
  const state = new Map<ID, 0 | 1 | 2>(); // 0 unvisited, 1 in-stack, 2 done
  const stack: ID[] = [];
  const dfs = (id: ID): boolean => {
    state.set(id, 1);
    stack.push(id);
    for (const p of prerequisites.get(id) ?? []) {
      const s = state.get(p) ?? 0;
      if (s === 1) {
        stack.push(p);
        return true;
      }
      if (s === 0 && dfs(p)) return true;
    }
    state.set(id, 2);
    stack.pop();
    return false;
  };
  for (const id of prerequisites.keys()) {
    if ((state.get(id) ?? 0) === 0 && dfs(id)) return stack;
  }
  return null;
}

/** Topological order (foundations first). Returns null on cycle. */
export function topoOrder(allIds: ID[], prerequisites: Map<ID, ID[]>): ID[] | null {
  if (detectCycle(prerequisites)) return null;
  const indeg = new Map<ID, number>();
  const dependents = new Map<ID, ID[]>();
  for (const id of allIds) indeg.set(id, indeg.get(id) ?? 0);
  for (const [id, prereqs] of prerequisites) {
    for (const p of prereqs) {
      if (!indeg.has(p)) continue;
      indeg.set(id, (indeg.get(id) ?? 0) + 1);
      dependents.set(p, [...(dependents.get(p) ?? []), id]);
    }
  }
  const queue = allIds.filter((id) => (indeg.get(id) ?? 0) === 0);
  const out: ID[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    out.push(id);
    for (const d of dependents.get(id) ?? []) {
      indeg.set(d, (indeg.get(d) ?? 1) - 1);
      if (indeg.get(d) === 0) queue.push(d);
    }
  }
  return out.length === allIds.length ? out : null;
}

/**
 * The unlock frontier: concepts the learner could now learn because
 * all their prerequisites are sufficiently known.
 */
export function unlockFrontier(
  allIds: ID[],
  prerequisites: Map<ID, ID[]>,
  isKnown: (id: ID) => boolean,
  alreadyLearning: (id: ID) => boolean = () => false,
): ID[] {
  return allIds.filter((id) => !alreadyLearning(id) && (prerequisites.get(id) ?? []).every(isKnown));
}

/** All transitive prerequisites of a set of concepts. */
export function closureOf(ids: ID[], prerequisites: Map<ID, ID[]>): ID[] {
  const set = new Set<ID>();
  const visit = (id: ID) => {
    if (set.has(id)) return;
    set.add(id);
    for (const p of prerequisites.get(id) ?? []) visit(p);
  };
  ids.forEach(visit);
  return [...set];
}
