import { useEffect, useState } from 'react';
import { Header, greetingFor } from './components/Header';
import { Nav, type Tab } from './components/Nav';
import { blockAt, isDayComplete, isResolved } from './engine/boundaries';
import { completionOf, isDropped } from './engine/scoring';
import { dayStatusLine } from './lib/copy';
import { notifier } from './lib/notify';
import { useNow } from './lib/useNow';
import { Day } from './screens/Day';
import { Now } from './screens/Now';
import { Plan } from './screens/Plan';
import { Progress } from './screens/Progress';
import { Settings } from './screens/Settings';
import { useDay } from './store/dayStore';
import { usePrefs } from './store/prefsStore';

/** What each screen is for, said once in the header rather than on every screen. */
const SUBTITLES: Partial<Record<Tab, string>> = {
  Day: 'Every block today, and what got finished in it',
  Plan: "Log what happened, then arrange tomorrow",
  Progress: 'Targets, pace and history',
  Settings: 'Thresholds and behaviour, kept across roadmaps',
};

export default function App() {
  const [tab, setTab] = useState<Tab>('Now');
  const now = useNow(1000);

  const { prefs, targets, loaded: prefsLoaded, load: loadPrefs } = usePrefs();
  const { loaded: dayLoaded, load: loadDay, date, day, commitments } = useDay();

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

  /*
   * Now gets a status line derived from the day as it actually stands; every other tab
   * gets its fixed description. Computed here because the header lives here, and it is
   * cheap: three reductions over one day's commitments.
   */
  const running = day?.blocks ? blockAt(day.blocks, now) : null;
  const earned = commitments
    .filter((commitment) => !isDropped(commitment))
    .reduce((sum, c) => sum + c.plannedMinutes * completionOf(c), 0);
  const committed = commitments
    .filter((commitment) => !isDropped(commitment))
    .reduce((sum, c) => sum + c.plannedMinutes, 0);

  const subtitle =
    tab === 'Now'
      ? ready
        ? dayStatusLine({
            anchored: day?.anchorAt != null,
            complete: day?.blocks ? isDayComplete(day.blocks) : false,
            earnedMinutes: earned,
            committedMinutes: committed,
            runningLabel:
              running && !isResolved(running) && running.kind !== 'gap' ? running.label : null,
          })
        : undefined
      : SUBTITLES[tab];

  return (
    <div className="flex h-dvh overflow-hidden bg-ink">
      <Nav tab={tab} onChange={setTab} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          title={tab === 'Now' ? greetingFor(now) : tab}
          {...(subtitle ? { subtitle } : {})}
          now={now}
        />

        {/*
          The content column is capped at 1250px and centred — §32. Below that the app
          simply uses the width it is given; there is no mobile layout, because there is
          no phone.
        */}
        <main className="min-w-0 flex-1 overflow-y-auto px-8 py-6">
          <div className="mx-auto w-full max-w-[1250px]">
            {!ready ? (
              <p className="text-sm text-muted">Loading.</p>
            ) : (
              <div key={tab} className="animate-rise-in">
                {tab === 'Now' ? <Now now={now} prefs={prefs} /> : null}
                {tab === 'Day' ? <Day now={now} prefs={prefs} /> : null}
                {tab === 'Plan' ? <Plan now={now} prefs={prefs} /> : null}
                {tab === 'Progress' ? <Progress prefs={prefs} targets={targets} /> : null}
                {tab === 'Settings' ? <Settings prefs={prefs} /> : null}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
