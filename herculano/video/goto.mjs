// Reload the app frame for the planned segment: `?vr` for the no-passthrough path.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async function run({ frame, workspaceRoot }) {
  const plan = JSON.parse(readFileSync(join(workspaceRoot, 'video', '.frames', 'plan.json'), 'utf8'));
  const query = plan.segment === 'vr' ? '?vr' : '';
  await frame.evaluate((q) => { location.search = q; }, query).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));
  return { query };
}
