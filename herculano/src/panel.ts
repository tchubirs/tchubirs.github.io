import {
  createSystem,
  UIKit,
  UIKitMLAsset,
  VisibilityState,
} from '@iwsdk/core';
import { scrollAudio } from './audio.js';
import { Scroll } from './scroll-component.js';

/** What the guide says at each step. Plain ASCII: the panel font is Latin-only. */
export const HINTS = {
  open: 'A scroll buried by Vesuvius, burnt to carbon. Pinch it and pull it to the right to open it.',
  sweep: 'The ink is invisible to the eye. Sweep your palm slowly, just above the papyrus.',
  search: 'Letters! Keep sweeping and find the word HEDONON.',
  found:
    'HEDONON: "of pleasures". Epicurus, Principal Doctrines III. ' +
    'This scroll is simulated; in 2023 the first word read inside a real one was PORPHYRAS, "purple".',
} as const;

export type Step = keyof typeof HINTS;

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
  private step: Step | null = null;

  init(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('welcome-panel');
    const xrButton = panel?.getElementById('xr-button');
    const exitButton = panel?.getElementById('exit-button');
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
    xrButton.addEventListener('click', launchXR);
    exitButton.addEventListener('click', exitXR);
    this.cleanupFuncs.push(
      () => xrButton.removeEventListener('click', launchXR),
      () => exitButton.removeEventListener('click', exitXR),
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
      const step = stepFor(
        scroll.getValue(Scroll, 'unroll') ?? 0,
        scroll.getValue(Scroll, 'revealed') ?? 0,
        scroll.getValue(Scroll, 'wordFound') ?? false,
      );
      if (step !== this.step) {
        this.step = step;
        this.hint.setProperties({ text: HINTS[step] });
      }
    }
  }
}
