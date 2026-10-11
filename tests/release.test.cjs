const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { targets, checkTag, assetNames, prepareRelease } = require('../scripts/release.cjs');
const pinned = require('../scripts/tools-manifest.json');
const version = '1.2.0';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm3u8-release-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceBytes = Buffer.from('official FFmpeg source fixture');
  const fixturePinned = structuredClone(pinned);
  fixturePinned.ffmpegSource.sha256 = crypto.createHash('sha256').update(sourceBytes).digest('hex');
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.writeFileSync(path.join(root, 'scripts/tools-manifest.json'), JSON.stringify(fixturePinned));
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# 更新记录\n\n## 1.2.0\n\nCurrent changes\n\n## 1.1.0\nOld changes\n');
  fs.mkdirSync(path.join(root, 'dist'));
  fs.writeFileSync(path.join(root, 'dist', `m3u8-Studio-${version}-Source.zip`), 'app source fixture');
  for (const target of targets) {
    const folder = path.join(root, '.build/release-artifacts', `m3u8-Studio-${target.platform}-${target.arch}`);
    fs.mkdirSync(folder, { recursive: true });
    for (const name of assetNames(version, target)) fs.writeFileSync(path.join(folder, name), name);
    fs.writeFileSync(path.join(folder, `FFmpeg-${fixturePinned.ffmpegSource.version}-Source.tar.xz`), sourceBytes);
    fs.writeFileSync(path.join(folder, 'tools-manifest.json'), JSON.stringify({
      platform: target.native, arch: target.arch, engineVersion: pinned.engineVersion,
      ffmpegRelease: `source-${fixturePinned.ffmpegSource.version}`, ffmpegBuild: 'ffmpeg version test\nconfiguration: --disable-autodetect --disable-gpl --disable-nonfree',
      assets: { engine: pinned.platforms[`${target.platform}-${target.arch}`].engine, ffmpegSource: fixturePinned.ffmpegSource }
    }));
  }
  return root;
}
test('release tag must identify this package version, including prereleases', () => {
  assert.equal(checkTag('v1.2.0', version), 'v1.2.0');
  assert.equal(checkTag('v1.3.0-beta.1', '1.3.0-beta.1'), 'v1.3.0-beta.1');
  assert.throws(() => checkTag('v1.1.0', version), /must be v1.2.0/);
  assert.throws(() => checkTag('v1.2.0;injected', version));
});
test('Linux x64 artifact names match electron-builder format architecture aliases', () => {
  const target = targets.find(target => target.platform === 'linux' && target.arch === 'x64');
  assert.deepEqual(assetNames(version, target), [
    'm3u8-Studio-1.2.0-Linux-x86_64.AppImage',
    'm3u8-Studio-1.2.0-Linux-amd64.deb'
  ]);
});
test('assemble all five targets with exact checksums and exclude stale binaries', t => {
  const root = fixture(t);
  // Maintainers may edit the changelog on Windows with CRLF line endings.
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8').replace(/\n/g, '\r\n'));
  fs.writeFileSync(path.join(root, 'dist', 'm3u8-Studio-1.0.0-Windows.exe'), 'old');
  const assets = prepareRelease({ root, version });
  assert.equal(assets.length, 13);
  const output = path.join(root, '.build/release');
  assert.equal(fs.existsSync(path.join(output, 'm3u8-Studio-1.0.0-Windows.exe')), false);
  const lines = fs.readFileSync(path.join(output, 'SHA256SUMS.txt'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 12);
  for (const line of lines) {
    const [hash, name] = line.split('  ');
    assert.equal(hash, crypto.createHash('sha256').update(fs.readFileSync(path.join(output, name))).digest('hex'));
  }
  assert.equal(Object.keys(JSON.parse(fs.readFileSync(path.join(output, 'TOOLS.json'))).targets).length, 5);
  const notes = fs.readFileSync(path.join(output, 'RELEASE_NOTES.md'), 'utf8');
  assert.match(notes, /Current changes/);
  assert.doesNotMatch(notes, /Old changes/);
  assert.equal(assets.includes('RELEASE_NOTES.md'), false);
  assert.throws(() => prepareRelease({ root, version }), /must be empty/);
});
test('a missing architecture blocks assembly before writing release output', t => {
  const root = fixture(t);
  const missing = path.join(root, '.build/release-artifacts/m3u8-Studio-linux-arm64', `m3u8-Studio-${version}-Linux-arm64.deb`);
  fs.unlinkSync(missing);
  assert.throws(() => prepareRelease({ root, version }), /ENOENT/);
  assert.equal(fs.existsSync(path.join(root, '.build/release')), false);
});
test('wrong target manifest or pinned asset cannot enter a release', t => {
  const root = fixture(t);
  const file = path.join(root, '.build/release-artifacts/m3u8-Studio-mac-arm64/tools-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file));
  manifest.arch = 'x64';
  fs.writeFileSync(file, JSON.stringify(manifest));
  assert.throws(() => prepareRelease({ root, version }), /architecture/);
  manifest.arch = 'arm64';
  manifest.assets.ffmpegSource.sha256 = '0'.repeat(64);
  fs.writeFileSync(file, JSON.stringify(manifest));
  assert.throws(() => prepareRelease({ root, version }), /pinned ffmpegSource/);
});
test('missing or incorrect corresponding source prevents binary redistribution', t => {
  const root = fixture(t);
  const source = path.join(root, '.build/release-artifacts/m3u8-Studio-win-x64', `FFmpeg-${pinned.ffmpegSource.version}-Source.tar.xz`);
  fs.writeFileSync(source, 'unrelated source');
  assert.throws(() => prepareRelease({ root, version }), /corresponding FFmpeg source/);
  fs.unlinkSync(source);
  assert.throws(() => prepareRelease({ root, version }), /ENOENT/);
  assert.equal(fs.existsSync(path.join(root, '.build/release')), false);
});
test('missing current changelog stops release before copying packages', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), '# No current version');
  assert.throws(() => prepareRelease({ root, version }), /CHANGELOG/);
  assert.equal(fs.existsSync(path.join(root, '.build/release')), false);
});
