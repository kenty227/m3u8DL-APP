const { randomUUID } = require('node:crypto');

const DEFAULT_PARAMETERS = [
  { name: '--auto-select', value: '', enabled: true },
  { name: '-M', value: 'format=mp4', enabled: true },
];

function parseHelp(help) {
  const result = [];
  for (const line of help.split(/\r?\n/)) {
    const match = line.match(/^\s{2,}((?:-{1,2}[\w?-]+(?:,\s*)?\s*)+)(<[^>]+>)?\s{2,}(.+)$/);
    if (!match) continue;
    const aliases = match[1].match(/-{1,2}[\w?-]+/g);
    const name = aliases.find(x => x.startsWith('--')) || aliases[0];
    if (result.some(x => x.name === name)) continue;
    result.push({ name, aliases, takesValue: Boolean(match[2]), placeholder: match[2]?.slice(1, -1) || '', description: match[3].trim() });
  }
  return result;
}

const FALLBACK_OPTIONS = [
  ['--auto-select', '', '自动选择最佳视频、音频和字幕轨道'],
  ['--mux-after-done', 'OPTIONS', '下载完成后混流，如 format=mp4', '-M'],
  ['--save-dir', 'PATH', '下载目录'], ['--save-name', 'NAME', '输出文件名'],
  ['--tmp-dir', 'PATH', '临时文件目录'], ['--thread-count', 'NUMBER', '下载线程数'],
  ['--download-retry-count', 'NUMBER', '分片失败重试次数'],
  ['--header', 'HEADER', '请求头，如 Referer: https://example.com', '-H'],
  ['--concurrent-download', '', '并发下载音视频', '-mt'],
  ['--select-video', 'OPTIONS', '选择视频轨道', '-sv'],
  ['--select-audio', 'OPTIONS', '选择音频轨道', '-sa'],
  ['--select-subtitle', 'OPTIONS', '选择字幕轨道', '-ss'],
  ['--custom-proxy', 'URL', 'HTTP 或 SOCKS 代理'],
  ['--use-system-proxy', '', '使用系统代理'],
  ['--live-record-limit', 'HH:mm:ss', '直播录制时长限制'],
  ['--live-real-time-merge', '', '直播实时合并'],
  ['--live-keep-segments', '', '保留直播分片'],
  ['--sub-format', 'SRT|VTT', '字幕格式'],
  ['--ffmpeg-binary-path', 'PATH', 'FFmpeg 可执行文件路径'],
  ['--key', 'KEY', '解密密钥（可重复）'],
  ['--custom-hls-key', 'KEY', 'HLS 密钥'],
  ['--skip-merge', '', '跳过合并'], ['--binary-merge', '', '二进制合并'],
  ['--del-after-done', '', '完成后删除临时文件'],
].map(([name, placeholder, description, alias]) => ({ name, aliases: alias ? [alias, name] : [name], takesValue: Boolean(placeholder), placeholder, description }));

function validateUrl(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('请输入媒体链接。');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('链接格式无效，请使用完整的 HTTP / HTTPS 地址。'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅支持 HTTP / HTTPS 媒体链接。');
  return value.trim();
}

function parseUrls(input) {
  if (typeof input !== 'string') throw new Error('请输入链接。');
  const lines = input.split(/\s+/).filter(Boolean);
  if (!lines.length) throw new Error('请至少输入一个媒体链接。');
  if (lines.length > 100) throw new Error('一次最多添加 100 个链接。');
  return [...new Set(lines.map(validateUrl))];
}

function validateParameters(parameters) {
  if (!Array.isArray(parameters) || parameters.length > 100) throw new Error('参数列表无效。');
  return parameters.map(p => {
    if (!p || typeof p.name !== 'string' || !/^--?[A-Za-z][\w-]*$/.test(p.name.trim())) throw new Error('参数名称必须以 - 或 -- 开头，名称与值请分别填写。');
    if (typeof p.value !== 'string' || p.value.length > 16000 || /[\0\r\n]/.test(p.value)) throw new Error('参数值无效，请在一行内填写。');
    return { name: p.name.trim(), value: p.value, enabled: p.enabled !== false };
  });
}

function canonical(name, catalog) {
  return catalog.find(x => x.aliases.includes(name))?.name || name;
}

function scheduleParameters(parameters, catalog = FALLBACK_OPTIONS) {
  const rows = validateParameters(parameters);
  for (const row of rows) {
    if (['--mux-after-done', '--live-real-time-merge', '--live-pipe-mux'].includes(canonical(row.name, catalog))) row.enabled = false;
  }
  if (!rows.some(p => canonical(p.name, catalog) === '--live-real-time-merge')) {
    rows.push({ name: '--live-real-time-merge', value: '', enabled: false });
  }
  for (const [name, value] of [['--skip-merge', ''], ['--live-keep-segments', ''], ['--del-after-done', 'false']]) {
    for (let i = rows.length - 1; i >= 0; i--) if (canonical(rows[i].name, catalog) === name) rows.splice(i, 1);
    rows.push({ name, value, enabled: true });
  }
  return rows;
}

function skipsMerge(parameters, catalog = FALLBACK_OPTIONS) {
  const option = parameters.findLast(p => p.enabled && canonical(p.name, catalog) === '--skip-merge');
  return Boolean(option && option.value !== 'false');
}

function validateDownloadParameters(parameters, catalog) {
  const rows = validateParameters(parameters);
  for (const row of rows.filter(p => p.enabled)) {
    const option = catalog.find(x => x.aliases.includes(row.name));
    if (option?.takesValue && !row.value.trim()) throw new Error(`${row.name} 需要填写参数值。`);
    if (['--help', '-h', '--version', '--morehelp', '--generate-completion', '--vod-list-parts'].includes(row.name)) throw new Error(`${row.name} 是工具命令，不能用于下载任务。`);
  }
  return rows;
}

function durationString(milliseconds) {
  const seconds = Math.max(1, Math.floor(milliseconds / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(x => String(x).padStart(2, '0')).join(':');
}

function buildArgs(job, settings, catalog, now = Date.now()) {
  const parameters = validateDownloadParameters(job.parameters, catalog).filter(p => p.enabled);
  const isScheduled = Boolean(job.endAt);
  const overridden = new Set(['--save-dir', '--tmp-dir']);
  if (settings.ffmpegPath) overridden.add('--ffmpeg-binary-path');
  if (isScheduled) {
    for (const name of ['--live-record-limit', '--task-start-at', '--save-name']) overridden.add(name);
  }
  if(job.batch) overridden.add('--save-name');
  if (skipsMerge(parameters, catalog)) overridden.add('--mux-after-done');
  const args = [validateUrl(job.url)];
  for (const p of parameters) {
    if (overridden.has(canonical(p.name, catalog))) continue;
    args.push(p.name);
    if (p.value !== '') args.push(p.value);
  }
  args.push('--save-dir', job.outputDir, '--tmp-dir', job.tempDir);
  // Bundled tools can live in read-only application folders or AppImage mounts.
  if (catalog.some(option=>option.aliases.includes('--log-file-path')) && !parameters.some(p=>canonical(p.name,catalog)==='--log-file-path')) {
    args.push('--log-file-path', require('node:path').join(job.tempDir,'engine.log'));
  }
  if (settings.ffmpegPath) args.push('--ffmpeg-binary-path', settings.ffmpegPath);
  if (isScheduled) {
    // Recording duration measures media time, not wall-clock time; the scheduler
    // owns the deadline so historical segments cannot finish the task early.
    const date = new Date(job.startAt).toISOString().replace(/[:.]/g, '-');
    const customName = parameters.find(p => canonical(p.name, catalog) === '--save-name')?.value || 'record';
    args.push('--save-name', `${customName}_${date}_${job.id.slice(0, 8)}`);
  } else {
    const explicitName=parameters.findLast(p => canonical(p.name,catalog)==='--save-name')?.value;
    if(job.batch || !explicitName) {
      const filename=new URL(job.url).pathname.split('/').filter(Boolean).at(-1) || 'media';
      const base=(explicitName || decodeSafe(filename).replace(/\.[^.]+$/,'')).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,100) || 'media';
      args.push('--save-name',`${base}_${job.id.slice(0,8)}`);
    }
  }
  // 管道输出不允许下载引擎等待键盘输入；用户可提供明确的轨道筛选。
  const selections = parameters.some(p => ['--auto-select', '--select-video', '--select-audio', '--select-subtitle', '--sub-only'].includes(canonical(p.name, catalog)) && p.value !== 'false');
  if (!selections) args.push('--auto-select');
  return args;
}

function decodeSafe(value){try{return decodeURIComponent(value);}catch{return value;}}

function validateWindows(windows, now = Date.now()) {
  if (!Array.isArray(windows) || !windows.length || windows.length > 50) throw new Error('请添加 1 至 50 组起止时间。');
  const sorted = windows.map(w => {
    const start = Date.parse(w.startAt), end = Date.parse(w.endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error('请完整填写开始与结束时间。');
    if (start <= now) throw new Error('开始时间必须晚于当前时间。');
    if (end <= start) throw new Error('结束时间必须晚于开始时间；跨天录制请设置下一天的日期。');
    if (end - start > 7 * 86400000) throw new Error('单组录制时间不能超过 7 天。');
    return { startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() };
  }).sort((a,b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  for (let i = 1; i < sorted.length; i++) {
    if (Date.parse(sorted[i].startAt) < Date.parse(sorted[i-1].endAt)) throw new Error('同一任务的时间段不能重叠。');
  }
  return sorted;
}

function makeJob(data) {
  return { id: randomUUID(), groupId: null, title: '', status: 'queued', createdAt: new Date().toISOString(), startedAt: null, finishedAt: null, error: '', logs: '', progress: null, ...data };
}

function scheduleAction(job, now) {
  if (job.status === 'scheduled') {
    if (now >= Date.parse(job.endAt)) return 'miss';
    if (now >= Date.parse(job.startAt)) return 'start';
  }
  if (job.status === 'running' && job.endAt && now >= Date.parse(job.endAt)) return 'stop';
  return null;
}

module.exports = { DEFAULT_PARAMETERS, FALLBACK_OPTIONS, parseHelp, parseUrls, validateUrl, validateParameters, validateDownloadParameters, validateWindows, buildArgs, durationString, makeJob, scheduleAction, canonical, scheduleParameters, skipsMerge };
