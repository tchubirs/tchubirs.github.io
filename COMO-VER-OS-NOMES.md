# Os nomes de uma conta Steam — em dois cliques

Não é preciso escrever comando nenhum.

## 1. Duplo-clique

```
C:\Users\maico\tchubirs.github.io\nomes.cmd
```

Ele trata do resto sozinho: vai para a pasta certa, vê se há versão nova,
pergunta o SteamID (ou lê o `contas.txt`, ver abaixo), e abre o navegador.

## 2. Faz login na janela que abrir

O steamid.uk esconde a lista de quem não está logado — é por isso que a
janela abre. Carrega em **Sign in through Steam**, no topo.

**NÃO feches essa janela.** Ela é a ferramenta: é por ela que eu leio a
página. Minimiza, se atrapalhar. Podes voltar à consola quando quiseres —
ela não espera por tecla nenhuma, vai espreitando a página sozinha até
notar que já estás logado.

## 3. Lê o resultado

A janela da consola **fica aberta** no fim, de propósito.

---

## Várias contas de uma vez

Cria um ficheiro `contas.txt` ao lado do `nomes.cmd`, com um SteamID por
linha:

```
76561198155380495
76561199071264320
76561198397288384
```

A partir daí o duplo-clique lê as três **com um login só**. O `contas.txt`
fica fora do repositório de propósito — são as contas que tu investigas.

---

## O que a saída quer dizer

```
  a raiz que se repete — é o sinal mais forte que estes nomes dão

    "recruta" — em 9 nomes, de 2016 a 2026
        Recruta · R3crutatv · SenhorRecruta · Recrutáxi · [YT] Senhor Recruta …
```

Quem troca de nome trezentas vezes não repete a string — repete a **ideia**.
Muda o prefixo do canal, troca uma letra por um número, junta um sufixo. O
miolo fica. É esse miolo que aponta para a pessoa.

```
  ⚠ esta lista está INCOMPLETA (li 100 de 344) — o palpite abaixo
    só conhece estes nomes.
```

Este aviso importa. **Sem login, o steamhistory dá 100 de 344** e o palpite
sai do balde errado — foi assim que apareceu "Juice Fruit é o 1º nome da
conta", quando os nomes antigos a sério eram de 2015 e não estavam lá.

```
  ⚠ isto é probabilidade, não identidade.
```

O topo da lista é o melhor palpite, não um veredicto. Quem confunde as duas
coisas acusa inocente.

---

## Se der erro

A janela não se fecha, por isso dá para ler. As mensagens dizem o que
aconteceu em vez de dizerem "nada":

| O que aparece | O que é |
|---|---|
| `✗ a janela do navegador foi fechada` | fechaste a janela do Chrome; sem ela não leio |
| `✗ net::ERR_...` | não cheguei ao site |
| `⚠ o Cloudflare barrou` | um muro à porta — não é conta vazia |
| `⚠ a página esconde a lista` | falta o login |
| `— nada` | aí sim: a fonte respondeu e não tinha nomes |
