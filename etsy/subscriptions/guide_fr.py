"""Guide d'une page (PDF) pour le suivi des abonnements."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Suivi des abonnements</h1>
<p style="{S};color:#5E6E72">Merci ! Deux minutes pour savoir où part votre argent chaque mois.</p>
<h2 style="color:#1F6F78;{S}">Ouvrir le fichier</h2>
<p style="{S}"><b>Google Sheets :</b> drive.google.com → <i>Nouveau › Importer un fichier</i> → <b>Abonnements-Suivi.xlsx</b>
→ ouvrez-le → <i>Fichier › Enregistrer au format Google Sheets</i>. <b>Excel :</b> double-cliquez sur le fichier.</p>
<h2 style="color:#1F6F78;{S}">Retrouver tous vos abonnements</h2>
<ol style="{S}">
<li>Parcourez vos relevés bancaires des 3 derniers mois : cherchez les montants qui se répètent.</li>
<li>Téléphone : App Store ou Google Play → Abonnements.</li>
<li>Cherchez dans vos e-mails : « reçu », « renouvellement », « essai ».</li>
</ol>
<h2 style="color:#1F6F78;{S}">Remplir</h2>
<p style="{S}">Une ligne par abonnement : nom, catégorie, prix, facturation, date du dernier prélèvement. Essai gratuit = TRUE.
Tapez uniquement dans les <span style="background-color:#FFF4C2">cases jaunes</span> ; supprimez les lignes d’exemple.</p>
<h2 style="color:#1F6F78;{S}">L’utiliser</h2>
<p style="{S}">Ouvrez le Tableau de bord une fois par semaine. Rouge = un essai gratuit va devenir payant. Orange = pas utilisé depuis un mois.
Choisissez <b>Annuler</b> pour voir l’économie par an, puis résiliez directement auprès du service.</p>
<p style="{S};color:#5E6E72;font-size:9px">Conçu avec l’aide d’outils d’IA. Ce fichier ne résilie rien à votre place.</p>
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
