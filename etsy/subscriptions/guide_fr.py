"""Guide d'une page (PDF) pour le suivi des abonnements."""
import pymupdf

S = "font-family:sans-serif"
HTML = f"""
<h1 style="color:#15525A;{S}">Suivi des abonnements</h1>
<p style="{S};color:#5E6E72">Merci pour votre commande. Le remplir prend quelques minutes, puis vous voyez ce que coûtent vos abonnements par mois et par an.</p>
<h2 style="color:#1F6F78;{S}">Ouvrir le fichier</h2>
<p style="{S}"><b>Google Sheets :</b> allez sur drive.google.com, cliquez sur <i>Nouveau &gt; Importer un fichier</i> et choisissez
<b>Abonnements-Suivi.xlsx</b>. Ouvrez-le, puis choisissez <i>Fichier &gt; Enregistrer au format Google Sheets</i>.<br/>
<b>Excel :</b> double-cliquez sur le fichier.</p>
<h2 style="color:#1F6F78;{S}">Retrouver vos abonnements</h2>
<ol style="{S}">
<li>Parcourez vos relevés bancaires des 3 derniers mois et cherchez les montants qui reviennent.</li>
<li>Sur le téléphone, ouvrez l'App Store ou Google Play, puis Abonnements.</li>
<li>Cherchez dans vos e-mails les mots "reçu", "renouvellement" et "essai".</li>
</ol>
<h2 style="color:#1F6F78;{S}">Le remplir</h2>
<p style="{S}">Une ligne par abonnement : nom, catégorie, prix, fréquence de paiement et date du dernier prélèvement.
Choisissez Oui dans <i>Essai gratuit ?</i> pour les essais. Tapez uniquement dans les <span style="background-color:#FFF4C2">cases jaunes</span>, après avoir supprimé les lignes d'exemple.</p>
<h2 style="color:#1F6F78;{S}">Une fois par semaine</h2>
<p style="{S}">Ouvrez le Tableau de bord. Rouge : un essai gratuit va devenir payant. Orange : un abonnement n'a pas servi depuis un mois.
Choisissez <b>Annuler</b> pour voir l'économie par an, puis résiliez directement auprès du service.</p>
<p style="{S};color:#5E6E72;font-size:9px">Réalisé avec l'aide d'outils d'IA. Ce fichier ne résilie rien à votre place.</p>
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
