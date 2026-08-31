import { useRef, useState } from 'react';
import { AI_MODELS, isAIConfigured } from '../lib/ai';
import { SKINS, skinById, skinForDay } from '../lib/themes';
import { deviceAlertsSupported, requestDeviceAlerts } from '../lib/notifications';
import { routeOf } from '../lib/router';
import { EFFECTS } from '../lib/completionFx';
import { DEFAULT_CATEGORIES, emptyState } from '../lib/schema';
import { BADGES, earnedBadges, levelFor, streakOf, totalXp } from '../lib/gamification';
import { downloadFile, exportBundle, importBundle } from '../lib/storage';
import { sampleState } from '../lib/seed';
import { InstallPrompt } from '../components/InstallPrompt';
import { PushSetup } from '../components/PushSetup';
import { BackupCard } from '../components/BackupCard';
import { todayKey } from '../lib/date';
import { useApp } from '../state/context';
import { Field, SectionHead } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { StatTile } from '../components/charts/StatTile';

export function Settings() {
  const { state, update, replaceAll, toast, storageName } = useApp();
  const [showKey, setShowKey] = useState(false);
  const [confirm, setConfirm] = useState<'reset' | 'sample' | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const earned = new Set(earnedBadges(state).map((b) => b.id));

  const setSetting = <K extends keyof typeof state.settings>(key: K, value: (typeof state.settings)[K]) =>
    update((s) => ({ ...s, settings: { ...s.settings, [key]: value } }));

  return (
    <div className="stack">
      <section className="card">
        <SectionHead
          title="Look"
          sub={state.settings.skinRotation
            ? `Rotating daily — today is ${skinById(skinForDay()).name}`
            : skinById(state.settings.skin).blurb}
        />

        <div className="skin-grid">
          {SKINS.map((sk) => {
            const active = !state.settings.skinRotation && state.settings.skin === sk.id;
            return (
              <button
                key={sk.id}
                className={`skin${active ? ' is-on' : ''}`}
                aria-pressed={active}
                onClick={() => update((st) => ({ ...st, settings: { ...st.settings, skin: sk.id, skinRotation: false } }))}
              >
                <span className="skin-swatch" style={{ background: sk.surface }}>
                  {sk.swatch.map((c) => <i key={c} style={{ background: c }} />)}
                </span>
                <span className="skin-name">{sk.name}</span>
              </button>
            );
          })}
        </div>

        <label className="row-2" style={{ cursor: 'pointer', marginTop: 'var(--sp-4)' }}>
          <input
            className="checkbox"
            type="checkbox"
            checked={state.settings.skinRotation}
            onChange={(e) => update((st) => ({ ...st, settings: { ...st.settings, skinRotation: e.target.checked } }))}
          />
          <span className="t-sm">Change the theme every 24 hours</span>
        </label>

        <label className="row-2" style={{ cursor: 'pointer', marginTop: 'var(--sp-3)' }}>
          <input
            className="checkbox"
            type="checkbox"
            checked={state.insights.enabled}
            onChange={(e) => update((st) => ({ ...st, insights: { ...st.insights, enabled: e.target.checked } }))}
          />
          <span className="t-sm">Raise a finding from my own data now and then (at most once a day)</span>
        </label>

        <label className="row-2" style={{ cursor: 'pointer', marginTop: 'var(--sp-3)' }}>
          <input
            className="checkbox"
            type="checkbox"
            checked={state.settings.completionFx}
            onChange={(e) => update((st) => ({ ...st, settings: { ...st.settings, completionFx: e.target.checked } }))}
          />
          <span className="t-sm">Play a random animation when a task is checked off ({EFFECTS.length} of them)</span>
        </label>

        {state.settings.skin === 'classic' && !state.settings.skinRotation && (
          <div style={{ marginTop: 'var(--sp-4)', maxWidth: 220 }}>
            <Field label="Light or dark">
              <select className="select" value={state.settings.theme} onChange={(e) => setSetting('theme', e.target.value as 'system' | 'light' | 'dark')}>
                <option value="system">Match device</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </Field>
          </div>
        )}
      </section>

      <section className="card">
        <SectionHead title="You" />
        <div className="grid grid-2" style={{ gap: 'var(--sp-3)' }}>
          <Field label="Name">
            <input className="input" value={state.settings.displayName} placeholder="Your name" onChange={(e) => setSetting('displayName', e.target.value)} />
          </Field>
          <Field label="Currency">
            <input className="input" value={state.settings.currency} onChange={(e) => setSetting('currency', e.target.value.toUpperCase().slice(0, 3))} />
          </Field>
        </div>
      </section>

      <section className="card">
        <SectionHead
          title="AI coaching"
          sub="The fitness coach, life coach and transaction splitting call Claude directly from this device."
        />
        <div className="stack-3">
          <Field
            label="Anthropic API key"
            hint="Stored only in this browser's local storage — it is never sent anywhere but api.anthropic.com. Get one at console.anthropic.com."
          >
            <div className="row-2">
              <input
                className="input grow"
                type={showKey ? 'text' : 'password'}
                value={state.settings.anthropicApiKey}
                placeholder="sk-ant-…"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setSetting('anthropicApiKey', e.target.value.trim())}
              />
              <button className="btn" onClick={() => setShowKey((v) => !v)}>{showKey ? 'Hide' : 'Show'}</button>
            </div>
          </Field>

          <Field label="Model">
            <select className="select" value={state.settings.aiModel} onChange={(e) => setSetting('aiModel', e.target.value)}>
              {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </Field>

          <p className={isAIConfigured(state.settings) ? 'status status-good' : 'status status-neutral'} style={{ alignSelf: 'flex-start' }}>
            {isAIConfigured(state.settings) ? 'Key set — coaches are live' : 'No key — coaches fall back to built-in advice'}
          </p>
        </div>
      </section>

      <section className="card">
        <SectionHead
          title="Notifications"
          sub="Things the app raises on its own — a habit slipping, a project past due, a finding in the log"
        />
        <p className="t-sm t-sec" style={{ marginBottom: 'var(--sp-3)' }}>
          {state.notifications.items.length} in the log, {state.notifications.items.filter((n) => !n.read).length} unread.
          {' '}<a href={routeOf('notifications')}>Open the log →</a>
        </p>

        {deviceAlertsSupported() ? (
          <label className="row-2" style={{ cursor: 'pointer' }}>
            <input
              className="checkbox"
              type="checkbox"
              checked={state.notifications.deviceAlerts}
              onChange={async (e) => {
                if (!e.target.checked) {
                  update((st) => ({ ...st, notifications: { ...st.notifications, deviceAlerts: false } }));
                  return;
                }
                const granted = await requestDeviceAlerts();
                update((st) => ({ ...st, notifications: { ...st.notifications, deviceAlerts: granted } }));
                if (!granted) toast('The browser blocked notifications for this site');
              }}
            />
            <span className="t-sm">Also alert me on this device</span>
          </label>
        ) : (
          <p className="t-xs t-muted">This browser has no notification support.</p>
        )}
        <p className="t-xs t-muted" style={{ marginTop: 'var(--sp-2)' }}>
          Device alerts only fire while the app is open. For ones that reach you with it closed, see below.
        </p>
      </section>

      <PushSetup />

      <section className="card">
        <SectionHead title="Progress" sub={`Level ${levelFor(totalXp(state.xp)).level}`} />
        <div className="grid grid-3 tight-mobile" style={{ gap: 'var(--sp-3)' }}>
          <StatTile label="Total XP" value={totalXp(state.xp).toLocaleString()} small />
          <StatTile label="Streak" value={`${streakOf(state.activeDays).current}d`} caption={`longest ${streakOf(state.activeDays).longest}d`} small />
          <StatTile label="Badges" value={`${earned.size}/${BADGES.length}`} small />
        </div>
        <div className="row-2 wrap" style={{ marginTop: 'var(--sp-4)' }}>
          {BADGES.map((b) => (
            <span
              key={b.id}
              className="chip chip-static"
              title={b.description}
              style={earned.has(b.id) ? undefined : { opacity: 0.45 }}
            >
              <span aria-hidden>{b.icon}</span>{b.name}
            </span>
          ))}
        </div>
      </section>

      <section className="card">
        <SectionHead title="Spending categories" />
        <div className="row-2 wrap" style={{ marginBottom: 'var(--sp-3)' }}>
          {state.finance.categories.map((c) => (
            <span key={c} className="chip chip-static">
              {c}
              {!DEFAULT_CATEGORIES.includes(c as (typeof DEFAULT_CATEGORIES)[number]) && (
                <button
                  className="link-btn"
                  aria-label={`Remove ${c}`}
                  onClick={() => update((s) => ({ ...s, finance: { ...s.finance, categories: s.finance.categories.filter((x) => x !== c) } }))}
                >
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
        <div className="row-2">
          <input
            className="input grow"
            value={newCategory}
            placeholder="Add a category"
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newCategory.trim()) {
                e.preventDefault();
                const c = newCategory.trim();
                update((s) => ({
                  ...s,
                  finance: { ...s.finance, categories: s.finance.categories.includes(c) ? s.finance.categories : [...s.finance.categories, c] },
                }));
                setNewCategory('');
              }
            }}
          />
        </div>
      </section>

      <InstallPrompt />

      <BackupCard />

      <section className="card">
        <SectionHead
          title="Your data"
          sub={`Stored on this device (${storageName === 'local' ? 'browser storage' : 'memory only — this browser is blocking site data'}).`}
        />
        <p className="t-sm t-sec" style={{ marginBottom: 'var(--sp-3)' }}>
          Nothing leaves this device on its own. To move between your phone and laptop, export here
          and import there.
        </p>
        <div className="row-2 wrap">
          <button
            className="btn"
            onClick={async () => {
              // Async because the photos have to be read back out of the image
              // store and inlined, so the file stays self-contained.
              downloadFile(`plane-backup-${todayKey()}.json`, await exportBundle(state));
              // Stamped here too, so the reminder above cannot disagree with
              // what actually happened.
              update((st) => ({ ...st, settings: { ...st.settings, lastExport: todayKey() } }));
              toast('Backup downloaded');
            }}
          >
            Export JSON
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Import JSON</button>
          <button className="btn" onClick={() => setConfirm('sample')}>Load sample data</button>
          <button className="btn btn-danger" onClick={() => setConfirm('reset')}>Erase everything</button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void file.text().then(async (text) => {
              try {
                // Any photos in the file are moved into the image store before
                // the state replaces what is loaded.
                replaceAll(await importBundle(text));
                toast('Data imported');
              } catch {
                toast('That file could not be read');
              }
            });
            e.target.value = '';
          }}
        />
      </section>

      <section className="card card-sunken">
        <p className="t-xs t-muted">
          Plane · a local-first habit tracker. Everything it knows is on this device.
        </p>
      </section>

      {confirm && (
        <Modal
          title={confirm === 'reset' ? 'Erase everything?' : 'Load sample data?'}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirm(null)}>Cancel</button>
              <button
                className={confirm === 'reset' ? 'btn btn-danger' : 'btn btn-primary'}
                onClick={() => {
                  if (confirm === 'reset') {
                    const fresh = emptyState();
                    fresh.settings = state.settings;
                    replaceAll(fresh);
                    toast('Everything erased');
                  } else {
                    const sample = sampleState();
                    sample.settings = { ...state.settings, displayName: state.settings.displayName || sample.settings.displayName };
                    replaceAll(sample);
                    toast('Sample data loaded');
                  }
                  setConfirm(null);
                }}
              >
                {confirm === 'reset' ? 'Erase' : 'Load it'}
              </button>
            </>
          }
        >
          <p className="t-sm t-sec">
            {confirm === 'reset'
              ? 'Every project, contact, session, transaction and goal on this device will be deleted. Your settings and API key are kept. Export a backup first if you might want it back.'
              : 'This replaces everything currently stored with a couple of weeks of realistic example data, so you can see how each module behaves. Export a backup first if you have real data here.'}
          </p>
        </Modal>
      )}
    </div>
  );
}
