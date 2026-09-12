/**
 * Learn — StudyBuddy's structure: subject covers grid → subject page
 * (topics → concepts with stage chips and per-concept actions) → concept
 * detail. AVENIQ adds the frontier (what's unlockable) and first-encounter.
 */
import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useServices } from '../../appContext';
import { Icon, StateChip, Empty } from '../components';
import { useRunner } from '../runnerHost';
import { unlockFrontier } from '../../domain/graph';
import { t } from '../../domain/i18n';

export function LearnView() {
  const services = useServices();
  const runner = useRunner();
  const subjects = useLiveQuery(() => services.db.subjects.toArray(), [], []);
  const topics = useLiveQuery(() => services.db.topics.toArray(), [], []);
  const concepts = useLiveQuery(() => services.db.concepts.toArray(), [], []);
  const states = useLiveQuery(() => services.db.conceptStates.toArray(), [], []);

  const stateOf = (id: string) => states.find((s) => s.conceptId === id);
  const subjectStats = (subjectId: string) => {
    const own = concepts.filter((c) => c.subjectId === subjectId);
    const mastered = own.filter((c) => stateOf(c.id)?.state === 'mastered').length;
    const avg = own.length ? own.reduce((s, c) => s + (stateOf(c.id)?.mastery ?? 0), 0) / own.length : 0;
    const due = own.filter((c) => {
      const st = stateOf(c.id);
      return st && st.scheduler.lastReviewedAt != null && Date.now() >= st.scheduler.dueAt;
    }).length;
    return { count: own.length, mastered, readiness: Math.round(avg), due };
  };

  return (
    <div>
      <div className="page-head">
        <div className="grow">
          <div className="page-kicker">Learn</div>
          <h1 className="page-title">Your subjects</h1>
          <p className="page-sub">Pick a subject to keep going — reviews, practice and explanations live inside each one.</p>
        </div>
        <div className="btn-row">
          <a className="btn" href="#/library"><Icon name="import" size={15} /> Import material</a>
        </div>
      </div>

      {subjects.length ? (
        <div className="subject-grid">
          {subjects.map((s) => {
            const st = subjectStats(s.id);
            return (
              <button key={s.id} className="subject-cover" onClick={() => { window.location.hash = `#/subject/${s.id}`; }}>
                <div className="split">
                  <div>
                    <h2>{s.name}</h2>
                    {s.description && <div className="page-kicker" style={{ marginTop: 2 }}>{s.description}</div>}
                  </div>
                  <RingLabel percent={st.count ? st.readiness / 100 : 0} label={st.count ? `${st.readiness}%` : '—'} />
                </div>
                <div className="split" style={{ alignItems: 'center' }}>
                  <div className="chip-btns">
                    <span className="chip">{st.count} {st.count === 1 ? 'concept' : 'concepts'}</span>
                    {st.due > 0 && <span className="chip berry">{st.due} due</span>}
                    <span className="chip moss">{st.mastered} mastered</span>
                  </div>
                  <span className="chev"><Icon name="arrow" size={16} style={{ transform: 'rotate(-90deg)' }} /></span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <Empty glyph="◫" title="No subjects yet" body="Import material or browse the map — within a couple of minutes you’ll be studying with a plan.">
          <a className="btn btn-primary" href="#/library">Import from notes</a>
        </Empty>
      )}
    </div>
  );
}

/* ---------------- subject page ---------------- */

export function SubjectView({ subjectId }: { subjectId: string }) {
  const services = useServices();
  const runner = useRunner();
  const subject = useLiveQuery(() => services.db.subjects.get(subjectId), [subjectId]);
  const topics = useLiveQuery(() => services.db.topics.where('subjectId').equals(subjectId).toArray(), [subjectId], []);
  const concepts = useLiveQuery(() => services.db.concepts.where('subjectId').equals(subjectId).toArray(), [subjectId], []);
  const states = useLiveQuery(() => services.db.conceptStates.toArray(), [], []);
  const exams = useLiveQuery(() => services.db.exams.where('subjectId').equals(subjectId).toArray(), [subjectId], []);

  const stateOf = (id: string) => states.find((s) => s.conceptId === id);

  const frontier = useMemo(() => {
    const all = concepts;
    const prereqMap = new Map(all.filter((c) => c.prerequisites.length).map((c) => [c.id, c.prerequisites]));
    return unlockFrontier(
      all.map((c) => c.id),
      prereqMap,
      (id) => (stateOf(id)?.mastery ?? 0) >= 45,
      (id) => { const s = stateOf(id); return !!s && (s.firstSeenAt != null || s.attempts > 0); },
    );
  }, [concepts, states]);

  if (subject === undefined) return <div className="panel muted">Loading…</div>;
  if (!subject) return <div className="panel">Subject not found. <a className="btn" href="#/learn">Back</a></div>;

  const learned = concepts.filter((c) => (stateOf(c.id)?.attempts ?? 0) >= 1);

  return (
    <div>
      <button className="btn btn-quiet btn-sm" onClick={() => history.back()}><Icon name="back" size={14} /> All subjects</button>
      <div className="page-head" style={{ marginTop: 'var(--space-3)' }}>
        <div className="grow">
          <div className="page-kicker">Subject</div>
          <h1 className="page-title">{subject.name}</h1>
          <p className="page-sub">{concepts.length} concepts · {frontier.length} ready to learn from zero · {learned.length} in progress</p>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => runner.open({ kind: 'session-setup', subjectId })}><Icon name="play" size={15} /> Session</button>
          {learned.length > 0 && (
            <button className="btn" onClick={() => runner.open({ kind: 'blurt', conceptIds: learned.map((c) => c.id), title: `Brain dump · ${subject.name}` })}>
              <Icon name="blurt" size={15} /> Brain dump
            </button>
          )}
        </div>
      </div>

      {frontier.length > 0 && (
        <>
          <div className="section-label"><h3>Ready to learn — from zero</h3></div>
          {concepts.filter((c) => frontier.includes(c.id)).slice(0, 4).map((c) => (
            <div className="row" key={c.id}>
              <div className="row-main">
                <div className="row-title">{c.name}</div>
                <div className="row-sub">{c.intro}</div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => runner.open({ kind: 'session-setup', conceptIds: [c.id], minutes: 12 })}>
                <Icon name="spark" size={14} /> From zero
              </button>
            </div>
          ))}
        </>
      )}

      {topics.map((topic) => {
        const own = concepts.filter((c) => c.topicId === topic.id);
        if (!own.length) return null;
        return (
          <div key={topic.id} className="mt-4">
            <div className="section-label"><h3>{topic.name}</h3></div>
            {own.map((c) => {
              const s = stateOf(c.id);
              return (
                <button key={c.id} className="row" onClick={() => { window.location.hash = `#/concept/${c.id}`; }}>
                  <div className="row-main">
                    <div className="row-title">{c.name}</div>
                    <div className="row-sub">
                      {s ? `mastery ${Math.round(s.mastery)} · ${s.attempts} attempts` : 'not started'}
                      {s?.flag === 'confused' ? ' · confused' : s?.flag === 'decaying' ? ' · fading' : ''}
                    </div>
                  </div>
                  <StateChip state={s?.state ?? 'unknown'} flag={s?.flag} />
                  <Icon name="arrow" size={15} style={{ transform: 'rotate(-90deg)' }} />
                </button>
              );
            })}
          </div>
        );
      })}

      {concepts.filter((c) => !c.topicId).length > 0 && (
        <div className="mt-4">
          <div className="section-label"><h3>Concepts</h3></div>
          {concepts.filter((c) => !c.topicId).map((c) => {
            const s = stateOf(c.id);
            return (
              <button key={c.id} className="row" onClick={() => { window.location.hash = `#/concept/${c.id}`; }}>
                <div className="row-main">
                  <div className="row-title">{c.name}</div>
                  <div className="row-sub">{s ? `mastery ${Math.round(s.mastery)}` : 'not started'}</div>
                </div>
                <StateChip state={s?.state ?? 'unknown'} flag={s?.flag} />
                <Icon name="arrow" size={15} style={{ transform: 'rotate(-90deg)' }} />
              </button>
            );
          })}
        </div>
      )}

      {exams.length > 0 && (
        <div className="mt-4">
          <div className="section-label"><h3>Exams</h3></div>
          {exams.map((e) => (
            <a key={e.id} className="row" href="#/exams">
              <Icon name="exams" size={17} />
              <div className="row-main">
                <div className="row-title">{e.title}</div>
                <div className="row-sub">{new Date(e.date).toLocaleDateString()}</div>
              </div>
              <Icon name="arrow" size={15} style={{ transform: 'rotate(-90deg)' }} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function RingLabel({ percent, label }: { percent: number; label: string }) {
  const size = 44, stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="ring-wrap">
      <svg width={size} height={size} role="img" aria-label={label}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--pine)" strokeWidth={stroke} strokeDasharray={`${c * Math.min(1, percent)} ${c}`} strokeLinecap="round" />
      </svg>
      <span className="ring-label">{label}</span>
    </span>
  );
}
