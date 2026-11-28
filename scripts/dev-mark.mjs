// SpaceShip Dev: turns this checkout into the development version before a build (never committed back).
// Own app id / name / link scheme on every device, so it installs next to the regular game; window.SS_DEV = true.
import { readFileSync, writeFileSync } from 'fs';
const N = process.env.DEV_N || '0', DOMAIN = process.env.SS_DOMAIN || 'spaceship-site.vercel.app';
const edit = (f, fn) => writeFileSync(f, fn(readFileSync(f, 'utf8')));
writeFileSync('www/js/version.js', `window.SS_VERSION = 'dev-${N}'; window.SS_DEV = true; window.SS_DOMAIN = '${DOMAIN}';\n`);
edit('capacitor.config.json', s => { const c = JSON.parse(s); c.appId = 'com.spaceship.game.dev'; c.appName = 'SpaceShip Dev'; return JSON.stringify(c, null, 2); });
edit('package.json', s => {
  const p = JSON.parse(s); p.name = 'spaceship-dev'; p.version = `0.${N}.0`;
  const b = p.build; b.appId = 'com.spaceship.game.dev'; b.productName = 'SpaceShip Dev';
  for (const k of ['nsis', 'portable', 'mac', 'linux']) if (b[k] && b[k].artifactName) b[k].artifactName = b[k].artifactName.replace(/^SpaceShip-/, 'SpaceShip-Dev-');
  return JSON.stringify(p, null, 2);
});
// sign-in links come back to the development app, not the regular one
for (const f of ['www/js/config.js', 'electron/main.js']) edit(f, s => s.split('com.spaceship.game://oauth').join('com.spaceship.game.dev://oauth'));
console.log('SpaceShip Dev', N);
