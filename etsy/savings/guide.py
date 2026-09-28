"""One-page buyer guide (PDF) for the Savings Goals Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Savings Goals Tracker</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about ten minutes. After that you add one line
each time you move money into a goal or out of it.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Savings-Goals-Tracker.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Dashboard:</b> the year to show, and how often you are paid (monthly, twice a month, every 2 weeks or weekly).</li>
<li><b>Goals:</b> one line per goal, with its target and the date you need it by. Leave the date empty for a goal with
no deadline. Add what you had already saved before you started, and what you plan to put in each month.</li>
<li><b>Savings log:</b> one line each time you put money into a goal or take some out.</li>
</ol>
<p style="{S}">You only type in the <span style="background-color:#FFF4C2">yellow cells</span>. Delete the example goals
and lines before you start. Select the yellow cells and press Delete, rather than deleting whole rows.</p>
<h2 style="color:#1F6F78;{S}">Reading it</h2>
<p style="{S}">Each goal shows what is saved, what is left and what it still needs per month and per payday to be ready
by its date. It is <i>on track</i> when your plan per month covers that amount, and <i>short</i> when it does not.
Months left counts the months after this one, up to the month of the target date. The Month by month tab shows every
goal and month: green when you put in your plan, orange for part of it, grey for nothing, red when more came out.</p>
<h2 style="color:#1F6F78;{S}">The two challenges</h2>
<p style="{S}"><b>52 weeks:</b> pick the first week and the week 1 amount. Week 2 saves twice that, week 52 saves 52
times. Type x under Done each week you save. <b>100 envelopes:</b> type the number of each envelope you fill in the list
on the right, in any order, and the board turns green. You can play with fewer envelopes. If the challenge money goes
into one of your goals, add it to the Savings log too.</p>
<p style="{S};color:#5E6E72;font-size:9px">Works with any currency. It does not give financial advice. Made with the help of AI tools.</p>
"""
story = pymupdf.Story(html=HTML)
writer = pymupdf.DocumentWriter("Start-Here-Guide.pdf")
rect = pymupdf.paper_rect("a4")
more = True
while more:
    dev = writer.begin_page(rect)
    more, _ = story.place(rect + (50, 50, -50, -50))
    story.draw(dev)
    writer.end_page()
writer.close()
print("ok")
