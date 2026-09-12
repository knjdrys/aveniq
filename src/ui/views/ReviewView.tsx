/**
 * Review (goal view): the due queue + fading watchlist + "what's blocking
 * you" (gaps, active misconceptions, confusions) with root-cause fixes.
 * This is where memory is defended.
 */
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useServices, navigate } from '../../appContext';
import { Empty, Icon, Ring, StateChip, useToast } from '../components';

const CAUSE_LABEL: Record<string, string> = {
  prerequisite: 'Missing foundation',
  vocabulary: 'Vocabulary',
  misconception: 'Misconception',
  calculation: 'Calculation slip',
  careless: 'Careless mistake',
  memory: 'Forgot',
  application: 'Couldn’t apply',
  interpretation: 'Misread the question',
};

export function ReviewView() {
  const services = useServices();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [minutes, setMinutes] = useState(10);

  const concepts = useLiveQuery(() => services.db.concepts.toArray(), [], []);
  const states = useLiveQuery(() => services.db.conceptStates.toArray(), [], []);
  const gaps = useLiveQuery(() => services.db.gaps.where('status').equals('open').toArray(), [], []);
  const misconceptions = useLiveQuery(() => services.db.misconceptions.where('status').equals('active').toArray(), [], []);
  const confusions = useLiveQuery(() => services.db.confusionPairs.where('status').equals('active').toArray(), [], []);

  const name = (id: string) => concepts.find((c) => c.id === id)?.name ?? id;
  const concept = (id: string) => concepts.find((c) => c.id === id);
  const stateOf = (id: string) => states.find((s) => s.conceptId === id);

  const now = Date.now();
  const dueList = states
    .filter((s) => s.scheduler.lastReviewedAt != null && now >= s.scheduler.dueAt)
    .sort((a, b) => a.scheduler.dueAt - b.scheduler.dueAt);
  const fading = states.filter((s) => s.flag === 'decaying' && s.scheduler.lastReviewedAt != null && now < s.scheduler.dueAt);
  const confused = states.filter((s) => s.flag === 'confused');
  const blockedCount = gaps.length + misconceptions.length + confusions.length;

  const startReview = async () => {
    setBusy(true);
    try {
      const session = await services.sessions.start({ minutes, focus: { type: 'due' } });
      if (!session.items.length) {
        toast('Nothing due right now — memory is fresh.', 'error');
        await services.sessions.abandon(session.id);
        return;
      }
      navigate(`/session/${session.id}`);
    } finally {
      setBusy(false);
    }
  };

  const fixConcept = async (conceptId: string) => {
    const session = await services.sessions.start({ minutes: 10, conceptIds: [conceptId] });
    navigate(`/session/${session.id}`);
  };

  return (
    <div className="content">
      <div className="view-head">
        <h1>Keep memory alive</h1>
        <div className="sub">
          {dueList.length > 0
            ? `${dueList.length} concept${dueList.length > 1 ? 's' : ''} ready for retrieval — scheduled for exactly this moment.`
            : 'Nothing due. Memory is fresh — that’s the system working.'}
        </div>
      </div>

      {dueList.length > 0 && (
        <div className="card mb">
          <div className="row between mb">
            <h2>Due now</h2>
            <div className="row">
              {[5, 10, 25].map((m) => (
                <button key={m} className={`time-chip ${minutes === m ? 'active' : ''}`} onClick={() => setMinutes(m)}>{m}m</button>
              ))}
              <button className="btn primary" disabled={busy} onClick={startReview}>
                {busy ? 'Planning…' : 'Start review'}
              </button>
            </div>
          </div>
          {dueList.slice(0, 10).map((s) => {
            const c = concept(s.conceptId);
            if (!c) return null;
            const overdue = Math.max(0, (now - s.scheduler.dueAt) / 86_400_000);
            return (
              <div className="due-row" key={s.conceptId}>
                <Ring value={s.mastery} size={34} stroke={4} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{c.name}</div>
                  <div className="tiny muted">
                    stability {Math.round(s.scheduler.stabilityDays * 10) / 10}d
                    {overdue > 1 ? ` · ${Math.floor(overdue)}d overdue` : ''}
                    {s.scheduler.lapses > 0 ? ` · ${s.scheduler.lapses} lapse${s.scheduler.lapses > 1 ? 's' : ''}` : ''}
                  </div>
                </div>
                <StateChip state={s.state} flag={s.flag} />
              </div>
            );
          })}
          {dueList.length > 10 && <div className="tiny muted mt">+{dueList.length - 10} more — all queued in the review session.</div>}
        </div>
      )}

      {(fading.length > 0 || confused.length > 0) && (
        <div className="card mb">
          <h2 className="mb">Watchlist</h2>
          {fading.length > 0 && (
            <>
              <h3>Fading — mastery is decaying with time</h3>
              {fading.slice(0, 5).map((s) => (
                <div className="due-row" key={s.conceptId}>
                  <span className="chip amber">fading</span>
                  <div style={{ flex: 1 }}>{name(s.conceptId)}</div>
                </div>
              ))}
            </>
          )}
          {confused.length > 0 && (
            <>
              <h3 className="mt">Confused — recent failures flagged this</h3>
              {confused.slice(0, 5).map((s) => (
                <div className="due-row" key={s.conceptId}>
                  <span className="chip coral">confused</span>
                  <div style={{ flex: 1 }}>{name(s.conceptId)}</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <div className="card">
        <div className="row between mb">
          <h2>What’s blocking you</h2>
          {blockedCount > 0 && <span className="chip coral">{blockedCount} open</span>}
        </div>

        {blockedCount === 0 && (
          <Empty icon="check">Nothing blocking you. Every failure gets diagnosed — nothing hides.</Empty>
        )}

        {confusions.map((p) => (
          <div className="due-row" key={p.id}>
            <span className="chip coral">mixed up</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14.5 }}>{name(p.aId)} ↔ {name(p.bId)}</div>
              <div className="tiny muted">{p.abCount + p.baCount} mix-ups · contrast training fixes it</div>
            </div>
            <button className="btn sm" onClick={() => fixConcept(p.abCount >= p.baCount ? p.aId : p.bId)}>Contrast</button>
          </div>
        ))}

        {misconceptions.map((m) => {
          const c = concept(m.conceptId);
          const def = c?.misconceptionDefs.find((d) => d.id === m.defId);
          if (!def) return null;
          return (
            <div className="due-row" key={m.id}>
              <span className="chip coral">trap</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5 }}>{def.label}</div>
                <div className="tiny muted">Truth: {def.correction}</div>
              </div>
              <button className="btn sm" onClick={() => fixConcept(m.conceptId)}>Fix</button>
            </div>
          );
        })}

        {gaps
          .sort((a, b) => b.occurrences - a.occurrences)
          .slice(0, 8)
          .map((g) => (
            <div className="due-row" key={g.id}>
              <span className={`chip ${g.cause === 'prerequisite' || g.cause === 'misconception' ? 'coral' : 'amber'}`}>
                {CAUSE_LABEL[g.cause] ?? g.cause}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5 }}>
                  {name(g.conceptId)}
                  {g.rootConceptId && g.rootConceptId !== g.conceptId ? ` — root: ${name(g.rootConceptId)}` : ''}
                </div>
                <div className="tiny muted">{g.detail}</div>
              </div>
              <button
                className="btn sm"
                onClick={() => fixConcept(g.rootConceptId && g.cause === 'prerequisite' ? g.rootConceptId : g.conceptId)}
              >
                Fix root
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
