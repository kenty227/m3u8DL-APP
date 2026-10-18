const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { DownloadService } = require('../src/service.cjs');
const core = require('../src/core.cjs');

function fixture(t, overrides = {}) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'m3u8-studio-test-'));
  const calls=[];let now=Date.parse('2026-10-11T10:00:00Z');
  const runner=path.join(directory,'runner.exe');fs.writeFileSync(runner,'fake');
  const service=new DownloadService({platform:'win32',dataDir:directory,downloadDir:path.join(directory,'output'),runnerPath:runner,clock:()=>now,...overrides,spawnProcess:(file,args,options)=>{
    const child=new EventEmitter();child.pid=4321;child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>{};calls.push({file,args,options,child});return child;
  }});
  service.engineInfo={available:true,ffmpegAvailable:true,source:'installed'};
  t.after(()=> { clearTimeout(service.saveTimer);for(const entry of service.processes.values())clearTimeout(entry.timeout);fs.rmSync(directory,{recursive:true,force:true}); });
  return {service,calls,directory,setNow:value=>now=Date.parse(value)};
}
test('batch queue honors concurrency, advances on completion and never launches a shell',t=>{
  const {service,calls}=fixture(t);service.settings.maxConcurrent=1;
  service.addDownloads({urls:'https://a.test/1\nhttps://a.test/2'});
  assert.equal(calls.length,1);assert.equal(calls[0].options.shell,false);
  calls[0].child.emit('close',0);assert.equal(calls.length,2);
  assert.equal(service.jobs.filter(j=>j.status==='completed').length,1);
  calls[1].child.emit('close',0);
});
test('multiple windows persist and scheduled downloads bypass a busy VOD queue',t=>{
  const {service,calls,setNow,directory}=fixture(t);service.settings.maxConcurrent=1;
  service.addDownloads({urls:'https://a.test/vod'});
  service.addSchedule({url:'https://a.test/live',windows:[{startAt:'2026-10-11T10:01:00Z',endAt:'2026-10-11T10:02:00Z'},{startAt:'2026-10-11T11:00:00Z',endAt:'2026-10-11T12:00:00Z'}]});
  assert.equal(service.jobs.filter(j=>j.status==='scheduled').length,2);
  setNow('2026-10-11T10:01:00Z');service.tick();assert.equal(calls.length,2);
  setNow('2026-10-11T10:02:00Z');service.tick();
  const recording=service.jobs.find(j=>j.status==='stopping');assert.ok(recording);
  assert.equal(calls[1].child.stdin.read().toString(),'stop\n');
  calls[1].child.emit('close',0);assert.equal(recording.status,'completed');
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'state.json'),'utf8')).jobs.length,3);
  calls[0].child.emit('close',0);
});
test('recovery interrupts unfinished downloads, preserves future schedules and marks missed windows',t=>{
  const {service,calls,directory}=fixture(t);
  service.addDownloads({urls:'https://a.test/vod'});
  service.addSchedule({url:'https://a.test/live',windows:[{startAt:'2026-10-11T10:01:00Z',endAt:'2026-10-11T10:02:00Z'}]});
  const recovered=new DownloadService({dataDir:directory,downloadDir:path.join(directory,'out'),clock:()=>Date.parse('2026-10-11T11:00:00Z')});
  recovered.tick();assert.ok(recovered.jobs.some(j=>j.status==='interrupted'));assert.ok(recovered.jobs.some(j=>j.status==='missed'));
  calls[0].child.emit('close',0);
});
test('spawn errors fail tasks; cancelling a queued task cannot delete the output',t=>{
  const {service,calls,directory}=fixture(t);service.settings.maxConcurrent=1;
  const ids=service.addDownloads({urls:'https://a.test/1\nhttps://a.test/2'});
  service.stop(ids[1]);assert.equal(service.jobs.find(j=>j.id===ids[1]).status,'cancelled');
  calls[0].child.emit('error',new Error('not found'));assert.equal(service.jobs.find(j=>j.id===ids[0]).status,'failed');
  const media=path.join(directory,'output','keep.mp4');fs.writeFileSync(media,'media');service.remove(ids[1]);assert.equal(fs.readFileSync(media,'utf8'),'media');
});
test('custom save directory is used and task settings are snapshots',t=>{
  const {service,calls,directory}=fixture(t);
  const output=path.join(directory,'自定义 路径');
  const [id]=service.addDownloads({urls:'https://a.test/x',parameters:[...core.DEFAULT_PARAMETERS,{name:'--save-dir',value:output,enabled:true}]});
  service.settings.parameters=[];
  assert.equal(service.jobs.find(j=>j.id===id).outputDir,output);
  assert.equal(path.dirname(service.jobs.find(j=>j.id===id).tempDir),output);
  assert.ok(calls[0].args.includes('format=mp4'));calls[0].child.emit('close',0);
});
test('error text in a URL is not a failure, but an engine ERROR entry is',t=>{
  const {service,calls}=fixture(t);service.settings.maxConcurrent=1;
  const [first,second]=service.addDownloads({urls:'https://a.test/error-video.m3u8\nhttps://a.test/second'});
  calls[0].child.stdout.write('14:00:00.000 INFO : 加载URL: https://a.test/error-video.m3u8\n');calls[0].child.emit('close',0);
  assert.equal(service.jobs.find(j=>j.id===first).status,'completed');
  calls[1].child.stdout.write('14:00:00.100 ERROR : Mux failed\n');calls[1].child.emit('close',0);
  assert.equal(service.jobs.find(j=>j.id===second).status,'failed');
});

for (const platform of ['darwin', 'linux']) {
  test(`${platform}: recording starts without Windows runner and deadline interrupts the entire group`, t => {
    const signals=[];
    const {service,calls,setNow}=fixture(t,{platform,killProcess:(pid,signal)=>signals.push({pid,signal})});
    service.settings.enginePath='/opt/tools/N_m3u8DL-RE';
    service.addSchedule({url:'https://a.test/live',windows:[{startAt:'2026-10-11T10:01:00Z',endAt:'2026-10-11T10:02:00Z'}]});
    setNow('2026-10-11T10:01:00Z');service.tick();
    assert.equal(calls[0].file,'/opt/tools/N_m3u8DL-RE');
    assert.equal(calls[0].args[0],'https://a.test/live');
    assert.equal(calls[0].options.detached,true);
    assert.equal(calls[0].options.shell,false);
    assert.ok(calls[0].options.env.PATH.includes('/usr/local/bin'));
    setNow('2026-10-11T10:02:00Z');service.tick();
    assert.deepEqual(signals,[{pid:-4321,signal:'SIGINT'}]);
    calls[0].child.emit('close',0);
    assert.equal(service.jobs[0].status,'completed');
  });

  test(`${platform}: stop timeout kills the group and records failure, user stop records cancellation`, async t => {
    const signals=[];
    const {service,calls}=fixture(t,{platform,stopTimeout:10,killProcess:(pid,signal)=>signals.push({pid,signal})});
    const [first]=service.addDownloads({urls:'https://a.test/vod'});
    service.stop(first);
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.deepEqual(signals,[{pid:-4321,signal:'SIGINT'},{pid:-4321,signal:'SIGKILL'}]);
    calls[0].child.emit('close',null,'SIGKILL');
    assert.equal(service.jobs.find(j=>j.id===first).status,'failed');
    const [second]=service.addDownloads({urls:'https://a.test/second'});
    service.stop(second);calls[1].child.emit('close',null,'SIGINT');
    assert.equal(service.jobs.find(j=>j.id===second).status,'cancelled');
  });
}

test('intentional Ctrl+C or SIGINT can complete a scheduled recording only after successful finalization',async t=>{
  for(const [platform,code,signal] of [['win32',0xC000013A,null],['linux',null,'SIGINT']]){
    const {service,calls,setNow}=fixture(t,{platform,killProcess:()=>{}});
    service.addSchedule({url:'https://a.test/live',parameters:[...core.DEFAULT_PARAMETERS,{name:'--live-real-time-merge',value:'',enabled:true}],windows:[{startAt:'2026-10-11T10:01:00Z',endAt:'2026-10-11T10:02:00Z'}]});
    setNow('2026-10-11T10:01:00Z');service.tick();
    setNow('2026-10-11T10:02:00Z');service.tick();
    let finalized=false;service.finalizeRecording=async()=>{finalized=true;};
    await service.finish(service.jobs[0],code,'',signal);
    assert.equal(finalized,true);assert.equal(service.jobs[0].status,'completed');
    service.addSchedule({url:'https://a.test/live',parameters:core.DEFAULT_PARAMETERS,windows:[{startAt:'2026-10-11T10:03:00Z',endAt:'2026-10-11T10:04:00Z'}]});
    setNow('2026-10-11T10:03:00Z');service.tick();
    setNow('2026-10-11T10:04:00Z');service.tick();
    service.finalizeRecording=async()=>{throw new Error('No media');};
    await service.finish(service.jobs[0],code,'',signal);
    assert.equal(service.jobs[0].status,'failed');assert.match(service.jobs[0].error,/No media/);
  }
});

test('default schedules keep segments beside downloads and complete on interruption without finalizing',async t=>{
  for(const [platform,code,signal] of [['win32',0xC000013A,null],['linux',null,'SIGINT'],['darwin',130,null]]){
    const {service,calls,setNow,directory}=fixture(t,{platform,killProcess:()=>{}});
    service.engineInfo.ffmpegAvailable=false;
    const output=path.join(directory,'录制 分片');
    service.addSchedule({url:'https://a.test/live',outputDir:output,windows:[{startAt:'2026-10-11T10:01:00Z',endAt:'2026-10-11T10:02:00Z'},{startAt:'2026-10-11T11:01:00Z',endAt:'2026-10-11T11:02:00Z'}]});
    const [job,other]=service.jobs;
    assert.equal(path.dirname(job.tempDir),output);assert.notEqual(job.tempDir,other.tempDir);
    assert.deepEqual(job.parameters,service.snapshot().scheduleParameters);
    setNow('2026-10-11T10:01:00Z');service.tick();
    assert.ok(!calls[0].args.includes('--live-real-time-merge'));assert.ok(!calls[0].args.includes('-M'));
    assert.ok(calls[0].args.includes('--skip-merge'));
    const segment=path.join(job.tempDir,'keep.ts');fs.writeFileSync(segment,'media');
    setNow('2026-10-11T10:02:00Z');service.tick();
    service.finalizeRecording=async()=>{throw new Error('Must not merge');};
    await service.finish(job,code,'',signal);
    assert.equal(job.status,'completed');assert.equal(fs.readFileSync(segment,'utf8'),'media');
    assert.ok(!job.logs.includes('等待引擎合并'));
    service.remove(job.id);assert.ok(fs.existsSync(segment));
  }
});

test('skip-merge suppresses fallback finalization even when mux is enabled',async t=>{
  const {service}=fixture(t);
  const job={parameters:[...core.DEFAULT_PARAMETERS,{name:'--skip-merge',value:'',enabled:true}]};
  await assert.doesNotReject(service.finalizeRecording(job));
  service.engineInfo.ffmpegAvailable=false;
  assert.doesNotThrow(()=>service.ensureEngine(job.parameters));
});

test('unexpected SIGINT cannot report a successful ordinary download',async t=>{
  const {service}=fixture(t,{platform:'linux',killProcess:()=>{}});
  service.addDownloads({urls:'https://a.test/vod'});
  await service.finish(service.jobs[0],null,'','SIGINT');
  assert.equal(service.jobs[0].status,'failed');
});

test('saved automatic schedules resolve the current bundle after portable extraction paths change',t=>{
  const {service,directory}=fixture(t);
  const oldTools=path.join(directory,'old-extraction','tools'),newTools=path.join(directory,'new extraction 中文','tools');
  for(const folder of [oldTools,newTools]){
    fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'N_m3u8DL-RE.exe'),'engine');fs.writeFileSync(path.join(folder,'ffmpeg.exe'),'ffmpeg');
  }
  service.toolsDir=oldTools;
  service.addSchedule({url:'https://a.test/live',windows:[{startAt:'2026-10-11T10:01:00Z',endAt:'2026-10-11T10:02:00Z'}]});
  assert.equal(service.jobs[0].enginePath,'');assert.equal(service.jobs[0].ffmpegPath,'');
  fs.rmSync(oldTools,{recursive:true});
  let launched;
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();
  const recovered=new DownloadService({dataDir:directory,downloadDir:path.join(directory,'output'),platform:'win32',toolsDir:newTools,runnerPath:path.join(directory,'runner.exe'),clock:()=>Date.parse('2026-10-11T10:01:00Z'),spawnProcess:(file,args,options)=>{launched={file,args,options};return child;}});
  recovered.tick();
  assert.equal(launched.args[0],path.join(newTools,'N_m3u8DL-RE.exe'));
  assert.ok(launched.args.includes(path.join(newTools,'ffmpeg.exe')));
  child.emit('close',0);assert.equal(recovered.jobs[0].status,'completed');
});
