const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const platform=process.platform,arch=process.arch;
const directory=platform==='win32'?'win-unpacked':platform==='darwin'?`mac${arch==='arm64'?'-arm64':''}`:`linux${arch==='arm64'?'-arm64':''}-unpacked`;
const resources=path.join(root,'dist',directory,...(platform==='darwin'?['m3u8 Studio.app','Contents','Resources']:['resources']));
const custom=process.argv.find(arg=>arg.startsWith('--resources='))?.slice(12);
const selected=custom||resources;
if(!fs.existsSync(path.join(selected,'tools','manifest.json')))throw new Error('Build the application before running its portable test.');
// Test fixture generation uses the developer/CI FFmpeg. Downloading, stopping,
// muxing and decoding below use only the shipped tools with a restricted PATH.
const fixture=spawnSync(process.execPath,[path.join(__dirname,'smoke.cjs'),'--generate-only'],{cwd:root,stdio:'inherit'});
if(fixture.error)throw fixture.error;
if(fixture.status!==0)process.exit(fixture.status??1);
const environment={...process.env};
for(const key of Object.keys(environment))if(key.toLowerCase()==='path')delete environment[key];
environment.PATH=platform==='win32'?path.join(process.env.WINDIR||'C:\\Windows','System32'):'/usr/bin:/bin';
console.log('Testing packaged tools with local engine and FFmpeg directories removed from PATH.');
const result=spawnSync(process.execPath,[path.join(__dirname,'smoke.cjs'),`--resources=${selected}`],{cwd:root,env:environment,stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
