import {
  BoxGeometry,
  createSystem,
  type Entity,
  Grabbed,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  ScreenSpace,
  Vector3,
  VisibilityState,
  XRPlane,
} from '@iwsdk/core';
import { RollHandle, Scroll } from './scroll-component.js';

const REACH = 0.42; // the middle of the scroll lies this far in front of the eyes
const LEFT = 0.4; // the outer end starts this far left of that middle
const MARGIN = 0.13; // keep the middle this far inside a table's edges
const NO_TABLE_DROP = 0.45; // with no table, lay the scroll this far below the eyes
const MOVE_AGAIN = 0.35; // while untouched, follow the reader if they move this far
const WAIT_FOR_TABLE = 1.5; // seconds to wait for a table before giving up on one

/** The subset of the WebXR plane this system reads. */
interface Plane {
  orientation?: string;
  polygon: ReadonlyArray<DOMPointReadOnly>;
  semanticLabel?: string;
}

/**
 * Lays the scroll on the reader's real table, square to where they are
 * looking, and hangs the guide just behind it. Keeps doing so while the
 * scroll is untouched, then leaves it alone.
 */
export class DeskSystem extends createSystem({
  scrolls: { required: [Scroll] },
  planes: { required: [XRPlane] },
  panels: { required: [ScreenSpace] },
  held: { required: [RollHandle, Grabbed] },
}) {
  private locked = false;
  private onTable = false;
  private waited = 0;
  private placedFrom = new Vector3(NaN, NaN, NaN);
  private head = new Vector3();
  private fwd = new Vector3();
  private right = new Vector3();
  private want = new Vector3();
  private p = new Vector3();
  private spot = new Vector3();
  private q = new Quaternion();
  private inv = new Matrix4();
  private desk!: Entity;

  init(): void {
    // A plain wooden desk for when the room has no table (or no passthrough).
    const wood = new MeshStandardMaterial({ color: 0x3a2819, roughness: 0.85 });
    const top = new Mesh(new BoxGeometry(1.5, 0.035, 0.62), wood);
    top.name = 'VirtualDesk';
    for (const [x, z] of [[-0.7, -0.26], [0.7, -0.26], [-0.7, 0.26], [0.7, 0.26]]) {
      const leg = new Mesh(new BoxGeometry(0.05, 1, 0.05), wood);
      leg.name = 'Leg';
      leg.position.set(x, -0.5, z); // scaled to reach the floor when placed
      top.add(leg);
    }
    this.desk = this.world.createTransformEntity(top);
    top.visible = false;
  }

  update(delta: number): void {
    if (this.locked) return;
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
      this.waited = 0;
      return;
    }
    let sheet = null;
    for (const e of this.queries.scrolls.entities) sheet = e;
    if (!sheet) return;
    if ((sheet.getValue(Scroll, 'unroll') ?? 0) > 0.01 || this.queries.held.entities.size > 0) {
      this.locked = true;
      return;
    }
    this.waited += delta;

    const headObj = this.player.head;
    headObj.getWorldPosition(this.head);
    headObj.getWorldQuaternion(this.q);
    this.fwd.set(0, 0, -1).applyQuaternion(this.q).setY(0);
    if (this.fwd.lengthSq() < 1e-4) return; // looking straight down: keep the last pose
    this.fwd.normalize();
    this.right.set(-this.fwd.z, 0, this.fwd.x);
    this.want.copy(this.head).addScaledVector(this.fwd, REACH);

    const table = this.findTable();
    const moved = !(this.placedFrom.distanceTo(this.head) < MOVE_AGAIN);
    if (!(moved || (table && !this.onTable))) return;
    if (!table && this.waited < WAIT_FOR_TABLE) return;

    if (table) {
      this.spot.copy(this.p);
    } else {
      this.spot.copy(this.want).setY(this.head.y - NO_TABLE_DROP);
    }
    this.onTable = table;
    this.placedFrom.copy(this.head);
    // In VR the real table is invisible, so draw one where it is.
    const opaque = this.world.session?.environmentBlendMode === 'opaque';
    this.showDesk(!table || opaque, Math.atan2(-this.fwd.x, -this.fwd.z));

    const yaw = Math.atan2(-this.fwd.x, -this.fwd.z);
    const obj = sheet.object3D!;
    obj.position.copy(this.spot).addScaledVector(this.right, -LEFT);
    obj.position.y += 0.002;
    obj.rotation.set(0, yaw, 0);
    for (const panel of this.queries.panels.entities) {
      const po = panel.object3D!;
      // Just beyond the scroll, a little above it, turned to face the reader.
      po.position.copy(this.spot).addScaledVector(this.fwd, 0.36);
      po.position.y += 0.26;
      po.lookAt(this.head);
    }
    console.info(
      `[desk] scroll laid ${table ? 'on a table' : 'in front of the reader (no table found)'} at`,
      this.spot.x.toFixed(2), this.spot.y.toFixed(2), this.spot.z.toFixed(2),
    );
  }

  /** Show the virtual desk under the scroll, legs down to the floor (y = 0). */
  private showDesk(show: boolean, yaw: number): void {
    const top = this.desk.object3D!;
    top.visible = show;
    if (!show) return;
    top.position.copy(this.spot);
    top.position.y -= 0.0175;
    top.rotation.set(0, yaw, 0);
    const h = Math.max(0.05, top.position.y);
    for (const leg of top.children) {
      leg.scale.y = h;
      leg.position.y = -h / 2;
    }
  }

  /**
   * Finds the table spot closest to where the scroll would naturally lie.
   * Leaves it in `this.p` and returns whether there was one.
   */
  private findTable(): boolean {
    let best = Infinity;
    for (const e of this.queries.planes.entities) {
      const plane = e.getValue(XRPlane, '_plane') as Plane | undefined;
      const obj = e.object3D;
      if (!plane || !obj || plane.orientation !== 'horizontal') continue;
      obj.updateWorldMatrix(true, false);
      this.spot.setFromMatrixPosition(obj.matrixWorld);
      const below = this.head.y - this.spot.y;
      if (below < 0.2 || below > 1.05) continue; // floors, ceilings, shelves
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const v of plane.polygon) {
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        minZ = Math.min(minZ, v.z);
        maxZ = Math.max(maxZ, v.z);
      }
      if (maxX - minX < 2 * MARGIN || maxZ - minZ < 2 * MARGIN) continue;
      this.inv.copy(obj.matrixWorld).invert();
      this.spot.copy(this.want).applyMatrix4(this.inv);
      this.spot.set(
        Math.min(maxX - MARGIN, Math.max(minX + MARGIN, this.spot.x)),
        0,
        Math.min(maxZ - MARGIN, Math.max(minZ + MARGIN, this.spot.z)),
      ).applyMatrix4(obj.matrixWorld);
      const label = plane.semanticLabel ?? '';
      const score =
        Math.hypot(this.spot.x - this.want.x, this.spot.z - this.want.z) +
        (label === 'table' || label === 'desk' ? 0 : 0.3);
      if (score < best && score < 1.2) {
        best = score;
        this.p.copy(this.spot);
      }
    }
    return best < Infinity;
  }
}
