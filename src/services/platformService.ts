/**
 * Platform services: speech (req 63) + notifications (req 62).
 * Both degrade gracefully when unsupported (req 69).
 */
import { AveniqDB } from '../db/db';
import { Clock, realClock } from '../domain/clock';
import { LearningService } from './learningService';
import { isDue } from '../domain/scheduler';
import { DAY } from '../domain/utils';

/* ---------------- Speech (req 63) ---------------- */

export class SpeechService {
  private supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  private rate = 1;

  setRate(rate: number) {
    this.rate = rate;
  }

  speak(text: string): boolean {
    if (!this.supported || !text) return false;
    try {
      window.speechSynthesis.cancel();
      const clean = text.replace(/\[\[|\]\]/g, '').replace(/[#*`_>]/g, '');
      const utter = new SpeechSynthesisUtterance(clean);
      utter.rate = this.rate;
      window.speechSynthesis.speak(utter);
      return true;
    } catch {
      return false;
    }
  }

  stop(): void {
    if (this.supported) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* noop */
      }
    }
  }

  get isSupported(): boolean {
    return this.supported;
  }
}

/* ---------------- Notifications (req 62) ---------------- */

export class NotificationService {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private db: AveniqDB,
    private learning: LearningService,
    private clock: Clock = realClock,
  ) {}

  async requestPermission(): Promise<{ ok: boolean; reason?: string }> {
    if (typeof Notification === 'undefined') return { ok: false, reason: 'notifs.unsupported' };
    if (Notification.permission === 'granted') return { ok: true };
    try {
      const result = await Notification.requestPermission();
      return result === 'granted' ? { ok: true } : { ok: false, reason: result === 'denied' ? 'notifs.denied' : 'notifs.dismissed' };
    } catch {
      return { ok: false, reason: 'notifs.failed' };
    }
  }

  /** Non-spammy check: fires at most once per day per kind (req 62). */
  async check(): Promise<void> {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const learner = await this.learning.getLearner();
    if (!learner.settings.notificationsEnabled) return;
    const now = this.clock.now();
    const lastFired = await this.db.events.where('type').equals('notification.fired').last();
    if (lastFired && now - lastFired.ts < DAY) return;

    const states = await this.learning.statesMap();
    const dueCount = [...states.values()].filter((s) => s.scheduler.lastReviewedAt != null && isDue(s.scheduler, now)).length;
    let message: string | null = null;
    if (dueCount >= 5) message = `${dueCount} concepts are due for review — a 5-minute session keeps them alive.`;
    else {
      const soonExam = (await this.db.exams.toArray()).find((e) => e.date > now && e.date - now < 3 * DAY);
      if (soonExam) message = `“${soonExam.title}” is in ${Math.round((soonExam.date - now) / DAY)} days. Readiness check time?`;
    }
    if (message) {
      try {
        new Notification('AVENIQ', { body: message, icon: './favicon.svg' });
        await this.db.events.add({ ts: now, type: 'notification.fired', payload: { message } });
      } catch {
        /* noop */
      }
    }
  }

  startPeriodicCheck(intervalMs = 30 * 60_000): void {
    this.stop();
    this.timer = setInterval(() => {
      void this.check();
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
