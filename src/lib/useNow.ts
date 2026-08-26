import { useEffect, useState } from 'react';

/**
 * The single source of "now" for the UI. Engines never read the clock — they take it as
 * an argument — so this is where it enters the app.
 *
 * The interval is per-consumer: the countdown wants a second, a timeline wants far less.
 * Re-syncs on visibility change, because a backgrounded tab's timers drift and the phone
 * suspends them outright.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = (): void => setNow(Date.now());
    const timer = window.setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [intervalMs]);

  return now;
}
