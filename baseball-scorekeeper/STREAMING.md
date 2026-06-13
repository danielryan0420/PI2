# Streaming guide

This app does **not** capture or broadcast video itself. It produces a live,
auto-updating **scoreboard** that you composite over your camera using a
streaming tool. This keeps it simple and works with whatever you already use
(OBS, YouTube, Twitch, a phone broadcaster app, etc.).

## The one thing to understand: where the server runs

The app is a small web server. Every device that scores the game, shows the
scoreboard, or streams needs to be able to **reach that server over the
network**. There are two good setups.

### Setup A — Laptop on a phone hotspot (recommended, no internet needed for scoring)

This is the simplest reliable setup and directly answers "my streaming iPhone
has no cellular."

1. **Turn on the hotspot** on the phone that *does* have cellular data.
2. Connect everything to that hotspot's Wi-Fi:
   - the **laptop** that runs the app (and OBS),
   - the **phone** you'll score the game on,
   - the **iPhone** you'll stream from.
3. On the laptop, start the app (`python3 server.py`). It prints a line like:
   ```
   Network: http://192.168.43.5:8082   <- open this on other devices...
   ```
4. Open that `http://192.168.x.x:8082` URL on the scoring phone. Set up the
   game, then open the game's **"Share / stream"** panel — it shows QR codes.
   Scan them from any device on the hotspot to open the scoreboard / overlay /
   scorekeeper instantly (no IP typing).
5. Stream:
   - **From the laptop with OBS (most reliable):** add a **Browser Source**
     pointing at the *OBS / streaming overlay* URL (it has `?transparent=1`), put
     it over your camera, and stream to YouTube/Twitch. The hotspot's cellular
     provides the upload bandwidth.
   - **From the iPhone:** use a broadcaster app that supports a **web/browser
     overlay** (e.g. Larix Broadcaster, Streamlabs). Point its overlay at the
     transparent scoreboard URL. The iPhone reaches the laptop over the hotspot
     Wi-Fi and reaches YouTube/Twitch over the hotspot's internet.

> Even with **no internet at all**, scoring and the scoreboard still work over
> the hotspot LAN — you just can't push the broadcast out to YouTube/Twitch
> until the hotspot has cellular data.

### Setup B — Deploy to a cloud host (easiest if you have internet everywhere)

If the hotspot has solid internet, the *least* fiddly option is to run the app
once on a small cloud host (Render, Railway, Fly.io, a cheap VPS) so it has a
permanent public URL. Then no IP discovery is needed at all:

1. Deploy with `gunicorn -k eventlet -w 1 wsgi:app` (see README "Production").
2. Open `https://your-app.example.com` on any device with internet.
3. Use the in-app QR codes exactly as above. The scoring phone, the streaming
   iPhone, and viewers all just need internet (the hotspot provides it).

## Streaming from an iPhone specifically

iOS won't composite a web overlay over the camera on its own. You need an app
that does it. Two paths:

- **App with a web/browser overlay** (Larix Broadcaster, Streamlabs, etc.):
  point its overlay at the **transparent scoreboard URL** from the Share panel.
  Best for an all-iPhone rig.
- **No suitable app / want full control:** run **OBS on a laptop** (Setup A).
  This is the most reliable and flexible, and the app was designed for it.

## Overlay tuning (OBS browser source URL params)

Append these to the scoreboard URL to fit your layout:

- `?transparent=1` — transparent background (already on the "overlay" share link)
- `?compact=1` — minimal single-line score ticker
- `?theme=dark|light` — color theme
- `?scale=1.5` — scale the whole overlay up/down
- `?hide=diamond,pitcher,linescore,count` — hide sections you don't want

Example: `…/scoreboard/1?transparent=1&compact=1&scale=2`

In OBS, leave **"Shutdown source when not visible" off** so the overlay keeps
receiving live updates during scene switches; it also auto-rejoins the game on
reconnect.

## Tips for a smooth game

- Do all setup (teams, rosters, lineups) on the hotspot **before** first pitch,
  while you have signal to spare.
- Keep the hotspot phone plugged in — streaming + hotspot drains battery fast.
- Test the overlay end-to-end once (record a play, confirm the scoreboard and
  OBS source both update) before you go live.
