"""Guide d'une page (PDF) pour le plan de remboursement de dettes."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Plan de remboursement de dettes</h1>
<p style="{S};color:#5E6E72">Merci ! Trois minutes pour connaître votre date de liberté.</p>
<h2 style="color:#1F6F78;{S}">Ouvrir le fichier</h2>
<p style="{S}"><b>Google Sheets :</b> drive.google.com → <i>Nouveau › Importer un fichier</i> → <b>Plan-Remboursement-Dettes.xlsx</b>
→ ouvrez-le → <i>Fichier › Enregistrer au format Google Sheets</i>. <b>Excel :</b> double-cliquez sur le fichier.</p>
<h2 style="color:#1F6F78;{S}">Le mettre en place (onglet Dettes)</h2>
<ol style="{S}">
<li>Une ligne par dette : solde actuel, taux annuel (%), paiement minimum mensuel.</li>
<li>Le montant que vous pouvez ajouter chaque mois en plus des minimums. Même un petit montant avance la date.</li>
<li>Le mois de votre premier paiement.</li>
<li>Choisissez <b>Avalanche</b> (le moins d’intérêts) ou <b>Boule de neige</b> (victoires rapides).</li>
</ol>
<h2 style="color:#1F6F78;{S}">Chaque mois</h2>
<p style="{S}">Le Tableau de bord vous dit une seule chose : payez le minimum sur chaque dette, et le reste sur votre
<b>dette prioritaire</b>. Quand une dette est soldée, son minimum passe automatiquement à la suivante.
Mettez à jour les soldes une fois par mois d’après vos relevés : le plan se recalcule.</p>
<p style="{S};color:#5E6E72;font-size:9px">Outil de planification, pas un conseil financier : chaque organisme peut calculer
les intérêts un peu différemment. Conçu avec l’aide d’outils d’IA.</p>
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
