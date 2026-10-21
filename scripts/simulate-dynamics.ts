import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { identityExample, validateConfig, type ControllerConfig } from '../src/control/controller';
import { exactObject, exampleModel, validId, validateModelConfig, type ModelConfig } from '../src/model/plant';
import { validateSeed } from '../src/model/random';
import { controllerIds, gridIndex, type ComparatorId } from '../src/simulation/constant';
import { dynamicMetrics, exampleDynamics, runDynamic, validateDynamics, type DynamicRow, type DynamicRun, type DynamicScenario } from '../src/simulation/dynamics';

interface DynamicsRunConfig {
  schemaVersion:'taph.dynamic-run-config.v1'; id:string; model:ModelConfig; controller:ControllerConfig;
  seeds:number[]; controllerIds:ComparatorId[]; scenarios:DynamicScenario[];
}
const defaultConfig:DynamicsRunConfig={
  schemaVersion:'taph.dynamic-run-config.v1',id:'dynamic-four-scenarios-v1',model:exampleModel,
  controller:{...identityExample,id:'increasing-pitch-clamp-v1',outOfRange:'clamp'},
  seeds:[20260827,20260828],controllerIds:[...controllerIds],
  scenarios:[
    {...exampleDynamics,id:'constant-sensor-noise-v1',profile:{kind:'constant',flowLMin:3.5}},
    {...exampleDynamics,id:'noise-free-step-v1',sensorNoiseHalfWidthLMin:0,profile:{kind:'step',beforeLMin:1,afterLMin:6,atS:15}},
    {...exampleDynamics,id:'ramp-sensor-noise-v1',profile:{kind:'ramp',startLMin:1,endLMin:6,startS:10,endS:40}},
    {...exampleDynamics,id:'profile-sensor-noise-v1',profile:{kind:'profile',knots:[
      {timeS:0,flowLMin:2},{timeS:10,flowLMin:2},{timeS:20,flowLMin:5.5},
      {timeS:35,flowLMin:2.5},{timeS:45,flowLMin:6},{timeS:60,flowLMin:3.5}]}},
  ],
};
const args=process.argv.slice(2).filter((arg,i)=>!(i===0 && arg==='--'));
if(args.length>2 || args.some(arg=>arg.startsWith('--'))) throw new Error('usage: bun scripts/simulate-dynamics.ts [NEW_OUTPUT_DIRECTORY] [CONFIG_JSON]');
const repo=resolve(import.meta.dir,'..'),output=resolve(args[0]??'results/corrected-dynamics-v1');
if(existsSync(output)) throw new Error(`refusing existing output directory: ${output}`);
const configSource=args[1]?resolve(args[1]):'built-in explicit illustrative defaults';
const config:DynamicsRunConfig=args[1]?JSON.parse(readFileSync(configSource,'utf8')):defaultConfig;
exactObject(config,['schemaVersion','id','model','controller','seeds','controllerIds','scenarios']);
if(config.schemaVersion!=='taph.dynamic-run-config.v1' || !validId(config.id)) throw new Error('invalid dynamic run configuration identity');
validateModelConfig(config.model);validateConfig(config.controller);
if(!Array.isArray(config.seeds) || !config.seeds.length || new Set(config.seeds).size!==config.seeds.length) throw new Error('nonempty unique seeds required');
config.seeds.forEach(validateSeed);
if(!Array.isArray(config.controllerIds) || !config.controllerIds.length || new Set(config.controllerIds).size!==config.controllerIds.length || config.controllerIds.some(id=>!controllerIds.includes(id))) throw new Error('nonempty unique known controller IDs required');
if(!Array.isArray(config.scenarios) || !config.scenarios.length) throw new Error('at least one scenario required');
for(const scenario of config.scenarios) validateDynamics(scenario,config.model,config.controller);
if(new Set(config.scenarios.map(s=>s.id)).size!==config.scenarios.length) throw new Error('scenario IDs must be unique');
const expectedRows=config.scenarios.reduce((n,s)=>n+gridIndex(s.durationS,s.dtS)+1,0)*config.seeds.length*config.controllerIds.length;
if(!Number.isSafeInteger(expectedRows) || expectedRows>2_000_000) throw new Error('CLI output exceeds two million rows; split the declared scenarios');
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
function canonical(value:unknown):string {
  if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if(value!==null && typeof value==='object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
const sourcePaths=['scripts/simulate-dynamics.ts','src/simulation/dynamics.ts','src/simulation/constant.ts',
  'src/simulation/controller.ts','src/control/controller.ts','src/model/plant.ts','src/model/random.ts','package.json','bun.lock','tsconfig.json'];
const sources=Object.fromEntries(sourcePaths.map(path=>[path,hash(readFileSync(resolve(repo,path)))]));
const git=(...args:string[])=>{const child=spawnSync('git',args,{cwd:repo,encoding:'utf8'});return child.status===0?child.stdout.trim():null;};
const gitStatus=git('status','--porcelain');
const manifest={schemaVersion:'taph.dynamic-run-manifest.v1',category:'corrected-synthetic-simulation',
  status:'incomplete',createdAt:new Date().toISOString(),configId:config.id,configSource,
  configSha256:hash(canonical(config)),sourceSha256:hash(canonical(sources)),sources,
  gitCommit:git('rev-parse','HEAD'),gitDirty:gitStatus===null?null:gitStatus.length>0,
  runtime:{name:'Bun',version:Bun.version,revision:Bun.revision,platform:process.platform,architecture:process.arch},
  modelVersion:config.model.modelVersion,rowSchemaVersion:'taph.simulation-row.v2',dynamicsSchemaVersion:'taph.dynamic-row.v1',
  seeds:config.seeds,controllerIds:config.controllerIds,
  scenarios:config.scenarios.map(s=>({id:s.id,kind:s.profile.kind,measurementWindow:{startS:s.measurementStartS,endS:s.durationS,endpoints:'inclusive'}})),
  expectedRows,rng:{algorithm:'mulberry32-uint32',stream:'fresh stream per scenario/seed/controller; same seed and sensor schedule give common sensor noise across comparators',
    interpretation:'uniform additive sensor noise before physical-range clipping; zero-noise runs consume no variates'},
  plots:{timeHistorySeed:config.seeds[0],timeHistory:'all selected comparators for the first declared seed of every scenario',
    comparison:'all declared runs; overlapping identical values are retained in comparison files'},
  limitations:['all plant, sensing, communication and actuator coefficients are assumed; no hardware validation',
    'true-flow profiles are prescribed mathematical inputs, not recorded water measurements',
    'sensor period and fixed communication delay do not establish wall-clock real-time performance or network reliability',
    'finite actuator coupling is a left-held discrete approximation; ideal actuator timing is separately documented',
    `${config.model.assumedPeakPitchDeg} degrees is the configured assumed speed peak; fixed-42 remains a 42-degree comparator`,
    'no hydraulic input power, efficiency, protective threshold, wear or durability validation',
    'seeds and time samples are not independent physical trials; comparison is descriptive, not inferential'],
  outputSha256:{} as Record<string,string>};
mkdirSync(dirname(output),{recursive:true});mkdirSync(output);
writeFileSync(resolve(output,'config.json'),JSON.stringify(config,null,2)+'\n',{flag:'wx'});
writeFileSync(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
const csv=(value:unknown)=>{
  const text=typeof value==='object'?JSON.stringify(value):String(value);
  return /[",\n\r]/.test(text)?`"${text.replaceAll('"','""')}"`:text;
};
const xml=(value:unknown)=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const colours:Record<ComparatorId,string>={'fixed-5':'#8a4f00','fixed-assumed-peak-42':'#5a42a6','fuzzy-increasing':'#007c83','linear-increasing':'#bf335b'};
const labels:Record<ComparatorId,string>={'fixed-5':'Fixed 5°','fixed-assumed-peak-42':'Fixed 42° (assumed default peak)','fuzzy-increasing':'Fuzzy increasing','linear-increasing':'Linear increasing'};
const coordinate=(n:number)=>{if(!Number.isFinite(n))throw new Error('nonfinite plot coordinate');return n.toFixed(3);};
const numberLabel=(n:number)=>Number(n.toPrecision(4)).toString();
const svgStart=(title:string,width:number,height:number)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc"><title id="title">${xml(title)}</title><desc id="desc">Illustrative synthetic simulation, not measurements. All axes include zero; negative pitch coordinates are retained when configured. Units are stated on every panel.</desc><rect width="100%" height="100%" fill="#ffffff"/><style>text{font-family:Arial,Helvetica,sans-serif;fill:#182433} .title{font-size:23px;font-weight:700} .subtitle{font-size:13px;fill:#475569} .tick{font-size:12px;fill:#475569} .axis{stroke:#64748b;stroke-width:1;fill:none} .grid{stroke:#e2e8f0;stroke-width:1;fill:none} .label{font-size:14px;font-weight:600}</style>`;
function axes(x:number,y:number,width:number,height:number,xMax:number,yMax:number,xLabel:string,yLabel:string,yMin=0):string {
  let out='';
  for(let i=0;i<=4;i++) {
    const xTick=x+width*i/4,yTick=y+height-height*i/4;
    out+=`<path class="grid" d="M${coordinate(xTick)},${coordinate(y)}V${coordinate(y+height)} M${coordinate(x)},${coordinate(yTick)}H${coordinate(x+width)}"/>`;
    out+=`<text class="tick" x="${coordinate(xTick)}" y="${coordinate(y+height+18)}" text-anchor="middle">${numberLabel(xMax*i/4)}</text>`;
    out+=`<text class="tick" x="${coordinate(x-9)}" y="${coordinate(yTick+4)}" text-anchor="end">${numberLabel(yMin+(yMax-yMin)*i/4)}</text>`;
  }
  out+=`<path class="axis" d="M${coordinate(x)},${coordinate(y)}V${coordinate(y+height)}H${coordinate(x+width)}"/>`;
  if(yMin<0) {
    const zeroY=y+height-height*(0-yMin)/(yMax-yMin);
    out+=`<path class="axis" d="M${coordinate(x)},${coordinate(zeroY)}H${coordinate(x+width)}"/>`;
    if(yMax!==0 && ![0,1,2,3,4].some(i=>Math.abs(yMin+(yMax-yMin)*i/4)<1e-12)) out+=`<text class="tick" x="${coordinate(x+width+8)}" y="${coordinate(zeroY+4)}">0</text>`;
  }
  out+=`<text class="label" x="${coordinate(x+width/2)}" y="${coordinate(y+height+41)}" text-anchor="middle">${xml(xLabel)}</text>`;
  out+=`<text class="label" transform="translate(${coordinate(x-64)} ${coordinate(y+height/2)}) rotate(-90)" text-anchor="middle">${xml(yLabel)}</text>`;
  return out;
}
function timePlot(scenario:DynamicScenario,runs:DynamicRun[]):string {
  const first=runs[0]!;
  const title=`${scenario.id}: synthetic time histories`;
  let svg=svgStart(title,1200,1130);
  svg+=`<text class="title" x="30" y="34">${xml(title)}</text><text class="subtitle" x="30" y="59">Seed ${config.seeds[0]} · sampled traces · assumed model · no physical validation</text>`;
  runs.forEach((run,i)=>{const id=run.rows[0]!.controllerId,x=30+(i%2)*580,y=84+Math.floor(i/2)*22;
    svg+=`<path d="M${x},${y-4}h32" stroke="${colours[id]}" stroke-width="3"/><text class="subtitle" x="${x+40}" y="${y}">${xml(labels[id])}</text>`;});
  const panels:{label:string;value:(r:DynamicRow)=>number;kind:'flow'|'rpm'|'power'|'pitch'}[]=[
    {label:'Flow (L/min)',value:r=>r.trueFlowLMin,kind:'flow'},
    {label:'Speed (rpm)',value:r=>r.rpm,kind:'rpm'},
    {label:'Load power (W)',value:r=>r.pLoadW,kind:'power'},
    {label:'Physical pitch (degrees)',value:r=>r.actualModeledPitchDeg,kind:'pitch'},
  ];
  panels.forEach((panel,panelIndex)=>{
    const x=100,y=155+panelIndex*225,width=1050,height=155;
    let max=0,min=0;
    for(const run of runs) for(const r of run.rows) {
      max=Math.max(max,panel.value(r));
      if(panel.kind==='flow') max=Math.max(max,r.sensedFlowLMin);
      if(panel.kind==='pitch') {max=Math.max(max,r.requestedPitchDeg);min=Math.min(min,r.actualModeledPitchDeg,r.requestedPitchDeg);}
    }
    const yMax=max>0?max*1.08:min<0?0:1,yMin=min<0?min*1.08:0,ySpan=yMax-yMin;
    svg+=axes(x,y,width,height,scenario.durationS,yMax,'Time (s)',panel.label,yMin);
    const polyline=(rows:DynamicRow[],value:(r:DynamicRow)=>number,colour:string,dashed=false,held=false)=>{
      const points:string[]=[];
      for(let i=0;i<rows.length;i++) {
        const r=rows[i]!,px=x+width*r.timeS/scenario.durationS,py=y+height-height*(value(r)-yMin)/ySpan;
        if(held&&i>0) points.push(`${coordinate(px)},${coordinate(y+height-height*(value(rows[i-1]!)-yMin)/ySpan)}`);
        points.push(`${coordinate(px)},${coordinate(py)}`);
      }
      return `<polyline fill="none" stroke="${colour}" stroke-width="${dashed?1.25:2}"${dashed?' stroke-dasharray="5 4"':''} points="${points.join(' ')}"/>`;
    };
    if(panel.kind==='flow') {
      svg+=polyline(first.rows,r=>r.trueFlowLMin,'#182433',false,true);
      svg+=polyline(first.rows,r=>r.sensedFlowLMin,'#bf335b',true,true);
      svg+=`<text class="subtitle" x="${x+8}" y="${y-13}">Solid black: prescribed true flow · dashed: sampled-and-held sensed flow (common across comparators)</text>`;
    } else {
      for(const run of runs) {const id=run.rows[0]!.controllerId;
        if(panel.kind==='pitch') svg+=polyline(run.rows,r=>r.requestedPitchDeg,colours[id],true,true);
        svg+=polyline(run.rows,panel.value,colours[id]);
      }
      if(panel.kind==='pitch') svg+=`<text class="subtitle" x="${x+8}" y="${y-13}">Solid: modeled actual pitch · dashed: latest requested pitch (before communication and actuator delay)</text>`;
    }
  });
  svg+=`<text class="subtitle" x="30" y="1088">Measurement window: ${numberLabel(scenario.measurementStartS)}–${numberLabel(scenario.durationS)} s. Sensor noise half-width: ${numberLabel(scenario.sensorNoiseHalfWidthLMin)} L/min.</text>`;
  svg+=`<text class="subtitle" x="30" y="1110">Time histories show the full run; this plot does not establish hydraulic efficiency, a safe speed limit, or physical protection.</text></svg>`;
  return svg;
}
type Comparison=ReturnType<typeof dynamicMetrics>&{scenarioId:string;profileKind:DynamicScenario['profile']['kind'];seed:number;configId:string;category:'corrected-synthetic-simulation'};
function comparisonPlot(rows:Comparison[]):string {
  let xMax=1,yMax=1;
  for(const row of rows) {xMax=Math.max(xMax,row.meanRpm*1.08);yMax=Math.max(yMax,row.meanPLoadW*1.08);}
  let svg=svgStart('Descriptive mean load power versus mean speed',1200,800);
  svg+='<text class="title" x="30" y="35">Mean load power versus mean speed</text><text class="subtitle" x="30" y="60">Every declared run · averaged over each declared window · synthetic model outputs</text>';
  svg+=axes(100,110,780,520,xMax,yMax,'Time-weighted mean speed (rpm)','Time-weighted mean load power (W)');
  for(const row of rows) {
    const x=100+780*row.meanRpm/xMax,y=110+520-520*row.meanPLoadW/yMax,c=colours[row.controllerId];
    const tooltip=xml(`${row.scenarioId}; ${row.controllerId}; seed ${row.seed}; mean ${row.meanRpm} rpm; ${row.meanPLoadW} W`);
    svg+=`<g fill="${c}" stroke="#ffffff" stroke-width="1"><title>${tooltip}</title>`;
    if(row.profileKind==='constant') svg+=`<circle cx="${coordinate(x)}" cy="${coordinate(y)}" r="6"/>`;
    else if(row.profileKind==='step') svg+=`<rect x="${coordinate(x-6)}" y="${coordinate(y-6)}" width="12" height="12"/>`;
    else if(row.profileKind==='ramp') svg+=`<path d="M${coordinate(x)},${coordinate(y-8)}l7,13h-14Z"/>`;
    else svg+=`<path d="M${coordinate(x)},${coordinate(y-8)}l8,8l-8,8l-8,-8Z"/>`;
    svg+='</g>';
  }
  config.controllerIds.forEach((id,i)=>{const y=135+i*65;
    svg+=`<circle cx="925" cy="${y-4}" r="5" fill="${colours[id]}"/><text class="subtitle" x="940" y="${y}">${xml(id)}</text>`;});
  svg+='<text class="label" x="925" y="435">Scenario shapes</text><text class="subtitle" x="925" y="462">Circle: constant</text><text class="subtitle" x="925" y="488">Square: step</text><text class="subtitle" x="925" y="514">Triangle: ramp</text><text class="subtitle" x="925" y="540">Diamond: profile</text>';
  svg+='<text class="subtitle" x="30" y="710">Coincident points may overlap; comparison.csv and comparison.json retain every run and seed.</text><text class="subtitle" x="30" y="735">Power is derived from the same modeled speed through a resistive circuit. This relationship is built into the model.</text><text class="subtitle" x="30" y="760">These points are descriptive: they are not efficiency measurements, independent physical trials, or proof of a protective tradeoff.</text></svg>';
  return svg;
}
const outputs=['config.json','samples.csv','comparison.json','comparison.csv','deliveries.json'];
const comparisons:Comparison[]=[],deliveries:{scenarioId:string;runId:string;seed:number;controllerId:ComparatorId;events:DynamicRun['deliveries']}[]=[];
const samplesPath=resolve(output,'samples.csv');writeFileSync(samplesPath,'',{flag:'wx'});
let written=0,header:string[]|null=null;
for(const scenario of config.scenarios) {
  const plotRuns:DynamicRun[]=[];
  for(const seed of config.seeds) for(const controllerId of config.controllerIds) {
    const run=runDynamic({scenario,model:config.model,controller:config.controller,controllerId,seed,configId:config.id});
    const keys=Object.keys(run.rows[0]!);
    if(header===null) {header=keys;appendFileSync(samplesPath,header.join(',')+'\n');}
    const expectedKeys=header.join('\0');
    if(run.rows.some(row=>Object.keys(row).join('\0')!==expectedKeys)) throw new Error('inconsistent dynamic row columns');
    appendFileSync(samplesPath,run.rows.map(row=>header!.map(key=>csv(row[key as keyof DynamicRow])).join(',')).join('\n')+'\n');
    written+=run.rows.length;
    comparisons.push({...dynamicMetrics(run),scenarioId:scenario.id,profileKind:scenario.profile.kind,seed,configId:config.id,category:'corrected-synthetic-simulation'});
    deliveries.push({scenarioId:scenario.id,runId:run.rows[0]!.runId,seed,controllerId,events:run.deliveries});
    if(seed===config.seeds[0]) plotRuns.push(run);
  }
  const plotFile=`timeseries-${scenario.id}.svg`;
  writeFileSync(resolve(output,plotFile),timePlot(scenario,plotRuns),{flag:'wx'});outputs.push(plotFile);
}
if(written!==expectedRows) throw new Error('row count differs from manifest');
writeFileSync(resolve(output,'comparison.json'),JSON.stringify(comparisons,null,2)+'\n',{flag:'wx'});
const comparisonKeys=Object.keys(comparisons[0]!);
writeFileSync(resolve(output,'comparison.csv'),comparisonKeys.join(',')+'\n'+comparisons.map(row=>comparisonKeys.map(key=>csv(row[key as keyof Comparison])).join(',')).join('\n')+'\n',{flag:'wx'});
writeFileSync(resolve(output,'deliveries.json'),JSON.stringify(deliveries,null,2)+'\n',{flag:'wx'});
const plotFile='comparison-power-versus-speed.svg';
writeFileSync(resolve(output,plotFile),comparisonPlot(comparisons),{flag:'wx'});outputs.push(plotFile);
for(const file of outputs) manifest.outputSha256[file]=hash(readFileSync(resolve(output,file)));
manifest.status='complete';
writeFileSync(resolve(output,'manifest.json'),JSON.stringify({...manifest,actualRows:written,actualRuns:comparisons.length},null,2)+'\n');
console.log(`Wrote ${written} synthetic dynamic rows, ${comparisons.length} descriptive comparisons and ${config.scenarios.length+1} SVG plots to ${output}`);
