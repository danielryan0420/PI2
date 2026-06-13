# Baseball Scorekeeper

A live baseball scorekeeping app: track teams, rosters, innings, balls/strikes/outs,
baserunners, and stats from a phone, with a real-time scoreboard designed to be used
as an overlay for live streaming (OBS browser source, etc.).

## Stack

- **Backend**: Flask + Flask-SocketIO (real-time updates) + SQLite (WAL mode)
- **Frontend**: React + TypeScript + Vite + Tailwind CSS

## Quick start

```bash
# Backend
pip install -r requirements.txt
python3 server.py            # runs on http://localhost:8082

# Frontend (separate terminal)
cd client
npm install
npm run dev                   # runs on http://localhost:3000, proxies /api and /socket.io to :8082
```

Default scorekeeper login: **scorekeeper / baseball** (seeded automatically on first run).

## Usage

1. Log in, then go to **Teams** and create two teams with at least 9 active players each.
2. Go to **Games → New game**, pick home/away teams, and create the game.
3. On the game setup page, set a 9-player batting order + position for each team, then **Start game**.
4. Use the **Scorekeeper** page (`/score/:gameId`) on a phone to record each at-bat result.
   Tap a baserunner to override its default advancement (hold / advance / score / out)
   before confirming the play. Use **Undo last play** to correct mistakes.
5. Open `/scoreboard/:gameId` (no login required) on another device/browser tab as the
   live scoreboard. It updates in real time via Socket.io.

## Streaming overlay (OBS)

> **See [STREAMING.md](STREAMING.md) for the full streaming guide**, including how
> to run everything over a phone hotspot when your streaming device has no
> cellular, and how to stream from an iPhone vs. a laptop with OBS.

Every game has an in-app **"Share / stream"** panel with QR codes and copyable
links for the scoreboard, the transparent OBS overlay, and the scorekeeper page.
Because the links are built from the address you opened the app at, scanning a
QR code from any device on the same Wi-Fi/hotspot opens the right URL with no IP
typing. When you start `server.py`, it also prints the LAN URL to share.

The scoreboard page is public and supports query params for use as an OBS browser source:

- `?transparent=1` - transparent background
- `?compact=1` - minimal single-line score ticker
- `?theme=dark|light` - color theme
- `?scale=1.5` - CSS scale factor
- `?hide=diamond,pitcher,linescore,count` - comma list of sections to hide

Example: `http://<host>:3000/scoreboard/1?transparent=1&compact=1&scale=2`

In OBS, add a **Browser Source** pointing at that URL, sized to fit your stream layout,
and check "Shutdown source when not visible" off so it keeps receiving live updates.
The overlay automatically re-joins its game room on reconnect if OBS suspends/resumes
the browser source during scene switches.

## Production

Run directly:

```bash
npm run build   # builds client/dist, served by Flask
gunicorn -k eventlet -w 1 wsgi:app
```

Or deploy the included `Dockerfile` to any container host (Render, Railway,
Fly.io, a VPS); it builds the client and serves everything via gunicorn, binding
to `$PORT`. A `render.yaml` is included for Render. For a no-laptop, all-mobile
streaming rig, cloud hosting is the recommended path — see
[STREAMING.md](STREAMING.md).

Note: Socket.IO with eventlet requires a single worker process (`-w 1`) since
connections are held in-memory per worker.

## Roadmap

- Pitch-by-pitch mode, substitutions, fielder credit/detail modal
- Season/career stat pages, situational splits (RISP, late & close)
- PWA install + offline write queue for poor stadium connectivity
