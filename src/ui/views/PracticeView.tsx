/**
 * Practice (goal view): deliberate practice by intent — retrieval, fixing
 * weak spots, contrast training for mix-ups, application, brain dump,
 * exam practice. "You have N minutes — here's the best way to use them."
 */
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useServices, navigate } from '../../appContext';
import { Icon, useToast } from '../components';

export function PracticeView() {
  const services = useServices();
  const toast = useToast();
  const [minutes, setMinutes] = useState(10);
  const [busy, setBusy] = useState<string | null>(null);

  const concepts = useLiveQuery(() => services.db.concepts.toArray(), [], []);
  const states = useLiveQuery(() => services.db.conceptStates.toArray(), [], []);
  const pairs = useLiveQuery(() => services.db.confusionPairs.where('status').equals('active').toArray(), [], []);
  const exams = useLiveQuery(() => services.db.exams.toArray(), [], []);

  const name = (id: string) => concepts.find((c) => c.id === id)?.name ?? id;
  const due = states.filter((s) => s.scheduler.lastReviewedAt != null && Date.now() >= s.scheduler.dueAt).length;
  const weak = states.filter((s) => s.attempts >= 2 && s.mastery < 45).length;
  const learned = states.filter((s) => s.attempts >= 1).length;

  const start = async (kind: 'due' | 'weak' | 'compare' | 'application' | 'blurt') => {
    setBusy(kind);
    try {
      const session = await services.sessions.start({ minutes, focus: { type: kind } });
      if (!session.items.length) {
        toast('Nothing to practice here yet — learn a concept first.', 'error');
        await services.sessions.abandon(session.id);
        return;
      }
      navigate(`/session/${session.id}`);
    } catch {
      toast('Could not start practice.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="content">
      <div className="view-head">
        <h1>Practice with intent</h1>
        <div className="sub">Each mode targets a different kind of knowing — pick what today needs.</div>
      </div>

      <div className="row mb">
        <span className="tiny muted">Time:</span>
        {[5, 10, 25, 60].map((m) => (
          <button key={m} className={`time-chip ${minutes === m ? 'active' : ''}`} onClick={() => setMinutes(m)}>{m}m</button>
        ))}
      </div>

      <div className="quick-grid" style={{ marginTop: 0 }}>
        <PracticeCard
          icon="review" tint="primary" title="Retrieval practice"
          desc={due > 0 ? `${due} concepts due — recall without hints, from memory` : 'Recall what you’ve learned, from memory'}
          badge={due > 0 ? `${due} due` : undefined}
          disabled={learned === 0} busy={busy === 'due'}
          onClick={() => start('due')}
        />
        <PracticeCard
          icon="gaps" tint="amber" title="Fix weak spots"
          desc={weak > 0 ? `${weak} concepts below mastery — targeted repair with scaffolding` : 'Nothing weak right now'}
          disabled={weak === 0} busy={busy === 'weak'}
          onClick={() => start('weak')}
        />
        <PracticeCard
          icon="compare" tint="coral" title="Contrast training"
          desc={pairs.length ? `You’ve mixed up ${pairs.length} pair${pairs.length > 1 ? 's' : ''}: ${pairs.slice(0, 2).map((p) => `${name(p.aId)} ↔ ${name(p.bId)}`).join(', ')}` : 'Appears when you mix up two similar concepts'}
          disabled={pairs.length === 0} busy={busy === 'compare'}
          onClick={() => start('compare')}
        />
        <PracticeCard
          icon="target" tint="blue" title="Application"
          desc="Use ideas in new situations — the difference between knowing words and knowing"
          disabled={learned === 0} busy={busy === 'application'}
          onClick={() => start('application')}
        />
        <PracticeCard
          icon="blurt" tint="violet" title="Brain dump"
          desc="Timed memory dump — write everything you know, we map the gaps"
          disabled={learned === 0} busy={busy === 'blurt'}
          onClick={() => start('blurt')}
        />
        {exams.length > 0 && (
          <PracticeCard
            icon="exams" tint="green" title="Exam practice"
            desc={`${exams.length} exam${exams.length > 1 ? 's' : ''} tracked — interleaved practice tests`}
            onClick={() => navigate('/exams')}
          />
        )}
      </div>

      <div className="card mt">
        <h3 className="mb">Why these modes exist</h3>
        <div className="small muted">
          Recognition is the weakest form of knowledge. Retrieval from memory strengthens it; application in a new
          context proves it; explaining it — teach-back, brain dump — is the strongest test of all.
          Mix-ups get contrast training because similar concepts interfere with each other in memory.
        </div>
      </div>
    </div>
  );
}

function PracticeCard({
  icon, tint, title, desc, badge, disabled, busy, onClick,
}: {
  icon: string; tint: string; title: string; desc: string; badge?: string;
  disabled?: boolean; busy?: boolean; onClick: () => void;
}) {
  return (
    <button
      className="quick-card"
      onClick={onClick}
      disabled={disabled || busy}
      style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      <span className={`quick-ico chip ${tint}`} style={{ borderRadius: 11, width: 38, height: 38 }}>
        <Icon name={icon} size={19} />
      </span>
      <span>
        <span className="t">{title}{badge ? ` · ${badge}` : ''}</span>
        <span className="d" style={{ display: 'block' }}>{busy ? 'Planning…' : desc}</span>
      </span>
    </button>
  );
}
