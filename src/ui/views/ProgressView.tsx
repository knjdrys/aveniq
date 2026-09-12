/**
 * Progress view (req 44, 45, 57, 74): real metrics only — no vanity stats.
 * Levels, calibration, retention curve, accuracy by cognitive level,
 * insights feed.
 */
import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useServices } from '../../appContext';
import { Empty, Icon } from '../components';
import { computeProgress, retentionCurve, accuracyByLevel } from '../../domain/progress';
import { levelForXp, levelProgress } from '../../domain/motivation';
import { t } from '../../domain/i18n';

export function ProgressView() {
  const services = useServices();
  const learner = useLiveQuery(() => services.learning.getLearner(), []);
  const states = useLiveQuery(() => services.db.conceptStates.toArray(), [], []);
  const attempts = useLiveQuery(() => services.db.attempts.toArray(), [], []);
  const concepts = useLiveQuery(() => services.db.concepts.toArray(), [], []);
  const insights = useLiveQuery(
    () => services.db.insights.orderBy('ts').reverse().limit(30).toArray(),
    [],
    [],
  );

  const report = useMemo(() => {
    if (!learner) return null;
    return computeProgress(
      new Map(states.map((s) => [s.conceptId, s])),
      attempts,
      learner,
      concepts.length,
    );
  }, [states, attempts, learner, concepts.length]);

  const curve = useMemo(() => retentionCurve(attempts), [attempts]);
  const byLevel = useMemo(() => accuracyByLevel(attempts), [attempts]);

  if (!learner || !report) return null;
  const lp = levelProgress(learner.xp);

  return (
    <div className="content">
      <div className="view-title">
        <div>
          <h1>Progress</h1>
          <div className="sub">Real signals only — every number traces back to attempts you actually made.</div>
        </div>
      </div>

      <div className="card">
        <div className="row between mb">
          <h2>Level {lp.level} <span className="muted small">({learner.xp} XP)</span></h2>
          <span className="chip primary">{lp.into}/{lp.need} XP to level {lp.level + 1}</span>
        </div>
        <div className="progress-track"><div className="progress-fill" style={{ width: `${(lp.into / lp.need) * 100}%` }} /></div>
        <div className="tiny muted mt">
          XP is earned by evidence-weighted learning: successful retrieval, especially delayed and applied, counts more than recognition.
          Streak: {learner.streakDays} days — a streak only extends with at least one successful retrieval per day.
        </div>
      </div>

      <div className="grid-2 mt">
        <div className="card">
          <h2 className="mb">Knowledge states</h2>
          <div className="bar-row"><span>Mastered</span><Bar v={report.totalConcepts ? report.mastered / report.totalConcepts : 0} /><span>{report.mastered}</span></div>
          <div className="bar-row"><span>Developing+</span><Bar v={report.totalConcepts ? report.developingPlus / report.totalConcepts : 0} /><span>{report.developingPlus}</span></div>
          <div className="bar-row"><span>Learning</span><Bar v={report.totalConcepts ? report.learning / report.totalConcepts : 0} /><span>{report.learning}</span></div>
          <div className="bar-row"><span>Encountered</span><Bar v={report.totalConcepts ? report.encountered / report.totalConcepts : 0} /><span>{report.encountered}</span></div>
          <div className="bar-row"><span>Confused</span><Bar v={report.totalConcepts ? report.confused / report.totalConcepts : 0} color="var(--coral)" /><span>{report.confused}</span></div>
          <div className="bar-row"><span>Fading</span><Bar v={report.totalConcepts ? report.decaying / report.totalConcepts : 0} color="var(--amber)" /><span>{report.decaying}</span></div>
        </div>

        <div className="card">
          <h2 className="mb">Evidence quality</h2>
          <Metric label="Retrieval accuracy" value={report.retrievalAccuracy} hint="Active recall, not recognition" />
          <Metric label="Application accuracy" value={report.applicationAccuracy} hint="Using ideas in new situations" />
          <Metric label="Explanation quality" value={report.explanationQuality} hint="Teach-back scores" />
          <Metric label="Delayed retention" value={report.delayedRetention} hint="≥2 days after learning — the honest one" />
          <div className="mt small">
            <strong>Calibration:</strong> {report.calibrationVerdict}
            {report.calibrationBrier != null && <> (Brier {report.calibrationBrier.toFixed(2)} — lower is better)</>}
          </div>
        </div>
      </div>

      <div className="grid-2 mt">
        <div className="card">
          <h2 className="mb">Accuracy by cognitive level</h2>
          {byLevel.length === 0 && <div className="small muted">No attempts yet.</div>}
          {byLevel.map((b) => (
            <div key={b.level} className="bar-row">
              <span style={{ textTransform: 'capitalize' }}>{b.level}</span>
              <Bar v={b.accuracy} />
              <span className="tiny muted">{Math.round(b.accuracy * 100)}%</span>
            </div>
          ))}
          <div className="tiny muted mt">If recall is high but transfer is low, you know the words but not the idea yet.</div>
        </div>

        <div className="card">
          <h2 className="mb">Retention over time</h2>
          {curve.length === 0 && <div className="small muted">Appears once you have attempts spread over days.</div>}
          {curve.map((b) => (
            <div key={b.bucket} className="bar-row">
              <span>{b.bucket}</span>
              <Bar v={b.rate} color={b.rate < 0.6 ? 'var(--coral)' : undefined} />
              <span className="tiny muted">{Math.round(b.rate * 100)}%</span>
            </div>
          ))}
          <div className="tiny muted mt">Success rate of retrievals, bucketed by delay since previous attempt.</div>
        </div>
      </div>

      <div className="card mt">
        <h2 className="mb">Insights</h2>
        {!insights.length && <Empty icon="bulb">Insights appear as you learn — they’re derived from your attempt history, not generic tips.</Empty>}
        {insights.map((ins) => (
          <div key={ins.id} className={`insight ${['weakness', 'confusion', 'misconception', 'decay', 'gap'].includes(ins.kind) ? 'warn' : ins.kind === 'calibration' ? 'info' : 'good'}`}>
            <Icon name={['progress', 'readiness', 'streak'].includes(ins.kind) ? 'check' : ins.kind === 'calibration' ? 'bulb' : 'gaps'} size={15} />
            <div>
              <div>{t(ins.key, ins.params)}</div>
              <div className="tiny muted">{new Date(ins.ts).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({ v, color }: { v: number; color?: string }) {
  return (
    <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.round(v * 100)}%`, ...(color ? { background: color } : {}) }} /></div>
  );
}

function Metric({ label, value, hint }: { label: string; value: number | null; hint: string }) {
  return (
    <div className="bar-row">
      <span>{label}</span>
      {value == null ? <span className="tiny muted">not enough evidence yet</span> : <Bar v={value} />}
      <span className="tiny muted">{value == null ? '—' : `${Math.round(value * 100)}%`}</span>
    </div>
  );
}
