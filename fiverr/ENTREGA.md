# Delivering a Fiverr order

Runbook for Claude, so any session can take an order from the first message to the delivery the
same way. The owner pastes the client's message and files; Claude writes the reply and does the work.
Client files stay in the session's scratchpad and are deleted after delivery: never in this repository.

## Every order

1. Reply fast: Fiverr shows the response time, and a Brief only stays open for 72 hours.
2. Before the order, ask only what is missing and confirm scope, price and delivery date in one message.
3. Work on a copy. Test on the client's real file or site before delivering.
4. Deliver the files with a short message: what was done, the checks that passed, how to use it.
5. Plain words in every message (rule 14). The gigs already say that AI tools are used.

## Gig 1: web scraping

- Ask: the pages, the fields, how many items, Excel, CSV or JSON.
- Only public pages: no login, nothing robots.txt forbids (scrape.py checks it), a delay between pages.
- Write a job file. Start from `tools/example-job.json` (pages with a next link),
  `tools/example-detail-job.json` (open each item's page) or `tools/example-scroll-job.json` (a page
  that loads more as you scroll). The keys are explained at the top of `tools/scrape.py`.
- Run `python3 fiverr/tools/scrape.py job.json -o result`, which writes result.xlsx, .csv and .json.
- Check the row count against the site, the "empty values" lines, and 5 rows by hand.

## Gig 2: Python scripts

- Ask: what the script should do, a sample of the real input, Windows or Mac.
- Write the script with a test on that sample. Deliver the script and a README with the exact commands
  to install and run it.

## Gig 3: Google Sheets and Excel

- Ask: a copy of the file without private data, what it should do, Excel (which version) or Google Sheets.
- First `python3 fiverr/tools/audit_sheet.py client.xlsx`: errors and where they come from, odd formulas,
  numbers typed as text. If it prints "Saving with openpyxl would lose", do not edit the file with openpyxl:
  edit it in LibreOffice or in the XML.
- For Excel 2019 or older, do not use the functions listed under "Needs Excel 2021 or later".
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
- Scans: once per session, `apt-get install -y tesseract-ocr tesseract-ocr-fra tesseract-ocr-por tesseract-ocr-spa`.
  A page that is only a picture is then read with OCR, turned upright and straightened; `--ocr` does the same for a
  scan whose text layer is poor, `--lang fra` when it is in one language. Tested on scans tilted up to 2.5 degrees,
  upside down, on their side, at 150 dpi. A phone photo taken at an angle was not tested: ask for a flat scan.
- Run `python3 fiverr/tools/statement2excel.py a.pdf b.pdf -o statements.xlsx`, adding as needed:
  `--categories` (or `--categories rules.json`, a copy of `tools/categories.json` with the client's
  words), `--date-format dd/mm/yyyy`, `--dates dmy` or `mdy` when the guess is wrong, and for CSV
  `-o statements.csv` (`--sep ";" --decimal ","` for Excel in French or Portuguese).
- Read the Checks sheet before delivering. "Balance mismatches" must be 0 and "Opening balance plus
  movements gives the closing balance" must be "yes". "Other transaction tables left out" means another
  account in the same file: convert it on its own. "Rows without a category" are under Other: add the
  client's words to the rules and run again.
- When a balance check fails, the console names the two rows between which it fails: open the PDF there and fix
  the row by hand. After a scan it also lists the rows whose date or amount the OCR was unsure of: compare them
  with the PDF.
- Count the transactions against the statement and say in the message which checks passed.
