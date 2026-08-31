import { useEffect, useState } from 'react';
import { SectionHead } from './ui/Field';

/** Chrome and Edge fire this so a page can offer installation itself. Safari
 *  does not, which is why the iOS steps are written out instead. */
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  // Safari's own flag, which predates the standard media query.
  (navigator as { standalone?: boolean }).standalone === true;

const isIOS = (): boolean =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  // iPadOS reports itself as a Mac, but a Mac has no touch.
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Shown only when the app is running in a browser tab. Once it is installed
 *  there is nothing to say. */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <section className="card">
        <SectionHead title="Installed" sub="You are running this as an app, not a tab" />
        <p className="t-sm t-sec">
          It works offline from here. Your data lives in this install and nothing syncs to another device yet —
          use Export below to move a copy.
        </p>
      </section>
    );
  }

  return (
    <section className="card">
      <SectionHead title="Put it on your home screen" sub="It then opens like an app and works offline" />

      {event ? (
        <button
          className="btn btn-primary btn-lg"
          onClick={() => {
            void event.prompt();
            void event.userChoice.then(() => setEvent(null));
          }}
        >
          Install
        </button>
      ) : isIOS() ? (
        <ol className="t-sm t-sec" style={{ margin: 0, paddingLeft: '1.2em', lineHeight: 1.7 }}>
          <li>Open this page in <strong>Safari</strong> — Chrome on iOS cannot install it.</li>
          <li>Tap the <strong>Share</strong> button, the square with the arrow out of it.</li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
        </ol>
      ) : (
        <p className="t-sm t-sec">
          In your browser's menu, look for <strong>Install</strong> or <strong>Add to Home Screen</strong>. Firefox
          on the desktop does not offer it; Chrome, Edge and Safari do.
        </p>
      )}

      <p className="t-xs t-muted" style={{ marginTop: 'var(--sp-3)' }}>
        Installing keeps a copy of the app on the device, so it opens with no signal. It does not move your data
        anywhere — that stays in this browser either way.
      </p>
    </section>
  );
}
