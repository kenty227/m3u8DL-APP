const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { bundleDirectory } = require('./prepare-tools.cjs');

const targets = [
  { platform: 'win', native: 'win32', arch: 'x64', label: 'Windows', extensions: ['exe'] },
  { platform: 'mac', native: 'darwin', arch: 'x64', label: 'macOS-x64', extensions: ['dmg', 'zip'] },
  { platform: 'mac', native: 'darwin', arch: 'arm64', label: 'macOS-arm64', extensions: ['dmg', 'zip'] },
  { platform: 'linux', native: 'linux', arch: 'x64', label: 'Linux-x64', extensions: ['AppImage', 'deb'] },
  { platform: 'linux', native: 'linux', arch: 'arm64', label: 'Linux-arm64', extensions: ['AppImage', 'deb'] }
];
function checkTag(tag, version) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(version) || tag !== `v${version}`) {
    throw new Error(`Release tag must be v${version}; received ${tag || '(missing tag)'}`);
  }
  return tag;
}
function assetNames(version, target) {
  return target.extensions.map(ext => `m3u8-Studio-${version}-${target.label}.${ext}`);
}
function requireFile(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || !stat.size) throw new Error(`Missing or invalid release file: ${file}`);
}
function prepareRelease({ root, version, artifactDir = path.join(root, '.build/release-artifacts'), outputDir = path.join(root, '.build/release') }) {
  checkTag(`v${version}`, version);
  // Validate every target before copying anything. Artifacts stay in separate
  // folders so duplicate names cannot silently overwrite another build.
  const files = [], manifests = {};
  const pinned = JSON.parse(fs.readFileSync(path.join(root, 'scripts/tools-manifest.json'), 'utf8'));
  for (const target of targets) {
    const folder = path.join(artifactDir, `m3u8-Studio-${target.platform}-${target.arch}`);
    for (const name of assetNames(version, target)) {
      const source = path.join(folder, name);
      requireFile(source);
      files.push({ name, source });
    }
    const manifestFile = path.join(folder, 'tools-manifest.json');
    requireFile(manifestFile);
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    const key = `${target.platform}-${target.arch}`;
    if (manifest.platform !== target.native || manifest.arch !== target.arch || manifest.engineVersion !== pinned.engineVersion || manifest.ffmpegRelease !== pinned.ffmpegVersion) {
      throw new Error(`Wrong tool version or architecture in ${key}`);
    }
    for (const [asset, expected] of Object.entries(pinned.platforms[key])) {
      if (manifest.assets?.[asset]?.sha256 !== expected.sha256 || manifest.assets?.[asset]?.url !== expected.url) throw new Error(`Wrong pinned ${asset} asset in ${key}`);
    }
    if (!manifest.ffmpegBuild?.startsWith('ffmpeg version ') || manifest.ffmpegBuild.includes('--enable-nonfree')) throw new Error(`Invalid FFmpeg build information in ${key}`);
    manifests[key] = manifest;
  }
  const sourceName = `m3u8-Studio-${version}-Source.zip`;
  const source = path.join(root, 'dist', sourceName);
  requireFile(source);
  files.push({ name: sourceName, source });
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n');
  const heading = `## ${version}\n`;
  const start = changelog.indexOf(heading);
  if (start < 0) throw new Error(`CHANGELOG.md must include ${heading.trim()}`);
  const changes = changelog.slice(start + heading.length).split('\n## ')[0].trim();
  if (fs.existsSync(outputDir) && fs.readdirSync(outputDir).length) throw new Error('Release output must be empty. Use a fresh output directory.');
  fs.mkdirSync(outputDir, { recursive: true });
  for (const file of files) fs.copyFileSync(file.source, path.join(outputDir, file.name));
  fs.writeFileSync(path.join(outputDir, 'TOOLS.json'), JSON.stringify({ version, targets: manifests }, null, 2) + '\n');
  const names = [...files.map(file => file.name), 'TOOLS.json'].sort();
  const sums = names.map(name => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(outputDir, name))).digest('hex')}  ${name}`).join('\n') + '\n';
  fs.writeFileSync(path.join(outputDir, 'SHA256SUMS.txt'), sums);
  const notes = `# m3u8 Studio ${version}\n\n${changes}\n\n## 下载与安装\n\n| 系统 | 文件 |\n| --- | --- |\n| Windows x64 | Windows.exe，双击运行 |\n| macOS Intel | macOS-x64.dmg / .zip |\n| macOS Apple Silicon | macOS-arm64.dmg / .zip |\n| Linux x64 | Linux-x64.AppImage / .deb |\n| Linux arm64 | Linux-arm64.AppImage / .deb |\n\n安装包包含 Electron、N_m3u8DL-RE 和 FFmpeg，无需 Node.js 或手动配置工具路径。Linux AppImage 需要执行权限。macOS 当前使用 ad-hoc 签名，尚未 Developer ID 签名或公证，可能被 Gatekeeper 阻止。\n\n二开下载 Source.zip 或 Fork 仓库，安装 Node.js 22+ 后执行 npm ci、npm start。Source.zip 只包含应用源码。TOOLS.json 记录各平台工具版本、构建参数、上游 URL 和 SHA-256；SHA256SUMS.txt 用于校验附件。\n\n## 发布前维护者检查\n\n这是自动创建的草稿。正式公开前需确认五个系统/架构的 CI 与桌面启动结果，并在本 Release 提供与内置 FFmpeg 及其静态依赖匹配的对应源码、构建脚本、补丁和许可说明；应用 Source.zip 不能代替这些源码。详见仓库 docs/RELEASING.md 和 THIRD_PARTY_NOTICES.md。完成后请将这段维护者说明替换为对应源码附件的下载链接。\n`;
  // Notes are deliberately outside the public attachment list.
  fs.writeFileSync(path.join(outputDir, 'RELEASE_NOTES.md'), notes);
  return [...names, 'SHA256SUMS.txt'];
}
function gh(args, options = {}) {
  const result = spawnSync('gh', args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  return result;
}
function createDraft({ root, version, repo, tag }) {
  checkTag(tag, version);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo || '')) throw new Error('GITHUB_REPOSITORY must identify OWNER/REPO');
  const folder = path.join(root, '.build/release');
  const sums = fs.readFileSync(path.join(folder, 'SHA256SUMS.txt'), 'utf8').trim().split('\n');
  const assets = sums.map(line => {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9_.-]+)$/.exec(line);
    if (!match) throw new Error('Invalid checksum entry');
    const file = path.join(folder, match[2]);
    requireFile(file);
    if (crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== match[1]) throw new Error(`Asset changed after preparing release: ${match[2]}`);
    return file;
  });
  assets.push(path.join(folder, 'SHA256SUMS.txt'));
  // A non-zero view is not automatically interpreted as "not found": auth and
  // network errors must fail instead of attempting a duplicate release.
  const listing = gh(['api', '--paginate', `repos/${repo}/releases`, '--jq', `.[] | select(.tag_name == "${tag}") | {draft: .draft}`]);
  if (listing.status !== 0) throw new Error(listing.stderr || 'Unable to list releases');
  const existing = listing.stdout.trim() ? JSON.parse(listing.stdout) : null;
  if (existing && !existing.draft) throw new Error('Refusing to replace assets of an already published release. Create a new version.');
  const result = existing
    ? gh(['release', 'upload', tag, ...assets, '--repo', repo, '--clobber'])
    : gh(['release', 'create', tag, ...assets, '--repo', repo, '--draft', '--verify-tag', '--title', `m3u8 Studio ${version}`, '--notes-file', path.join(folder, 'RELEASE_NOTES.md')]);
  if (result.status !== 0) throw new Error(result.stderr || 'Unable to create release draft');
  if (existing) {
    const updated = gh(['release', 'edit', tag, '--repo', repo, '--notes-file', path.join(folder, 'RELEASE_NOTES.md')]);
    if (updated.status !== 0) throw new Error(updated.stderr || 'Unable to update draft notes');
  }
  console.log(result.stdout || `Updated draft ${repo} ${tag}`);
}
function main() {
  const root = path.resolve(__dirname, '..');
  const version = require('../package.json').version;
  const [command, ...args] = process.argv.slice(2);
  const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (command === 'check-tag') console.log(checkTag(process.env.GITHUB_REF_NAME || option('tag'), version));
  else if (command === 'export-tools') {
    const target = targets.find(item => item.platform === option('platform') && item.arch === option('arch'));
    if (!target) throw new Error('Unsupported target');
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    fs.copyFileSync(path.join(bundleDirectory(root, target.native, target.arch), 'manifest.json'), path.join(root, 'dist/tools-manifest.json'));
  } else if (command === 'prepare') console.log(`Prepared ${prepareRelease({ root, version }).length} release attachments`);
  else if (command === 'create-draft') createDraft({ root, version, repo: process.env.GITHUB_REPOSITORY, tag: process.env.GITHUB_REF_NAME });
  else throw new Error('Usage: release.cjs check-tag | export-tools --platform=win --arch=x64 | prepare | create-draft');
}
module.exports = { targets, checkTag, assetNames, prepareRelease, createDraft };
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
