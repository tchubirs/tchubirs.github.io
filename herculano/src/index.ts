import { SessionMode, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { DeskSystem } from './desk-system.js';
import { PanelSystem } from './panel.js';
import { ScrollSystem } from './scroll-system.js';

// Headsets without passthrough (or ?vr in the address) get VR and a virtual desk.
async function sessionMode(): Promise<SessionMode> {
  if (new URLSearchParams(location.search).has('vr')) return SessionMode.ImmersiveVR;
  const ar = await navigator.xr?.isSessionSupported(SessionMode.ImmersiveAR).catch(() => false);
  return ar ? SessionMode.ImmersiveAR : SessionMode.ImmersiveVR;
}

sessionMode().then((mode) => {
  const options = projectOptions.xr
    ? { ...projectOptions, xr: { ...projectOptions.xr, sessionMode: mode } }
    : projectOptions;
  return World.create(document.getElementById('scene-container') as HTMLDivElement, options);
}).then((world) => {
  world.registerSystem(DeskSystem);
  world.registerSystem(ScrollSystem);
  world.registerSystem(PanelSystem);
});
