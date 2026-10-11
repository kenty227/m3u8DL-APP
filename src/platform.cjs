const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

// Desktop launchers do not necessarily inherit a user's terminal PATH.
function toolEnvironment(platform = process.platform, environment = process.env, home = os.homedir()) {
  const env = { ...environment };
  if (platform === 'win32') return env;
  const extra = platform === 'darwin'
    ? ['/opt/homebrew/bin', '/usr/local/bin', path.posix.join(home, '.local/bin'), '/usr/bin', '/bin', '/usr/sbin', '/sbin']
    : [path.posix.join(home, '.local/bin'), '/usr/local/bin', '/usr/bin', '/bin'];
  // Preserve existing precedence, exclude empty entries (the working directory).
  env.PATH = [...new Set([...(env.PATH || '').split(':').filter(Boolean), ...extra])].join(':');
  return env;
}

function validateExecutable(file, platform = process.platform) {
  if (!file) return;
  if (!fs.statSync(file).isFile()) throw new Error('请选择可执行文件，不能选择目录。');
  if (platform !== 'win32') {
    try { fs.accessSync(file, fs.constants.X_OK); }
    catch { throw new Error('所选文件没有执行权限，请先执行 chmod +x 后重新选择。'); }
  }
}

function stopProcessGroup(child, signal, killProcess = process.kill) {
  if (!Number.isInteger(child.pid) || child.pid <= 0) return;
  try { killProcess(-child.pid, signal); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
}

function resolveTool(configured, toolsDir, name, platform=process.platform) {
  if (configured) return configured;
  if (toolsDir) {
    const file=path.join(toolsDir,name+(platform==='win32'?'.exe':''));
    if(fs.existsSync(file))return file;
  }
  return '';
}

module.exports = { toolEnvironment, validateExecutable, stopProcessGroup, resolveTool };
