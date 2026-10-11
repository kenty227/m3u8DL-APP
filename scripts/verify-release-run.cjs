const {execFileSync}=require('node:child_process');
const {checkTag,targets}=require('./release.cjs');
async function main(){
  const repo=process.env.GITHUB_REPOSITORY;
  const run=process.env.BUILD_RUN_ID;
  const tag=checkTag(process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME,require('../package.json').version);
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo||'') || !/^\d+$/.test(run||''))throw new Error('Invalid repository or build run');
  const tagSha=execFileSync('git',['rev-parse',`${tag}^{}`],{encoding:'utf8'}).trim();
  const headers={'User-Agent':'m3u8-Studio',Authorization:`Bearer ${process.env.GH_TOKEN}`};
  const api=async url=>{const response=await fetch(`https://api.github.com/repos/${repo}/${url}`,{headers,signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`GitHub API HTTP ${response.status}`);return response.json();};
  const info=await api(`actions/runs/${run}`);
  if(info.head_sha!==tagSha || info.head_repository.full_name!==repo || info.path!=='.github/workflows/build.yml')throw new Error('Build must come from this repository and exact version tag commit');
  const jobs=await api(`actions/runs/${run}/jobs?per_page=100`);
  for(const target of targets)if(!jobs.jobs.some(job=>job.name===`${target.platform}-${target.arch}` && job.status==='completed' && job.conclusion==='success'))throw new Error(`Missing successful ${target.platform}-${target.arch} native build`);
  // Publishing script fixes may differ; runtime, tooling and licensing must
  // still match the version that actually produced the binary artifacts.
  for(const file of ['src','native/Runner.cs','package.json','package-lock.json','LICENSE','THIRD_PARTY_NOTICES.md','scripts/build-ffmpeg.cjs','scripts/prepare-tools.cjs','scripts/tools-manifest.json']){
    const before=execFileSync('git',['rev-parse',`${tag}:${file}`],{encoding:'utf8'}).trim();
    const current=execFileSync('git',['rev-parse',`HEAD:${file}`],{encoding:'utf8'}).trim();
    if(before!==current)throw new Error(`Runtime or tool sources changed: ${file}. Build a new version instead of recovering this release.`);
  }
  console.log(`Verified five successful native builds for ${repo} ${tag} (${tagSha})`);
}
main().catch(error=>{console.error(error.message);console.log(`::error title=Release recovery::${error.message.replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A')}`);process.exitCode=1});
