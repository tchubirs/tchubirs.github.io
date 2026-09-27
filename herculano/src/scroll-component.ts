import { createComponent, Types } from '@iwsdk/core';

/**
 * A carbonised scroll lying on a surface. `unroll` is the length of sheet, in
 * metres, that already lies flat; the rest is still wound in a spiral.
 */
export const Scroll = createComponent('Scroll', {
  unroll: { type: Types.Float32, default: 0, min: 0, label: 'Unrolled (m)' },
  revealed: { type: Types.Float32, default: 0, min: 0, max: 1, label: 'Ink revealed' },
  wordFound: { type: Types.Boolean, default: false, label: 'Target word found' },
  /** Which reading (see readings.ts) the scroll holds; change it to roll up and swap. */
  reading: { type: Types.Int8, default: 0, min: 0, label: 'Reading' },
  /** Centre of the target word on the flat sheet (metres along s, and z). */
  targetS: { type: Types.Float32, default: 0, label: 'Target word s (m)' },
  targetZ: { type: Types.Float32, default: 0, label: 'Target word z (m)' },
  /** Where the last palm touched the sheet (s, z in metres); for tests and tuning. */
  palmS: { type: Types.Float32, default: -1, label: 'Last palm s (m)' },
  palmZ: { type: Types.Float32, default: 0, label: 'Last palm z (m)' },
});

/** Invisible proxy around the rolled part: pinch it and drag to unroll. */
export const RollHandle = createComponent('RollHandle', {});
