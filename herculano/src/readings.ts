/**
 * Epicurus, Principal Doctrines I-V (Usener, Epicurea, 1887 - public domain).
 * Every scroll carries these five; each reading hides a different word in them.
 */
export const DOCTRINES = [
  'Τὸ μακάριον καὶ ἄφθαρτον οὔτε αὐτὸ πράγματα ἔχει οὔτε ἄλλῳ παρέχει ὥστε οὔτε ὀργαῖς οὔτε χάρισι συνέχεται ἐν ἀσθενεῖ γὰρ πᾶν τὸ τοιοῦτον',
  'Ὁ θάνατος οὐδὲν πρὸς ἡμᾶς τὸ γὰρ διαλυθὲν ἀναισθητεῖ τὸ δ ἀναισθητοῦν οὐδὲν πρὸς ἡμᾶς',
  'Ὅρος τοῦ μεγέθους τῶν ἡδονῶν ἡ παντὸς τοῦ ἀλγοῦντος ὑπεξαίρεσις ὅπου δ ἂν τὸ ἡδόμενον ἐνῇ καθ ὃν ἂν χρόνον ᾖ οὐκ ἔστι τὸ ἀλγοῦν ἢ λυπούμενον ἢ τὸ συναμφότερον',
  'Οὐ χρονίζει τὸ ἀλγοῦν συνεχῶς ἐν τῇ σαρκί ἀλλὰ τὸ μὲν ἄκρον τὸν ἐλάχιστον χρόνον πάρεστι τὸ δὲ μόνον ὑπερτεῖνον τὸ ἡδόμενον κατὰ σάρκα οὐ πολλὰς ἡμέρας συμμένει',
  'Οὐκ ἔστιν ἡδέως ζῆν ἄνευ τοῦ φρονίμως καὶ καλῶς καὶ δικαίως οὐδὲ φρονίμως καὶ καλῶς καὶ δικαίως ἄνευ τοῦ ἡδέως',
];

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

export interface Reading {
  /** The word as the scribe wrote it: capitals, no accents. */
  word: string;
  /** The word as printed in the edition. */
  greek: string;
  /** Plain ASCII name, for the guide panel's Latin-only font. */
  latin: string;
  gloss: string;
  /** Index into DOCTRINES of the doctrine that contains the word (once). */
  doctrine: number;
  /** How many doctrines come before it on this scroll, so words land in different columns. */
  lead: number;
}

export const READINGS: Reading[] = [
  { word: 'ΗΔΟΝΩΝ', greek: 'ἡδονῶν', latin: 'HEDONON', gloss: 'of pleasures', doctrine: 2, lead: 2 },
  { word: 'ΘΑΝΑΤΟΣ', greek: 'θάνατος', latin: 'THANATOS', gloss: 'death', doctrine: 1, lead: 3 },
  { word: 'ΖΗΝ', greek: 'ζῆν', latin: 'ZEN', gloss: 'to live', doctrine: 4, lead: 4 },
  { word: 'ΑΦΘΑΡΤΟΝ', greek: 'ἄφθαρτον', latin: 'APHTHARTON', gloss: 'imperishable', doctrine: 0, lead: 1 },
  { word: 'ΣΑΡΚΙ', greek: 'σαρκί', latin: 'SARKI', gloss: 'in the flesh', doctrine: 3, lead: 4 },
];

export function sourceOf(r: Reading): string {
  return `Epicurus, Principal Doctrines ${ROMAN[r.doctrine]}`;
}

/** A new scroll each day, the same one all day. */
export function todaysReading(now = Date.now()): number {
  return Math.floor(now / 86_400_000) % READINGS.length;
}

const KEY = 'herculano.read';

/** Which readings this browser has finished. Storage can be missing or blocked. */
export function readSoFar(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((i) => Number.isInteger(i)) : [];
  } catch {
    return [];
  }
}

export function markRead(i: number): number[] {
  const done = readSoFar();
  if (!done.includes(i)) done.push(i);
  try {
    localStorage.setItem(KEY, JSON.stringify(done));
  } catch {
    // Private browsing: progress lasts for this visit only.
  }
  return done;
}
