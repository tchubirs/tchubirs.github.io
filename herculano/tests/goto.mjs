// Reload the app frame with a query string; `?vr` forces the no-passthrough path.
export const QUERY = '?vr';
export default async function run({ frame }) {
  const before = frame.url();
  await frame.evaluate((q) => { location.search = q; }, QUERY).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));
  return { before };
}
