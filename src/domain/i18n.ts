/**
 * Localization foundation (req 78).
 * The learning engines emit { key, params } reasons — language-independent.
 * The UI renders them through t(). Adding a locale = adding a dictionary.
 */
type Dict = Record<string, string>;

const en: Dict = {
  // Product
  'app.name': 'AVENIQ',
  'app.tagline': 'From unknown to understood.',
  // Recommendations
  'rec.due': '“{concept}” is due — last reviewed {days}d ago (memory stability {stability}d)',
  'rec.due.new': '“{concept}” has never been reviewed since you learned it',
  'rec.misconception': 'You’ve hit the same misconception {count}× on “{concept}” — let’s fix it properly',
  'rec.confusion': '“{a}” and “{b}” get mixed up — a quick comparison will separate them',
  'rec.gap': '“{concept}” is blocked by a gap in “{root}” — foundations first',
  'rec.new': 'Next up: “{concept}” — its foundations are ready',
  'rec.weak': '“{concept}” is shaky (mastery {mastery}%) — retrieval practice will steady it',
  'rec.stale': '“{concept}” was strong but memory is fading (recall odds ≈{recall}%)',
  'rec.examUrgent': 'Exam “{exam}” is in {days} days — “{concept}” still needs work',
  'rec.vocab': 'One term to decode: “{term}” — 2 minutes',
  // Session reasons
  'seg.warmup': 'Warm up with what’s due',
  'seg.first': 'Learn something new',
  'seg.review': 'Strengthen shaky concepts',
  'seg.retrieval': 'Retrieve without help — that’s what builds memory',
  'seg.application': 'Apply ideas in new situations',
  'seg.comparison': 'Sharpen the lines between similar concepts',
  'seg.teachBack': 'Explain it — the strongest test of understanding',
  'seg.blurt': 'Memory dump — find the gaps',
  'seg.reflection': 'Quick reflection',
  // Insights
  'ins.misconception': 'Misconception detected on “{concept}”: {label}',
  'ins.misconceptionFixed': 'Misconception corrected on “{concept}” — {label}',
  'ins.confusion': 'You appear to confuse “{a}” with “{b}” ({count} mix-ups recorded)',
  'ins.decay': '“{concept}” was strong but recall odds dropped to {recall}% — scheduled reinforcement',
  'ins.weak': '“{concept}” is weak: {evidence}',
  'ins.overconfident': 'You tend to be overconfident (confidence {conf}% vs accuracy {acc}%) — trusting recall less helps',
  'ins.underconfident': 'You tend to be underconfident (confidence {conf}% vs accuracy {acc}%) — you know more than you think',
  'ins.calibrated': 'Your confidence matches your performance well',
  'ins.gap': 'Struggling with “{concept}” looks caused by “{root}”',
  'ins.mastered': '“{concept}” mastered — it survived delayed retrieval. That’s durable.',
  'ins.streak': '{days}-day learning streak — understanding compounds',
  'ins.delayedSuccess': '“{concept}” recalled after {days} days — memory stability increased',
  // Readiness
  'rdy.insufficient': 'Not enough evidence yet — keep practicing and readiness will become meaningful',
  'rdy.coverage': '{n} of {total} concepts at least in learning',
  'rdy.accuracy': 'Overall accuracy {value}% on {n} attempts',
  'rdy.freshness': 'Average recall odds {value}%',
  'rdy.mastery': '{n} concepts mastered of {total}',
  'rdy.weak': '{n} weak concepts pulling the score down',
  'rdy.gaps': '{n} open knowledge gaps',
  // Mastery / states
  'state.unknown': 'Not encountered',
  'state.encountered': 'Encountered',
  'state.emerging': 'Emerging',
  'state.learning': 'Learning',
  'state.familiar': 'Familiar',
  'state.developing': 'Developing',
  'state.proficient': 'Proficient',
  'state.mastered': 'Mastered',
  'flag.decaying': 'Decaying',
  'flag.confused': 'Confused',
  // Pipeline / feedback
  'fb.whatYouAnswered': 'What you answered',
  'fb.whyPlausible': 'Why it looked plausible',
  'fb.whereBroke': 'Where the reasoning broke',
  'fb.correctIdea': 'The correct idea',
  'fb.recognize': 'How to recognize it next time',
  // Errors
  'err.db': 'A local database error occurred. Your progress is safe — we retried.',
  'err.ai': 'The AI provider failed. Switched to the built-in engine.',
  'err.import': 'Import failed validation: {detail}',
};

const dicts: Record<string, Dict> = { en };

export function addLocale(code: string, dict: Dict) {
  dicts[code] = { ...dicts.en, ...dict };
}

export function t(key: string, params?: Record<string, string | number>, locale = 'en'): string {
  const d = dicts[locale] ?? dicts.en;
  let s = d[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
