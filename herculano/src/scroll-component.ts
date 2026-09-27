import { createComponent, Types } from '@iwsdk/core';

/**
 * A carbonised scroll lying on a surface. `unroll` is the length of sheet, in
 * metres, that already lies flat; the rest is still wound in a spiral.
 */
export const Scroll = createComponent('Scroll', {
  unroll: { type: Types.Float32, default: 0, min: 0, label: 'Unrolled (m)' },
  revealed: { type: Types.Float32, default: 0, min: 0, max: 1, label: 'Ink revealed' },
  wordFound: { type: Types.Boolean, default: false, label: 'Target word found' },
});

/** Invisible proxy around the rolled part: pinch it and drag to unroll. */
export const RollHandle = createComponent('RollHandle', {});
