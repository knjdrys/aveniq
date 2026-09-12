/**
 * Add material view (req 50, 51, 52): paste raw material or import
 * term-definition text / CSV / JSON questions — review the extracted
 * draft (concepts, prerequisites, misconceptions, questions) before
 * anything enters the library.
 */
import React, { useState } from 'react';
import { useServices, navigate } from '../../appContext';
import { Icon, useToast } from '../components';
import { DraftConcept } from '../../domain/importParsers';
import { IngestionDraft } from '../../domain/ingestion';
import { t } from '../../domain/i18n';

type Step = 'input' | 'review' | 'done';

export function IngestView() {
  const services = useServices();
  const toast = useToast();
  const [step, setStep] = useState<Step>('input');
  const [mode, setMode] = useState<'material' | 'import'>('material');
  const [text, setText] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [draft, setDraft] = useState<IngestionDraft | null>(null);
  const [importDrafts, setImportDrafts] = useState<DraftConcept[] | null>(null);
  const [importWarning, setImportWarning] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [committed, setCommitted] = useState<{ concepts: { id: string; name: string }[] } | null>(null);

  const analyze = () => {
    if (!text.trim()) {
      toast('Paste some material first.', 'error');
      return;
    }
    if (mode === 'material') {
      const result = services.content.ingest(text);
      if (!result.concepts.length) {
        toast('Couldn’t find any concepts in this text — try adding headings or term definitions.', 'error');
        return;
      }
      setDraft(result);
      setRemoved(new Set());
      setStep('review');
    } else {
      void services.content.parseImport(text, 'auto').then((res) => {
        if (res.format === 'term-def') {
          setImportDrafts(res.drafts);
          setImportWarning(res.warning ?? null);
          setRemoved(new Set());
          setStep('review');
        } else if (res.format === 'questions') {
          toast(res.error ?? 'This looks like a question set — question import lands as drafts too. Use material mode for now.', 'error');
        } else {
          toast('Format not recognized. Supported: term–definition lines, CSV, JSON.', 'error');
        }
      });
    }
  };

  const concepts = draft
    ? draft.concepts.filter((c) => !removed.has(c.tempId))
    : importDrafts
      ? importDrafts.filter((c) => !removed.has(c.tempId))
      : [];
  const title = draft?.title ?? 'Imported terms';

  const commit = async () => {
    if (!concepts.length) {
      toast('Keep at least one concept.', 'error');
      return;
    }
    try {
      let result;
      const opts = {
        subjectId: subjectId || (newSubject ? '' : ''),
        subjectName: newSubject || undefined,
        topicId: undefined,
      };
      if (draft) {
        const filtered: IngestionDraft = {
          ...draft,
          concepts: draft.concepts.filter((c) => !removed.has(c.tempId)),
        };
        result = await services.content.commitIngestion(filtered, opts);
      } else if (importDrafts) {
        result = await services.content.commitDrafts(importDrafts.filter((c) => !removed.has(c.tempId)), opts);
      } else return;
      setCommitted({ concepts: result.concepts.map((c) => ({ id: c.id, name: c.name })) });
      setStep('done');
      toast(`${result.concepts.length} concepts added with ${result.questions.length} practice questions.`, 'info');
    } catch (e) {
      toast(`Commit failed: ${String(e)}`, 'error');
    }
  };

  const sample = `# Functional Dependency
A functional dependency A -> B means: once you know A, B is determined. In a table of students, student_id determines student_name.

## Why it matters
Without functional dependencies, the same fact gets stored many times — that's how update anomalies are born.

# Database Normalization
Normalization restructures tables so every fact is stored exactly once. Don't confuse it with indexing: normalization prevents data anomalies, while indexes speed up lookups.`;

  return (
    <div className="content" style={{ maxWidth: 760 }}>
      <div className="view-title">
        <div>
          <h1>Add material</h1>
          <div className="sub">Paste anything — lecture notes, a textbook chapter, term lists. You review the extracted structure before it’s saved.</div>
        </div>
      </div>

      {step === 'input' && (
        <>
          <div className="card">
            <div className="row mb">
              <button className={`time-chip ${mode === 'material' ? 'active' : ''}`} onClick={() => setMode('material')}>Raw material</button>
              <button className={`time-chip ${mode === 'import' ? 'active' : ''}`} onClick={() => setMode('import')}>Term / CSV / JSON import</button>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              style={{ minHeight: 220 }}
              placeholder={
                mode === 'material'
                  ? 'Paste your study material here. Headings (#, ALL CAPS lines) become sections…'
                  : 'One term per line: “Term – definition”. Also supports CSV and JSON question sets.'
              }
              aria-label="Material to ingest"
            />
            {mode === 'material' && (
              <div className="tiny muted mt">
                The pipeline extracts concepts, prerequisite links, vocabulary terms, misconceptions (from “common mistake” notes),
                generates practice questions, and proposes a study order — all reviewable.
              </div>
            )}
            <div className="row mt">
              <button className="btn primary" onClick={analyze}>Analyze material</button>
              {mode === 'material' && (
                <button className="btn subtle" onClick={() => setText(sample)}>Load example</button>
              )}
            </div>
          </div>
        </>
      )}

      {step === 'review' && (
        <>
          <div className="card mb">
            <div className="row between">
              <h2>Review: {title}</h2>
              <span className="chip primary">{concepts.length} concepts</span>
            </div>
            {draft && (
              <div className="small muted mt">
                {draft.sections.length} sections · {draft.relationships.filter((r) => r.type === 'prerequisite').length} prerequisite links ·{' '}
                {draft.misconceptionNotes.length} misconception notes · {draft.questionsGenerated} questions generated
                {draft.warnings.length > 0 && ` · ${draft.warnings.length} warnings`}
              </div>
            )}
            {importWarning && <div className="insight warn mt">{t(importWarning)}</div>}
          </div>

          <div className="card mb">
            <h3 className="mb">Destination</h3>
            <div className="grid-2">
              <div className="field">
                <label>Existing subject</label>
                <select value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setNewSubject(''); }}>
                  <option value="">— new subject —</option>
                  <SubjectOptions />
                </select>
              </div>
              <div className="field">
                <label>Or new subject name</label>
                <input type="text" value={newSubject} onChange={(e) => { setNewSubject(e.target.value); setSubjectId(''); }} placeholder="e.g. Organic Chemistry" />
              </div>
            </div>
          </div>

          {concepts.map((c, i) => (
            <div key={c.tempId} className="card" style={{ padding: 14 }}>
              <div className="row between mb">
                <strong>{i + 1}. {c.name}</strong>
                <button className="btn subtle sm" onClick={() => setRemoved(new Set([...removed, c.tempId]))} aria-label={`Remove ${c.name}`}>
                  <Icon name="x" size={14} /> Exclude
                </button>
              </div>
              <div className="small">{c.definition}</div>
              {c.detectedTerms.length > 0 && (
                <div className="row mt" style={{ gap: 4 }}>
                  {c.detectedTerms.slice(0, 6).map((term: string) => <span key={term} className="chip tiny">{term}</span>)}
                </div>
              )}
              {c.questions.length > 0 && (
                <div className="tiny muted mt">{c.questions.length} practice question{c.questions.length > 1 ? 's' : ''} will be generated</div>
              )}
            </div>
          ))}

          <div className="card mb">
            <h3 className="mb">Proposed study order</h3>
            <div className="small muted">
              {draft
                ? draft.studySequence.filter((n) => concepts.some((c) => c.name === n)).join(' → ')
                : concepts.map((c) => c.name).join(' → ')}
            </div>
            {draft && draft.relationships.length > 0 && (
              <div className="tiny muted mt">
                Links: {draft.relationships.filter((r) => concepts.some((c) => c.name === r.from) && concepts.some((c) => c.name === r.to)).map((r) => `${r.from} —${r.type}→ ${r.to}`).join(' · ')}
              </div>
            )}
          </div>

          {draft && draft.misconceptionNotes.length > 0 && (
            <div className="card mb">
              <h3 className="mb">Misconceptions detected</h3>
              {draft.misconceptionNotes.map((n, i) => (
                <div key={i} className="insight warn"><strong>{n.conceptName}:</strong> {n.note}</div>
              ))}
            </div>
          )}

          <div className="row">
            <button className="btn primary" onClick={commit}>Commit {concepts.length} concepts to library</button>
            <button className="btn subtle" onClick={() => setStep('input')}>Back</button>
          </div>
        </>
      )}

      {step === 'done' && committed && (
        <div className="card card-pad-lg center">
          <div style={{ fontSize: 36 }}>📚</div>
          <h2 className="mb">{committed.concepts.length} concepts added</h2>
          <p className="small muted mb">Everything is wired in: prerequisites, practice questions, and the scheduler. Start learning one now:</p>
          <div className="stack" style={{ alignItems: 'center' }}>
            {committed.concepts.slice(0, 6).map((c) => (
              <a key={c.id} className="btn sm" href={`#/concept/${c.id}`}>{c.name} →</a>
            ))}
          </div>
          <div className="row mt">
            <button className="btn subtle" onClick={() => { setStep('input'); setText(''); setDraft(null); setImportDrafts(null); }}>Add more material</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SubjectOptions() {
  const services = useServices();
  const [list, setList] = useState<{ id: string; name: string }[]>([]);
  React.useEffect(() => {
    void services.content.subjects().then((s) => setList(s.map((x) => ({ id: x.id, name: x.name }))));
  }, [services]);
  return (
    <>
      {list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </>
  );
}
