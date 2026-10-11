const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/core.cjs');
const help = `Description:\n N_m3u8DL-RE 0.6.0\nOptions:\n  --auto-select                   自动选择所有类型的最佳轨道 [default: False]\n  -M, --mux-after-done <OPTIONS>  所有工作完成时尝试混流\n  -H, --header <header>           设置请求头\n  --thread-count <number>         设置下载线程数\n  --save-dir <PATH>               输出目录\n  --live-record-limit <TIME>      录制时长\n  --save-name <NAME>              文件名\n  --task-start-at <TIME>          等待开始\n  -?, -h, --help                  Show help`;
const catalog = core.parseHelp(help);

test('engine logs default to writable job storage rather than a read-only bundled executable folder',()=>{
  const logOption={name:'--log-file-path',aliases:['--log-file-path'],takesValue:true};
  const options=[...catalog,logOption];
  const job={id:'12345678',url:'https://a.test/live.m3u8',outputDir:'output',tempDir:'writable-temp',parameters:core.DEFAULT_PARAMETERS};
  const args=core.buildArgs(job,{},options);
  assert.equal(args[args.indexOf('--log-file-path')+1],require('node:path').join('writable-temp','engine.log'));
  const custom=core.buildArgs({...job,parameters:[...job.parameters,{name:'--log-file-path',value:'custom.log',enabled:true}]},{},options);
  assert.equal(custom.filter(a=>a==='--log-file-path').length,1);assert.equal(custom[custom.indexOf('--log-file-path')+1],'custom.log');
});

test('parse local engine help including aliases, Chinese and value placeholders',()=>{
  assert.equal(catalog.length,9); assert.equal(catalog[1].name,'--mux-after-done');
  assert.deepEqual(catalog[1].aliases,['-M','--mux-after-done']);
  assert.equal(catalog[1].takesValue,true);assert.equal(catalog[0].takesValue,false);
});
test('batch input preserves signed query strings, deduplicates and rejects non-web URLs',()=>{
  assert.deepEqual(core.parseUrls('https://a.test/v.m3u8?token=a%20b&x=2\nhttps://b.test/m\nhttps://b.test/m'),['https://a.test/v.m3u8?token=a%20b&x=2','https://b.test/m']);
  assert.throws(()=>core.parseUrls('https://a.test/v.m3u8\nfile:///C:/test'),/HTTP/);
  assert.throws(()=>core.parseUrls(''),/至少/);
});
test('arguments are separate tokens and preserve spaces, quotes and shell metacharacters',()=>{
  const job={id:'abc12345',url:'https://a.test/x?x=1&y=2',outputDir:'C:\\media folder',tempDir:'C:\\temp',parameters:[...core.DEFAULT_PARAMETERS,{name:'-H',value:'Cookie: a="x y"; b=$(whoami)',enabled:true}]};
  const args=core.buildArgs(job,{},catalog);
  assert.ok(args.includes('Cookie: a="x y"; b=$(whoami)'));assert.ok(args.includes('C:\\media folder'));
  assert.deepEqual(args.slice(0,4),[job.url,'--auto-select','-M','format=mp4']);
});
test('invalid option names and missing values rejected but custom options accepted',()=>{
  assert.throws(()=>core.validateParameters([{name:'--header foo',value:'',enabled:true}]),/名称/);
  assert.throws(()=>core.validateDownloadParameters([{name:'-M',value:'',enabled:true}],catalog),/需要/);
  assert.doesNotThrow(()=>core.validateDownloadParameters([{name:'--future-option',value:'custom',enabled:true}],catalog));
  assert.throws(()=>core.validateDownloadParameters([{name:'--help',value:'',enabled:true}],catalog),/工具/);
});
test('batch output names cannot collide even with an explicit shared name',()=>{
  const job={id:'12345678-uuid',batch:true,url:'https://a.test/live.m3u8',outputDir:'C:/out',tempDir:'C:/temp',parameters:[...core.DEFAULT_PARAMETERS,{name:'--save-name',value:'my-video',enabled:true}]};
  const args=core.buildArgs(job,{},catalog);
  assert.equal(args.filter(x=>x==='--save-name').length,1);
  assert.equal(args[args.indexOf('--save-name')+1],'my-video_12345678');
  const other=core.buildArgs({...job,id:'87654321-uuid'}, {},catalog);
  assert.notEqual(args[args.indexOf('--save-name')+1],other[other.indexOf('--save-name')+1]);
});
test('time windows sort, support cross-midnight and reject overlap, invalid dates and past starts',()=>{
  const now=Date.parse('2026-10-11T10:00:00+08:00');
  const windows=core.validateWindows([{startAt:'2026-10-12T01:00:00+08:00',endAt:'2026-10-12T02:00:00+08:00'},{startAt:'2026-10-11T23:00:00+08:00',endAt:'2026-10-12T00:30:00+08:00'}],now);
  assert.equal(windows[0].startAt,'2026-10-11T15:00:00.000Z');
  assert.throws(()=>core.validateWindows([{startAt:'',endAt:''}],now),/完整/);
  assert.throws(()=>core.validateWindows([{startAt:'2026-10-11T09:00:00+08:00',endAt:'2026-10-11T11:00:00+08:00'}],now),/晚于当前/);
  assert.throws(()=>core.validateWindows([{startAt:'2026-10-11T11:00:00+08:00',endAt:'2026-10-11T13:00:00+08:00'},{startAt:'2026-10-11T12:00:00+08:00',endAt:'2026-10-11T14:00:00+08:00'}],now),/重叠/);
});
test('schedule starts late within window, misses expired window and stops at wall-clock deadline',()=>{
  const job={status:'scheduled',startAt:'2026-10-11T12:00:00Z',endAt:'2026-10-11T13:00:00Z'};
  assert.equal(core.scheduleAction(job,Date.parse('2026-10-11T11:59:59Z')),null);
  assert.equal(core.scheduleAction(job,Date.parse('2026-10-11T12:30:00Z')),'start');
  assert.equal(core.scheduleAction(job,Date.parse(job.endAt)),'miss');
  assert.equal(core.scheduleAction({...job,status:'running'},Date.parse(job.endAt)),'stop');
});
test('scheduled recording owns time limits and unique names, disabled parameters omitted',()=>{
  const job={id:'abc12345-uuid',url:'https://a.test/live',outputDir:'C:/out',tempDir:'C:/temp',startAt:'2026-10-11T10:00:00Z',endAt:'2026-10-11T11:00:00Z',parameters:[...core.DEFAULT_PARAMETERS,{name:'--live-record-limit',value:'12:00:00',enabled:true},{name:'--task-start-at',value:'20290101000000',enabled:true},{name:'--save-name',value:'我的录制',enabled:true},{name:'--thread-count',value:'8',enabled:false}]};
  const args=core.buildArgs(job,{},catalog,Date.parse('2026-10-11T10:30:00Z'));
  assert.ok(!args.includes('--live-record-limit'));
  assert.ok(!args.includes('--task-start-at')); assert.ok(!args.includes('--thread-count'));
  assert.match(args[args.indexOf('--save-name')+1],/^我的录制_.*abc12345$/);
});
