// Copies the game's ship drawing (www/js/art.js) and ship names to the website, for the coupon maker on /dev.
// Run after changing ships:  node scripts/site-art.mjs
import fs from 'fs';
fs.mkdirSync('site/js', { recursive: true });
fs.copyFileSync('www/js/art.js', 'site/js/art.js');
const names = {};
for (const line of fs.readFileSync('www/js/i18n.js', 'utf8').split('\n')) {
  const m = /^\s*ship_([a-z0-9_]+):\s*(\[.*\]),?\s*$/.exec(line);
  if (m) try { const a = JSON.parse(m[2]); names[m[1]] = { en: a[0], he: a[1] }; } catch (e) { /* not a plain entry */ }
}
fs.writeFileSync('site/js/ship-names.js', '// made by scripts/site-art.mjs\nwindow.SHIP_NAMES = ' + JSON.stringify(names) + ';\n');
console.log('ships with names:', Object.keys(names).length);
