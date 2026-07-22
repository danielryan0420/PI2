# Physical Inventory System — Functional Specification

This document is a complete, implementation-level spec of the app: every table, every
endpoint, every business rule, and every screen. It exists so the app can be **rebuilt
from scratch** (e.g. by an AI coding assistant on a different network) without needing
to read the original source. Everything here describes actual current behavior —
nothing is aspirational.

## 1. What this app is

A warehouse physical-inventory counting app. Counters walk the warehouse, submit counts
(material + quantity + location) from a phone or scanner. Office/admin staff review,
verify, or flag those counts, message counters back and forth, and produce a final
adjustment file to load back into SAP. A live dashboard tracks progress, variances, and
data-quality problems during the count event.

Two roles only: **counter** (submit counts, ask questions) and **admin** (everything —
review, verify/flag/edit, dashboard, user/session management, SAP data import, export).
"Office" in the UI text means an admin user.

## 2. Stack & architecture

- **Backend**: Python 3, Flask, single process, SQLite (WAL mode) via a hand-rolled
  migration runner (no ORM). `flask-cors` enabled globally. `openpyxl` for XLSX import.
- **Frontend**: React 19 + TypeScript + Vite, Tailwind CSS, `react-router-dom` v7.
  Built to `client/dist/`, which Flask serves directly as static files — there is no
  separate Node process in production, and no server-side rendering.
- **Realtime**: **none**. All "live" updates are plain polling via `setInterval` +
  `fetch`. A `socket.io-client` dependency and a `lib/socket.ts` wrapper exist in the
  frontend but are dead code — every function in it is a no-op (see §7 quirks).
- **Auth**: no sessions, no JWT, no cookies. Login is a single POST that checks
  username + password against a hashed password in the `users` table and returns the
  user's role. The frontend then stores `username`/`role` in `localStorage` and sends
  them back on every request as plain `x-username` / `x-role` headers (see §6.1 — this
  is a trust-the-client model, not a security boundary).
- **File uploads**: count photos go to a local `uploads/` folder on disk, filename
  `{count_id}_{uuid4}.{ext}`, served back at `/photos/<filename>`.
- **Deployment shape** (current instance, informational only — rebuild for your own
  network as appropriate): Flask app behind Waitress/Gunicorn on `localhost:8081`,
  fronted by nginx or IIS on port 80/443 so users hit a plain hostname/IP with no port.
  SQLite file + `uploads/` are the entire persistent state; back both up together.

## 3. Data model

All tables live in one SQLite file. IDs are `INTEGER PRIMARY KEY AUTOINCREMENT` unless
noted. Timestamps are `TEXT` (SQLite `datetime('now')`, UTC, no timezone suffix).

### 3.1 Core operational tables

**`users`**
| column | type | notes |
|---|---|---|
| id | INTEGER PK | |
| username | TEXT UNIQUE, case-insensitive (`COLLATE NOCASE`) | |
| role | TEXT | `counter` \| `admin` |
| password | TEXT | werkzeug `generate_password_hash`; empty string allowed (counter with no password) |
| created_at | TEXT | |
| last_active | TEXT NULL | updated on every `/api/*` request that sends `x-username` |

**`inventory_sessions`** — one row per physical-count event.
| column | type | notes |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT | e.g. "Q2 2026 Annual Count" |
| status | TEXT | `open` \| `closed` |
| created_at, closed_at | TEXT | |

Only counts/messages/snapshots tied to the currently-selected session are shown to
users; nothing enforces "only one open session" at the DB level, but the UI is built
assuming a counter picks one open session at login.

**`sloc_config`** — per-storage-location settings, keyed by SLOC code (SAP storage
location, e.g. `1010`).
| column | type | notes |
|---|---|---|
| sloc | TEXT PK | |
| description | TEXT | |
| wm_enabled | INTEGER (0/1) | if 1, count form requires a WM Bin |
| im_enabled | INTEGER (0/1) | if 1, count form requires a ZBIN |

**`counts`** — the core record: one physical count submission.
| column | type | notes |
|---|---|---|
| id | INTEGER PK | |
| session_id | FK → inventory_sessions | |
| username | TEXT | counter who submitted it |
| material_number | TEXT | |
| quantity | REAL | |
| sloc | TEXT | |
| wm_bin | TEXT NULL | required if SLOC has `wm_enabled` |
| zbin | TEXT NULL | required if SLOC has `im_enabled` |
| status | TEXT | `pending` (submitted, not reviewed) \| `verified` \| `flagged` |
| validation_warnings | TEXT NULL | JSON array of warning codes captured at submit time, e.g. `["material_not_found","wm_bin_not_found","fixed_bin_mismatch"]` |
| created_at, updated_at | TEXT | |

There is no `deleted` status in the schema — delete is a hard `DELETE FROM counts`
(cascades to its photos/messages). "Deleted" only appears as a filter value in some
queries for forward-compatibility; it's never actually written.

**`photos`** — 1:N off `counts`, `ON DELETE CASCADE`. `filename` is the on-disk name;
`original_name` is the user's original filename for display only.

**`message_threads`** — one thread per question a counter (or admin) raises.
| column | notes |
|---|---|
| session_id | FK, cascade delete |
| count_id | FK → counts, nullable, `ON DELETE SET NULL` (a "general" question not tied to a specific count) |
| title | the question text itself doubles as the thread title |
| created_by, created_by_role | |
| answered | 0/1 — flipped to 1 the moment any `admin`-role message lands in the thread |
| answered_by, answered_at | set when answered flips to 1 |

**`messages`** — belongs to a thread (new flow) and/or directly to a count and/or
session (legacy flow — both `count_id` and `thread_id` are nullable FKs, either or
neither may be set). `reply_to_id` self-references `messages` for inline quote-replies,
`ON DELETE SET NULL`. `role` is `counter` or `admin` (a stray `"office"` value from an
older build is normalized to `admin` on write, see §6.1).

**`audit_log`** — append-only event log for every count mutation.
| column | notes |
|---|---|
| count_id | FK → counts, `ON DELETE SET NULL` (history survives record deletion) |
| editor_username | |
| event_type | `create` \| `edit` \| `verify` \| `flag` \| `delete` |
| field_name, old_value, new_value | populated only for `edit` events, one row per changed field |
| reason | free text, required by the UI for edit/flag/delete |

**`wm_bins`** + **`wm_bin_materials`** — app-managed (not SAP-imported) list of WM bins
per SLOC, with storage type `100` (fixed bin) or `200` (secondary/random bin), and which
materials are assigned to a fixed bin. `wm_bin_materials` is `UNIQUE(bin_id,
material_number)`.

### 3.2 SAP reference/import tables

These are all "last upload wins" tables: every import endpoint does `DELETE FROM
<table>` then re-inserts every row from the uploaded file (full replace, not merge) —
**except** `sap_snapshot`, which deletes only rows for the target `session_id`, and
`sap_lqua`/`sap_ekko`/etc. which behave the same full-replace way per their own import.
Every importer accepts **both** friendly column names (`material_number`) and raw SAP
column names (`MATNR`) in the uploaded CSV/XLSX header — whichever is present wins,
friendly name checked first. Unmapped extra columns are preserved as a JSON blob in a
`raw_data` column where present (ekko, ekpo, aufk, resb, lqua) so nothing is silently
dropped.

| table | SAP source | key columns | purpose |
|---|---|---|---|
| `sap_materials` | MARA/MAKT | `material_number` PK | description, base UOM, material type/group |
| `sap_plant_data` | MARC | `(material_number, plant)` PK | MRP type per plant |
| `sap_valuation` | MBEW | `(material_number, valuation_area)` PK | standard/moving-avg price, total stock/value — drives "high value" dashboard |
| `sap_snapshot` | custom export at count-freeze time | scoped per `session_id` | the frozen SAP on-hand qty being counted against |
| `sap_mard` | MARD (MB52) | `(material_number, plant, storage_location)` unique | unrestricted/restricted/quality/return qty, value |
| `sap_mlgt` | MLGT (LS26) | `(material_number, plant, valuation_area, gl_account)` unique | WM storage type / GL mapping |
| `sap_mlgn` | MLGN (LS26) | none (append) | WM line-item detail |
| `sap_lqua` | LQUA (LS26) | none (append; rebuilt as bin/quant-level in migration 019) | bin-level quant qty (`verme`=available, `menge`=total) — drives WM Discrepancies |
| `sap_storage_locations` | T300T | `code` PK | SLOC master data (feeds SLOC Config screen) |
| `sap_lgap` | storage bin master | `(bin_code, plant, storage_location)` unique | bin existence + storage type — drives bin-exists validation |
| `sap_mseg` | MSEG (MB51) | none (append) | material movements; `movement_type` drives "problem materials" (201/202 receipt, 221/222 usage, 309 transfer, 911/912 adjustment) |
| `sap_lgplo` | MM02 WM2 tab | `(material_number, warehouse_number, storage_type)` unique | fixed-bin assignment — drives fixed-bin-mismatch warning |
| `sap_ekko` | EKKO (ME2M) | `ebeln` PK | PO headers |
| `sap_ekpo` | EKPO (ME2M) | `(ebeln, ebelp)` unique | PO line items — paired with EKKO + MSEG(101/161) to compute open PO qty |
| `sap_aufk` | AUFK+AFKO (CO03) | `aufnr` unique | production/process orders |
| `sap_resb` | RESB (MB25) | `(rsnum, rspos)` unique | open reservations |
| `material_exclusions` | manual CSV | `material_number` PK | materials to hide from the final SAP adjustment export only (still countable) |

## 4. Roles & auth model (§6.1 has the exact header contract)

- **counter**: can hit `/count` route only (plus its Messages tab). Submits counts,
  views only their own counts (`/counts/mine`), asks questions.
- **admin**: everything, including `/review` (verify/flag/edit/delete counts, answer
  messages), `/dashboard`, `/admin` (users, sessions, SAP imports, export, SLOC config).
- Login: `POST /api/login` with `{username, password}`. Looks up user
  case-insensitively, verifies password hash, returns `{id, username, role}`. No
  password → any password accepted for that user (used for counters with blank
  passwords). No such user, or wrong password → 401.
- Seed users created on first boot (`init_db.py`, auto-run on every server start):
  `admin`/`StopGap` (admin), `counter1` and `counter2` with blank passwords (counter).
  **Change the admin password immediately in any real deployment.**

## 5. Business rules that aren't obvious from a schema dump

These are the rules most likely to get silently dropped if you rebuild from a casual
read — implement them explicitly.

1. **First Pass Yield** (dashboard) = % of `verified` counts that have **zero** `edit`
   audit-log events against them. `null` (shown as "—") if there are zero verified
   counts, not 0%.
2. **Recount flow**: when office flags a count, the counter's UI shows a "Recount"
   button. Recounting does **not** create a new row — it `PATCH`es the same `counts.id`
   with the new quantity and resets `status` back to `pending`, logging an `edit` audit
   event with reason "Recount submitted". The original count ID is preserved end-to-end.
3. **Count-entry validation warnings** are advisory only — submission is never blocked.
   At submit time the client checks three things and, if any fail, (a) still submits
   the count with a JSON warnings array in `validation_warnings`, and (b) the server
   auto-posts a `SYSTEM`-sender message into that count's thread so admins see it in
   their Messages inbox:
   - `material_not_found`: material number has no row in `sap_materials`.
   - `wm_bin_not_found`: bin code has no row in `sap_lgap`.
   - `fixed_bin_mismatch`: the bin *is* a storage-type-`100` bin in `sap_lgap`, the
     material *does* have a fixed-bin assignment in `sap_lgplo` for that storage type,
     but the assigned bin ≠ the bin the counter entered.
   - Separately (not stored as a warning code, shown inline only): open PO / open
     production-order / open-reservation quantities for the material are shown as
     informational amber banners (see rule 4) but never block or get persisted beyond
     the count itself.
4. **Open order/reservation detection** (`OrderValidationService.get_material_warnings`,
   used both at count-entry time and in the "Over Snapshot" / "Reservations" dashboard
   tabs):
   - **Open PO qty** = `EKPO.menge − SUM(MSEG.quantity WHERE movement_type IN ('101','161') AND matching ebeln/ebelp)`, only for EKPO rows where `loekz` (deletion flag) and `elikz` (delivery-complete flag) are both blank, and only when that computed open qty is `> 0`.
   - **Open production/process order qty** = `AUFK.gamng − AUFK.wemng` (planned minus delivered), only where `loekz` is blank and `sysst` does NOT contain `TECO` or `CLSD`, and result `> 0`.
   - **Open reservation qty** = `RESB.bdmng − RESB.enmng` (required minus withdrawn), only where `kzear` (final issue flag) is blank, and result `> 0`.
5. **Fixed bin check** (`WmBinService.check_fixed_bin`): only meaningful when the
   entered bin's `sap_lgap.storage_type == '100'`. If the material has no row in
   `sap_lgplo` for that storage type, treated as "no assignment, no mismatch" (passes
   silently). Bin/material comparisons are case-insensitive (`.upper()`).
6. **SAP Adjustment Export** (`ImportService.get_adjustment_export`) — the actual
   deliverable handed back to SAP after a count:
   - Source: `sap_snapshot` rows for the session, `LEFT JOIN`ed to `counts` on
     `(material_number, sloc, session_id)`.
   - Only materials that were **actually counted** appear (`HAVING COUNT(counts) > 0`)
     — uncounted snapshot rows are excluded entirely, not shown as zero-adjustment.
   - Counts with `status IN ('deleted','flagged')` are excluded from the summed counted
     qty (in practice `deleted` never occurs since deletes are hard-deletes, so this
     only filters out flagged/unresolved counts).
   - Rows where `material_number` is in `material_exclusions` are dropped.
   - Only rows where `|counted − snapshot| > 0.0001` survive (floating point epsilon,
     not `!= 0`).
   - `adjustment = counted_qty − snapshot_qty` (positive = add stock in SAP, negative =
     reduce).
7. **Counts-over-snapshot** (dashboard warning tab): same snapshot/count join as above
   but the direction is reversed and no exclusion-list filter is applied — flags any
   material/SLOC where `SUM(counted) > snapshot_qty`, enriched with open PO / open
   order / open reservation *counts* (not quantities) as a "why this might be
   legitimately high" signal.
8. **WM discrepancies** (dashboard tab): joins counts (grouped by material+bin+SLOC,
   status ≠ deleted, bin non-empty) against `sap_lqua` matched on `(matnr, lgpla)` —
   note: **not** also matched on SLOC/warehouse, so if the same bin code exists in
   multiple warehouses this can cross-match. Flags where
   `|counted_qty − lqua.verme| > 0`, including the case where the material has zero
   rows in LQUA for that bin at all (shown as "Not in LQUA" rather than a numeric
   diff, when `lqua_available == 0 AND counted_qty > 0`).
9. **Reservation-output warnings** (dashboard tab): materials counted **below**
   snapshot (`SUM(counted) < snapshot_qty`) that also have open RESB reservations —
   i.e. "don't post a negative SAP adjustment for this material, production still needs
   to draw against it."
10. **"Problem materials"** (session-independent, all-time across `sap_mseg`): a
    material qualifies if `adj_count >= 2` (movement_type 911/912) OR
    `movement_count >= 5` total. Priority badge: `HIGH` if `adj_count >= 5`, `MEDIUM` if
    `>= 2`, else `LOW`. Top 50 by adjustment count then total movement count.
11. **"High value" materials** (dashboard, currently computed but not surfaced as a
    dedicated tab in the current UI — kept for API completeness): top 20 by
    `sap_valuation.total_value`, joined to the *most recent* count for that material in
    the session (via `ROW_NUMBER() OVER (PARTITION BY material_number ORDER BY
    updated_at DESC)`), not scoped to SLOC.
12. **User "online" status** (Admin → Users): a green dot if `last_active` is within
    the last 10 minutes. `last_active` is updated as a side effect of *any* `/api/*`
    call that carries an `x-username` header (see `_track_activity` before-request
    hook) — it is not a heartbeat endpoint, just an incidental side effect of normal
    usage, and failures to update are silently swallowed.
13. **Available SLOCs** (`SlocConfigService.get_available_slocs`): a `UNION` of every
    SLOC in `sap_storage_locations` (imported from T300T) and every SLOC that has an
    explicit row in `sloc_config` (manually configured, even if never imported from
    SAP) — so a SLOC can exist purely from manual entry with no SAP master data behind
    it, or purely from import with WM/IM both defaulting to off until an admin toggles
    them.
14. **Message role normalization**: any role value other than exactly `counter` or
    `admin` (legacy `"office"` values, or a missing header) is coerced to `admin` on
    write, both for plain messages and for threads.
15. **CSV/XLSX import parsing**: `.xlsx` uses the first sheet's first row as headers via
    `openpyxl`; blank rows (`not any(row)`) are skipped. Everything else is treated as
    CSV/TSV-ish text decoded `utf-8-sig` (so a BOM doesn't leak into the first header
    name) via `csv.DictReader`. There is no explicit delimiter sniffing — TSV files
    would need a literal tab delimiter to parse correctly, which the current code does
    not configure (potential existing bug, preserved as-is).

## 6. API reference

Base path `/api`. All bodies/responses are JSON except photo upload (multipart) and
CSV/XLSX import (multipart) and the two export endpoints (raw CSV with a
`Content-Disposition: attachment` header). No endpoint requires a bearer token; several
rely on plain custom headers described next.

### 6.1 Header contract (this is the entire "auth" layer post-login)

- `x-username`: the acting user's username, sent on almost every write and on several
  reads. Trusted as-is by the server — there is no signature or session check tying it
  back to the `/login` call.
- `x-role`: `counter` or `admin`, same trust model. Some endpoints also accept the role
  in the request body instead (`role` field) — body value wins if both are present in
  the message-creation endpoints.
- Because of this, **role/route enforcement lives entirely in the React router**
  (`ProtectedRoute` in `App.tsx`, `RoleGate` component) — the Flask API itself does not
  reject a counter's `x-role: admin` header. A faithful clone must decide whether to
  keep this trust model or add real server-side authorization; the original app has
  none.

### 6.2 Auth

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/login` | `{username, password}` | `{id, username, role}` · 401 on bad creds, 400 if username missing |

### 6.3 Users

| Method | Path | Notes |
|---|---|---|
| GET | `/users` | list all, `id, username, role, created_at, last_active` |
| POST | `/users` | upsert-by-username: if exists, updates role (+password if given); else creates. 201 on create |
| GET | `/users/<username>` | 404 if missing |
| PATCH | `/users/<int:id>` | body `{role}`, required |
| DELETE | `/users/<int:id>` | 204 |

### 6.4 Sessions

| Method | Path | Notes |
|---|---|---|
| GET | `/sessions` | all sessions, newest first |
| POST | `/sessions` | `{name}` → 201 |
| GET | `/sessions/<id>` | 404 if missing |
| POST or PATCH | `/sessions/<id>/close` | sets status=closed, closed_at=now |
| GET | `/sessions/<id>/stats` | `{total, verified}` |

### 6.5 Counts

| Method | Path | Notes |
|---|---|---|
| POST | `/sessions/<id>/counts` | creates a count; also fires the SYSTEM validation message (rule §5.3) when `validation_warnings` is present. 400 on any exception (e.g. bad quantity) |
| GET | `/sessions/<id>/counts` | filters via query params: `material` (LIKE %x%), `status`, `username`, `sloc` |
| GET | `/sessions/<id>/counts/mine` | `username` from query or `x-username` header, required |
| GET | `/counts/<id>` | 404 if missing |
| PATCH | `/counts/<id>` | accepts either flat fields or `{changes: {...}}`; also accepts `editor_username` OR `editedBy` OR the `x-username` header (checked in that order); `reason` logged per-field in audit_log. Only `quantity, wm_bin, zbin, status, material_number, sloc` are mutable — anything else silently ignored |
| POST or PATCH | `/counts/<id>/verify` | sets status=verified; accepts `editor_username` OR `verifiedBy` OR header |
| POST or PATCH | `/counts/<id>/flag` | sets status=flagged; accepts `editor_username` OR `flaggedBy` OR header; `reason` recommended (UI enforces it, API does not) |
| DELETE | `/counts/<id>` | hard delete; cascades photos+messages; audit event logged first with reason "Record deleted by admin" |

### 6.6 Photos

| Method | Path | Notes |
|---|---|---|
| POST | `/counts/<id>/photos` | multipart, field name **`photo`** (singular — see §7 quirk), jpg/jpeg/png only, saved as `{count_id}_{uuid4}.{ext}` |
| GET | `/counts/<id>/photos` | list, newest first |
| DELETE | `/photos/<id>` | removes DB row + file on disk (best-effort, ignores OS errors) |
| GET | `/photos/<filename>` (not under `/api`) | serves the raw file |

### 6.7 Messages (legacy, count/session-scoped — still used for the SYSTEM validation alerts)

| Method | Path | Notes |
|---|---|---|
| POST | `/sessions/<id>/messages` | `{sender, role, body, count_id?}`; role normalized per §5.14 |
| GET | `/sessions/<id>/messages` | optional `?count_id=` filter; otherwise all messages (general + count-linked) for the session, enriched with `material_number`/`sloc` |
| GET | `/sessions/<id>/messages/mine` | messages where the counter is either the sender of a general message or the owner of the linked count |
| GET | `/sessions/<id>/messages/general` | `count_id IS NULL` only |
| DELETE | `/messages/<id>` | 404 if missing |
| GET / POST | `/counts/<id>/messages` | convenience wrapper scoped to one count |

### 6.8 Threads (current Q&A flow used by both CounterPage Messages tab and OfficePage Messages tab)

| Method | Path | Notes |
|---|---|---|
| POST | `/sessions/<id>/threads` | body `{title, count_id?}`; `x-username` required (400 without it), `x-role` defaults to counter |
| GET | `/sessions/<id>/threads` | **role-scoped**: a counter only sees threads they created or that are linked to their own counts; an admin sees all threads for the session, unanswered-first |
| GET | `/threads/<id>/messages` | ordered by `sent_at`, each enriched with `reply_to_sender`/`reply_to_body` if it's a reply |
| POST | `/threads/<id>/messages` | body `{body, reply_to_id?}`; posting as `admin` role auto-flips `answered=1` on the thread |

### 6.9 SLOC config

| Method | Path | Notes |
|---|---|---|
| GET | `/sloc-config` | all configured SLOCs |
| GET | `/sloc-config/available` | union with SAP T300T import, see §5.13 |
| POST | `/sloc-config` | create/replace (`INSERT OR REPLACE`) |
| GET / PATCH / DELETE | `/sloc-config/<sloc>` | PATCH is really the same upsert as POST |

### 6.10 Materials & validation

| Method | Path | Notes |
|---|---|---|
| POST | `/materials` | manual upsert of one material |
| GET | `/materials/<matnr>` | 404 if missing |
| GET | `/materials/search/<query>` | LIKE match on number or description, limit 50 |
| GET | `/validate/material/<matnr>` | `{exists: bool}` |
| GET | `/validate/wm-bin/<bin>` | `{exists: bool}` against `sap_lgap` |
| GET | `/validate/fixed-bin?material=&wm_bin=` | full object per §5.5 |
| GET | `/validate/open-orders?material=` | full object per §5.4 |

### 6.11 WM bins (app-managed, not imported)

| Method | Path | Notes |
|---|---|---|
| POST | `/wm-bins` | `{bin, storage_type, sloc, description}` |
| GET | `/wm-bins?sloc=&storage_type=` | `sloc` required |
| POST | `/wm-bins/<id>/materials` | assign a material to a fixed bin |
| GET | `/wm-bins/<id>/materials` | |
| DELETE | `/wm-bins/<id>` | cascades bin-material links |
| DELETE | `/wm-bins/<id>/materials/<matnr>` | |

### 6.12 Imports (all POST, multipart `file` field, all return `{imported: <row count>}`)

`/imports/mara`, `/makt` (both route to the same materials importer), `/plant-data`,
`/valuation`, `/mard`, `/mlgt`, `/mlgn`, `/lqua`, `/storage-locations`, `/lgap`,
`/mseg`, `/lgplo`, `/ekko`, `/ekpo`, `/aufk`, `/resb`, `/exclusions`. Plus
`/imports/snapshot` which additionally requires a `sessionId` form field and only
replaces that session's snapshot rows. `GET /imports/status` returns `{table_name:
{count, updated_at}}` for every importable table. `GET /imports/exclusions` lists the
current exclusion rows.

### 6.13 Cross-checks / dashboard warning feeds

| Method | Path | Rule |
|---|---|---|
| GET | `/sessions/<id>/counts-over-snapshot` | §5.7 |
| GET | `/sessions/<id>/wm-discrepancies` | §5.8 |
| GET | `/sessions/<id>/reservation-warnings` | §5.9 |

### 6.14 Export

| Method | Path | Notes |
|---|---|---|
| GET | `/sessions/<id>/export?format=csv` | every count row for the session, columns: id, material_number, quantity, sloc, wm_bin, zbin, status, username, created_at, updated_at. **Note**: the `format` query param is accepted but only CSV is actually implemented server-side — `xlsx`/`tsv` selections in the Admin UI currently produce the same CSV output (existing gap, documented not fixed) |
| GET | `/sessions/<id>/export/adjustments` | the SAP adjustment file, §5.6 |

### 6.15 Audit

| Method | Path |
|---|---|
| GET | `/counts/<id>/audit` |
| GET | `/sessions/<id>/audit` |

### 6.16 Dashboard

| Method | Path | Returns |
|---|---|---|
| GET | `/sessions/<id>/dashboard/summary` | totals by status, first-pass-yield, snapshot progress, unread-thread count, per-SLOC breakdown, per-counter activity, 24h hourly trend |
| GET | `/sessions/<id>/dashboard/materials` | every snapshot row joined to its counts, with a derived status: `not_counted` / `pending` / `verified` / `variance` (verified but counted≠snapshot) / `flagged` |
| GET | `/sessions/<id>/dashboard/users` | per-user total/verified counts + distinct materials |
| GET | `/sessions/<id>/dashboard/discrepancies` | per-SLOC SAP total vs counted total |
| GET | `/dashboard/problem-materials` | §5.10, **not session-scoped** |
| GET | `/sessions/<id>/dashboard/high-value` | §5.11 |

### 6.17 Misc

- `GET /health` → `{ok: true, time}`.
- `GET /cert` → downloads `cert.pem` if present (HTTPS setup helper), 404 otherwise.
- `GET /` and any non-`/api` path → serves the built React `index.html` /
  static asset (SPA catch-all routing).

## 7. Frontend — screens & behavior

Router (`App.tsx`): `/` → EntryPage (login), `/count` → CounterPage (counter+admin),
`/review` → OfficePage (admin only), `/dashboard` → DashboardPage (admin only), `/admin`
→ AdminPage (admin only). Unknown paths redirect to `/`. Role gating is client-side only
(`ProtectedRoute`) — see §6.1.

**Global state** (`SessionContext`, backed by `localStorage` keys `inv_username`,
`inv_role`, `inv_session`): username, role, active session object, and the list of
SLOC configs (re-fetched whenever the session changes, e.g. on page refresh). Signing
out clears all three keys. **`ToastContext`** provides a simple 4-second auto-dismiss
toast queue (success/error/info) rendered bottom-right.

**AppShell**: top bar with logo, role-filtered nav links (Count / Review / Dashboard /
Admin), session name badge, role badge, username, and an "Exit" button that clears the
session and returns to `/`.

**EntryPage** (`/`): username + password fields, and a list of *open* sessions to pick
from (auto-selected if there's exactly one). On submit: `POST /login`, then `GET
/sloc-config`, store everything, route by role. Errors show as toasts, not inline.

**CounterPage** (`/count`): two tabs.
- *Count Entry*: `CountForm` on the left, live "My Counts" list on the right (polls
  `/counts/mine` every 5s, diffed by JSON-stringify so it doesn't re-render
  unnecessarily), plus a 3-up stat strip (counted/verified/flagged). Flagged cards show
  a "Recount" button (see rule §5.2).
- *Messages*: `MessagesPanel` — thread sidebar (unanswered first, then answered) +
  message thread view with inline reply-to-message quoting, "New question" box at the
  bottom of the sidebar. Polls threads every 8s.
- `CountForm` details: material number field triggers (debounced 600ms) both a
  material-master lookup (shows description or a red "not in master data" warning) and
  an open-order/reservation check (amber informational warnings, non-blocking). WM
  bin field (only rendered if the selected SLOC has `wm_enabled`) triggers (debounced
  400ms) an existence check and, jointly with the material number, a fixed-bin-mismatch
  check. ZBIN field only rendered if SLOC has `im_enabled`; not validated. Form state
  (all fields) is persisted to `localStorage` (`countFormState`) so a page
  refresh/reload doesn't lose in-progress input; cleared on successful submit (SLOC and
  username retained). Barcode scanning is available on the material/WM-bin/ZBIN fields
  via a camera modal (falls back to file-input capture on browsers without live
  `mediaDevices`, since camera streaming requires HTTPS). An optional "ask office a
  question" textarea posts a new thread linked to the just-created count. A photo
  upload widget appears only after the first successful submit of a session (needs a
  `count_id` to attach to).
- Help: a `?` button opens context-sensitive help text specific to the active tab.

**OfficePage** (`/review`): two tabs, URL-syncable via `?tab=`.
- *Review*: filter bar (material/SLOC/user text filters + status dropdown), a table of
  counts (polls every 5s) with inline Verify (✓, hidden once verified) / Edit (✎) / Flag
  (⚑, hidden once flagged) actions. Edit opens a dialog requiring a reason; also offers
  "Delete Record" from within the edit dialog (separate confirm dialog). Flag opens a
  dialog requiring a reason. All three actions hit the endpoints in §6.5 and optimistically
  patch local state before the next poll confirms it.
- *Messages*: two-pane layout — thread list (needs-reply / answered sections) on the
  left, selected thread + reply box on the right, admin can delete any message
  (confirm dialog) and reply with inline quote-reply. Auto-selects the first
  unanswered thread (or first thread if all answered) when the tab loads. Polls every
  6s.

**DashboardPage** (`/dashboard`): 8 tabs — Overview, Materials, Variance, Problem
Materials, Over Snapshot, WM Discrepancies, Reservations, Audit Log. Overview
auto-refreshes every 60s with a "Xs/m ago" freshness indicator; other tabs load once
and require a manual refresh button (which reloads *all* tabs' data at once via
`Promise.all`). Overview shows: 4 KPI cards (count status stacked bar, first-pass
yield with color thresholds ≥80% green / ≥60% amber / else red, snapshot progress,
unread-messages card that's clickable and routes to `/review?tab=messages`), a donut
chart (hand-rolled SVG, not a charting library) + per-SLOC stacked bars, a counter
activity table, and a 24h hourly bar chart (also hand-rolled SVG/divs). Materials tab
is a sortable/filterable/color-coded-by-status table of every snapshot row. Variance
tab aggregates by SLOC. Problem Materials, Over Snapshot, WM Discrepancies, and
Reservations tabs are each a warning banner + a straightforward data table per their
respective business rule in §5. Audit Log groups entries by count, collapsed by
default, showing a summary row (last event) with an expand toggle to see every field
change; capped at showing 25 groups by default with a "show all" toggle.

**AdminPage** (`/admin`): four tabs.
- *Users & Sessions*: create/close sessions; add/remove users, change role inline via a
  `<select>`, online/offline dot (§5.12), last-active display.
- *SAP Data*: one card per import table (§3.2) with current row count + last-updated
  timestamp, and a file-upload control. MARA/MAKT share one card+endpoint pairing per
  table but are two separate upload buttons hitting two separate endpoints that do the
  same thing.
- *Export*: the SAP Adjustment Export button (primary deliverable) and the Full Count
  Data export with format/date-range controls (date range is collected in the UI but
  **not actually sent to or honored by** the export endpoint — existing gap, documented
  not fixed).
- *SLOC Config*: table of all available SLOCs (§5.13) with WM/IM toggle buttons and a
  delete button per row.
- Help: a `?` button per tab with tab-specific bullet content.

## 8. Known quirks / existing gaps (preserve intentionally, or fix — your call)

These are real discrepancies in the current app. Since the ask was to spec "everything
as-is," they're listed here rather than silently corrected:

1. **Photo upload field-name mismatch**: `PhotoCapture.tsx` builds its `FormData` with
   the field name `photos` (plural) and appends every selected file to it, but the
   Flask endpoint reads `request.files['photo']` (singular, single file only). In the
   current app this means multi-photo capture silently fails server-side (whatever
   photo the browser preview shows locally didn't actually upload) unless the field
   name coincidentally matches. Confirm intended behavior before rebuilding this path.
2. **`socket.io-client` is a dependency and `lib/socket.ts` exists, but every exported
   function is a no-op** — there is no real-time layer at all; every "live" update is
   `setInterval` polling (5s counts, 5–8s messages/threads, 60s dashboard overview).
   Don't spend effort recreating socket infrastructure unless you intend to actually
   wire it up.
3. **Export format/date-range controls in Admin → Export don't do anything** — the
   dropdown and date pickers are collected in state but the request to
   `/sessions/<id>/export` never sends them, and the endpoint itself only emits CSV
   regardless of the `format` query param's value.
4. **No server-side role/session enforcement** — see §6.1. `x-username`/`x-role`
   headers are trusted as-is with no verification back to a real login session.
5. **CSV/TSV import**: no delimiter auto-detection — a real tab-delimited file would
   currently be parsed as comma-delimited (single-column result) unless the importer
   code is extended.
6. **WM discrepancy bin matching** (§5.8) matches `sap_lqua` by material + bin only,
   not also by warehouse/SLOC, so a bin code reused across warehouses can cross-match
   incorrectly.
7. **Default admin password is `StopGap`**, seeded on every fresh DB and reset on server
   boot if the admin user doesn't yet exist — treat as a setup-time default to rotate
   immediately, not a secret.

## 9. Suggested rebuild order

If recreating from this spec with an AI pairing tool, this order keeps each step
testable against the previous one:

1. Schema (§3) + migration runner (or a plain `CREATE TABLE IF NOT EXISTS` set — the
   original's incremental-migration-file approach is an implementation detail, not a
   requirement).
2. Auth + users + sessions endpoints (§6.2–6.4), seed data.
3. Counts CRUD + audit log (§6.5, §5.1–5.2).
4. Photos (§6.6, fixing or keeping the quirk in §8.1 — decide explicitly).
5. Messages/threads (§6.7–6.8, §5.14).
6. SLOC config + materials + WM bins (§6.9–6.11).
7. SAP imports (§6.12, §3.2) — build the generic "accept friendly-or-SAP column names,
   stash extras in raw_data" pattern once, reuse per table.
8. Validation endpoints (§6.10 bottom half, §5.3–5.5) — wire into the count form.
9. Cross-check/dashboard-warning queries (§6.13, §5.6–5.11) — these are the most
   logic-dense part of the app; port the SQL rules exactly, they encode real inventory
   accounting decisions, not incidental implementation.
10. Export endpoints (§6.14).
11. Frontend screens (§7), roughly in the order: Entry → Counter → Office → Admin →
    Dashboard, since each depends on data the previous step's backend work unlocked.
