/**
 * Study fatigue awareness (req 55).
 * Signals: unusually slow responses, rapid mistakes, repeated retries,
 * long continuous sessions. Response: recommend break / switch type /
 * reduce difficulty / finish with a successful retrieval. Never punish.
 */
import { Attempt } from './types';
import { clamp01, mean } from './utils';

export interface FatigueInput {
  /** attempts in the current session, in order */
  sessionAttempts: Attempt[];
  sessionStartMs: number;
  now: number;
  /** learner's typical response time (ms) across history */
  typicalResponseMs: number;
}

export interface FatigueState {
  level: number; // 0..1
  signals: string[];
  recommendation: 'continue' | 'switch-type' | 'reduce-difficulty' | 'break' | 'wrap-up-success';
}

export function estimateFatigue(input: FatigueInput): FatigueState {
  const signals: string[] = [];
  let level = 0;
  const a = input.sessionAttempts;

  if (a.length >= 3) {
    const recent = a.slice(-3);
    const earlier = a.slice(0, Math.max(0, a.length - 3));
    // 1. unusually slow responses
    if (input.typicalResponseMs > 0) {
      const recentMs = mean(recent.map((x) => x.responseMs));
      if (recentMs > input.typicalResponseMs * 1.8) {
        level += 0.3;
        signals.push('slow-responses');
      }
    }
    // 2. rapid mistakes (fast + wrong)
    const rapidMistakes = recent.filter((x) => !x.correct && x.responseMs < 7000).length;
    if (rapidMistakes >= 2) {
      level += 0.3;
      signals.push('rapid-mistakes');
    }
    // 3. accuracy collapse vs earlier in session
    if (earlier.length >= 2) {
      const earlyAcc = mean(earlier.map((x) => (x.correct ? 1 : 0)));
      const lateAcc = mean(recent.map((x) => (x.correct ? 1 : 0)));
      if (earlyAcc - lateAcc >= 0.4) {
        level += 0.25;
        signals.push('accuracy-drop');
      }
    }
  }

  // 4. long continuous session
  const minutes = (input.now - input.sessionStartMs) / 60000;
  if (minutes > 45) {
    level += 0.25;
    signals.push('long-session');
  } else if (minutes > 30) {
    level += 0.12;
    signals.push('medium-session');
  }

  level = clamp01(level);

  let recommendation: FatigueState['recommendation'] = 'continue';
  if (level >= 0.75) recommendation = 'break';
  else if (level >= 0.5) recommendation = 'switch-type';
  else if (level >= 0.35) recommendation = 'reduce-difficulty';

  return { level, signals, recommendation };
}

/** Session should end with a successful retrieval (req 55). */
export function shouldEndWithSuccess(sessionAttempts: Attempt[]): boolean {
  const last = sessionAttempts.slice(-2);
  return last.length > 0 && last.every((a) => a.correct);
}
