// Screencast the managed app for SECONDS into FRAMES_DIR (JPEG frames + timestamps).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SECONDS = 3;
export const FRAMES_DIR = '/tmp/claude-0/-home-user-tchubirs-github-io/18a9ebb2-8c09-5b5c-bf44-08a5fb1b239c/scratchpad/frames';

export default async function run({ page, cdp }) {
  mkdirSync(FRAMES_DIR, { recursive: true });
  const session = cdp ?? (await page.context().newCDPSession(page));
  const stamps = [];
  session.on('Page.screencastFrame', async (f) => {
    writeFileSync(join(FRAMES_DIR, `f${String(stamps.length).padStart(5, '0')}.jpg`), Buffer.from(f.data, 'base64'));
    stamps.push(f.metadata.timestamp);
    await session.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await session.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1280, maxHeight: 800 });
  await new Promise((r) => setTimeout(r, SECONDS * 1000));
  await session.send('Page.stopScreencast');
  writeFileSync(join(FRAMES_DIR, 'stamps.json'), JSON.stringify(stamps));
  return { frames: stamps.length, fps: stamps.length / SECONDS };
}
