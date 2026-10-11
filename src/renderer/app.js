const $ = id => document.getElementById(id);
const paths = {
  download:'M12 3v12m-4-4 4 4 4-4M5 16v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4',
  calendar:'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2m3 10h2m4 0h2m-8 4h2',
  settings:'m9 3 1-1h4l1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-3L1 9l2-4 3 1 3-1zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  folder:'M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z',
  link:'m10 13 4-4m-6 7-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4 0 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',
  info:'M12 11v6m0-10v.1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  sliders:'M4 4v5m0 5v6m8-16v10m0 5v1m8-16v1m0 5v10M1 9h6m2 6h6m2-9h6',
  chevron:'m7 10 5 5 5-5', plus:'M12 5v14M5 12h14', x:'m6 6 12 12M6 18 18 6',
  clock:'M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  check:'m5 12 4 4L19 6', refresh:'M20 7v5h-5M4 17v-5h5m-5 0a8 8 0 0 1 13-6l3 3m0 3a8 8 0 0 1-13 6l-3-3',
  external:'M14 3h7v7m0-7-11 11M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5',
  shield:'m12 2 8 3v7c0 5-5 8-8 10-3-2-8-5-8-10V5l8-3zm-4 10 3 3 5-6',
  box:'m3 7 9-5 9 5v10l-9 5-9-5V7zm0 0 9 5 9-5m-9 5v10M7 5l10 5',
  file:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm0 0v6h6M8 13h8m-8 4h5',
  copy:'M8 8h12v12H8zM16 4V2H2v14h2', trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.file}"/></svg>`;
function fillIcons(element = document) { element.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); }); }
const escapeHTML = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
let state, activePage = 'download', filter = 'all', logJobId = null;
const statuses = { queued:'等待下载', scheduled:'等待开始', running:'下载中', stopping:'正在合并 / 停止', completed:'已完成', cancelled:'已停止', failed:'失败', interrupted:'已中断', missed:'已过期' };
const activeStatuses = ['queued', 'running', 'stopping'];
const recommended = [{ name:'--auto-select', value:'', enabled:true }, { name:'-M', value:'format=mp4', enabled:true }];

function toast(message, error = false) {
  const element = document.createElement('div'); element.className = `toast${error ? ' error' : ''}`; element.textContent = message; $('toasts').append(element);
  setTimeout(() => element.remove(), error ? 8000 : 4500);
}
async function operation(button, fn) {
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try { return await fn(); } catch(error) { toast(error.message, true); }
  finally { if (button) button.disabled = false; }
}
const api = (name, value) => window.studio.invoke(name, value);

function parameterEditor(id, parameters) {
  const target = $(id);
  target.innerHTML = '<div class="parameter-labels"><span>启用</span><span>参数名称</span><span>参数值</span><span></span></div><div class="parameter-rows"></div><div class="parameter-toolbar"><button class="text-button add-parameter">' + icon('plus') + '添加参数</button><span class="muted catalog-label"></span></div>';
  for (const row of parameters) addParameterRow(target, row);
  target.querySelector('.add-parameter').addEventListener('click', () => {
    const row = addParameterRow(target, { name:'', value:'', enabled:true }); row.querySelector('.name-input').focus();
  });
  if(id==='download-parameters') { target.oninput=updateDownloadSummary;target.onchange=updateDownloadSummary;updateDownloadSummary(); }
  updateCatalogLabels();
}

function addParameterRow(target, parameter) {
  const row = document.createElement('div'); row.className = 'parameter-row' + (parameter.enabled === false ? ' disabled' : '');
  row.innerHTML = `<input type="checkbox" class="toggle" aria-label="启用此参数" ${parameter.enabled !== false ? 'checked' : ''}><div class="parameter-name"><input type="text" class="name-input" aria-label="参数名称，支持搜索或自定义" placeholder="搜索或输入 --参数" value="${escapeHTML(parameter.name)}" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false"><div class="option-menu hidden" role="listbox"></div></div><input type="text" class="value-input" aria-label="参数值" placeholder="无值参数可留空" value="${escapeHTML(parameter.value)}" spellcheck="false"><button class="icon-button remove-parameter" aria-label="移除此参数" title="移除此参数">${icon('x')}</button>`;
  const name = row.querySelector('.name-input'), value = row.querySelector('.value-input'), menu = row.querySelector('.option-menu');
  const describe = () => {
    const option = state?.catalog.find(x => x.aliases.includes(name.value));
    value.placeholder = option?.takesValue ? option.placeholder : '无值参数可留空';
    name.title = option?.description || '自定义参数，请确认引擎支持';
  };
  const showMenu = () => {
    const search = name.value.trim().toLowerCase();
    const options = (state?.catalog || []).filter(x => `${x.name} ${x.aliases.join(' ')} ${x.description}`.toLowerCase().includes(search));
    menu.innerHTML = options.slice(0, 60).map((x,i) => `<button type="button" role="option" data-option="${i}"><strong>${escapeHTML(x.aliases.join(' / '))}</strong><small>${escapeHTML(x.description)}</small></button>`).join('') + '<div class="option-description">可直接输入自定义参数名称；参数值在右侧填写。</div>';
    menu.querySelectorAll('button').forEach((button,i) => button.addEventListener('mousedown', event => {
      event.preventDefault(); name.value = options[i].name; describe(); updateDownloadSummary(); menu.classList.add('hidden'); name.setAttribute('aria-expanded','false'); value.focus();
    }));
    menu.classList.remove('hidden'); name.setAttribute('aria-expanded','true');
  };
  name.addEventListener('focus', showMenu); name.addEventListener('input', () => { showMenu(); describe(); });
  name.addEventListener('blur', () => setTimeout(() => { if (!menu.contains(document.activeElement)) { menu.classList.add('hidden'); name.setAttribute('aria-expanded','false'); } }, 100));
  name.addEventListener('keydown', event => {
    if (event.key === 'Escape') { menu.classList.add('hidden'); name.setAttribute('aria-expanded','false'); }
    if (event.key === 'ArrowDown') { event.preventDefault(); menu.querySelector('button')?.focus(); }
  });
  menu.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    const search = name.value.trim().toLowerCase();
    const options = state.catalog.filter(x => `${x.name} ${x.aliases.join(' ')} ${x.description}`.toLowerCase().includes(search));
    name.value = options[Number(button.dataset.option)].name; describe(); updateDownloadSummary(); menu.classList.add('hidden'); name.setAttribute('aria-expanded','false'); value.focus();
  });
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape') { menu.classList.add('hidden'); name.focus(); }
    if (['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault(); const buttons = [...menu.querySelectorAll('button')]; const index = buttons.indexOf(document.activeElement); buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
  });
  row.querySelector('.toggle').addEventListener('change', event => row.classList.toggle('disabled', !event.target.checked));
  row.querySelector('.remove-parameter').addEventListener('click', () => {row.remove();updateDownloadSummary();});
  target.querySelector('.parameter-rows').append(row); describe(); return row;
}

function readParameters(id) {
  return [...$(id).querySelectorAll('.parameter-row')].map(row => ({ name:row.querySelector('.name-input').value.trim(), value:row.querySelector('.value-input').value, enabled:row.querySelector('.toggle').checked }));
}

function updateDownloadSummary() {
  const parameters=readParameters('download-parameters').filter(p=>p.enabled && p.name);
  const parts=[];
  if(parameters.some(p=>p.name==='--auto-select' && p.value!=='false'))parts.push('自动选流');
  const mux=parameters.find(p=>['-M','--mux-after-done'].includes(p.name));
  const format=mux?.value.match(/(?:^|:)format=(\w+)/)?.[1];
  if(format)parts.push(format.toUpperCase());
  if(!parts.length)parts.push(`${parameters.length} 个参数`);
  const summary=$('download-details').querySelector('.summary-right');
  summary.innerHTML=parts.map(part=>`<span class="param-chip">${escapeHTML(part)}</span>`).join('')+`<span class="chevron">${icon('chevron')}</span>`;
}

function updateCatalogLabels() {
  document.querySelectorAll('.catalog-label').forEach(label => {
    label.textContent = state?.engine.source === 'installed' ? `本机引擎 · ${state.catalog.length} 个参数` : '常用参数 · 配置引擎后加载完整列表';
  });
}

function applySettings() {
  $('engine-path').value = state.settings.enginePath;
  $('ffmpeg-path').value = state.settings.ffmpegPath;
  $('settings-output').value = state.settings.downloadDir;
  $('max-concurrent').value = state.settings.maxConcurrent;
  for (const id of ['download-parameters','schedule-parameters','settings-parameters']) parameterEditor(id, state.settings.parameters);
}

function localDatetime(date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0,16);
}
function addTimeWindow() {
  const rows = [...$('time-windows').querySelectorAll('.time-window')];
  const previous = rows.at(-1)?.querySelector('.end-time').value;
  let start = previous ? new Date(new Date(previous).getTime() + 3600000) : new Date(Date.now() + 10 * 60000);
  start.setSeconds(0,0);
  const row = document.createElement('div'); row.className = 'time-window';
  row.innerHTML = `<span class="time-number">${rows.length+1}</span><label>开始时间<input type="datetime-local" class="start-time" aria-label="录制开始时间" value="${localDatetime(start)}"></label><span class="time-separator">→</span><label>结束时间<input type="datetime-local" class="end-time" aria-label="录制结束时间" value="${localDatetime(new Date(start.getTime()+3600000))}"></label><button class="icon-button remove-window" title="移除此时间段" aria-label="移除此时间段">${icon('x')}</button>`;
  row.querySelector('button').addEventListener('click', () => { if ($('time-windows').children.length === 1) { toast('至少保留一组时间。',true); return; } row.remove(); [...$('time-windows').children].forEach((node,i) => node.querySelector('.time-number').textContent = i+1); });
  $('time-windows').append(row);
}

function formatTime(iso) { return new Date(iso).toLocaleString('zh-CN', { year:'numeric', month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false }); }
function maskedUrl(raw) {
  try { const url = new URL(raw); return url.origin + url.pathname + (url.search ? '?…' : ''); } catch { return raw; }
}
function jobName(job) {
  if (job.title) return job.title;
  try { const url = new URL(job.url); const file = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) || '媒体下载'); return file + ' · ' + url.hostname; } catch { return '媒体下载'; }
}
function taskHTML(job, scheduled) {
  const busy = activeStatuses.includes(job.status);
  const stoppable = busy || job.status === 'scheduled';
  let meta = scheduled ? `${icon('clock')}<span>${formatTime(job.startAt)} → ${formatTime(job.endAt)}</span>` : `${icon('folder')}<span>${escapeHTML(job.outputDir)}</span>`;
  const progress = busy ? `<div class="progress ${job.progress === null ? 'indeterminate' : ''}"><div style="width:${job.progress === null ? '30' : job.progress}%"></div></div>` : '';
  // Style attributes are avoided to comply with the strict renderer CSP.
  return `<article class="task" data-job="${job.id}"><div class="task-icon">${icon(scheduled ? 'calendar' : 'file')}</div><div class="task-body"><div class="task-top"><span class="task-name" title="${escapeHTML(jobName(job))}">${escapeHTML(jobName(job))}</span><span class="status ${job.status}">${statuses[job.status] || job.status}</span></div><div class="task-url">${escapeHTML(maskedUrl(job.url))}</div>${progress.replace(/ style="[^"]*"/g,'')}${job.error ? `<div class="task-error">${escapeHTML(job.error)}</div>` : ''}<div class="task-bottom"><div class="task-meta">${meta}</div><div class="task-actions"><button data-action="logs">日志</button><button data-action="open-output">目录</button>${stoppable ? `<button data-action="stop" ${job.status === 'stopping' ? 'disabled' : ''}>${job.status === 'scheduled' ? '取消' : '停止'}</button>` : '<button data-action="retry">重新下载</button>'}${!busy ? `<button class="icon-button" data-action="remove" title="移除任务记录，不删除文件" aria-label="移除任务记录">${icon('trash')}</button>` : ''}</div></div></div></article>`;
}
function emptyHTML(scheduled) {
  return `<div class="empty-state"><div class="empty-icon">${icon(scheduled ? 'calendar' : 'download')}</div><strong>${scheduled ? '还没有定时任务' : filter === 'all' ? '等待你的第一个下载' : '此分类下暂无任务'}</strong><p>${scheduled ? '添加链接与时间段，应用会自动为你录制' : '在上方粘贴链接，开始保存你喜欢的内容'}</p></div>`;
}
function renderLists() {
  const downloads = state.jobs.filter(j => !j.startAt);
  const scheduled = state.jobs.filter(j => j.startAt).sort((a,b) => Date.parse(a.startAt)-Date.parse(b.startAt));
  const visible = downloads.filter(j => filter === 'all' || (filter === 'active' ? activeStatuses.includes(j.status) : j.status === 'completed'));
  $('download-list').innerHTML = visible.length ? visible.map(j => taskHTML(j,false)).join('') : emptyHTML(false);
  $('schedule-list').innerHTML = scheduled.length ? scheduled.map(j => taskHTML(j,true)).join('') : emptyHTML(true);
  for (const node of document.querySelectorAll('.task')) {
    const job = state.jobs.find(j => j.id === node.dataset.job);
    if (job.progress !== null) { const bar = node.querySelector('.progress>div'); if (bar) bar.style.width = `${job.progress}%`; }
  }
  $('task-total').textContent = downloads.length; $('schedule-total').textContent = scheduled.length;
  $('download-count').textContent = downloads.filter(j=>activeStatuses.includes(j.status)).length;
  $('schedule-count').textContent = scheduled.filter(j=>['scheduled','running','stopping'].includes(j.status)).length;
  renderLogs();
}

function renderStatus() {
  $('engine-dot').classList.toggle('ok',state.engine.available);
  $('engine-label').textContent = state.engine.available ? '下载引擎已就绪' : '请配置下载引擎';
  $('engine-label').title = state.engine.version || state.engine.error;
  $('default-location').textContent = state.settings.downloadDir;
  $('default-location').title = state.settings.downloadDir;
  const notice = $('engine-notice'); notice.classList.toggle('hidden',state.engine.available && state.engine.ffmpegAvailable);
  notice.textContent = state.engine.available ? '未检测到 FFmpeg，默认 MP4 混流需要在设置中配置 FFmpeg。' : state.engine.error || '请前往设置，选择 N_m3u8DL-RE 可执行文件。';
  $('engine-check-result').textContent = `${state.engine.available ? state.engine.version : '未找到下载引擎'} · FFmpeg ${state.engine.ffmpegAvailable ? '已就绪' : '未找到'}`;
  updateCatalogLabels();
}

function renderLogs() {
  if (!logJobId) return;
  const job = state.jobs.find(j=>j.id===logJobId); if (!job) return;
  const pre = $('logs-content'), nearBottom = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 65;
  pre.textContent = job.logs || '任务尚未开始，暂无日志。';
  $('logs-subtitle').textContent = jobName(job); $('logs-status').textContent = statuses[job.status];
  if (nearBottom) pre.scrollTop = pre.scrollHeight;
}
function setPage(page) {
  activePage = page;
  document.querySelectorAll('.page').forEach(node=>node.classList.toggle('active',node.id===`page-${page}`));
  document.querySelectorAll('.nav-item').forEach(node=>node.classList.toggle('active',node.dataset.page===page));
  $('breadcrumb').innerHTML = `工作空间 <b>/</b> ${ { download:'单次下载', schedule:'定时下载', settings:'设置' }[page] }`;
  window.scrollTo(0,0);
}

fillIcons();
document.querySelectorAll('[data-page]').forEach(button=>button.addEventListener('click',()=>setPage(button.dataset.page)));
document.querySelectorAll('[data-pick]').forEach(button=>button.addEventListener('click',()=>operation(button,async()=>{
  const selected = await api(button.dataset.kind === 'directory' ? 'choose-directory' : 'choose-executable'); if(selected)$(button.dataset.pick).value = selected;
})));
$('download-urls').addEventListener('input',()=> { const urls = $('download-urls').value.trim().split(/\s+/).filter(Boolean); $('url-count').textContent = `${new Set(urls).size} 个链接`; });
$('start-download').addEventListener('click',()=>operation($('start-download'),async()=>{
  const ids = await api('add-downloads',{ urls:$('download-urls').value, parameters:readParameters('download-parameters'), outputDir:$('download-output').value });
  $('download-urls').value = ''; $('url-count').textContent = '0 个链接'; toast(`已添加 ${ids.length} 个下载任务。`);
  state = await api('snapshot'); renderLists();
}));
$('add-window').addEventListener('click',()=> { if($('time-windows').children.length>=50)toast('最多添加 50 组时间。',true); else addTimeWindow(); });
$('save-schedule').addEventListener('click',()=>operation($('save-schedule'),async()=>{
  const windows = [...$('time-windows').children].map(row=>({ startAt:row.querySelector('.start-time').value,endAt:row.querySelector('.end-time').value }));
  await api('add-schedule',{ title:$('schedule-title').value,url:$('schedule-url').value,windows,parameters:readParameters('schedule-parameters'),outputDir:$('schedule-output').value });
  toast(`已安排 ${windows.length} 个录制时间段。`); $('schedule-url').value=''; $('schedule-title').value=''; $('time-windows').innerHTML='';addTimeWindow();
  state = await api('snapshot');renderLists();
}));
$('save-settings').addEventListener('click',()=>operation($('save-settings'),async()=>{
  state = await api('save-settings',{enginePath:$('engine-path').value,ffmpegPath:$('ffmpeg-path').value,downloadDir:$('settings-output').value,maxConcurrent:Number($('max-concurrent').value),parameters:readParameters('settings-parameters')});
  applySettings();renderStatus();toast('设置已保存，新建任务将使用这些默认参数。');
}));
$('reset-parameters').addEventListener('click',()=>{parameterEditor('settings-parameters',recommended);toast('已恢复推荐参数，点击保存设置后生效。');});
$('test-engine').addEventListener('click',()=>operation($('test-engine'),async()=>{
  $('engine-check-result').textContent='正在检测当前填写的路径…';
  const result = await api('probe-settings',{enginePath:$('engine-path').value,ffmpegPath:$('ffmpeg-path').value});
  $('engine-check-result').textContent=`${result.engine.available ? result.engine.version : result.engine.error} · FFmpeg ${result.engine.ffmpegAvailable ? '已就绪' : '未找到'}`;
}));
$('refresh-engine').addEventListener('click',()=>operation($('refresh-engine'),async()=>{await api('probe');state=await api('snapshot');renderStatus();toast(state.engine.available?'引擎检测完成。':state.engine.error,!state.engine.available);}));
$('open-download-folder').addEventListener('click',()=>operation($('open-download-folder'),()=>api('open-default-output')));
$('official-link').addEventListener('click',()=>operation($('official-link'),()=>api('open-official')));
$('download-filters').addEventListener('click',event=>{const button=event.target.closest('[data-filter]');if(!button)return;filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(node=>node.classList.toggle('selected',node===button));renderLists();});
for(const id of ['download-list','schedule-list'])$(id).addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const jobId=button.closest('.task').dataset.job;
  if(button.dataset.action==='logs'){logJobId=jobId;$('logs-dialog').showModal();renderLogs();$('logs-content').scrollTop=$('logs-content').scrollHeight;return;}
  operation(button,async()=>{await api(button.dataset.action,jobId);state=await api('snapshot');renderLists();});
});
$('close-logs').addEventListener('click',()=>{$('logs-dialog').close();logJobId=null;});
$('logs-dialog').addEventListener('close',()=>{logJobId=null;});
$('copy-logs').addEventListener('click',()=>operation($('copy-logs'),async()=>{await navigator.clipboard.writeText($('logs-content').textContent);toast('日志已复制。');}));
$('timezone-label').textContent=Intl.DateTimeFormat().resolvedOptions().timeZone+' · 本地时间';
addTimeWindow();
window.studio.subscribe(snapshot=>{state=snapshot;renderStatus();renderLists();});
window.studio.warnings(message=>toast(message,true));
operation(null,async()=>{state=await api('snapshot');applySettings();renderStatus();renderLists();if(state.warning)toast(state.warning,true);});
