// Runs Google Apps Script code on a spreadsheet held in memory. run_gas.py writes the job (the sheets as
// JSON, what to run) and reads the result: the cells that changed, the log, the emails that would go out,
// the messages shown, the triggers created and every place the script reached a service this test lacks.
//
// Usage: node gas_sandbox.js job.json result.json Code.gs [more.gs]
//
// SpreadsheetApp follows Google's own behaviour where scripts depend on it: getValues gives "" for empty
// cells and Date objects for dates, setValues with the wrong size fails with Google's message, a new sheet
// has 1000 rows and 26 columns, setValue("=...") writes a formula. Formulas are not calculated here
// (getValue on one gives the value the file had, or "" for a new one); run_gas.py has LibreOffice
// recalculate the result. Dates are wall-clock times, read and formatted as UTC.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const crypto = require("crypto");

const [jobPath, resultPath, ...files] = process.argv.slice(2);
const job = JSON.parse(fs.readFileSync(jobPath, "utf8"));
const result = {status: "ok", log: [], emails: [], ui: [], menus: [], triggers: [], fetched: [], missing: [],
                notApplied: [], uses: {}};

// The script runs in a context of its own, with its own Date, Array and Error: what it is given is made with
// those, so that "value instanceof Date" and "catch (e) { e instanceof Error }" work as in Google.
const context = vm.createContext({});
const [RealmDate, RealmError, rows, list] = vm.runInContext(
  "[Date, Error, table => Array.from(table, row => Array.from(row)), items => Array.from(items)]", context);
const isDate = v => Object.prototype.toString.call(v) === "[object Date]";
const read = v => (v && typeof v === "object" && "$date" in v ? new RealmDate(v.$date) : v === null || v === undefined ? "" : v);
const save = v => (isDate(v) ? {$date: v.toISOString()} : v === undefined || v === null ? "" : v);
const empty = v => v === "" || v === null || v === undefined;
const same = (a, b) => (isDate(a) && isDate(b) ? a.getTime() === b.getTime() : a === b);
const fail = message => new RealmError(message);

function missing(what) {
  if (!result.missing.includes(what)) result.missing.push(what);
  return fail(`${what} is not in this test: check this part in Google`);
}

// An object whose unknown methods fail with a clear message instead of "is not a function".
function strict(target, kind) {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      if (typeof prop === "symbol" || prop in obj || ["then", "toJSON", "inspect", "constructor"].includes(prop)) {
        return Reflect.get(obj, prop, receiver);
      }
      return () => { throw missing(`${kind}.${prop}`); };
    },
  });
}

// A whole service the test does not have: any use of it fails with the service's name.
function absent(name) {
  return new Proxy({}, {
    get(_, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      throw missing(`${name}.${String(prop)}`);
    },
  });
}

function colNumber(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
  return n;
}

function colLetters(n) {
  let s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// A cell reference in an A1 formula; text in quotes, and sheet names in single quotes, are matched first and
// left alone. A name followed by ( is a function (LOG10), one followed by ! a sheet (Q1!A1).
const A1_REF = /("(?:[^"]|"")*"|'(?:[^']|'')*')|(?<![\w.$])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\w(!])/g;
const R1C1_REF = /("(?:[^"]|"")*"|'(?:[^']|'')*')|(?<![\w.$])R(\[-?\d+\]|\d+)?C(\[-?\d+\]|\d+)?(?![\w(!])/g;

// A formula copied dr rows and dc columns away, as Sheets does when it is pasted, filled or sorted: relative
// references move with it, those with $ stay, and one pushed off the sheet becomes #REF!.
function moved(formula, dr, dc) {
  if (!formula || (!dr && !dc)) return formula;
  return formula.replace(A1_REF, (all, quoted, fixCol, letters, fixRow, row) => {
    if (quoted) return quoted;
    const c = fixCol ? colNumber(letters) : colNumber(letters) + dc, r = fixRow ? +row : +row + dr;
    return c < 1 || r < 1 ? "#REF!" : `${fixCol}${colLetters(c)}${fixRow}${r}`;
  });
}

// R1C1 (what the macro recorder writes: R[1]C[-1] relative, R2C3 absolute) as A1, for the cell at row, col.
function fromR1C1(formula, row, col) {
  return String(formula).replace(R1C1_REF, (all, quoted, r, c) => {
    if (quoted) return quoted;
    const part = (spec, here) => (spec === undefined ? [here, ""] : spec[0] === "[" ? [here + Number(spec.slice(1, -1)), ""]
                                                                     : [Number(spec), "$"]);
    const [rr, fixRow] = part(r, row), [cc, fixCol] = part(c, col);
    return rr < 1 || cc < 1 ? "#REF!" : `${fixCol}${colLetters(cc)}${fixRow}${rr}`;
  });
}

function toR1C1(formula, row, col) {
  if (!formula) return "";
  return formula.replace(A1_REF, (all, quoted, fixCol, letters, fixRow, r) => {
    if (quoted) return quoted;
    const part = (fix, n, here) => (fix ? String(n) : n === here ? "" : `[${n - here}]`);
    return `R${part(fixRow, +r, row)}C${part(fixCol, colNumber(letters), col)}`;
  });
}

// Several ranges as one (getActiveRangeList, getRangeList): each call goes to every range.
function rangeList(ranges) {
  const out = new Proxy({}, {
    get(_, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop === "getRanges") return () => list(ranges);
      return (...args) => { ranges.forEach(r => r[prop](...args)); return out; };
    },
  });
  return out;
}

class Grid {
  constructor(name, origin, values = [], formulas = [], view = {}) {
    this.name = name;
    this.origin = origin;
    this.values = values.map(row => row.map(read));
    this.formulas = formulas.map(row => row.map(f => f || ""));
    this.formats = {};
    this.hidden = false;
    this.hiddenRows = new Set(view.hiddenRows || []);
    this.hiddenCols = new Set(view.hiddenCols || []);
    this.frozen = (view.frozen || [0, 0]).slice();
    this.id = Grid.next = (Grid.next || 0) + 1;
    this.start = this.snapshot();
  }
  get(r, c) { const v = (this.values[r - 1] || [])[c - 1]; return v === undefined || v === null ? "" : v; }
  formula(r, c) { return (this.formulas[r - 1] || [])[c - 1] || ""; }
  put(r, c, value, formula = "") {
    for (const table of [this.values, this.formulas]) {
      while (table.length < r) table.push([]);
      while (table[r - 1].length < c) table[r - 1].push("");
    }
    this.values[r - 1][c - 1] = value;
    this.formulas[r - 1][c - 1] = formula;
  }
  lastRow() {
    for (let r = Math.max(this.values.length, this.formulas.length); r > 0; r--) {
      const n = Math.max((this.values[r - 1] || []).length, (this.formulas[r - 1] || []).length);
      for (let c = 1; c <= n; c++) if (!empty(this.get(r, c)) || this.formula(r, c)) return r;
    }
    return 0;
  }
  lastColumn() {
    let last = 0;
    for (let r = 1; r <= Math.max(this.values.length, this.formulas.length); r++) {
      const n = Math.max((this.values[r - 1] || []).length, (this.formulas[r - 1] || []).length);
      for (let c = n; c > last; c--) if (!empty(this.get(r, c)) || this.formula(r, c)) { last = c; break; }
    }
    return last;
  }
  // Rows (axis 0) or columns (axis 1) inserted at position at (n > 0) or deleted from there (n < 0): the hidden
  // ones and the formats the script set move with their cells.
  shift(axis, at, n) {
    const move = k => (k < at ? k : n < 0 && k < at - n ? null : k + n);
    const set = axis === 0 ? "hiddenRows" : "hiddenCols";
    this[set] = new Set([...this[set]].map(move).filter(k => k !== null));
    const formats = {};
    for (const [key, format] of Object.entries(this.formats)) {
      const place = key.split(",").map(Number);
      place[axis] = move(place[axis]);
      if (place[axis] !== null) formats[place.join(",")] = format;
    }
    this.formats = formats;
  }
  maxRows() { return Math.max(1000, this.lastRow()); }        // a new Google sheet has 1000 rows
  maxColumns() { return Math.max(26, this.lastColumn()); }    // and 26 columns
  snapshot() {
    // The cells that hold something; the size is worked out once, not at every step of the loops.
    const cells = new Map(), height = this.lastRow(), width = this.lastColumn();
    for (let r = 1; r <= height; r++) {
      for (let c = 1; c <= width; c++) {
        const value = this.get(r, c), formula = this.formula(r, c);
        if (!empty(value) || formula) cells.set(`${r},${c}`, [value, formula]);
      }
    }
    return cells;
  }
  changes() {
    const now = this.snapshot(), out = [];
    for (const key of new Set([...this.start.keys(), ...now.keys()])) {
      const [v0, f0] = this.start.get(key) || ["", ""], [v1, f1] = now.get(key) || ["", ""];
      if (!same(v0, v1) || f0 !== f1) out.push([...key.split(",").map(Number), save(v1), f1]);
    }
    return out;
  }
}

class Range {
  constructor(sheet, row, col, rows = 1, cols = 1) {
    if (row < 1 || col < 1 || rows < 1 || cols < 1) throw fail("The coordinates of the range are outside the dimensions of the sheet.");
    Object.assign(this, {sheet, row, col, rows, cols});
    return strict(this, "Range");
  }
  get grid() { return this.sheet.grid; }
  cells(fn) {
    const out = [];
    for (let r = 0; r < this.rows; r++) {
      const line = [];
      for (let c = 0; c < this.cols; c++) line.push(fn(this.row + r, this.col + c, r, c));
      out.push(line);
    }
    return out;
  }
  getValue() { return this.grid.get(this.row, this.col); }
  getValues() { return rows(this.cells((r, c) => this.grid.get(r, c))); }
  getDisplayValue() { return display(this.getValue()); }
  getDisplayValues() { return rows(this.cells((r, c) => display(this.grid.get(r, c)))); }
  getFormula() { return this.grid.formula(this.row, this.col); }
  getFormulas() { return rows(this.cells((r, c) => this.grid.formula(r, c))); }
  isBlank() { return this.getValues().every(row => row.every(empty)) && this.getFormulas().every(row => row.every(f => !f)); }
  setValue(value) {
    this.cells((r, c) => (typeof value === "string" && value.startsWith("=") ? this.grid.put(r, c, "", value)
                                                                           : this.grid.put(r, c, value)));
    return this;
  }
  setValues(values) {
    if (!Array.isArray(values) || values.length !== this.rows) {
      throw fail(`The number of rows in the data does not match the number of rows in the range. The data has ${Array.isArray(values) ? values.length : 0} but the range has ${this.rows}.`);
    }
    values.forEach(row => {
      if (!Array.isArray(row) || row.length !== this.cols) {
        throw fail(`The number of columns in the data does not match the number of columns in the range. The data has ${Array.isArray(row) ? row.length : 0} but the range has ${this.cols}.`);
      }
    });
    this.cells((r, c, i, j) => (typeof values[i][j] === "string" && values[i][j].startsWith("=")
      ? this.grid.put(r, c, "", values[i][j]) : this.grid.put(r, c, values[i][j])));
    return this;
  }
  setFormula(formula) { this.cells((r, c) => this.grid.put(r, c, "", formula)); return this; }
  setFormulas(formulas) { this.cells((r, c, i, j) => this.grid.put(r, c, "", formulas[i][j])); return this; }
  setFormulaR1C1(formula) { this.cells((r, c) => this.grid.put(r, c, "", fromR1C1(formula, r, c))); return this; }
  setFormulasR1C1(formulas) { this.cells((r, c, i, j) => this.grid.put(r, c, "", fromR1C1(formulas[i][j], r, c))); return this; }
  getFormulaR1C1() { return toR1C1(this.getFormula(), this.row, this.col); }
  getFormulasR1C1() { return rows(this.cells((r, c) => toR1C1(this.grid.formula(r, c), r, c))); }
  // clear() takes both the contents and the formatting, as in Google; {contentsOnly: true} or {formatOnly: true}
  // only one of them. A cleared format goes back to the plain style in the file saved with -o.
  clear(options) {
    const o = options || {}, other = o.commentsOnly || o.validationsOnly;
    this.cells((r, c) => {
      if (!o.formatOnly && !other) this.grid.put(r, c, "");
      if (!o.contentsOnly && !other) this.grid.formats[`${r},${c}`] = {cleared: true};
    });
    return this;
  }
  clearContent() { return this.clear({contentsOnly: true}); }
  clearFormat() { return this.clear({formatOnly: true}); }
  clearDataValidations() { return this; }
  clearNote() { return this; }
  getRow() { return this.row; }
  getRowIndex() { return this.row; }
  getColumn() { return this.col; }
  getLastRow() { return this.row + this.rows - 1; }
  getLastColumn() { return this.col + this.cols - 1; }
  getNumRows() { return this.rows; }
  getNumColumns() { return this.cols; }
  getHeight() { return this.rows; }
  getWidth() { return this.cols; }
  getSheet() { return this.sheet; }
  getGridId() { return this.grid.id; }
  getA1Notation() {
    const start = colLetters(this.col) + this.row;
    return this.rows === 1 && this.cols === 1 ? start : `${start}:${colLetters(this.getLastColumn())}${this.getLastRow()}`;
  }
  getCell(r, c) { return new Range(this.sheet, this.row + r - 1, this.col + c - 1); }
  offset(r, c, rows, cols) { return new Range(this.sheet, this.row + r, this.col + c, rows || this.rows, cols || this.cols); }
  activate() { return this.sheet.spreadsheet.setActiveRange(this); }
  // As Ctrl and an arrow key: from the first cell to the edge of its block of cells with data, or past empty
  // cells to the next one with data, or to the edge of the sheet.
  getNextDataCell(direction) {
    const step = {UP: [-1, 0], DOWN: [1, 0], PREVIOUS: [0, -1], NEXT: [0, 1]}[String(direction)];
    if (!step) throw fail("Invalid argument: direction");
    const [dr, dc] = step, bottom = this.grid.maxRows(), right = this.grid.maxColumns();
    const filled = (r, c) => !empty(this.grid.get(r, c)) || !!this.grid.formula(r, c);
    const inside = (r, c) => r >= 1 && c >= 1 && r <= bottom && c <= right;
    let r = this.row, c = this.col;
    if (filled(r, c) && inside(r + dr, c + dc) && filled(r + dr, c + dc)) {
      while (inside(r + dr, c + dc) && filled(r + dr, c + dc)) { r += dr; c += dc; }
    } else {
      while (inside(r + dr, c + dc)) { r += dr; c += dc; if (filled(r, c)) break; }
    }
    return new Range(this.sheet, r, c);
  }
  // Google keeps the first of the rows with the same values (letter case aside) in the columns given, by their
  // number in the sheet, or in all of them; the rows kept move up inside the range, and the range it gives
  // back is shorter by the rows removed.
  removeDuplicates(columns) {
    const compared = columns === undefined ? null : Array.from(typeof columns === "number" ? [columns] : columns, Number);
    for (const c of compared || []) {
      if (c < this.col || c > this.getLastColumn()) throw fail(`Column ${c} is outside the range ${this.getA1Notation()}`);
    }
    const values = this.getValues(), formulas = this.getFormulas(), seen = new Set(), kept = [];
    values.forEach((row, i) => {
      const key = JSON.stringify((compared || row.map((_, j) => this.col + j)).map(c => {
        const v = row[c - this.col];
        return isDate(v) ? ["date", v.getTime()] : typeof v === "string" ? ["text", v.toLowerCase()] : [typeof v, v];
      }));
      if (!seen.has(key)) { seen.add(key); kept.push(i); }
    });
    this.cells((r, c, i, j) => (i < kept.length ? this.grid.put(r, c, values[kept[i]][j], moved(formulas[kept[i]][j], i - kept[i], 0))
                                                : this.grid.put(r, c, "")));
    return new Range(this.sheet, this.row, this.col, Math.max(1, kept.length), this.cols);
  }
  createTextFinder(text) { return finder([this], text); }
  check() { return this.setValue(true); }
  uncheck() { return this.setValue(false); }
  insertCheckboxes() { this.cells((r, c) => empty(this.grid.get(r, c)) && this.grid.put(r, c, false)); return this; }
  isChecked() { return this.getValue() === true; }
  getNote() { return ""; }
  setNote() { return this; }
  merge() { return this; }
  breakApart() { return this; }
  // As a paste: formulas move their relative references; a target as big as the range, or a multiple of it,
  // is filled, else the range lands at its first cell. PASTE_VALUES takes the results, PASTE_FORMAT only the
  // formatting, PASTE_FORMULA no formatting; {contentsOnly} and {formatOnly} say the same.
  copyTo(target, how, transposed) {
    const kind = typeof how === "string" ? how : how && how.formatOnly ? "PASTE_FORMAT"
      : how && how.contentsOnly ? "PASTE_FORMULA" : "PASTE_NORMAL";
    if (!["PASTE_NORMAL", "PASTE_NO_BORDERS", "PASTE_VALUES", "PASTE_FORMAT", "PASTE_FORMULA"].includes(kind)) {
      this.notApplied(kind.toLowerCase().replace("paste_", "pasted ").replace(/_/g, " "));
      return;
    }
    const values = this.getValues(), formulas = this.getFormulas(), formats = this.cells((r, c) => this.grid.formats[`${r},${c}`]);
    if (kind === "PASTE_VALUES" && formulas.some((row, i) => row.some((f, j) => f && empty(values[i][j])))) {
      missing("Range.copyTo of the values of formulas the script wrote, whose results only Google works out");
    }
    const [h, w] = transposed ? [this.cols, this.rows] : [this.rows, this.cols];
    const fits = target.rows % h === 0 && target.cols % w === 0;
    new Range(target.sheet, target.row, target.col, fits ? target.rows : h, fits ? target.cols : w).cells((r, c, i, j) => {
      const [si, sj] = transposed ? [j % w, i % h] : [i % h, j % w];
      const f = formulas[si][sj], dr = r - (this.row + si), dc = c - (this.col + sj);
      if (kind === "PASTE_VALUES") target.grid.put(r, c, values[si][sj]);
      else if (kind !== "PASTE_FORMAT") target.grid.put(r, c, f ? "" : values[si][sj], moved(f, dr, dc));
      if (["PASTE_NORMAL", "PASTE_NO_BORDERS", "PASTE_FORMAT"].includes(kind) && formats[si][sj]) {
        target.grid.formats[`${r},${c}`] = {...formats[si][sj]};
      }
    });
  }
  // As the fill handle: destination holds this range and goes on from it in one direction. Formulas move their
  // references; with DEFAULT_SERIES numbers go on as a series (1, 2 gives 3, 4) and dates by the same step,
  // with ALTERNATE_SERIES everything is copied. One number or date alone counts up by 1, as Google's help says,
  // and the report asks to check it.
  autoFill(destination, series) {
    const d = destination, down = d.cols === this.cols && d.col === this.col, across = d.rows === this.rows && d.row === this.row;
    if (d.sheet !== this.sheet || !(down || across) || d.row > this.row || d.col > this.col
        || d.getLastRow() < this.getLastRow() || d.getLastColumn() < this.getLastColumn()) {
      throw fail("The destination of autoFill has to hold the range and go on from it in one direction.");
    }
    const length = down ? this.rows : this.cols, copies = series === "ALTERNATE_SERIES";
    const line = k => (down ? this.cells((r, c) => [r, c]).map(row => row[k]) : this.cells((r, c) => [r, c])[k]);
    for (let k = 0; k < (down ? this.cols : this.rows); k++) {
      const source = line(k).map(([r, c]) => ({r, c, v: this.grid.get(r, c), f: this.grid.formula(r, c)}));
      const numbers = source.every(s => !s.f && typeof s.v === "number"), dates = source.every(s => !s.f && isDate(s.v));
      const xs = source.map(s => (dates ? s.v.getTime() : s.v)), mean = xs.reduce((a, b) => a + b, 0) / length;
      const half = (length - 1) / 2, spread = source.reduce((a, _, i) => a + (i - half) ** 2, 0);
      const step = length === 1 ? (dates ? 86400000 : 1) : source.reduce((a, _, i) => a + (i - half) * (xs[i] - mean), 0) / spread;
      const even = xs.every((x, i) => i === 0 || x - xs[i - 1] === step);
      const counts = !copies && (numbers || (dates && even));
      if (counts && length === 1) missing("Range.autoFill from one number or date, counted up by 1: check the numbers in Google");
      const span = down ? d.rows : d.cols, first = down ? this.row - d.row : this.col - d.col;
      for (let p = 0; p < span; p++) {
        const i = p - first;
        if (i >= 0 && i < length) continue;
        const s = source[((i % length) + length) % length];
        const [r, c] = down ? [d.row + p, s.c] : [s.r, d.col + p];
        if (counts) {
          const x = mean + (i - half) * step;
          this.grid.put(r, c, dates ? new RealmDate(x) : Math.round(x * 1e9) / 1e9);
        } else this.grid.put(r, c, s.f ? "" : s.v, moved(s.f, r - s.r, c - s.c));
        if (this.grid.formats[`${s.r},${s.c}`]) this.grid.formats[`${r},${c}`] = {...this.grid.formats[`${s.r},${s.c}`]};
      }
    }
    return this;
  }
  sort(spec) {
    const specs = (Array.isArray(spec) ? spec : [spec]).map(s => (typeof s === "number" ? {column: s, ascending: true}
      : {column: s.column, ascending: s.ascending !== false}));
    const formulas = this.getFormulas();
    const lines = this.getValues().map((values, i) => ({values, formulas: formulas[i], from: i}));
    if (specs.some(s => lines.some(l => l.formulas[s.column - this.col] && empty(l.values[s.column - this.col])))) {
      missing("Range.sort by formulas the script wrote, whose results only Google works out");
    }
    // As Sheets sorts: numbers and dates before text, text without regard to letter case, other values last.
    const rank = v => (typeof v === "number" || isDate(v) ? 0 : typeof v === "string" ? 1 : 2);
    const key = v => (isDate(v) ? v.getTime() : typeof v === "string" ? v.toLowerCase() : v);
    lines.sort((a, b) => {
      for (const s of specs) {
        const x = a.values[s.column - this.col], y = b.values[s.column - this.col];
        if (empty(x) !== empty(y)) return empty(x) ? 1 : -1;     // empty cells go last either way
        if (empty(x)) continue;
        const order = rank(x) - rank(y) || (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0);
        if (order) return s.ascending ? order : -order;
      }
      return 0;
    });
    this.cells((r, c, i, j) => this.grid.put(r, c, lines[i].values[j], moved(lines[i].formulas[j], i - lines[i].from, 0)));
    return this;
  }
  format(key, value) {
    this.cells((r, c) => { this.grid.formats[`${r},${c}`] = {...this.grid.formats[`${r},${c}`], [key]: value}; });
    return this;
  }
  setBackground(color) { return this.format("background", color); }
  setBackgroundColor(color) { return this.format("background", color); }
  setFontColor(color) { return this.format("color", color); }
  setFontWeight(weight) { return this.format("bold", weight === "bold"); }
  setNumberFormat(format) { return this.format("numberFormat", format); }
  getBackground() { return (this.grid.formats[`${this.row},${this.col}`] || {}).background || "#ffffff"; }
  getNumberFormat() { return (this.grid.formats[`${this.row},${this.col}`] || {}).numberFormat || "General"; }
  notApplied(what) { if (!result.notApplied.includes(what)) result.notApplied.push(what); return this; }
  setFontSize() { return this.notApplied("font sizes"); }
  setFontFamily() { return this.notApplied("fonts"); }
  setFontStyle() { return this.notApplied("italics"); }
  setHorizontalAlignment() { return this.notApplied("alignment"); }
  setVerticalAlignment() { return this.notApplied("alignment"); }
  setWrap() { return this.notApplied("text wrapping"); }
  setBorder() { return this.notApplied("borders"); }
  setDataValidation() { return this.notApplied("data validation"); }
  protect() { this.notApplied("protection"); return strict({setDescription() { return this; }, setWarningOnly() { return this; }, removeEditors() { return this; }, addEditor() { return this; }}, "Protection"); }
  // The filter is kept on the sheet for getFilter, and sorts the rows under its heading; which rows its
  // criteria would hide is not worked out.
  createFilter() {
    if (this.grid.filter) throw fail("A filter already exists in this sheet.");
    this.notApplied("filters");
    const range = this, grid = this.grid;
    const filter = strict({
      getRange: () => range,
      remove() { grid.filter = null; },
      sort(column, ascending) {
        if (range.rows > 1) new Range(range.sheet, range.row + 1, range.col, range.rows - 1, range.cols).sort({column, ascending});
        return filter;
      },
      setColumnFilterCriteria() { return filter; },
      removeColumnFilterCriteria() { return filter; },
      getColumnFilterCriteria: () => null,
    }, "Filter");
    grid.filter = filter;
    return filter;
  }
}

// Google's TextFinder: letter case, accents and partial matches allowed unless asked otherwise, in what the
// cells show (or in their formulas), row by row and sheet by sheet.
function finder(ranges, text) {
  const how = {matchCase: false, entire: false, formulas: false, regex: false, accents: false};
  let found = null, at = -1;
  const plain = s => (how.accents ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : s);
  const pattern = (global = true) => {
    const source = how.regex ? plain(text) : plain(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(how.entire ? `^(?:${source})$` : source, (global ? "g" : "") + (how.matchCase ? "" : "i"));
  };
  const shown = cell => (how.formulas && cell.getFormula() ? cell.getFormula() : display(cell.getValue()));
  const matches = () => {
    if (!found) {
      found = [];
      for (const range of ranges) {
        range.cells((r, c) => {
          const cell = new Range(range.sheet, r, c);
          if (pattern(false).test(plain(shown(cell)))) found.push(cell);
        });
      }
    }
    return found;
  };
  const option = key => on => { how[key] = on !== false; found = null; at = -1; return tf; };
  const replace = (cell, replacement) => {
    let count = 0;
    const swap = t => plain(t).replace(pattern(), () => { count++; return replacement; });
    if (how.formulas && cell.getFormula()) cell.setFormula(swap(cell.getFormula()));
    else {
      const t = swap(display(cell.getValue()));
      cell.setValue(typeof cell.getValue() === "number" && t.trim() !== "" && !isNaN(Number(t)) ? Number(t) : t);
    }
    return count;
  };
  const tf = strict({
    matchCase: option("matchCase"), matchEntireCell: option("entire"), matchFormulaText: option("formulas"),
    useRegularExpression: option("regex"), ignoreDiacritics: option("accents"),
    startFrom(range) {
      const order = cell => [ranges.findIndex(r => r.sheet === cell.sheet), cell.row, cell.col];
      const [s, r, c] = order(range);
      const before = ([ms, mr, mc]) => ms < s || (ms === s && (mr < r || (mr === r && mc <= c)));
      at = matches().filter(m => before(order(m))).length - 1;
      return tf;
    },
    findAll: () => list(matches()),
    findNext: () => (at + 1 < matches().length ? matches()[++at] : null),
    findPrevious: () => (at > 0 ? matches()[--at] : null),
    getCurrentMatch: () => (at >= 0 && at < matches().length ? matches()[at] : null),
    replaceWith(replacement) { const cell = tf.getCurrentMatch(); return cell ? replace(cell, String(replacement)) : 0; },
    replaceAllWith(replacement) {
      const count = matches().reduce((n, cell) => n + replace(cell, String(replacement)), 0);
      found = null; at = -1;
      return count;
    },
  }, "TextFinder");
  return tf;
}

function display(v) {
  if (isDate(v)) return `${v.getUTCMonth() + 1}/${v.getUTCDate()}/${v.getUTCFullYear()}`;
  return typeof v === "boolean" ? String(v).toUpperCase() : String(v);
}

class Sheet {
  constructor(spreadsheet, grid) {
    Object.assign(this, {spreadsheet, grid});
    return strict(this, "Sheet");
  }
  getName() { return this.grid.name; }
  setName(name) { this.grid.name = name; return this; }
  getSheetId() { return this.grid.id; }
  getIndex() { return this.spreadsheet.sheets.indexOf(this) + 1; }
  getParent() { return this.spreadsheet; }
  activate() { this.spreadsheet.setActiveSheet(this); return this; }
  getRange(a, b, c, d) {
    if (typeof a === "string") return this.a1(a);
    return new Range(this, a, b, c === undefined ? 1 : c, d === undefined ? 1 : d);
  }
  a1(text) {
    const m = /^\$?([A-Z]*)\$?(\d*)(?::\$?([A-Z]*)\$?(\d*))?$/i.exec(text.trim());
    if (!m || (!m[1] && !m[2])) throw fail(`Range not found: ${text}`);
    const [, c1, r1, c2, r2] = m, single = m[3] === undefined;
    const top = r1 ? +r1 : 1, left = c1 ? colNumber(c1) : 1;
    const bottom = single ? top : r2 ? +r2 : this.grid.maxRows();
    const right = single ? left : c2 ? colNumber(c2) : this.grid.maxColumns();
    if (single && (!c1 || !r1)) throw fail(`Range not found: ${text}`);
    return new Range(this, Math.min(top, bottom), Math.min(left, right), Math.abs(bottom - top) + 1, Math.abs(right - left) + 1);
  }
  getDataRange() { return new Range(this, 1, 1, Math.max(1, this.grid.lastRow()), Math.max(1, this.grid.lastColumn())); }
  getLastRow() { return this.grid.lastRow(); }
  getLastColumn() { return this.grid.lastColumn(); }
  getMaxRows() { return this.grid.maxRows(); }
  getMaxColumns() { return this.grid.maxColumns(); }
  getSheetValues(r, c, rows, cols) {
    return this.getRange(r, c, rows === -1 ? this.grid.lastRow() - r + 1 : rows, cols === -1 ? this.grid.lastColumn() - c + 1 : cols).getValues();
  }
  appendRow(values) {
    const r = this.grid.lastRow() + 1;
    values.forEach((v, i) => (typeof v === "string" && v.startsWith("=") ? this.grid.put(r, i + 1, "", v) : this.grid.put(r, i + 1, v)));
    return this;
  }
  insertRowsBefore(row, n) { this.grid.values.splice(row - 1, 0, ...Array.from({length: n}, () => [])); this.grid.formulas.splice(row - 1, 0, ...Array.from({length: n}, () => [])); this.grid.shift(0, row, n); return this; }
  insertRowBefore(row) { return this.insertRowsBefore(row, 1); }
  insertRowsAfter(row, n) { return this.insertRowsBefore(row + 1, n); }
  insertRowAfter(row) { return this.insertRowsBefore(row + 1, 1); }
  insertRows(row, n = 1) { return this.insertRowsBefore(row, n); }
  deleteRows(row, n) { this.grid.values.splice(row - 1, n); this.grid.formulas.splice(row - 1, n); this.grid.shift(0, row, -n); return this; }
  deleteRow(row) { return this.deleteRows(row, 1); }
  insertColumnsBefore(col, n) { for (const t of [this.grid.values, this.grid.formulas]) t.forEach(row => row.length >= col - 1 && row.splice(col - 1, 0, ...Array(n).fill(""))); this.grid.shift(1, col, n); return this; }
  insertColumnBefore(col) { return this.insertColumnsBefore(col, 1); }
  insertColumnAfter(col) { return this.insertColumnsBefore(col + 1, 1); }
  insertColumnsAfter(col, n) { return this.insertColumnsBefore(col + 1, n); }
  deleteColumns(col, n) { for (const t of [this.grid.values, this.grid.formulas]) t.forEach(row => row.splice(col - 1, n)); this.grid.shift(1, col, -n); return this; }
  deleteColumn(col) { return this.deleteColumns(col, 1); }
  clear() { this.grid.values = []; this.grid.formulas = []; return this; }
  clearContents() { return this.clear(); }
  clearFormats() { return this; }
  sort(column, ascending = true) {
    if (this.grid.lastRow() > 0) this.getDataRange().sort({column, ascending});
    return this;
  }
  hideSheet() { this.grid.hidden = true; return this; }
  showSheet() { this.grid.hidden = false; return this; }
  isSheetHidden() { return this.grid.hidden; }
  hideRows(row, n = 1) { for (let r = row; r < row + n; r++) this.grid.hiddenRows.add(r); }
  showRows(row, n = 1) { for (let r = row; r < row + n; r++) this.grid.hiddenRows.delete(r); }
  hideColumns(col, n = 1) { for (let c = col; c < col + n; c++) this.grid.hiddenCols.add(c); }
  showColumns(col, n = 1) { for (let c = col; c < col + n; c++) this.grid.hiddenCols.delete(c); }
  hideRow(range) { this.hideRows(range.getRow(), range.getNumRows()); }
  unhideRow(range) { this.showRows(range.getRow(), range.getNumRows()); }
  hideColumn(range) { this.hideColumns(range.getColumn(), range.getNumColumns()); }
  unhideColumn(range) { this.showColumns(range.getColumn(), range.getNumColumns()); }
  isRowHiddenByUser(row) { return this.grid.hiddenRows.has(row); }
  isColumnHiddenByUser(col) { return this.grid.hiddenCols.has(col); }
  setFrozenRows(n) { this.grid.frozen[0] = n; }
  setFrozenColumns(n) { this.grid.frozen[1] = n; }
  getFrozenRows() { return this.grid.frozen[0]; }
  getFrozenColumns() { return this.grid.frozen[1]; }
  getActiveRange() { return this.spreadsheet.getActiveRange(); }
  getActiveCell() { return this.spreadsheet.getActiveCell(); }
  getCurrentCell() { return this.spreadsheet.getCurrentCell(); }
  getSelection() { return this.spreadsheet.getSelection(); }
  setActiveRange(range) { return this.spreadsheet.setActiveRange(range); }
  setActiveSelection(range) { return this.spreadsheet.setActiveRange(typeof range === "string" ? this.getRange(range) : range); }
  createTextFinder(text) { return finder([this.getDataRange()], text); }
  autoResizeColumn() { return this; }
  autoResizeColumns() { return this; }
  setColumnWidth() { return this; }
  setColumnWidths() { return this; }
  setRowHeight() { return this; }
  getCharts() { return []; }
  getFilter() { return this.grid.filter || null; }
  getActiveRangeList() { return this.spreadsheet.getActiveRangeList(); }
  getRangeList(notations) { return rangeList(Array.from(notations, a1 => this.getRange(a1))); }
  copyTo(spreadsheet) {
    const copy = spreadsheet.addGrid(`Copy of ${this.getName()}`);
    copy.grid.values = this.grid.values.map(row => row.slice());
    copy.grid.formulas = this.grid.formulas.map(row => row.slice());
    return copy;
  }
}

class Spreadsheet {
  constructor(sheets, active) {
    this.sheets = [];
    for (const s of sheets) this.sheets.push(new Sheet(this, new Grid(s.name, s.name, s.values, s.formulas, s)));
    this.removed = [];
    this.selections = new Map();      // each sheet keeps its own selection, A1 until one is made
    this.picked = false;              // whether the script chose a sheet or cells itself (as a recorded macro does)
    this.active = this.sheets.find(s => s.getName() === active) || this.sheets[0];
    return strict(this, "Spreadsheet");
  }
  addGrid(name, index) {
    const sheet = new Sheet(this, new Grid(name, null));
    this.sheets.splice(index === undefined ? this.sheets.length : index, 0, sheet);
    return sheet;
  }
  getName() { return job.title || "Spreadsheet"; }
  getId() { return "test-spreadsheet"; }
  getUrl() { return "https://docs.google.com/spreadsheets/d/test-spreadsheet/edit"; }
  getSpreadsheetTimeZone() { return job.timezone; }
  getSpreadsheetLocale() { return "en_US"; }
  getSheets() { return list(this.sheets); }
  getNumSheets() { return this.sheets.length; }
  getSheetByName(name) { return this.sheets.find(s => s.getName() === name) || null; }
  getSheetById(id) { return this.sheets.find(s => s.getSheetId() === id) || null; }
  // What the script reads before choosing anything itself is what the client had open: the report says so.
  getActiveSheet() { if (!this.picked) result.uses.sheet = true; return this.active; }
  setActiveSheet(sheet) { this.active = sheet; this.picked = true; return sheet; }
  getActiveRange() {
    if (!this.picked) result.uses.selection = true;
    return this.selections.get(this.active) || this.active.getRange("A1");
  }
  getActiveCell() { return this.getActiveRange().getCell(1, 1); }
  getCurrentCell() { return this.getActiveCell(); }
  setActiveRange(range) { this.active = range.getSheet(); this.selections.set(this.active, range); this.picked = true; return range; }
  setActiveSelection(range) { return this.setActiveRange(typeof range === "string" ? this.getRange(range) : range); }
  getActiveRangeList() { return rangeList([this.getActiveRange()]); }
  getSelection() {
    const book = this;
    return strict({
      getActiveRange: () => book.getActiveRange(), getActiveSheet: () => book.getActiveSheet(),
      getCurrentCell: () => book.getCurrentCell(), getActiveRangeList: () => book.getActiveRangeList(),
      // As Ctrl, Shift and an arrow key: the selection stretched from its edge to the next cell with data.
      getNextDataRange(direction) {
        const range = book.getActiveRange(), cell = book.getCurrentCell(), way = String(direction);
        const from = range.getSheet().getRange(way === "DOWN" ? range.getLastRow() : way === "UP" ? range.getRow() : cell.getRow(),
          way === "NEXT" ? range.getLastColumn() : way === "PREVIOUS" ? range.getColumn() : cell.getColumn());
        const to = from.getNextDataCell(direction);
        const top = Math.min(range.getRow(), to.getRow()), left = Math.min(range.getColumn(), to.getColumn());
        return new Range(range.getSheet(), top, left, Math.max(range.getLastRow(), to.getRow()) - top + 1,
                         Math.max(range.getLastColumn(), to.getColumn()) - left + 1);
      },
    }, "Selection");
  }
  createTextFinder(text) { return finder(this.sheets.map(s => s.getDataRange()), text); }
  getRange(text) {
    const m = /^(?:'([^']+)'|([^!]+))!(.+)$/.exec(text);
    if (!m) return this.active.getRange(text);
    const sheet = this.getSheetByName(m[1] || m[2]);
    if (!sheet) throw fail(`Range not found: ${text}`);
    return sheet.getRange(m[3]);
  }
  getRangeByName() { return null; }
  insertSheet(name, index) {
    if (typeof name === "number") [name, index] = [undefined, name];
    name = name || `Sheet${this.sheets.length + 1}`;
    if (this.getSheetByName(name)) {
      throw fail(`A sheet with the name "${name}" already exists. Please enter another name.`);
    }
    const sheet = this.addGrid(name, index);
    this.setActiveSheet(sheet);
    return sheet;
  }
  deleteSheet(sheet) {
    if (this.sheets.length === 1) throw fail("You can't remove all the sheets in a document.");
    this.sheets = this.sheets.filter(s => s !== sheet);
    if (this.active === sheet) this.active = this.sheets[0];
  }
  duplicateActiveSheet() { return this.active.copyTo(this); }
  moveActiveSheet(position) {
    this.sheets.splice(this.sheets.indexOf(this.active), 1);
    this.sheets.splice(position - 1, 0, this.active);
  }
  toast(text, title) { result.ui.push(`toast: ${title ? title + ": " : ""}${text}`); }
  getOwner() { return user; }
  getEditors() { return []; }
  addEditor() { return this; }
  flush() {}
  getUi() { return ui; }
}

const user = {getEmail: () => job.user, getUsername: () => job.user.split("@")[0]};
const button = {OK: "OK", CANCEL: "CANCEL", YES: "YES", NO: "NO", CLOSE: "CLOSE"};
const buttonSet = {OK: "OK", OK_CANCEL: "OK_CANCEL", YES_NO: "YES_NO", YES_NO_CANCEL: "YES_NO_CANCEL"};

function answer(buttons) {
  const no = job.answer === "no";
  if (buttons === "YES_NO" || buttons === "YES_NO_CANCEL") return no ? "NO" : "YES";
  if (buttons === "OK_CANCEL") return no ? "CANCEL" : "OK";
  return "OK";
}

function menu(name) {
  const items = [];
  const builder = strict({
    addItem(caption, fn) { items.push(`${caption} -> ${fn}`); return builder; },
    addSeparator() { return builder; },
    addSubMenu(sub) { items.push(`(submenu)`); return builder; },
    addToUi() { result.menus.push(`${name}: ${items.join(", ")}`); },
  }, "Menu");
  return builder;
}

const ui = strict({
  Button: button,
  ButtonSet: buttonSet,
  alert(title, prompt, buttons) {
    if (prompt === undefined || prompt in buttonSet) [prompt, buttons] = [title, prompt];
    else prompt = `${title}: ${prompt}`;
    result.ui.push(`alert: ${prompt}`);
    return answer(buttons);
  },
  prompt(title, prompt, buttons) {
    if (prompt === undefined || prompt in buttonSet) [prompt, buttons] = [title, prompt];
    else prompt = `${title}: ${prompt}`;
    result.ui.push(`prompt: ${prompt}`);
    const chosen = answer(buttons);
    return strict({getResponseText: () => job.input, getSelectedButton: () => chosen}, "PromptResponse");
  },
  createMenu: menu,
  createAddonMenu: () => menu("Add-ons"),
  showModalDialog(output, title) { result.ui.push(`dialog: ${title}`); },
  showModelessDialog(output, title) { result.ui.push(`dialog: ${title}`); },
  showSidebar(output) { result.ui.push("sidebar"); },
}, "Ui");

const html = () => {
  const out = strict({setTitle() { return out; }, setWidth() { return out; }, setHeight() { return out; },
                      setSandboxMode() { return out; }, append() { return out; }, getContent: () => "",
                      evaluate() { return out; }}, "HtmlOutput");
  return out;
};

function formatDate(date, timezone, format) {
  const d = new Date(date), pad = (n, w = 2) => String(n).padStart(w, "0");
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
                  "October", "November", "December"];
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const parts = {
    yyyy: d.getUTCFullYear(), yy: pad(d.getUTCFullYear() % 100), MMMM: months[d.getUTCMonth()],
    MMM: months[d.getUTCMonth()].slice(0, 3), MM: pad(d.getUTCMonth() + 1), M: d.getUTCMonth() + 1,
    dd: pad(d.getUTCDate()), d: d.getUTCDate(), EEEE: days[d.getUTCDay()], EEE: days[d.getUTCDay()].slice(0, 3),
    HH: pad(d.getUTCHours()), H: d.getUTCHours(), hh: pad(d.getUTCHours() % 12 || 12), h: d.getUTCHours() % 12 || 12,
    mm: pad(d.getUTCMinutes()), ss: pad(d.getUTCSeconds()), a: d.getUTCHours() < 12 ? "AM" : "PM",
  };
  return format.replace(/'([^']*)'|yyyy|yy|MMMM|MMM|MM|M|dd|d|EEEE|EEE|HH|H|hh|h|mm|ss|a/g,
                        (token, quoted) => (quoted !== undefined ? quoted : String(parts[token])));
}

function store(start = {}) {
  const data = {...start};
  const props = strict({
    getProperty: key => (key in data ? data[key] : null),
    setProperty(key, value) { data[key] = String(value); return props; },
    setProperties(values) { Object.entries(values).forEach(([k, v]) => { data[k] = String(v); }); return props; },
    getProperties: () => ({...data}),
    getKeys: () => Object.keys(data),
    deleteProperty(key) { delete data[key]; return props; },
    deleteAllProperties() { Object.keys(data).forEach(k => delete data[k]); return props; },
  }, "Properties");
  return props;
}

function cache() {
  const data = {};
  return strict({get: key => (key in data ? data[key] : null), put(key, value) { data[key] = String(value); },
                 remove(key) { delete data[key]; }, getAll: keys => Object.fromEntries(keys.filter(k => k in data).map(k => [k, data[k]])),
                 putAll(values) { Object.assign(data, values); }}, "Cache");
}

function trigger(fn) {
  const parts = [];
  const builder = strict({
    timeBased() { parts.push("on a timer"); return builder; },
    everyMinutes(n) { parts.push(`every ${n} minutes`); return builder; },
    everyHours(n) { parts.push(`every ${n} hours`); return builder; },
    everyDays(n) { parts.push(`every ${n} days`); return builder; },
    everyWeeks(n) { parts.push(`every ${n} weeks`); return builder; },
    atHour(h) { parts.push(`at ${h}h`); return builder; },
    nearMinute(m) { parts.push(`near minute ${m}`); return builder; },
    onWeekDay(day) { parts.push(`on ${day}`); return builder; },
    onMonthDay(day) { parts.push(`on day ${day}`); return builder; },
    at(date) { parts.push(`at ${new Date(date).toISOString()}`); return builder; },
    after(ms) { parts.push(`after ${ms} ms`); return builder; },
    forSpreadsheet() { return builder; },
    onEdit() { parts.push("when the sheet is edited"); return builder; },
    onChange() { parts.push("when the sheet changes"); return builder; },
    onOpen() { parts.push("when the sheet opens"); return builder; },
    onFormSubmit() { parts.push("when a form is sent"); return builder; },
    create() { result.triggers.push(`${fn}, ${parts.join(", ")}`); return strict({getHandlerFunction: () => fn, getUniqueId: () => "1"}, "Trigger"); },
  }, "TriggerBuilder");
  return builder;
}

function sendEmail(service) {
  return (to, subject, body, options) => {
    const mail = typeof to === "object" ? to : {to, subject, body, ...(options || {})};
    result.emails.push({to: mail.to || mail.recipient || "", subject: mail.subject || "",
                        body: String(mail.body || mail.htmlBody || ""), via: service,
                        attachments: (mail.attachments || []).length});
  };
}

function fetchUrl(url, params) {
  result.fetched.push(url);
  const text = (job.fetch || {})[url];
  if (text === undefined) {
    throw missing(`UrlFetchApp.fetch(${url}), with no saved answer (give one with --fetch URL=file)`);
  }
  return strict({getContentText: () => text, getResponseCode: () => 200, getHeaders: () => ({}),
                 getBlob: () => strict({getDataAsString: () => text}, "Blob")}, "HTTPResponse");
}

const spreadsheet = new Spreadsheet(job.sheets, job.active);
const props = {script: store(job.properties), user: store(), document: store()};
const logged = (...args) => result.log.push(args.map(a => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "));

const globals = {
  SpreadsheetApp: strict({
    getActiveSpreadsheet: () => spreadsheet, getActive: () => spreadsheet,
    openById() { result.log.push("(openById: the test opens the same spreadsheet)"); return spreadsheet; },
    openByUrl() { result.log.push("(openByUrl: the test opens the same spreadsheet)"); return spreadsheet; },
    getActiveSheet: () => spreadsheet.getActiveSheet(), getActiveRange: () => spreadsheet.getActiveRange(),
    getCurrentCell: () => spreadsheet.getCurrentCell(), getSelection: () => spreadsheet.getSelection(),
    setActiveSheet: sheet => spreadsheet.setActiveSheet(sheet), setActiveRange: range => spreadsheet.setActiveRange(range),
    getUi: () => ui, flush() {},
    newDataValidation() { const b = new Proxy({}, {get: (_, p) => (p === "build" ? () => ({}) : () => b)}); return b; },
    newConditionalFormatRule() { const b = new Proxy({}, {get: (_, p) => (p === "build" ? () => ({}) : () => b)}); return b; },
    BorderStyle: {}, Dimension: {COLUMNS: "COLUMNS", ROWS: "ROWS"}, WrapStrategy: {}, ProtectionType: {},
    Direction: {UP: "UP", DOWN: "DOWN", PREVIOUS: "PREVIOUS", NEXT: "NEXT"},
    AutoFillSeries: {DEFAULT_SERIES: "DEFAULT_SERIES", ALTERNATE_SERIES: "ALTERNATE_SERIES"},
    CopyPasteType: Object.fromEntries(["PASTE_NORMAL", "PASTE_NO_BORDERS", "PASTE_FORMAT", "PASTE_FORMULA",
      "PASTE_DATA_VALIDATION", "PASTE_VALUES", "PASTE_CONDITIONAL_FORMATTING", "PASTE_COLUMN_WIDTHS"].map(k => [k, k])),
  }, "SpreadsheetApp"),
  Browser: strict({
    msgBox(title, prompt, buttons) { result.ui.push(`msgBox: ${prompt === undefined ? title : `${title}: ${prompt}`}`); return answer(buttons).toLowerCase(); },
    inputBox(title) { result.ui.push(`inputBox: ${title}`); return job.input; },
    Buttons: {OK: "OK", OK_CANCEL: "OK_CANCEL", YES_NO: "YES_NO", YES_NO_CANCEL: "YES_NO_CANCEL"},
  }, "Browser"),
  HtmlService: strict({createHtmlOutput: html, createHtmlOutputFromFile: html, createTemplateFromFile: html,
                       createTemplate: html, SandboxMode: {IFRAME: "IFRAME"}}, "HtmlService"),
  Logger: strict({log(format, ...args) {
    let i = 0;
    logged(typeof format === "string" && args.length ? format.replace(/%s|%d/g, () => String(args[i++])) : format);
  }, clear() {}, getLog: () => result.log.join("\n")}, "Logger"),
  console: {log: logged, info: logged, warn: logged, error: logged},
  MailApp: strict({sendEmail: sendEmail("MailApp"), getRemainingDailyQuota: () => 100}, "MailApp"),
  GmailApp: strict({sendEmail: sendEmail("GmailApp")}, "GmailApp"),
  Session: strict({getScriptTimeZone: () => job.timezone, getActiveUser: () => user, getEffectiveUser: () => user,
                   getTemporaryActiveUserKey: () => "test-user-key"}, "Session"),
  Utilities: strict({
    formatDate, sleep() {}, getUuid: () => crypto.randomUUID(),
    formatString: (format, ...args) => { let i = 0; return format.replace(/%[sd]/g, () => String(args[i++])); },
    base64Encode: data => Buffer.from(typeof data === "string" ? data : Uint8Array.from(data)).toString("base64"),
    base64Decode: text => Array.from(Buffer.from(text, "base64")),
    parseCsv(text, delimiter = ",") {
      const table = [];
      let row = [], field = "", quoted = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
          if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false; else field += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === delimiter) { row.push(field); field = ""; }
        else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(field); table.push(row); row = []; field = ""; }
        else field += ch;
      }
      if (field || row.length) { row.push(field); table.push(row); }
      return list(table.map(line => list(line)));
    },
  }, "Utilities"),
  PropertiesService: strict({getScriptProperties: () => props.script, getUserProperties: () => props.user,
                             getDocumentProperties: () => props.document}, "PropertiesService"),
  CacheService: strict({getScriptCache: cache, getUserCache: cache, getDocumentCache: cache}, "CacheService"),
  LockService: strict(Object.fromEntries(["getScriptLock", "getUserLock", "getDocumentLock"].map(name => [name, () => strict({
    waitLock() {}, tryLock: () => true, releaseLock() {}, hasLock: () => true}, "Lock")])), "LockService"),
  ScriptApp: strict({newTrigger: trigger, getProjectTriggers: () => [], deleteTrigger() {}, getScriptId: () => "test-script",
                     getOAuthToken: () => "test-token", WeekDay: Object.fromEntries(
                       ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"].map(d => [d, d])),
                     AuthMode: {FULL: "FULL", LIMITED: "LIMITED"}}, "ScriptApp"),
  UrlFetchApp: strict({fetch: fetchUrl, fetchAll: requests => requests.map(r => fetchUrl(typeof r === "string" ? r : r.url))}, "UrlFetchApp"),
};
for (const name of ["DriveApp", "DocumentApp", "CalendarApp", "FormApp", "SlidesApp", "ContactsApp", "Maps",
                    "LanguageApp", "ContentService", "Charts", "BigQuery", "AdminDirectory", "People", "Drive", "Sheets",
                    "Calendar", "Gmail", "YouTubeAnalytics", "XmlService", "Jdbc"]) {
  globals[name] = absent(name);
}

// Where an error happened: the first place in the stack that is in one of the script files.
function place(error) {
  const names = files.map(f => path.basename(f));
  for (const line of String(error && error.stack || "").split("\n")) {
    const m = /\(?([^()\s:]+):(\d+)(?::\d+)?\)?\s*$/.exec(line);    // a SyntaxError gives file:line, no column
    if (m && names.includes(path.basename(m[1]))) return {file: path.basename(m[1]), line: +m[2]};
  }
  return null;
}

Object.assign(context, globals);
if (job.select) {
  const sheet = job.select.sheet ? spreadsheet.getSheetByName(job.select.sheet) : spreadsheet.active;
  spreadsheet.setActiveRange(sheet.getRange(job.select.cells));
  spreadsheet.picked = false;
}
const startedOn = spreadsheet.active, startedWith = spreadsheet.selections.get(startedOn);
result.start = {sheet: startedOn.getName(), cells: startedWith ? startedWith.getA1Notation() : "A1",
                sheets: spreadsheet.sheets.length};
const started = Date.now();
try {
  for (const file of files) {
    new vm.Script(fs.readFileSync(file, "utf8"), {filename: path.basename(file)}).runInContext(context, {timeout: job.timeout * 1000});
  }
  if (job.edit) {
    const sheet = spreadsheet.getSheetByName(job.edit.sheet);
    if (!sheet) throw fail(`No sheet named ${job.edit.sheet} for the edit`);
    const range = sheet.getRange(job.edit.cell), oldValue = range.getValue();
    range.setValue(job.edit.value);
    spreadsheet.setActiveRange(range);
    spreadsheet.picked = false;
    // As Google sends them: e.value as text ("TRUE" for a ticked checkbox), no e.oldValue for a cell that was empty.
    const text = v => (typeof v === "boolean" ? String(v).toUpperCase() : isDate(v) ? display(v) : String(v));
    context.$edit = {range, value: text(job.edit.value), oldValue: empty(oldValue) ? undefined : text(oldValue),
                     source: spreadsheet, user, authMode: "LIMITED", triggerUid: "1"};
  }
  if (job.open) context.$open = {source: spreadsheet, user, authMode: "LIMITED"};
  const call = job.edit ? "onEdit($edit)" : job.open ? "onOpen($open)" : `${job.run}()`;
  const name = job.edit ? "onEdit" : job.open ? "onOpen" : job.run;
  if (typeof vm.runInContext(`typeof ${name}`, context) === "undefined" || vm.runInContext(`typeof ${name}`, context) !== "function") {
    result.status = "absent";
    result.functions = Object.keys(context).filter(k => typeof context[k] === "function" && !(k in globals) && !k.startsWith("$"));
    const declared = files.flatMap(f => [...fs.readFileSync(f, "utf8").matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map(m => m[1]));
    result.functions = [...new Set([...result.functions, ...declared])];
  } else {
    vm.runInContext(call, context, {timeout: job.timeout * 1000});
  }
} catch (error) {
  result.status = error && error.code === "ERR_SCRIPT_EXECUTION_TIMEOUT" ? "timeout" : "error";
  result.error = {name: error && error.name, message: String(error && error.message || error), at: place(error)};
}
result.seconds = result.status === "timeout" ? job.timeout : (Date.now() - started) / 1000;
result.active = spreadsheet.active.getName();
result.sheets = spreadsheet.sheets.map(s => ({name: s.grid.name, origin: s.grid.origin, hidden: s.grid.hidden,
                                               changes: s.grid.changes(), formats: s.grid.formats,
                                               hiddenRows: [...s.grid.hiddenRows], hiddenCols: [...s.grid.hiddenCols],
                                               frozen: s.grid.frozen}));
fs.writeFileSync(resultPath, JSON.stringify(result));
