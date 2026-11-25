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
- Every ship has its own weapon and animation: faster fire, more damage, its own shot style, and more side shots once you have the Side cannons upgrade. The pricier the ship, the stronger it is. Stats are shown in the shop.
- **Upgrades**: cannon, shields, magnet, lives, fire rate, power-up time, lucky coins (+10% per level) and **side cannons** (2,000 coins).
- **Firing**: every ship fires one shot straight ahead. Beating the **first boss** (level 5) unlocks the **double shot**, and after that the cannon upgrades add more shots ahead. Ships don't fire to the sides on their own. The *Side cannons* upgrade adds side shots, and better ships fire more of them.
- **Diamond powers**: plasma cannon, double shield, super magnet, golden heart, second chance (revive once per game) and a helper drone that fires next to you.
- **Auras** (trail, orbit, storm) and many avatars.
- **Convert diamonds**: 1 diamond = 10 coins.
- **Secret ship: Cosmos.** It's not for sale. It's given to whoever owns the *whole* shop: every coin and diamond ship, every upgrade at max level, every icon and every diamond power.
- **Chaos (coupon-only).** A wild secret ship you can only get with a code (`CHAOS`): a spinning saw of lightning with a crackling aura that fires rainbow lightning bolts. It's the strongest ship. It appears in the shop's secret row only once you own it.
- **World ships.** Every world has its own secret ship, given for finishing that world (winning its level 500): **Meteorite** (Asteroid Belt, spinning rocks), **Glacier** (Frozen Nebula, snowflakes), **Inferno** (Lava Galaxy, magma), **Eclipse** (Void Core, black suns). The shop's *Secret ships* row shows each one locked, with progress (levels finished / 500). Until then the shop shows it as a mystery card with progress (e.g. 49 / 50). It's the strongest ship, with a galaxy aura and rainbow star shots.

### Coupon codes and free gifts
Players open **Codes & gifts** from the main menu. There they can type a coupon code, or claim a free gift with one tap. A red dot on the button means a free gift is waiting.

Codes live in the Supabase table **`coupons`**. Add or edit a row in *Supabase → Table Editor → coupons* and it works in the game right away, with no new build:

| Column | Meaning |
|---|---|
| `code` | the code players type (3–32 letters, digits, `-` or `_`; not case sensitive) |
| `coins` / `gems` | coins and diamonds the code gives (up to 1,000,000,000 each) |
| `ship` | a ship the code gives (its id, e.g. `chaos`). Leave it empty for coins / diamonds only |
| `max_uses` | total number of players who can use it (empty = unlimited) |
| `starts_at` / `expires_at` | optional time window |
| `active` | untick to turn the code off |
| `is_gift` | tick to show it as a **free gift** with a *Claim* button, so nobody needs to type the code |
| `note` | text shown with a free gift |

Each player can use a code once. Who used what is kept in `coupon_redemptions`. A `WELCOME` gift (500 coins + 10 diamonds) is always visible to everyone. The first time a player reaches the main menu, a **welcome gift window** offers it with one tap. It also stays under Codes & gifts until it's claimed. SQL: `supabase/coupons.sql`.

### Live events
Events run from the server. Add a row to the Supabase table **`game_events`** and every player sees it within a few minutes, with no new build. Every event is **scheduled**: `starts_at` and `ends_at` are both required. Up to 7 days before it starts, players see it as **Coming soon** with a countdown. At `starts_at` it goes live by itself and players get a notification. At `ends_at` it ends. The countdown is shown in the player's language.

| Column | Meaning |
|---|---|
| `title`, `body` | banner text |
| `coins_mult` | coin multiplier while it runs (2 = double coins, max 10) |
| `gems_per_win` | extra diamonds for every level won |
| `starts_at` / `ends_at` | when it runs |
| `color` | banner color, e.g. `#f59e0b` |
| `active` | untick to stop it early |

When several events run at once, the highest multiplier applies and the diamonds add up. SQL: `supabase/events.sql`.

### App updates for big events
The app asks players to update **only when a big event needs a newer version**. Nothing else ever asks them to update.
- Set **`game_events.min_version`** on the event: a version (e.g. `1.1.26`), or **`latest`** for the newest build on GitHub. Players on an older app see a pop-up once, *"<event> is here! Update the app to join the event"*, and an **Update to join** button on the event banner. The banner and the pop-up both show the version they have and the version they need. They don't get that event's bonus until they update. Events without `min_version` never ask anyone to update.
- **`app_config`** (one row):
  - `site_url`: your download website. **Update now** picks the right file for the device from the site's `/api/config`. On iPhone that is the signed link from `IOS_DOWNLOAD_URL`. If it's empty, the latest GitHub release is used.
  - `update_message`: optional extra text in the update window.

Every build writes its version (`1.1.<build number>`, the same number as the GitHub release, e.g. `release-25` = `1.1.25`) into `www/js/version.js`. The web copy of the game is always the newest, so it is never asked to update. SQL: `supabase/app_updates.sql`.

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
Up to 10 players in a room, each with their own ship on the same screen. Everyone taps "Ready". When all are ready (at least 2), the game **starts by itself** after a 3-second "Everyone is ready! Starting…". Readiness resets for the next round. The host picks the level inside the game, from levels everyone has unlocked. After a win: "Next level". A secret world found in a room opens for everyone in it. Friends in a room show "Ask to join".

### Accounts on many devices
- Every player has a name and a unique `@handle`.
- Add an email to sign in on other devices: a **6-digit code** arrives by email. The email is a designed HTML message in the language the game is set to (all 14 languages; Hebrew and Arabic right-to-left).
- Sign in on another device: "I have an account" → **email** → 6-digit code.
- Sign in with **CutVid** (OAuth, or CutVid email + password inside the game).
- Several accounts on one device, each with its own progress.
- **Login key in the device's passwords**: Settings → *Save login key to this device* opens a small sign-in form (`@handle` + the key) that the device's password manager offers to save: Apple Passwords / iCloud Keychain, Google Password Manager, or the browser's saved passwords. Where the browser supports it, the key is also stored directly with the Credential Management API. To sign in: *I have an account* → *Sign in with a login key*. Tap the field and pick the saved SpaceShip key, paste it (it starts with `SSK1.`), or choose the key file. *Save as a file instead* saves `SpaceShip-key-<handle>.txt`; on a phone it opens the share sheet. Anyone with the key can open the account, so keep it private.
  - **Apple Passwords inside the iPhone app** needs the app linked to your website (Associated Domains). On Vercel, set `APPLE_TEAM_ID` so the site serves `/.well-known/apple-app-site-association`. In GitHub, add the repository variable `IOS_ASSOCIATED_DOMAIN` (e.g. `spaceship-game.vercel.app`). Then sign the app with a profile that has the *Associated Domains* capability. In Safari and on Android, it works without this.
- **Sign out** removes the account from the device: its saved login key and its local data. To come back you need the email or the key file.

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

`site/` is a static download page with a small Vercel function. It shows features, the worlds, screenshots and a download button for every device. It is in English by default, and a globe button switches between the same 14 languages as the game. It also detects the visitor's device and highlights that download.

- Android / Windows / macOS / Linux links, the version and file sizes come from the latest GitHub release automatically (`site/api/config.js`).
- **iPhone**: set the Vercel environment variable **`IOS_DOWNLOAD_URL`**. It can be a direct signed `.ipa`, an `itms-services://` link, TestFlight or the App Store. Optional: `IOS_NOTE`, a short line shown under the iPhone button. Redeploy after changing it. While it is empty, the button shows "Coming soon".

Deploy: Vercel → Add New → Project → import this repo → **Root Directory `site`**, Framework **Other** → Deploy.

## Server

Accounts, friends, clubs, chat, coupons and multiplayer run on Supabase. Tables have RLS on, and everything goes through `SECURITY DEFINER` functions checked with the player's id and secret:
- `supabase/schema.sql`: profiles, handles, friend codes, progress, leaderboard, email codes
- `supabase/party_ranks.sql`, `supabase/party_chat.sql`: clubs, ranks, logos, chat, blocked words
- `supabase/auth_users_sync.sql`: every player is also listed in **Authentication → Users** (same id; email only if they have one; display name `@handle · name`; no password), kept in sync automatically
- `supabase/coupons.sql`: coupon codes and free gifts
- `supabase/events.sql`: live events
- `supabase/app_updates.sql`: update prompts for big events (`app_config`, `game_events.min_version`) and the `app_info()` call the game makes at start
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
