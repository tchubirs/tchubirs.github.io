# RustArena — Documentation
> Ships with the listing. Marketplaces reject or bury plugins with no docs.

## Install
1. Drop `RustArena.cs` into `oxide/plugins/`.
2. Wait for compile. `RustArena.json` is generated in `oxide/config/`.
3. Grant yourself admin permissions (below), then build your first arena in-game.

No other plugins required.

## Permissions
| Permission | Grants |
|---|---|
| `rustarena.create` | Create arenas |
| `rustarena.delete` | Delete arenas |
| `rustarena.setentrance` | Set the arena entrance trigger |
| `rustarena.setspawns` | Set spawn points |
| `rustarena.leave` | Use the leave command |
| `rustarena.vip` | VIP tier — extra kit slots and priority |

```
oxide.grant user <name> rustarena.create
oxide.grant group vip rustarena.vip
```

## Commands
| Command | Purpose |
|---|---|
| `/rustarena` | Open the main panel |
| `/rustarena.leave` | Leave the current arena |
| `/setlobby` | Set the lobby position (stand where you want it) |
| `/setentrance` | Set the arena entrance trigger |
| `/setspawn` | Add a spawn point at your position |
| `/settargets` · `/settargetsnpc` | Define the aim-training zone and its NPCs |
| `/createmap` · `/deletemap` | Manage arena maps |
| `/save` · `/restoresave` | Save and restore arena state |
| `/ready` · `/s` · `/fs` | Match flow controls |

## Configuration highlights
`oxide/config/RustArena.json`

- **`Server Always Day?`** — locks daytime so arenas stay readable.
- **`Skin Settings`** — `Team A Skins` / `Team B Skins`, so sides are visually distinct. Set `Use Custom Skins: false` to disable.
- **`Kit Settings`** — weapon and attire kits, plus hard caps: `Max Syringes` (16), `Max Medkits` (2), `Max Bandages` (12), `Max Wood Walls` (6).
- **`Hologram Settings`** — `Arena Hologram Mode`: `simple` | `static` | `full` | `off`. Start at `simple`. `full` re-renders player names every `Hologram Update Interval` and costs the most CPU. Set `off` on a busy server if you see frame drops.

## Performance guidance
Holograms are the only tunable that meaningfully moves server frame time.
Order of cost, cheapest first: `off` → `static` → `simple` → `full`.
Raise `Hologram Update Interval (seconds)` before dropping a mode.

## API
```csharp
[PluginReference] private Plugin RustArena;

bool inArena = (bool)(RustArena?.Call("API_IsPlayerInArena", player) ?? false);
```
Returns whether the player is currently inside any arena. Use it to suppress
your own plugin's behaviour (teleports, PvE rules, economy ticks) while a
player is fighting.

## Localization
English ships in `oxide/lang/en/RustArena.json`. Copy that folder to add a
language; keys are stable across patch versions.
