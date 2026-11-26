// /.well-known/apple-app-site-association: links the iPhone app to this website.
//  - webcredentials: Apple Passwords saves and fills the SpaceShip login key inside the app
//  - applinks: https://<site>/gift?code=... opens the app (Universal Links)
// Needs APPLE_TEAM_ID (Vercel env var, the 10-character Team ID of the Apple account that signs the app).
module.exports = (req, res) => {
  const team = (process.env.APPLE_TEAM_ID || '').trim(), bundle = (process.env.IOS_BUNDLE_ID || 'com.spaceship.game').trim();
  const apps = team ? [`${team}.${bundle}`] : [];
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(JSON.stringify({
    webcredentials: { apps },
    applinks: { details: apps.length ? [{ appIDs: apps, components: [{ '/': '/gift*' }] }] : [] },
  }));
};
