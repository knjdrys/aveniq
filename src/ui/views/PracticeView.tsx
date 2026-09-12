/**
 * Practice — StudyBuddy's structure: per-subject panels (readiness,
 * practice exam + quick check), then focused modes (AVENIQ's engine),
 * then recent practice.
 */
import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useServices } from '../../appContext';
import { Icon } from '../components';
import { useRunner } from '../runnerHost';

export function PracticeView() {
  const services = useServices();
  const runner = useRunner();
  const subjects = useLiveQuery(() => services.db.subjects.toArray(), [], []);
  const concepts = useLiveQuery(() => services.db.concepts.toArray(), [], []);
  const states = useLiveQuery(() => services.db.conceptStates.toArray(), [], []);
  const sessions = useLiveQuery(() => services.db.sessions.orderBy('startedAt').reverse().limit(30).toArray(), [], []);

  const stateOf = (id: string) => states.find((s) => s.conceptId === id);
  const questionCount = (subjectId: string) => concepts.filter((c) => c.subjectId === subjectId).reduce((n, c) => n + Math.max(1, 0), 0);

  const learnedTotal = states.filter((s) => s.attempts >= 1).length;
  const pairs = useLiveQuery(() => services.db.confusionPairs.where('status').equals('active').toArray(), [], []);
  const misconceptions = useLiveQuery(() => services.db.misconceptions.where('status').equals('active').toArray(), [], []);
  const weak = states.filter((s) => s.attempts >= 2 && s.mastery < 45).length;

  // recent finished sessions as practice history
  const recent = sessions.filter((s) => s.status === 'completed' && s.executed.length).slice(0, 5);
  const attemptsAll = useLiveQuery(() => services.db.attempts.orderBy('ts').reverse().limit(200).toArray(), [], []);

  return (
    <div>
      <div className="page-head">
        <div className="grow">
          <div className="page-kicker">Practice</div>
          <h1 className="page-title">Put it to work</h1>
          <p className="page-sub">Recall shows you remember; practice shows you can use it. Papers are interleaved on purpose — that’s how exams test, and how memory strengthens.</p>
        </div>
      </div>

      {subjects.length ? (
        <div className="subject-grid">
          {subjects.map((s) => {
            const own = concepts.filter((c) => c.subjectId === s.id);
            const avg = own.length ? Math.round(own.reduce((n, c) => n + (stateOf(c.id)?.mastery ?? 0), 0) / own.length) : 0;
            const learned = own.filter((c) => (stateOf(c.id)?.attempts ?? 0) >= 1).length;
            return (
              <div className="panel" key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div className="split">
                  <h2 style={{ fontSize: 18 }}>{s.name}</h2>
                  <span className="chip">{avg}% ready</span>
                </div>
                <p className="small muted">{own.length} concepts · {learned} in progress. Papers target what needs work.</p>
                <div className="btn-row">
                  <button className="btn btn-primary" onClick={() => runner.open({ kind: 'exam-setup', subjectId: s.id })}>
                    <Icon name="target" size={15} /> Practice paper
                  </button>
                  <button className="btn" onClick={() => runner.open({ kind: 'exam-setup', subjectId: s.id })}>Quick check</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty">
          <div className="empty-art">◎</div>
          <div className="empty-title">Nothing to practice yet</div>
          <p className="empty-body">Learn a concept first — then papers, application drills and contrast training unlock here.</p>
          <a className="btn btn-primary" href="#/learn">Go learn something</a>
        </div>
      )}

      <div className="section-label mt-4"><h3>Focused practice</h3></div>
      <div className="subject-grid">
        <ModeCard
          icon="review" title="Retrieval" desc="Recall from memory, no hints — the core memory builder."
          disabled={learnedTotal === 0} onClick={() => runner.open({ kind: 'session-setup', minutes: 10, focus: { type: 'due' } } as never)}
        />
        <ModeCard
          icon="gaps" title="Weak spots" desc={`${weak} concepts below mastery — targeted repair with scaffolding.`}
          disabled={weak === 0} onClick={() => runner.open({ kind: 'session-setup', minutes: 10, focus: { type: 'weak' } } as never)}
        />
        <ModeCard
          icon="compare" title="Contrast training" desc={pairs.length ? `${pairs.length} pair${pairs.length > 1 ? 's' : ''} you keep mixing up.` : 'Appears when you mix up similar concepts.'}
          disabled={pairs.length === 0} onClick={() => runner.open({ kind: 'session-setup', minutes: 10, focus: { type: 'compare' } } as never)}
        />
        <ModeCard
          icon="blurt" title="Brain dump" desc="Write everything you remember — we map the gaps."
          disabled={learnedTotal === 0} onClick={() => runner.open({ kind: 'session-setup', minutes: 5, focus: { type: 'blurt' } } as never)}
        />
        <ModeCard
          icon="sound" title="Teach-back" desc="Explain a concept in your own words — the strongest test."
          disabled={learnedTotal === 0} onClick={() => runner.open({ kind: 'session-setup', minutes: 10, focus: { type: 'application' } } as never)}
        />
        {misconceptions.length > 0 && (
          <ModeCard
            icon="x" title="Trap correction" desc={`${misconceptions.length} active misconception${misconceptions.length > 1 ? 's' : ''} — error-first correction.`}
            onClick={() => { window.location.hash = '#/review'; }}
          />
        )}
      </div>

      {recent.length > 0 && (
        <>
          <div className="section-label mt-4"><h3>Recent practice</h3></div>
          {recent.map((s) => {
            const correct = s.executed.filter((e) => e.correct).length;
            const pct = s.executed.length ? Math.round((correct / s.executed.length) * 100) : 0;
            return (
              <div className="row" key={s.id} style={{ cursor: 'default' }}>
                <Icon name="target" size={16} />
                <div className="row-main">
                  <div className="row-title">Session · {new Date(s.startedAt).toLocaleDateString()}</div>
                  <div className="row-sub">{s.executed.length} items · {s.plannedMinutes} min planned</div>
                </div>
                <span className="chip" style={pct >= 80 ? { background: 'var(--moss-soft)', color: 'var(--moss)' } : pct >= 60 ? { background: 'var(--amber-soft)', color: 'var(--amber-strong)' } : { background: 'var(--berry-soft)', color: 'var(--berry)' }}>
                  {pct}%
                </span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function ModeCard({ icon, title, desc, disabled, onClick }: { icon: string; title: string; desc: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button className="panel" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left', opacity: disabled ? 0.55 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }} disabled={disabled} onClick={onClick}>
      <span className="quick-ico" style={{ background: 'var(--pine-faint)', color: 'var(--pine-strong)' }}>
        <Icon name={icon} size={18} />
      </span>
      <span>
        <span style={{ display: 'block', fontWeight: 650 }}>{title}</span>
        <span className="small muted" style={{ display: 'block', marginTop: 2 }}>{desc}</span>
      </span>
    </button>
  );
}
