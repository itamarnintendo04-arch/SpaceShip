# 🚀 SpaceShip

A space shooter: fly your ship, blast meteors and enemy ships, collect coins and diamonds, buy new ships and upgrades, and play together with friends in real time.

Website and downloads: the `site/` folder (see [Website](#website)). All builds: [Releases](https://github.com/itamarnintendo04-arch/SpaceShip/releases/latest).

## Download

| Device | File | How to install |
|---|---|---|
| iPhone / iPad | signed link on the website, or `SpaceShip-iOS-unsigned.ipa` | website button, or sideload the unsigned `.ipa` with Sideloadly / AltStore |
| Android | `SpaceShip.apk` | open it on the phone and allow "install unknown apps" |
| Windows | `SpaceShip-Setup-….exe` / `SpaceShip-Portable-….exe` | installer, or run without installing |
| macOS | `SpaceShip-…-mac.dmg` | first launch: right-click the app → Open |
| Linux | `SpaceShip-….AppImage` | `chmod +x` and run |

## What's in the game

### 4 worlds × 500 levels
Four regular worlds of 500 levels each. They open in order: a world opens when you finish level 500 of the one before it. Each world has its own meteors, enemy ships, background and music:
1. ☄️ **Asteroid Belt**: red scout ships
2. ❄️ **Frozen Nebula**: ice saucers, with an aurora in the background
3. 🌋 **Lava Galaxy**: spiked fire raiders, with flames and embers in the background
4. 🌀 **Void Core**: warships that fire three shots at once, with a black hole in the background

Enemy ships sway side to side and shoot back. Every 5th level is a boss (a mothership). Difficulty rises with the level and levels off, so level 500 is hard but beatable. Each level gives 1–3 stars.

### 20 secret worlds and diamonds
Secret worlds hide in world 1. Each one opens through a special task: a golden comet, beating a boss without getting hit, crystals, golden meteors, coins, a no-hit level, a speed run. The hint appears on the levels screen. Clearing a secret level for the first time gives **diamonds**.

### Shop
- **Coin ships**, from Falcon up to Comet (7,500), Nebula (10,000), Titan (15,000) and Vortex (20,000).
- **Diamond ships**: Phoenix, Ghost, Crystal, Superstar, Void (80), Aurora (100) and Supernova (150), the strongest.
- Every ship has its own weapon and animation: faster fire, more damage, side shots and its own shot style. The pricier the ship, the stronger it is. Stats are shown in the shop.
- **Upgrades**: cannon, shields, magnet, lives, fire rate, power-up time and lucky coins (+10% per level).
- **Diamond powers**: plasma cannon, double shield, super magnet, golden heart, second chance (revive once per game) and a helper drone that fires next to you.
- **Auras** (trail, orbit, storm) and many avatars.
- **Convert diamonds**: 1 diamond = 10 coins.

### Coupon codes and free gifts
Players open **Codes & gifts** from the main menu. There they can type a coupon code, or claim a free gift with one tap. A red dot on the button means a free gift is waiting.

Codes live in the Supabase table **`coupons`**. Add or edit a row in *Supabase → Table Editor → coupons* and it works in the game right away, with no new build:

| Column | Meaning |
|---|---|
| `code` | the code players type (3–32 letters, digits, `-` or `_`; not case sensitive) |
| `coins` / `gems` | coins and diamonds the code gives |
| `max_uses` | total number of players who can use it (empty = unlimited) |
| `starts_at` / `expires_at` | optional time window |
| `active` | untick to turn the code off |
| `is_gift` | tick to show it as a **free gift** with a *Claim* button, so nobody needs to type the code |
| `note` | text shown with a free gift |

Each player can use a code once. Who used what is kept in `coupon_redemptions`. A `WELCOME` gift (500 coins + 10 diamonds) is there to start with. SQL: `supabase/coupons.sql`.

### Live events
Events run from the server. Add a row to the Supabase table **`game_events`** and every player sees it within a few minutes, with no new build. Events show as a banner in the main menu with a countdown ("Live event · ends in 2d 5h", or "Coming soon" up to a day before they start).

| Column | Meaning |
|---|---|
| `title`, `body` | banner text |
| `coins_mult` | coin multiplier while it runs (2 = double coins, max 10) |
| `gems_per_win` | extra diamonds for every level won |
| `starts_at` / `ends_at` | when it runs |
| `color` | banner color, e.g. `#f59e0b` |
| `active` | untick to stop it early |

When several events run at once, the highest multiplier applies and the diamonds add up. SQL: `supabase/events.sql`.

### Friends, clubs and chat
- **Friends**: search by `@handle` or name and send a request. The other player has to accept it.
- **Clubs** (parties) of up to 10 players, with a name, description, logo (16 to choose from) and a code. Public clubs show up in search. Private clubs are joined with the code only.
- **Ranks**:
  - 👑 **Leader**: can do everything. Appoints seniors, co-leaders or a new leader, sets blocked words and kicks members. Making someone leader shows a warning with CONFIRM / CANCEL, and the old leader becomes co-leader.
  - ⭐ **Co-leader**: changes the name, description and logo, demotes a senior to member, and can kick anyone except the leader.
  - 🔷 **Senior**: can change the club logo.
  - **Member**: the regular rank.
- **Club chat** in real time. Words the leader blocks show as `#` per letter, in old messages too.
- The member list always shows who is **online**, who is **in a room** and who is offline. Tapping a member lets you play together (even if you are not friends), ask to join their room, add them as a friend or open their **profile**.

### Rooms
Up to 10 players in a room, each with their own ship on the same screen. Everyone taps "Ready". When all are ready (at least 2), the host starts. The host picks the level inside the game, from levels everyone has unlocked. After a win: "Next level". A secret world found in a room opens for everyone in it. Friends in a room show "Ask to join".

### Accounts on many devices
- Every player has a name and a unique `@handle`.
- Add an email to sign in on other devices: a **6-digit code** arrives by email. The email is a designed HTML message, in Hebrew for Hebrew players and English for everyone else.
- Sign in on another device: "I have an account" → **email** → 6-digit code.
- Sign in with **CutVid** (OAuth, or CutVid email + password inside the game).
- Several accounts on one device, each with its own progress.

### Desktop extras
Two players on one computer (WASD + arrows, or two gamepads). Mouse, keyboard and gamepad control. Extra glow, trails and particles. F11 for full screen, P to pause.

### More
- **14 languages**, English by default: English, עברית, العربية, Español, Français, Deutsch, Русский, Português, Italiano, Türkçe, 中文, 日本語, 한국어, हिन्दी. Hebrew and Arabic are right-to-left. Texts are in `www/js/i18n.js`.
- **Portrait and landscape** modes.
- **Loading screen** with a mini level you can play while the game connects.
- **Original music** generated live with Web Audio, with no audio files: loading, menus, and a track for each world. Volume is in Settings.
- **Notifications** for invites, friend requests, friends coming online and news to all players: broadcast event `news` on channel `ss-lobby` with `{"title": "...", "body": "..."}`.

## Builds

`.github/workflows/build.yml` runs on every push. Pushes that only change `site/` or `.md` files are skipped. It builds Android, Windows, Linux, macOS and iOS and publishes them as a GitHub Release (`release-N`, version `1.1.N`). You can also start it by hand: *Actions → Build SpaceShip apps → Run workflow*.

The iOS build is **unsigned**. For a signed iPhone download, sign it yourself and put the link in the website's `IOS_DOWNLOAD_URL` (below).

## Website

`site/` is a static download page with a small Vercel function. It shows features, the worlds, screenshots and a download button for every device, in Hebrew and English. It also detects the visitor's device and highlights that download.

- Android / Windows / macOS / Linux links, the version and file sizes come from the latest GitHub release automatically (`site/api/config.js`).
- **iPhone**: set the Vercel environment variable **`IOS_DOWNLOAD_URL`**. It can be a direct signed `.ipa`, an `itms-services://` link, TestFlight or the App Store. Optional: `IOS_NOTE`, a short line shown under the iPhone button. Redeploy after changing it. While it is empty, the button shows "Coming soon".

Deploy: Vercel → Add New → Project → import this repo → **Root Directory `site`**, Framework **Other** → Deploy.

## Server

Accounts, friends, clubs, chat, coupons and multiplayer run on Supabase. Tables have RLS on, and everything goes through `SECURITY DEFINER` functions checked with the player's id and secret:
- `supabase/schema.sql`: profiles, handles, friend codes, progress, leaderboard, email codes
- `supabase/party_ranks.sql`, `supabase/party_chat.sql`: clubs, ranks, logos, chat, blocked words
- `supabase/coupons.sql`: coupon codes and free gifts
- `supabase/events.sql`: live events
- `supabase/functions/ss-email`: sends email codes over Gmail SMTP (secrets `GMAIL_USER`, `GMAIL_APP_PASSWORD`)
- Realtime (presence and broadcast): who is online, invites, rooms and chat
- Connection settings: `www/js/config.js`

## Run locally

```bash
npm install
npm run vendor
npm run serve      # http://localhost:8080
npm run desktop    # Electron
```
