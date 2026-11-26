// App icon variants (the player picks one in Settings -> Look).
// Makes 6 colour versions of assets/icon-only.png with sharp:
//   www/img/appicons/<id>.png (256px)  - previews, browser favicon, desktop window icon
//   ios: Assets.xcassets/AppIcon<Id>.appiconset (1024px), listed as alternate icons by the build
//   android: res/mipmap-*/ic_alt_<id>.png + an <activity-alias> per icon in AndroidManifest.xml
// Run with no arguments for the web images; patch-native.mjs runs it again for the native projects.
import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

export const ICONS = [
  { id: 'classic' },                                   // purple (the original)
  { id: 'emerald', hue: 175, sat: 1.25, light: 1.05 },  // green
  { id: 'ocean', hue: -40, sat: 0.7, light: 1.15 },     // blue
  { id: 'sunset', hue: 140, sat: 1.4 },                 // orange
  { id: 'aqua', hue: -110, sat: 1.1 },                  // teal
  { id: 'rose', hue: 40, sat: 0.55, light: 0.7 },       // pink
];
const SRC = 'assets/icon-only.png';
const cap = s => s[0].toUpperCase() + s.slice(1);
const img = (ic, size) => { let p = sharp(SRC).resize(size, size); if (ic.hue != null) p = p.modulate({ hue: ic.hue, saturation: ic.sat || 1, brightness: ic.light || 1 }); return p.png(); };

export async function webIcons() {
  mkdirSync('www/img/appicons', { recursive: true });
  for (const ic of ICONS) await img(ic, 256).toFile(`www/img/appicons/${ic.id}.png`);
}

export async function nativeIcons() {
  const alts = ICONS.filter(i => i.id !== 'classic');
  // iOS: one 1024px app icon set per variant (the build passes their names as alternate icons)
  const xc = 'ios/App/App/Assets.xcassets';
  if (existsSync(xc)) {
    for (const ic of alts) {
      const dir = `${xc}/AppIcon${cap(ic.id)}.appiconset`; mkdirSync(dir, { recursive: true });
      await img(ic, 1024).flatten({ background: '#05021a' }).toFile(`${dir}/icon-1024.png`);
      writeFileSync(`${dir}/Contents.json`, JSON.stringify({ images: [{ filename: 'icon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }], info: { author: 'xcode', version: 1 } }, null, 2));
    }
    console.log('ios: alternate app icons', alts.map(i => 'AppIcon' + cap(i.id)).join(' '));
  }
  // Android: launcher images + an activity-alias per variant (off until the player picks it)
  const res = 'android/app/src/main/res', manifest = 'android/app/src/main/AndroidManifest.xml';
  if (existsSync(res) && existsSync(manifest)) {
    const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
    for (const ic of alts) for (const [d, px] of Object.entries(sizes)) {
      mkdirSync(`${res}/mipmap-${d}`, { recursive: true });
      await img(ic, px).toFile(`${res}/mipmap-${d}/ic_alt_${ic.id}.png`);
    }
    let xml = readFileSync(manifest, 'utf8');
    if (!xml.includes('android:name=".AppIcon')) {
      const aliases = alts.map(ic => `
        <activity-alias android:name=".AppIcon${cap(ic.id)}" android:enabled="false" android:exported="true"
            android:icon="@mipmap/ic_alt_${ic.id}" android:roundIcon="@mipmap/ic_alt_${ic.id}"
            android:label="@string/app_name" android:targetActivity=".MainActivity">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity-alias>`).join('');
      xml = xml.replace('</application>', aliases + '\n    </application>');
      writeFileSync(manifest, xml);
    }
    console.log('android: alternate app icons', alts.length);
  }
}

if (process.argv[1] && process.argv[1].endsWith('app-icons.mjs')) {
  await (process.argv[2] === 'native' ? nativeIcons() : webIcons());
}
