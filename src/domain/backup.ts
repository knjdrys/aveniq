/**
 * Backup (req 60) + optional sync (req 61).
 * Versioned backup format containing ALL meaningful learning state,
 * with a migration chain. Sync is file-based (sync packs) with
 * last-writer-wins by (updatedAt, deviceId) and tombstones — a future
 * server can consume the same record shapes.
 */
import {
  Attempt,
  Card,
  Concept,
  ConceptState,
  ConfusionPair,
  Exam,
  ID,
  Insight,
  KnowledgeGap,
  LearnerModel,
  MisconceptionRecord,
  Note,
  Question,
  ReadinessSnapshot,
  Resource,
  StudyPlan,
  StudySession,
  Subject,
  Topic,
} from './types';

export const BACKUP_FORMAT = 'aveniq.backup';
export const BACKUP_VERSION = 2;

export interface BackupData {
  subjects: Subject[];
  topics: Topic[];
  concepts: Concept[];
  questions: Question[];
  cards: Card[];
  conceptStates: ConceptState[];
  attempts: Attempt[];
  misconceptions: MisconceptionRecord[];
  confusionPairs: ConfusionPair[];
  gaps: KnowledgeGap[];
  sessions: StudySession[];
  plans: StudyPlan[];
  exams: Exam[];
  readiness: ReadinessSnapshot[];
  insights: Insight[];
  learner: LearnerModel | null;
  notes: Note[];
  resources: Resource[];
}

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  appVersion: string;
  data: BackupData;
}

export interface SyncPack {
  format: 'aveniq.syncpack';
  version: number;
  deviceId: string;
  exportedAt: number;
  /** LWW-mergeable tables */
  subjects: Subject[];
  topics: Topic[];
  concepts: Concept[];
  questions: Question[];
  cards: Card[];
  conceptStates: ConceptState[];
  misconceptions: MisconceptionRecord[];
  confusionPairs: ConfusionPair[];
  gaps: KnowledgeGap[];
  plans: StudyPlan[];
  exams: Exam[];
  notes: Note[];
  learner: LearnerModel | null;
  /** append-only, merged by id */
  attempts: Attempt[];
  sessions: StudySession[];
  insights: Insight[];
}

export function validateBackup(json: unknown): { ok: boolean; backup?: Backup; error?: string } {
  if (typeof json !== 'object' || json == null) return { ok: false, error: 'Not an object' };
  const b = json as Record<string, unknown>;
  if (b.format !== BACKUP_FORMAT) return { ok: false, error: `Not an AVENIQ backup (format: ${String(b.format)})` };
  const version = Number(b.version);
  if (!Number.isFinite(version)) return { ok: false, error: 'Missing version' };
  const data = b.data as BackupData | undefined;
  if (!data || typeof data !== 'object') return { ok: false, error: 'Missing data' };
  if (!Array.isArray(data.concepts)) return { ok: false, error: 'Missing concepts' };
  return { ok: true, backup: b as unknown as Backup };
}

/** v1 backups (no readiness/resources) → v2 shape. */
export function migrateBackup(b: Backup): Backup {
  if (b.version >= BACKUP_VERSION) return b;
  const data = { ...b.data };
  if (!Array.isArray((data as Partial<BackupData>).readiness)) (data as BackupData).readiness = [];
  if (!Array.isArray((data as Partial<BackupData>).resources)) (data as BackupData).resources = [];
  return { ...b, version: BACKUP_VERSION, data };
}

/* ---------- Sync merge (req 61) ---------- */

type LWWRecord = { id?: string; conceptId?: string; updatedAt?: number; ts?: number; deleted?: boolean };

/** Last-writer-wins by updatedAt (tiebreak: deviceId), tombstones honored. */
export function mergeLWW<T extends LWWRecord>(
  local: T[],
  remote: T[],
  keyOf: (r: T) => string,
  remoteDeviceId: string,
): { merged: T[]; changed: number } {
  const map = new Map<string, { rec: T; stamp: number; device: string }>();
  let changed = 0;
  const consider = (rec: T, device: string) => {
    const key = keyOf(rec);
    const stamp = rec.updatedAt ?? rec.ts ?? 0;
    const existing = map.get(key);
    if (!existing || stamp > existing.stamp || (stamp === existing.stamp && device > existing.device)) {
      map.set(key, { rec, stamp, device });
      if (existing) changed++;
    }
  };
  local.forEach((r) => consider(r, 'local'));
  remote.forEach((r) => consider(r, remoteDeviceId));
  // apply tombstones: a newer deleted record wins and is dropped from output
  const merged: T[] = [];
  for (const { rec } of map.values()) {
    if (rec.deleted) {
      // tombstone: only keep if local also had it non-deleted? For simplicity,
      // tombstones remove the record entirely; the sync pack carries them so
      // deletions propagate. Keep deleted records out of the merged set.
      continue;
    }
    merged.push(rec);
  }
  return { merged, changed };
}

/** Append-only merge (attempts/sessions/insights) by natural key. */
export function mergeAppend<T extends { id: string }>(local: T[], remote: T[]): { merged: T[]; added: number } {
  const ids = new Set(local.map((x) => x.id));
  const additions = remote.filter((r) => !ids.has(r.id));
  return { merged: [...local, ...additions], added: additions.length };
}

export function buildSyncPack(data: BackupData, deviceId: string, now: number): SyncPack {
  return {
    format: 'aveniq.syncpack',
    version: 1,
    deviceId,
    exportedAt: now,
    subjects: data.subjects,
    topics: data.topics,
    concepts: data.concepts,
    questions: data.questions,
    cards: data.cards,
    conceptStates: data.conceptStates,
    misconceptions: data.misconceptions,
    confusionPairs: data.confusionPairs,
    gaps: data.gaps,
    plans: data.plans,
    exams: data.exams,
    notes: data.notes,
    learner: data.learner,
    attempts: data.attempts,
    sessions: data.sessions,
    insights: data.insights,
  };
}
