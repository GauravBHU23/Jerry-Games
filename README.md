# Jerry the Water Saviour

An educational platformer about water pollution and treatment.
8 levels, 8 industry bosses and a shared leaderboard. Installable as an app,
plays on desktop and mobile, and works offline.

## How to run (local)

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

## Deploying to Vercel

Vercel's filesystem is read-only, so the CSV files cannot be used there. The
API automatically switches to Postgres when a connection string is present —
no code changes needed.

**1. Create the database**

In your Vercel project: **Storage → Create Database → Postgres** (the free
Hobby tier is enough), then **Connect** it to the project. Vercel sets the
`POSTGRES_URL` environment variable for you.

> Any Postgres works — Neon, Supabase, Railway. Just add `POSTGRES_URL`
> yourself under Settings → Environment Variables.

**2. Deploy**

```
vercel --prod
```
or push to GitHub and import the repo in Vercel.

**3. Done**

The `players` and `scores` tables are created automatically on the first
request. Nothing else to configure.

### If the API returns 404 on Vercel

That means the deployment was made *before* the `api/` folder existed —
redeploy. Each file in `api/` becomes its own serverless function:
`api/player.js`, `api/score.js`, `api/leaderboard.js`.

### Local vs Vercel

| | Local (`node server.js`) | Vercel |
|---|---|---|
| Storage | CSV files in `media/` | Postgres |
| API | one Node server | serverless functions in `api/` |
| Switch | automatic — set `POSTGRES_URL` to use Postgres locally too |

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

Running locally, all scores are plain CSV files in the `media/` folder, so you
can open them in Excel. (On Vercel the same data lives in Postgres instead.)

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
| `GET`  | `/api/player?id=usr_x` | That player's profile + their past games |
| `GET`  | `/api/leaderboard`     | Best score per player, ranked |
| `POST` | `/api/player`          | `{ name }` → creates a player, returns the new id |
| `POST` | `/api/score`           | `{ id, score, level, durationMs }` → records one game |

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

Eight levels, each ending in a boss fight. Every level is longer, has more and
faster enemies, wider sewage pits and introduces a new kind of enemy — and each
one rewards you with a new power that you keep for the rest of the run.

| Level | Name | New enemy | Power unlocked | Boss (HP) |
|---|---|---|---|---|
| 1 | The Riverbank | trash goons | **WATER BOMB** — press `X` | The Trash Baron (4) |
| 2 | The Old Canal | toxic drums | **RAPID FIRE** — 3× faster | Drum Warden (5) |
| 3 | The Dead Marsh | rolling barrels | **TRIPLE SHOT** — 3 bombs at once | Sludge Barge (6) |
| 4 | Drone Patrol | flying drones | **DOUBLE JUMP** | Drone Marshal (7) |
| 5 | The Pipe Works | — | **SHIELD** — absorbs a hit, recharges | Pipe Foreman (8) |
| 6 | Toxic Outfall | spitters (shoot sludge) | **PIERCING** — bombs pass through | Toxic Baron (9) |
| 7 | The Smog Belt | chasers (hunt you) | **BLAST RADIUS** — bigger hits | Smog General (10) |
| 8 | The Tycoon Tower | — | **OVERDRIVE** — maximum fire rate | **The Greedy Tycoon (14)** |

### Combos — the reason to play well

Kills chained within about 2.5 seconds of each other build a **combo
multiplier**, up to **x8**. A kill worth 100 becomes 800 at the top of a chain,
so clearing a group cleanly is worth far more than picking enemies off one by
one.

The chain resets if you get hit or let the timer run out — the meter at the top
of the screen shows how long you have left.

At the end of each level you get a **clear bonus**: `500 + (lives × 150) +
(best combo × 100)`. Rushing through with one life and no chains pays about
950; playing well pays double that.

### Checkpoints

Each level has three checkpoint flags. Touch one and it turns green — dying
sends you back there instead of to the start, and the enemies right around the
respawn are cleared so you never reappear into an instant second death.

### The bosses

Every level ends with the polluter responsible for it, and each is harder than
the last — more health, faster attacks, and new attack types:

| Attack | What it does | From |
|---|---|---|
| **Lob** | hurls a money bag that bounces once | boss 1 |
| **Spray** | fan of toxic blobs | boss 2 |
| **Slam** | leaps and sends shockwaves along the floor | boss 3 |
| **Summon** | calls in the level's own enemies as helpers | boss 4 |
| **Rage** | temporary frenzy — everything speeds up | boss 8 only |

Bosses also touch-damage you, so keep moving. Beating one takes you straight
into the next level with all your powers intact.

In every level, hitting a `?` power block the first time makes Jerry **big**,
and the second one arms his **water bombs**. A further power block hands over
that level's reward power.

Drones can only be destroyed with bombs — you cannot jump on them.

Taking a hit knocks Jerry down one stage (armed → big → small) before it costs
a life. In the final boss arena a hit costs a life directly, so you never lose
the bombs you need to win.
