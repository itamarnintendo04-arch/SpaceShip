// /.well-known/apple-app-site-association: links the iPhone app to this website so Apple Passwords
// can save and fill the SpaceShip login key inside the app. Needs APPLE_TEAM_ID (Vercel env var).
module.exports = (req, res) => {
  const team = (process.env.APPLE_TEAM_ID || '').trim(), bundle = (process.env.IOS_BUNDLE_ID || 'com.spaceship.game').trim();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(JSON.stringify({ webcredentials: { apps: team ? [`${team}.${bundle}`] : [] } }));
};
