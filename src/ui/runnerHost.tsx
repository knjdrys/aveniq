/**
 * Runner overlay system — StudyBuddy's UX pattern: study runners (sessions,
 * flashcards, blurt, Feynman, exams) open as full-screen overlays above the
 * shell, not as navigation destinations. Close returns to where you were.
 */
import React, { createContext, useCallback, useContext, useState } from 'react';
import { Icon } from './components';

export interface RunnerProps {
  close: () => void;
}

type RunnerKind =
  | { kind: 'session-setup'; subjectId?: string; conceptIds?: string[]; minutes?: number; focus?: { type: string } }
  | { kind: 'session'; sessionId: string }
  | { kind: 'cards'; conceptIds: string[]; title: string }
  | { kind: 'blurt'; conceptIds: string[]; title: string }
  | { kind: 'feynman'; conceptId: string }
  | { kind: 'exam-setup'; subjectId: string; examId?: string }
  | { kind: 'exam'; testId: string };

interface RunnerApi {
  open: (r: RunnerKind) => void;
  close: () => void;
}

const RunnerCtx = createContext<RunnerApi>({ open: () => {}, close: () => {} });
export const useRunner = () => useContext(RunnerCtx);

export function RunnerProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<RunnerKind | null>(null);
  const open = useCallback((r: RunnerKind) => setCurrent(r), []);
  const close = useCallback(() => setCurrent(null), []);

  return (
    <RunnerCtx.Provider value={{ open, close }}>
      {children}
      {current && <RunnerHost runner={current} close={close} />}
    </RunnerCtx.Provider>
  );
}

function RunnerHost({ runner, close }: { runner: RunnerKind; close: () => void }) {
  const [node, setNode] = useState<React.ReactNode | null>(null);

  // Escape closes the runner (StudyBuddy overlay pattern)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  // runners are loaded lazily so their view code doesn't block app boot
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      let el: React.ReactNode = null;
      const props = { close };
      if (runner.kind === 'session-setup') {
        const { SessionSetup } = await import('./runners/SessionSetup');
        el = <SessionSetup {...runner} {...props} />;
      } else if (runner.kind === 'session') {
        const { SessionRunner } = await import('./runners/SessionRunner');
        el = <SessionRunner sessionId={runner.sessionId} {...props} />;
      } else if (runner.kind === 'cards') {
        const { CardsRunner } = await import('./runners/CardsRunner');
        el = <CardsRunner conceptIds={runner.conceptIds} title={runner.title} {...props} />;
      } else if (runner.kind === 'blurt') {
        const { BlurtRunner } = await import('./runners/BlurtRunner');
        el = <BlurtRunner conceptIds={runner.conceptIds} title={runner.title} {...props} />;
      } else if (runner.kind === 'feynman') {
        const { FeynmanRunner } = await import('./runners/FeynmanRunner');
        el = <FeynmanRunner conceptId={runner.conceptId} {...props} />;
      } else if (runner.kind === 'exam-setup') {
        const { ExamSetup } = await import('./runners/ExamSetup');
        el = <ExamSetup subjectId={runner.subjectId} examId={runner.examId} {...props} />;
      } else if (runner.kind === 'exam') {
        const { ExamRunner } = await import('./runners/ExamSetup');
        el = <ExamRunner testId={runner.testId} {...props} />;
      }
      if (alive) setNode(el);
    })();
    return () => {
      alive = false;
    };
  }, [runner, close]);

  return (
    <div className="runner-overlay" role="dialog" aria-modal="true" aria-label="Study runner">
      <div className="runner">
        <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 'var(--space-2)' }}>
          <button className="btn btn-quiet btn-sm" onClick={close} aria-label="Close runner">
            <Icon name="x" size={15} /> Close
          </button>
        </div>
        {node ?? <div className="panel muted">Preparing…</div>}
      </div>
    </div>
  );
}
