/**
 * AVENIQ — Domain types.
 * The entire learning engine is built on these contracts.
 * The domain layer is pure: no DOM, no database, no network.
 */

export type ID = string;

/* ============================================================
 * Content model: subjects → topics → concepts → questions
 * ============================================================ */

export interface Subject {
  id: ID;
  name: string;
  description: string;
  color: string; // hex accent
  icon: string; // icon key
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface Topic {
  id: ID;
  subjectId: ID;
  name: string;
  description: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

/** Explanation styles (req 4) — used by the adaptive explanation engine. */
export type ExplanationStyle =
  | 'analogy'
  | 'example'
  | 'visual'
  | 'steps'
  | 'definition'
  | 'comparison'
  | 'scenario'
  | 'worked'
  | 'simplified'
  | 'technical';

/** Depth layers 0–7 (req 3). */
export type LayerKind =
  | 'what' // L0: What is this?
  | 'eli5' // L1: Explain like I'm completely new
  | 'simple-example' // L2: Simple example
  | 'how-it-works' // L3: How it actually works
  | 'realistic' // L4: Realistic example
  | 'formal' // L5: Technical/formal definition
  | 'edge-cases' // L6: Edge cases & common mistakes
  | 'apply'; // L7: Test whether I can apply it

export const LAYER_ORDER: LayerKind[] = [
  'what',
  'eli5',
  'simple-example',
  'how-it-works',
  'realistic',
  'formal',
  'edge-cases',
  'apply',
];

export const LAYER_LABELS: Record<LayerKind, string> = {
  what: 'What is this?',
  eli5: "Like I'm completely new",
  'simple-example': 'Simple example',
  'how-it-works': 'How it works',
  realistic: 'Realistic example',
  formal: 'Technical definition',
  'edge-cases': 'Edge cases & mistakes',
  apply: 'Apply it',
};

/** One styled explanation at a given depth. A concept may have many per layer. */
export interface Explanation {
  id: ID;
  style: ExplanationStyle;
  layer: LayerKind;
  content: string; // may contain [[term]] markers for the vocabulary decoder
  source: 'curated' | 'ai' | 'imported' | 'learner-edited';
}

/** Vocabulary decoder entry (req 6): contextual, concept-specific. */
export interface Term {
  id: ID;
  word: string;
  /** contextual definition — why it matters *for this concept* */
  definition: string;
  /** simplest accurate phrasing */
  simple: string;
  /** tiny example */
  example: string;
  /** why it matters to the current concept */
  why: string;
  /** optional concept id if this term IS a full concept in the library */
  conceptId?: ID;
}

/** Example set (req 13): including the important *incorrect* example. */
export interface ExampleSet {
  simple?: string;
  realistic?: string;
  counter?: string; // counterexample
  edge?: string; // edge case
  incorrect?: string; // what does NOT qualify, and why
}

/** A required idea for teach-back / blurt / Feynman evaluation (deterministic). */
export interface KeyIdea {
  id: ID;
  label: string; // human label, shown in feedback
  /** synonym groups: idea is covered if ANY group fully matches? No — if any keyword in any group matches. */
  groups: string[][]; // e.g. [["one value", "single value"], ["determines", "uniquely determines"]]
  /** trap keywords that signal a known misconception */
  traps?: string[];
}

export type RelationshipType =
  | 'prerequisite'
  | 'related'
  | 'contrasts-with'
  | 'example-of'
  | 'part-of'
  | 'causes'
  | 'used-by'
  | 'depends-on';

export interface ConceptRelationship {
  id: ID;
  fromId: ID; // e.g. normalization
  toId: ID; // e.g. functional dependency
  type: RelationshipType;
  note?: string;
}

/** Common misconception definition attached to a concept. */
export interface MisconceptionDef {
  id: ID;
  label: string; // "Normalization always makes queries faster"
  wrongIdea: string;
  whyPlausible: string; // why it looks reasonable
  whereItBreaks: string; // where the reasoning breaks
  correction: string; // correct idea
  contrast: { wrong: string; correct: string };
  targetedExample: string;
  /** keyword patterns that detect this misconception in free text */
  detectPatterns: string[];
  /** question ids that test this correction */
  checkQuestionIds?: ID[];
}

export interface Concept {
  id: ID;
  subjectId: ID;
  topicId?: ID;
  name: string;
  shortName?: string;
  aliases: string[];
  /** L0 hook: one-sentence encounter */
  intro: string;
  /** Stage 2: the real problem it solves */
  whyItMatters: string;
  explanations: Explanation[];
  terms: Term[];
  examples: ExampleSet;
  keyIdeas: KeyIdea[];
  /** direct prerequisite concept ids (edges also exist in relationships) */
  prerequisites: ID[];
  misconceptionDefs: MisconceptionDef[];
  examWeight: number; // 0..1 importance in exams
  difficultyBase: number; // 0..1 objective complexity
  tags: string[];
  source: 'curated' | 'imported' | 'ingested' | 'ai' | 'learner';
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

/* ============================================================
 * Questions, cards & practice
 * ============================================================ */

export type CognitiveLevel =
  | 'recall'
  | 'understanding'
  | 'application'
  | 'analysis'
  | 'comparison'
  | 'problem-solving'
  | 'transfer'
  | 'explanation';

export const COGNITIVE_LEVELS: CognitiveLevel[] = [
  'recall',
  'understanding',
  'application',
  'analysis',
  'comparison',
  'problem-solving',
  'transfer',
  'explanation',
];

export type QuestionKind =
  | 'mc'
  | 'short'
  | 'free'
  | 'teach-back'
  | 'compare'
  | 'cloze'
  | 'blurt'
  | 'transfer'
  | 'apply-scenario';

export interface MCChoice {
  id: string;
  text: string;
  correct: boolean;
  /** misconception triggered if learner picks this */
  misconceptionId?: ID;
  /** concept this distractor represents (confusion-pair detection, req 11) */
  conceptId?: ID;
  feedback?: string;
}

export interface Question {
  id: ID;
  conceptId: ID;
  kind: QuestionKind;
  cognitiveLevel: CognitiveLevel;
  prompt: string;
  /** context/scenario preamble (transfer & application questions) */
  scenario?: string;
  choices?: MCChoice[];
  /** ideal answer for short/free/teach-back */
  answer?: string;
  /** keyword groups for deterministic evaluation: any keyword in a group matches that group */
  keywords?: string[][];
  /** partial-credit keywords (nice-to-have ideas) */
  partialKeywords?: string[];
  /** progressive hints (req 16): 1 = nudge … 5 = full solution */
  hints: string[];
  /** socratic guidance steps (req 20): guiding questions, not answers */
  socraticSteps?: string[];
  /** concepts required to answer (prereq check on failure → root cause) */
  requiresConcepts?: ID[];
  /** the misconception this question is designed to detect */
  targetsMisconception?: ID;
  /** for compare questions: the other concept */
  compareWith?: ID;
  /** marks that this question changes context vs the taught example (req 24) */
  isTransfer?: boolean;
  difficultyBase: number; // 0..1
  source: 'curated' | 'generated' | 'ai' | 'imported';
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface Card {
  id: ID;
  conceptId: ID;
  front: string;
  back: string;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

/* ============================================================
 * Learner state
 * ============================================================ */

/** Knowledge states (req 8) — evidence-based, can move backward. */
export type KnowledgeState =
  | 'unknown'
  | 'encountered'
  | 'emerging'
  | 'learning'
  | 'familiar'
  | 'developing'
  | 'proficient'
  | 'mastered';

export type StateFlag = 'none' | 'decaying' | 'confused';

export type EvidenceType =
  | 'recognition'
  | 'recall'
  | 'application'
  | 'explanation'
  | 'delayed-retrieval'
  | 'transfer';

/** Evidence strength (req 74): recognition weak … independent transfer very strong. */
export const EVIDENCE_STRENGTH: Record<EvidenceType, number> = {
  recognition: 0.35,
  recall: 0.6,
  application: 0.8,
  explanation: 0.85,
  'delayed-retrieval': 0.95,
  transfer: 1.0,
};

export interface Attempt {
  id: ID;
  conceptId: ID;
  questionId: ID | null;
  sessionId?: ID;
  ts: number;
  correct: boolean;
  /** 0..1 quality */
  score: number;
  confidence?: number; // 1..5, asked before reveal (req 27)
  responseMs: number;
  hintsUsed: number;
  cognitiveLevel: CognitiveLevel;
  evidenceType: EvidenceType;
  /** days since previous attempt on this concept — used to tag delayed retrieval */
  daysSincePrev: number;
  misconceptionIds: ID[]; // triggered by this attempt
  /** chosen answer text / index, for error-first feedback */
  givenAnswer?: string;
  /** true when elapsed since last review ≥ 1 day */
  wasDelayed: boolean;
  context: 'learn' | 'review' | 'exam' | 'blurt' | 'feynman' | 'socratic' | 'compare' | 'micro' | 'self-report';
}

/** FSRS-inspired scheduler state, extended with deeper evidence (req 28/29). */
export interface SchedulerState {
  stabilityDays: number; // memory stability S
  difficulty: number; // 0..1
  dueAt: number; // epoch ms
  lastIntervalDays: number;
  lapses: number;
  streak: number;
  reviews: number;
  lastReviewedAt: number | null;
  lastGrade: 'again' | 'hard' | 'good' | 'easy' | null;
}

export interface MasteryBreakdown {
  retrieval: number;
  application: number;
  explanation: number;
  stability: number;
  recency: number;
  consistency: number;
  prerequisiteHealth: number;
  misconceptionFree: number;
  weighted: number; // 0..100
}

export interface EvidenceCounts {
  recognition: number;
  recall: number;
  application: number;
  explanation: number;
  'delayed-retrieval': number;
  transfer: number;
}

export interface StyleStat {
  uses: number;
  successes: number;
}

export interface ConceptState {
  conceptId: ID;
  state: KnowledgeState;
  flag: StateFlag;
  firstSeenAt: number | null;
  lastSeenAt: number | null;
  lastReviewedAt: number | null;
  lastSuccessAt: number | null;
  attempts: number;
  successes: number;
  bestStabilityDays: number;
  evidence: EvidenceCounts; // successful demonstrations by type
  mastery: number; // 0..100
  breakdown: MasteryBreakdown;
  checkpointProgress: {
    retrievals: number;
    delayedRetrievals: number;
    applications: number;
    explanations: number;
  };
  scheduler: SchedulerState;
  activeMisconceptions: ID[];
  lastExplainScore: number | null;
  bestExplainScore: number | null;
  explanationStats: Partial<Record<ExplanationStyle, StyleStat>>;
  updatedAt: number;
  /** learner said "I know this" in prereq check (weak evidence marker) */
  selfClaimedFamiliar?: boolean;
}

/* ============================================================
 * Misconceptions, confusion, gaps, insights
 * ============================================================ */

export interface MisconceptionRecord {
  id: ID;
  defId: ID;
  conceptId: ID;
  triggerCount: number;
  firstAt: number;
  lastAt: number;
  lastAttemptId?: ID;
  status: 'active' | 'corrected';
  correctedAt?: number;
  /** attempts on targeted questions after correction */
  retestResults: boolean[];
  updatedAt: number;
}

export interface ConfusionPair {
  id: ID;
  aId: ID;
  bId: ID;
  /** times learner chose aId when answer was bId */
  abCount: number;
  baCount: number;
  firstAt: number;
  lastAt: number;
  status: 'active' | 'resolved';
  resolvedAt?: number;
  exerciseResults: boolean[];
  updatedAt: number;
}

export type GapCause =
  | 'prerequisite'
  | 'vocabulary'
  | 'misconception'
  | 'memory'
  | 'application'
  | 'interpretation'
  | 'careless';

export interface KnowledgeGap {
  id: ID;
  /** the concept the learner is struggling with */
  conceptId: ID;
  cause: GapCause;
  /** for prerequisite/vocabulary gaps: the actual missing concept */
  rootConceptId?: ID;
  detail: string;
  evidence: string[];
  firstAt: number;
  lastAt: number;
  occurrences: number;
  status: 'open' | 'closed';
  closedAt?: number;
  updatedAt: number;
}

export interface Insight {
  id: ID;
  ts: number;
  kind:
    | 'weakness'
    | 'confusion'
    | 'misconception'
    | 'decay'
    | 'calibration'
    | 'gap'
    | 'progress'
    | 'readiness'
    | 'streak';
  /** i18n key + params so reasons stay language-independent */
  key: string;
  params: Record<string, string | number>;
  conceptId?: ID;
  severity: 'info' | 'good' | 'warn';
}

/* ============================================================
 * Sessions, plans, exams
 * ============================================================ */

export type SegmentType =
  | 'warmup'
  | 'first-encounter'
  | 'review'
  | 'retrieval'
  | 'application'
  | 'comparison'
  | 'teach-back'
  | 'blurt'
  | 'reflection';

export interface SegmentPlan {
  type: SegmentType;
  conceptIds: ID[];
  estMinutes: number;
  reasonKey: string;
  reasonParams?: Record<string, string | number>;
}

export type SessionItemKind =
  | 'explanation' // show explanation card
  | 'question' // any question kind
  | 'compare' // contrastive exercise
  | 'teach-back'
  | 'blurt'
  | 'reflection'
  | 'fe-stage' // first-encounter stage
  | 'summary'; // session summary

export interface SessionItem {
  kind: SessionItemKind;
  conceptId: ID;
  /** for question items */
  questionId?: ID;
  /** for fe-stage items: the FE stage payload */
  feStage?: FEStage;
  /** for explanation items */
  explanationId?: ID;
  /** adaptive notes for the renderer */
  note?: string;
  reasonKey?: string;
}

export interface SessionOutcome {
  itemId: number;
  conceptId: ID;
  correct: boolean | null;
  score: number | null;
}

export interface StudySession {
  id: ID;
  startedAt: number;
  endedAt: number | null;
  plannedMinutes: number;
  plan: SegmentPlan[];
  items: SessionItem[];
  executed: SessionOutcome[];
  status: 'active' | 'completed' | 'abandoned';
  /** dynamic plan log: replans that happened and why */
  adaptations: { itemId: number; key: string; params?: Record<string, string | number> }[];
  reflection?: {
    clearer?: string;
    confusing?: string;
    revisit?: ID | '';
    ts: number;
  };
  focus: { type: 'due' | 'weak' | 'new' | 'gap' | 'exam' | 'mixed'; conceptId?: ID; examId?: ID };
  updatedAt: number;
}

export interface Exam {
  id: ID;
  title: string;
  subjectId: ID;
  date: number; // epoch ms
  targetMastery: number; // readiness target, default 85
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface ReadinessSnapshot {
  examId: ID;
  ts: number;
  score: number;
  coverage: number;
  accuracy: number;
  freshness: number;
  mastery: number;
  weakConcepts: ID[];
  gaps: number;
  attemptCount: number;
  /** true when not enough evidence to claim a score */
  insufficientEvidence: boolean;
  reasons: { key: string; params?: Record<string, string | number> }[];
}

export interface PlanDay {
  date: string; // YYYY-MM-DD
  minutes: number;
  items: { conceptId: ID; kind: 'learn' | 'review' | 'reinforce' | 'apply' | 'compare'; reasonKey: string }[];
  completedMinutes: number;
}

export interface StudyPlan {
  id: ID;
  examId?: ID;
  subjectId: ID;
  dailyMinutes: number;
  startDate: number;
  endDate: number;
  days: PlanDay[];
  status: 'active' | 'done' | 'outdated';
  behind: boolean;
  adjustments: { ts: number; key: string; params?: Record<string, string | number> }[];
  createdAt: number;
  updatedAt: number;
}

/* ============================================================
 * Learner profile & motivation
 * ============================================================ */

export interface CalibrationSample {
  ts: number;
  conceptId: ID;
  confidence: number; // 1..5
  correct: boolean;
  score: number;
}

export type CalibrationVerdict = 'overconfident' | 'underconfident' | 'accurate' | 'unknown';

export interface LearnerModel {
  id: ID;
  name: string;
  createdAt: number;
  xp: number;
  level: number;
  streakDays: number;
  lastStudyDay: string | null; // YYYY-MM-DD
  studyDays: string[];
  /** global explanation-style preferences (req 54) */
  styleStats: Partial<Record<ExplanationStyle, StyleStat>>;
  calibrationSamples: CalibrationSample[]; // capped ring buffer (last 100)
  /** concepts the learner explicitly wants to learn (goals) */
  goals: ID[];
  settings: Settings;
  updatedAt: number;
}

export interface MasteryCheckpoints {
  retrievals: number;
  delayedRetrievals: number;
  applications: number;
  explanations: number;
  minExplainScore: number;
  minStabilityDays: number;
  minMastery: number;
  minPrerequisiteHealth: number;
}

export interface Settings {
  theme: 'light' | 'dark' | 'system';
  reduceMotion: boolean;
  dailyMinutesGoal: number;
  defaultSessionMinutes: number;
  notificationsEnabled: boolean;
  speechEnabled: boolean;
  speechRate: number;
  askConfidence: boolean;
  checkpoints: MasteryCheckpoints;
  ai: {
    enabled: boolean;
    provider: 'none' | 'openai-compatible';
    baseUrl: string;
    model: string;
    apiKey: string;
  };
  locale: string;
  syncEnabled: boolean;
  deviceId: string;
}

/* ============================================================
 * First-Encounter Engine (req 1, 2)
 * ============================================================ */

export type FEStage =
  | 'prereq-check'
  | 'encounter'
  | 'why'
  | 'analogy'
  | 'plain'
  | 'vocabulary'
  | 'example'
  | 'build'
  | 'guided-check'
  | 'confirm'
  | 'apply'
  | 'retrieval'
  | 'teach-back'
  | 'scheduled'
  | 'done';

export const FE_STAGES: FEStage[] = [
  'prereq-check',
  'encounter',
  'why',
  'analogy',
  'plain',
  'vocabulary',
  'example',
  'build',
  'guided-check',
  'confirm',
  'apply',
  'retrieval',
  'teach-back',
  'scheduled',
  'done',
];

export interface FEState {
  conceptId: ID;
  stage: FEStage;
  startedAt: number;
  /** explanation styles tried for current explanation stage */
  stylesTried: ExplanationStyle[];
  failedChecks: number;
  simplified: boolean;
  /** prerequisite concepts found missing (deepest-last teaching order computed on demand) */
  prereqGaps: ID[];
  /** stack of nested prerequisite first-encounters */
  prereqStack: { conceptId: ID; stage: FEStage }[];
  /** current vocabulary term index */
  vocabIndex: number;
  /** whether vocabulary was shown */
  vocabShown: ID[];
  attempts: ID[];
  completedAt?: number;
}

/* ============================================================
 * Misc
 * ============================================================ */

export interface Note {
  id: ID;
  conceptId?: ID;
  text: string;
  ts: number;
}

export interface Resource {
  id: ID;
  conceptId?: ID;
  subjectId?: ID;
  title: string;
  content: string;
  kind: 'text' | 'link' | 'file';
  createdAt: number;
}

export type DomainEvent = {
  seq?: number;
  ts: number;
  type: string;
  payload: Record<string, unknown>;
};

export interface Reason {
  key: string;
  params?: Record<string, string | number>;
}

/** XP award shape used across pipeline & motivation (i18n-explainable). */
export interface XPAwardLike {
  amount: number;
  key: string;
  params?: Record<string, string | number>;
}
