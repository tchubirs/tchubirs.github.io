import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { DeskSystem } from './desk-system.js';
import { PanelSystem } from './panel.js';
import { ScrollSystem } from './scroll-system.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(DeskSystem);
  world.registerSystem(ScrollSystem);
  world.registerSystem(PanelSystem);
});
