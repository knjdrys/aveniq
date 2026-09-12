# AVENIQ vs StudyBuddy — an honest code-level comparison

*Both repos analyzed in full: `knjdrys/aveniq` (this repo) and `knjdrys/study-buddy`
(cloned at the latest commit, `999b68e`, “Rebuild StudyBuddy: smart question engine,
ink & indigo design, full product”). Both were verified to typecheck, pass their test
suites, and serve a working dev build.*

| | **AVENIQ** | **StudyBuddy** |
|---|---|---|
| Source size | ~12,400 LOC TS/TSX (React) | ~10,800 LOC TS (custom render core, zero runtime deps) |
| Tests | 101 tests / 8 files — domain, services, DB migrations, **full E2E learning cycle**, UI smoke | 121 tests / 1 file — the question engine only |
| Storage | Dexie/IndexedDB: **18 relational tables**, indexes, 2 schema versions with a real migration path, per-operation transactions, health check | IndexedDB as **one versioned JSON document** (single key replace), migration chain, localStorage/memory fallback |
| Design system | React components, Newsreader + Inter, dark/light | Custom `h()` hyperscaler, Fraunces + Inter, PWA |

---

## 1. What they share (deliberately)

Both products reject the same failure modes, and both were rebuilt around the same
convictions. This is worth stating because it shapes everything else:

- **Concept-centered, not deck-centered.** Both make the Concept the fundamental unit,
  with flashcards/questions/notes hanging off it. StudyBuddy's `docs/PRODUCT.md` calls
  this out explicitly; AVENIQ's schema (`concepts`, `questions`, `cards`, `conceptStates`) does it structurally.
- **No fake intelligence.** Both track attempts with evidence, both refuse fake mastery
  (StudyBuddy: Leitner-box-era version was called out as “fake mastery” in its own docs and
  killed; AVENIQ: `MIN_ATTEMPTS_FOR_EVIDENCE` gates readiness, mastery refuses to rise on recognition alone).
- **AI optional and honest.** StudyBuddy: deterministic Socratic tutor by default, LLM
  upgrades only with a user key, AI content flagged “unverified”. AVENIQ: deterministic
  engines plus a validated AI layer (schema validation, XSS/leak checks, disclosure,
  editable outputs). Nearly identical philosophy, implemented independently.
- **Time-aware sessions with a reason.** Both compose sessions from learner state and
  explain why (“why each part is there” — StudyBuddy `session.ts` returns a `reason`
  string; AVENIQ's recommendations carry i18n'd reason keys rendered in the Today view).
- **Offline-first, exportable data, no accounts.**

## 2. Where StudyBuddy is genuinely stronger

**Question generation — its crown jewel.** `src/engine/questionbrain.ts` (912 lines) is
the most impressive single file in either repo. Before generating a question it builds a
semantic profile of each concept (`understand()`): category (“a unique hardware address”),
function (“identify a device across networks”), facts, keywords. Then:

- MC distractors are **other concepts' definitions rendered as parallel statements** —
  never a bare list of term names. If meaningful distractors can't be built, the engine
  *refuses to generate that question* and switches mode. This is a stronger anti-recognition
  guarantee than AVENIQ's seeded distractors, which are curated per-question but not
  synthesized from sibling content at runtime.
- 7 modes (mc, identify, tf, cloze-from-real-sentences, matching, short, scenario) vs
  AVENIQ's 9 kinds (mc, short, free, teach-back, compare, cloze, blurt, transfer,
  apply-scenario) — comparable breadth, but StudyBuddy **generates** all of them from
  raw content, where AVENIQ generates most practice from curated seeds + variants.
- Its 121 tests cover exactly this engine — the testing effort went where the
  differentiation is.

**What AVENIQ should borrow:** definition-shaped distractor synthesis from sibling
concepts, and the “refuse the question” rule. AVENIQ's `variantOf()` produces numeric
variants; a `distractorDefinitions()` pass over same-topic concepts would make
imported (non-curated) content far less gameable.

**Documentation-as-process.** StudyBuddy's `docs/PRODUCT.md` + `DATA_MODEL.md` are
product archaeology: what the old version did wrong, what to keep, the learning loop,
phase-by-phase decisions. AVENIQ's README maps architecture but doesn't argue *why*.
For a repo others might maintain, StudyBuddy's docs are the better artifact.

**Zero-dependency UI + PWA.** A custom hyperscaler (`src/lib/h.ts`), self-hosted fonts,
vite-plugin-pwa precache, installable offline shell. AVENIQ ships React + Dexie + a
Google Fonts link (network-dependent first paint for typography). StudyBuddy is strictly
more “offline-first” in practice.

**Sync protocol.** StudyBuddy has an actual implemented optional-sync client (`app/sync.ts`:
pull/push, retry/backoff, append-only attempts, tombstones, tested merge). AVENIQ has the
merge/tombstone/sync-pack *math* in `domain/backup.ts` (tested), but no client wired to
an endpoint — it's backup-file-based today.

**Onboarding.** StudyBuddy has a real first-run onboarding view; AVENIQ drops you into
Today with seeded content (fast to value, but says less about itself).

## 3. Where AVENIQ is clearly stronger

**The prerequisite graph — StudyBuddy has none.** This is the deepest structural
difference. `grep -prerequisite src/` in StudyBuddy returns nothing: a Concept has
`relatedIds: string[]` (flat, untyped) and a single free-text `misconception?: string`.
AVENIQ has a directed graph with **8 relationship types** (prerequisite, related,
contrasts-with, example-of, part-of, causes, used-by, depends-on), prerequisite-health
computed into mastery, frontier unlocking (`graph.ts`), a visual learning map, and —
critically — **root-cause gap analysis** (req 41): a failure is diagnosed as one of 8
causes (missing prerequisite, vocabulary, misconception, calculation, careless, memory,
application, interpretation), and the fix targets the cause. StudyBuddy's insights are
pattern-spotting over attempts (missed 3+, 2-of-last-4); AVENIQ's are causal.

**The zero-knowledge path.** StudyBuddy's session planner has a “learn new concepts”
segment, but there is no structured first-encounter. AVENIQ's 13-stage First-Encounter
Engine (prereq-check → encounter → why → analogy → plain → vocabulary → example → build →
guided check → confirm → apply → teach-back → scheduled) with nested prerequisite
teaching (“teach me these first” walks the gap chain), style cycling on “I don't
understand,” escalation to the weakest prerequisite when styles exhaust, and
fail → simplify → retry, is a whole subsystem StudyBuddy doesn't attempt. For the
“learner with zero prior knowledge” requirement, this is the difference between a
product that *accommodates* beginners and one built *around* them.

**Misconception engineering.** StudyBuddy stores one misconception string per concept
and shows it. AVENIQ has a misconception engine: per-concept definitions with wrongIdea /
whyPlausible / whereItBreaks / correction / detectPatterns; free-text detection (teach-back
and wrong answers are scanned); activation at 2 triggers (not one fluke); targeted retest
questions; correction after verified passes; error-first 5-step feedback (what you answered
→ why it looked right → where it breaks → correct idea → how to recognize it). Same story
for confusion: StudyBuddy tracks `distractorConceptId` mix-ups (good!); AVENIQ adds
bidirectional confusion pairs with activation thresholds and dedicated contrastive
exercises.

**Depth of the learner model.**

| Axis | StudyBuddy | AVENIQ |
|---|---|---|
| Knowledge states | 7 stages, `needsReview` flag | 9 evidence-based states + decaying/confused flags, can regress |
| Mastery factors | accuracy EMA, recent accuracy, lapses, recency, evidence depth, difficulty, response time | **13-factor** breakdown incl. stability, consistency, prerequisite health, misconception-free; configurable checkpoint gates; delayed mastery verification |
| “Mastered” requires | score ≥ 0.85, ≥5 attempts, ≥1 applied | N retrievals **and** delayed retrievals (≥2 days later) **and** applications **and** explanations above a quality bar, minimum stability in days, prerequisite health — all configurable in Settings |
| Scheduling | SM-2 family (ease 1.3–2.8, lapses, confidence grades) — solid, classic | SM-2's ease model replaced by a **stability + retrievability** model (forgetting-curve based), intra-session growth dampening, lapse handling, decay detection, within-session spacing — verified by the E2E test's +2d/+4d delayed retrieval assertions |

**Explain-back evaluation.** StudyBuddy's blurt/Feynman analysis is keyword/key-term
coverage (its own comments call it “honest heuristics… approximate”). AVENIQ's
`teachback.ts` evaluates per-idea coverage with synonym groups, partial credit,
**misconception trap detection inside the learner's own words**, example bonus, jargon
flagging, and a strong/partial/weak verdict. Both are deterministic; AVENIQ's is finer-grained.

**Testing posture.** StudyBuddy tests its question engine thoroughly (121 tests) but
nothing else — no tests for scheduling, mastery, session planning, merge, or the UI.
AVENIQ's 101 tests cover the domain engines, the service layer, DB v1→v2 migration with
data survival, backup round-trip, atomic pipeline writes, and the **entire required
learning cycle end-to-end** (unknown → prereq gap → … → misconception corrected → +2 day
delayed retrieval raises stability → +4 day application raises mastery) with zero DB
manipulation. That test is the machine that guarantees the features are actually
interconnected rather than adjacent.

**Exam readiness honesty.** Both produce explainable readiness. AVENIQ additionally
refuses to show a number at all until there's enough evidence (`insufficientEvidence`
with the attempt count shown) — StudyBuddy always computes a number (from real data, to
its credit, but without the evidence floor).

**Content pipeline.** StudyBuddy imports pairs (Quizlet/Anki/CSV/text — nice breadth).
AVENIQ's ingestion additionally extracts a *structured curriculum* from raw material:
sections, concepts, inferred prerequisite edges, vocabulary terms, misconception notes
from “common mistake” phrasing, generated questions, and a proposed study order — all
behind a mandatory review step before commit.

## 4. Interesting philosophical differences

**One document vs a relational schema.** StudyBuddy persists the whole DB as one JSON
blob under one IndexedDB key — writes are atomic by construction, migrations are a
version chain over the document, and querying is in-memory. AVENIQ uses Dexie with 18
indexed tables, compound indexes (`[conceptId+ts]`), per-attempt transactions, a health
check for dangling references, and scale requirements (“thousands of concepts”) that
favor indexed queries. StudyBuddy's approach is simpler and perfectly fine at personal
scale; AVENIQ's costs complexity (the v1→v2 migration machinery) to buy queryability
and per-entity sync semantics.

**Curated vs synthesized.** StudyBuddy trusts its generator to build good questions from
whatever content exists. AVENIQ trusts curated content (seeded subjects with hand-written
explanations, layered depth, traps, analogies) plus a generator for variants and imports.
For a learner pasting raw notes, StudyBuddy's engine will produce better questions
immediately; for a learner on well-authored content, AVENIQ's pedagogy runs deeper
(layers, analogies, teach-back with traps).

**Appetite.** StudyBuddy is a tighter, more disciplined product: 5 primary nav entries,
progressive disclosure, PWA, onboarding. AVENIQ is a heavier machine: 10 views, a
13-stage flow, an 8-cause diagnosis system. StudyBuddy optimizes “clean product that
answers one question well”; AVENIQ optimizes “every feature feeds the learner model.”

## 5. Verdict

They're siblings in philosophy but different species in scope:

- **StudyBuddy** is the more *focused, more shippable* product — better onboarding,
  PWA install, real sync client, and the single best subsystem of either codebase (the
  question brain, with the tests to prove it).
- **AVENIQ** is the more *complete learning engine* — the prerequisite graph,
  first-encounter flow, misconception/confusion machinery, 13-factor mastery with
  delayed verification, stability-based scheduling, causal gap analysis, and an E2E
  test that walks the entire learning cycle through the real pipeline. StudyBuddy
  learns *about* your performance; AVENIQ models *why* you're failing and fixes the root.

If they merged, the ideal product is StudyBuddy's question brain, onboarding, PWA and
sync layered onto AVENIQ's knowledge graph, learner model, and first-encounter engine —
each is exactly what the other lacks.
