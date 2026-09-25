import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const source = read('capacitor.config.ts');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { default: config } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
assert.equal(config.appId, 'com.emmerdaleagriculture.app');
assert.equal(config.server.url, 'https://www.emmerdaleagriculture.com/app');
assert.equal(config.server.cleartext, false);
assert.deepEqual(config.server.allowNavigation, ['www.emmerdaleagriculture.com', 'emmerdaleagriculture.com']);
for (const name of ['core', 'ios', 'android']) {
  assert.equal(pkg.dependencies[`@capacitor/${name}`], '8.5.2');
  assert.equal(lock.packages[`node_modules/@capacitor/${name}`].version, '8.5.2');
}
for (const name of ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSLocationWhenInUseUsageDescription']) {
  assert.ok(read('ios/App/App/Info.plist').includes(`<key>${name}</key>`), `Missing iOS permission: ${name}`);
}
assert.ok(read('ios/App/App.xcodeproj/project.pbxproj').includes(config.appId));
assert.ok(read('android/app/build.gradle').includes(config.appId));
assert.ok(read('android/app/src/main/AndroidManifest.xml').includes('android:usesCleartextTraffic="false"'));
assert.ok(read('ios/App/CapApp-SPM/Package.swift').includes('exact: "8.5.2"'));
for (const filename of ['ios/App/App/capacitor.config.json', 'android/app/src/main/assets/capacitor.config.json']) {
  assert.equal(JSON.parse(read(filename)).server.url, config.server.url, `${filename}: run cap sync`);
}
console.log('PASS: app ID, pinned dependencies, canonical origin, navigation scope, permissions and native sync.');
