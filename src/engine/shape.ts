/**
 * The shape of a day's commitments — one big, two medium, three small.
 *
 * A list of twelve things is not a plan, it is a wish, and the app already knows enough
 * to say so: every commitment carries planned minutes, so its size is a fact rather than
 * a judgement. This groups them and compares the result to the shape the user says they
 * want.
 *
 * Deliberately a *lens over commitments* rather than a second, separate to-do list.
 * Commitments are the unit Cadence scores — a parallel list would be work the day never
 * counts, and the two would disagree within a week.
 *
 * Pure. No clock, no I/O.
 */

export type Size = 'big' | 'medium' | 'small';

export interface SizeThresholds {
  /** At or above this many planned minutes, a commitment is big. */
  bigMinutes: number;
  /** At or above this, medium. Below it, small. */
  mediumMinutes: number;
}

export interface ShapeTarget {
  big: number;
  medium: number;
  small: number;
}

export interface DayShape {
  big: number;
  medium: number;
  small: number;
  /** Total planned minutes across the commitments counted. */
  minutes: number;
}

export interface ShapeVerdict {
  shape: DayShape;
  target: ShapeTarget;
  /** Signed difference per size: positive is more than the shape asks for. */
  over: ShapeTarget;
  matches: boolean;
  /** One sentence, or null when the shape is met and there is nothing to say. */
  note: string | null;
}

/**
 * The size a commitment starts at, from what it is worth.
 *
 * A first guess only. How big a piece of work *feels* is not a function of its minutes:
 * ninety minutes of reading and ninety minutes of a hard new pattern are not the same
 * kind of day, and the user is a better judge of that than the clock. `sizeFor` is what
 * everything else reads.
 */
export function suggestedSize(plannedMinutes: number, thresholds: SizeThresholds): Size {
  if (plannedMinutes >= thresholds.bigMinutes) return 'big';
  if (plannedMinutes >= thresholds.mediumMinutes) return 'medium';
  return 'small';
}

/** What something carries: a chosen size, or the guess from its minutes. */
export interface Sized {
  plannedMinutes: number;
  /** Set once the user has said. Absent means "whatever the minutes suggest". */
  size?: Size | null;
}

/** The size in force — the choice if there is one, otherwise the suggestion. */
export function sizeFor(item: Sized, thresholds: SizeThresholds): Size {
  return item.size ?? suggestedSize(item.plannedMinutes, thresholds);
}

/** Count a set of commitments into big, medium and small. */
export function dayShape(commitments: Sized[], thresholds: SizeThresholds): DayShape {
  const shape: DayShape = { big: 0, medium: 0, small: 0, minutes: 0 };

  for (const commitment of commitments) {
    shape[sizeFor(commitment, thresholds)] += 1;
    shape.minutes += commitment.plannedMinutes;
  }

  return shape;
}

/**
 * How the shape compares to the one asked for.
 *
 * The note names the single worst departure rather than listing all three. Three
 * criticisms at once is a paragraph nobody acts on; one is a decision.
 *
 * Having fewer small items than the shape suggests is not worth mentioning — the shape
 * is a ceiling on ambition, not a quota to fill.
 */
export function shapeVerdict(shape: DayShape, target: ShapeTarget): ShapeVerdict {
  const over: ShapeTarget = {
    big: shape.big - target.big,
    medium: shape.medium - target.medium,
    small: shape.small - target.small,
  };

  const matches = over.big <= 0 && over.medium <= 0 && over.small <= 0;
  const empty = shape.big + shape.medium + shape.small === 0;

  let note: string | null = null;

  if (empty) {
    note = 'Nothing committed to yet.';
  } else if (over.big > 0) {
    note =
      over.big === 1
        ? `One big thing too many. Two deep pieces of work in a day usually means neither lands.`
        : `${shape.big} big things against a shape of ${target.big}. Something here is going to be the one that slips.`;
  } else if (over.medium > 0) {
    note = `${shape.medium} medium against a shape of ${target.medium}.`;
  } else if (over.small > 0) {
    note = `${shape.small} small against a shape of ${target.small}. Small things are cheap individually and expensive together.`;
  } else if (shape.big === 0 && target.big > 0) {
    // Not a failure, but worth naming: a day of errands has no centre.
    note = 'Nothing big. A day with no anchor tends to read as busy rather than done.';
  }

  return { shape, target, over, matches, note };
}
