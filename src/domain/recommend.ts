/**
 * Study recommendation engine (req 31, 32).
 * Always answers "What should I study right now?" — with a reasoned WHY (req 75).
 */
import { ID, Reason } from './types';
import { clamp01, DAY } from './utils';

export interface Candidate {
  conceptId: ID;
  type: 'due' | 'misconception' | 'confusion' | 'gap' | 'new' | 'weak' | 'stale' | 'vocab';
  score: number;
  reasons: Reason[];
  estMinutes: number;
  /** secondary concept (confusion pair partner / gap root) */
  relatedId?: ID;
}

export interface RecommendInput {
  now: number;
  /** due scheduler info per concept */
  due: { conceptId: ID; overdueDays: number; stabilityDays: number; lastReviewedAt: number | null }[];
  weak: { conceptId: ID; mastery: number }[];
  stale: { conceptId: ID; retrievability: number }[];
  newUnlocked: { conceptId: ID; examWeight: number }[];
  misconceptions: { conceptId: ID; triggerCount: number; label: string }[];
  confusions: { aId: ID; bId: ID; count: number }[];
  gaps: { conceptId: ID; rootConceptId?: ID; occurrences: number }[];
  examUrgent?: { conceptId: ID; examTitle: string; daysLeft: number }[];
  goals?: ID[];
}

export function recommend(input: RecommendInput): Candidate[] {
  const out: Candidate[] = [];
  const goalBoost = (id: ID) => (input.goals?.includes(id) ? 12 : 0);

  for (const d of input.due) {
    const urgency = clamp01(d.overdueDays / 3);
    const score = 55 + 30 * urgency + goalBoost(d.conceptId);
    const params: Record<string, string | number> = {
      concept: d.conceptId,
      days: d.lastReviewedAt == null ? 0 : Math.round((input.now - d.lastReviewedAt) / DAY),
      stability: Math.round(d.stabilityDays * 10) / 10,
    };
    out.push({
      conceptId: d.conceptId,
      type: 'due',
      score,
      reasons: [
        d.lastReviewedAt == null
          ? { key: 'rec.due.new', params: { concept: d.conceptId } }
          : { key: 'rec.due', params },
      ],
      estMinutes: 2,
    });
  }

  for (const w of input.weak) {
    out.push({
      conceptId: w.conceptId,
      type: 'weak',
      score: 50 + clamp01(1 - w.mastery / 100) * 30 + goalBoost(w.conceptId),
      reasons: [{ key: 'rec.weak', params: { concept: w.conceptId, mastery: Math.round(w.mastery) } }],
      estMinutes: 3,
    });
  }

  for (const s of input.stale) {
    out.push({
      conceptId: s.conceptId,
      type: 'stale',
      score: 52 + clamp01(1 - s.retrievability) * 20,
      reasons: [{ key: 'rec.stale', params: { concept: s.conceptId, recall: Math.round(s.retrievability * 100) } }],
      estMinutes: 2,
    });
  }

  for (const n of input.newUnlocked) {
    out.push({
      conceptId: n.conceptId,
      type: 'new',
      score: 45 + 20 * n.examWeight + goalBoost(n.conceptId),
      reasons: [{ key: 'rec.new', params: { concept: n.conceptId } }],
      estMinutes: 8,
    });
  }

  for (const m of input.misconceptions) {
    out.push({
      conceptId: m.conceptId,
      type: 'misconception',
      score: 70 + Math.min(15, m.triggerCount * 5) + goalBoost(m.conceptId),
      reasons: [{ key: 'rec.misconception', params: { concept: m.conceptId, count: m.triggerCount } }],
      estMinutes: 4,
    });
  }

  for (const c of input.confusions) {
    out.push({
      conceptId: c.aId,
      relatedId: c.bId,
      type: 'confusion',
      score: 68 + Math.min(12, c.count * 4),
      reasons: [{ key: 'rec.confusion', params: { a: c.aId, b: c.bId } }],
      estMinutes: 4,
    });
  }

  for (const g of input.gaps) {
    out.push({
      conceptId: g.conceptId,
      relatedId: g.rootConceptId,
      type: 'gap',
      score: 75 + Math.min(10, g.occurrences * 2) + goalBoost(g.conceptId),
      reasons: [{ key: 'rec.gap', params: { concept: g.conceptId, root: g.rootConceptId ?? '' } }],
      estMinutes: 6,
    });
  }

  for (const e of input.examUrgent ?? []) {
    const urgency = clamp01(1 - e.daysLeft / 14);
    out.push({
      conceptId: e.conceptId,
      type: 'due',
      score: 60 + 35 * urgency,
      reasons: [{ key: 'rec.examUrgent', params: { exam: e.examTitle, days: Math.round(e.daysLeft), concept: e.conceptId } }],
      estMinutes: 4,
    });
  }

  // dedupe by (conceptId, type), keep highest score
  const best = new Map<string, Candidate>();
  for (const c of out) {
    const k = `${c.conceptId}:${c.type}`;
    const prev = best.get(k);
    if (!prev || c.score > prev.score) best.set(k, c);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/** Bundle candidates to fit available minutes (req 32). */
export function bundle(candidates: Candidate[], minutes: number): Candidate[] {
  const out: Candidate[] = [];
  let budget = minutes;
  for (const c of candidates) {
    if (c.estMinutes <= budget) {
      out.push(c);
      budget -= c.estMinutes;
    }
    if (budget <= 0) break;
  }
  return out;
}
