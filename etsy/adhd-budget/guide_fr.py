"""Guide d'une page (PDF) pour la version française."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Budget TDAH</h1>
<p style="{S};color:#5E6E72">Merci ! Voici comment démarrer en 5 minutes.</p>
<h2 style="color:#1F6F78;{S}">Ouvrir le fichier</h2>
<p style="{S}"><b>Google Sheets :</b> allez sur drive.google.com, <i>Nouveau › Importer un fichier</i>, choisissez
<b>Budget-TDAH.xlsx</b>, ouvrez-le puis <i>Fichier › Enregistrer au format Google Sheets</i>.</p>
<p style="{S}"><b>Excel :</b> double-cliquez sur <b>Budget-TDAH.xlsx</b> (cliquez sur « Activer la modification » si Excel le demande).</p>
<h2 style="color:#1F6F78;{S}">Le mettre en place</h2>
<ol style="{S}">
<li>Onglet <b>Budget</b> : votre montant mensuel par catégorie, et combien vous voulez épargner.</li>
<li>Onglet <b>Factures</b> : chaque facture une seule fois, avec son jour d’échéance.</li>
<li>Onglet <b>Journal</b> : une ligne à chaque dépense ou rentrée d’argent.</li>
</ol>
<p style="{S}">Tapez uniquement dans les <span style="background-color:#FFF4C2">cases jaunes</span>.
Supprimez les lignes d’exemple quand vous êtes prêt(e).</p>
<h2 style="color:#1F6F78;{S}">Chaque jour (10 secondes)</h2>
<p style="{S}">Ouvrez le <b>Tableau de bord</b> : le grand chiffre, c’est ce que vous pouvez dépenser par jour jusqu’à la fin du mois.
Une tentation ? Mettez-la dans l’onglet <b>Envies</b> et décidez dans 48 heures.</p>
<h2 style="color:#1F6F78;{S}">Chaque mois</h2>
<p style="{S}">Choisissez le nouveau mois sur le Tableau de bord et remettez chaque facture à <b>FALSE</b> dans la colonne <i>Payée ?</i>.</p>
<p style="{S};color:#5E6E72;font-size:9px">Outil de budget personnel, pas un conseil financier. Conçu avec l’aide d’outils d’IA.</p>
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
