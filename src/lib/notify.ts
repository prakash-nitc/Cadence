/**
 * Notifications — SPEC §7.
 *
 * An interface with two runtime implementations. `WebNotifier` is this one; the
 * Capacitor-backed `NativeNotifier` arrives in session 7 and is the one that matters,
 * because it fires with the app closed and the phone locked.
 *
 * Honest limitation of the web implementation: `setTimeout` does not survive the browser
 * being closed, and mobile browsers suspend background timers aggressively. It is fine
 * on the laptop during study hours and unreliable anywhere else, so it re-arms on every
 * `visibilitychange` rather than trusting a timer set hours ago.
 */
import type { ScheduledBlock } from '../engine/layout';
import type { NotificationKey, Prefs } from './prefs';
import { formatDuration, toHHMM } from './time';

export interface Notification {
  key: NotificationKey;
  at: number;
  title: string;
  body: string;
}

export interface Notifier {
  requestPermission(): Promise<boolean>;
  scheduleDay(blocks: ScheduledBlock[], prefs: Prefs): Promise<void>;
  cancelAll(): Promise<void>;
}

const MINUTE = 60_000;
const FIVE_MINUTES = 5 * MINUTE;

/** Notifications the app can fire without knowing anything about commitments yet. */
export function blockNotifications(
  blocks: ScheduledBlock[],
  prefs: Prefs,
  commitmentCount: (blockId: string) => number = () => 0,
): Notification[] {
  const out: Notification[] = [];

  for (const block of blocks) {
    if (block.kind === 'gap') continue;

    if (prefs.notifications.blockStart) {
      const commitments = commitmentCount(block.blockId);
      out.push({
        key: 'blockStart',
        at: block.startsAt,
        title: block.label.toUpperCase(),
        body: `${formatDuration(block.minutes)}.${
          commitments > 0
            ? ` ${commitments} ${commitments === 1 ? 'commitment' : 'commitments'}.`
            : ''
        }`,
      });
    }

    if (prefs.notifications.fiveMinuteWarning && block.minutes > 5) {
      out.push({
        key: 'fiveMinuteWarning',
        at: block.endsAt - FIVE_MINUTES,
        title: '5 minutes',
        body: 'Start closing.',
      });
    }

    if (prefs.notifications.blockEnd) {
      out.push({
        key: 'blockEnd',
        at: block.endsAt,
        title: 'STOP',
        body: 'Block over.',
      });
    }
  }

  return out.sort((a, b) => a.at - b.at);
}

/** The fixed-time reminders that do not hang off a block boundary — SPEC §3.5. */
export function dayNotifications(dayDate: string, prefs: Prefs): Notification[] {
  const out: Notification[] = [];
  const at = (hhmm: string): number => Date.parse(`${dayDate}T${hhmm}:00`);

  if (prefs.notifications.notAnchored) {
    out.push({
      key: 'notAnchored',
      at: at(prefs.notAnchoredBy),
      title: 'Day not started',
      body: 'Anchor it or the day is unplanned.',
    });
  }

  return out;
}

/**
 * Service-worker-backed notifications for the browser.
 *
 * Every scheduling call cancels first. Duplicate notification stacks are the classic bug
 * here — SPEC §7 says so explicitly.
 */
export class WebNotifier implements Notifier {
  private timers: number[] = [];
  private pending: Notification[] = [];
  private rearm: (() => void) | null = null;

  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    return (await Notification.requestPermission()) === 'granted';
  }

  async scheduleDay(blocks: ScheduledBlock[], prefs: Prefs): Promise<void> {
    await this.cancelAll();
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    this.pending = blockNotifications(blocks, prefs);
    this.arm();

    // Timers do not survive a suspended tab. Re-arm from the list whenever the page
    // comes back, rather than trusting a timeout set hours ago.
    this.rearm = () => {
      if (document.visibilityState === 'visible') this.arm();
    };
    document.addEventListener('visibilitychange', this.rearm);
  }

  async cancelAll(): Promise<void> {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers = [];
    this.pending = [];

    if (this.rearm) {
      document.removeEventListener('visibilitychange', this.rearm);
      this.rearm = null;
    }
  }

  private arm(): void {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers = [];

    const now = Date.now();
    for (const notification of this.pending) {
      const delay = notification.at - now;
      if (delay <= 0) continue;
      // setTimeout saturates past ~24.8 days; a day's boundaries are never near that.
      this.timers.push(
        window.setTimeout(() => void this.fire(notification), delay),
      );
    }
  }

  private async fire(notification: Notification): Promise<void> {
    const registration = await navigator.serviceWorker?.getRegistration();

    if (registration) {
      await registration.showNotification(notification.title, {
        body: notification.body,
        tag: `${notification.key}:${notification.at}`,
        silent: false,
      });
      return;
    }

    new Notification(notification.title, { body: notification.body });
  }
}

/** One shared instance. Session 7 swaps this for the Capacitor-backed one on Android. */
export const notifier: Notifier = new WebNotifier();

/** Preview copy for the Settings screen, so each toggle says what it will actually say. */
export const NOTIFICATION_SAMPLES: Record<NotificationKey, { label: string; sample: string }> = {
  blockStart: { label: 'Block start', sample: 'SPRING BOOT. 1h 40m. 2 commitments.' },
  fiveMinuteWarning: { label: 'Five minutes left', sample: '5 minutes. Start closing.' },
  blockEnd: { label: 'Block end', sample: 'STOP. Block over.' },
  middayPace: { label: 'Midday pace check', sample: 'On pace: 58%. 3h 20m left.' },
  burnDownNegative: { label: 'Over-committed', sample: 'Over-committed by 1h 15m. Triage.' },
  planAndLog: { label: 'Plan and log', sample: 'Log today. Plan tomorrow.' },
  screensOff: { label: 'Screens off', sample: 'Screens off. Book.' },
  notAnchored: { label: 'Day not started by 10:00', sample: 'Day not started.' },
};

/** Exported for tests: the wall-clock line a block-start notification renders. */
export const blockStartLine = (block: ScheduledBlock): string =>
  `${toHHMM(block.startsAt)} ${block.label}`;
