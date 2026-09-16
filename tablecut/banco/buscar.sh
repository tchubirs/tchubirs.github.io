#!/bin/sh
# Reconstroi o banco de ensaio: os documentos reais contra os quais o Tablecut
# foi medido. Nenhum e meu. Correr a partir desta pasta; escreve em ./pdfs.
#
# Porque e que isto esta no repositorio: a primeira vez viveu em /tmp e
# desapareceu quando a maquina reiniciou. Uma medicao que nao se pode repetir
# vale pouco mais do que uma opiniao.
set -e
DESTINO="${1:-./pdfs}"
mkdir -p "$DESTINO"
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'

buscar() {
  nome="$1"; url="$2"
  if [ -s "$DESTINO/$nome" ]; then echo "ja ca esta: $nome"; return; fi
  curl -s -A "$UA" -L --max-time 90 -o "$DESTINO/$nome" "$url" || true
  if head -c 4 "$DESTINO/$nome" 2>/dev/null | grep -q '%PDF'; then
    echo "ok: $nome ($(wc -c < "$DESTINO/$nome") bytes)"
  else
    rm -f "$DESTINO/$nome"; echo "FALHOU: $nome  <- $url"
  fi
}

# Formularios e tabelas fiscais: grelhas densas, numeros alinhados a direita
buscar irs-taxtable.pdf  "https://www.irs.gov/pub/irs-pdf/i1040tt.pdf"
buscar irs-p15t.pdf      "https://www.irs.gov/pub/irs-pdf/p15t.pdf"
buscar irs-f941.pdf      "https://www.irs.gov/pub/irs-pdf/f941.pdf"
buscar irs-f990.pdf      "https://www.irs.gov/pub/irs-pdf/f990.pdf"
buscar irs-f1120.pdf     "https://www.irs.gov/pub/irs-pdf/f1120.pdf"
buscar irs-f1099misc.pdf "https://www.irs.gov/pub/irs-pdf/f1099msc.pdf"
buscar irs-1040sb.pdf    "https://www.irs.gov/pub/irs-pdf/f1040sb.pdf"

# Artigos: tabelas de cabecalho fundido, e paginas de texto corrido que a
# ferramenta tem de saber marcar como "aqui nao ha tabela"
buscar arxiv-attention.pdf "https://arxiv.org/pdf/1706.03762"
buscar arxiv-bert.pdf      "https://arxiv.org/pdf/1810.04805"
buscar arxiv-resnet.pdf    "https://arxiv.org/pdf/1512.03385"
buscar arxiv-gpt3.pdf      "https://arxiv.org/pdf/2005.14165"

# Extractos bancarios de amostra, publicados pelos proprios bancos e por
# universidades. O do Impact Bank e um scan — e e de proposito: serve para
# confirmar que a ferramenta o recusa em vez de inventar linhas.
buscar ext-niagara.pdf  "https://www.niagara.edu/wp-content/uploads/2024/12/Financial-Examples-for-I20.pdf"
buscar ext-carson.pdf   "https://www.carsonbank.com/wp-content/uploads/2021/01/Sample-Statement.pdf"
buscar ext-impact.pdf   "https://www.impact-bank.com/user/file/dummy_statement.pdf"
buscar ext-boa.pdf      "https://www.bankofamerica.com/content/documents/CG2/How%20To%20Read/en_US/HTR-043235.pdf"
buscar ext-argyll.pdf   "https://www.argyll.uhi.ac.uk/t4-media/one-web/argyll/students/Acceptable-example----Bank-Statement.pdf"
buscar ext-gwu.pdf      "https://undergraduate.admissions.gwu.edu/sites/g/files/zaxdzs4676/files/2022-08/sample_bank_statement.pdf"
buscar fat-tennant.pdf  "https://www.tennantco.com/content/dam/resources/web-content/supplier-documents/sample-commercial-invoice.pdf"

# Europa e Brasil — o mercado dele, que faltava aqui. O PROVA.md dizia, com
# todas as letras, que nada estava provado "numa factura portuguesa ou
# francesa": estes tres tapam metade desse buraco.
#   - Societe Generale: especimen de releve de compte publicado pelo banco
#   - Banco de Portugal: o exemplo oficial de extrato do Aviso 10/2014
#   - Fazenda do Parana: extractos verdadeiros de uma entidade publica
buscar ext-socgen.pdf    "https://static.societegenerale.fr/pri/PRI/Repertoire_par_type_de_contenus/Fichier_a_telecharger/nouveau-releve-compte.pdf"
buscar ext-bportugal.pdf "https://clientebancario.bportugal.pt/sites/default/files/relacionados/noticia/ExemploExtrato.pdf"
buscar ext-parana.pdf    "https://www.fazenda.pr.gov.br/sites/default/arquivos_restritos/files/documento/2021-09/2018_11_extrato_movimento.pdf"

echo
echo "documentos no banco: $(ls "$DESTINO"/*.pdf 2>/dev/null | wc -l)"
echo "alguns endereços morrem com o tempo. Um que falhe nao invalida os outros;"
echo "invalida a comparacao com medicoes antigas, e isso deve ser dito."
