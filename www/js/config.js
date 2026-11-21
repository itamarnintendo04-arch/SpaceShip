// Supabase connection (publishable key - safe to ship in the client)
window.SS_CONFIG = {
  SUPABASE_URL: 'https://unpzeskbzovolyqsqzna.supabase.co',
  SUPABASE_KEY: 'sb_publishable_iuaATuSyhRd65ZjNdx3Opg_w1KxQdQc',
  LEVEL_COUNT: 20,
  // CutVid (our other app) - players can sign in with their CutVid account
  CUTVID_URL: 'https://btrwboxwbinqewgvlcal.supabase.co',
  CUTVID_KEY: 'sb_publishable_g2aYTfsQhep44Ta1VIIJfQ_GQnA5ODh',
  // OAuth client registered in the CutVid project (Authentication -> OAuth Apps)
  CUTVID_OAUTH_CLIENT_ID: '5a0c5e5b-0000-4000-8000-5ea0c0de0001',
  // where CutVid sends the user back to the app (Android / iOS / desktop)
  OAUTH_APP_REDIRECT: 'com.spaceship.game://oauth',
};
