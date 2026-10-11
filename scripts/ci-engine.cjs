// Test dependency only: the engine is not bundled into the desktop application.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const version='v0.6.0-beta';

async function install(){
  const platform={win32:'win',darwin:'osx',linux:'linux'}[process.platform];
  if(!platform || !['x64','arm64'].includes(process.arch))throw new Error('Unsupported test platform');
  const headers={'User-Agent':'m3u8-Studio-CI',...(process.env.GH_TOKEN ? {Authorization:`Bearer ${process.env.GH_TOKEN}`} : {})};
  const response=await fetch(`https://api.github.com/repos/nilaoda/N_m3u8DL-RE/releases/tags/${version}`,{headers,signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Engine release lookup failed: HTTP ${response.status}`);
  const release=await response.json();
  const asset=release.assets.find(item=>item.name.includes(`_${platform}-${process.arch}_`) && /\.(zip|tar.gz)$/.test(item.name));
  if(!asset)throw new Error(`No engine asset for ${platform}-${process.arch}`);
  const archiveResponse=await fetch(asset.browser_download_url,{signal:AbortSignal.timeout(120000)});
  if(!archiveResponse.ok)throw new Error(`Engine download failed: HTTP ${archiveResponse.status}`);
  const archive=Buffer.from(await archiveResponse.arrayBuffer());
  if(asset.digest?.startsWith('sha256:') && createHash('sha256').update(archive).digest('hex')!==asset.digest.slice(7))throw new Error('Engine checksum mismatch');
  const directory=path.resolve(__dirname,'../.build/tools');fs.mkdirSync(directory,{recursive:true});
  const file=path.join(directory,asset.name);fs.writeFileSync(file,archive);
  execFileSync('tar',['-xf',file,'-C',directory],{stdio:'inherit'});
  const executable=path.join(directory,process.platform==='win32'?'N_m3u8DL-RE.exe':'N_m3u8DL-RE');
  if(!fs.existsSync(executable))throw new Error('Engine executable missing after extraction');
  if(process.platform!=='win32')fs.chmodSync(executable,0o755);
  if(process.env.GITHUB_PATH)fs.appendFileSync(process.env.GITHUB_PATH,directory+'\n');
  console.log(`Installed ${asset.name} in ${directory}`);
}
install().catch(error=>{console.error(error.message);process.exitCode=1;});
