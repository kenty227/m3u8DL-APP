const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
if (process.platform === 'win32') {
  const root = path.resolve(__dirname, '..');
  const compiler = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  const output = path.join(root, 'native', 'runner.exe');
  if (!fs.existsSync(output) || fs.statSync(output).mtimeMs < fs.statSync(path.join(root, 'native', 'Runner.cs')).mtimeMs) {
    execFileSync(compiler, ['/nologo', '/target:winexe', `/out:${output}`, path.join(root, 'native', 'Runner.cs')], { stdio: 'inherit', windowsHide: true });
  }
}
