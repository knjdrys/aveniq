/**
 * Session runner — walks a planned session (first encounters, questions,
 * teach-backs, comparisons) inside the full-screen runner overlay.
 */
import React from 'react';
import { SessionView } from '../views/SessionView';
import { RunnerProps } from '../runnerHost';

export function SessionRunner({ sessionId }: RunnerProps & { sessionId: string }) {
  return <SessionView sessionId={sessionId} />;
}
