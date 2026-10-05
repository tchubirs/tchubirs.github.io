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
                notApplied: []};

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

class Grid {
  constructor(name, origin, values = [], formulas = []) {
    this.name = name;
    this.origin = origin;
    this.values = values.map(row => row.map(read));
    this.formulas = formulas.map(row => row.map(f => f || ""));
    this.formats = {};
    this.hidden = false;
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
  maxRows() { return Math.max(1000, this.lastRow()); }        // a new Google sheet has 1000 rows
  maxColumns() { return Math.max(26, this.lastColumn()); }    // and 26 columns
  snapshot() {
    const cells = new Map();
    for (let r = 1; r <= this.lastRow(); r++) {
      for (let c = 1; c <= this.lastColumn(); c++) cells.set(`${r},${c}`, [this.get(r, c), this.formula(r, c)]);
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
  clear() { this.cells((r, c) => this.grid.put(r, c, "")); return this; }
  clearContent() { return this.clear(); }
  clearFormat() { return this; }
  clearDataValidations() { return this; }
  clearNote() { return this; }
  getRow() { return this.row; }
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
  activate() { this.sheet.spreadsheet.active = this.sheet; this.sheet.spreadsheet.activeRange = this; return this; }
  check() { return this.setValue(true); }
  uncheck() { return this.setValue(false); }
  insertCheckboxes() { this.cells((r, c) => empty(this.grid.get(r, c)) && this.grid.put(r, c, false)); return this; }
  isChecked() { return this.getValue() === true; }
  getNote() { return ""; }
  setNote() { return this; }
  merge() { return this; }
  breakApart() { return this; }
  copyTo(target) {
    const values = this.getValues(), formulas = this.getFormulas();
    new Range(target.sheet, target.row, target.col, this.rows, this.cols)
      .cells((r, c, i, j) => target.grid.put(r, c, formulas[i][j] ? "" : values[i][j], formulas[i][j]));
  }
  sort(spec) {
    const specs = (Array.isArray(spec) ? spec : [spec]).map(s => (typeof s === "number" ? {column: s, ascending: true}
      : {column: s.column, ascending: s.ascending !== false}));
    const rows = this.getValues().map((values, i) => ({values, formulas: this.getFormulas()[i]}));
    rows.sort((a, b) => {
      for (const s of specs) {
        const x = a.values[s.column - this.col], y = b.values[s.column - this.col];
        if (empty(x) !== empty(y)) return empty(x) ? 1 : -1;     // empty cells go last either way
        if (x < y) return s.ascending ? -1 : 1;
        if (x > y) return s.ascending ? 1 : -1;
      }
      return 0;
    });
    this.cells((r, c, i, j) => this.grid.put(r, c, rows[i].values[j], rows[i].formulas[j]));
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
  createFilter() { this.notApplied("filters"); return strict({remove() {}, setColumnFilterCriteria() { return this; }}, "Filter"); }
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
  activate() { this.spreadsheet.active = this; return this; }
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
  insertRowsBefore(row, n) { this.grid.values.splice(row - 1, 0, ...Array.from({length: n}, () => [])); this.grid.formulas.splice(row - 1, 0, ...Array.from({length: n}, () => [])); return this; }
  insertRowBefore(row) { return this.insertRowsBefore(row, 1); }
  insertRowsAfter(row, n) { return this.insertRowsBefore(row + 1, n); }
  insertRowAfter(row) { return this.insertRowsBefore(row + 1, 1); }
  insertRows(row, n = 1) { return this.insertRowsBefore(row, n); }
  deleteRows(row, n) { this.grid.values.splice(row - 1, n); this.grid.formulas.splice(row - 1, n); return this; }
  deleteRow(row) { return this.deleteRows(row, 1); }
  insertColumnsBefore(col, n) { for (const t of [this.grid.values, this.grid.formulas]) t.forEach(row => row.length >= col - 1 && row.splice(col - 1, 0, ...Array(n).fill(""))); return this; }
  insertColumnBefore(col) { return this.insertColumnsBefore(col, 1); }
  insertColumnAfter(col) { return this.insertColumnsBefore(col + 1, 1); }
  insertColumnsAfter(col, n) { return this.insertColumnsBefore(col + 1, n); }
  deleteColumns(col, n) { for (const t of [this.grid.values, this.grid.formulas]) t.forEach(row => row.splice(col - 1, n)); return this; }
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
  setFrozenRows() { return this; }
  setFrozenColumns() { return this; }
  getFrozenRows() { return 0; }
  autoResizeColumn() { return this; }
  autoResizeColumns() { return this; }
  setColumnWidth() { return this; }
  setColumnWidths() { return this; }
  setRowHeight() { return this; }
  getCharts() { return []; }
  getFilter() { return null; }
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
    for (const s of sheets) this.sheets.push(new Sheet(this, new Grid(s.name, s.name, s.values, s.formulas)));
    this.removed = [];
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
  getActiveSheet() { return this.active; }
  setActiveSheet(sheet) { this.active = sheet; return sheet; }
  getActiveRange() { return this.activeRange || this.active.getRange("A1"); }
  getActiveCell() { return this.getActiveRange().getCell(1, 1); }
  getCurrentCell() { return this.getActiveCell(); }
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
    this.active = sheet;
    return sheet;
  }
  deleteSheet(sheet) {
    if (this.sheets.length === 1) throw fail("You can't remove all the sheets in a document.");
    this.sheets = this.sheets.filter(s => s !== sheet);
    if (this.active === sheet) this.active = this.sheets[0];
  }
  duplicateActiveSheet() { return this.active.copyTo(this); }
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
    setActiveSheet: sheet => spreadsheet.setActiveSheet(sheet), getUi: () => ui, flush() {},
    newDataValidation() { const b = new Proxy({}, {get: (_, p) => (p === "build" ? () => ({}) : () => b)}); return b; },
    newConditionalFormatRule() { const b = new Proxy({}, {get: (_, p) => (p === "build" ? () => ({}) : () => b)}); return b; },
    BorderStyle: {}, Dimension: {COLUMNS: "COLUMNS", ROWS: "ROWS"}, WrapStrategy: {}, ProtectionType: {},
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
    const m = /\(?([^()\s]+):(\d+):(\d+)\)?\s*$/.exec(line);
    if (m && names.includes(path.basename(m[1]))) return {file: path.basename(m[1]), line: +m[2]};
  }
  return null;
}

Object.assign(context, globals);
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
    context.$edit = {range, value: job.edit.value, oldValue, source: spreadsheet, user, authMode: "LIMITED", triggerUid: "1"};
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
result.active = spreadsheet.getActiveSheet().getName();
result.sheets = spreadsheet.sheets.map(s => ({name: s.grid.name, origin: s.grid.origin, hidden: s.grid.hidden,
                                               changes: s.grid.changes(), formats: s.grid.formats}));
fs.writeFileSync(resultPath, JSON.stringify(result));
