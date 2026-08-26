import { useEffect, useState } from 'react';
import { Nav, type Tab } from './components/Nav';
import { useNow } from './lib/useNow';
import { Day } from './screens/Day';
import { Now } from './screens/Now';
import { Plan } from './screens/Plan';
import { Progress } from './screens/Progress';
import { Settings } from './screens/Settings';
import { useDay } from './store/dayStore';
import { usePrefs } from './store/prefsStore';

export default function App() {
  const [tab, setTab] = useState<Tab>('Now');
  const now = useNow(1000);

  const { prefs, loaded: prefsLoaded, load: loadPrefs } = usePrefs();
  const { loaded: dayLoaded, load: loadDay, date } = useDay();

  useEffect(() => {
    void loadPrefs();
  }, [loadPrefs]);

  useEffect(() => {
    void loadDay(Date.now());
  }, [loadDay]);

  // A day that runs past midnight stays the active day until its last boundary passes.
  // Re-resolving on focus keeps the app honest about which day it is in.
  useEffect(() => {
    const recheck = (): void => void loadDay(Date.now());
    document.addEventListener('visibilitychange', recheck);
    return () => document.removeEventListener('visibilitychange', recheck);
  }, [loadDay]);

  const ready = prefsLoaded && dayLoaded && prefs !== null && date !== null;

  return (
    <div className="flex min-h-dvh bg-ink">
      <Nav tab={tab} onChange={setTab} />

      <main className="min-w-0 flex-1 px-5 pb-24 pt-6 lg:px-8 lg:pb-8">
        <div className="mx-auto max-w-2xl lg:max-w-3xl">
          {!ready ? (
            <p className="text-sm text-muted">Loading.</p>
          ) : (
            <>
              {tab === 'Now' ? <Now now={now} prefs={prefs} /> : null}
              {tab === 'Day' ? <Day now={now} prefs={prefs} /> : null}
              {tab === 'Plan' ? <Plan /> : null}
              {tab === 'Progress' ? <Progress /> : null}
              {tab === 'Settings' ? <Settings /> : null}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
