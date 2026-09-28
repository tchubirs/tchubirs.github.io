"""One-page buyer guide (PDF) for the Content Planner."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Social Media Content Planner</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes about ten minutes: your platforms and your
topics. After that, a line for each post, and its numbers once it is out.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> at drive.google.com, click <i>New &gt; File upload</i>, pick
<b>Content-Planner.xlsx</b>, open it and choose <i>File &gt; Save as Google Sheets</i>.
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Settings:</b> your platforms, each with a short name for the calendar and how many posts a week you aim for,
and your topics.</li>
<li><b>Stats:</b> your platforms again, with the followers at the end of each month.</li>
<li>Delete the example shop's posts and numbers: they are made up.</li>
</ol>
<h2 style="color:#1F6F78;{S}">As you plan and post</h2>
<ul style="{S}">
<li><b>Posts:</b> each post with its date, time, platform, type, topic and a few words on what it is. Move the status
along: Idea, Draft, Scheduled, Published. An idea can wait without a date.</li>
<li><b>Results:</b> once a post is out, its reach, likes, comments, shares and saves. The rate works itself out.</li>
<li><b>Calendar:</b> the month with the posts of each day, ready to print. Settings shows another month.</li>
<li><b>Dashboard:</b> the posts coming up, what is late, each platform against its weekly goal, and the best posts of
the month.</li>
</ul>
<h2 style="color:#1F6F78;{S}">Good to know</h2>
<ul style="{S}">
<li>A post still in Draft or Scheduled after its date shows as Late.</li>
<li>Rate is likes, comments, shares and saves together, divided by the reach.</li>
<li>A calendar day shows three posts and how many more there are.</li>
<li>Room for 800 posts, 8 platforms and 8 topics.</li>
</ul>
<p style="{S};color:#5E6E72;font-size:9px">Made with the help of AI tools.</p>
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
