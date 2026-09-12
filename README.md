# AVENIQ — From unknown to understood to remembered.

An offline-first adaptive learning system. Not a flashcard app, not a chatbot: a complete
learning engine where every feature — questions, explanations, scheduling, gaps, exams,
plans — is wired into one evidence-based learner model.

```
ANSWER → ATTEMPT → CONFIDENCE → RESPONSE TIME → ERROR ANALYSIS → MASTERY →
SCHEDULING → GAPS → INSIGHTS → RECOMMENDATIONS → READINESS → PROGRESS → MOTIVATION
```

Nothing in the system is decorative: every claim about your knowledge traces back to
recorded attempts.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 101 tests: domain, services, E2E learning cycle, UI smoke
npx tsc --noEmit   # typecheck
```

Everything runs locally (IndexedDB). No account, no server, no tracking.
Seeded with three subjects (Databases, Biology, Programming) so a brand-new user can
learn a concept **from zero** immediately.

## What's inside

| Area | Where |
|---|---|
| Domain model & types | `src/domain/types.ts` |
| Answer→mastery→schedule pipeline | `src/domain/pipeline.ts` |
| First-Encounter Engine (13 stages, prereq-gap chains, style cycling, simplification) | `src/domain/feEngine.ts`, `src/services/feService.ts` |
| Adaptive explanations (7 styles, 8 depth layers L0–L7) | `src/domain/explanation.ts` |
| Vocabulary decoder (`[[term]]` markers) | `src/ui/components.tsx` (`VocabText`) |
| Mastery engine (multi-factor, evidence gates, delayed verification, configurable checkpoints) | `src/domain/mastery.ts` |
| Misconceptions (error-first 5-step correction, activation at 2 triggers, retest correction) | `src/domain/misconception.ts` |
| Confusion network + contrastive exercises | `src/domain/confusion.ts` |
| Active recall (free recall, blurt, teach-back evaluation, scaffolding ladder, Socratic steps) | `src/domain/teachback.ts`, `src/domain/scaffold.ts` |
| Spaced repetition beyond SM-2 (stability, retrievability, dampening, lapse handling) | `src/domain/scheduler.ts` |
| Question selection (needs-driven, cognitive levels, variants, interleaving, transfer) | `src/domain/questionSelect.ts` |
| Recommendations ("what should I study right now" + why), readiness, planner | `src/domain/recommend.ts`, `src/domain/readiness.ts`, `src/domain/planner.ts` |
| Sessions (time-aware 5/10/25/60, segments, adaptation, fatigue) | `src/domain/sessionEngine.ts`, `src/services/sessionService.ts` |
| Gaps & root causes (8 causes), insights, progress, motivation | `src/domain/gapAnalysis.ts`, `src/domain/insights.ts`, `src/domain/progress.ts`, `src/domain/motivation.ts` |
| Import (CSV/JSON/term-definition) + material ingestion pipeline | `src/domain/importParsers.ts`, `src/domain/ingestion.ts` |
| Offline-first DB (versioned schema, migrations, backups, sync packs, health check) | `src/db/db.ts`, `src/domain/backup.ts` |
| AI layer (validated, marked, editable, deterministic fallbacks) | `src/services/aiService.ts`, `src/domain/aiSchemas.ts` |
| UI (hash router, ⌘K search, dark/light, a11y) | `src/ui/` |
| Seed content | `src/seed/` |

## Tests

- `tests/domain/*` — pure domain logic (content, engines, freeText, graph/questions, planning)
- `tests/services.test.ts` — service layer + DB migrations + backup round-trip
- `tests/e2eFlow.test.ts` — the full required learning cycle, end to end, no DB fudging:
  unknown concept → prerequisite gap → vocabulary → analogy → example → check fails →
  simplified → passes → formal layer → basic question → application → explain-back →
  misconception detected → corrected → scheduled → +2 days retrieval succeeds (stability up)
  → +4 days application succeeds (mastery strengthens)
- `tests/ui/smoke.test.ts` — boots the real app in jsdom and walks every route

## Design principles

1. **Never make the learner feel stupid.** "I don't understand" always leads somewhere better.
2. **Teach, don't just test.** Every failure produces a diagnosis and a simpler path.
3. **No fake intelligence.** Mastery needs evidence: delayed retrieval, application, explanation —
   recognition alone is never enough.
4. **The engine works without AI.** AI is optional, validated, disclosed, and editable.
5. **The history belongs to the learner.** Local-first, exportable, deletable.
