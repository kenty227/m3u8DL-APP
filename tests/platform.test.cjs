const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {toolEnvironment,validateExecutable,stopProcessGroup,resolveTool}=require('../src/platform.cjs');
const {buildPlan}=require('../scripts/build-plan.cjs');

test('desktop tool PATH preserves priority and adds native package manager paths',()=>{
  const windows={Path:'C:\\tools;C:\\Windows',CUSTOM:'value'};
  assert.deepEqual(toolEnvironment('win32',windows),windows);
  const mac=toolEnvironment('darwin',{PATH:'/custom:/usr/bin:',CUSTOM:'value'},'/Users/test');
  assert.equal(mac.PATH.split(':')[0],'/custom');
  assert.ok(mac.PATH.includes('/opt/homebrew/bin'));
  assert.ok(mac.PATH.includes('/usr/local/bin'));
  assert.equal(mac.PATH.split(':').filter(p=>p==='/usr/bin').length,1);
  assert.ok(!mac.PATH.split(':').includes(''));
  assert.equal(mac.CUSTOM,'value');
  assert.ok(toolEnvironment('linux',{},'/home/test').PATH.includes('/home/test/.local/bin'));
});

test('executable picker rejects directories and on Unix rejects files without executable permissions',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'studio-permissions-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  assert.throws(()=>validateExecutable(directory),/目录/);
  const file=path.join(directory,'engine');fs.writeFileSync(file,'#!/bin/sh\nexit 0\n',{mode:0o600});
  if(process.platform!=='win32'){
    assert.throws(()=>validateExecutable(file),/执行权限/);
    fs.chmodSync(file,0o700);validateExecutable(file);
  }else validateExecutable(file);
});

test('process group signaling tolerates exited groups and never targets the app group',()=>{
  let calls=0;
  stopProcessGroup({pid:0},'SIGINT',()=>calls++);
  assert.equal(calls,0);
  stopProcessGroup({pid:123},'SIGINT',(pid,signal)=>{
    assert.equal(pid,-123);assert.equal(signal,'SIGINT');
    throw Object.assign(new Error('gone'),{code:'ESRCH'});
  });
  assert.throws(()=>stopProcessGroup({pid:123},'SIGINT',()=>{throw Object.assign(new Error('denied'),{code:'EPERM'});}),/denied/);
});

test('bundled tools take priority over PATH, explicit user paths take priority over bundled tools',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'studio-tools-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  for(const platform of ['win32','darwin','linux']){
    const file=path.join(directory,'ffmpeg'+(platform==='win32'?'.exe':''));fs.writeFileSync(file,'tool');
    assert.equal(resolveTool('',directory,'ffmpeg',platform),file);
    assert.equal(resolveTool('/custom/ffmpeg',directory,'ffmpeg',platform),'/custom/ffmpeg');
    assert.equal(resolveTool('',directory,'missing',platform),'');
  }
});

test('native builds select each OS and do not reuse an Electron runtime for another architecture',()=>{
  for(const [platform,target] of [['win32','win'],['darwin','mac'],['linux','linux']]){
    const plan=buildPlan([],platform,'x64');
    assert.equal(plan.target,target);assert.equal(plan.arch,'x64');assert.equal(plan.localRuntime,true);
    assert.ok(plan.args.includes('--publish=never'));
  }
  const arm=buildPlan(['--arm64'],'darwin','x64');
  assert.equal(arm.localRuntime,false);assert.equal(arm.arch,'arm64');
  assert.throws(()=>buildPlan(['--mac'],'win32','x64'),/对应/);
  assert.throws(()=>buildPlan(['--win','--linux'],'win32','x64'),/一个系统/);
  assert.throws(()=>buildPlan(['--arm64'],'win32','x64'),/Windows 支持 x64/);
});

test('actual native Unix groups include engine subprocesses', {skip:process.platform==='win32',timeout:15000},async t=>{
  const {spawn}=require('node:child_process');
  const {once}=require('node:events');
  // Both parent and child install SIGINT handlers; do not rely on shell behavior.
  const program=`const {spawn}=require('node:child_process');let stopping=false;process.on('SIGINT',()=>{console.log('PARENT_STOP');stopping=true;});const child=spawn(process.execPath,['-e',\"process.on('SIGINT',()=>{process.stdout.write('CHILD_STOP\\\\n',()=>process.exit(0))});console.log('READY');setInterval(()=>{},1000)\"],{stdio:['ignore','pipe','inherit']});child.stdout.pipe(process.stdout);child.on('close',()=>process.exit(stopping?0:1));setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['-e',program],{detached:true,stdio:['ignore','pipe','pipe']});
  t.after(()=>stopProcessGroup(child,'SIGKILL'));
  let output='';child.stdout.setEncoding('utf8');child.stdout.on('data',data=>output+=data);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('subprocess did not start')),5000);
    const listener=data=>{if(data.includes('READY')){clearTimeout(timer);child.stdout.off('data',listener);resolve();}};
    child.stdout.on('data',listener);
  });
  const closed=once(child,'close',{signal:AbortSignal.timeout(5000)});stopProcessGroup(child,'SIGINT');await closed;
  assert.match(output,/PARENT_STOP/);assert.match(output,/CHILD_STOP/);
});
