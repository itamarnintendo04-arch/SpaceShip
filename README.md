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
Secret worlds hide in world 1. Each one opens through a special task: a golden comet, beating a boss without getting hit, crystals, golden meteors, coins, a no-hit level, a speed run. There are **no hints**: players have to discover them. Secret worlds also have **steel meteors**: shots bounce off them, so you have to dodge them. Clearing a secret level for the first time gives **diamonds**.

### Shop
- **Coin ships**, from Falcon up to Comet (7,500), Nebula (10,000), Titan (15,000) and Vortex (20,000).
- **Diamond ships**: Phoenix, Ghost, Crystal, Superstar, Void (80), Aurora (100) and Supernova (150), the strongest.
- Every ship has its own weapon and animation: faster fire, more damage, its own shot style, and more side shots once you have the Side cannons upgrade. The pricier the ship, the stronger it is. Stats are shown in the shop.
- **Upgrades**: cannon, shields, magnet, lives, fire rate, power-up time, lucky coins (+10% per level) and **side cannons** (4 levels: 2,000 🪙 + 10 💎, 4,000 + 20, 8,000 + 35, 12,000 + 50; one more pair of side shots per level).
- **Firing**: every ship fires one shot straight ahead. Beating the **first boss** (level 5) unlocks the **double shot**, and after that the cannon upgrades add more shots ahead. Ships don't fire to the sides on their own. Each level of the *Side cannons* upgrade adds a pair of side shots (up to 8).
- **Diamond powers**: plasma cannon, double shield, super magnet, golden heart, second chance (revive once per game) and a helper drone that fires next to you.
- **Auras** (trail, orbit, storm) and many avatars.
- **Convert diamonds**: 1 diamond = 10 coins.
- **Secret ships are not in the shop.** Every ship you own, secret ones included, is chosen with **Choose** in the main menu (not in the shop). Your player icon is changed from your profile: tap it in the menu, then the ✏️ pencil.
- **Voyager (website ship).** A crystal comet with a cosmic trail. The SpaceShip website has a button that opens the app (`com.spaceship.game://gift?code=VOYAGER`) and gives it to the signed-in player; on the web game the same works with `?gift=VOYAGER`. Any coupon code can be used in such a link.
- **Secret ship: Cosmos.** It's not for sale. It's given to whoever owns the *whole* shop: every coin and diamond ship, every upgrade at max level, every icon and every diamond power.
- **Chaos (coupon-only).** A wild secret ship you can only get with a code (`CHAOS`): a spinning saw of lightning with a crackling aura that fires rainbow lightning bolts. It's the strongest ship.
- **Immortal (secret token).** Nothing can hurt it: a hexagon force field and golden light lances. You get it with a **secret token** (starts with `SST-`) typed in *Sign in with a login key*. The game remembers it, and the ship is added to the account that signs in next. Tokens live in the `secret_tokens` table, and each one gives a `ship` and/or a secret `world` (`w1` … `w20`). Add rows or untick `active`. They are never stored in this repository. SQL: `supabase/secret_tokens.sql`.
- **World ships.** Every world has its own secret ship, given for finishing that world (winning its level 500): **Meteorite** (Asteroid Belt, spinning rocks), **Glacier** (Frozen Nebula, snowflakes), **Inferno** (Lava Galaxy, magma), **Eclipse** (Void Core, black suns). It's the strongest ship, with a galaxy aura and rainbow star shots.

### Shop on the server
The whole shop comes from Supabase, so you can change it with no new build (the game reads it when it starts):
- **`shop_ships`**: every ship. You can set:
  - `price` (coins) or `gems` (diamonds)
  - `sort` (order in the shop)
  - `active`: untick to hide it from the shop. Players who own it keep it.
  - the look: `shape`, `body` / `accent` / `glow` colours, `aura`, `fx`
  - the weapon: `rate`, `dmg`, `side`, `style`, `pierce`
  - `secret` (not for sale: world ships, Cosmos, coupon ships), `world`, `coupon`

  **Add a row to make a new ship** from the existing parts. Give it a `name` like `{"en": "Zebra", "he": "זברה"}` and an optional `description`.
- **`shop_items`**: upgrades (`costs` and optional `gems` per level), diamond powers and avatars (`costs[1]` coins or `gems[1]` diamonds), each with `active` and `sort`.
- **`shop_settings`**: `gem_rate`, the coins for 1 diamond when converting.

**Every purchase goes through the server** (`shop_buy`, `shop_convert`). It checks the price and the player's balance, refuses secret ships, already-owned items and maxed upgrades, and saves the result. Players in offline mode keep the shop built into the game. SQL: `supabase/shop.sql`.

### Coupon codes and free gifts
- **Give a coupon to one player** (`coupon_grants`): add a row with the coupon `code` and the player's `handle` (with or without @). It works **even when the coupon is disabled or expired**: it shows in that player's *Codes & gifts* and only they can redeem it, once. Optional `note` and `expires_at` (a deadline for this grant). SQL: `supabase/coupon_grants.sql`.
Players open **Codes & gifts** from the main menu. There they can type a coupon code, or claim a free gift with one tap. A red dot on the button means a free gift is waiting.

Codes live in the Supabase table **`coupons`**. Add or edit a row in *Supabase → Table Editor → coupons* and it works in the game right away, with no new build:

| Column | Meaning |
|---|---|
| `code` | the code players type (3–32 letters, digits, `-` or `_`; not case sensitive) |
| `coins` / `gems` | coins and diamonds the code gives (up to 1,000,000,000 each) |
| `world` | a secret world the code opens (`w1` … `w20`) |
| `ship` | a ship the code gives (its id, e.g. `chaos`). Leave it empty for coins / diamonds only |
| `max_uses` | total number of players who can use it (empty = unlimited) |
| `starts_at` / `expires_at` | optional time window |
| `active` | untick to turn the code off |
| `is_gift` | tick to show it as a **free gift** with a *Claim* button, so nobody needs to type the code |
| `note` | text shown with a free gift |

Each player can use a code once. Who used what is kept in `coupon_redemptions`.

**Gift for every new world.** When a regular world opens (2, 3 or 4), the player gets a personal gift waiting in *Codes & gifts*. The end screen says so, and a red dot appears on the button. Players who reached a world before this update get it too. The rewards are the coupons `WORLD2` (2,000 🪙 + 20 💎), `WORLD3` (5,000 + 40) and `WORLD4` (10,000 + 75), marked `personal`. Edit them in the `coupons` table. A personal gift can't be typed or claimed by anyone it wasn't unlocked for. A `WELCOME` gift (500 coins + 10 diamonds) is always visible to everyone. The first time a player reaches the main menu, a **welcome gift window** offers it with one tap. It also stays under Codes & gifts until it's claimed. SQL: `supabase/coupons.sql`.

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
- **One club per player.** A player's profile shows the club they are in; tap it to join (when the club lets you) or to open your own. *Invite to my club* on any player's profile (find them in search).
- **Who can join** (a switch at the bottom of the club settings): **Public** (default: in search, anyone joins, also from a member's profile), **Closed** (invite only: members invite players from search; not in search), **Open link** (anyone with the club link or code can always join; not in search). *Share link* sends `https://<site>/club?code=CODE`, which opens the app and joins (or `?club=CODE` on the web game). SQL: `supabase/clubs_access.sql`.
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
- **Login key in the device's passwords**: Settings → *Save login key to this device*.
  - **Android**: the phone's own *Save password?* sheet (Google Password Manager, through Android Credential Manager with the `@capgo/capacitor-autofill-save-password` plugin). Signing in: *Sign in with a login key* → *Use a saved key from this device*.
  - **iPhone**: Apple Passwords (iCloud Keychain) with `SecAddSharedWebCredential`, and the system password picker to sign in. Apple only allows this for an app linked to a website: set the repo variable **`IOS_ASSOCIATED_DOMAIN`** (the site's domain, e.g. `spaceship-game.vercel.app`) and the Vercel variable **`APPLE_TEAM_ID`**, and sign the app with an App ID that has the *Associated Domains* capability (a paid Apple Developer account). The site serves `/.well-known/apple-app-site-association`. Without it, the iPhone app offers the `.slk` file.
  - **Browser / desktop**: a real sign-in form that the browser's password manager saves, plus the Credential Management API where supported.
- **`.slk` login key files** (SpaceShip Login Key): *Save as a file instead* saves `SpaceShip-<handle>.slk`, a small text file with a header (`Format: SLK/1`, the account) and the `SSK1.` key. On phones it is written as a real file and opened in the share sheet (Save to Files, Drive, AirDrop). The app registers the `.slk` type (`com.spaceship.game.slk`, MIME `application/x-spaceship-login-key`), so tapping the file opens SpaceShip and signs in. *Choose key file* reads `.slk` (and old `.txt`) files. Anyone with the key can open the account, so keep it private.
  - **Apple Passwords inside the iPhone app** needs the app linked to your website (Associated Domains). On Vercel, set `APPLE_TEAM_ID` so the site serves `/.well-known/apple-app-site-association`. In GitHub, add the repository variable `IOS_ASSOCIATED_DOMAIN` (e.g. `spaceship-game.vercel.app`). Then sign the app with a profile that has the *Associated Domains* capability. In Safari and on Android, it works without this.
- **Sign out** removes the account from the device: its saved login key and its local data. To come back you need the email or the key file.

### Desktop extras
Two players on one computer (WASD + arrows, or two gamepads). Mouse, keyboard and gamepad control. Extra glow, trails and particles. F11 for full screen, P to pause.

### More
- **14 languages**, English by default: English, עברית, العربية, Español, Français, Deutsch, Русский, Português, Italiano, Türkçe, 中文, 日本語, 한국어, हिन्दी. Hebrew and Arabic are right-to-left. Texts are in `www/js/i18n.js`.
- **App design**: Settings → *App design* changes the colours of the whole interface (menus, buttons, windows, background): Galaxy, Ocean, Emerald, Sunset, Crimson and Midnight.
- **App icon**: Settings → *App icon* changes the icon of the app itself: Classic, Emerald, Ocean, Sunset, Aqua and Rose. It uses `@capacitor-community/app-icon` on iPhone and Android (iOS shows a short system notice), the window and Dock icon on desktop, and the browser tab icon on the web. The variants are made from `assets/icon-only.png` by `scripts/app-icons.mjs` and added to the native projects by `scripts/patch-native.mjs`.
- **Cutscenes** (`www/js/cutscene.js`, drawn live on a canvas, skippable): the **ItamaRos Games** studio logo when the app opens, the **opening** before the first game of each launch (an innocent passer-by is blown by a bomb into a ship that wasn't ready, his head hits LAUNCH and the ship, always the player's current one, takes off), a **new ship** reveal (bought, from a coupon or token, or for finishing a world) and a **hyperspace jump** when the world changes. Settings: *Animations* on/off and *Watch the opening*.
- **Portrait and landscape** modes.
- **Loading screen** with a mini level you can play while the game connects.
- **Original music** generated live with Web Audio, with no audio files: loading, menus, and a track for each world. Volume is in Settings.
- **Notifications** for invites, friend requests, friends coming online and news to all players: broadcast event `news` on channel `ss-lobby` with `{"title": "...", "body": "..."}`.

## Builds

`.github/workflows/build.yml` runs on every push. To rebuild an older release in place instead of making a new number, put `[replace release-N]` in the commit message. Add `[delete release-M]` to also remove another release. The build waits for earlier runs, deletes those releases and publishes into `release-N`. Pushes that only change `site/` or `.md` files are skipped. It builds Android, Windows, Linux, macOS and iOS and publishes them as a GitHub Release (`release-N`, version `1.1.N`). You can also start it by hand: *Actions → Build SpaceShip apps → Run workflow*.

The iOS build is **unsigned**. For a signed iPhone download, sign it yourself and put the link in the website's `IOS_DOWNLOAD_URL` (below).

## Website

**App ↔ website link** (`spaceship-site.vercel.app`, the default; the repo variable `IOS_ASSOCIATED_DOMAIN` can change it):
- `app_config.site_url` points the app's *Update* button at the site.
- **Android**: `/.well-known/assetlinks.json` (package `com.spaceship.game` + the APK signing key from `android-debug.keystore`) verifies **App Links** (`https://<site>/gift?code=…` opens the app) and lets Google Password Manager share the login between the site and the app (`asset_statements`).
- **iPhone**: the app has the `webcredentials:` and `applinks:` Associated Domains, and the site serves `/.well-known/apple-app-site-association`. It turns on once the Vercel variable **`APPLE_TEAM_ID`** is set and the app is signed by that team with the *Associated Domains* capability.
- **`/gift?code=CODE`**: a shareable gift link. With the app installed it opens the app and redeems the code; otherwise the page offers to open or download SpaceShip.

`site/` is a static download page with a small Vercel function. It shows features, the worlds, screenshots and a download button for every device. It is in English by default, and a globe button switches between the same 14 languages as the game. It also detects the visitor's device and highlights that download.

- Android / Windows / macOS / Linux links, the version and file sizes come from the latest GitHub release automatically (`site/api/config.js`).
- **Bonus for joining** (revealed by downloading): the bonus section is hidden until the visitor taps a download button; then a window opens with the codes and the Voyager button, and the section stays on the page in that browser. The site lists every coupon with `site = true` (read with the public `site_coupons()` RPC). These codes are **not** in the game's free gifts list; players type them in *Codes & gifts*. Tick `site` on a row in `coupons` to show it on the site. The section also has the *Open the app & get the ship* button (code `VOYAGER`, works on phones with the game installed). SQL: `supabase/site_bonus.sql`.
- **iPhone**: set the Vercel environment variable **`IOS_DOWNLOAD_URL`**. The iPhone card always has a **Download IPA** button (the unsigned .ipa from the latest release, for Sideloadly / AltStore), and there is also an **IPA** quick button at the top of the page. When `IOS_DOWNLOAD_URL` is empty, the main iPhone button downloads the .ipa too. It can be a direct signed `.ipa`, an `itms-services://` link, TestFlight or the App Store. Optional: `IOS_NOTE`, a short line shown under the iPhone button. Redeploy after changing it. While it is empty, the button shows "Coming soon".

Deploy: Vercel → Add New → Project → import this repo → **Root Directory `site`**, Framework **Other** → Deploy.

## Server

Accounts, friends, clubs, chat, coupons and multiplayer run on Supabase. Tables have RLS on, and everything goes through `SECURITY DEFINER` functions checked with the player's id and secret:
- `supabase/schema.sql`: profiles, handles, friend codes, progress, leaderboard, email codes
- `supabase/party_ranks.sql`, `supabase/party_chat.sql`: clubs, ranks, logos, chat, blocked words
- `supabase/auth_users_sync.sql`: every player is also listed in **Authentication → Users** (same id; email only if they have one; display name `@handle · name`; no password), kept in sync automatically
- `supabase/shop.sql`: the shop (ships, upgrades, powers, avatars, prices) and server-side purchases
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
