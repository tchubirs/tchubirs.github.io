// Records the demo, one frame at a time, in the IWSDK emulator.
//
// The ECS is paused and stepped by exactly 1/FPS per video frame, so the scroll
// behaves the same however slowly the headless browser renders. Poses come from
// a script of eased moves in the scroll's own axes. Frames land in
// video/.frames/<segment>/ with a log of the scroll's state per frame (used to
// time the sound). A managed-browser script may run for 110 s at most, so each
// run records what it can and leaves the ECS paused; the next run resumes from
// progress.json. video/shoot.py enters XR, seats the reader and drives the runs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FPS = 30;
const BUDGET_MS = 95_000; // stop a run before the 110 s lease ends
const PALM = { s: -0.029, z: 0.045 }; // grip (palm) minus wrist, in sheet axes; see tests/e2e.py

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a, b, t) => a + (b - a) * t;

/** Piecewise track: [[time, value], ...] eased between keys; values are arrays. */
function track(keys) {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1] = keys[i];
      const [t0, v0] = keys[i - 1];
      if (t <= t1) {
        const k = ease((t - t0) / (t1 - t0));
        return v0.map((x, j) => lerp(x, v1[j], k));
      }
    }
    return keys[keys.length - 1][1];
  };
}

/** The choreography, in sheet-local metres (s along the scroll, y up, z toward the reader). */
function script(segment, target) {
  const park = { left: [-0.15, 0.25, 0.3], right: [0.95, 0.25, 0.3] };
  const [ts, tz] = target;
  // Palm path for the sweep: two exploring passes, then the row with the word.
  const y = 0.035;
  const sweep = [
    [9.0, [0.05, y, tz - 0.065]],
    [12.2, [0.7, y, tz - 0.065]],
    [12.9, [0.7, y, tz + 0.065]],
    [16.1, [0.05, y, tz + 0.065]],
    [16.8, [0.05, y, tz]],
    [20.0, [ts + 0.12, y, tz]],
  ];
  const vr = segment === 'vr';
  const end = vr ? 13.5 : 31;
  const left = track([
    [0, park.left],
    [7.6, park.left],
    [9.0, sweep[0][1]],
    ...sweep.slice(1),
    [21.5, [ts + 0.16, 0.2, tz + 0.2]],
    [23, park.left],
  ]);
  const right = track([
    [0, park.right],
    [2.5, park.right],
    [4.0, [0, 0.03, 0]],
    [4.3, [0, 0.03, 0]],
    [7.3, [0.78, 0.04, 0]],
    [7.6, [0.78, 0.06, 0.02]],
    [8.6, park.right],
  ]);
  const pinch = (t) => (t >= 4.0 && t < 7.4 ? 1 : 0);
  // Where the reader looks: the scroll, the roll as it opens, then the palm.
  const gaze = (t, palm) => {
    const base = [0.35, 0, 0];
    if (t < 4) return base;
    if (t < 8) return [lerp(0.2, 0.55, ease((t - 4) / 3.3)), 0, 0];
    if (t < 21) return [lerp(0.55, palm[0], 0.55), 0, lerp(0, palm[2], 0.4)];
    return [ts, 0.03, tz];
  };
  return { end, left, right, pinch, gaze, readingChangeAt: vr ? null : 26.5 };
}

export default async function run({ page, frame, cdp, workspaceRoot }) {
  const root = join(workspaceRoot, 'video', '.frames');
  const plan = JSON.parse(readFileSync(join(root, 'plan.json'), 'utf8'));
  const dir = join(root, plan.segment);
  mkdirSync(dir, { recursive: true });
  const session = cdp ?? (await page.context().newCDPSession(page));

  // Hide the managed window's Runtime/Editor switch so it stays out of the shots.
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('button, a, span, div')].find(
      (e) => e.children.length === 0 && e.textContent?.trim() === 'Runtime',
    );
    let n = el;
    while (n && n !== document.body && getComputedStyle(n).position === 'static') n = n.parentElement;
    if (n && n !== document.body) n.style.setProperty('display', 'none', 'important');
  });

  const inPage = (fn, arg) => frame.evaluate(fn, arg);
  const sheet = await inPage(async () => {
    const rt = window.FRAMEWORK_MCP_RUNTIME;
    const [e] = (await rt.dispatch('ecs_find_entities', { withComponents: ['Scroll'] })).entities;
    const comps = (await rt.dispatch('ecs_query_entity', { entityIndex: e.entityIndex })).components;
    const get = (id) => comps.find((c) => c.componentId === id).values;
    return { index: e.entityIndex, t: get('Transform'), s: get('Scroll') };
  });
  const [qx, qy, qz, qw] = sheet.t.orientation;
  const yaw = Math.atan2(2 * (qw * qy + qx * qz), 1 - 2 * (qy * qy + qx * qx));
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const P = sheet.t.position;
  const world = ([lx, ly, lz]) => ({ x: P[0] + c * lx + sn * lz, y: P[1] + ly, z: P[2] - sn * lx + c * lz });
  const wrist = ([s, h, z]) => world([s - PALM.s, h, z - PALM.z]);

  const progressFile = join(dir, 'progress.json');
  const progress = existsSync(progressFile)
    ? JSON.parse(readFileSync(progressFile, 'utf8'))
    : { next: 0, look: null, reading: sheet.s.reading, target: [sheet.s.targetS, sheet.s.targetZ], log: [] };
  const plot = script(plan.segment, progress.target);
  const frames = Math.round(plot.end * FPS);
  const log = progress.log;
  let look = progress.look;
  const started = Date.now();
  let i = progress.next;

  if (i === 0) await inPage(() => window.FRAMEWORK_MCP_RUNTIME.dispatch('ecs_pause', {}));
  try {
    for (; i < frames && Date.now() - started < BUDGET_MS; i++) {
      const t = i / FPS;
      const palm = plot.left(t);
      const g = plot.gaze(t, palm);
      look = look ? look.map((v, j) => lerp(v, g[j], 0.08)) : g; // eyes lag a little
      const sway = [0.006 * Math.sin(t * 0.9), 0.004 * Math.sin(t * 1.3 + 1), 0.005 * Math.sin(t * 0.7 + 2)];
      const state = await inPage(
        async (a) => {
          // The emulator's command interface. Its execute* methods apply at
          // once; dispatch() would wait a rendered frame for each command.
          const xr = window.IWER_DEVICE.remote;
          const rt = window.FRAMEWORK_MCP_RUNTIME;
          xr.activateCaptureMode?.();
          xr.executeSetTransform({ device: 'headset', position: a.head });
          xr.executeLookAt({ device: 'headset', target: a.look });
          xr.executeSetTransform({ device: 'hand-left', position: a.left });
          xr.executeSetTransform({ device: 'hand-right', position: a.right });
          xr.executeSetSelectValue({ device: 'hand-right', value: a.pinch });
          if (a.reading !== null) {
            await rt.dispatch('ecs_set_component', {
              entityIndex: a.index, componentId: 'Scroll', field: 'reading', value: a.reading,
            });
          }
          await rt.dispatch('ecs_step', { count: 1, delta: a.dt });
          const comps = (await rt.dispatch('ecs_query_entity', { entityIndex: a.index })).components;
          return comps.find((x) => x.componentId === 'Scroll').values;
        },
        {
          head: { x: plan.seat.x + sway[0], y: plan.seat.y + sway[1], z: plan.seat.z + sway[2] },
          look: world(look),
          left: wrist(palm),
          right: world(plot.right(t)),
          pinch: plot.pinch(t),
          reading:
            plot.readingChangeAt !== null && Math.abs(t - plot.readingChangeAt) < 0.5 / FPS
              ? (progress.reading + 1) % 5
              : null,
          index: sheet.index,
          dt: 1 / FPS,
        },
      );
      const shot = await session.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
      writeFileSync(join(dir, `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(shot.data, 'base64'));
      const over = palm[1] < 0.1 && palm[0] > 0 && palm[0] < state.unroll && Math.abs(palm[2]) < 0.11;
      log.push({ t, unroll: state.unroll, revealed: state.revealed, found: state.wordFound, scan: over ? 1 : 0 });
    }
  } finally {
    writeFileSync(progressFile, JSON.stringify({ ...progress, next: i, look, log }));
  }
  if (i < frames) return { segment: plan.segment, next: i, frames };
  await inPage(() => window.FRAMEWORK_MCP_RUNTIME.dispatch('ecs_resume', {}));
  writeFileSync(join(dir, 'log.json'), JSON.stringify({ fps: FPS, target: progress.target, log }));
  return { segment: plan.segment, next: i, frames, found: log.findIndex((l) => l.found) / FPS };
}
