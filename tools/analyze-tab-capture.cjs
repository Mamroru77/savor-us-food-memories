#!/usr/bin/env node
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

const root=path.resolve(__dirname,'..');
const safeKeys=['at','event','bar','from','to','key','index','route','selected','revision','mode','reason','durationMs','firstFrameWaitMs','frameBudgetMs'];

function run(command,args,{json=false,allowFailure=false}={}){
  const result=spawnSync(command,args,{encoding:'utf8',maxBuffer:128*1024*1024,windowsHide:true});
  if(result.error||result.status!==0){if(allowFailure)return null;throw new Error(`${command} failed: ${result.error?.message||result.stderr||result.status}`);}
  return json?JSON.parse(result.stdout):result.stdout;
}
function findTrace(value){
  if(Array.isArray(value?.trace)&&value.trace.some(row=>row&&typeof row.event==='string'&&Number.isFinite(Number(row.at))))return value.trace;
  const found=[];
  (function visit(node,key=''){
    if(!node||typeof node!=='object')return;
    if(Array.isArray(node)){
      if(node.some(row=>row&&typeof row.event==='string'&&Number.isFinite(Number(row.at))))found.push({key,rows:node});
      else node.forEach((item,index)=>visit(item,`${key}[${index}]`));
      return;
    }
    for(const [childKey,child] of Object.entries(node))visit(child,key?`${key}.${childKey}`:childKey);
  })(value);
  found.sort((a,b)=>score(b)-score(a));
  return found[0]?.rows||[];
  function score(item){return item.rows.length+item.rows.filter(row=>['tap','switch','switch-success','switch-failed'].includes(row.event)).length*100+(item.key.endsWith('trace')?20:0);}
}
function safeTimeline(trace){return trace.map(row=>Object.fromEntries(safeKeys.filter(key=>row[key]!==undefined).map(key=>[key,typeof row[key]==='string'?row[key].slice(0,160):row[key]])));}
function nearest(frames,pts){let lo=0,hi=frames.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(frames[mid].pts<pts)lo=mid+1;else hi=mid;}const a=frames[lo],b=frames[Math.max(0,lo-1)];return !b||Math.abs(a.pts-pts)<Math.abs(b.pts-pts)?a:b;}
function parseArgs(argv){
  const options={};const positional=[];
  for(let i=0;i<argv.length;i++){const value=argv[i];if(value==='--self-test')options.selfTest=true;else if(value==='--out')options.out=argv[++i];else if(value==='--anchor')options.anchor=argv[++i];else positional.push(value);}
  [options.video,options.log]=positional;return options;
}
function parseAnchor(value){if(!value)return null;const match=String(value).match(/^(-?\d+(?:\.\d+)?)=(\d{10,})$/);if(!match)throw new Error('--anchor must be VIDEO_PTS_SECONDS=LOG_EPOCH_MS');return {pts:Number(match[1]),epochMs:Number(match[2]),source:'cli'};}
function quoteCsv(value){const text=value==null?'':String(value);return /[",\r\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text;}
function writeCsv(file,rows){fs.writeFileSync(file,rows.map(row=>row.map(quoteCsv).join(',')).join('\n')+'\n');}
async function sha256(file){const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');}
function commandVersion(command){return (run(command,['-version'],{allowFailure:true})||'unavailable').split(/\r?\n/)[0];}
function gitState(){
  const top=run('git',['-C',root,'rev-parse','--show-toplevel'],{allowFailure:true});
  if(!top)return {commit:'not-a-git-worktree',dirty:'unknown'};
  const commit=run('git',['-C',root,'rev-parse','HEAD']).trim();
  const status=run('git',['-C',root,'status','--short']);return {commit,dirty:status.trim()?true:false};
}
function captureMeta(log){
  const source=log&&typeof log.capture==='object'?log.capture:{};const result={};
  for(const key of ['deviceModel','device','osVersion','wechatVersion','baseLibrary'])if(typeof source[key]==='string')result[key]=source[key].slice(0,120);
  if(Array.isArray(source.testOrder))result.testOrder=source.testOrder.map(value=>String(value).slice(0,120)).slice(0,20);
  return result;
}
function getEmbeddedAnchor(log,frames,probe,trace){
  const capture=log&&typeof log.capture==='object'?log.capture:{};
  if(Number.isFinite(Number(capture.videoStartEpochMs)))return {pts:frames[0].pts,epochMs:Number(capture.videoStartEpochMs),source:'log.capture.videoStartEpochMs'};
  if(capture.videoStartTime&&!Number.isNaN(Date.parse(capture.videoStartTime)))return {pts:frames[0].pts,epochMs:Date.parse(capture.videoStartTime),source:'log.capture.videoStartTime'};
  const created=probe.format?.tags?.creation_time,epochMs=created&&Date.parse(created),times=trace.map(row=>Number(row.at)).filter(Number.isFinite);
  if(Number.isFinite(epochMs)&&times.length&&Math.min(...times)>=epochMs-5000&&Math.max(...times)<=epochMs+(Number(probe.format?.duration)||0)*1000+30000)return {pts:frames[0].pts,epochMs,source:'video creation_time (manual verification required)'};
  return null;
}
function selfTest(){
  const trace=findTrace({render:{trace:[{at:1,event:'view'}]},trace:[{at:2,event:'tap'},{at:3,event:'switch'}]});assert.equal(trace.length,2);
  assert.equal(nearest([{pts:0,index:0},{pts:.04,index:1},{pts:.11,index:2}],.08).index,2);
  assert.deepEqual(parseAnchor('1.25=1700000000000'),{pts:1.25,epochMs:1700000000000,source:'cli'});
  assert(!JSON.stringify(safeTimeline([{at:1,event:'icon',frameSrc:'data:image/svg+xml,secret'}])).includes('data:image'));
  console.log('4/4 capture analyzer self-checks passed.');
}

async function main(){
  const options=parseArgs(process.argv.slice(2));if(options.selfTest)return selfTest();
  if(!options.video||!options.log)throw new Error('Usage: node tools/analyze-tab-capture.cjs VIDEO LOG_JSON [--out DIR] [--anchor VIDEO_PTS_SECONDS=LOG_EPOCH_MS]');
  const video=path.resolve(options.video),logFile=path.resolve(options.log);for(const file of [video,logFile])if(!fs.statSync(file).isFile())throw new Error(`Not a file: ${file}`);
  const log=JSON.parse(fs.readFileSync(logFile,'utf8'));const timeline=safeTimeline(findTrace(log)).sort((a,b)=>Number(a.at)-Number(b.at));
  const probe=run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','frame=best_effort_timestamp_time,pkt_pts_time,pkt_dts_time:stream=width,height,avg_frame_rate,r_frame_rate:format=duration,format_name:format_tags=creation_time','-of','json',video],{json:true});
  const frames=(probe.frames||[]).map((frame,index)=>({index,pts:Number(frame.best_effort_timestamp_time??frame.pkt_pts_time??frame.pkt_dts_time)})).filter(frame=>Number.isFinite(frame.pts)).sort((a,b)=>a.pts-b.pts||a.index-b.index);
  if(!frames.length)throw new Error('ffprobe returned no timestamped video frames');
  const anchor=parseAnchor(options.anchor)||getEmbeddedAnchor(log,frames,probe,timeline);
  const switches=timeline.filter(row=>row.event==='switch'&&Number.isFinite(Number(row.at)));
  const windows=anchor?switches.map((row,index)=>{const center=anchor.pts+(Number(row.at)-anchor.epochMs)/1000;return {id:index+1,from:row.from,to:row.to,logAt:Number(row.at),center,start:center-.35,end:center+1.05};}).filter(window=>window.end>=frames[0].pts&&window.start<=frames.at(-1).pts):[];
  const wanted=windows.length?windows.flatMap(window=>[-.25,-.05,0,.05,.12,.24,.48,.75].map(offset=>window.center+offset)):Array.from({length:Math.min(12,frames.length)},(_,index)=>frames[0].pts+(frames.at(-1).pts-frames[0].pts)*(index/Math.max(1,Math.min(12,frames.length)-1)));
  const selected=[...new Map(wanted.map(pts=>{const frame=nearest(frames,pts);return [frame.index,frame];})).values()].sort((a,b)=>a.pts-b.pts);
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');const output=path.resolve(options.out||path.join(root,'reports','captures',`${path.parse(video).name}-${stamp}`));
  if(fs.existsSync(output))throw new Error(`Output already exists: ${output}`);const keyDir=path.join(output,'keyframes');fs.mkdirSync(keyDir,{recursive:true});
  const select=selected.map(frame=>`eq(n\\,${frame.index})`).join('+');const rawPattern=path.join(keyDir,'raw-%03d.png');
  run('ffmpeg',['-v','error','-i',video,'-vf',`select=${select}`,'-fps_mode','vfr',rawPattern]);
  const keyframes=selected.map((frame,index)=>{const file=`frame-${String(index+1).padStart(3,'0')}-pts-${Math.round(frame.pts*1000)}ms.png`;fs.renameSync(path.join(keyDir,`raw-${String(index+1).padStart(3,'0')}.png`),path.join(keyDir,file));return {...frame,file:path.join('keyframes',file)};});
  const rows=Math.ceil(selected.length/4);run('ffmpeg',['-v','error','-i',video,'-vf',`select=${select},scale=360:640:force_original_aspect_ratio=decrease,pad=360:640:(ow-iw)/2:(oh-ih)/2:black,tile=4x${rows}:padding=8:margin=8`,'-frames:v','1',path.join(output,'contact-sheet.png')]);
  const eventRows=[['at_ms','video_pts_s',...safeKeys.filter(key=>key!=='at')],...timeline.map(row=>[row.at,anchor?(anchor.pts+(Number(row.at)-anchor.epochMs)/1000).toFixed(6):'',...safeKeys.filter(key=>key!=='at').map(key=>row[key]??'')])];writeCsv(path.join(output,'timeline.csv'),eventRows);
  writeCsv(path.join(output,'handoff-windows.csv'),[['window','from','to','log_at_ms','center_pts_s','start_pts_s','end_pts_s'],...windows.map(window=>[window.id,window.from,window.to,window.logAt,window.center.toFixed(6),window.start.toFixed(6),window.end.toFixed(6)])]);
  writeCsv(path.join(output,'keyframes.csv'),[['tile','decode_index','pts_s','file'],...keyframes.map((frame,index)=>[index+1,frame.index,frame.pts.toFixed(6),frame.file])]);
  const project=JSON.parse(fs.readFileSync(path.join(root,'project.private.config.json'),'utf8'));const manifest={createdAt:new Date().toISOString(),inputs:{video,videoSha256:await sha256(video),log:logFile,logSha256:await sha256(logFile)},git:gitState(),runtime:{platform:`${os.platform()} ${os.release()} ${os.arch()}`,node:process.version,ffmpeg:commandVersion('ffmpeg'),ffprobe:commandVersion('ffprobe')},project:{configuredBaseLibrary:project.libVersion||null},capture:captureMeta(log),analysis:{frameCount:frames.length,firstPts:frames[0].pts,lastPts:frames.at(-1).pts,anchor,anchorConfidence:anchor?.source==='cli'||anchor?.source?.startsWith('log.capture')?'explicit':anchor?'metadata-needs-review':'none',switchWindows:windows.length,keyframes:keyframes.length,ocr:'unavailable; VP1 identifiers require human review'}};
  fs.writeFileSync(path.join(output,'capture-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const report=[
    '# Tab capture analysis',
    '',`- Video: \`${video}\``,`- Log: \`${logFile}\``,`- Frames decoded by ffmpeg; selection order uses ffprobe per-frame PTS (${frames[0].pts.toFixed(3)}–${frames.at(-1).pts.toFixed(3)}s).`,`- Anchor: ${anchor?`${anchor.source}; confidence ${manifest.analysis.anchorConfidence}`:'none — contact sheet is chronological but log/video windows are not linked'}`,'- OCR: unavailable; low-confidence or unreadable VP1 page/bar/icon IDs must be checked manually.','- No image data URI or unrestricted log payload is copied into this report.','',
    '## Handoff windows','',windows.length?'| # | from → to | log epoch ms | video PTS window |\n|---:|---|---:|---|\n'+windows.map(window=>`| ${window.id} | ${window.from} → ${window.to} | ${window.logAt} | ${window.start.toFixed(3)}–${window.end.toFixed(3)}s |`).join('\n'):'No trustworthy log/video anchor was available. Re-run with `--anchor VIDEO_PTS_SECONDS=LOG_EPOCH_MS` or add `capture.videoStartEpochMs` to the JSON.','',
    '## Keyframes','',`[Contact sheet](./contact-sheet.png) preserves the complete frame, including page-top and TabBar markers.`,`Tiles follow [keyframes.csv](./keyframes.csv); individual full frames are in \`keyframes/\`.`,`Timeline: [timeline.csv](./timeline.csv). Capture provenance: [capture-manifest.json](./capture-manifest.json).`,'',
    '## Decision gate','',windows.length?'Review each window for page marker, B/K/R/SEL/ACTIVE/PARK, static/frame badge and visible glyph. This script does not claim device acceptance.':'Visual review is possible, but retaining/reverting a render experiment must wait for a trustworthy log/video anchor.'
  ].join('\n');fs.writeFileSync(path.join(output,'report.md'),report+'\n');
  console.log(`Analysis written to ${output}`);console.log(`Frames ${frames.length}; switches ${switches.length}; linked windows ${windows.length}; keyframes ${keyframes.length}`);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
