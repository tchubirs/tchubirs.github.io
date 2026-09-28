"""Guide d'une page (PDF) pour le plan de remboursement de dettes."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Plan de remboursement de dettes</h1>
<p style="{S};color:#5E6E72">Merci pour votre commande. Il faut environ trois minutes pour le remplir, puis vous voyez la date où vous n'aurez plus de dettes.</p>
<h2 style="color:#1F6F78;{S}">Ouvrir le fichier</h2>
<p style="{S}"><b>Google Sheets :</b> allez sur drive.google.com, cliquez sur <i>Nouveau &gt; Importer un fichier</i> et choisissez
<b>Plan-Remboursement-Dettes.xlsx</b>. Ouvrez-le, puis choisissez <i>Fichier &gt; Enregistrer au format Google Sheets</i>.<br/>
<b>Excel :</b> double-cliquez sur le fichier.</p>
<h2 style="color:#1F6F78;{S}">Le remplir (onglet Dettes)</h2>
<ol style="{S}">
<li>Une ligne par dette : le solde actuel, le taux annuel (%) et le paiement minimum mensuel.</li>
<li>Le montant que vous pouvez payer en plus des minimums chaque mois. Même un petit montant avance la date.</li>
<li>Le mois de votre premier paiement.</li>
<li>La méthode : <b>Avalanche</b> paie le moins d'intérêts, <b>Boule de neige</b> solde d'abord les plus petites dettes.</li>
</ol>
<h2 style="color:#1F6F78;{S}">Chaque mois</h2>
<p style="{S}">Le Tableau de bord indique quoi payer : le minimum sur chaque dette, et le reste sur votre <b>dette prioritaire</b>.
Quand une dette est soldée, son minimum passe tout seul à la suivante.
Une fois par mois, mettez à jour les soldes d'après vos relevés et le plan est recalculé.</p>
<p style="{S};color:#5E6E72;font-size:9px">C'est un outil de planification : il ne donne pas de conseil financier. Chaque organisme
peut calculer les intérêts un peu différemment. Réalisé avec l'aide d'outils d'IA.</p>
"""
story = pymupdf.Story(html=HTML)
writer = pymupdf.DocumentWriter("Guide-Demarrage.pdf")
rect = pymupdf.paper_rect("a4")
more = True
while more:
    dev = writer.begin_page(rect)
    more, _ = story.place(rect + (50, 50, -50, -50))
    story.draw(dev)
    writer.end_page()
writer.close()
print("ok")
