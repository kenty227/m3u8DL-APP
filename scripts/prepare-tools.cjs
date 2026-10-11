const fs=require('node:fs');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {gunzipSync}=require('node:zlib');
const {execFileSync}=require('node:child_process');
const manifest=require('./tools-manifest.json');
const targets={win32:'win',darwin:'mac',linux:'linux'};
const digest=data=>createHash('sha256').update(data).digest('hex');

function bundleDirectory(root,platform=process.platform,arch=process.arch){
  return path.join(root,'.build','bundled',`${platform}-${arch}`,'tools');
}

async function download(asset,root){
  const cache=path.join(root,'.build','downloads');fs.mkdirSync(cache,{recursive:true});
  const file=path.join(cache,`${asset.sha256}-${asset.name}`);
  if(fs.existsSync(file)){
    const data=fs.readFileSync(file);if(digest(data)===asset.sha256)return data;
  }
  // Reuse the previous integration-test archive only when its pinned hash matches.
  const previous=path.join(root,'.build','tools',asset.name);
  if(fs.existsSync(previous)){
    const data=fs.readFileSync(previous);
    if(digest(data)===asset.sha256){fs.writeFileSync(file,data);return data;}
  }
  console.log(`Downloading ${asset.name}…`);
  const mirror=process.env.M3U8_FFMPEG_MIRROR?.replace(/\/$/,'');
  if(mirror && !mirror.startsWith('https://'))throw new Error('Tool mirrors must use HTTPS.');
  const url=mirror && asset.url.startsWith('https://github.com/eugeneware/ffmpeg-static/releases/download/')
    ? `${mirror}/${asset.url.split('/releases/download/')[1]}` : asset.url;
  let failure;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(url,{signal:AbortSignal.timeout(900000)});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const chunks=[];let size=0,nextProgress=5*1024*1024;
      for await (const chunk of response.body){
        chunks.push(chunk);size+=chunk.length;
        if(size>=nextProgress){console.log(`${asset.name}: ${Math.round(size/1024/1024)} MB downloaded`);nextProgress+=5*1024*1024;}
      }
      const data=Buffer.concat(chunks);
      if(digest(data)!==asset.sha256)throw new Error('SHA-256 mismatch');
      fs.writeFileSync(file,data);return data;
    }catch(error){failure=error;console.log(`Download attempt ${attempt+1} failed for ${asset.name}: ${error.message}`);}
  }
  throw new Error(`Cannot download ${asset.name}: ${failure.message}`);
}

async function prepareTools({root=path.resolve(__dirname,'..'),platform=process.platform,arch=process.arch}={}){
  const specification=manifest.platforms[`${targets[platform]}-${arch}`];
  if(!specification)throw new Error(`No bundled tools for ${platform}-${arch}`);
  const output=bundleDirectory(root,platform,arch);
  fs.mkdirSync(output,{recursive:true});
  const assets=[specification.engine,specification.ffmpeg,specification.license,specification.readme,...manifest.licenses];
  const results=await Promise.allSettled(assets.map(asset=>download(asset,root)));
  for(const result of results)if(result.status==='rejected')throw result.reason;
  const data=results.map(result=>result.value);
  const staging=path.join(root,'.build','staging',randomUUID());fs.mkdirSync(staging,{recursive:true});
  const archive=path.join(staging,specification.engine.name);fs.writeFileSync(archive,data[0]);
  execFileSync('tar',['-xf',archive,'-C',staging],{stdio:'inherit'});
  const suffix=platform==='win32'?'.exe':'';
  const engine=path.join(output,`N_m3u8DL-RE${suffix}`);
  fs.copyFileSync(path.join(staging,`N_m3u8DL-RE${suffix}`),engine);
  const ffmpeg=gunzipSync(data[1]);
  if(digest(ffmpeg)!==specification.ffmpegRaw.sha256)throw new Error('FFmpeg executable SHA-256 mismatch');
  const ffmpegFile=path.join(output,`ffmpeg${suffix}`);fs.writeFileSync(ffmpegFile,ffmpeg);
  fs.writeFileSync(path.join(output,'FFmpeg.LICENSE.txt'),data[2]);
  fs.writeFileSync(path.join(output,'FFmpeg.BUILD.txt'),data[3]);
  manifest.licenses.forEach((asset,index)=>fs.writeFileSync(path.join(output,asset.name),data[index+4]));
  fs.copyFileSync(path.join(root,'THIRD_PARTY_NOTICES.md'),path.join(output,'THIRD_PARTY_NOTICES.md'));
  if(platform!=='win32'){fs.chmodSync(engine,0o755);fs.chmodSync(ffmpegFile,0o755);}
  let ffmpegBuild='';
  if(platform===process.platform && arch===process.arch){
    ffmpegBuild=execFileSync(ffmpegFile,['-version'],{encoding:'utf8',windowsHide:true});
    if(ffmpegBuild.includes('--enable-nonfree'))throw new Error('This FFmpeg build is marked nonfree and cannot be bundled for redistribution.');
    fs.writeFileSync(path.join(output,'FFmpeg.VERSION.txt'),ffmpegBuild);
  }
  // Build metadata contains upstream URLs and hashes, never paths from the builder's machine.
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({platform,arch,engineVersion:manifest.engineVersion,ffmpegRelease:manifest.ffmpegVersion,ffmpegBuild,assets:specification},null,2)+'\n');
  console.log(`Bundled tools ready: ${platform}-${arch}`);
  return output;
}

module.exports={prepareTools,bundleDirectory};
if(require.main===module){
  const plan=require('./build-plan.cjs').buildPlan(process.argv.slice(2));
  prepareTools({arch:plan.arch}).catch(error=>{console.error(error.message);process.exitCode=1;});
}
