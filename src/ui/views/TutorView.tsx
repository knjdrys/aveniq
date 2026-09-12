/**
 * Tutor — StudyBuddy's tutor view structure: pick a concept, then a chat
 * thread where AVENIQ's Socratic engine asks the guiding questions.
 * Deterministic ladder by default (works offline); AI optional on top.
 * The tutor knows your real state and never hands over answers.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Question } from '../../domain/types';
import { useServices } from '../../appContext';
import { Icon } from '../components';

interface Msg { who: 'tutor' | 'me'; text: string; source?: 'engine' | 'ai' }

export function TutorView() {
  const services = useServices();
  const concepts = useLiveQuery(() => services.db.concepts.toArray(), [], []);
  const states = useLiveQuery(() => services.db.conceptStates.toArray(), [], []);
  const [conceptId, setConceptId] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [aiOn, setAiOn] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    void services.ai.isConfigured().then(setAiConfigured);
  }, [services]);

  const concept = concepts.find((c) => c.id === conceptId);
  const stateOf = conceptId ? states.find((s) => s.conceptId === conceptId) : undefined;
  const questions = useLiveQuery(
    () => (conceptId
      ? services.db.questions.where('conceptId').equals(conceptId).toArray()
      : Promise.resolve([] as Question[])) as Promise<Question[]>,
    [conceptId],
    [] as Question[],
  );

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const starters = useMemo(() => {
    const steps = questions.flatMap((q) => q.socraticSteps ?? []);
    return Array.from(new Set(steps)).slice(0, 3);
  }, [questions]);

  useEffect(() => {
    if (!concept) return;
    const first = questions.flatMap((q) => q.socraticSteps ?? [])[0]
      ?? `Before we start — in your own words, what do you think “${concept.name}” is about?`;
    setMsgs([{ who: 'tutor', text: `Let’s work on ${concept.name}. ${first}` }]);
    setStep(0);
  }, [conceptId, questions]);

  const send = async (text: string) => {
    if (!text.trim() || !concept) return;
    setMsgs((m) => [...m, { who: 'me', text }]);
    setInput('');
    setBusy(true);
    try {
      const q = questions[0] ?? null;
      const res = aiOn
        ? await services.ai.socraticReply(concept, q, text, step)
        : {
            reply:
              (questions.flatMap((q) => q.socraticSteps ?? [])[step + 1] ?? questions.flatMap((q) => q.socraticSteps ?? [])[0])
              ?? `Good — now take it further: what would change if ${concept.name.toLowerCase()} didn’t apply? Try explaining it with an example.`,
            source: 'engine' as const,
          };
      setStep((s) => s + 1);
      setMsgs((m) => [...m, { who: 'tutor', text: res.reply, source: res.source }]);
    } finally {
      setBusy(false);
    }
  };

  if (!concepts.length) {
    return (
      <div className="empty">
        <div className="empty-art">◎</div>
        <div className="empty-title">Nothing to tutor yet</div>
        <p className="empty-body">Add a subject, then come back — the tutor works through your own concepts.</p>
        <a className="btn btn-primary" href="#/library">Add material</a>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div className="grow">
          <div className="page-kicker">Tutor</div>
          <h1 className="page-title">Ask, don’t tell</h1>
          <p className="page-sub">A Socratic guide through your own concepts — it asks questions, you build the answer. Works fully offline; AI is optional.</p>
        </div>
        {aiConfigured !== null && (
          <button
            className={`btn ${aiOn ? 'btn-primary' : ''}`}
            onClick={() => setAiOn(!aiOn)}
            title={aiConfigured ? 'AI replies when enabled' : 'No AI key set — engine ladder is used'}
          >
            <Icon name="sound" size={15} /> AI: {aiOn ? 'on' : 'off'}
          </button>
        )}
      </div>

      <div className="field">
        <label className="label" htmlFor="tv-concept">Concept</label>
        <select id="tv-concept" className="select" value={conceptId} onChange={(e) => setConceptId(e.target.value)}>
          <option value="">Pick a concept…</option>
          {concepts.map((c) => {
            const s = states.find((x) => x.conceptId === c.id);
            return <option key={c.id} value={c.id}>{c.name}{s ? ` (${Math.round(s.mastery)}%)` : ''}</option>;
          })}
        </select>
      </div>

      {concept ? (
        <div className="panel mt">
          {stateOf && (
            <p className="tiny muted" style={{ marginBottom: 10 }}>
              Your state: {stateOf.state} · mastery {Math.round(stateOf.mastery)}% · the tutor sees this, and your known misconceptions.
            </p>
          )}
          <div className="chat-thread">
            {msgs.map((m, i) => (
              <div key={i} className={`chat-msg ${m.who === 'tutor' ? 'tutor' : 'me'}`}>
                {m.text}
                {m.source === 'ai' && <span className="tiny muted"> · via AI (validated)</span>}
              </div>
            ))}
            {busy && <div className="chat-msg tutor muted">thinking…</div>}
            <div ref={endRef} />
          </div>

          {msgs.length <= 2 && starters.length > 0 && (
            <div className="chat-quick" style={{ marginBottom: 10 }}>
              {starters.map((s, i) => (
                <button key={i} className="chip" style={{ cursor: 'pointer' }} onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          )}

          <div className="row" style={{ gap: 8, cursor: 'default' }}>
            <input
              className="input grow"
              style={{ flex: 1 }}
              placeholder="Your answer or question…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send(input)}
              aria-label="Message to tutor"
            />
            <button className="btn btn-primary" disabled={!input.trim() || busy} onClick={() => send(input)}>Send</button>
          </div>
          <p className="tiny muted mt-2">
            The tutor guides; it won’t hand over answers. When you’ve got it, prove it — Feynman-style — back on the concept page.
          </p>
        </div>
      ) : (
        <div className="panel muted mt">Pick a concept to start a guided conversation.</div>
      )}
    </div>
  );
}
