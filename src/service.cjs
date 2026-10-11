const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { promisify } = require('node:util');
const { randomUUID } = require('node:crypto');
const core = require('./core.cjs');
const { toolEnvironment, validateExecutable, stopProcessGroup, resolveTool } = require('./platform.cjs');
const execute = promisify(execFile);

class DownloadService extends EventEmitter {
  constructor({ dataDir, downloadDir, runnerPath, toolsDir, spawnProcess = spawn, clock = Date.now, platform = process.platform, killProcess = process.kill, stopTimeout = 60000 }) {
    super();
    this.dataDir = dataDir; this.runnerPath = runnerPath;
    this.spawnProcess = spawnProcess; this.clock = clock;
    this.platform = platform; this.killProcess = killProcess; this.stopTimeout = stopTimeout;
    this.environment = toolEnvironment(platform);
    this.toolsDir = toolsDir;
    this.file = path.join(dataDir, 'state.json');
    this.processes = new Map(); this.catalog = core.FALLBACK_OPTIONS;
    this.engineInfo = { available: false, ffmpegAvailable: false, version: '', source: 'fallback', error: '' };
    this.settings = { enginePath: '', ffmpegPath: '', downloadDir, maxConcurrent: 2, parameters: structuredClone(core.DEFAULT_PARAMETERS) };
    this.jobs = []; this.closing = false; this.saveTimer = null;
    fs.mkdirSync(dataDir, { recursive: true });
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.settings = { ...this.settings, ...saved.settings };
      this.settings.parameters = core.validateParameters(this.settings.parameters);
      this.settings.maxConcurrent = Math.min(8, Math.max(1, Number(this.settings.maxConcurrent) || 2));
      this.jobs = Array.isArray(saved.jobs) ? saved.jobs : [];
      for (const job of this.jobs) {
        if (['running', 'stopping', 'queued'].includes(job.status)) {
          job.status = 'interrupted'; job.error = '应用上次退出时任务未完成，可重新下载。';
          job.finishedAt = new Date(clock()).toISOString();
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.startupWarning = '本地配置无法读取，已恢复默认值；原配置已备份。';
        if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.file + `.invalid-${Date.now()}`);
      }
    }
  }

  snapshot() {
    return { platform: this.platform, settings: structuredClone(this.settings), jobs: structuredClone(this.jobs), catalog: this.catalog, engine: this.engineInfo, warning: this.startupWarning || '' };
  }

  persist() {
    const temporary = this.file + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify({ schema: 1, settings: this.settings, jobs: this.jobs }, null, 2));
    fs.renameSync(temporary, this.file);
  }

  changed(immediate = true) {
    if (immediate) { clearTimeout(this.saveTimer); this.saveTimer = null; this.persist(); }
    else if (!this.saveTimer) this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try { this.persist(); } catch(error) { this.emit('warning', `保存任务失败：${error.message}`); }
    }, 1000);
    this.emit('change');
  }

  resolveTools(settings = this.settings) {
    return {
      enginePath: resolveTool(String(settings.enginePath || '').trim(), this.toolsDir, 'N_m3u8DL-RE', this.platform),
      ffmpegPath: resolveTool(String(settings.ffmpegPath || '').trim(), this.toolsDir, 'ffmpeg', this.platform),
    };
  }

  async probe(settings = this.settings, commit = true) {
    const resolved = this.resolveTools(settings);
    const engine = resolved.enginePath || 'N_m3u8DL-RE';
    const info = { available: false, ffmpegAvailable: false, version: '', source: 'fallback', error: '', engineFile: engine, ffmpegFile: resolved.ffmpegPath || 'ffmpeg' };
    let catalog = core.FALLBACK_OPTIONS;
    try {
      // The Windows runner sets the console to UTF-8 before launching the engine.
      // Direct help probes otherwise use the system code page (e.g. GBK).
      const native = this.platform === 'win32' && this.runnerPath && fs.existsSync(this.runnerPath);
      const { stdout, stderr } = await execute(native ? this.runnerPath : engine, native ? [engine, '--help'] : ['--help'], { env: this.environment, windowsHide: true, timeout: 12000, maxBuffer: 1024 * 1024, encoding: 'utf8' });
      const help = stdout + stderr;
      const parsed = core.parseHelp(help);
      if (parsed.length < 5) throw new Error('未识别到下载引擎的帮助信息。');
      catalog = parsed;
      info.available = true; info.source = 'installed';
      info.version = help.match(/N_m3u8DL-RE[^\r\n]*/)?.[0] || 'N_m3u8DL-RE';
    } catch(error) { info.error = error.code === 'ENOENT' ? '未找到 N_m3u8DL-RE，请在设置中选择可执行文件。' : `引擎检测失败：${error.message}`; }
    try {
      await execute(resolved.ffmpegPath || 'ffmpeg', ['-version'], { env: this.environment, windowsHide: true, timeout: 8000, maxBuffer: 1024 * 1024 });
      info.ffmpegAvailable = true;
    } catch { /* shown independently in settings */ }
    if (commit) { this.engineInfo = info; this.catalog = catalog; this.emit('change'); }
    return { engine: info, catalog };
  }

  async saveSettings(input) {
    if (!input || typeof input.downloadDir !== 'string' || !path.isAbsolute(input.downloadDir)) throw new Error('请选择绝对路径的默认下载目录。');
    for (const key of ['enginePath', 'ffmpegPath']) {
      if (typeof input[key] !== 'string' || /[\0\r\n]/.test(input[key])) throw new Error('可执行文件路径无效。');
      if (input[key] && !path.isAbsolute(input[key])) throw new Error('可执行文件请选择绝对路径；留空使用系统 PATH。');
      validateExecutable(input[key], this.platform);
    }
    const concurrency = Number(input.maxConcurrent);
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) throw new Error('同时下载数量应为 1 至 8。');
    const next = { enginePath: input.enginePath.trim(), ffmpegPath: input.ffmpegPath.trim(), downloadDir: input.downloadDir.trim(), maxConcurrent: concurrency, parameters: core.validateParameters(input.parameters) };
    fs.mkdirSync(next.downloadDir, { recursive: true });
    fs.accessSync(next.downloadDir, fs.constants.W_OK);
    this.settings = next; this.changed();
    await this.probe(); this.tick();
    return this.snapshot();
  }

  async ready() {
    await this.probe(); this.tick();
    this.timer = setInterval(() => this.tick(), 1000);
  }

  resolveOutput(outputDir, parameters) {
    const override = parameters.findLast(p => p.enabled && core.canonical(p.name, this.catalog) === '--save-dir')?.value;
    const directory = (outputDir || override || this.settings.downloadDir).trim();
    if (!path.isAbsolute(directory)) throw new Error('下载目录必须使用绝对路径。');
    fs.mkdirSync(directory, { recursive: true }); fs.accessSync(directory, fs.constants.W_OK);
    return directory;
  }

  ensureEngine(parameters) {
    if (!this.engineInfo.available) throw new Error(this.engineInfo.error || '请先在设置中配置下载引擎。');
    if (parameters.some(p => p.enabled && core.canonical(p.name, this.catalog) === '--mux-after-done' && !p.value.includes('muxer=mkvmerge')) && !this.engineInfo.ffmpegAvailable) throw new Error('MP4 混流需要 FFmpeg，请在设置中选择 FFmpeg 可执行文件。');
  }

  addDownloads(input) {
    const urls = core.parseUrls(input.urls);
    const parameters = core.validateDownloadParameters(input.parameters || this.settings.parameters, this.catalog);
    this.ensureEngine(parameters);
    const outputDir = this.resolveOutput(input.outputDir, parameters);
    const jobs = urls.map(url => core.makeJob({ url, batch: urls.length > 1, parameters: structuredClone(parameters), outputDir, enginePath: this.settings.enginePath, ffmpegPath: this.settings.ffmpegPath }));
    for (const job of jobs) job.tempDir = path.join(this.dataDir, 'temp', job.id);
    this.jobs.unshift(...jobs.reverse()); this.changed(); this.tick(); return [...jobs].reverse().map(j => j.id);
  }

  addSchedule(input) {
    const url = core.validateUrl(input.url);
    const windows = core.validateWindows(input.windows, this.clock());
    const parameters = core.validateDownloadParameters(input.parameters || this.settings.parameters, this.catalog);
    if (parameters.some(p => p.enabled && core.canonical(p.name, this.catalog) === '--live-perform-as-vod' && p.value !== 'false')) throw new Error('定时录制不能使用 --live-perform-as-vod，请关闭该参数。');
    this.ensureEngine(parameters);
    const outputDir = this.resolveOutput(input.outputDir, parameters);
    const groupId = randomUUID();
    const jobs = windows.map(w => core.makeJob({ ...w, groupId, title: String(input.title || '').trim().slice(0, 80), url, status: 'scheduled', parameters: structuredClone(parameters), outputDir, enginePath: this.settings.enginePath, ffmpegPath: this.settings.ffmpegPath }));
    for (const job of jobs) job.tempDir = path.join(this.dataDir, 'temp', job.id);
    this.jobs.unshift(...jobs); this.changed(); return groupId;
  }

  tick() {
    if (this.closing) return;
    const now = this.clock();
    for (const job of this.jobs) {
      const action = core.scheduleAction(job, now);
      if (action === 'miss') { job.status = 'missed'; job.error = '应用未在此时间段内运行，已跳过过期任务。'; this.changed(); }
      // 定时任务独立启动，以免被点播队列推迟。
      if (action === 'start') this.start(job);
      if (action === 'stop') this.stop(job.id, 'scheduled');
    }
    const active = [...this.processes.keys()].filter(id => !this.jobs.find(j => j.id === id)?.endAt).length;
    let remaining = this.settings.maxConcurrent - active;
    for (const job of [...this.jobs].reverse()) {
      if (job.status === 'queued' && remaining-- > 0) this.start(job);
    }
  }

  start(job) {
    if (this.processes.has(job.id)) return;
    try {
      fs.mkdirSync(job.tempDir, { recursive: true }); fs.mkdirSync(job.outputDir, { recursive: true });
      const config = { ...this.settings, ...this.resolveTools(job) };
      const args = core.buildArgs(job, config, this.catalog, this.clock());
      job.outputName = job.endAt ? args[args.indexOf('--save-name') + 1] : null;
      const engine = config.enginePath || 'N_m3u8DL-RE';
      const native = this.platform === 'win32' && this.runnerPath && fs.existsSync(this.runnerPath);
      if (this.platform === 'win32' && !native) throw new Error('缺少 Windows 录制控制组件，请重新构建应用。');
      const child = this.spawnProcess(native ? this.runnerPath : engine, native ? [engine, ...args] : args, {
        cwd: job.outputDir, env: this.environment, windowsHide: true, shell: false, detached: !native, stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.processes.set(job.id, { child, native, reason: null, timeout: null });
      job.status = 'running'; job.startedAt = new Date(this.clock()).toISOString(); job.error = '';
      job.logs += '开始下载。\n';
      for (const stream of [child.stdout, child.stderr]) {
        stream.setEncoding('utf8'); stream.on('data', data => this.appendLog(job, data));
      }
      child.stdin.on('error', () => {});
      child.once('error', error => this.finish(job, null, `无法启动下载引擎：${error.message}`));
      child.once('close', (code, signal) => this.finish(job, code, '', signal));
      this.changed();
    } catch(error) {
      job.status = 'failed'; job.error = error.message; job.finishedAt = new Date(this.clock()).toISOString(); this.changed();
    }
  }

  appendLog(job, data) {
    const cleaned = data.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r/g, '\n');
    job.logs = (job.logs + cleaned).slice(-64000);
    const percentages = [...cleaned.matchAll(/(\d+(?:\.\d+)?)\s*%/g)];
    if (percentages.length) job.progress = Math.min(100, Number(percentages.at(-1)[1]));
    this.changed(false);
  }

  async finish(job, code, error = '', signal = null) {
    const entry = this.processes.get(job.id);
    if (!entry || entry.finishing) return;
    entry.finishing = true;
    clearTimeout(entry.timeout);
    // Some engine versions terminate on SIGINT instead of running the mux step.
    // Only normalize an intentional interrupt after finalizing its own tracks.
    const interrupted = signal === 'SIGINT' || code === 130 || code === 0xC000013A;
    if (job.endAt && (/Force Exit/i.test(job.logs) || (interrupted && entry.reason)) && entry.reason !== 'forced' && !error) {
      job.status = 'stopping';
      try {
        await this.finalizeRecording(job);
        if (interrupted && entry.reason === 'scheduled') code = 0;
      }
      catch (failure) { error = `录制已停止，但最终合并失败：${failure.message}；原始媒体保留在下载目录。`; }
    }
    this.processes.delete(job.id);
    const failedLog = /^\s*(?:\d{2}:\d{2}:\d{2}(?:\.\d+)?\s+)?ERROR\s*:/im.test(job.logs);
    if (error || entry.reason === 'forced' || (code !== 0 && entry.reason !== 'user' && entry.reason !== 'shutdown')) {
      job.status = 'failed'; job.error = error || (entry.reason === 'forced' ? '停止超时，已强制结束；请检查保留的临时分片。' : `下载引擎退出码 ${code}，请查看日志。`);
    } else if (['user', 'shutdown'].includes(entry.reason)) {
      job.status = 'cancelled'; job.error = '已停止；已下载的媒体与分片保留在磁盘中。';
    } else if (failedLog) {
      job.status = 'failed'; job.error = '引擎日志报告下载或合并错误，请查看日志。';
    } else { job.status = 'completed'; job.progress = 100; }
    job.finishedAt = new Date(this.clock()).toISOString(); this.changed(); this.tick();
  }

  async finalizeRecording(job) {
    const mux = job.parameters.findLast(p => p.enabled && core.canonical(p.name, this.catalog) === '--mux-after-done');
    if (!mux) return;
    const format = mux.value.match(/(?:^|:)format=(mp4|mkv|ts)(?:$|:)/)?.[1] || 'mkv';
    const name = job.outputName;
    if (!name || !fs.existsSync(job.outputDir)) throw new Error('未找到录制输出目录。');
    const target = path.join(job.outputDir, `${name}.${format}`);
    if (fs.existsSync(target) && format !== 'ts') return;
    const tracks = fs.readdirSync(job.outputDir).filter(file => file.startsWith(name) && /\.(ts|m4a|aac|m4v|mp4)$/i.test(file) && file !== path.basename(target));
    if (format === 'ts' && fs.existsSync(target) && tracks.length === 0) return;
    if (format === 'ts' && fs.existsSync(target)) tracks.unshift(path.basename(target));
    if (!tracks.length) throw new Error('没有可合并的录制文件，请查看引擎日志。');
    job.logs += '\n引擎已停止，正在使用 FFmpeg 完成最终混流…\n'; this.changed();
    const temporary = path.join(job.outputDir, `${name}.finalizing.${format}`);
    const args = ['-y','-hide_banner','-loglevel','warning'];
    for (const file of tracks) args.push('-i', path.join(job.outputDir,file));
    tracks.forEach((_,i) => args.push('-map',String(i)));
    args.push('-c','copy');
    if (format === 'mp4') args.push('-movflags','+faststart');
    args.push(temporary);
    try {
      const { stderr } = await execute(this.resolveTools(job).ffmpegPath || 'ffmpeg',args,{ env:this.environment,windowsHide:true,timeout:120000,maxBuffer:4*1024*1024 });
      if (stderr) job.logs = (job.logs + stderr).slice(-64000);
      if (!fs.statSync(temporary).size) throw new Error('FFmpeg 未生成有效文件。');
      fs.renameSync(temporary,target);
      job.logs += `\n最终文件：${target}\n`;
    } catch(error) {
      if (error.stderr) job.logs = (job.logs + error.stderr).slice(-64000);
      throw error;
    }
  }

  stop(id, reason = 'user') {
    const job = this.jobs.find(j => j.id === id);
    if (!job) throw new Error('任务不存在。');
    if (['scheduled', 'queued'].includes(job.status)) { job.status = 'cancelled'; job.finishedAt = new Date(this.clock()).toISOString(); this.changed(); return; }
    const entry = this.processes.get(id);
    if (!entry || job.status === 'stopping') return;
    entry.reason = reason; job.status = 'stopping';
    job.logs += '\n正在停止录制并等待引擎合并文件…\n';
    if (entry.native) entry.child.stdin.write('stop\n');
    else {
      try { stopProcessGroup(entry.child, 'SIGINT', this.killProcess); }
      catch (error) { this.appendLog(job, `发送停止信号失败：${error.message}\n`); }
    }
    entry.timeout = setTimeout(() => {
      if (!this.processes.has(id)) return;
      entry.reason = 'forced';
      if (this.platform === 'win32') execFile('taskkill', ['/PID', String(entry.child.pid), '/T', '/F'], { windowsHide: true }, () => {});
      else {
        try { stopProcessGroup(entry.child, 'SIGKILL', this.killProcess); }
        catch (error) { this.emit('warning', `无法结束录制进程：${error.message}`); }
      }
    }, this.stopTimeout);
    this.changed();
  }

  retry(id) {
    const job = this.jobs.find(j => j.id === id);
    if (!job || ['scheduled', 'queued', 'running', 'stopping'].includes(job.status)) throw new Error('此任务当前不能重新下载。');
    return this.addDownloads({ urls: job.url, parameters: job.parameters, outputDir: job.outputDir });
  }

  remove(id) {
    const job = this.jobs.find(j => j.id === id);
    if (!job) return;
    if (this.processes.has(id)) throw new Error('请先停止任务，再移除记录。');
    this.jobs = this.jobs.filter(j => j.id !== id); this.changed();
  }

  async shutdown() {
    this.closing = true; clearInterval(this.timer); clearTimeout(this.saveTimer);
    for (const id of this.processes.keys()) this.stop(id, 'shutdown');
    if (this.processes.size) await new Promise(resolve => {
      const poll = setInterval(() => { if (!this.processes.size) { clearInterval(poll); resolve(); } }, 200);
    });
    this.persist();
  }
}

module.exports = { DownloadService };
