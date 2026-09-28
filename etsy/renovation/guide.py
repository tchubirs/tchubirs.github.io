"""One-page buyer guide (PDF) for the Home Renovation Budget Planner."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Home Renovation Budget Planner</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about fifteen minutes. After that you add quotes, payments and tasks as they come in.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Home-Renovation-Budget-Planner.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>.
If you share it, everyone sees the same numbers.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Budget:</b> one line per room or area, with the amount you want to spend there. Set the contingency, the share
you keep aside for surprises. Between 10 and 20% is usual.</li>
<li><b>Costs:</b> one line for every quote, job or purchase. Quotes for the same job need the same job name, for example
"Kitchen cabinets". The Quote check column then shows which one is cheapest and by how much.</li>
<li><b>Stage:</b> a line stays a Quote until you decide. Change it to Hired or Bought when you commit. Only those lines
count against the budget.</li>
<li><b>Timeline:</b> set the project start date, then add each task with its start date, end date and status.</li>
</ol>
<p style="{S}">You only type in the <span style="background-color:#FFF4C2">yellow cells</span>. Delete the example lines before you start.</p>
<h2 style="color:#1F6F78;{S}">While the work goes on</h2>
<p style="{S}">Each time you pay a contractor, update <i>Paid so far</i> and the date of the next payment.
The Dashboard lists the next five payments, shows overdue ones in red and tells you when a room goes over its budget.</p>
<p style="{S};color:#5E6E72;font-size:9px">Works with any currency. Made with the help of AI tools.</p>
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
