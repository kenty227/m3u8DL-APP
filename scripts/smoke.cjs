const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { DownloadService } = require('../src/service.cjs');
function reportError(error){console.error(error);if(process.env.GITHUB_ACTIONS)console.log(`::error title=Media integration::${String(error.message).slice(-6000).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A')}`);process.exitCode=1;}
process.on('uncaughtException',reportError);
const root=path.resolve(__dirname,'..','.smoke');fs.mkdirSync(root,{recursive:true});
const resources=process.argv.find(arg=>arg.startsWith('--resources='))?.slice(12);
const toolsDir=resources ? path.join(resources,'tools') : undefined;
const ffmpeg=toolsDir ? path.join(toolsDir,process.platform==='win32'?'ffmpeg.exe':'ffmpeg') : 'ffmpeg';
const isolated=Boolean(resources);
const media=path.join(root,'media');fs.mkdirSync(media,{recursive:true});
if(!resources)execFileSync(ffmpeg,['-y','-filter_threads','1','-threads','1','-f','lavfi','-i','testsrc=size=320x180:rate=25','-f','lavfi','-i','sine=frequency=440','-t','6','-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-g','25','-c:a','aac','-f','hls','-hls_time','1','-hls_list_size','0',path.join(media,'test.m3u8')],{stdio:'pipe',windowsHide:true});
if(process.argv.includes('--generate-only'))process.exit(0);
if(!fs.existsSync(path.join(media,'test.m3u8')))throw new Error('Generate the local test media with smoke --generate-only before testing bundled tools.');
const playlist=fs.readFileSync(path.join(media,'test.m3u8'),'utf8');
let liveStarted;
const segments=playlist.match(/test\d+\.ts/g);
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://local').pathname.slice(1);
  if(name==='live.m3u8'){
    const elapsed=Math.floor((Date.now()-liveStarted)/1000);
    const index=Math.max(0,elapsed);
    const body=`#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXT-X-MEDIA-SEQUENCE:${index}\n#EXTINF:1.000,\n${segments[index%segments.length]}?seq=${index}\n`;
    res.writeHead(200,{'Content-Type':'application/vnd.apple.mpegurl'});res.end(body);return;
  }
  if(!/^test(?:\d+\.ts|\.m3u8)$/.test(name)){res.writeHead(404);res.end();return;}
  const file=path.join(media,name);res.writeHead(200,{'Content-Type':name.endsWith('.m3u8')?'application/vnd.apple.mpegurl':'video/mp2t'});fs.createReadStream(file).pipe(res);
});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitJob(service,id,timeout=45000){
  const start=Date.now();while(Date.now()-start<timeout){const job=service.jobs.find(j=>j.id===id);if(!['queued','scheduled','running','stopping'].includes(job.status))return job;await delay(200);}
  throw new Error('task timed out');
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const outputDir=path.join(root,isolated?'portable output 测试':'output');
  const service=new DownloadService({dataDir:path.join(root,isolated?'portable-state':'state'),downloadDir:outputDir,toolsDir,runnerPath:resources?path.join(resources,'runner.exe'):path.resolve(__dirname,'../native/runner.exe')});
  try{
    await service.ready();assert.ok(service.engineInfo.available,service.engineInfo.error);
    if(resources){
      assert.equal(service.settings.enginePath,'');assert.equal(service.settings.ffmpegPath,'');
      assert.ok(service.engineInfo.engineFile.startsWith(toolsDir));assert.ok(service.engineInfo.ffmpegFile.startsWith(toolsDir));
    }
    console.log('Engine:',service.engineInfo.version,'Options:',service.catalog.length);
    const [id]=service.addDownloads({urls:base+'/test.m3u8'});
    const vod=await waitJob(service,id);console.log('VOD:',vod.status);fs.writeFileSync(path.join(root,'vod.log'),vod.logs);assert.equal(vod.status,'completed',vod.logs);
    liveStarted=Date.now();
    const startAt=new Date(Date.now()+2000).toISOString(),endAt=new Date(Date.now()+9000).toISOString();
    // Assert the actual scheduler deadline uses the real Ctrl+C bridge.
    let reachedStopping = false;
    service.on('change',()=> { if(service.jobs.some(j=>j.status==='stopping'))reachedStopping=true; });
    const group=service.addSchedule({url:base+'/live.m3u8',title:'本地定时录制测试',windows:[{startAt,endAt}],parameters:[...service.settings.parameters,{name:'--live-wait-time',value:'1',enabled:true}]});
    const recording=service.jobs.find(j=>j.groupId===group);
    const live=await waitJob(service,recording.id,75000);console.log('Scheduled recording:',live.status);fs.writeFileSync(path.join(root,'live.log'),live.logs);assert.equal(live.status,'completed',live.logs);assert.ok(reachedStopping,'Wall-clock stop must send Ctrl+C');
    const files=fs.readdirSync(outputDir).filter(x=>x.endsWith('.mp4'));
    assert.ok(files.some(x=>x.startsWith(live.outputName)),'Current recording must produce its own MP4');
    for(const file of files){
      if(resources){execFileSync(ffmpeg,['-v','error','-i',path.join(outputDir,file),'-f','null','-'],{stdio:'pipe',windowsHide:true});assert.ok(fs.statSync(path.join(outputDir,file)).size>0);console.log('Decoded MP4 with bundled FFmpeg:',file);}
      else {const output=execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',path.join(outputDir,file)],{encoding:'utf8',windowsHide:true});assert.ok(Number(output)>0);console.log('Playable MP4:',file,'duration',output.trim());}
    }
  }finally{await service.shutdown();server.close();}
})().catch(reportError);
