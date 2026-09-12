/**
 * Learn (goal view): the frontier — concepts ready to learn from zero,
 * with prerequisite readiness and WHY. Runs the first-encounter flow.
 */
import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useServices, navigate } from '../../appContext';
import { Empty, Icon, Ring } from '../components';
import { unlockFrontier } from '../../domain/graph';

export function LearnView() {
  const services = useServices();
  const concepts = useLiveQuery(() => services.db.concepts.toArray(), [], []);
  const subjects = useLiveQuery(() => services.db.subjects.toArray(), [], []);
  const states = useLiveQuery(() => services.db.conceptStates.toArray(), [], []);
  const [subjectId, setSubjectId] = useState('');
  const [starting, setStarting] = useState<string | null>(null);

  const stateOf = (id: string) => states.find((s) => s.conceptId === id);

  const frontier = useMemo(() => {
    if (!concepts.length) return [];
    const prereqMap = new Map(concepts.filter((c) => c.prerequisites.length).map((c) => [c.id, c.prerequisites]));
    const ids = unlockFrontier(
      concepts.map((c) => c.id),
      prereqMap,
      (id) => (stateOf(id)?.mastery ?? 0) >= 45,
      (id) => {
        const s = stateOf(id);
        return !!s && (s.firstSeenAt != null || s.attempts > 0);
      },
    );
    const list = concepts.filter((c) => ids.includes(c.id));
    return subjectId ? list.filter((c) => c.subjectId === subjectId) : list;
  }, [concepts, states, subjectId]);

  const startFE = async (conceptId: string) => {
    setStarting(conceptId);
    try {
      const session = await services.sessions.start({ minutes: 12, conceptIds: [conceptId] });
      navigate(`/session/${session.id}`);
    } finally {
      setStarting(null);
    }
  };

  return (
    <div className="content">
      <div className="view-head">
        <h1>Learn something new</h1>
        <div className="sub">Zero prior knowledge assumed — vocabulary, analogy, tiny example, then the real thing.</div>
      </div>

      {concepts.length > 0 && subjects.length > 1 && (
        <div className="row mb">
          <button className={`time-chip ${!subjectId ? 'active' : ''}`} onClick={() => setSubjectId('')}>All subjects</button>
          {subjects.map((s) => (
            <button key={s.id} className={`time-chip ${subjectId === s.id ? 'active' : ''}`} onClick={() => setSubjectId(s.id)}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      {!concepts.length && (
        <div className="card">
          <Empty icon="library">
            <p>Your library is empty. Paste any study material — notes, a chapter, term lists —</p>
            <a className="btn primary" href="#/ingest"><Icon name="import" size={16} /> Add material</a>
          </Empty>
        </div>
      )}

      {concepts.length > 0 && !frontier.length && (
        <div className="card">
          <Empty icon="check">
            The frontier is closed — every unlockable concept has been started.
            Keep going in <a href="#/review">Review</a>, or add material to open new ground.
          </Empty>
        </div>
      )}

      {frontier.slice(0, 8).map((c) => {
        const prereqs = c.prerequisites.map((p) => concepts.find((x) => x.id === p)).filter(Boolean);
        const allReady = prereqs.every((p) => (stateOf(p!.id)?.mastery ?? 0) >= 45);
        return (
          <div className="card frontier-card" key={c.id}>
            <Ring value={stateOf(c.id)?.mastery ?? 0} size={46} stroke={5} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ gap: 8 }}>
                <strong style={{ fontSize: 16 }}>{c.name}</strong>
                {allReady && prereqs.length > 0 && <span className="unlock-pill">foundations ready</span>}
              </div>
              <div className="small muted" style={{ margin: '3px 0 4px' }}>{c.intro}</div>
              {prereqs.length > 0 && (
                <div className="tiny muted">Builds on: {prereqs.map((p) => p!.name).join(' · ')}</div>
              )}
            </div>
            <button className="btn primary" disabled={starting === c.id} onClick={() => startFE(c.id)}>
              {starting === c.id ? 'Preparing…' : 'From zero →'}
            </button>
          </div>
        );
      })}

      {concepts.length > 0 && (
        <div className="tiny muted center mt">
          Locked concepts show on the <a href="#/map">map</a> — learn their foundations and they unlock.
        </div>
      )}
    </div>
  );
}
