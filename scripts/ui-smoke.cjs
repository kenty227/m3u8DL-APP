const fs=require('node:fs');
const path=require('node:path');
const {spawn,execFile}=require('node:child_process');
const http=require('node:http');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const port=9337;
let electron,socket,sequence=0,electronOutput='';
const pending=new Map(),errors=[];
async function closeNativeWindow(){
  const targets=await fetch(`http://127.0.0.1:${port+1}/json`).then(r=>r.json());
  const inspector=new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{inspector.addEventListener('open',resolve,{once:true});inspector.addEventListener('error',reject,{once:true});});
  try{return await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Main inspector timed out')),10000);
    inspector.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id===1){clearTimeout(timer);if(message.result?.exceptionDetails)reject(new Error(JSON.stringify(message.result.exceptionDetails)));else resolve(message.result?.result?.value);}});
    inspector.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:`(()=>{const win=process.mainModule.require('electron').BrowserWindow.getAllWindows()[0];win.close();return !win.isDestroyed() && (process.platform==='linux' ? win.isMinimized() : !win.isVisible());})()`,returnByValue:true}}));
  });}finally{inspector.close();}
}
async function command(method,params={}) {
  return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
}
async function evaluate(expression) {
  const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function until(expression,timeout=20000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await wait(150);}throw new Error('UI condition timed out: '+expression);}
async function screenshot(name){await evaluate(`document.getElementById('toasts').replaceChildren()`);const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts',name+'.png'),Buffer.from(shot.data,'base64'));}
const server=http.createServer((req,res)=>{
  const file=req.url.split('?')[0].slice(1);
  if(!/^test(?:\d+\.ts|\.m3u8)$/.test(file)){res.writeHead(404);res.end();return;}
  fs.createReadStream(path.join(root,'.smoke/media',file)).pipe(res);
});
(async()=>{
  const stateFile=path.join(root,'.smoke/ui-state/state.json');if(fs.existsSync(stateFile))fs.unlinkSync(stateFile);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const packaged=process.argv.find(arg=>arg.startsWith('--app='))?.slice(6);
  const cleanTools=process.argv.includes('--clean-tools');
  const environment={...process.env,M3U8_STUDIO_SMOKE_DIR:path.join(root,'.smoke/ui-state')};
  if(cleanTools){
    for(const key of Object.keys(environment))if(key.toLowerCase()==='path')delete environment[key];
    environment.PATH=process.platform==='win32'?path.join(process.env.WINDIR||'C:\\Windows','System32'):'/usr/bin:/bin';
  }
  electron=spawn(packaged || require('electron'),[...(packaged?[]:['.']), '--smoke',`--remote-debugging-port=${port}`,`--inspect=${port+1}`],{cwd:root,windowsHide:true,detached:process.platform!=='win32',env:environment,stdio:['ignore','pipe','pipe']});
  for(const stream of [electron.stdout,electron.stderr])stream.on('data',data=>electronOutput=(electronOutput+data.toString()).slice(-5000));
  let targets;
  for(let i=0;i<80;i++){try{targets=await fetch(`http://127.0.0.1:${port}/json`).then(r=>r.json());if(targets.some(t=>t.type==='page'))break;}catch{}await wait(150);}
  assert.ok(targets,'Electron debugging endpoint unavailable');
  socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.id){const task=pending.get(message.id);if(task){clearTimeout(task.timer);pending.delete(message.id);message.error?task.reject(new Error(message.error.message)):task.resolve(message.result);}}
    else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails);
    else if(message.method==='Log.entryAdded'&&message.params.entry.level==='error')errors.push(message.params.entry);
  });
  await command('Runtime.enable');await command('Log.enable');await command('Page.enable');
  await until(`window.studio && document.querySelector('.parameter-row') && document.getElementById('engine-label').textContent.includes('就绪')`);
  assert.equal(await evaluate(`typeof require`),'undefined');
  const catalog=await evaluate(`window.studio.invoke('snapshot').then(s=>s.catalog)`);
  if(cleanTools){
    const snapshot=await evaluate(`window.studio.invoke('snapshot')`);
    assert.equal(snapshot.settings.enginePath,'');assert.equal(snapshot.settings.ffmpegPath,'');
    assert.match(snapshot.engine.engineFile,/[\\/]tools[\\/]N_m3u8DL-RE/);
    assert.match(snapshot.engine.ffmpegFile,/[\\/]tools[\\/]ffmpeg/);
  }
  assert.ok(catalog.length>5,'Load the installed engine catalog');
  assert.ok(catalog.every(option=>!/[\uFFFD]/.test(option.description+option.placeholder)),'Engine help must decode without replacement characters');
  await screenshot('download');
  await evaluate(`document.getElementById('download-details').open=true;document.querySelector('#download-parameters .add-parameter').click();document.querySelector('#download-parameters .parameter-row:last-child .name-input').focus();`);
  assert.equal(await evaluate(`document.querySelector('#download-parameters .parameter-row:last-child .option-menu small').textContent`),catalog[0].description);
  await screenshot('parameters-encoding');
  await evaluate(`parameterEditor('download-parameters',recommended);`);
  await evaluate(`document.getElementById('download-details').open=true;document.querySelector('#download-parameters .name-input').focus();document.querySelector('#download-parameters .name-input').value='header';document.querySelector('#download-parameters .name-input').dispatchEvent(new Event('input',{bubbles:true}));`);
  assert.ok(await evaluate(`document.querySelector('#download-parameters .option-menu').textContent.includes('--header')`));
  await evaluate(`document.querySelector('#download-parameters .option-menu button').click();`);
  assert.equal(await evaluate(`document.querySelector('#download-parameters .name-input').value`),'--header');
  // Restore the recommended parameters after testing the searchable selector.
  await evaluate(`parameterEditor('download-parameters',recommended);document.getElementById('download-details').open=false;`);
  await evaluate(`document.querySelector('[data-page=settings]').click();document.getElementById('settings-output').value=${JSON.stringify(path.join(root,'.smoke/ui-output'))};document.getElementById('max-concurrent').value='1';document.getElementById('save-settings').click();`);
  await until(`document.querySelector('#toasts').textContent.includes('设置已保存')`);
  await screenshot('settings');
  await evaluate(`document.getElementById('settings-parameters').scrollIntoView({block:'end'});`);await screenshot('settings-parameters');
  const base=`http://127.0.0.1:${server.address().port}`;
  await evaluate(`document.querySelector('[data-page=download]').click();document.getElementById('download-urls').value=${JSON.stringify(base+'/test.m3u8?one=1\n'+base+'/test.m3u8?two=2')};document.getElementById('start-download').click();`);
  await until(`window.studio.invoke('snapshot').then(s=>s.jobs.filter(j=>!j.startAt&&j.status==='completed').length>=2)`,30000);
  const downloaded=await evaluate(`window.studio.invoke('snapshot').then(s=>s.jobs.filter(j=>!j.startAt&&j.status==='completed'))`);
  const outputFiles=fs.readdirSync(path.join(root,'.smoke/ui-output'));
  for(const job of downloaded)assert.ok(outputFiles.some(file=>file.endsWith('.mp4')&&file.includes(job.id.slice(0,8))),'Each batch task needs a separate MP4 file');
  await screenshot('downloads-completed');
  await evaluate(`document.querySelector('[data-page=schedule]').click();document.getElementById('schedule-title').value='本地录制计划';document.getElementById('schedule-url').value=${JSON.stringify(base+'/test.m3u8')};document.getElementById('add-window').click();`);await screenshot('schedule-form');
  await evaluate(`document.getElementById('save-schedule').click();`);
  await until(`window.studio.invoke('snapshot').then(s=>s.jobs.filter(j=>j.status==='scheduled').length===2)`);
  await screenshot('schedule');
  await evaluate(`document.querySelector('#schedule-list [data-action=stop]').click();`);
  await until(`window.studio.invoke('snapshot').then(s=>s.jobs.filter(j=>j.status==='scheduled').length===1)`);
  await evaluate(`document.querySelector('[data-page=download]').click();document.querySelector('#download-list [data-action=logs]').click();`);
  assert.ok(await evaluate(`document.getElementById('logs-dialog').open && document.getElementById('logs-content').textContent.includes('Done')`));
  await evaluate(`document.getElementById('close-logs').click();`);
  assert.deepEqual(errors,[],'Renderer must have no JavaScript or CSP errors');
  assert.ok(await closeNativeWindow(),'Closing the native window must hide it and preserve the background service');
  console.log('UI verified: navigation, searchable parameters, saved defaults, separate batch files, two schedule windows, cancellation, logs, renderer isolation, close-to-tray.');
} )().catch(error=>{console.error(error);if(electronOutput)console.error(electronOutput);process.exitCode=1;}).finally(async()=>{
  socket?.close();server.close();
  if(electron?.pid){if(process.platform==='win32')await new Promise(resolve=>execFile('taskkill',['/PID',String(electron.pid),'/T','/F'],{windowsHide:true},resolve));else {try{process.kill(-electron.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}}}
});
