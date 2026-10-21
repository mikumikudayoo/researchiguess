import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { identityExample, validateConfig, type ControllerConfig } from '../src/control/controller';
import { exactObject, exampleModel, validId, validateModelConfig, type ModelConfig } from '../src/model/plant';
import { exampleConstantScenario, gridIndex, runConstant, summarizeRun, validateConstantScenario, type ConstantScenarioConfig } from '../src/simulation/constant';

interface RunConfiguration {
  schemaVersion:'taph.run-config.v1'; id:string; model:ModelConfig;
  scenario:ConstantScenarioConfig; controller:ControllerConfig;
}
const defaultConfig:RunConfiguration={schemaVersion:'taph.run-config.v1',id:'corrected-example-v1',
  model:exampleModel,scenario:exampleConstantScenario,controller:identityExample};
const args=process.argv.slice(2).filter((arg,i)=>!(i===0 && arg==='--'));
if(args.length>2 || args.some(arg=>arg.startsWith('--'))) throw new Error('usage: bun scripts/simulate.ts [NEW_OUTPUT_DIRECTORY] [CONFIG_JSON]');
const repo=resolve(import.meta.dir,'..');
const output=resolve(args[0]??'results/corrected-constant-v2');
if(existsSync(output)) throw new Error(`refusing existing output directory: ${output}`);
const configSource=args[1]?resolve(args[1]):'built-in explicit illustrative defaults';
const config:RunConfiguration=args[1]?JSON.parse(readFileSync(configSource,'utf8')):defaultConfig;
exactObject(config,['schemaVersion','id','model','scenario','controller']);
if(config.schemaVersion!=='taph.run-config.v1' || !validId(config.id)) throw new Error('invalid run configuration identity');
validateModelConfig(config.model); validateConfig(config.controller); validateConstantScenario(config.scenario,config.model,config.controller);
const s=config.scenario;
const expectedRows=(gridIndex(s.durationS,s.dtS)+1)*s.flowsLMin.length*s.seeds.length*s.controllerIds.length;
if(!Number.isSafeInteger(expectedRows) || expectedRows>2_000_000) throw new Error('CLI output exceeds two million rows; split the declared scenarios');
const sha256=(content:string|Buffer)=>createHash('sha256').update(content).digest('hex');
function canonical(value:unknown):string {
  if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if(value!==null && typeof value==='object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
const sourcePaths=['scripts/simulate.ts','src/model/plant.ts','src/model/random.ts','src/simulation/constant.ts',
  'src/simulation/controller.ts','src/control/controller.ts','package.json','bun.lock','tsconfig.json'];
const sources=Object.fromEntries(sourcePaths.map(path=>[path,sha256(readFileSync(resolve(repo,path)))]));
const git=(...gitArgs:string[])=>{
  const result=spawnSync('git',gitArgs,{cwd:repo,encoding:'utf8'});
  return result.status===0?result.stdout.trim():null;
};
const gitStatus=git('status','--porcelain');
const manifest={schemaVersion:'taph.run-manifest.v1',category:'corrected-synthetic-simulation',
  status:'incomplete',createdAt:new Date().toISOString(),configId:config.id,configSource,
  configSha256:sha256(canonical(config)),sourceSha256:sha256(canonical(sources)),sources,
  gitCommit:git('rev-parse','HEAD'),gitDirty:gitStatus===null?null:gitStatus.length>0,
  runtime:{name:'Bun',version:Bun.version,revision:Bun.revision,platform:process.platform,architecture:process.arch},
  modelVersion:config.model.modelVersion,scenarioId:s.id,expectedRows,
  seeds:s.seeds,flowsLMin:s.flowsLMin,controllerIds:s.controllerIds,
  measurementWindow:{startS:s.measurementStartS,endS:s.durationS,endpoints:'inclusive'},
  rng:{algorithm:'mulberry32-uint32',stream:'reinitialized per flow/seed/controller; matching seeds share perturbation profiles across comparators',
    firstDraw:'after first transition; no draw at t=0; no draws when perturbation fraction is zero'},
  limitations:['all plant coefficients assumed; no physical calibration',
    'speed perturbation is synthetic output perturbation, not a flow disturbance or sensor model',
    'command-to-pitch mapping is an unverified configuration; modeled actuation is instantaneous after initial state',
    `${config.model.assumedPeakPitchDeg} degrees is the configured assumed model peak, not an experimentally determined optimum; the fixed-42 comparator remains 42 degrees`,
    'no hydraulic head, torque, inertia, load-dependent speed, hydraulic efficiency, wear, or durability validation',
    'load energy and means describe this mathematical model only; seeds are not independent physical trials'],
  outputSha256:{} as Record<string,string>};
mkdirSync(dirname(output),{recursive:true});
mkdirSync(output); // Fails if another process created it after the existence check.
writeFileSync(resolve(output,'config.json'),JSON.stringify(config,null,2)+'\n',{flag:'wx'});
writeFileSync(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
const csv=(value:unknown)=>{
  const text=typeof value==='object'?JSON.stringify(value):String(value);
  return /[",\n\r]/.test(text)?`"${text.replaceAll('"','""')}"`:text;
};
const summaries:ReturnType<typeof summarizeRun>[]=[];
let written=0,headerWritten=false;
const samples=resolve(output,'samples.csv');
writeFileSync(samples,'',{flag:'wx'});
for(const flowLMin of s.flowsLMin) for(const seed of s.seeds) for(const controllerId of s.controllerIds) {
  const rows=runConstant({flowLMin,seed,controllerId,model:config.model,scenario:s,controller:config.controller,configId:config.id});
  if(!headerWritten) {appendFileSync(samples,Object.keys(rows[0]!).join(',')+'\n');headerWritten=true;}
  appendFileSync(samples,rows.map(row=>Object.values(row).map(csv).join(',')).join('\n')+'\n');
  written+=rows.length;
  summaries.push(summarizeRun(rows));
}
if(written!==expectedRows) throw new Error('row count differs from manifest');
writeFileSync(resolve(output,'summaries.json'),JSON.stringify(summaries,null,2)+'\n',{flag:'wx'});
for(const file of ['config.json','samples.csv','summaries.json']) manifest.outputSha256[file]=sha256(readFileSync(resolve(output,file)));
manifest.status='complete';
writeFileSync(resolve(output,'manifest.json'),JSON.stringify({...manifest,actualRows:written},null,2)+'\n');
console.log(`Wrote ${written} synthetic rows and ${summaries.length} descriptive run summaries to ${output}`);
