/**
 * Root-cause learning (req 40, 41).
 * When a learner fails, don't assume the concept itself is the problem.
 * Investigate: prerequisite gap / vocabulary gap / misconception / memory failure /
 * application difficulty / question interpretation / careless error.
 */
import { Attempt, Concept, ConceptState, GapCause, ID, KnowledgeGap } from './types';
import { uid } from './utils';

export interface RootCauseInput {
  concept: Concept;
  attempt: Attempt;
  state: ConceptState;
  /** mastery 0..100 per concept id */
  masteryOf: (id: ID) => number;
  /** terms of the concept the learner has not seen (state unknown) */
  unknownTerms: string[];
  givenAnswer?: string;
}

export interface RootCauseResult {
  cause: GapCause;
  rootConceptId?: ID;
  detail: string;
  evidence: string[];
}

export function diagnose(input: RootCauseInput): RootCauseResult {
  const { concept, attempt, state, masteryOf, unknownTerms } = input;

  // 1. misconception triggered? → the concept is misunderstood, not unknown
  if (attempt.misconceptionIds.length > 0) {
    const def = concept.misconceptionDefs.find((d) => d.id === attempt.misconceptionIds[0]);
    return {
      cause: 'misconception',
      detail: def ? `Misconception: ${def.label}` : 'A known misconception pattern appeared',
      evidence: [`wrong answer matched misconception pattern`, `attempt score ${Math.round(attempt.score * 100)}%`],
    };
  }

  // 2. prerequisite gap? → the failure is downstream of missing foundations
  const weakPrereq = concept.prerequisites.find((p) => masteryOf(p) < 30);
  if (weakPrereq != null) {
    return {
      cause: 'prerequisite',
      rootConceptId: weakPrereq,
      detail: `Missing foundation: prerequisite mastery is ${Math.round(masteryOf(weakPrereq))}%`,
      evidence: [
        `question requires prerequisite knowledge`,
        `prerequisite mastery ${Math.round(masteryOf(weakPrereq))}% (needs ≥30%)`,
      ],
    };
  }

  // 3. vocabulary gap? → failed on a question whose terms were never decoded
  if (unknownTerms.length > 0 && (attempt.cognitiveLevel === 'recall' || attempt.cognitiveLevel === 'understanding')) {
    return {
      cause: 'vocabulary',
      detail: `Unfamiliar terms in play: ${unknownTerms.join(', ')}`,
      evidence: [`${unknownTerms.length} key terms never decoded`, 'question tested basic understanding'],
    };
  }

  // 4. memory failure? → previously succeeded, now blank (score very low, no misconception)
  const hadSuccess = state.evidence.recall + state.evidence['delayed-retrieval'] > 0;
  if (hadSuccess && attempt.score < 0.25 && attempt.hintsUsed === 0) {
    return {
      cause: 'memory',
      detail: 'Previously recalled, now lost — decay rather than misunderstanding',
      evidence: [
        `prior recall success recorded`,
        `score ${Math.round(attempt.score * 100)}% without hints`,
        attempt.wasDelayed ? `${Math.round(attempt.daysSincePrev)} days since last review` : '',
      ].filter(Boolean),
    };
  }

  // 5. application difficulty? → knows the idea, can't use it
  if (hadSuccess && (attempt.cognitiveLevel === 'application' || attempt.cognitiveLevel === 'transfer' || attempt.cognitiveLevel === 'problem-solving')) {
    return {
      cause: 'application',
      detail: 'Understanding present but application in new contexts is failing',
      evidence: ['basic recall previously succeeded', 'failure at application/transfer level'],
    };
  }

  // 6. interpretation? → high confidence + wrong + hints eventually helped
  if (attempt.confidence != null && attempt.confidence >= 4 && attempt.score < 0.4) {
    return {
      cause: 'interpretation',
      detail: 'High confidence with a wrong answer — the question was likely misread',
      evidence: [`confidence ${attempt.confidence}/5`, `score ${Math.round(attempt.score * 100)}%`],
    };
  }

  // 7. careless? → slow-ish, partial keywords present, hints helped, eventually close
  if (attempt.score >= 0.3 && attempt.hintsUsed > 0) {
    return {
      cause: 'careless',
      detail: 'Close to the answer with support — likely a slip, not a gap',
      evidence: [`partial score ${Math.round(attempt.score * 100)}%`, `${attempt.hintsUsed} hints used`],
    };
  }

  // default: the concept itself is not learned yet
  return {
    cause: 'application',
    detail: 'Concept not yet learned to this level',
    evidence: [`score ${Math.round(attempt.score * 100)}%`, `cognitive level ${attempt.cognitiveLevel}`],
  };
}

/** Record/update the gap in the learner's gap list. */
export function upsertGap(gaps: KnowledgeGap[], result: RootCauseResult, conceptId: ID, now: number): { gap: KnowledgeGap; isNew: boolean } {
  const existing = gaps.find(
    (g) => g.conceptId === conceptId && g.cause === result.cause && g.rootConceptId === result.rootConceptId && g.status === 'open',
  );
  if (existing) {
    return {
      gap: {
        ...existing,
        occurrences: existing.occurrences + 1,
        lastAt: now,
        evidence: [...new Set([...existing.evidence, ...result.evidence])].slice(0, 6),
        updatedAt: now,
      },
      isNew: false,
    };
  }
  return {
    gap: {
      id: uid('gap'),
      conceptId,
      cause: result.cause,
      rootConceptId: result.rootConceptId,
      detail: result.detail,
      evidence: result.evidence,
      firstAt: now,
      lastAt: now,
      occurrences: 1,
      status: 'open',
      updatedAt: now,
    },
    isNew: true,
  };
}

/** Close gaps whose root cause has been addressed (prereq learned / misconception corrected). */
export function closeResolvedGaps(
  gaps: KnowledgeGap[],
  conceptId: ID,
  now: number,
  resolved: (g: KnowledgeGap) => boolean,
): KnowledgeGap[] {
  return gaps.map((g) => {
    if (g.conceptId === conceptId && g.status === 'open' && resolved(g)) {
      return { ...g, status: 'closed', closedAt: now, updatedAt: now };
    }
    return g;
  });
}
