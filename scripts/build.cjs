const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {buildPlan}=require('./build-plan.cjs');
const {prepareTools}=require('./prepare-tools.cjs');
async function build(){
const plan=buildPlan(process.argv.slice(2));
if(plan.target==='win') require('./build-native.cjs');
const root=path.resolve(__dirname,'..');
await prepareTools({root,arch:plan.arch});
const temp=path.join(root,'.build','tmp'),cache=path.join(root,'.build','cache');
fs.mkdirSync(temp,{recursive:true});fs.mkdirSync(cache,{recursive:true});
const args=[require.resolve('electron-builder/cli.js'),...plan.args];
// Use the runtime npm installed, rather than downloading the same archive again.
const distribution=path.join(root,'node_modules','electron','dist');
const runtime={win:'electron.exe',mac:'Electron.app/Contents/MacOS/Electron',linux:'electron'}[plan.target];
if(plan.localRuntime && fs.existsSync(path.join(distribution,runtime)))args.push(`--config.electronDist=${distribution}`);
const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',env:{...process.env,ELECTRON_BUILDER_CACHE:cache,TEMP:temp,TMP:temp,TMPDIR:temp}});
if(result.error)throw result.error;
process.exitCode=result.status ?? 1;
}
build().catch(error=>{console.error(error.message);process.exitCode=1;});
