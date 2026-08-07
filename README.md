# Jerry the Water Saviour

An educational platformer about water pollution and treatment.
2 levels + 2 boss fights, playable on desktop and mobile.

## How to run

You need [Node.js](https://nodejs.org) installed (any recent version).

Open a terminal in this folder and run:

```
node server.js
```

Then open **http://localhost:3000** in your browser.

To stop the server press `Ctrl+C`.

### Playing on your phone

While the server is running, find your computer's local IP address
(`ipconfig` on Windows -> "IPv4 Address", something like `192.168.1.5`).
On a phone connected to the **same WiFi**, open:

```
http://192.168.1.5:3000
```

Everyone on the same WiFi shares one leaderboard.

## Install as an app (PWA)

The game is a Progressive Web App. Open it in Chrome, Edge or Safari and:

- **Android / desktop** — an **⬇ Install** button appears on the menu, or use
  the browser's "Install app" menu item.
- **iPhone / iPad** — Share → *Add to Home Screen*.

Once installed it opens fullscreen with no browser bars, has its own icon, and
**works with no internet at all** — the game itself is cached. Scores you set
while offline are queued and uploaded automatically the next time you connect.

## How ranking works

The board is sorted by:

1. **Score** — highest first
2. **Time** — if two scores are equal, the *faster* run wins
3. **Who got there first** — if score and time are both identical
4. **Player id** — a final tiebreaker

Because of step 4 the order is always strict: **two players can never share a
rank**, whatever the data looks like. Your run time is shown live in the HUD.

## Where the data lives

All scores are plain CSV files in the `media/` folder, so you can open
them in Excel:

| File | Contents |
|---|---|
| `media/players.csv` | `id, name, created, lastSeen` — one row per player |
| `media/scores.csv`  | `id, name, score, level, durationMs, playedAt` — one row per game played |

The CSVs are deliberately **not** downloadable over HTTP (the server returns
403) — player data is only reachable through the API.

Each player gets a unique id like `usr_msitzkia_1v01nu`. That id is saved in
the browser, so a returning player is recognised automatically and greeted with
their best score, games played and leaderboard rank.

To reset everything, delete both CSV files — they are recreated on next start.

## API

The game talks to these endpoints; you can also call them yourself.

| Method | Route | Purpose |
|---|---|---|
| `GET`  | `/api/player/:id`  | That player's profile + their past games |
| `GET`  | `/api/leaderboard` | Best score per player, ranked |
| `POST` | `/api/player`      | `{ name }` → creates a player, returns the new id |
| `POST` | `/api/score`       | `{ id, score, level }` → records one game |

Example:

```
curl http://localhost:3000/api/leaderboard
```

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Move | `←` `→` or `A` `D` | ◀ ▶ buttons |
| Jump | `SPACE` / `W` / `↑` | ▲ button |
| Water bomb | `X` | BOMB button |
| Restart | `R` | tap the screen |
| Mute | `M` | 🔊 button |

## Playing without the server

Opening `index.html` directly still works — the game runs and remembers your
scores in that browser, but the leaderboard cannot be shared with other
devices and nothing is written to `media/`. Start `server.js` for the full
experience.

## How the game works

Eight levels, then the final boss. Each level is longer, has more and faster
enemies, wider sewage pits and introduces a new kind of enemy — and each one
rewards you with a new power that you keep for the rest of the run.

| Level | Name | New enemy | Power unlocked |
|---|---|---|---|
| 1 | The Riverbank | trash goons | **WATER BOMB** — press `X` |
| 2 | The Old Canal | toxic drums | **RAPID FIRE** — 3× faster |
| 3 | The Dead Marsh | rolling barrels | **TRIPLE SHOT** — 3 bombs at once |
| 4 | Drone Patrol | flying drones | **DOUBLE JUMP** |
| 5 | The Pipe Works | — | **SHIELD** — absorbs a hit, recharges |
| 6 | Toxic Outfall | spitters (shoot sludge) | **PIERCING** — bombs pass through |
| 7 | The Smog Belt | chasers (hunt you) | **BLAST RADIUS** — bigger hits |
| 8 | The Tycoon Tower | — | **OVERDRIVE** — maximum fire rate |
| ★ | The Greedy Tycoon | final boss, 12 HP | — |

In every level, hitting a `?` power block the first time makes Jerry **big**,
and the second one arms his **water bombs**. A further power block hands over
that level's reward power.

Drones can only be destroyed with bombs — you cannot jump on them.

Taking a hit knocks Jerry down one stage (armed → big → small) before it costs
a life. In the final boss arena a hit costs a life directly, so you never lose
the bombs you need to win.
