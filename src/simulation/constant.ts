import { identityExample, pitchToServo, servoToPitch, validateConfig, type ControllerConfig } from '../control/controller';
import { simulationCommand } from './controller';
import { assertOperatingPoint, electricalOutput, exactObject, exampleModel, finiteNumber,
  targetRpm, updateRpmExact, validId, validateModelConfig, type ModelConfig } from '../model/plant';
import { seededRng, validateSeed } from '../model/random';

export const controllerIds = ['fixed-5','fixed-assumed-peak-42','fuzzy-increasing','linear-increasing'] as const;
export type ComparatorId = typeof controllerIds[number];
export interface ConstantScenarioConfig {
  schemaVersion: 'taph.constant-scenario.v1'; id: string;
  flowsLMin: number[]; seeds: number[]; controllerIds: ComparatorId[];
  dtS: number; durationS: number; measurementStartS: number;
  initialRpm: number; initialPitchDeg: number;
  speedPerturbationFraction: number;
}
export const exampleConstantScenario: ConstantScenarioConfig = {
  schemaVersion:'taph.constant-scenario.v1',id:'constant-five-flows-v1',
  flowsLMin:[1,2.25,3.5,4.75,6],seeds:[20260827,20260828,20260829,20260830,20260831],
  controllerIds:[...controllerIds],dtS:0.1,durationS:60,measurementStartS:30,
  initialRpm:0,initialPitchDeg:42,speedPerturbationFraction:0,
};
export interface MeasurementWindow { startS:number; endS:number; endpoints:'inclusive'; }
export interface SimulationRow {
  schemaVersion:'taph.simulation-row.v2'; category:'corrected-synthetic-simulation';
  scenarioId:string; runId:string; controllerId:ComparatorId; modelVersion:ModelConfig['modelVersion'];
  seed:number; timeS:number; nominalFlowLMin:number; trueFlowLMin:number; sensedFlowLMin:number;
  requestedPitchDeg:number; actualModeledPitchDeg:number; servoCommandDeg:number;
  stateRpm:number; speedPerturbationMultiplier:number; rpm:number;
  emfV:number; voltageV:number; currentA:number; pLoadW:number; internalCopperLossW:number; emfPowerW:number;
  hydraulicEfficiency:null; configId:string; measurementWindow:MeasurementWindow;
}
export interface PitchCommand {requestedPitchDeg:number;servoCommandDeg:number;}
/** Common mapping and quantization. Fixed controls use the wider plant envelope. */
export function comparatorCommand(controllerId:ComparatorId, flowLMin:number, c:ControllerConfig=identityExample):PitchCommand {
  validateConfig(c); finiteNumber(flowLMin,'controller flow');
  if (!controllerIds.includes(controllerId)) throw new Error('unknown comparator');
  if (flowLMin < 0) throw new Error('negative controller flow');
  if (controllerId === 'fuzzy-increasing') {
    const command=simulationCommand(flowLMin,c);
    return {requestedPitchDeg:command.requestedPitchDeg,servoCommandDeg:command.servoCommandDeg};
  }
  let requestedPitchDeg:number;
  if (controllerId === 'fixed-5') requestedPitchDeg=5;
  else if (controllerId === 'fixed-assumed-peak-42') requestedPitchDeg=42;
  else {
    const [lo,,hi]=c.flowKnotsLMin;
    if ((flowLMin<lo || flowLMin>hi) && c.outOfRange==='reject') throw new RangeError('flow outside configured operating range');
    const fraction=(Math.max(lo,Math.min(hi,flowLMin))-lo)/(hi-lo);
    const [a,,b]=c.pitchConsequentsDeg;
    requestedPitchDeg=Math.max(c.pitchMinDeg,Math.min(c.pitchMaxDeg,Math.round((a+fraction*(b-a))/c.pitchResolutionDeg)*c.pitchResolutionDeg));
  }
  return {requestedPitchDeg,servoCommandDeg:pitchToServo(requestedPitchDeg,c.mapping)};
}
export function gridIndex(timeS:number,dtS:number):number {
  finiteNumber(timeS,'time'); finiteNumber(dtS,'time step');
  if(timeS<0 || dtS<=0) throw new Error('invalid time grid');
  const quotient=timeS/dtS, index=Math.round(quotient);
  if(!Number.isSafeInteger(index) || Math.abs(quotient-index)>1e-9) throw new Error('time must lie on integer simulation grid');
  return index;
}
export function validateConstantScenario(value:unknown,model:ModelConfig=exampleModel,c:ControllerConfig=identityExample):asserts value is ConstantScenarioConfig {
  validateModelConfig(model); validateConfig(c);
  exactObject(value,['schemaVersion','id','flowsLMin','seeds','controllerIds','dtS','durationS','measurementStartS','initialRpm','initialPitchDeg','speedPerturbationFraction']);
  const s=value as unknown as ConstantScenarioConfig;
  if(s.schemaVersion!=='taph.constant-scenario.v1' || !validId(s.id)) throw new Error('invalid scenario identity');
  for(const [key,v] of Object.entries(s)) if(['dtS','durationS','measurementStartS','initialRpm','initialPitchDeg','speedPerturbationFraction'].includes(key)) finiteNumber(v,key);
  if(s.dtS<=0 || s.durationS<=0 || s.measurementStartS<=0 || s.measurementStartS>=s.durationS || s.initialRpm<0 ||
    s.speedPerturbationFraction<0 || s.speedPerturbationFraction>=1) throw new Error('invalid scenario parameter');
  if(gridIndex(s.durationS,s.dtS)>1_000_000) throw new Error('scenario exceeds one million intervals per run');
  gridIndex(s.measurementStartS,s.dtS);
  assertOperatingPoint(0,s.initialPitchDeg,model); pitchToServo(s.initialPitchDeg,c.mapping);
  electricalOutput(s.initialRpm*(1+s.speedPerturbationFraction),model);
  if(!Array.isArray(s.flowsLMin) || !s.flowsLMin.length || new Set(s.flowsLMin).size!==s.flowsLMin.length) throw new Error('nonempty unique flows required');
  if(!Array.isArray(s.seeds) || !s.seeds.length || new Set(s.seeds).size!==s.seeds.length) throw new Error('nonempty unique seeds required');
  s.seeds.forEach(validateSeed);
  if(!Array.isArray(s.controllerIds) || !s.controllerIds.length || new Set(s.controllerIds).size!==s.controllerIds.length || s.controllerIds.some(x=>!controllerIds.includes(x))) throw new Error('nonempty unique known comparators required');
  for(const flow of s.flowsLMin) for(const id of s.controllerIds) {
    const command=comparatorCommand(id,flow,c);
    assertOperatingPoint(flow,servoToPitch(command.servoCommandDeg,c.mapping),model);
    electricalOutput(targetRpm(flow,command.requestedPitchDeg,model)*(1+s.speedPerturbationFraction),model);
  }
}
export interface ConstantRunOptions {
  flowLMin:number; seed:number; controllerId:ComparatorId;
  model?:ModelConfig; scenario?:ConstantScenarioConfig; controller?:ControllerConfig;
  configId?:string; runId?:string;
}
export function runConstant(options:ConstantRunOptions):SimulationRow[] {
  const model=options.model??exampleModel, s=options.scenario??exampleConstantScenario, c=options.controller??identityExample;
  validateConstantScenario(s,model,c); validateSeed(options.seed);
  if(!s.flowsLMin.includes(options.flowLMin) || !s.seeds.includes(options.seed) || !s.controllerIds.includes(options.controllerId)) throw new Error('run outside declared scenario');
  const configId=options.configId??'corrected-example-v1';
  if(!validId(configId)) throw new Error('invalid configuration id');
  const runId=options.runId??`${s.id}-q${options.flowLMin}-s${options.seed}-${options.controllerId}`;
  if(typeof runId!=='string' || !/^[a-zA-Z0-9_.-]+$/.test(runId)) throw new Error('invalid run id');
  const random=seededRng(options.seed), steps=gridIndex(s.durationS,s.dtS);
  const command=comparatorCommand(options.controllerId,options.flowLMin,c);
  const commandedPitch=servoToPitch(command.servoCommandDeg,c.mapping);
  const target=targetRpm(options.flowLMin,commandedPitch,model);
  const measurementWindow:MeasurementWindow={startS:s.measurementStartS,endS:s.durationS,endpoints:'inclusive'};
  const rows:SimulationRow[]=[];
  let stateRpm=s.initialRpm;
  for(let k=0;k<=steps;k++) {
    // The initial state is emitted before any transition or random draw.
    if(k>0) stateRpm=updateRpmExact(stateRpm,target,s.dtS,model.rpmTimeConstantS);
    const speedPerturbationMultiplier=k===0 || s.speedPerturbationFraction===0 ? 1 : 1+s.speedPerturbationFraction*(2*random()-1);
    const rpm=stateRpm*speedPerturbationMultiplier;
    rows.push({schemaVersion:'taph.simulation-row.v2',category:'corrected-synthetic-simulation',
      scenarioId:s.id,runId,controllerId:options.controllerId,modelVersion:model.modelVersion,
      seed:options.seed,timeS:k===steps?s.durationS:k*s.dtS,
      nominalFlowLMin:options.flowLMin,trueFlowLMin:options.flowLMin,sensedFlowLMin:options.flowLMin,
      ...command,actualModeledPitchDeg:k===0?s.initialPitchDeg:commandedPitch,
      stateRpm,speedPerturbationMultiplier,rpm,...electricalOutput(rpm,model),configId,measurementWindow});
  }
  return rows;
}
export interface RunSummary {
  runId:string; controllerId:ComparatorId; measurementWindow:MeasurementWindow; sampleCount:number;
  integration:'trapezoidal-on-declared-grid'; meanRpm:number; meanPLoadW:number; loadEnergyJ:number;
  maxRpm:number; minRpm:number; hydraulicEfficiency:null;
}
/** Time-weighted descriptive values, without confidence intervals or independence claims. */
export function summarizeRun(rows:SimulationRow[]):RunSummary {
  if(rows.length<2) throw new Error('at least two rows required');
  const first=rows[0]!;
  const w=first.measurementWindow;
  finiteNumber(w.startS,'window start'); finiteNumber(w.endS,'window end');
  if(w.startS<=0 || w.endS<=w.startS || w.endpoints!=='inclusive') throw new Error('invalid measurement window');
  const gridDt=rows[1]!.timeS-first.timeS;
  if(!Number.isFinite(gridDt) || gridDt<=0) throw new Error('invalid sample grid');
  for(let i=0;i<rows.length;i++) {
    const r=rows[i]!;
    if(r.runId!==first.runId || r.controllerId!==first.controllerId || r.configId!==first.configId ||
      r.seed!==first.seed || r.scenarioId!==first.scenarioId || r.modelVersion!==first.modelVersion ||
      r.schemaVersion!==first.schemaVersion || r.category!==first.category ||
      r.measurementWindow.startS!==w.startS || r.measurementWindow.endS!==w.endS || r.measurementWindow.endpoints!=='inclusive') throw new Error('mixed runs or windows');
    for(const [key,v] of Object.entries({time:r.timeS,rpm:r.rpm,power:r.pLoadW})) finiteNumber(v,key);
    if(r.timeS<0 || r.rpm<0 || r.pLoadW<0 || (i>0 && (r.timeS<=rows[i-1]!.timeS ||
      Math.abs((r.timeS-rows[i-1]!.timeS)-gridDt)>1e-9*Math.max(1,Math.abs(gridDt))))) throw new Error('invalid sample ordering/grid/value');
  }
  const selected=rows.filter(r=>r.timeS>=w.startS-1e-10 && r.timeS<=w.endS+1e-10);
  if(selected.length<2 || Math.abs(selected[0]!.timeS-w.startS)>1e-10 || Math.abs(selected.at(-1)!.timeS-w.endS)>1e-10) throw new Error('measurement window endpoints missing');
  let rpmIntegral=0,loadEnergyJ=0,maxRpm=-Infinity,minRpm=Infinity;
  for(let i=0;i<selected.length;i++) {
    const r=selected[i]!;
    maxRpm=Math.max(maxRpm,r.rpm); minRpm=Math.min(minRpm,r.rpm);
    if(i===0) continue;
    const prev=selected[i-1]!,dt=r.timeS-prev.timeS;
    rpmIntegral+=dt*(r.rpm+prev.rpm)/2; loadEnergyJ+=dt*(r.pLoadW+prev.pLoadW)/2;
  }
  const duration=w.endS-w.startS;
  return {runId:first.runId,controllerId:first.controllerId,measurementWindow:{...w},sampleCount:selected.length,
    integration:'trapezoidal-on-declared-grid',meanRpm:rpmIntegral/duration,meanPLoadW:loadEnergyJ/duration,
    loadEnergyJ,maxRpm,minRpm,hydraulicEfficiency:null};
}
