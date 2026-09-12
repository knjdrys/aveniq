/**
 * Learning service — the application-facing API over the domain engines.
 * Everything the UI does flows through here so the pipeline (req 70) always runs.
 * Clock-injected for testability: the E2E flow (req 81) runs through this
 * exact code with a simulated clock — no database manipulation.
 */
import { AveniqDB } from '../db/db';
import { Clock, realClock } from '../domain/clock';
import {
  Attempt,
  Concept,
  ConceptState,
  ConfusionPair,
  ID,
  Insight,
  KnowledgeGap,
  LearnerModel,
  MisconceptionRecord,
  Question,
} from '../domain/types';
import * as pipeline from '../domain/pipeline';
import { initialState, markConfusedWith } from '../domain/knowledgeState';
import { computeProgress } from '../domain/progress';
import { uid } from '../domain/utils';

export class LearningService {
  constructor(private db: AveniqDB, private clock: Clock = realClock) {}

  async getLearner(): Promise<LearnerModel> {
    const l = await this.db.getLearner();
    if (l) return l;
    const fresh: LearnerModel = {
      id: uid('learner'),
      name: 'Learner',
      createdAt: this.clock.now(),
      xp: 0,
      level: 1,
      streakDays: 0,
      lastStudyDay: null,
      studyDays: [],
      styleStats: {},
      calibrationSamples: [],
      goals: [],
      settings: {
        theme: 'system',
        reduceMotion: false,
        dailyMinutesGoal: 20,
        defaultSessionMinutes: 10,
        notificationsEnabled: false,
        speechEnabled: false,
        speechRate: 1,
        askConfidence: true,
        checkpoints: {
          retrievals: 2,
          delayedRetrievals: 1,
          applications: 1,
          explanations: 1,
          minExplainScore: 0.7,
          minStabilityDays: 7,
          minMastery: 88,
          minPrerequisiteHealth: 0.6,
        },
        ai: { enabled: false, provider: 'none', baseUrl: '', model: '', apiKey: '' },
        locale: 'en',
        syncEnabled: false,
        deviceId: uid('dev'),
      },
      updatedAt: this.clock.now(),
    };
    await this.db.putLearner(fresh);
    return fresh;
  }

  async updateLearner(patch: Partial<LearnerModel>): Promise<LearnerModel> {
    const l = await this.getLearner();
    const next = { ...l, ...patch, updatedAt: this.clock.now() };
    await this.db.putLearner(next);
    return next;
  }

  async conceptState(conceptId: ID): Promise<ConceptState> {
    const existing = await this.db.conceptStates.get(conceptId);
    return existing ?? initialState(conceptId, this.clock.now());
  }

  /** All states as a map (fast path for engines). */
  async statesMap(): Promise<Map<ID, ConceptState>> {
    const all = await this.db.conceptStates.toArray();
    return new Map(all.map((s) => [s.conceptId, s]));
  }

  async concept(conceptId: ID): Promise<Concept | undefined> {
    return this.db.concepts.get(conceptId);
  }

  async questionsFor(conceptId: ID): Promise<Question[]> {
    return this.db.questions.where('conceptId').equals(conceptId).toArray();
  }

  /**
   * CORE: record an attempt through the full pipeline (req 70).
   * Safe write: on failure the attempt is retried once, then surfaced.
   */
  async recordAttempt(input: pipeline.AttemptInput): Promise<pipeline.PipelineResult> {
    const now = this.clock.now();
    const learner = await this.getLearner();
    const concept = await this.concept(input.conceptId);
    if (!concept) throw new Error(`Unknown concept ${input.conceptId}`);
    const question = input.questionId ? await this.db.questions.get(input.questionId) ?? null : null;
    const state = (await this.db.conceptStates.get(input.conceptId)) ?? null;
    const attempts = await this.db.attempts.where('conceptId').equals(input.conceptId).toArray();
    attempts.sort((a, b) => a.ts - b.ts);

    const misconceptions = new Map<ID, MisconceptionRecord>();
    for (const m of await this.db.misconceptions.where('conceptId').equals(input.conceptId).toArray()) {
      misconceptions.set(m.defId, m);
    }

    const confusionPairs = new Map<string, ConfusionPair>();
    for (const p of await this.db.confusionPairs.toArray()) confusionPairs.set(p.id, p);

    const gaps = await this.db.gaps.where('conceptId').equals(input.conceptId).toArray();
    // also gaps rooted elsewhere but about this concept already covered; global gaps list for closeResolved
    const allGaps = await this.db.gaps.toArray();

    const states = await this.statesMap();
    const masteryOf = (id: ID) => states.get(id)?.mastery ?? 0;

    // known vocabulary: words of terms the learner has encountered in FE vocabulary stages
    const knownVocabulary = await this.knownVocabulary();

    const prereqMasteries = concept.prerequisites.map((p) => masteryOf(p));

    const world: pipeline.PipelineWorld = {
      concept,
      question,
      state,
      attempts,
      misconceptions,
      confusionPairs,
      gaps: allGaps,
      learner,
      prereqMasteries,
      masteryOf,
      knownVocabulary,
      checkpoints: learner.settings.checkpoints,
      now,
    };

    const result = pipeline.processAttempt(world, input);

    // persist everything atomically (req 59 safe writes)
    const write = this.db.safeWrite(async () => {
      await this.db.transaction(
        'rw',
        [this.db.attempts, this.db.conceptStates, this.db.misconceptions, this.db.confusionPairs, this.db.gaps, this.db.learner, this.db.insights, this.db.events],
        async () => {
          await this.db.attempts.put(result.attempt);
          await this.db.conceptStates.put(result.state);
          for (const m of result.misconceptionRecords) await this.db.misconceptions.put(m);
          for (const p of result.confusionPairs) await this.db.confusionPairs.put(p);
          for (const g of result.gaps) await this.db.gaps.put(g);
          for (const i of result.insights) await this.db.insights.put(i);
          await this.db.putLearner(result.learner);
        },
      );
      await this.db.appendEvents(result.events);
      return true;
    });
    const w = await write;
    if (!w.ok) {
      // recovery: queue event for diagnostics; never silently drop (req 69)
      await this.db.appendEvents([{ ts: now, type: 'db.writeFailed', payload: { error: w.error, conceptId: input.conceptId } }]);
    }
    return result;
  }

  /** Vocabulary the learner has decoded (lowercased term words + concepts with any attempt). */
  async knownVocabulary(): Promise<Set<string>> {
    const states = await this.db.conceptStates.toArray();
    const known = new Set<string>();
    const concepts = await this.db.concepts.toArray();
    const byId = new Map(concepts.map((c) => [c.id, c]));
    for (const s of states) {
      if (s.firstSeenAt != null || s.attempts > 0) {
        const c = byId.get(s.conceptId);
        if (c) {
          known.add(c.name.toLowerCase());
          for (const alias of c.aliases) known.add(alias.toLowerCase());
        }
      }
    }
    // FE vocabulary stage completion is tracked via attempts on vocab contexts —
    // also treat any term mentioned in a successful understanding attempt as known
    const attempts = await this.db.attempts.toArray();
    for (const a of attempts) {
      const c = byId.get(a.conceptId);
      if (c && a.score >= 0.7) {
        for (const t of c.terms) known.add(t.word.toLowerCase());
      }
    }
    return known;
  }

  /** Comparison exercise result → confusion pair update (req 12). */
  async recordComparison(aId: ID, bId: ID, passed: boolean, sessionId?: ID): Promise<void> {
    const now = this.clock.now();
    const learner = await this.getLearner();
    const concept = await this.concept(aId);
    if (!concept) return;
    const pid = [aId, bId].sort().join('::');
    const existing = (await this.db.confusionPairs.toArray()).find((p) => p.id === pid || (p.aId === aId && p.bId === bId) || (p.aId === bId && p.bId === aId));
    if (!existing) return;
    const world: pipeline.PipelineWorld = {
      concept,
      question: null,
      state: await this.conceptState(aId),
      attempts: [],
      misconceptions: new Map(),
      confusionPairs: new Map(),
      gaps: [],
      learner,
      prereqMasteries: [],
      masteryOf: () => 0,
      knownVocabulary: new Set(),
      checkpoints: learner.settings.checkpoints,
      now,
    };
    const res = pipeline.processComparisonResult(world, { aId, bId, passed, otherPair: existing, sessionId });
    await this.db.safeWrite(async () => {
      await this.db.confusionPairs.put(res.pair);
      for (const i of res.insights) await this.db.insights.put(i);
      await this.db.putLearner(res.learner);
      await this.db.appendEvents(res.events);
      return true;
    });
  }

  /** "I know this already" in prereq check → weak-evidence marker (recognition). */
  async markSelfFamiliar(conceptId: ID): Promise<void> {
    const s = await this.conceptState(conceptId);
    if (s.attempts === 0 && s.firstSeenAt == null) {
      const updated: ConceptState = {
        ...s,
        firstSeenAt: this.clock.now(),
        lastSeenAt: this.clock.now(),
        selfClaimedFamiliar: true,
        updatedAt: this.clock.now(),
      };
      await this.db.conceptStates.put(updated);
    }
  }

  /** Record an explanation-style outcome for personalization (req 54). */
  async recordStyleOutcome(conceptId: ID, style: string, success: boolean): Promise<void> {
    const learner = await this.getLearner();
    const stats = learner.styleStats as Record<string, { uses: number; successes: number }>;
    const cur = stats[style] ?? { uses: 0, successes: 0 };
    const learner2 = { ...learner, styleStats: { ...stats, [style]: { uses: cur.uses + 1, successes: cur.successes + (success ? 1 : 0) } } };
    await this.db.putLearner(learner2);
    // per-concept stats
    const s = await this.conceptState(conceptId);
    const cs = s.explanationStats as Record<string, { uses: number; successes: number }>;
    const c = cs[style] ?? { uses: 0, successes: 0 };
    await this.db.conceptStates.put({
      ...s,
      explanationStats: { ...cs, [style]: { uses: c.uses + 1, successes: c.successes + (success ? 1 : 0) } },
      updatedAt: this.clock.now(),
    });
  }

  /** Add an insight directly (e.g. reflection-derived, gaps UI). */
  async addInsight(insight: Omit<Insight, 'id' | 'ts'>): Promise<void> {
    await this.db.insights.put({ ...insight, id: uid('ins'), ts: this.clock.now() });
  }

  /** Progress report for the whole library or one subject. */
  async progress(subjectId?: ID) {
    const concepts = subjectId ? await this.db.concepts.where('subjectId').equals(subjectId).toArray() : await this.db.concepts.toArray();
    const ids = new Set(concepts.map((c) => c.id));
    const states = new Map<ID, ConceptState>();
    for (const s of await this.db.conceptStates.toArray()) if (ids.has(s.conceptId)) states.set(s.conceptId, s);
    const attempts = (await this.db.attempts.toArray()).filter((a) => ids.has(a.conceptId));
    attempts.sort((a, b) => a.ts - b.ts);
    const learner = await this.getLearner();
    return { report: computeProgress(states, attempts, learner, concepts.length), states, attempts };
  }

  /** Recent attempts for response-time baselines & question selection. */
  async recentAttempts(conceptId: ID, n = 10): Promise<Attempt[]> {
    const list = await this.db.attempts.where('conceptId').equals(conceptId).toArray();
    list.sort((a, b) => b.ts - a.ts);
    return list.slice(0, n).reverse();
  }

  /** Sync confusion pairs onto concept states (flags). */
  async syncConfusionFlags(): Promise<void> {
    const pairs = await this.db.confusionPairs.toArray();
    const active = pairs.filter((p) => p.status === 'active');
    const byConcept = new Map<ID, ID[]>();
    for (const p of active) {
      byConcept.set(p.aId, [...(byConcept.get(p.aId) ?? []), p.bId]);
      byConcept.set(p.bId, [...(byConcept.get(p.bId) ?? []), p.aId]);
    }
    for (const [conceptId, partners] of byConcept) {
      const s = await this.db.conceptStates.get(conceptId);
      if (s) await this.db.conceptStates.put(markConfusedWith({ ...s, updatedAt: this.clock.now() }, partners));
    }
  }
}
