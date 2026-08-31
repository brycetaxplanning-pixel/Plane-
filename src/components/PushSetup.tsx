import { useEffect, useState } from 'react';
import { disablePush, enablePush, pushSupported, sendTestPush, syncWakes } from '../lib/push';
import { wakePlan } from '../lib/wakes';
import { useApp } from '../state/context';
import { Field, SectionHead } from './ui/Field';

/** Turning on notifications that arrive with the app shut. Needs the little
 *  server in `server/` deployed somewhere; without it this is off and says so. */
export function PushSetup() {
  const { state, update, toast } = useApp();
  const device = state.push;
  const [server, setServer] = useState(device?.server ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [scheduled, setScheduled] = useState<number | null>(null);

  const plan = wakePlan(state);

  // Whenever the data behind the schedule changes, push the new times up.
  useEffect(() => {
    if (!device) return;
    void syncWakes(state, device).then(setScheduled).catch(() => setScheduled(null));
    // Keyed on the plan's shape rather than the whole state, so this is not
    // re-run on every unrelated keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.deviceId, plan.map((w) => `${w.at}${w.tag}`).join('|')]);

  if (!pushSupported()) {
    return (
      <section className="card">
        <SectionHead title="Notifications with the app closed" sub="Not available in this browser" />
        <p className="t-sm t-sec">
          This browser has no Push API. On an iPhone it only works once the app is on your home screen, and only in
          Safari.
        </p>
      </section>
    );
  }

  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      const registered = await enablePush(server.trim());
      update((s) => ({ ...s, push: registered }));
      const n = await syncWakes(state, registered);
      setScheduled(n);
      toast(`Notifications on — ${n} scheduled`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!device) return;
    setBusy(true);
    await disablePush(device);
    update((s) => ({ ...s, push: null }));
    toast('Notifications off');
    setBusy(false);
  };

  return (
    <section className="card">
      <SectionHead
        title="Notifications with the app closed"
        sub={device ? 'On for this device' : 'Needs the small server from this repo, deployed once'}
      />

      {device ? (
        <>
          <p className="t-sm t-sec">
            Registered with <code>{device.server}</code>.{' '}
            {scheduled !== null ? `${scheduled} wake${scheduled === 1 ? '' : 's'} scheduled for the next fortnight.` : ''}
          </p>
          <div className="row-2 wrap" style={{ marginTop: 'var(--sp-3)' }}>
            <button
              className="btn"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await sendTestPush(device);
                  toast('Sent — it should arrive in a moment');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'The server would not send it.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Send a test
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => void disconnect()}>Turn off</button>
          </div>
        </>
      ) : (
        <>
          <Field
            label="Server address"
            hint="The URL of your deployed Worker, e.g. https://plane-push.you.workers.dev. server/README.md has the four commands."
          >
            <input
              className="input"
              value={server}
              onChange={(e) => setServer(e.target.value)}
              placeholder="https://plane-push.you.workers.dev"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <button
            className="btn btn-primary"
            style={{ marginTop: 'var(--sp-3) ' }}
            disabled={busy || !server.trim()}
            onClick={() => void connect()}
          >
            {busy ? 'Connecting…' : 'Turn on notifications'}
          </button>
        </>
      )}

      {error && <p className="t-xs t-crit" style={{ marginTop: 'var(--sp-2)' }}>{error}</p>}

      <p className="t-xs t-muted" style={{ marginTop: 'var(--sp-3)' }}>
        The server is told <em>when</em> to wake this device and nothing else — no titles, no module names, no content.
        The wording is written into this browser and read back when the push arrives, so what a notification says never
        leaves the device. {plan.length} thing{plan.length === 1 ? '' : 's'} would be scheduled right now.
      </p>
    </section>
  );
}
