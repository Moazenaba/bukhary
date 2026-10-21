// Publishes a release APK for the Android app's in-app updater (bukharyApp: com.example.update.AppUpdater).
//
//   npm run publish:android -- path/to/app-release.apk ["ما الجديد"]
//
// Copies the APK to public/app/ and writes public/app/android.json; both ship with the web app, so
// the next deploy (push to main) hands the update to every phone. The APK must be the same app,
// signed with the release key and newer than the version already published: anything else would
// make Android refuse it as a conflicting package, so it is rejected here.
// Needs the Android SDK build tools (ANDROID_HOME, or the default SDK folder on Windows).
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// SHA-256 of the release key's certificate (keys/bukhari-upload.jks), used from version 1.1.3 on.
const RELEASE_SIGNER = process.env.ANDROID_SIGNER_SHA256 || 'd7055828d02bdd1c92271a41b781d165067b4e9fe3e80a41e80f8db84674facc';
const PACKAGE = 'org.bukhari.competition';

const [apkArg, notes = ''] = process.argv.slice(2);
if (!apkArg || !fs.existsSync(apkArg)) {
  console.error('Usage: npm run publish:android -- path/to/app-release.apk ["notes"]');
  process.exit(1);
}

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
const buildTools = path.join(sdk, 'build-tools');
if (!fs.existsSync(buildTools)) {
  console.error(`Android build tools not found in ${buildTools}. Set ANDROID_HOME.`);
  process.exit(1);
}
const latestTools = path.join(buildTools, fs.readdirSync(buildTools).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).pop());
const win = process.platform === 'win32';
const tool = (name) => path.join(latestTools, name + (win ? (name === 'apksigner' ? '.bat' : '.exe') : ''));
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', shell: win && cmd.endsWith('.bat') });

const badging = run(tool('aapt2'), ['dump', 'badging', apkArg]);
const pkg = badging.match(/package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'/);
if (!pkg) throw new Error('Could not read the APK package info.');
const [, packageName, versionCodeText, versionName] = pkg;
const versionCode = Number(versionCodeText);
if (packageName !== PACKAGE) throw new Error(`The APK is ${packageName}, not ${PACKAGE}.`);

const certs = run(tool('apksigner'), ['verify', '--print-certs', apkArg]);
const signers = [...certs.matchAll(/certificate SHA-256 digest: ([0-9a-f]+)/g)].map((m) => m[1]);
if (signers.length === 0 || signers.some((s) => s !== RELEASE_SIGNER)) {
  throw new Error(`The APK is not signed with the release key (found ${signers.join(', ') || 'none'}). Phones would refuse it.`);
}

const dir = path.resolve('public/app');
const manifestPath = path.join(dir, 'android.json');
fs.mkdirSync(dir, { recursive: true });
const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
if (previous && versionCode <= previous.versionCode) {
  throw new Error(`versionCode ${versionCode} is not newer than the published ${previous.versionCode} (${previous.versionName}). Raise it in app/build.gradle.kts.`);
}

const fileName = `Bukhari-${versionName}.apk`;
for (const old of fs.readdirSync(dir)) if (old.endsWith('.apk')) fs.rmSync(path.join(dir, old));
fs.copyFileSync(apkArg, path.join(dir, fileName));
const bytes = fs.readFileSync(path.join(dir, fileName));
const manifest = {
  versionCode,
  versionName,
  apk: `app/${fileName}`,
  sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  size: bytes.length,
  notes,
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Published ${versionName} (${versionCode}) to public/app. Commit and push to deploy it.`);
