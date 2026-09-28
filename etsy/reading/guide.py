"""One-page buyer guide (PDF) for the Reading Tracker."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Reading Tracker</h1>
<p style="{S};color:#5E6E72">Thanks for your order. Setting it up takes two minutes. Then you add a line when you
start a book and fill in the rest when you finish it.</p>
<h2 style="color:#1F6F78;{S}">Opening the file</h2>
<p style="{S}"><b>Google Sheets:</b> go to drive.google.com, click <i>New &gt; File upload</i> and pick
<b>Reading-Tracker.xlsx</b>. Open it, then choose <i>File &gt; Save as Google Sheets</i>. With the Google Sheets app
you can add a book from your phone.<br/>
<b>Excel:</b> double-click the file.</p>
<h2 style="color:#1F6F78;{S}">Setting it up</h2>
<ol style="{S}">
<li><b>Dashboard:</b> the year and how many books you want to read in it.</li>
<li><b>Settings:</b> twelve genres, each with its colour on the bookshelf. Rename them to the genres you read. Each
place on the list keeps its colour.</li>
<li><b>Books:</b> the example books and authors are made up. Delete them and add yours.</li>
</ol>
<h2 style="color:#1F6F78;{S}">As you read</h2>
<ul style="{S}">
<li><b>Starting a book:</b> add the title, author, genre, format and pages, set it to Reading and type the date.</li>
<li><b>Finishing it:</b> set Finished, the date you finished and a rating from 1 to 5. The days it took and your pages
a day are worked out.</li>
<li><b>Books you want to read</b> go in the same list as Want to read. A book you stop reading can be set to Did not
finish, and it stays out of your count.</li>
</ul>
<p style="{S}">The Dashboard shows your books and pages for the year, your average rating, if you are ahead or
behind your goal for today's date, your books by month and by genre, what you are reading now and your five-star
books. The Bookshelf puts every book you finish on a shelf, in the order you finished them and in the colour of its
genre. It holds 100 books.</p>
<p style="{S};color:#5E6E72;font-size:9px">To look back at another year, change the year on the Dashboard. Made with
the help of AI tools.</p>
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
