const platforms = { win32: 'win', darwin: 'mac', linux: 'linux' };

function buildPlan(input = [], platform = process.platform, arch = process.arch) {
  const requested = input.filter(arg => ['--win', '--mac', '--linux'].includes(arg));
  if (requested.length > 1) throw new Error('每次只构建一个系统，请分别在对应系统执行构建。');
  const target = requested[0]?.slice(2) || platforms[platform];
  if (!target) throw new Error(`不支持的构建系统：${platform}`);
  if (target !== platforms[platform]) throw new Error(`请在 ${target} 系统或对应的 GitHub Actions 构建任务中执行此命令。`);
  const architectures = input.filter(arg => /^--(?:x64|arm64|ia32|universal|armv7l)$/.test(arg));
  if (architectures.length > 1) throw new Error('每次请选择一种架构。');
  const targetArch = architectures[0]?.slice(2) || arch;
  if (!['x64', 'arm64'].includes(targetArch) || (target === 'win' && targetArch !== 'x64')) throw new Error('Windows 支持 x64，macOS 和 Linux 支持 x64 / arm64。');
  const args = [`--${target}`, `--${targetArch}`, ...input.filter(arg => !requested.includes(arg) && !architectures.includes(arg)), '--publish=never'];
  return { target, arch: targetArch, args, localRuntime: targetArch === arch };
}

module.exports = { buildPlan };
