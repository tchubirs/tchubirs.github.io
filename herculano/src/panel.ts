import {
  createSystem,
  UIKit,
  UIKitMLAsset,
  VisibilityState,
} from '@iwsdk/core';
import { scrollAudio } from './audio.js';
import { READINGS, readSoFar, type Reading } from './readings.js';
import { Scroll } from './scroll-component.js';

export type Step = 'open' | 'sweep' | 'search' | 'found';

/** What the guide says at each step. Plain ASCII: the panel font is Latin-only. */
export function hintFor(step: Step, r: Reading, readCount: number): string {
  switch (step) {
    case 'open':
      return 'A scroll buried by Vesuvius, burnt to carbon. Pinch it and pull it to the right to open it.';
    case 'sweep':
      return 'The ink is invisible to the eye. Sweep your palm slowly, just above the papyrus.';
    case 'search':
      return `Letters! Keep sweeping until you find the word on the card: ${r.latin}.`;
    case 'found':
      return (
        `${r.latin}: "${r.gloss}", Epicurus. Scroll ${readCount} of ${READINGS.length} read; a new one each day. ` +
        '(Simulated. The first word read in a real scroll, in 2023, was PORPHYRAS: "purple".)'
      );
  }
}

export function stepFor(unroll: number, revealed: number, wordFound: boolean): Step {
  if (wordFound) return 'found';
  if (unroll < 0.05) return 'open';
  if (revealed < 0.01) return 'sweep';
  return 'search';
}

export class PanelSystem extends createSystem({
  scrolls: { required: [Scroll] },
}) {
  private hint: UIKit.Text | null = null;
  private next: UIKit.Container | null = null;
  private shown = ''; // reading and step the hint currently shows

  init(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('welcome-panel');
    const xrButton = panel?.getElementById('xr-button');
    const exitButton = panel?.getElementById('exit-button');
    this.next = (panel?.getElementById('next-button') as UIKit.Container | undefined) ?? null;
    this.hint = (panel?.getElementById('hint') as UIKit.Text | undefined) ?? null;
    if (this.hint) this.hint.name = 'hint';
    if (xrButton == null || exitButton == null) {
      return;
    }
    if (!this.world.xrEnabled) {
      xrButton.setProperties({ display: 'none' });
      exitButton.setProperties({ display: 'none' });
      return;
    }

    const launchXR = () => {
      scrollAudio.unlock(); // inside the click, so the browser allows sound
      this.world.launchXR();
    };
    const exitXR = () => this.world.exitXR();
    const nextScroll = () => {
      for (const scroll of this.queries.scrolls.entities) {
        const i = scroll.getValue(Scroll, 'reading') ?? 0;
        scroll.setValue(Scroll, 'reading', (i + 1) % READINGS.length);
      }
    };
    xrButton.addEventListener('click', launchXR);
    exitButton.addEventListener('click', exitXR);
    this.next?.addEventListener('click', nextScroll);
    this.cleanupFuncs.push(
      () => xrButton.removeEventListener('click', launchXR),
      () => exitButton.removeEventListener('click', exitXR),
      () => this.next?.removeEventListener('click', nextScroll),
      this.world.visibilityState.subscribe((visibilityState) => {
        const is2D = visibilityState === VisibilityState.NonImmersive;
        xrButton.setProperties({ display: is2D ? 'flex' : 'none' });
        exitButton.setProperties({ display: is2D ? 'none' : 'flex' });
      }),
    );
  }

  update(): void {
    if (!this.hint) return;
    for (const scroll of this.queries.scrolls.entities) {
      const i = scroll.getValue(Scroll, 'reading') ?? 0;
      const step = stepFor(
        scroll.getValue(Scroll, 'unroll') ?? 0,
        scroll.getValue(Scroll, 'revealed') ?? 0,
        scroll.getValue(Scroll, 'wordFound') ?? false,
      );
      const key = `${i}:${step}`;
      if (key === this.shown) continue;
      this.shown = key;
      this.hint.setProperties({ text: hintFor(step, READINGS[i], readSoFar().length) });
      this.next?.setProperties({ display: step === 'found' ? 'flex' : 'none' });
    }
  }
}
