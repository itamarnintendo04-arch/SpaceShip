// Download links for the site.
// IOS_DOWNLOAD_URL (Vercel env var): the signed iPhone/iPad link — a direct .ipa, an itms-services:// link,
// a TestFlight or App Store link. Optional: IOS_NOTE (short text shown under the iPhone button).
// The other platforms come from the latest GitHub release of the game.
const REPO = 'itamarnintendo04-arch/SpaceShip';

module.exports = async (req, res) => {
  const out = { ios: (process.env.IOS_DOWNLOAD_URL || '').trim() || null, iosNote: (process.env.IOS_NOTE || '').trim() || null,
    version: null, published: null, page: `https://github.com/${REPO}/releases/latest`, files: {} };
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { 'User-Agent': 'spaceship-site', Accept: 'application/vnd.github+json' } });
    if (r.ok) {
      const d = await r.json();
      out.version = (d.name || d.tag_name || '').replace(/^SpaceShip\s*/i, '');
      out.published = d.published_at; out.page = d.html_url;
      for (const a of d.assets || []) {
        const n = a.name, f = { url: a.browser_download_url, size: a.size, name: n };
        if (/\.apk$/i.test(n)) out.files.android = f;
        else if (/setup.*\.exe$/i.test(n)) out.files.windows = f;
        else if (/portable.*\.exe$/i.test(n)) out.files.windowsPortable = f;
        else if (/\.dmg$/i.test(n)) out.files.mac = f;
        else if (/\.appimage$/i.test(n)) out.files.linux = f;
        else if (/\.ipa$/i.test(n)) out.files.ios = f;          // unsigned, used when IOS_DOWNLOAD_URL is empty
      }
    }
  } catch (e) { out.error = 'github_unreachable'; }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.status(200).send(JSON.stringify(out));
};
