# SOLMARIS — Open-World Coastal City

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?ref=5548afh3)
[![rank](https://make.fun/badge/gta6-01/Dilslino/gta6-01-solmaris-v8/rank.svg)](https://make.fun/bounty/gta6-01?ref=5548afh3)
[![reward](https://make.fun/badge/gta6-01/Dilslino/gta6-01-solmaris-v8/reward.svg)](https://make.fun/bounty/gta6-01?ref=5548afh3)

**An original open-world 3D crime game for the [gta6-01 bounty](https://make.fun/bounty/gta6-01?ref=5548afh3) on make.fun.**
You are Rico Vale, fresh off the ferry in Solmaris — a sun-soaked island city of neon,
palm trees and fast cars. Steal a ride, run six jobs for the crew, dodge the Solmaris PD
(and its helicopter searchlight), and make enough cash to own this town.

Everything here is original: the city, the cars, the people, the story, the art and the
sound. No Rockstar Games name, logo, character, map or asset is used.

## Play

Open `game/index.html` in a desktop browser (or serve the folder: `node serve.ts`
then http://localhost:8080). No network, no build step — three.js r152 is vendored
under `game/vendor/`, all sound is synthesized with WebAudio.

| Key | Action |
| --- | --- |
| WASD | Move / drive |
| SHIFT | Sprint |
| SPACE | Jump (on foot) / handbrake (in car) |
| E | Steal & enter car / exit / interact |
| F | Punch (melee) |
| Right mouse | Aim, Left mouse — shoot |
| M | Mute / unmute |
| R | Restart current mission |
| Mouse drag | Orbit camera |

## Features

- **Open world** — a coastal island city at sunset: avenues, beach, ocean, harbor with
  containers and cranes, a parking garage, a bank, palm trees, traffic and pedestrians.
- **Steal cars** — parked cars and live traffic; arcade handling with smooth full-speed
  U-turns and a handbrake.
- **6 missions** — First Wheels, Harbor Run, Lay Low, On Foot, Harbor Heist, The Big Score,
  with a cash economy (start $250) and mission rewards.
- **Wanted system** — 0–3 stars; Solmaris PD cruisers chase and ram you; at wanted 3 a
  police helicopter hunts you with an interactive searchlight you can shoot down.
- **Combat** — aim + shoot, melee punches, jumping; harbor guards fight back.
- **BUSTED (-$200) / WASTED (-$100)** — Continue restores the exact state the mission
  started in.
- **Sound** — synthesized engine, police siren, helicopter rotor, gunshots, punches and
  mission jingles, with a mute toggle.
- **HUD + minimap** — cash, wanted stars, health, car health, live minimap with mission
  marker, police and helicopter blips; save / continue via localStorage.

## Build

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to
`/output` and writes `/output/dossier.json` with the vendored make.fun library
(`vendor/makefun-game.ts`, byte-identical to the kit).

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see [LICENSE](LICENSE).
