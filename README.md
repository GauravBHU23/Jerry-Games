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

## Where the data lives

All scores are plain CSV files in the `media/` folder, so you can open
them in Excel:

| File | Contents |
|---|---|
| `media/players.csv` | `id, name, created, lastSeen` — one row per player |
| `media/scores.csv`  | `id, name, score, level, playedAt` — one row per game played |

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

1. **Level 1** — trash goons and sewage pits. Hit `?` blocks from below:
   the first makes Jerry big, the second unlocks water bombs.
2. **Factory Boss** — destroy 3 smokestacks with water bombs.
3. **Level 2** — rolling toxic barrels and flying drones. Drones can only be
   destroyed with bombs.
4. **The Greedy Tycoon** — the final boss throws money bags and toxic waste,
   and leaps at you. Land 6 bombs while dodging.

Taking a hit knocks Jerry down one stage (armed → big → small) before it costs
a life. In the boss arenas a hit costs a life directly, so you never lose the
bombs you need to win.
