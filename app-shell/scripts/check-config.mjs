import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));

// Usage: node scripts/check-config.mjs [ios] [android]. With no argument,
// the generated-config check covers every platform directory present.
const known = ['ios', 'android'];
const platforms = process.argv.length > 2 ? process.argv.slice(2) : known.filter((name) => fs.existsSync(path.join(root, name)));
for (const name of platforms) assert.ok(known.includes(name), `Unknown platform: ${name}`);

// Evaluate capacitor.config.ts the way the Capacitor CLI does (CommonJS from
// its own directory), so its `import pkg from './package.json'` resolves.
const configPath = path.join(root, 'capacitor.config.ts');
const js = ts.transpileModule(read('capacitor.config.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const configModule = { exports: {} };
vm.runInThisContext(`(function (exports, require, module) {${js}\n})`, { filename: configPath })(
  configModule.exports, createRequire(configPath), configModule,
);
const config = configModule.exports.default;
assert.equal(config.appId, 'com.emmerdaleagriculture.app');
assert.equal(config.server.url, 'https://www.emmerdaleagriculture.com/app');
assert.equal(config.server.cleartext, false);
assert.deepEqual(config.server.allowNavigation, ['www.emmerdaleagriculture.com', 'emmerdaleagriculture.com']);
for (const name of ['core', 'ios', 'android']) {
  assert.equal(pkg.dependencies[`@capacitor/${name}`], '8.5.2');
  assert.equal(lock.packages[`node_modules/@capacitor/${name}`].version, '8.5.2');
}
for (const name of ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSPhotoLibraryAddUsageDescription', 'NSLocationWhenInUseUsageDescription']) {
  assert.ok(read('ios/App/App/Info.plist').includes(`<key>${name}</key>`), `Missing iOS permission: ${name}`);
}
assert.ok(read('ios/App/App.xcodeproj/project.pbxproj').includes(config.appId));
assert.ok(read('android/app/build.gradle').includes(config.appId));
assert.ok(read('android/app/src/main/AndroidManifest.xml').includes('android:usesCleartextTraffic="false"'));
for (const permission of ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION']) {
  assert.ok(read('android/app/src/main/AndroidManifest.xml').includes(`android.permission.${permission}`));
}
assert.ok(read('android/app/build.gradle').includes('ANDROID_KEYSTORE_PATH'));
assert.ok(read('ios/App/CapApp-SPM/Package.swift').includes('exact: "8.5.2"'));
// One app version, package.json's: the user-agent token, the Xcode project
// and the Android versionName (read from package.json at build time).
assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
assert.equal(config.appendUserAgent, `EmmerdaleApp/${pkg.version}`);
assert.equal((read('ios/App/App.xcodeproj/project.pbxproj').match(/MARKETING_VERSION = [^;]+;/g) ?? []).join(), `MARKETING_VERSION = ${pkg.version};,MARKETING_VERSION = ${pkg.version};`);
assert.ok(read('android/app/build.gradle').includes('versionName = new groovy.json.JsonSlurper().parse(file("../../package.json")).version'));
for (const filename of platforms.map((name) => ({ ios: 'ios/App/App/capacitor.config.json', android: 'android/app/src/main/assets/capacitor.config.json' })[name])) {
  assert.equal(JSON.parse(read(filename)).server.url, config.server.url, `${filename}: run cap sync`);
}
console.log(`PASS: app ID, pinned dependencies, canonical origin, navigation scope, permissions, version and native sync (${platforms.join(', ') || 'no platforms'}).`);
