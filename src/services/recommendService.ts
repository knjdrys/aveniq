/**
 * Recommendation service (req 31).
 * "What should I study right now?" — always a reasoned answer.
 */
import { AveniqDB } from '../db/db';
import { Clock, realClock } from '../domain/clock';
import { ID, StudySession } from '../domain/types';
import { recommend, bundle, Candidate } from '../domain/recommend';
import { isDue, overdueDays, retrievability } from '../domain/scheduler';
import { unlockFrontier } from '../domain/graph';
import { LearningService } from './learningService';
import { DAY } from '../domain/utils';

export class RecommendService {
  constructor(
    private db: AveniqDB,
    private learning: LearningService,
    private clock: Clock = realClock,
  ) {}

  async candidates(): Promise<Candidate[]> {
    const now = this.clock.now();
    const learner = await this.learning.getLearner();
    const states = await this.learning.statesMap();
    const concepts = await this.db.concepts.toArray();
    const byId = new Map(concepts.map((c) => [c.id, c]));
    const prereqMap = new Map(concepts.filter((c) => c.prerequisites.length).map((c) => [c.id, c.prerequisites]));

    const due = Object.values(
      Object.fromEntries(
        concepts
          .filter((c) => {
            const s = states.get(c.id);
            return s && isDue(s.scheduler, now);
          })
          .map((c) => {
            const s = states.get(c.id)!;
            return [c.id, { conceptId: c.id, overdueDays: overdueDays(s.scheduler, now), stabilityDays: s.scheduler.stabilityDays, lastReviewedAt: s.scheduler.lastReviewedAt }];
          }),
      ),
    );

    const weak = concepts
      .filter((c) => {
        const s = states.get(c.id);
        return s && s.attempts >= 2 && s.mastery < 45;
      })
      .map((c) => ({ conceptId: c.id, mastery: states.get(c.id)!.mastery }));

    const stale = concepts
      .filter((c) => {
        const s = states.get(c.id);
        return s && (s.state === 'mastered' || s.state === 'proficient') && retrievability(s.scheduler, now) < 0.75;
      })
      .map((c) => ({ conceptId: c.id, retrievability: retrievability(states.get(c.id)!.scheduler, now) }));

    const newUnlocked = unlockFrontier(
      concepts.map((c) => c.id),
      prereqMap,
      (id) => (states.get(id)?.mastery ?? 0) >= 45,
    )
      .filter((id) => !states.get(id) || (states.get(id)!.firstSeenAt == null && states.get(id)!.attempts === 0))
      .map((id) => ({ conceptId: id, examWeight: byId.get(id)?.examWeight ?? 0.5 }));

    const misconceptions = (await this.db.misconceptions.where('status').equals('active').toArray()).map((m) => ({
      conceptId: m.conceptId,
      triggerCount: m.triggerCount,
      label: m.defId,
    }));

    const confusions = (await this.db.confusionPairs.where('status').equals('active').toArray()).map((p) => ({
      aId: p.aId,
      bId: p.bId,
      count: p.abCount + p.baCount,
    }));

    const gaps = (await this.db.gaps.where('status').equals('open').toArray()).map((g) => ({
      conceptId: g.conceptId,
      rootConceptId: g.rootConceptId,
      occurrences: g.occurrences,
    }));

    const examUrgent: { conceptId: ID; examTitle: string; daysLeft: number }[] = [];
    for (const exam of await this.db.exams.toArray()) {
      const daysLeft = (exam.date - now) / DAY;
      if (daysLeft < 0 || daysLeft > 14) continue;
      for (const c of concepts.filter((c) => c.subjectId === exam.subjectId)) {
        const s = states.get(c.id);
        if (!s || s.mastery < 75 || s.flag !== 'none') {
          examUrgent.push({ conceptId: c.id, examTitle: exam.title, daysLeft });
        }
      }
    }

    return recommend({ now, due, weak, stale, newUnlocked, misconceptions, confusions, gaps, examUrgent, goals: learner.goals });
  }

  /** Top recommendation with concept names resolved + a time-fitted bundle (req 32). */
  async whatToStudy(minutes?: number): Promise<{
    top: Candidate;
    alternatives: Candidate[];
    bundle: Candidate[];
  } | null> {
    const learner = await this.learning.getLearner();
    const mins = minutes ?? learner.settings.defaultSessionMinutes;
    const all = await this.candidates();
    if (!all.length) return null;
    return {
      top: all[0],
      alternatives: all.slice(1, 6),
      bundle: bundle(all, mins),
    };
  }
}

export type { StudySession };
