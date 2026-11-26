// Registers the com.spaceship.game:// URL scheme in the generated native projects so that
// "Sign in with CutVid" (OAuth) can return to the app. Safe to run repeatedly.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const SCHEME = 'com.spaceship.game';

const manifest = 'android/app/src/main/AndroidManifest.xml';
if (existsSync(manifest)) {
  let xml = readFileSync(manifest, 'utf8');
  if (!xml.includes(`android:scheme="${SCHEME}"`)) {
    if (!xml.includes('</activity>')) throw new Error('AndroidManifest.xml: no <activity> found');
    xml = xml.replace('</activity>', `    <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${SCHEME}" />
            </intent-filter>
        </activity>`);
    writeFileSync(manifest, xml);
    console.log('android: URL scheme registered');
  }
  // real-time update notifications (Android 13+ asks the player)
  if (!xml.includes('android.permission.POST_NOTIFICATIONS')) {
    xml = xml.replace('</manifest>', '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n</manifest>');
    writeFileSync(manifest, xml);
    console.log('android: notification permission added');
  }
}

// .slk (SpaceShip Login Key) files open the app: Android intent filter for the file's MIME type
if (existsSync(manifest)) {
  let xml = readFileSync(manifest, 'utf8');
  if (!xml.includes('application/x-spaceship-login-key')) {
    xml = xml.replace('</activity>', `    <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="content" />
                <data android:scheme="file" />
                <data android:mimeType="application/x-spaceship-login-key" />
            </intent-filter>
        </activity>`);
    writeFileSync(manifest, xml);
    console.log('android: .slk files registered');
  }
}

const plist = 'ios/App/App/Info.plist';
// iOS: declare the .slk type (com.spaceship.game.slk) so Files, Mail and the share sheet know it and open it in SpaceShip
if (existsSync(plist)) {
  let xml = readFileSync(plist, 'utf8');
  if (!xml.includes('com.spaceship.game.slk')) {
    const entry = `\t<key>UTExportedTypeDeclarations</key>
\t<array>
\t\t<dict>
\t\t\t<key>UTTypeIdentifier</key>
\t\t\t<string>com.spaceship.game.slk</string>
\t\t\t<key>UTTypeDescription</key>
\t\t\t<string>SpaceShip Login Key</string>
\t\t\t<key>UTTypeConformsTo</key>
\t\t\t<array>
\t\t\t\t<string>public.data</string>
\t\t\t</array>
\t\t\t<key>UTTypeTagSpecification</key>
\t\t\t<dict>
\t\t\t\t<key>public.filename-extension</key>
\t\t\t\t<array>
\t\t\t\t\t<string>slk</string>
\t\t\t\t</array>
\t\t\t\t<key>public.mime-type</key>
\t\t\t\t<array>
\t\t\t\t\t<string>application/x-spaceship-login-key</string>
\t\t\t\t</array>
\t\t\t</dict>
\t\t</dict>
\t</array>
\t<key>CFBundleDocumentTypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>CFBundleTypeName</key>
\t\t\t<string>SpaceShip Login Key</string>
\t\t\t<key>CFBundleTypeRole</key>
\t\t\t<string>Viewer</string>
\t\t\t<key>LSHandlerRank</key>
\t\t\t<string>Owner</string>
\t\t\t<key>LSItemContentTypes</key>
\t\t\t<array>
\t\t\t\t<string>com.spaceship.game.slk</string>
\t\t\t</array>
\t\t</dict>
\t</array>
\t<key>LSSupportsOpeningDocumentsInPlace</key>
\t<false/>
`;
    const end = xml.lastIndexOf('</dict>');
    xml = xml.slice(0, end) + entry + xml.slice(end);
    writeFileSync(plist, xml);
    console.log('ios: .slk files registered');
  }
}
if (existsSync(plist)) {
  let xml = readFileSync(plist, 'utf8');
  if (!xml.includes('CFBundleURLSchemes')) {
    const entry = `\t<key>CFBundleURLTypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>CFBundleURLName</key>
\t\t\t<string>${SCHEME}</string>
\t\t\t<key>CFBundleURLSchemes</key>
\t\t\t<array>
\t\t\t\t<string>${SCHEME}</string>
\t\t\t</array>
\t\t</dict>
\t</array>
`;
    const end = xml.lastIndexOf('</dict>');
    if (end < 0) throw new Error('Info.plist: no closing </dict>');
    xml = xml.slice(0, end) + entry + xml.slice(end);
    writeFileSync(plist, xml);
    console.log('ios: URL scheme registered');
  }
}

// Apple Passwords (iCloud Keychain) for the login key inside the iPhone app: the app must be linked to the
// website with an Associated Domain. Set IOS_ASSOCIATED_DOMAIN (e.g. spaceship-game.vercel.app) in the build to turn it on;
// the website then serves /.well-known/apple-app-site-association with your APPLE_TEAM_ID.
const domain = (process.env.IOS_ASSOCIATED_DOMAIN || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const ent = 'ios/App/App/App.entitlements', pbx = 'ios/App/App.xcodeproj/project.pbxproj';
if (domain && existsSync(pbx)) {
  writeFileSync(ent, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>com.apple.developer.associated-domains</key>
\t<array>
\t\t<string>webcredentials:${domain}</string>
\t</array>
</dict>
</plist>
`);
  let p = readFileSync(pbx, 'utf8');
  if (!p.includes('CODE_SIGN_ENTITLEMENTS')) {
    p = p.replace(/(INFOPLIST_FILE = App\/Info\.plist;)/g, '$1\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;');
    writeFileSync(pbx, p);
  }
  console.log('ios: Apple Passwords linked to ' + domain);
}

// App icon variants (Settings -> Look -> App icon): iOS alternate icon sets and Android activity-aliases
{
  const { nativeIcons } = await import('./app-icons.mjs');
  await nativeIcons();
}
