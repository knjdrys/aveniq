/**
 * Home (req 31, 32, 33): the center of gravity — "You have N minutes.
 * Here's the best way to use them." One clear recommendation with WHY,
 * time chips, quick actions, real stats, latest insights.
 */
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useServices, navigate } from '../../appContext';
import { Icon, useToast } from '../components';
import { t } from '../../domain/i18n';
import { DAY } from '../../domain/utils';

const TIMES = [5, 10, 25, 60];

export function HomeView() {
  const services = useServices();
  const toast = useToast();
  const [minutes, setMinutes] = useState(10);
  const [starting, setStarting] = useState(false);

  const learner = useLiveQuery(() => services.learning.getLearner(), []);
  const concepts = useLiveQuery(() => services.db.concepts.toArray(), [], []);
  const states = useLiveQuery(() => services.db.conceptStates.toArray(), [], []);
  const rec = useLiveQuery(() => services.recommend.whatToStudy(minutes), [minutes], null);
  const activeSession = useLiveQuery(() => services.sessions.current(), []);
  const exams = useLiveQuery(() => services.db.exams.toArray(), [], []);
  const insights = useLiveQuery(
    () => services.db.insights.orderBy('ts').reverse().limit(2).toArray(),
    [],
    [],
  );

  const name = (id: string) => concepts.find((c) => c.id === id)?.name ?? id;
  const mastered = states.filter((s) => s.state === 'mastered' && s.flag === 'none').length;
  const inProgress = states.filter((s) => s.state !== 'unknown').length;
  const dueNow = states.filter((s) => s.scheduler.lastReviewedAt != null && Date.now() >= s.scheduler.dueAt).length;
  const nextExam = exams.filter((e) => e.date > Date.now()).sort((a, b) => a.date - b.date)[0];

  const start = async () => {
    setStarting(true);
    try {
      const session = await services.sessions.start({ minutes });
      navigate(`/session/${session.id}`);
    } catch {
      toast('Could not start the session. Please try again.', 'error');
    } finally {
      setStarting(false);
    }
  };

  const whyText = (r: { conceptId: string; relatedId?: string; reasons: { key: string; params?: Record<string, string | number> }[] }) =>
    t(r.reasons[0].key, {
      ...r.reasons[0].params,
      concept: name(r.conceptId),
      a: name(r.conceptId),
      b: name(r.relatedId ?? ''),
      root: name(r.relatedId ?? ''),
    });

  if (!learner) return null;

  return (
    <div className="content">
      {/* hero — one clear next move */}
      <div className="hero">
        <div className="hero-kicker">
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          {learner.streakDays > 0 && ` · ${learner.streakDays}-day streak`}
        </div>
        {activeSession ? (
          <>
            <h1>Pick up where you left off</h1>
            <p className="small muted" style={{ margin: '4px 0 14px' }}>
              {activeSession.executed.length} items done · {activeSession.plannedMinutes} min planned
            </p>
            <button className="btn primary lg" onClick={() => navigate(`/session/${activeSession.id}`)}>
              Continue session <Icon name="arrow" size={16} style={{ transform: 'rotate(-90deg)' }} />
            </button>
          </>
        ) : rec ? (
          <>
            <h1>You have {minutes} minutes — {name(rec.top.conceptId)} is your best move</h1>
            <div className="rec-why">{whyText(rec.top)}</div>
            <div className="row between">
              <div className="time-chips" role="radiogroup" aria-label="Available time">
                {TIMES.map((m) => (
                  <button key={m} className={`time-chip ${minutes === m ? 'active' : ''}`} role="radio" aria-checked={minutes === m} onClick={() => setMinutes(m)}>
                    {m}m
                  </button>
                ))}
              </div>
              <button className="btn primary lg" disabled={starting} onClick={start}>
                {starting ? 'Planning…' : `Start ${minutes}-min session`}
              </button>
            </div>
            {rec.bundle.length > 1 && (
              <div className="tiny muted mt">Will cover: {rec.bundle.map((c) => name(c.conceptId)).slice(0, 6).join(' · ')}</div>
            )}
          </>
        ) : (
          <>
            <h1>Nothing needs you right now — learn something new</h1>
            <p className="small muted" style={{ margin: '4px 0 14px' }}>
              Everything you’ve started is fresh. The frontier is open.
            </p>
            <a className="btn primary lg" href="#/learn">Go to Learn <Icon name="arrow" size={16} style={{ transform: 'rotate(-90deg)' }} /></a>
          </>
        )}
      </div>

      {/* quick actions */}
      <div className="quick-grid">
        <QuickAction icon="learn" tint="primary" title="Learn something new" desc={concepts.length ? 'Ready when you are — from zero' : 'Add material to begin'} href="#/learn" />
        <QuickAction icon="review" tint="amber" title={dueNow > 0 ? `Review ${dueNow} due` : 'Review'} desc={dueNow > 0 ? 'Memory fades — catch it now' : 'Nothing due. Nice.'} href="#/review" />
        <QuickAction icon="target" tint="blue" title="Practice" desc="Retrieve, apply, fix mix-ups" href="#/practice" />
        {nextExam ? (
          <QuickAction icon="exams" tint="coral" title={nextExam.title} desc={`${Math.max(0, Math.round((nextExam.date - Date.now()) / DAY))} days — check readiness`} href="#/exams" />
        ) : (
          <QuickAction icon="map" tint="violet" title="Learning map" desc="See the whole graph" href="#/map" />
        )}
      </div>

      {/* alternatives */}
      {rec && rec.alternatives.length > 0 && !activeSession && (
        <div className="card mt">
          <h3 className="mb">Also worth your time</h3>
          {rec.alternatives.slice(0, 3).map((c) => (
            <div key={`${c.conceptId}-${c.type}`} className="due-row">
              <span className={`chip ${['misconception', 'confusion', 'gap'].includes(c.type) ? 'coral' : c.type === 'due' ? 'amber' : 'blue'}`}>{c.type}</span>
              <div className="grow" style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5 }}>{name(c.conceptId)}</div>
                <div className="tiny muted">{whyText(c)}</div>
              </div>
              <button className="btn sm" onClick={async () => {
                const s = await services.sessions.start({ minutes, conceptIds: [c.conceptId] });
                navigate(`/session/${s.id}`);
              }}>Do it</button>
            </div>
          ))}
        </div>
      )}

      {/* stats — real, not vanity */}
      <div className="stat-strip">
        <div className="stat"><div className="n">{inProgress}</div><div className="l">in progress</div></div>
        <div className="stat"><div className="n" style={{ color: 'var(--green)' }}>{mastered}</div><div className="l">mastered</div></div>
        <div className="stat"><div className="n" style={{ color: 'var(--amber)' }}>{dueNow}</div><div className="l">due now</div></div>
        <div className="stat"><div className="n">L{learner.level}</div><div className="l">{learner.xp} XP</div></div>
      </div>

      {/* latest insights */}
      {insights.length > 0 && (
        <div className="card mt">
          <div className="row between mb">
            <h3>Latest signals</h3>
            <a className="btn subtle sm" href="#/progress">All progress →</a>
          </div>
          {insights.map((ins) => (
            <div key={ins.id} className={`insight ${['weakness', 'confusion', 'misconception', 'decay', 'gap'].includes(ins.kind) ? 'warn' : ins.kind === 'calibration' ? 'info' : 'good'}`}>
              <Icon name={['progress', 'readiness', 'streak'].includes(ins.kind) ? 'check' : ins.kind === 'calibration' ? 'bulb' : 'gaps'} size={15} />
              <div>{t(ins.key, ins.params)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickAction({ icon, tint, title, desc, href }: { icon: string; tint: string; title: string; desc: string; href: string }) {
  return (
    <a className="quick-card" href={href}>
      <span className={`quick-ico chip ${tint}`} style={{ borderRadius: 11, width: 38, height: 38 }}>
        <Icon name={icon} size={19} />
      </span>
      <span>
        <span className="t">{title}</span>
        <span className="d" style={{ display: 'block' }}>{desc}</span>
      </span>
    </a>
  );
}
