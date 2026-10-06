# Delivering a Fiverr order

Runbook for Claude, so any session can take an order from the first message to the delivery the
same way. The owner pastes the client's message and files; Claude writes the reply and does the work.
Client files stay in the session's scratchpad and are deleted after delivery: never in this repository.

## Setup, once per session

The container starts fresh each session. LibreOffice, Node.js, Chromium and the Python packages the tools use
are there already; Tesseract (scanned statements, gig 5) and XlsxWriter (one test of run_vba.py) are not:

    apt-get install -y tesseract-ocr tesseract-ocr-fra tesseract-ocr-por tesseract-ocr-spa
    pip install xlsxwriter

For gig 3, a newer LibreOffice next to that one, about 3 minutes and 730 MB. Version 24.2, which Ubuntu
installs, cannot work out XLOOKUP, FILTER, LET and the rest of Excel 2021; 26.8 can, and audit_sheet.py
and run_gas.py use the newest one they find under /opt (run_vba.py stays on 24.2). Take the newest
folder listed at https://download.documentfoundation.org/libreoffice/stable/ in place of 26.8.1:

    V=26.8.1; U=https://download.documentfoundation.org/libreoffice/stable/$V/deb/x86_64
    curl -sSL -o /tmp/lo.tar.gz $U/LibreOffice_${V}_Linux_x86-64_deb.tar.gz
    tar xzf /tmp/lo.tar.gz -C /tmp && mkdir -p /opt/lo26
    for d in /tmp/LibreOffice_*/DEBS/*.deb; do dpkg-deb -x $d /opt/lo26; done  # ia-ok

Then the tests of every tool, about 3 minutes; each prints "all good", and a test that cannot run here says
so ("not checked") with the reason:

    for t in fiverr/tools/test_*.py; do python3 $t | grep -E "not checked|all good"; done

## Every order

1. Reply fast: Fiverr shows the response time, and a Brief only stays open for 72 hours.
2. Before the order, ask only what is missing and confirm scope, price and delivery date in one message.
3. Work on a copy. Test on the client's real file or site before delivering.
4. Deliver the files with a short message: what was done, the checks that passed, how to use it.
5. Plain words in every message (rule 14). The gigs already say that AI tools are used.

## Gig 1: web scraping

- Ask: the pages, the fields, how many items, Excel, CSV or JSON.
- Only public pages: no login, nothing robots.txt forbids (scrape.py checks it, wildcards included, and keeps
  its Crawl-delay), a delay between pages.
- Write a job file. Start from `tools/example-job.json` (pages with a next link),
  `tools/example-detail-job.json` (open each item's page) or `tools/example-scroll-job.json` (a page
  that loads more as you scroll). The keys are explained at the top of `tools/scrape.py`.
- A Shopify store: `tools/example-shopify-job.json` with the store's address. It reads /products.json,
  one row per variant with SKU, price, stock and the description as text, 250 products a page. A site
  whose page fills itself from a JSON address (the browser's Network tab shows it): use "json" the same way.
- Run `python3 fiverr/tools/scrape.py job.json -o result`, which writes result.xlsx, .csv and .json.
- Check the row count against the site, the "empty values" lines, and 5 rows by hand.

## Gig 2: Python scripts

- Ask: what the script should do, a sample of the real input, Windows or Mac.
- Write the script with a test on that sample. Then `python3 fiverr/tools/py_kit.py check my-tool/`: it must parse
  as Python 3.10, and it lists the packages to install and warns about Windows-only modules and paths of one
  computer. `py_kit.py pack my-tool/ --run "main.py input.xlsx" --title "..." --what "..." -o dist` writes the zip
  with run-windows.bat, run-mac.command, run-linux.sh, requirements.txt and HOW-TO-RUN.txt. Deliver
  `dist/my-tool.zip`: the client installs Python once and double-clicks the launcher.

## Gig 3: Google Sheets and Excel

- Ask: a copy of the file without private data, what it should do, Excel (which version) or Google Sheets.
- First `python3 fiverr/tools/audit_sheet.py client.xlsx`: errors and where they come from, odd formulas,
  numbers typed as text. If it prints "Saving with openpyxl would lose", do not edit the file with openpyxl:
  edit it in LibreOffice or in the XML.
- For Excel 2019 or older, do not use the functions listed under "Needs Excel 2021 or later".
- "Not checked here" lists formulas this LibreOffice cannot work out: XLOOKUP, FILTER, LET and the rest of
  Excel 2021 with version 24.2 (unpack 26.8, see Setup, and run again), `LAMBDA` even with 26.8, and the
  functions of Google Sheets. Their results come from Excel or Google only: say so in the delivery message.
- A VBA macro: `python3 fiverr/tools/run_vba.py client.xlsm MacroName` runs it on a copy in LibreOffice (a module
  I wrote: add `--code Module1.bas`). MsgBox gets `--answer yes` or `no`, InputBox gets `--input`. The report lists
  every change, or the module, line and error where the macro stopped; `-o after.xlsx` keeps the result. Lines it
  names as needing Windows or Excel (Scripting.Dictionary, RemoveDuplicates, Outlook) are tested by the client:
  say so in the delivery message, and avoid Scripting.Dictionary for a Mac. Deliver the module as a .bas file with
  the steps to import it (Alt+F11, then File > Import File).
- An Apps Script: download the Google Sheet as Excel, then `python3 fiverr/tools/run_gas.py client.xlsx Code.gs
  --run functionName` (`--edit "Sheet1!C2=Done"` for onEdit, `--open` for the menus). Emails are listed and not
  sent, alerts and prompts get `--answer` and `--input`, an address the script fetches needs a saved answer
  (`--fetch URL=answer.json`). The report gives every change, or the file, line and error where it stopped. What it
  lists under "Not in this test" (DriveApp, CalendarApp and so on) is checked in Google: say so in the delivery
  message and ask the client to run the script once on a copy of the sheet.
- After the work, `audit_sheet.py fixed.xlsx` must say "Nothing to fix", and
  `audit_sheet.py --compare client.xlsx fixed.xlsx -o changes.txt` lists every formula, typed value and
  result that changed. Send changes.txt with the file.

## Gig 4: custom Claude skill

- Ask: the task, 2 or 3 examples of good output, which Claude app (web, desktop, Claude Code).
- Write the folder `<name>/SKILL.md`, with `references/` or `scripts/` when needed. Test it on the
  client's examples, in Claude Code from `~/.claude/skills/<name>/`.
- `python3 fiverr/tools/skill_kit.py check <name>` and then
  `skill_kit.py pack <name> -o dist --example "a request that should use it"`.
- Deliver `dist/<name>.zip` and `dist/INSTALL-<name>.md`.

## Gig 5: bank statement PDF to Excel

- Ask: the PDFs as downloaded from online banking (for a scan, one sample page first), Excel or CSV, date format,
  categories.
- Scans need Tesseract (see Setup). A page that is only a picture is read with OCR, turned upright and straightened; `--ocr` does the same for a
  scan whose text layer is poor, `--lang fra` when it is in one language. Tested on scans tilted up to 2.5 degrees,
  upside down, on their side, at 150 dpi. A phone photo taken at an angle was not tested: ask for a flat scan.
- Tested on real layouts too: the public sample statements of RBC and `CIBC` (Canada) and TD Bank (US, with
  a table of cheques) convert row for row, with the right year and the opening and closing balances.
- A PDF locked with a password: the console says so; ask the client for it and add `--password 1503` (more
  than one may be given). A photo or scan sent as JPG or PNG is read like a scanned page.
- Run `python3 fiverr/tools/statement2excel.py a.pdf b.pdf -o statements.xlsx`, adding as needed:
  `--categories` (or `--categories rules.json`, a copy of `tools/categories.json` with the client's
  words), `--date-format dd/mm/yyyy`, `--dates dmy` or `mdy` when the guess is wrong, and for CSV
  `-o statements.csv` (`--sep ";" --decimal ","` for Excel in French or Portuguese).
- Amounts without cents (`12.990`, `1.250.000`, banks in Chile): add `--whole`. The console says so when it
  read nothing for that reason. They are read under the money columns (Cargos and Abonos, Debit and Credit)
  or, with one amount column (Monto), at the end of each row. A document number of one to three digits
  right next to the Cargos column can pass for an amount: the balance check then names its row. A second
  description line that ends in a number is left out: add it by hand if the client needs it.
- QuickBooks Online or Xero: add `--for quickbooks` or `--for xero` (or both). Next to the Excel file come
  `statements-quickbooks.csv` and `statements-xero.csv`, in the format of their bank statement upload: one
  amount, money out below zero, dates in the statement's own day and month order unless `--date-format`
  says otherwise (ask which one the client's QuickBooks or Xero uses). For QuickBooks the descriptions
  lose their symbols, a file holds 1,000 rows at most and a row of 0 is left out; the console says how
  many. Deliver the Excel file too, for the checks.
- Read the Checks sheet before delivering. "Balance mismatches" must be 0 and "Opening balance plus
  movements gives the closing balance" must be "yes". "Other transaction tables left out" means another
  account in the same file (convert it on its own), or a month of this account out of date order inside
  one PDF: split that PDF, one file per statement, and run again; the console says the same. "Rows without a category" are under Other: add the
  client's words to the rules and run again.
- Several statements: give all the PDFs in one run, in any order; they come out in date order. With more
  than one file, "Each file starts at the closing balance of the one before" must be "yes": a "no"
  names the two files, and a statement is probably missing between them, so ask the client for it.
  "Left out" names a file the client sent twice.
- When a balance check fails, the console names the two rows between which it fails: open the PDF there and fix
  the row by hand. After a scan it also lists the rows whose date or amount the OCR was unsure of: compare them
  with the PDF.
- Count the transactions against the statement and say in the message which checks passed.
