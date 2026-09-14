#!/usr/bin/env node
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn,spawnSync}=require('node:child_process');

const root=path.resolve(__dirname,'..');
const cli=process.env.WECHATIDE_CLI||'D:\\software data\\微信web开发者工具\\wechatide.cmd';
const ideDir=path.dirname(cli);
const electron=path.join(ideDir,'微信开发者工具.exe');
const skillIndex=path.join(ideDir,'resources','app.asar.unpacked','js','common','cli','skill-index.js');
const bootstrap="const e=process.argv[1],a=process.argv.slice(2).filter(function(x){return x!=='--electron'});if(!process.env.cwd)process.env.cwd=process.cwd();process.argv=[process.execPath,e,'--electron'].concat(a);require(e)";
const safeKeys=['at','event','bar','from','to','key','index','route','selected','revision','mode','reason','durationMs','firstFrameWaitMs','frameBudgetMs'];

function run(command,args,{allowFailure=false}={}){
  const result=spawnSync(command,args,{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
  if(result.error||result.status!==0){if(allowFailure)return null;throw new Error(`${command} failed: ${result.error?.message||result.stderr||result.status}`);}return result.stdout;
}
function tool(name,args){
  const result=spawnSync(electron,['-e',bootstrap,skillIndex,'-c','codex',name,'--project',root,...args],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',ELECTRON:'',cwd:process.cwd()}});
  if(result.error||result.status!==0)throw new Error(`${cli} failed: ${result.error?.message||result.stderr||result.stdout||result.status}`);
  const start=result.stdout.indexOf('{');if(start<0)throw new Error(`${name} returned no JSON`);const parsed=JSON.parse(result.stdout.slice(start));if(!parsed.ok)throw new Error(`${name}: ${parsed.message||'failed'}`);return parsed.result;
}
function currentPage(){return tool('automation_runtime_info',['--action','currentPage']).currentPage;}
function systemInfo(){return tool('automation_runtime_info',['--action','systemInfo']).systemInfo.result;}
function evaluate(source){return tool('automation_evaluate',['--fn-source',source]).result.result;}
function safeRow(row){return Object.fromEntries(safeKeys.filter(key=>row?.[key]!==undefined).map(key=>[key,typeof row[key]==='string'?row[key].slice(0,160):row[key]]));}
function probe(){
  const value=evaluate("function(){var p=getCurrentPages().slice(-1)[0];var b=p&&p.getTabBar&&p.getTabBar();var d=b&&b.getTransitionDebug?b.getTransitionDebug():null;return {at:Date.now(),route:p&&p.route,tab:d?{schema:d.schema,bar:d.bar,selected:d.selected,entryKey:d.entryKey,entryActive:d.entryActive,visualProbeBuild:d.visualProbeBuild,visualProbePage:d.visualProbePage,trace:(d.trace||[]).slice(-80)}:null};}");
  if(!value.tab)throw new Error(`custom TabBar unavailable on ${value.route||'unknown route'}`);value.tab.trace=value.tab.trace.map(safeRow);return value;
}
function tap(index){assert(Number.isInteger(index)&&index>=0&&index<5);return evaluate(`function(){var index=${index},p=getCurrentPages().slice(-1)[0];var b=p&&p.getTabBar&&p.getTabBar();if(!b||!b.onTabTap)throw new Error('custom TabBar tap unavailable');var item=b.data.list[index],from=b.routeSelection();var at=Date.now();b.onTabTap({currentTarget:{dataset:{index:index,path:item.pagePath}}});return {at:at,from:from,to:index,index:index,route:p.route};}`);}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function waitRoute(route,timeout=5000){const deadline=Date.now()+timeout;do{const page=currentPage();if(page.path===route)return page;await wait(100);}while(Date.now()<deadline);throw new Error(`Timed out waiting for ${route}`);}
function gitState(){return {commit:run('git',['-C',root,'rev-parse','HEAD']).trim(),dirty:Boolean(run('git',['-C',root,'status','--short']).trim())};}
function parseArgs(argv){const out={windowTitle:'微信'};for(let i=0;i<argv.length;i++){if(argv[i]==='--self-test')out.selfTest=true;else if(argv[i]==='--out')out.out=argv[++i];else if(argv[i]==='--window-title')out.windowTitle=argv[++i];else throw new Error(`Unknown argument: ${argv[i]}`);}return out;}
function selfTest(){assert.deepEqual(safeRow({at:1,event:'switch',frameSrc:'data:image/svg+xml,secret'}),{at:1,event:'switch'});assert.deepEqual(parseArgs(['--window-title','Phone']),{windowTitle:'Phone'});console.log('2/2 projected capture self-checks passed.');}

async function main(){
  const options=parseArgs(process.argv.slice(2));if(options.selfTest)return selfTest();
  for(const file of [cli,electron,skillIndex])if(!fs.existsSync(file))throw new Error(`Missing executable: ${file}`);
  const info=systemInfo();if(info.platform!=='android')throw new Error(`WechatIDE automator is not attached to Android: ${info.platform}`);
  if(currentPage().path!=='pages/add/index'){tap(2);await waitRoute('pages/add/index');await wait(700);}
  const stamp=new Date().toISOString().replace(/[:.]/g,'-'),output=path.resolve(options.out||path.join(os.tmpdir(),`savor-projected-${stamp}`));if(fs.existsSync(output))throw new Error(`Output already exists: ${output}`);fs.mkdirSync(output,{recursive:true});
  const video=path.join(output,'projected-tab-loop.mp4'),logFile=path.join(output,'projected-tab-loop.json'),git=gitState();
  const capture={createdAt:new Date().toISOString(),videoStartEpochMs:Date.now(),deviceModel:info.model,device:'WechatIDE remote runtime',osVersion:info.system,wechatVersion:info.version,baseLibrary:info.SDKVersion,testOrder:['Add -> Me','Me -> Add'],input:'WechatIDE true-device getTabBar().onTabTap',videoSource:`OPPO phoneCast window: ${options.windowTitle}`,git};
  const trace=[],snapshots=[];
  const recorder=spawn('ffmpeg',['-v','error','-f','gdigrab','-framerate','60','-i',`title=${options.windowTitle}`,'-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-preset','ultrafast','-crf','16','-pix_fmt','yuv420p','-t','30',video],{windowsHide:true,stdio:['pipe','ignore','pipe']});
  let recorderError='',recorderExit=null;recorder.stderr.on('data',chunk=>{recorderError+=chunk;});const recorderDone=new Promise(resolve=>{recorder.once('error',error=>resolve({error}));recorder.once('exit',code=>resolve({code}));});recorderDone.then(value=>{recorderExit=value;});
  try{
    await wait(500);if(recorderExit)throw new Error(`ffmpeg capture failed before navigation: ${recorderExit.error?.message||recorderError||recorderExit.code}`);snapshots.push({stage:'add-before',...probe()});
    const forward=tap(4);trace.push(safeRow({...forward,event:'tap'}),safeRow({...forward,event:'switch'}));await waitRoute('pages/me/index');snapshots.push({stage:'me-route',...probe()});await wait(900);snapshots.push({stage:'me-settled',...probe()});
    const reverse=tap(2);trace.push(safeRow({...reverse,event:'tap'}),safeRow({...reverse,event:'switch'}));await waitRoute('pages/add/index');snapshots.push({stage:'add-route',...probe()});await wait(900);snapshots.push({stage:'add-settled',...probe()});
    recorder.stdin.write('q\n');const recorded=await recorderDone;if(recorded.error||recorded.code!==0)throw new Error(`ffmpeg capture failed: ${recorded.error?.message||recorderError||recorded.code}`);
    fs.writeFileSync(logFile,JSON.stringify({capture,trace,snapshots},null,2)+'\n');
    const frames=JSON.parse(run('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames,width,height:format=duration','-of','json',video]));if(!Number(frames.streams?.[0]?.nb_read_frames))throw new Error('Projected video contains no frames');
    run(process.execPath,[path.join(__dirname,'analyze-tab-capture.cjs'),video,logFile,'--out',path.join(output,'analysis')]);
    console.log(JSON.stringify({video,log:logFile,analysis:path.join(output,'analysis'),route:currentPage().path,device:info.model,videoProbe:frames},null,2));
  }catch(error){recorder.stdin.write('q\n');await recorderDone;throw error;}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
