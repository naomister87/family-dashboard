# Our Family Dashboard 🏠

A mobile-first, kawaii pastel family dashboard for **Arya**, **Delia**, **Dada** and **엄마**.

## Files

| File | What it is |
|---|---|
| `index.html` | Main app shell (loads `./styles.css`, `./app.js`, `./assets/*.png`) |
| `styles.css` | Full pastel theme |
| `app.js` | All logic, including `SyncEngine` (localStorage + BroadcastChannel + Firebase) |
| `assets/` | The four mascot avatars (cheetah / kitten / puppy / bunny) |
| `family-dashboard-standalone.html` | Single-file bundle: images, CSS and JS all inlined — works from anywhere |
| `.build/` | Source parts + build scripts (`build.py`, `build_standalone.py`, `smoke_test.py`) |

## Run it

Open `index.html` directly, serve the folder with any static server, or push to
GitHub Pages (all paths are relative `./…`, so a subpath like
`https://user.github.io/repo/family-dashboard/` works untouched).

The standalone file needs nothing else — double-click and go.

## Live sync (built-in family cloud)

The app ships with the family's Firebase project (`our-family-dashboard-3998f`)
already embedded:

- Realtime Database: `https://our-family-dashboard-3998f-default-rtdb.firebaseio.com`
- Email/Password sign-in. **Sign-up is disabled** — family accounts are created in
  Firebase Console → Authentication. Sessions persist in the browser.
- Database rules: `auth != null` for read/write (a copy of the rules guide is in Settings).
- First open shows the family sign-in gate; **"Try Demo Offline (Local Only)"** runs
  everything on-device without an account.

Every change (chores, study, missions, stamps, ledger, chat) syncs live across all
signed-in phones and tablets through `rooms/<room>/state`. Room ID is changeable in
Settings, and JSON export/import lives there too.

## Defaults

- Weather: **Port Monmouth, NJ (07758)** — lat 40.43011, lon −74.09847 via Open-Meteo;
  change city/ZIP or °F/°C in Settings.
- Allowance: Arya **$7/week**, Delia **$5/week**, approved by a parent on the Chores tab
  (optional 4-digit parent PIN, off by default, code `1234` if enabled).
- Delia's study list: School homework · Kumon Worksheet A (1 page) · Kumon Worksheet B
  (1 page) · Read a book (30 min, inline timer) · Book club.

## Rebuilding after edits

```
python3 .build/build.py              # assemble app.js / styles.css / index.html
python3 .build/build_standalone.py   # regenerate the single-file bundle
python3 .build/smoke_test.py         # 48 headless logic checks (QuickJS)
```
