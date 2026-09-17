/**
 * Automatic backup — SPEC §0.4.
 *
 * Everything Cadence knows lives in one browser profile. Clearing site data, a broken
 * profile or a new laptop loses every day ever logged, and a manual export nobody remembers
 * to take protects nothing. So the app takes one itself.
 *
 * It saves a normal download to the Downloads folder. Writing silently into a chosen folder
 * would be nicer, but Brave ships with the File System Access API switched off, so a
 * download is the one mechanism that works where this app actually runs. One file per
 * backup day, named by date, so the newest is always easy to find.
 */

/** Whether an automatic backup is due. Zero days means automatic backup is off. */
export function backupDue(lastBackupAt: number | null, everyDays: number, now: number): boolean {
  if (everyDays <= 0) return false;
  if (lastBackupAt === null) return true;
  // Measured in calendar days, so a daily backup at 23:00 is still due the next morning.
  const last = new Date(lastBackupAt);
  const today = new Date(now);
  last.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - last.getTime()) / 86_400_000);
  return days >= everyDays;
}

export function backupFileName(now: number): string {
  const at = new Date(now);
  const date = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
  return `cadence-backup-${date}.json`;
}

/** Hands a backup to the browser as a download. */
export function downloadBackup(backup: unknown, now: number): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = backupFileName(now);
  link.click();
  // Revoked on the next tick: revoking immediately can cancel the download in Chromium.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Ask the browser not to clear this site's storage when the disk runs low.
 *
 * The browser decides; installed and frequently used apps are usually granted. It does not
 * protect against clearing site data by hand, which is what the backup files are for.
 */
export async function protectStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
