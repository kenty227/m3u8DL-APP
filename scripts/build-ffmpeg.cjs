const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const commonFlags = ['--prefix=/usr/local', '--disable-autodetect', '--disable-gpl', '--disable-nonfree', '--disable-x86asm', '--disable-doc', '--disable-debug', '--disable-shared', '--enable-static', '--disable-programs', '--enable-ffmpeg'];
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}\n${(result.stderr || result.stdout || '').slice(-4500)}`);
  return result.stdout;
}
function compileFfmpeg({ root, archive, source, platform = process.platform, arch = process.arch }) {
  if (platform !== process.platform || arch !== process.arch) throw new Error('Compile FFmpeg on its native system and architecture.');
  const flags = [...commonFlags];
  if (platform === 'win32') flags.push('--target-os=mingw32', '--arch=x86_64', '--cc=gcc', '--cxx=g++', '--extra-ldflags=-static');
  if (platform === 'darwin') flags.push('--cc=clang', '--cxx=clang++');
  const key = createHash('sha256').update(JSON.stringify({ source, flags, platform, arch })).digest('hex').slice(0, 16);
  const directory = path.join(root, '.build', 'ffmpeg-source-build', `${platform}-${arch}-${key}`);
  const executable = path.join(directory, platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  const licenseDir = path.join(directory, 'TOOLCHAIN-LICENSES');
  const marker = path.join(directory, '.studio-build.json');
  if (fs.existsSync(marker) && fs.existsSync(executable)) {
    const saved = JSON.parse(fs.readFileSync(marker, 'utf8'));
    if (saved.sha256 === createHash('sha256').update(fs.readFileSync(executable)).digest('hex')) return { executable, flags, source, licenseDir };
  }
  fs.mkdirSync(directory, { recursive: true });
  run('tar', ['-xf', archive, '--strip-components', '1', '-C', directory], root);
  const threads = String(Math.min(4, os.availableParallelism()));
  console.log(`Compiling FFmpeg ${source.version} (${platform}-${arch}; LGPL; no external codec libraries)…`);
  if (platform === 'win32') {
    const msys = process.env.M3U8_MSYS2 || 'C:\\msys64';
    const bash = path.join(msys, 'usr', 'bin', 'bash.exe');
    if (!fs.existsSync(bash)) throw new Error('Windows source builds require MSYS2 MINGW64 GCC and make. Set M3U8_MSYS2 to the MSYS2 directory; see CONTRIBUTING.md.');
    const call = args => run(bash, ['--noprofile', '--norc', '-c', 'export PATH=/mingw64/bin:/usr/bin:/bin; exec "$@"', 'ffmpeg-build', ...args], directory);
    call(['sh', './configure', ...flags]);
    call(['make', `-j${threads}`]);
    const licenses = path.join(msys, 'mingw64', 'share', 'licenses');
    if (!fs.existsSync(licenses)) throw new Error('Missing MinGW toolchain license notices.');
    fs.cpSync(licenses, licenseDir, { recursive: true });
  } else {
    run('sh', ['./configure', ...flags], directory);
    run('make', [`-j${threads}`], directory);
  }
  if (!fs.existsSync(executable)) throw new Error('Compiled FFmpeg executable missing.');
  const sha256 = createHash('sha256').update(fs.readFileSync(executable)).digest('hex');
  fs.writeFileSync(marker, JSON.stringify({ sha256 }) + '\n');
  return { executable, flags, source, licenseDir };
}
module.exports = { compileFfmpeg, commonFlags };
