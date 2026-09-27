import {
  createSystem,
  Grabbed,
  GrabSystem,
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
import { scrollAudio } from './audio.js';
import { createWantedCard, createWordLabel, disposeCard } from './word-label.js';
import { markRead, READINGS, todaysReading } from './readings.js';

/** Where the outer end of the sheet rests, in world space (table height). */
const SHEET_ORIGIN = new Vector3(-0.35, 0.74, -0.5);
const MASK_W = 512;
const MASK_H = 96;
const PALM_RADIUS = 0.035; // metres of sheet revealed around a palm
const PALM_REACH = 0.1; // palm must be within this height above the sheet
const MAX_STEP = 0.15; // a palm moving further than this in one frame jumped

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
  /** Last palm position on the sheet per hand, in (s, z); NaN when off it. */
  private last = [new Vector3(NaN, 0, 0), new Vector3(NaN, 0, 0)];
  private light = [0, 0]; // smoothed scanner strength per hand
  private label!: Mesh;
  private head = new Vector3();
  private foundFor = -1; // seconds since the word was found; -1 before
  private prevUnroll = 0;
  private sheetMesh!: Mesh;
  private card!: Mesh;
  private loaded = -1; // reading whose ink is on the sheet

  init(): void {
    const first = todaysReading();
    const ink = createInk(READINGS[first]);
    const reveal = createRevealTexture(MASK_W, MASK_H);
    this.mask = reveal.image.data as Uint8Array;
    this.material = createSheetMaterial(ink.texture, reveal);
    this.material.uniforms.uPalmR.value = PALM_RADIUS;

    this.sheetMesh = new Mesh(createSheetGeometry(), this.material);
    this.sheetMesh.name = 'Sheet';
    this.sheetMesh.frustumCulled = false;
    this.sheet = this.world.createTransformEntity(this.sheetMesh);
    this.sheet.object3D!.position.copy(SHEET_ORIGIN);
    this.sheet.addComponent(Scroll, { reading: first });

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
    this.applyReading(first, ink);
  }

  /** Ink a reading onto the (rolled) sheet and forget everything about the last one. */
  private applyReading(i: number, ink = createInk(READINGS[i])): void {
    const u = this.material.uniforms;
    if (u.uInk.value !== ink.texture) u.uInk.value.dispose();
    u.uInk.value = ink.texture;
    this.target = ink.target;
    u.uTarget.value.set(...ink.target);
    u.uFound.value = 0;
    this.mask.fill(0);
    u.uReveal.value.needsUpdate = true;
    const [u0, v0, u1, v1] = ink.target;
    this.targetTexels = Math.max(1, Math.round((u1 - u0) * MASK_W) * Math.round((v1 - v0) * MASK_H));
    this.targetSeen = 0;
    this.foundFor = -1;
    const targetS = ((u0 + u1) / 2) * SHEET.length;
    // v runs up the canvas; the canvas top is the far edge (-z).
    const targetZ = (0.5 - (v0 + v1) / 2) * SHEET.height;
    this.sheet.setValue(Scroll, 'targetS', targetS);
    this.sheet.setValue(Scroll, 'targetZ', targetZ);
    this.sheet.setValue(Scroll, 'revealed', 0);
    this.sheet.setValue(Scroll, 'wordFound', false);

    if (this.label) disposeCard(this.label);
    this.label = createWordLabel(READINGS[i]);
    this.label.position.set(targetS, 0.075, targetZ);
    this.sheetMesh.add(this.label);
    if (this.card) disposeCard(this.card);
    this.card = createWantedCard(READINGS[i]);
    // Left of the scroll's outer end, tilted up toward the reader.
    this.card.position.set(-0.12, 0.02, 0);
    this.card.rotation.set(-Math.PI / 3, 0, 0);
    this.sheetMesh.add(this.card);
    this.loaded = i;
  }

  /** Put the grab proxy on the axis of whatever is still rolled. */
  private placeHandle(unroll: number): void {
    const obj = this.sheet.object3D!;
    this.p.set(unroll, turnRadius(unroll), 0);
    obj.localToWorld(this.p);
    this.handle.object3D!.position.copy(this.p);
  }

  update(delta: number, time: number): void {
    const obj = this.sheet.object3D!;
    obj.updateWorldMatrix(true, false);
    this.toLocal.copy(obj.matrixWorld).invert();

    let unroll = this.sheet.getValue(Scroll, 'unroll') ?? 0;
    const wanted = this.sheet.getValue(Scroll, 'reading') ?? 0;
    if (wanted !== this.loaded && READINGS[wanted]) {
      // Roll the finished scroll back up, then swap in the next one.
      this.label.visible = false;
      unroll = Math.max(0, unroll - delta * 1.2);
      this.sheet.setValue(Scroll, 'unroll', unroll);
      this.placeHandle(unroll);
      if (unroll === 0) this.applyReading(wanted);
    } else if (this.queries.heldHandles.entities.size > 0) {
      this.handle.object3D!.getWorldPosition(this.p);
      this.p.applyMatrix4(this.toLocal);
      unroll = Math.min(SHEET.length, Math.max(unroll, this.p.x));
      this.sheet.setValue(Scroll, 'unroll', unroll);
    } else {
      this.placeHandle(unroll);
    }
    this.material.uniforms.uUnroll.value = unroll;
    this.material.uniforms.uRollR.value = turnRadius(unroll);
    this.material.uniforms.uTime.value = time;
    scrollAudio.unroll(delta > 0 ? (unroll - this.prevUnroll) / delta : 0);
    this.prevUnroll = unroll;

    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) return;
    let changed = false;
    const grips = [this.player.gripSpaces.left, this.player.gripSpaces.right];
    const holder = this.world.getSystem(GrabSystem)?.getHolderHand(this.handle) ?? null;
    for (let h = 0; h < 2; h++) {
      const last = this.last[h];
      // The hand pulling the roll open is not sweeping for ink.
      if (holder === (h === 0 ? 'left' : 'right')) {
        last.x = NaN;
        this.fadeLight(h, 0, delta);
        continue;
      }
      grips[h].getWorldPosition(this.p);
      this.p.applyMatrix4(this.toLocal);
      const over =
        this.p.y >= 0 && this.p.y <= PALM_REACH &&
        this.p.x >= 0 && this.p.x <= unroll &&
        Math.abs(this.p.z) <= SHEET.height / 2;
      if (!over) {
        last.x = NaN;
        this.fadeLight(h, 0, delta);
        continue;
      }
      // Closer to the papyrus, brighter the scan.
      this.fadeLight(h, 1 - 0.6 * (this.p.y / PALM_REACH), delta);
      this.material.uniforms.uPalms.value[h].setX(this.p.x).setY(this.p.z);
      // Stamp along the path since the last frame so a fast sweep leaves a
      // continuous trail rather than a row of separate spots.
      // A jump (tracking lost and regained) starts a new trail instead.
      let fromX = Number.isNaN(last.x) ? this.p.x : last.x;
      let fromZ = Number.isNaN(last.x) ? this.p.z : last.z;
      let dist = Math.hypot(this.p.x - fromX, this.p.z - fromZ);
      if (dist > MAX_STEP) {
        fromX = this.p.x;
        fromZ = this.p.z;
        dist = 0;
      }
      const steps = Math.max(1, Math.ceil(dist / (PALM_RADIUS * 0.5)));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = fromX + (this.p.x - fromX) * t;
        const z = fromZ + (this.p.z - fromZ) * t;
        changed = this.stamp(x / SHEET.length, 1 - (z / SHEET.height + 0.5)) || changed;
      }
      last.set(this.p.x, 0, this.p.z);
      this.sheet.setValue(Scroll, 'palmS', this.p.x);
      this.sheet.setValue(Scroll, 'palmZ', this.p.z);
    }
    if (changed) {
      this.material.uniforms.uReveal.value.needsUpdate = true;
      const found = this.targetSeen / this.targetTexels > 0.6;
      if (found && !this.sheet.getValue(Scroll, 'wordFound')) {
        this.sheet.setValue(Scroll, 'wordFound', true);
        this.foundFor = 0;
        this.label.visible = true;
        markRead(this.loaded);
        scrollAudio.chime();
      }
    }
    scrollAudio.scan(Math.max(this.light[0], this.light[1]), changed);
    if (this.foundFor >= 0) this.showFound(delta);
  }

  private fadeLight(h: number, target: number, delta: number): void {
    this.light[h] += (target - this.light[h]) * Math.min(1, delta * 12);
    this.material.uniforms.uPalms.value[h].setZ(this.light[h]);
  }

  /** The word breathes and its gloss rises to face the reader. */
  private showFound(delta: number): void {
    this.foundFor += delta;
    const k = Math.min(1, this.foundFor / 0.8);
    const ease = 1 - (1 - k) ** 3;
    this.material.uniforms.uFound.value = ease;
    const m = this.label.material as MeshBasicMaterial;
    m.opacity = ease;
    this.label.scale.setScalar(0.6 + 0.4 * ease);
    this.label.position.y = 0.045 + 0.03 * ease;
    this.player.head.getWorldPosition(this.head);
    this.label.lookAt(this.head);
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
