import { describe, expect, it } from 'vitest';
import type { ScheduledBlock } from '../engine/layout';
import { unslotted } from './dayScoring';

const block = (blockId: string): ScheduledBlock => ({
  blockId,
  label: blockId,
  detail: null,
  kind: 'work',
  priority: 1,
  minutes: 60,
  startsAt: 0,
  endsAt: 60 * 60_000,
  status: 'pending',
  actualEndedAt: null,
  missedWindow: false,
  straddles: null,
  window: null,
});

const commitment = (id: string, blockId: string | null) => ({ id, blockId });

describe('unslotted', () => {
  const blocks = [block('dsa_deep'), block('spring_1')];

  it('finds a commitment that was never placed', () => {
    expect(unslotted([commitment('a', null)], blocks).map((c) => c.id)).toEqual(['a']);
  });

  it('finds one whose block a re-lay dropped', () => {
    // The bug this exists for: the commitment keeps pointing at `dsa_second`, which is no
    // longer in the day. It counts toward the score and the burn-down in full, so before
    // this it was weight the user could see in the totals and nowhere else.
    expect(unslotted([commitment('a', 'dsa_second')], blocks).map((c) => c.id)).toEqual(['a']);
  });

  it('leaves attached commitments alone', () => {
    expect(unslotted([commitment('a', 'dsa_deep'), commitment('b', 'spring_1')], blocks)).toEqual(
      [],
    );
  });

  it('treats every commitment as unslotted when the day has no layout', () => {
    // After a reset the blocks are gone; nothing should silently vanish from the screen.
    const all = [commitment('a', 'dsa_deep'), commitment('b', null)];
    expect(unslotted(all, []).map((c) => c.id)).toEqual(['a', 'b']);
  });
});
