/**
 * Planner view (req 37): day-by-day study plan with per-day concepts,
 * behind-catch-up adjustments, mastery lightening.
 */
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useServices } from '../../appContext';
import { Empty, Icon, useToast } from '../components';
import { DAY } from '../../domain/utils';
import { t } from '../../domain/i18n';

export function PlannerView() {
  const services = useServices();
  const toast = useToast();
  const subjects = useLiveQuery(() => services.db.subjects.toArray(), [], []);
  const plans = useLiveQuery(() => services.db.plans.toArray(), [], []);
  const concepts = useLiveQuery(() => services.db.concepts.toArray(), [], []);
  const states = useLiveQuery(() => services.db.conceptStates.toArray(), [], []);
  const [gen, setGen] = useState({ subjectId: '', dailyMinutes: 25, examId: '' });

  const name = (id: string) => concepts.find((c) => c.id === id)?.name ?? id;
  const stateOf = (id: string) => states.find((s) => s.conceptId === id);

  const generate = async () => {
    if (!gen.subjectId) {
      toast('Pick a subject first.', 'error');
      return;
    }
    await services.exams.generateStudyPlan({
      subjectId: gen.subjectId,
      dailyMinutes: gen.dailyMinutes,
      examId: gen.examId || undefined,
    });
    toast('Plan generated — it adapts as you go.', 'info');
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="content">
      <div className="view-title">
        <div>
          <h1>Study planner</h1>
          <div className="sub">A living plan: catch-up when you fall behind, lighter days once concepts are mastered.</div>
        </div>
      </div>

      <div className="card mb">
        <h2 className="mb">Generate a plan</h2>
        <div className="grid-2">
          <div className="field">
            <label>Subject</label>
            <select value={gen.subjectId} onChange={(e) => setGen({ ...gen, subjectId: e.target.value })}>
              <option value="">Choose…</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Minutes per day</label>
            <input type="number" min={5} max={180} value={gen.dailyMinutes} onChange={(e) => setGen({ ...gen, dailyMinutes: Number(e.target.value) })} />
          </div>
        </div>
        <button className="btn primary" onClick={generate}>Generate plan</button>
      </div>

      {!plans.length && <Empty icon="planner">No plans yet. Generate one for any subject — foundations always come first.</Empty>}

      {plans
        .filter((p) => p.status === 'active')
        .sort((a, b) => a.startDate - b.startDate)
        .map((plan) => (
          <div className="card" key={plan.id}>
            <div className="row between mb">
              <h2>{subjects.find((s) => s.id === plan.subjectId)?.name ?? 'Plan'}</h2>
              <div className="row">
                {plan.behind && <span className="chip amber">behind — catching up</span>}
                <span className="chip">{plan.dailyMinutes} min/day</span>
              </div>
            </div>

            {plan.adjustments.slice(-3).map((a, i) => (
              <div key={i} className="insight warn">
                <Icon name="bulb" size={14} /> {t(a.key, a.params)}
              </div>
            ))}

            {plan.days.map((day, i) => {
              const d = new Date(`${day.date}T00:00:00`);
              const isToday = day.date === todayStr;
              const isPast = d < new Date();
              const done = day.completedMinutes >= day.minutes * 0.8;
              return (
                <div
                  key={day.date}
                  className="list-row"
                  style={{ opacity: isPast && !done ? 0.55 : 1, borderColor: isToday ? 'var(--primary)' : undefined }}
                >
                  <span className={`chip ${done ? 'green' : isToday ? 'primary' : isPast ? 'coral' : ''}`}>
                    {isToday ? 'today' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                  <span className="grow">
                    <span className="title" style={{ fontSize: 14 }}>
                      {day.items.map((it) => name(it.conceptId)).join(' · ') || 'Buffer / review day'}
                    </span>
                    <span className="sub">
                      {day.items.map((it) => t(it.reasonKey)).slice(0, 2).join(' · ') || 'planned'} · {day.minutes} min
                    </span>
                  </span>
                  {day.items.length > 0 && (
                    <a className="btn sm" href={`#/concept/${day.items[0].conceptId}`}>Study</a>
                  )}
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}

/** StudyBuddy calls this screen Plan — same engine, friendlier name. */
export const PlanView = PlannerView;
