/**
 * Settings (req 63): profile, goals, session defaults, theme, notifications,
 * speech, AI provider (with disclosure), data export/import/reset, privacy.
 */
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useServices, applyTheme } from '../../appContext';
import { Icon, Toggle, useToast } from '../components';
import { BACKUP_FORMAT, BACKUP_VERSION, validateBackup, migrateBackup } from '../../domain/backup';
import { LearnerModel, MasteryCheckpoints } from '../../domain/types';

export function SettingsView() {
  const services = useServices();
  const toast = useToast();
  const learner = useLiveQuery(() => services.learning.getLearner(), []);
  const concepts = useLiveQuery(() => services.db.concepts.toArray(), [], []);
  const health = useLiveQuery(() => services.db.healthCheck(), [], null);

  const [name, setName] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  if (!learner) return null;
  const S = learner.settings;
  const effectiveName = name ?? learner.name;

  const save = async (patch: Partial<LearnerModel>) => {
    const fresh = { ...learner, ...patch, updatedAt: Date.now() };
    await services.db.learner.put(fresh);
  };
  const setSettings = (patch: Partial<typeof S>) => save({ settings: { ...S, ...patch } });
  const setCheckpoints = (patch: Partial<MasteryCheckpoints>) =>
    setSettings({ checkpoints: { ...S.checkpoints, ...patch } });

  const exportBackup = async () => {
    const data = await services.db.exportAll();
    const backup = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: Date.now(), appVersion: '1.0.0', data };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aveniq-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup downloaded.', 'info');
  };

  const importBackupFile = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      const res = validateBackup(json);
      if (!res.ok || !res.backup) {
        toast(`Invalid backup: ${res.error}`, 'error');
        return;
      }
      const migrated = migrateBackup(res.backup);
      await services.db.importAll(migrated.data, 'merge');
      toast('Backup imported (merged).', 'info');
    } catch (e) {
      toast(`Import failed: ${String(e)}`, 'error');
    }
  };

  const reset = async () => {
    await services.db.delete();
    toast('All data erased. Reloading…', 'info');
    setTimeout(() => window.location.reload(), 800);
  };

  return (
    <div className="content" style={{ maxWidth: 680 }}>
      <div className="view-title">
        <div>
          <h1>Settings</h1>
          <div className="sub">Everything lives on this device by default.</div>
        </div>
      </div>

      <div className="card">
        <h2 className="mb">Profile & goals</h2>
        <div className="field">
          <label>Name</label>
          <input type="text" value={effectiveName} onChange={(e) => setName(e.target.value)} onBlur={() => name && save({ name })} />
        </div>
        <div className="field">
          <label>Daily study goal (minutes)</label>
          <input type="number" min={5} max={300} value={S.dailyMinutesGoal} onChange={(e) => setSettings({ dailyMinutesGoal: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label>Default session length</label>
          <select value={S.defaultSessionMinutes} onChange={(e) => setSettings({ defaultSessionMinutes: Number(e.target.value) })}>
            {[5, 10, 25, 60].map((m) => <option key={m} value={m}>{m === 5 ? '5 — micro' : m === 10 ? '10 — focused' : m === 25 ? '25 — balanced' : '60 — deep'}</option>)}
          </select>
          <div className="hint">Micro sessions are 1–2 items; deep sessions include retrieval, application, comparison and teach-back segments.</div>
        </div>
      </div>

      <div className="card">
        <h2 className="mb">Mastery checkpoints</h2>
        <div className="tiny muted mb">
          What counts as “mastered”. Strict settings delay mastery until stronger evidence arrives — the default already requires
          delayed retrieval and application, not just quizzes.
        </div>
        <div className="grid-2">
          <div className="field"><label>Retrievals</label><input type="number" min={2} value={S.checkpoints.retrievals} onChange={(e) => setCheckpoints({ retrievals: Number(e.target.value) })} /></div>
          <div className="field"><label>Delayed retrievals (≥2 days later)</label><input type="number" min={0} value={S.checkpoints.delayedRetrievals} onChange={(e) => setCheckpoints({ delayedRetrievals: Number(e.target.value) })} /></div>
          <div className="field"><label>Applications</label><input type="number" min={0} value={S.checkpoints.applications} onChange={(e) => setCheckpoints({ applications: Number(e.target.value) })} /></div>
          <div className="field"><label>Explanations (teach-back)</label><input type="number" min={0} value={S.checkpoints.explanations} onChange={(e) => setCheckpoints({ explanations: Number(e.target.value) })} /></div>
          <div className="field"><label>Min stability (days)</label><input type="number" min={1} max={365} value={S.checkpoints.minStabilityDays} onChange={(e) => setCheckpoints({ minStabilityDays: Number(e.target.value) })} /></div>
          <div className="field"><label>Min mastery score</label><input type="number" min={50} max={100} value={S.checkpoints.minMastery} onChange={(e) => setCheckpoints({ minMastery: Number(e.target.value) })} /></div>
        </div>
      </div>

      <div className="card">
        <h2 className="mb">Appearance & interaction</h2>
        <div className="row between mb">
          <span>Theme</span>
          <select value={S.theme} onChange={(e) => { applyTheme(e.target.value as 'light' | 'dark' | 'system'); void setSettings({ theme: e.target.value as 'light' | 'dark' | 'system' }); }} style={{ width: 160 }}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="row between mb">
          <span>Ask how sure I am before revealing answers <span className="tiny muted">(calibrates your confidence)</span></span>
          <Toggle on={S.askConfidence} onChange={(v) => setSettings({ askConfidence: v })} label="Ask confidence" />
        </div>
        <div className="row between">
          <span>Reduce motion</span>
          <Toggle on={S.reduceMotion} onChange={(v) => setSettings({ reduceMotion: v })} label="Reduce motion" />
        </div>
      </div>

      <div className="card">
        <h2 className="mb">Notifications & speech</h2>
        <div className="row between mb">
          <span>Study reminders (when items are due)</span>
          <Toggle on={S.notificationsEnabled} onChange={async (v) => { if (v) { const r = await services.notifications.requestPermission(); setSettings({ notificationsEnabled: r.ok }); if (!r.ok) toast(`Notifications unavailable${r.reason ? `: ${r.reason}` : ''}.`, 'error'); } else setSettings({ notificationsEnabled: false }); }} label="Notifications" />
        </div>
        <div className="row between mb">
          <span>Read explanations aloud</span>
          <Toggle on={S.speechEnabled} onChange={(v) => { setSettings({ speechEnabled: v }); if (v) services.speech.speak('Speech enabled.'); }} label="Speech" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Speech rate ({S.speechRate.toFixed(1)}×)</label>
          <input type="range" min={0.6} max={1.6} step={0.1} value={S.speechRate} onChange={(e) => setSettings({ speechRate: Number(e.target.value) })} style={{ padding: 0 }} />
        </div>
      </div>

      <div className="card">
        <h2 className="mb">AI provider (optional)</h2>
        <div className="tiny muted mb">
          AVENIQ works fully offline — the learning engine never requires AI. If you connect a provider, AI is used only for
          extra explanations and Socratic hints, every AI output is validated and marked as generated, and you can edit it.
        </div>
        <div className="row between mb">
          <span>Enable AI assistance</span>
          <Toggle on={S.ai.enabled} onChange={(v) => { setSettings({ ai: { ...S.ai, enabled: v } }); setAiOpen(v); }} label="AI enabled" />
        </div>
        {aiOpen && S.ai.enabled && (
          <div className="insight info">
            <Icon name="bulb" size={14} /> What gets sent: the concept name, its explanation, and your latest answer — nothing else.
            Requests go directly from this device to your chosen endpoint.
          </div>
        )}
        {S.ai.enabled && (
          <div className="grid-2 mt">
            <div className="field"><label>Provider</label>
              <select value={S.ai.provider} onChange={(e) => setSettings({ ai: { ...S.ai, provider: e.target.value as 'none' | 'openai-compatible' } })}>
                <option value="openai-compatible">OpenAI-compatible API</option>
              </select>
            </div>
            <div className="field"><label>Model</label><input type="text" value={S.ai.model} onChange={(e) => setSettings({ ai: { ...S.ai, model: e.target.value } })} placeholder="gpt-4o-mini" /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Base URL</label><input type="url" value={S.ai.baseUrl} onChange={(e) => setSettings({ ai: { ...S.ai, baseUrl: e.target.value } })} placeholder="https://api.openai.com/v1" /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>API key (stored only on this device)</label><input type="password" value={S.ai.apiKey} onChange={(e) => setSettings({ ai: { ...S.ai, apiKey: e.target.value } })} /></div>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="mb">Your data</h2>
        <div className="tiny muted mb">
          {concepts.length} concepts, all attempts, states, plans and backups live in this browser (IndexedDB).
          Versioned backups survive schema migrations.
        </div>
        <div className="row mb">
          <button className="btn" onClick={exportBackup}><Icon name="import" size={15} /> Export backup</button>
          <label className="btn" style={{ cursor: 'pointer' }}>
            Import backup
            <input type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && importBackupFile(e.target.files[0])} />
          </label>
        </div>
        {health && !health.ok && (
          <div className="insight warn mb">
            <strong>Data health:</strong> {health.issues.join(' · ')}
          </div>
        )}
        {!confirmReset ? (
          <button className="btn danger" onClick={() => setConfirmReset(true)}>Erase all data</button>
        ) : (
          <div className="row">
            <button className="btn danger" onClick={reset}>Yes, erase everything permanently</button>
            <button className="btn subtle" onClick={() => setConfirmReset(false)}>Cancel</button>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="mb">Privacy</h2>
        <div className="small muted">
          Local-first: no account, no tracking, no servers. Your learning history belongs to you.
          The only network requests AVENIQ makes are the ones you configure above (optional AI provider) —
          and AI outputs are always marked as generated and remain editable.
        </div>
      </div>
    </div>
  );
}
