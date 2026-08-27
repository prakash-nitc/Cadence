import { useEffect, useState } from 'react';
import { Nav, type Tab } from './components/Nav';
import { notifier } from './lib/notify';
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
  const { loaded: dayLoaded, load: loadDay, date, day } = useDay();

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

  // Re-armed on every change to the laid day, so a push, a skip or a triage moves the
  // notifications with the boundaries. scheduleDay cancels first — duplicate stacks are
  // the classic bug here (SPEC §7).
  const blocks = day?.blocks;
  useEffect(() => {
    if (!prefs || !blocks) return;
    void notifier.scheduleDay(blocks, prefs);
  }, [blocks, prefs]);

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
              {tab === 'Plan' ? <Plan now={now} prefs={prefs} /> : null}
              {tab === 'Progress' ? <Progress prefs={prefs} /> : null}
              {tab === 'Settings' ? <Settings prefs={prefs} /> : null}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
