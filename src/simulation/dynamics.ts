import { identityExample, pitchToServo, validateConfig, type ControllerConfig } from '../control/controller';
import { exampleModel, validateModelConfig, assertOperatingPoint, electricalOutput, finiteNumber, exactObject, validId, targetRpm, updateRpmExact, type ModelConfig } from '../model/plant';
import { seededRng, validateSeed } from '../model/random';
import { comparatorCommand, controllerIds, gridIndex, summarizeRun, type ComparatorId, type SimulationRow } from './constant';
export type FlowProfile =
  | { kind:'constant'; flowLMin:number }
  | { kind:'step'; beforeLMin:number; afterLMin:number; atS:number }
  | { kind:'ramp'; startLMin:number; endLMin:number; startS:number; endS:number }
  | { kind:'profile'; knots:{timeS:number;flowLMin:number}[] };
export interface DynamicScenario {
  schemaVersion:'taph.dynamic-scenario.v1'; id:string; profile:FlowProfile;
  dtS:number; durationS:number; measurementStartS:number; initialRpm:number; initialPitchDeg:number;
  sensorPeriodS:number; communicationDelayS:number; sensorNoiseHalfWidthLMin:number;
  actuatorTimeConstantS:number; actuatorRateLimitDegPerS:number|null;
  responseBandFraction:number;
}
export const exampleDynamics:DynamicScenario={
  schemaVersion:'taph.dynamic-scenario.v1',id:'synthetic-step-v1',
  profile:{kind:'step',beforeLMin:1,afterLMin:6,atS:15},
  dtS:0.1,durationS:60,measurementStartS:10,initialRpm:0,initialPitchDeg:42,
  sensorPeriodS:0.5,communicationDelayS:0.2,sensorNoiseHalfWidthLMin:0.03,
  actuatorTimeConstantS:0.4,actuatorRateLimitDegPerS:45,responseBandFraction:0.02,
};
export function flowAt(p:FlowProfile,t:number):number {
  if(p.kind==='constant') return p.flowLMin;
  if(p.kind==='step') return t<p.atS?p.beforeLMin:p.afterLMin;
  if(p.kind==='ramp') return p.startLMin+(p.endLMin-p.startLMin)*Math.max(0,Math.min(1,(t-p.startS)/(p.endS-p.startS)));
  if(t<=p.knots[0]!.timeS) return p.knots[0]!.flowLMin;
  for(let i=1;i<p.knots.length;i++) {const a=p.knots[i-1]!,b=p.knots[i]!;
    if(t<=b.timeS) return a.flowLMin+(b.flowLMin-a.flowLMin)*(t-a.timeS)/(b.timeS-a.timeS);
  }
  return p.knots.at(-1)!.flowLMin;
}
/** Evaluate declared on-grid events by integer index, avoiding late float comparisons. */
export function flowAtGrid(p:FlowProfile,k:number,dt:number):number {
  if(p.kind==='constant')return p.flowLMin;
  if(p.kind==='step')return k<gridIndex(p.atS,dt)?p.beforeLMin:p.afterLMin;
  if(p.kind==='ramp'){
    const a=gridIndex(p.startS,dt),b=gridIndex(p.endS,dt);
    return p.startLMin+(p.endLMin-p.startLMin)*Math.max(0,Math.min(1,(k-a)/(b-a)));
  }
  for(let i=1;i<p.knots.length;i++){
    const a=p.knots[i-1]!,b=p.knots[i]!,ai=gridIndex(a.timeS,dt),bi=gridIndex(b.timeS,dt);
    if(k<=bi)return a.flowLMin+(b.flowLMin-a.flowLMin)*Math.max(0,(k-ai)/(bi-ai));
  }
  return p.knots.at(-1)!.flowLMin;
}
/** Validate only the selected comparators; omitted selection retains the full-suite check. */
export function validateDynamics(value:unknown,m:ModelConfig=exampleModel,c:ControllerConfig=identityExample,selectedControllerIds:readonly ComparatorId[]=controllerIds):asserts value is DynamicScenario {
  validateModelConfig(m);validateConfig(c);
  if(!Array.isArray(selectedControllerIds)||!selectedControllerIds.length||new Set(selectedControllerIds).size!==selectedControllerIds.length||selectedControllerIds.some(id=>!controllerIds.includes(id)))throw new Error('nonempty unique known controller IDs required');
  exactObject(value,['schemaVersion','id','profile','dtS','durationS','measurementStartS','initialRpm','initialPitchDeg','sensorPeriodS','communicationDelayS','sensorNoiseHalfWidthLMin','actuatorTimeConstantS','actuatorRateLimitDegPerS','responseBandFraction']);
  const s=value as unknown as DynamicScenario;
  if(s.schemaVersion!=='taph.dynamic-scenario.v1'||!validId(s.id))throw new Error('invalid dynamic scenario');
  for(const key of ['dtS','durationS','measurementStartS','initialRpm','initialPitchDeg','sensorPeriodS','communicationDelayS','sensorNoiseHalfWidthLMin','actuatorTimeConstantS','responseBandFraction'] as const)finiteNumber(s[key],key);
  if(s.dtS<=0||s.durationS<=0||s.measurementStartS<=0||s.measurementStartS>=s.durationS||s.initialRpm<0||s.sensorPeriodS<s.dtS||s.communicationDelayS<0||s.communicationDelayS>s.durationS||s.sensorNoiseHalfWidthLMin<0||s.sensorNoiseHalfWidthLMin>m.flowMaxLMin||s.actuatorTimeConstantS<0||s.responseBandFraction<=0||s.responseBandFraction>=1)throw new Error('invalid timing, noise, or response parameter');
  if(s.actuatorRateLimitDegPerS!==null){finiteNumber(s.actuatorRateLimitDegPerS,'actuator rate');if(s.actuatorRateLimitDegPerS<=0)throw new Error('nonpositive actuator rate');}
  const steps=gridIndex(s.durationS,s.dtS),windowStart=gridIndex(s.measurementStartS,s.dtS);
  if(steps<2||steps>1000000||windowStart<1||windowStart>=steps)throw new Error('invalid grid span or measurement window');
  gridIndex(s.sensorPeriodS,s.dtS);gridIndex(s.communicationDelayS,s.dtS);
  assertOperatingPoint(0,s.initialPitchDeg,m);pitchToServo(s.initialPitchDeg,c.mapping);electricalOutput(s.initialRpm,m);
  const p=s.profile;let flows:number[];
  if(!p||typeof p!=='object')throw new Error('profile required');
  if(p.kind==='constant'){exactObject(p,['kind','flowLMin']);flows=[p.flowLMin];}
  else if(p.kind==='step'){exactObject(p,['kind','beforeLMin','afterLMin','atS']);const event=gridIndex(p.atS,s.dtS);if(event<=0||event>=steps)throw new Error('step must be within run grid');flows=[p.beforeLMin,p.afterLMin];}
  else if(p.kind==='ramp'){exactObject(p,['kind','startLMin','endLMin','startS','endS']);const start=gridIndex(p.startS,s.dtS),end=gridIndex(p.endS,s.dtS);if(start<0||end<=start||end>steps)throw new Error('invalid ramp grid span');flows=[p.startLMin,p.endLMin];}
  else if(p.kind==='profile'){
    exactObject(p,['kind','knots']);if(!Array.isArray(p.knots)||p.knots.length<2||p.knots[0]?.timeS!==0||p.knots.at(-1)?.timeS!==s.durationS)throw new Error('profile must span run');
    let prev=-1;flows=p.knots.map(k=>{exactObject(k,['timeS','flowLMin']);const index=gridIndex(k.timeS,s.dtS);if(index<=prev||index>steps)throw new Error('unordered or coincident knot indices');prev=index;return k.flowLMin;});
  }else throw new Error('unknown profile');
  for(const q of flows)assertOperatingPoint(q,s.initialPitchDeg,m);
  const low=Math.max(0,Math.min(...flows)-s.sensorNoiseHalfWidthLMin), high=Math.min(m.flowMaxLMin,Math.max(...flows)+s.sensorNoiseHalfWidthLMin);
  for(const id of selectedControllerIds)for(const q of [low,high])assertOperatingPoint(q,comparatorCommand(id,q,c).requestedPitchDeg,m);
}
export interface DynamicRow extends SimulationRow {
  dynamicsSchemaVersion:'taph.dynamic-row.v1'; sensorSampleTimeS:number; sensorNoiseLMin:number;
  commandIssuedTimeS:number; lastCommandDeliveryTimeS:number|null;
  appliedTargetPitchDeg:number; appliedServoCommandDeg:number;
}
export interface Delivery {issuedAtS:number;deliveredAtS:number;requestedPitchDeg:number;}
export interface DynamicRun {rows:DynamicRow[];deliveries:Delivery[];scenario:DynamicScenario;model:ModelConfig;controller:ControllerConfig;}
export function runDynamic(o:{scenario?:DynamicScenario;model?:ModelConfig;controller?:ControllerConfig;controllerId:ComparatorId;seed:number;configId?:string}):DynamicRun {
  const s=o.scenario??exampleDynamics,m=o.model??exampleModel,c=o.controller??{...identityExample,outOfRange:'clamp'};
  validateDynamics(s,m,c,[o.controllerId]);validateSeed(o.seed);
  const configId=o.configId??'dynamic-example-v1';if(!validId(configId))throw new Error('invalid config id');
  const n=gridIndex(s.durationS,s.dtS),sampleEvery=gridIndex(s.sensorPeriodS,s.dtS),delay=gridIndex(s.communicationDelayS,s.dtS),rng=seededRng(o.seed);
  let rpm=s.initialRpm,pitch=s.initialPitchDeg,sensed=flowAt(s.profile,0),noise=0,sampledAt=0,issuedAt=0,deliveredAt:number|null=null;
  let latest={requestedPitchDeg:pitch,servoCommandDeg:pitchToServo(pitch,c.mapping)},applied={...latest};
  const queue:{due:number;issued:number;command:typeof latest}[]=[],rows:DynamicRow[]=[],deliveries:Delivery[]=[];
  const runId=`${s.id}-s${o.seed}-${o.controllerId}`;
  for(let k=0;k<=n;k++){
    const t=k===n?s.durationS:k*s.dtS,q=flowAtGrid(s.profile,k,s.dtS);
    // The state at t is already the result of the preceding interval. Sampling and
    // deliveries at t can affect only the following interval, never the past.
    if(k%sampleEvery===0){
      noise=s.sensorNoiseHalfWidthLMin===0?0:s.sensorNoiseHalfWidthLMin*(2*rng()-1);
      sensed=Math.max(0,Math.min(m.flowMaxLMin,q+noise));sampledAt=t;issuedAt=t;
      latest=comparatorCommand(o.controllerId,sensed,c);queue.push({due:k+delay,issued:t,command:{...latest}});
    }
    while(queue.length&&queue[0]!.due<=k){const d=queue.shift()!;applied=d.command;deliveredAt=t;deliveries.push({issuedAtS:d.issued,deliveredAtS:t,requestedPitchDeg:applied.requestedPitchDeg});}
    rows.push({schemaVersion:'taph.simulation-row.v2',dynamicsSchemaVersion:'taph.dynamic-row.v1',category:'corrected-synthetic-simulation',scenarioId:s.id,runId,controllerId:o.controllerId,modelVersion:m.modelVersion,seed:o.seed,timeS:t,nominalFlowLMin:flowAt(s.profile,0),trueFlowLMin:q,sensedFlowLMin:sensed,...latest,actualModeledPitchDeg:pitch,stateRpm:rpm,speedPerturbationMultiplier:1,rpm,...electricalOutput(rpm,m),configId,measurementWindow:{startS:s.measurementStartS,endS:s.durationS,endpoints:'inclusive'},sensorSampleTimeS:sampledAt,sensorNoiseLMin:noise,commandIssuedTimeS:issuedAt,lastCommandDeliveryTimeS:deliveredAt,appliedTargetPitchDeg:applied.requestedPitchDeg,appliedServoCommandDeg:applied.servoCommandDeg});
    if(k===n)break;
    const desired=applied.requestedPitchDeg;
    const ideal=s.actuatorTimeConstantS===0&&s.actuatorRateLimitDegPerS===null;
    const rawDelta=(desired-pitch)*(s.actuatorTimeConstantS===0?1:-Math.expm1(-s.dtS/s.actuatorTimeConstantS));
    const maxDelta=s.actuatorRateLimitDegPerS===null?Infinity:s.actuatorRateLimitDegPerS*s.dtS;
    const nextPitch=pitch+Math.max(-maxDelta,Math.min(maxDelta,rawDelta));
    // Exact speed transition for left-held flow/pitch; finite actuator coupling is
    // a disclosed discrete approximation. Ideal actuation applies after the row.
    rpm=updateRpmExact(rpm,targetRpm(q,ideal?desired:pitch,m),s.dtS,m.rpmTimeConstantS);
    pitch=nextPitch;
  }
  return {rows,deliveries,scenario:s,model:m,controller:c};
}
export function dynamicMetrics(run:DynamicRun){
  const summary=summarizeRun(run.rows),s=run.scenario,w=summary.measurementWindow;
  const selected=run.rows.filter(r=>r.timeS>=w.startS-1e-10&&r.timeS<=w.endS+1e-10);
  let varianceIntegral=0;
  for(let i=1;i<selected.length;i++){const a=selected[i-1]!,b=selected[i]!;varianceIntegral+=(b.timeS-a.timeS)*((a.rpm-summary.meanRpm)**2+(b.rpm-summary.meanRpm)**2)/2;}
  const rpmCv=summary.meanRpm>0?Math.sqrt(varianceIntegral/(w.endS-w.startS))/summary.meanRpm:null;
  finiteNumber(varianceIntegral,'integrated speed variance');
  if(rpmCv!==null)finiteNumber(rpmCv,'speed coefficient of variation');
  let stepResponse:null|{targetRpm:number;referenceRpmAtEvent:number;nominalPreStepTargetRpm:number;eventTimeS:number;bandRpm:number;settlingTimeS:number|null;overshootFraction:number|null;overshootBasis:string;commandResponseDelayS:number|null}=null;
  // No tracking target is invented for noisy, ramp or continuously varying input.
  if(s.profile.kind==='step'&&s.sensorNoiseHalfWidthLMin===0&&s.profile.afterLMin!==s.profile.beforeLMin){
    const p=s.profile,id=run.rows[0]!.controllerId;
    const finalCommand=comparatorCommand(id,p.afterLMin,run.controller);
    const initialCommand=comparatorCommand(id,p.beforeLMin,run.controller);
    const target=targetRpm(p.afterLMin,finalCommand.requestedPitchDeg,run.model);
    const beforeTarget=targetRpm(p.beforeLMin,initialCommand.requestedPitchDeg,run.model);
    const after=run.rows.filter(r=>r.timeS>=p.atS-1e-10),band=s.responseBandFraction*Math.abs(target);
    let lastOutside=-1;after.forEach((r,i)=>{if(Math.abs(r.rpm-target)>band)lastOutside=i;});
    const firstInside=after[lastOutside+1];
    const changed=Math.abs(finalCommand.requestedPitchDeg-initialCommand.requestedPitchDeg)>1e-12;
    const firstDelivery=changed?run.deliveries.find(d=>d.issuedAtS>=p.atS-1e-10&&Math.abs(d.requestedPitchDeg-initialCommand.requestedPitchDeg)>1e-12):undefined;
    const reference=after[0]!.rpm;
    const amplitude=Math.abs(target-reference),direction=Math.sign(target-reference);
    let excess=0;for(const r of after)excess=Math.max(excess,direction*(r.rpm-target));
    stepResponse={targetRpm:target,referenceRpmAtEvent:reference,nominalPreStepTargetRpm:beforeTarget,eventTimeS:p.atS,bandRpm:band,settlingTimeS:firstInside&&firstInside.timeS<s.durationS?Math.max(0,firstInside.timeS-p.atS):null,overshootFraction:amplitude>0?excess/amplitude:null,overshootBasis:'target crossing in direction from actual modeled event speed to final equilibrium, normalized by that displacement',commandResponseDelayS:firstDelivery?Math.max(0,firstDelivery.deliveredAtS-p.atS):null};
  }
  return {...summary,rpmCv,configuredCommunicationDelayS:s.communicationDelayS,deliveredCommandCount:run.deliveries.length,stepResponse,safetyThresholdRpm:null,protectionValidated:false,metricInterpretation:'illustrative discrete model only; settling means remains in band through run end, not proof of asymptotic stability'};
}
