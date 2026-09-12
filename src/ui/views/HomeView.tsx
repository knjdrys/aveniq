/**
 * Home — StudyBuddy's structure: not a dashboard. One strong next action
 * (hero), one honest "Today" column, "Continue learning", one insight,
 * one week strip. Powered by AVENIQ's engine (recommendations, evidence).
 */
import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useServices } from '../../appContext';
import { Icon, StateChip } from '../components';
import { useRunner } from '../runnerHost';
import { t } from '../../domain/i18n';
import { DAY } from '../../domain/utils';
import type { Attempt, Concept, StudySession } from '../../domain/types';

export function HomeView() {
  const services = useServices();
  const runner = useRunner();

  const learner = useLiveQuery(() => services.learning.getLearner(), []);
  const concepts = useLiveQuery(() => services.db.concepts.toArray(), [], []);
  const states = useLiveQuery(() => services.db.conceptStates.toArray(), [], []);
  const subjects = useLiveQuery(() => services.db.subjects.toArray(), [], []);
  const attempts = useLiveQuery(() => services.db.attempts.orderBy('ts').reverse().limit(400).toArray(), [], [] as Attempt[]);
  const rec = useLiveQuery(() => services.recommend.whatToStudy(10), []);
  const activeSession = useLiveQuery(() => services.sessions.current(), []);
  const exams = useLiveQuery(() => services.db.exams.toArray(), [], []);
  const insights = useLiveQuery(() => services.db.insights.orderBy('ts').reverse().limit(3).toArray(), [], []);

  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = learner?.name !== 'Learner' ? learner?.name : undefined;

  const conceptName = (id: string) => concepts.find((c) => c.id === id)?.name ?? id;
  const stateOf = (id: string) => states.find((s) => s.conceptId === id);

  const dueCount = states.filter((s) => s.scheduler.lastReviewedAt != null && Date.now() >= s.scheduler.dueAt).length;
  const nextExam = exams.filter((e) => e.date > Date.now()).sort((a, b) => a.date - b.date)[0];

  // today's study minutes (from sessions) + XP today
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const sessionsToday = useLiveQuery(
    () => services.db.sessions.where('startedAt').above(todayStart - 1).toArray(),
    [todayStart],
    [],
  );
  const minutesToday = sessionsToday.reduce((m: number, s: StudySession) => {
    const span = ((s.endedAt ?? Date.now()) - s.startedAt) / 60000;
    return m + Math.min(s.plannedMinutes + 4, Math.max(1, span));
  }, 0);
  const goalMinutes = learner?.settings.dailyMinutesGoal ?? 20;

  // week heat: XP-earning attempts per day (7 days)
  const week = useMemo(() => {
    const days: { day: string; minutes: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY);
      const key = d.toDateString();
      const n = attempts.filter((a) => new Date(a.ts).toDateString() === key).length;
      days.push({ day: key, minutes: n * 0.75 });
    }
    return days;
  }, [attempts as { ts: number }[]]);

  // hero action
  const action = activeSession
    ? { kind: 'resume' as const, title: 'Pick up your session', subtitle: `${activeSession.executed.length} items in — finish strong.`, minutes: activeSession.plannedMinutes }
    : rec
      ? {
          kind: (rec.top.type === 'due' || rec.top.type === 'stale' ? 'review' : rec.top.type === 'new' ? 'learn' : 'practice') as 'review' | 'learn' | 'practice',
          title:
            rec.top.type === 'new' ? `Learn “${conceptName(rec.top.conceptId)}” from zero`
            : rec.top.type === 'misconception' ? `Fix the trap in “${conceptName(rec.top.conceptId)}”`
            : rec.top.type === 'confusion' ? `Untangle “${conceptName(rec.top.conceptId)}” vs “${conceptName(rec.top.relatedId ?? '')}”`
            : rec.top.type === 'gap' ? `Close the gap in “${conceptName(rec.top.conceptId)}”`
            : rec.top.type === 'weak' ? `Strengthen “${conceptName(rec.top.conceptId)}”`
            : `Review “${conceptName(rec.top.conceptId)}”`,
          subtitle: t(rec.top.reasons[0].key, {
            ...rec.top.reasons[0].params,
            concept: conceptName(rec.top.conceptId),
            a: conceptName(rec.top.conceptId),
            b: conceptName(rec.top.relatedId ?? ''),
            root: conceptName(rec.top.relatedId ?? ''),
          }),
          minutes: 10,
        }
      : { kind: 'learn' as const, title: 'The frontier is open', subtitle: 'Nothing needs rescue right now — learn something new.', minutes: 10 };

  const recentConcepts = useMemo(() => {
    const byId = new Map(concepts.map((c) => [c.id, c]));
    const seen = new Set<string>();
    const out: Concept[] = [];
    for (const a of attempts) {
      if (seen.has(a.conceptId)) continue;
      const c = byId.get(a.conceptId);
      if (c) { out.push(c); seen.add(a.conceptId); }
      if (out.length >= 3) break;
    }
    return out;
  }, [attempts, concepts]);

  const lastSubjectId = attempts[0] ? concepts.find((c) => c.id === attempts[0].conceptId)?.subjectId : undefined;
  const currentSubject = subjects.find((s) => s.id === lastSubjectId);

  if (!learner) return null;

  return (
    <div>
      <div className="page-kicker">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      <h1 className="page-title" style={{ fontSize: 30, marginBottom: 'var(--space-6)' }}>
        {greeting}{name ? <>, <span style={{ fontStyle: 'italic', color: 'var(--pine-strong)' }}>{name}</span></> : ''}. What are we working on today?
      </h1>

      {/* hero — next best action */}
      <section className="hero">
        <div className="hero-main">
          <div className="page-kicker">Next best action</div>
          <h2>{action.title}</h2>
          <p className="muted" style={{ marginBottom: 12 }}>{action.subtitle}</p>
          <div className="chip-btns">
            <span className="chip"><Icon name="clock" size={13} /> ~{action.minutes} minutes</span>
            {action.kind === 'review' && <span className="chip amber"><Icon name="review" size={13} /> Reviews are due</span>}
            {action.kind === 'learn' && <span className="chip pine"><Icon name="spark" size={13} /> Build it from zero</span>}
            {action.kind === 'practice' && <span className="chip pine"><Icon name="spark" size={13} /> Sharpen it</span>}
            {action.kind === 'resume' && <span className="chip pine"><Icon name="play" size={13} /> In progress</span>}
          </div>
        </div>
        <div className="hero-side">
          <button
            className="btn btn-primary btn-lg"
            onClick={() => {
              if (activeSession) runner.open({ kind: 'session', sessionId: activeSession.id });
              else if (rec && rec.top.type === 'new') runner.open({ kind: 'session-setup', conceptIds: [rec.top.conceptId], minutes: 12 });
              else runner.open({ kind: 'session-setup' });
            }}
          >
            <Icon name="play" size={16} /> Start · ~{action.minutes} min
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              window.location.hash = currentSubject ? `#/subject/${currentSubject.id}` : '#/learn';
            }}
          >
            Open the subject
          </button>
        </div>
      </section>

      {/* today + continue learning */}
      <div className="grid-2" style={{ marginTop: 'var(--space-6)', alignItems: 'start' }}>
        <div>
          <div className="section-label" style={{ marginTop: 0 }}><h3>Today</h3></div>
          <div className="row" style={{ cursor: 'default' }}>
            <Icon name="review" size={17} />
            <div className="row-main">
              <div className="row-title">{dueCount > 0 ? `${dueCount} ${dueCount === 1 ? 'concept' : 'concepts'} due for review` : 'Nothing due today'}</div>
            </div>
            {dueCount > 0 && <a className="btn btn-quiet btn-sm" href="#/review">Review</a>}
          </div>
          {nextExam && (
            <div className="row" style={{ cursor: 'default' }}>
              <Icon name="exams" size={17} />
              <div className="row-main">
                <div className="row-title">{subjects.find((s) => s.id === nextExam.subjectId)?.name ?? nextExam.title}</div>
                <div className="row-sub">
                  {Math.round((nextExam.date - Date.now()) / DAY) === 0 ? 'Exam today — breathe, you’ve got this.'
                    : Math.round((nextExam.date - Date.now()) / DAY) === 1 ? 'Exam tomorrow'
                    : `Exam in ${Math.round((nextExam.date - Date.now()) / DAY)} days`}
                </div>
              </div>
            </div>
          )}
          <div className="row" style={{ cursor: 'default' }}>
            <Icon name="target" size={17} />
            <div className="row-main">
              <div className="row-title">{minutesToday >= goalMinutes ? 'Daily goal met' : `${goalMinutes} min a day is the goal`}</div>
              <div className="row-sub">{minutesToday >= goalMinutes ? `Nice — ${Math.round(minutesToday)} focused minutes today.` : `${Math.round(minutesToday)} studied today.`}</div>
            </div>
            <RingSmall percent={goalMinutes ? Math.min(1, minutesToday / goalMinutes) : 0} size={34} />
          </div>
        </div>

        <div>
          <div className="section-label" style={{ marginTop: 0 }}>
            <h3>Continue learning</h3>
            <a className="more" href="#/learn">All subjects</a>
          </div>
          {currentSubject ? (
            <>
              <button className="row" onClick={() => { window.location.hash = `#/subject/${currentSubject.id}`; }}>
                <Icon name="library" size={17} />
                <div className="row-main">
                  <div className="row-title">{currentSubject.name}</div>
                  <div className="row-sub">{concepts.filter((c) => c.subjectId === currentSubject.id).length} concepts</div>
                </div>
                <Icon name="arrow" size={15} style={{ transform: 'rotate(-90deg)' }} />
              </button>
              {recentConcepts.map((c) => (
                <button key={c.id} className="row" style={{ paddingLeft: 'var(--space-6)' }} onClick={() => { window.location.hash = `#/concept/${c.id}`; }}>
                  <div className="row-main">
                    <div className="row-title" style={{ fontSize: 13.5 }}>{c.name}</div>
                  </div>
                  <StateChip state={stateOf(c.id)?.state ?? 'unknown'} flag={stateOf(c.id)?.flag} />
                </button>
              ))}
              <div className="row" style={{ cursor: 'default' }}>
                <button className="btn btn-quiet btn-sm" onClick={() => runner.open({ kind: 'session-setup', subjectId: currentSubject.id })}>
                  Continue with a session →
                </button>
              </div>
            </>
          ) : subjects.length ? (
            subjects.slice(0, 3).map((s) => (
              <button key={s.id} className="row" onClick={() => { window.location.hash = `#/subject/${s.id}`; }}>
                <Icon name="library" size={17} />
                <div className="row-main">
                  <div className="row-title">{s.name}</div>
                  <div className="row-sub">
                    {states.filter((st) => concepts.find((c) => c.id === st.conceptId)?.subjectId === s.id && st.state === 'mastered').length}/
                    {concepts.filter((c) => c.subjectId === s.id).length} mastered
                  </div>
                </div>
                <Icon name="arrow" size={15} style={{ transform: 'rotate(-90deg)' }} />
              </button>
            ))
          ) : (
            <p className="muted small">Nothing here yet — your learning context will show up after your first session.</p>
          )}
        </div>
      </div>

      {/* insight + week strip */}
      <div className="grid-2" style={{ marginTop: 'var(--space-6)', alignItems: 'start' }}>
        <section className="insight">
          <span className="bulb"><Icon name="bulb" size={19} /></span>
          <div className="grow">
            <div className="page-kicker" style={{ color: 'var(--amber-strong)' }}>From your recent studying</div>
            {insights[0] ? (
              <>
                <h3>{t(insights[0].key, insights[0].params)}</h3>
                <p className="small" style={{ color: 'var(--ink-2)' }}>
                  Every insight names its evidence — this one comes from your recorded attempts on {new Date(insights[0].ts).toLocaleDateString()}.
                </p>
              </>
            ) : (
              <>
                <h3>Insights appear as you study</h3>
                <p className="small" style={{ color: 'var(--ink-2)' }}>
                  Answer honestly and AVENIQ will point out what’s working and what’s slipping.
                </p>
              </>
            )}
          </div>
        </section>

        <section className="weekstrip">
          <div>
            <div className="page-kicker">This week</div>
            <div className="weekstat">
              <div>
                <div className="num">{learner.streakDays}</div>
                <div className="tiny subtle">day streak</div>
              </div>
              <div>
                <div className="num plain">L{learner.level}</div>
                <div className="tiny subtle">level</div>
              </div>
              <div>
                <div className="num plain">{learner.xp}</div>
                <div className="tiny subtle">XP all-time</div>
              </div>
            </div>
          </div>
          <HeatStrip days={week} />
        </section>
      </div>
    </div>
  );
}

function RingSmall({ percent, size = 34 }: { percent: number; size?: number }) {
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="ring" role="img" aria-label={`${Math.round(percent * 100)}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--pine)" strokeWidth={stroke} strokeDasharray={`${c * percent} ${c}`} strokeLinecap="round" />
    </svg>
  );
}

function HeatStrip({ days }: { days: { day: string; minutes: number }[] }) {
  const max = Math.max(15, ...days.map((d) => d.minutes));
  return (
    <div className="heat" role="img" aria-label="Study activity this week">
      {days.map((d, i) => {
        const level = d.minutes <= 0 ? '' : d.minutes / max > 0.6 ? 'l3' : d.minutes / max > 0.3 ? 'l2' : 'l1';
        return <span key={i} className={`heat-cell ${level}`} title={`${new Date(d.day).toLocaleDateString(undefined, { weekday: 'short' })}: ${Math.round(d.minutes)} min`} />;
      })}
    </div>
  );
}
