# RustArena — Codefling listing copy
> Paste-ready. English, because that is the buyer's language on Codefling.
> Do not translate this file — translate nothing. The market is EN.

---

## Title
**RustArena — Multi-Arena PvP with Kits, Holograms & Aim Targets**

## Short description (the line that sells it in the grid)
Run hundreds of isolated PvP arenas on one server. Full kit editor, 3D holograms, aim-training targets, team skins and a live scoreboard — no dependencies.

## Tags
`arena` `pvp` `1v1` `combat` `training` `aim` `kits` `minigame` `ui` `no-dependencies`

---

## Full description

### Every arena is its own world

Most arena plugins fall apart at scale: players see each other through walls,
bullets cross between arenas, and the server chokes. RustArena runs each arena
in an **isolated network group with Harmony patches for visibility and physics**,
so arenas can share coordinates and still behave as if each were alone on the map.

That means you are not limited by map space. You are limited by CPU.

### What server owners get

**Arena management**
- Create, delete and configure arenas in-game — no config file editing required
- Set entrance, lobby and spawn points with a command while standing there
- Per-arena whitelist and bans
- Live switching between arenas from an in-game panel

**Kit system**
- Full weapon editor: attachments, ammo type, scopes
- Attire and armor kits with per-slot control
- Players save, load and reset their own loadouts
- Caps you control: syringes, medkits, bandages, wood walls

**Aim training**
- Dedicated targets zone with NPC targets
- Auto-reset, separate inventory state, its own entrance trigger

**Presentation**
- 3D holograms above each arena showing title, map, teams and live player names
- Four hologram modes (`simple` / `static` / `full` / `off`) so you tune the cost
- Team A / Team B skin sets so sides read instantly
- Scoreboard, HUD and a side-select panel

**Operations**
- VIP permission tier (`rustarena.vip`)
- Granular admin permissions: `create`, `delete`, `setentrance`, `setspawns`
- Public API: `API_IsPlayerInArena(BasePlayer)` for your other plugins
- Save/restore of player state — nobody loses their main inventory

### Why there are no dependencies

RustArena ships standalone. No GamemodeCore, no GearCore, no ImageLibrary,
no external UI framework. You drop one `.cs` file in `oxide/plugins` and it runs.
Every arena plugin that needs three other paid plugins to work is three more
things that break on Rust's monthly forced wipe.

### Production history

RustArena is version 1.0.8 and has run in production on a live server —
not a demo box. The isolation layer behind it was built to stack **1000+
concurrent arenas** at the same coordinates without ghost walls or broken
invisibility. It is 9,000+ lines of C# that has already met real players.

---

## Suggested price
**$34.99** one-time.

Reasoning: Codefling content sits mostly at $5–50, with premium plugins above
$100. RustArena is far past the $5–15 utility band — it is a full gamemode with
UI, kit editor and its own isolation layer. But it is your first listing with
zero reviews, and reviews are the thing that actually converts on a marketplace.
$34.99 is high enough to signal "this is not a weekend script" and low enough
that a server owner buys it without asking for a demo. Raise to $49.99 once you
have five reviews; do not launch there.

---

## Support policy to publish with the listing
> Updates for the current Rust version are included. Bug reports through the
> support tab are answered within 48 hours. Feature requests are welcome but
> not guaranteed. Not licensed for redistribution or resale.
