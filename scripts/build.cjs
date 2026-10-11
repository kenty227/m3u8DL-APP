const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {buildPlan}=require('./build-plan.cjs');
const {prepareTools}=require('./prepare-tools.cjs');
async function build(){
const plan=buildPlan(process.argv.slice(2));
if(plan.target==='win') require('./build-native.cjs');
const root=path.resolve(__dirname,'..');
await prepareTools({root,arch:plan.arch,sourceFfmpeg:true});
const temp=path.join(root,'.build','tmp'),cache=path.join(root,'.build','cache');
fs.mkdirSync(temp,{recursive:true});fs.mkdirSync(cache,{recursive:true});
const args=[require.resolve('electron-builder/cli.js'),...plan.args];
// Use the runtime npm installed, rather than downloading the same archive again.
const distribution=path.join(root,'node_modules','electron','dist');
const runtime={win:'electron.exe',mac:'Electron.app/Contents/MacOS/Electron',linux:'electron'}[plan.target];
if(plan.localRuntime && fs.existsSync(path.join(distribution,runtime)))args.push(`--config.electronDist=${distribution}`);
const result=spawnSync(process.execPath,args,{cwd:root,stdio:['inherit','pipe','pipe'],encoding:'utf8',maxBuffer:16*1024*1024,env:{...process.env,ELECTRON_BUILDER_CACHE:cache,TEMP:temp,TMP:temp,TMPDIR:temp}});
if(result.stdout)process.stdout.write(result.stdout);
if(result.stderr)process.stderr.write(result.stderr);
if(result.error)throw result.error;
if(result.status!==0 && process.env.GITHUB_ACTIONS)annotate((result.stderr || result.stdout || `electron-builder exited with ${result.status}`).slice(-5000));
process.exitCode=result.status ?? 1;
}
function annotate(message){console.log(`::error title=Desktop packaging::${message.replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A')}`);}
build().catch(error=>{console.error(error.message);if(process.env.GITHUB_ACTIONS)annotate(error.message);process.exitCode=1;});
