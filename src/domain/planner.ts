/**
 * Study planner (req 37).
 * Dynamic plans from exam date + available time + goals. Updates automatically:
 * falling behind raises priority; improvement removes unnecessary repetition.
 */
import { ConceptState, ID, PlanDay, StudyPlan } from './types';
import { DAY, dayKey } from './utils';
import { topoOrder } from './graph';

export interface PlanInput {
  now: number;
  subjectId: ID;
  dailyMinutes: number;
  /** exam date epoch ms, if any */
  examDate?: number;
  concepts: {
    id: ID;
    mastery: number;
    state: ConceptState['state'];
    examWeight: number;
    prerequisites: ID[];
  }[];
  states: Map<ID, ConceptState>;
}

export function generatePlan(input: PlanInput): StudyPlan {
  const ids = input.concepts.map((c) => c.id);
  const prereqMap = new Map<ID, ID[]>(input.concepts.map((c) => [c.id, c.prerequisites]));
  const order = topoOrder(ids, prereqMap) ?? ids; // foundations first
  const info = new Map(input.concepts.map((c) => [c.id, c]));

  const daysAvailable = input.examDate
    ? Math.max(1, Math.ceil((input.examDate - input.now) / DAY))
    : 14;
  const start = input.now;
  const end = input.examDate ?? input.now + 14 * DAY;

  // priority: unseen foundations of exam-heavy concepts, then weak, then rest
  const priority = (id: ID): number => {
    const c = info.get(id)!;
    let p = c.examWeight * 40;
    if (c.state === 'unknown') p += 30;
    else if (c.mastery < 45) p += 40;
    else if (c.mastery < 75) p += 20;
    else if (c.mastery >= 88) p -= 25; // mastered → minimal repetition (req 37)
    return p;
  };

  const queue = [...order].sort((a, b) => priority(b) - priority(a));
  const days: PlanDay[] = [];
  const slotsPerDay = Math.max(1, Math.round(input.dailyMinutes / 8));
  let di = 0;
  while (queue.length && days.length < daysAvailable) {
    const date = dayKey(start + di * DAY);
    const items: PlanDay['items'] = [];
    // one "learn new" slot per day, rest review/reinforce
    for (let s = 0; s < slotsPerDay && queue.length; s++) {
      const id = queue.shift()!;
      const c = info.get(id)!;
      const kind: PlanDay['items'][number]['kind'] =
        c.state === 'unknown' ? 'learn' : c.mastery < 45 ? 'reinforce' : c.mastery < 75 ? 'apply' : 'review';
      items.push({
        conceptId: id,
        kind,
        reasonKey: kind === 'learn' ? 'plan.learn' : kind === 'reinforce' ? 'plan.reinforce' : 'plan.review',
      });
    }
    days.push({ date, minutes: input.dailyMinutes, items, completedMinutes: 0 });
    di++;
  }

  return {
    id: `plan_${input.subjectId}`,
    subjectId: input.subjectId,
    dailyMinutes: input.dailyMinutes,
    startDate: start,
    endDate: end,
    days,
    status: 'active',
    behind: false,
    adjustments: [],
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/**
 * Auto-update after activity (req 37): behind → raise priority (extra items);
 * improving → lighten load. Returns adjustment log entries.
 */
export function updatePlan(
  plan: StudyPlan,
  states: Map<ID, ConceptState>,
  now: number,
): { plan: StudyPlan; adjustments: StudyPlan['adjustments'] } {
  const today = dayKey(now);
  const adjustments: StudyPlan['adjustments'] = [];
  let behind = false;

  const days = plan.days.map((d) => {
    if (d.date > today) return d;
    const missing = d.items.filter((it) => {
      const st = states.get(it.conceptId);
      return !st || st.attempts === 0;
    });
    const completed = d.items.length - missing.length;
    const dayMinutes = Math.round((completed / Math.max(1, d.items.length)) * d.minutes);
    if (missing.length > 0 && d.date < today) {
      behind = true;
      adjustments.push({
        ts: now,
        key: 'plan.behind',
        params: { date: d.date, n: missing.length },
      });
    }
    return { ...d, completedMinutes: dayMinutes };
  });

  // if behind, pull missed items into the next day (priority increase)
  if (behind) {
    const nextIdx = days.findIndex((d) => d.date >= today);
    if (nextIdx >= 0) {
      const missed: PlanDay['items'] = [];
      for (const d of days) {
        if (d.date < today) {
          for (const it of d.items) {
            const st = states.get(it.conceptId);
            if (!st || st.attempts === 0) missed.push({ ...it, reasonKey: 'plan.catchUp' });
          }
        }
      }
      days[nextIdx] = {
        ...days[nextIdx],
        items: [...missed.slice(0, 3), ...days[nextIdx].items].slice(0, 12),
        minutes: plan.dailyMinutes + Math.min(15, missed.length * 5),
      };
    }
  }

  // mastered concepts get removed from future days (reduce unnecessary repetition)
  let removed = 0;
  const lightened = days.map((d) => {
    if (d.date <= today) return d;
    const items = d.items.filter((it) => {
      const st = states.get(it.conceptId);
      if (st && st.state === 'mastered' && st.flag === 'none') {
        removed++;
        return false;
      }
      return true;
    });
    return { ...d, items };
  });
  if (removed > 0) {
    adjustments.push({ ts: now, key: 'plan.lightened', params: { n: removed } });
  }

  return {
    plan: { ...plan, days: lightened, behind, updatedAt: now, adjustments: [...plan.adjustments, ...adjustments] },
    adjustments,
  };
}
