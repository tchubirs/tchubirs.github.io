"""Run Apps Script code written for Google Sheets on a test workbook and check that the report says what it did."""
import contextlib
import datetime as dt
import io
import json
import os
import shutil
import sys
import tempfile

from openpyxl import Workbook, load_workbook

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run_gas  # noqa: E402

CODE = '''function onOpen() {
  SpreadsheetApp.getUi().createMenu("Tools")
    .addItem("Archive done tasks", "archiveDone")
    .addItem("Send reminders", "sendReminders")
    .addToUi();
}

function onEdit(e) {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== "Tasks" || e.range.getColumn() !== 3) return;
  sheet.getRange(e.range.getRow(), 4).setValue(e.value === "Done" ? new Date(Date.UTC(2026, 9, 5)) : "");
}

function archiveDone() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tasks = ss.getSheetByName("Tasks");
  const archive = ss.getSheetByName("Archive") || ss.insertSheet("Archive");
  const rows = tasks.getRange(1, 1, tasks.getLastRow(), 4).getValues();
  const header = rows.shift();
  if (archive.getLastRow() === 0) archive.appendRow(header);
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i][2] === "Done") {
      archive.appendRow(rows[i]);
      tasks.deleteRow(i + 2);
    }
  }
  archive.getRange("A1:D1").setBackground("#1f6f78").setFontWeight("bold").setBorder(true, true, true, true, false, false);
  Logger.log("Archived %s rows", archive.getLastRow() - 1);
}

function sendReminders() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert("Send the reminders?", ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  const rows = SpreadsheetApp.getActive().getSheetByName("Tasks").getDataRange().getValues().slice(1);
  rows.filter(r => r[2] !== "Done" && r[1]).forEach(r => MailApp.sendEmail(r[1], "Reminder: " + r[0], "Please finish " + r[0]));
}

function askOwner() {
  const answer = SpreadsheetApp.getUi().prompt("Who owns the new task?");
  SpreadsheetApp.getActive().getSheetByName("Tasks").appendRow(["New task", answer.getResponseText(), "Open"]);
}

function openCount() {
  const sheet = SpreadsheetApp.getActive().getSheetByName("Tasks");
  sheet.getRange("H1").setValue("Open tasks: " + sheet.getRange("G1").getValue());
}

function broken() {
  const sheet = SpreadsheetApp.getActive().getSheetByName("Tasks");
  sheet.getRange("A1:B2").setValues([[1, 2, 3]]);
}

function useDrive() {
  const files = DriveApp.getFilesByName("report.pdf");
}

function loop() {
  while (true) {}
}

function importRates() {
  const key = PropertiesService.getScriptProperties().getProperty("API_KEY");
  const data = JSON.parse(UrlFetchApp.fetch("https://api.example.com/rates?key=" + key).getContentText());
  SpreadsheetApp.getActive().getSheetByName("Tasks").getRange("J1:K1").setValues([["EUR", data.EUR]]);
}

function schedule() {
  ScriptApp.newTrigger("sendReminders").timeBased().everyHours(6).create();
}

function dueSoon() {
  const sheet = SpreadsheetApp.getActive().getSheetByName("Tasks");
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  const today = new Date(Date.UTC(2026, 9, 5));
  values.forEach((row, i) => {
    if (row[4] instanceof Date && (row[4] - today) / 86400000 <= 3) {
      sheet.getRange(i + 2, 6).setValue("Due " + Utilities.formatDate(row[4], Session.getScriptTimeZone(), "dd/MM/yyyy"));
    }
  });
  try {
    sheet.getRange("ZZ").getValue();
  } catch (e) {
    Logger.log("%s %s %s", e instanceof Error, values instanceof Array, e.message);
  }
}
'''


def book(root):
    path = os.path.join(root, "tasks.xlsx")
    wb = Workbook()
    ws = wb.active
    ws.title = "Tasks"
    ws.append(["Task", "Owner", "Status", "Done on", "Due"])
    for row in [("Invoice March", "ana@example.com", "Done", None, dt.date(2026, 10, 6)),
                ("Call supplier", "rui@example.com", "Open", None, dt.date(2026, 10, 20)),
                ("Pay rent", "ana@example.com", "Done", None, dt.date(2026, 10, 8)),
                ("Count stock", "rui@example.com", "Open", None, None)]:
        ws.append(row)
    ws["G1"] = '=COUNTIF(C2:C100,"Open")'
    wb.save(path)
    code = os.path.join(root, "Code.gs")
    with open(code, "w", encoding="utf-8") as f:
        f.write(CODE)
    return path, code


def line_of(code):
    return next(i for i, line in enumerate(CODE.splitlines(), start=1) if line.strip() == code)


def cli(path, code, root):
    out, said = os.path.join(root, "edited.xlsx"), io.StringIO()
    with contextlib.redirect_stdout(said):
        assert run_gas.main([path, code, "--edit", "Tasks!C3=Done", "-o", out]) == 0
    report = said.getvalue()
    for line in ["onEdit after Tasks!C3 = 'Done' ran to the end", "Tasks!C3  Open  ->  Done",
                 "Tasks!D3  (empty)  ->  2026-10-05", "Tasks!G1  2  ->  1"]:
        assert line in report, (line, report)
    assert load_workbook(out)["Tasks"]["D3"].value == dt.datetime(2026, 10, 5), "the date is not a date"
    with contextlib.redirect_stdout(io.StringIO()) as said:
        assert run_gas.main([path, code, "--open"]) == 0
    assert "Tools: Archive done tasks -> archiveDone, Send reminders -> sendReminders" in said.getvalue()
    print("onEdit and onOpen: the date written as a date, the formula that counts open tasks recalculated, the "
          "menu listed")


def archive(path, code, root):
    out = os.path.join(root, "archived.xlsx")
    result = run_gas.run(path, [code], "archiveDone", keep=out)
    report = "\n".join(run_gas.report(result, "yes"))
    assert result["status"] == "ok" and "Sheets added: Archive" in report and "Archived 2 rows" in report, report
    assert "Not kept in the saved file: borders." in report, report
    wb = load_workbook(out)
    def tasks(name):
        return [r[0] for r in wb[name].iter_rows(values_only=True) if r[0] is not None]
    assert tasks("Tasks") == ["Task", "Call supplier", "Count stock"], tasks("Tasks")
    assert tasks("Archive") == ["Task", "Pay rent", "Invoice March"], tasks("Archive")
    head = wb["Archive"]["A1"]
    assert head.fill.start_color.rgb == "FF1F6F78" and head.font.b, (head.fill.start_color.rgb, head.font.b)
    print("archive: 2 rows moved to a new sheet, its heading colored and bold in the file, borders listed as not kept")


def services(path, code):
    def go(call, **how):
        result = run_gas.run(path, [code], call, changes=False, **how)
        return result, "\n".join(run_gas.report(result, how.get("answer", "yes")))

    result, report = go("sendReminders")
    assert [m["to"] for m in result["emails"]] == ["rui@example.com", "rui@example.com"], report
    assert "alert: Send the reminders?" in report and "none was sent" in report, report
    result, _ = go("sendReminders", answer="no")
    assert result["emails"] == [], result["emails"]

    result, report = go("askOwner", typed_in="lea@example.com")
    assert result["status"] == "ok" and "prompt: Who owns the new task?" in report, report
    assert [6, 2, "lea@example.com", ""] in result["sheets"][0]["changes"], result["sheets"][0]["changes"]

    result, _ = go("openCount")
    assert [1, 8, "Open tasks: 2", ""] in result["sheets"][0]["changes"], result["sheets"][0]["changes"]

    result, report = go("broken")
    line = line_of("sheet.getRange(\"A1:B2\").setValues([[1, 2, 3]]);")
    assert result["status"] == "error" and result["error"]["at"] == {"file": "Code.gs", "line": line}, report
    assert "The number of rows in the data does not match the number of rows in the range. The data has 1 but the " \
           "range has 2." in report, report

    result, report = go("useDrive")
    assert result["status"] == "error" and result["missing"] == ["DriveApp.getFilesByName"], report
    assert "check these parts in Google" in report, report

    result, report = go("loop", timeout=3)
    assert result["status"] == "timeout" and "did not finish in 3 s" in report, report

    url = "https://api.example.com/rates?key=k123"
    result, report = go("importRates", fetch={url: json.dumps({"EUR": 0.92})}, properties={"API_KEY": "k123"})
    assert result["status"] == "ok" and result["fetched"] == [url], report
    assert [1, 11, 0.92, ""] in result["sheets"][0]["changes"], result["sheets"][0]["changes"]
    result, report = go("importRates", properties={"API_KEY": "k123"})
    assert result["status"] == "error" and "with no saved answer" in report, report

    result, report = go("schedule")
    assert result["triggers"] == ["sendReminders, on a timer, every 6 hours"], report

    result, report = go("dueSoon")
    assert result["log"] == ["true true Range not found: ZZ"], report
    changes = result["sheets"][0]["changes"]
    assert [2, 6, "Due 06/10/2026", ""] in changes and [4, 6, "Due 08/10/2026", ""] in changes, changes
    assert not [c for c in changes if c[0] == 3], changes

    try:
        go("nothing")
        raise AssertionError("an unknown function ran")
    except run_gas.Unrunnable as e:
        assert "nothing is not in the script" in str(e) and "archiveDone" in str(e), e
    print("services: emails listed and none sent, alert answered yes then no, a prompt, a formula's value read, "
          "Google's own error placed on its line, DriveApp named, a loop stopped, a saved answer for UrlFetchApp "
          "and a script property, a trigger, cell dates as Date, an unknown function refused")


if __name__ == "__main__":
    if not shutil.which("node"):
        print("Apps Script: not checked, Node.js is not installed")
        sys.exit(0)
    with tempfile.TemporaryDirectory() as tmp:
        path, code = book(tmp)
        cli(path, code, tmp)
        archive(path, code, tmp)
        services(path, code)
    print("all good")
