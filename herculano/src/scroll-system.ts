import {
  createSystem,
  Grabbed,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  CylinderGeometry,
  OneHandGrabbable,
  Vector3,
  VisibilityState,
  type Entity,
} from '@iwsdk/core';
import { RollHandle, Scroll } from './scroll-component.js';
import {
  createRevealTexture,
  createSheetGeometry,
  createSheetMaterial,
  SHEET,
  turnRadius,
  type SheetMaterial,
} from './scroll-geometry.js';
import { createInk } from './ink.js';

/** Where the outer end of the sheet rests, in world space (table height). */
const SHEET_ORIGIN = new Vector3(-0.35, 0.74, -0.5);
const MASK_W = 512;
const MASK_H = 96;
const PALM_RADIUS = 0.035; // metres of sheet revealed around a palm
const PALM_REACH = 0.1; // palm must be within this height above the sheet

export class ScrollSystem extends createSystem({
  scrolls: { required: [Scroll] },
  handles: { required: [RollHandle] },
  heldHandles: { required: [RollHandle, Grabbed] },
}) {
  private sheet!: Entity;
  private handle!: Entity;
  private material!: SheetMaterial;
  private mask!: Uint8Array;
  private target!: [number, number, number, number];
  private targetTexels = 0;
  private targetSeen = 0;
  private toLocal = new Matrix4();
  private p = new Vector3();

  init(): void {
    const ink = createInk();
    this.target = ink.target;
    const reveal = createRevealTexture(MASK_W, MASK_H);
    this.mask = reveal.image.data as Uint8Array;
    this.material = createSheetMaterial(ink.texture, reveal);

    const sheetMesh = new Mesh(createSheetGeometry(), this.material);
    sheetMesh.name = 'Sheet';
    sheetMesh.frustumCulled = false;
    this.sheet = this.world.createTransformEntity(sheetMesh);
    this.sheet.object3D!.position.copy(SHEET_ORIGIN);
    this.sheet.addComponent(Scroll, { unroll: 0, revealed: 0, wordFound: false });

    const rollR = turnRadius(0);
    const proxy = new Mesh(
      new CylinderGeometry(rollR * 1.8, rollR * 1.8, SHEET.height, 16),
      new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    proxy.name = 'RollHandle';
    proxy.rotation.x = Math.PI / 2; // cylinder axis along the roll axis (z)
    this.handle = this.world.createTransformEntity(proxy);
    this.handle.addComponent(OneHandGrabbable, { translate: true, rotate: false });
    this.handle.addComponent(RollHandle);
    this.placeHandle(0);

    const [u0, v0, u1, v1] = this.target;
    this.targetTexels = Math.max(1, Math.round((u1 - u0) * MASK_W) * Math.round((v1 - v0) * MASK_H));
  }

  /** Put the grab proxy on the axis of whatever is still rolled. */
  private placeHandle(unroll: number): void {
    const obj = this.sheet.object3D!;
    this.p.set(unroll, turnRadius(unroll), 0);
    obj.localToWorld(this.p);
    this.handle.object3D!.position.copy(this.p);
  }

  update(): void {
    const obj = this.sheet.object3D!;
    obj.updateWorldMatrix(true, false);
    this.toLocal.copy(obj.matrixWorld).invert();

    let unroll = this.sheet.getValue(Scroll, 'unroll') ?? 0;
    if (this.queries.heldHandles.entities.size > 0) {
      this.handle.object3D!.getWorldPosition(this.p);
      this.p.applyMatrix4(this.toLocal);
      unroll = Math.min(SHEET.length, Math.max(unroll, this.p.x));
      this.sheet.setValue(Scroll, 'unroll', unroll);
    } else {
      this.placeHandle(unroll);
    }
    this.material.uniforms.uUnroll.value = unroll;
    this.material.uniforms.uRollR.value = turnRadius(unroll);

    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) return;
    let changed = false;
    for (const grip of [this.player.gripSpaces.left, this.player.gripSpaces.right]) {
      grip.getWorldPosition(this.p);
      this.p.applyMatrix4(this.toLocal);
      if (this.p.y < 0 || this.p.y > PALM_REACH) continue;
      if (this.p.x < 0 || this.p.x > unroll || Math.abs(this.p.z) > SHEET.height / 2) continue;
      changed = this.stamp(this.p.x / SHEET.length, 1 - (this.p.z / SHEET.height + 0.5)) || changed;
    }
    if (changed) {
      this.material.uniforms.uReveal.value.needsUpdate = true;
      const found = this.targetSeen / this.targetTexels > 0.6;
      if (found && !this.sheet.getValue(Scroll, 'wordFound')) {
        this.sheet.setValue(Scroll, 'wordFound', true);
      }
    }
  }

  /** Mark a disc of the reveal mask; returns whether any texel changed. */
  private stamp(u: number, v: number): boolean {
    const rx = Math.ceil((PALM_RADIUS / SHEET.length) * MASK_W);
    const ry = Math.ceil((PALM_RADIUS / SHEET.height) * MASK_H);
    const cx = Math.round(u * MASK_W);
    const cy = Math.round(v * MASK_H);
    const [u0, v0, u1, v1] = this.target;
    let changed = false;
    let revealedAll = this.sheet.getValue(Scroll, 'revealed') ?? 0;
    for (let y = Math.max(0, cy - ry); y <= Math.min(MASK_H - 1, cy + ry); y++) {
      for (let x = Math.max(0, cx - rx); x <= Math.min(MASK_W - 1, cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy > 1) continue;
        const k = y * MASK_W + x;
        if (this.mask[k] === 255) continue;
        this.mask[k] = 255;
        changed = true;
        revealedAll += 1 / (MASK_W * MASK_H);
        const tu = x / MASK_W;
        const tv = y / MASK_H;
        if (tu >= u0 && tu <= u1 && tv >= v0 && tv <= v1) this.targetSeen++;
      }
    }
    if (changed) this.sheet.setValue(Scroll, 'revealed', Math.min(1, revealedAll));
    return changed;
  }
}
