// Older versions of the game for the website's "Older versions" list (the newest is the main download).
// For iPhone, older versions offer only the .ipa file (for Sideloadly / AltStore).
const REPO = 'itamarnintendo04-arch/SpaceShip';

module.exports = async (req, res) => {
  const out = { releases: [] };
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`, { headers: { 'User-Agent': 'spaceship-site', Accept: 'application/vnd.github+json' } });
    if (r.ok) {
      const list = (await r.json()).filter(d => !d.draft && !d.prerelease);
      out.releases = list.map(d => {
        const files = {};
        for (const a of d.assets || []) {
          const n = a.name, f = { url: a.browser_download_url, size: a.size };
          if (/\.apk$/i.test(n)) files.android = f;
          else if (/setup.*\.exe$/i.test(n)) files.windows = f;
          else if (/\.dmg$/i.test(n)) files.mac = f;
          else if (/\.appimage$/i.test(n)) files.linux = f;
          else if (/\.ipa$/i.test(n)) files.ipa = f;
        }
        return { version: (d.name || d.tag_name || '').replace(/^SpaceShip\s*/i, ''), tag: d.tag_name, published: d.published_at, page: d.html_url, files };
      }).filter(x => Object.keys(x.files).length);
    } else out.error = 'github_' + r.status;
  } catch (e) { out.error = 'github_unreachable'; }
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
  res.status(200).send(JSON.stringify(out));
};
