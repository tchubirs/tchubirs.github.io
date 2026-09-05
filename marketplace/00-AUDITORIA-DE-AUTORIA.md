# Auditoria de autoria — o que você pode vender

Levantado dos headers `[Info("nome", "autor", "versão")]` de `rust-server-ltg/plugins/`.
**Vender plugin de terceiro te bane do marketplace e é violação de direito autoral.**
Esta tabela é a linha que não se cruza.

## ✅ SEU — autor declarado `Tchubi`

| Plugin | Ver. | Linhas | Dependências de terceiros | Vendável hoje? |
|---|---|---|---|---|
| `RustArena.cs` | 1.0.8 | 9.087 | **nenhuma** | ✅ **Sim, imediato** |
| `NetworkIsolation.cs` | 1.0.5 | 1.636 | **nenhuma** | ✅ Sim (ver estratégia) |
| `GamemodeFast1v1.cs` | 4.0.0 | 2.029 | GearCore *(VisEntities)* | ⚠️ desacoplar 1 |
| `ScrimMatchmaking.cs` | 4.0.1 | 4.415 | GearCore *(VisEntities)* | ⚠️ desacoplar 1 |
| `GamemodeFFA.cs` | 3.1.0 | 3.299 | Leaderboard *(Arena Server)* | ⚠️ desacoplar 1 |
| `BedWars.cs` | 2.2.3 | 6.385 | GamemodeCore, GearCore, SkinBox | ❌ desacoplar 3 |

**Total de código original: 26.851 linhas de C#.**

Versões v2–v4 significam iteração em produção, não protótipo. Isso é o que
justifica preço premium.

## ❌ NÃO É SEU — instalado no servidor, de outros autores

`AdminRadar` (nivex) · `BetterChat`, `AdvertMessages` (LaserHydra) ·
`GamemodeCore`, `GamemodeAimTrain`, `GearCore` (VisEntities) ·
`ImageLibrary` (Absolut & K1lly0u) · `Loottable` (The_Kiiiing) ·
`PlayerAdministration` (ThibmoRozier) · `Rustcord` (Kirollos & OuTSMoKE) ·
`PermissionsManager` (Steenamaroo) · `Skins` (misticos) · `AdminMenu` (0xF) ·
`Leaderboard` (Arena Server) · `AutomatedMessages` (beee) · `Waypoints` (RFC1920) ·
`PathFinding` (Reneb/Nogrod) · `TebexPlugin` (Tebex) · e os menores.

**Nenhum destes entra em qualquer listagem, pacote ou repositório público seu.**

## Nota sobre `NetworkIsolation`

Ele não depende de ninguém, mas três dos seus plugins dependem *dele*.
Isso o torna mais valioso como **dependência gratuita** publicada no seu nome
do que como produto de US$ 10: cada servidor que instala o NetworkIsolation
para rodar um plugin seu já está a um clique dos outros. É isca, não produto.
