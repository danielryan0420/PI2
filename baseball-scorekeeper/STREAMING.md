# Streaming guide

This app does **not** capture or broadcast video itself. It produces a live,
auto-updating **scoreboard** that you composite over your camera using a
streaming tool. This keeps it simple and works with whatever you already use.

## The one thing to understand: where the server runs

The app is a small web server. Every device that scores the game, shows the
scoreboard, or streams must be able to **reach that server over the network.**
If you can't bring a laptop to the field, the server can't run there — so host
it once in the cloud and everything just talks to a public URL.

## Recommended: all-mobile, no laptop

This is the setup for "I'm streaming from my iPhone, no laptop, and my other
phone provides a hotspot."

### One-time setup (at home, before game day)

1. **Deploy the app to the cloud** so it has a permanent public URL. The repo
   includes a `Dockerfile` and a `render.yaml`, so the easiest free option is
   [Render](https://render.com):
   - Because the app currently lives in the `baseball-scorekeeper/` subfolder of
     the `Physical_Inventory` repo: on Render choose **New > Web Service**, pick
     the repo, set **Root Directory = `baseball-scorekeeper`**, **Runtime =
     Docker**, and **Instance Type = Free**. Create it.
   - (If you later split this into its own repo with `render.yaml` at the root,
     you can instead use **New > Blueprint** for one-click setup.)
   - Render gives you a URL like `https://baseball-scorekeeper.onrender.com`.
   - Any container host works too (Railway, Fly.io, a small VPS) using the same
     `Dockerfile`.
2. Open that URL, log in (**scorekeeper / baseball**), and create your teams and
   rosters once. They'll be reused for every game.

> Note: on Render's **free** plan the service sleeps after inactivity and its
> disk is ephemeral — game data resets on restart. That's fine for streaming a
> single game you set up shortly beforehand. For durable season history, attach
> a persistent disk (paid) or use a managed database.

### Game day

1. **Turn on the hotspot** on the phone that has cellular data. Connect the
   streaming iPhone to it (that's how the iPhone gets internet).
2. **Score the game** from any phone/tablet with internet — open the cloud URL,
   create the game, set lineups, Start. Since the server is public, the scorer
   does **not** have to be on the same hotspot or even at the field; a friend can
   score from home watching the stream. Use the in-app **"Share / stream"** panel
   (QR codes) to hand the scorekeeper link to whoever is scoring.
3. **Stream from the iPhone** with a broadcaster app that supports a **web /
   browser overlay** (see below). Point its overlay at the **transparent
   scoreboard URL** from the Share panel
   (`…/scoreboard/<id>?transparent=1`), point the camera at the field, enter your
   YouTube/Twitch stream key, and go live. The overlay updates itself as plays
   are entered.

Because one person can't both film and tap in plays reliably, plan on a second
person (or a second device between innings) doing the scoring.

## Streaming from an iPhone: app choices

iOS won't composite a web overlay over the camera on its own — you need an app
that does. Best options:

- **Larix Broadcaster** (free, Softvelum) — a capable RTMP broadcaster that
  supports overlays, including web/HTML overlays you point at a URL. Set the
  overlay to your transparent scoreboard URL. Good all-iPhone choice.
- **Streamlabs (mobile)** — easy YouTube/Twitch streaming; overlay support is
  more limited/Streamlabs-hosted, so the transparent web overlay may not drop in
  as cleanly. Try Larix first for a custom web overlay.

Exact overlay menus change between app versions, so look for an "Overlays" /
"Web overlay" / "Add overlay > Web" option and paste the transparent URL.

### If your app can't do a web overlay

Fallback that needs no compositing: run the scoreboard on a **second phone or a
tablet** propped in the corner of the camera frame (open
`…/scoreboard/<id>` full screen). Lower-tech, but it always works and needs no
special app.

## Overlay tuning (URL params)

Append these to the scoreboard URL to fit your layout:

- `?transparent=1` — transparent background (already on the "overlay" share link)
- `?compact=1` — minimal single-line score ticker (good for a phone overlay)
- `?theme=dark|light` — color theme
- `?scale=1.5` — scale the whole overlay up/down
- `?hide=diamond,pitcher,linescore,count` — hide sections you don't want

Example for a compact phone overlay: `…/scoreboard/1?transparent=1&compact=1`

## Alternative: laptop + OBS (most reliable, if you ever can bring one)

If a laptop is available, OBS is the most flexible: run the app locally or use
the cloud URL, add the transparent scoreboard as a **Browser Source** over your
camera, and stream from OBS. Leave **"Shutdown source when not visible" off** so
the overlay keeps updating; it also auto-rejoins the game on reconnect.

When the app runs locally on a laptop, `python3 server.py` prints the LAN URL to
open on other devices on the same Wi-Fi/hotspot.

## Tips for a smooth game

- **Wake the cloud service** a few minutes before first pitch (free hosts sleep),
  and finish team/lineup setup before the action starts.
- Keep the hotspot phone plugged in — streaming + hotspot drains battery fast.
- Do one end-to-end test (record a play; confirm the stream overlay updates)
  before you go live.
- A heads-up on auth: the app has no real login session yet, so keep your cloud
  URL semi-private (don't post it publicly) until proper auth is added.
