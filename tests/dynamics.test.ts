import {expect,test} from 'bun:test';
import {identityExample} from '../src/control/controller';
import {exampleDynamics,flowAt,runDynamic,dynamicMetrics,validateDynamics,type DynamicScenario} from '../src/simulation/dynamics';
import {exampleConstantScenario,runConstant,controllerIds} from '../src/simulation/constant';
const controller={...structuredClone(identityExample),outOfRange:'clamp' as const};
const scenario=():DynamicScenario=>({...structuredClone(exampleDynamics),durationS:10,measurementStartS:1,profile:{kind:'step',beforeLMin:1,afterLMin:6,atS:2},sensorNoiseHalfWidthLMin:0});
test('synthetic flow generators have declared bounds and exact knots',()=>{
 expect([0,2,4].map(t=>flowAt({kind:'step',beforeLMin:1,afterLMin:6,atS:2},t))).toEqual([1,6,6]);
 expect([0,1,2,3,4].map(t=>flowAt({kind:'ramp',startLMin:1,endLMin:6,startS:1,endS:3},t))).toEqual([1,1,3.5,6,6]);
 expect([0,1,2,3,4].map(t=>flowAt({kind:'profile',knots:[{timeS:0,flowLMin:1},{timeS:2,flowLMin:6},{timeS:4,flowLMin:2}]},t))).toEqual([1,3.5,6,4,2]);
});
test('integer-grid events are not delayed by binary floating-point timestamps',()=>{
 const s={...scenario(),dtS:.3,durationS:3,measurementStartS:.3,sensorPeriodS:.3,communicationDelayS:0,profile:{kind:'step' as const,beforeLMin:1,afterLMin:6,atS:.9}};
 const rows=runDynamic({scenario:s,controller,controllerId:'fuzzy-increasing',seed:1}).rows;
 expect(rows[2]!.trueFlowLMin).toBe(1);expect(rows[3]!.trueFlowLMin).toBe(6);expect(rows[3]!.requestedPitchDeg).toBe(75);
});
test('initial state, sampled flow, delay and actuator motion remain causal',()=>{
 const s=scenario();s.profile={kind:'step',beforeLMin:1,afterLMin:6,atS:2.1};
 const run=runDynamic({scenario:s,controller,controllerId:'fuzzy-increasing',seed:1});const at=(t:number)=>run.rows[Math.round(t/s.dtS)]!;
 expect(at(0).rpm).toBe(0);expect(at(0).actualModeledPitchDeg).toBe(42);expect(at(0).requestedPitchDeg).toBe(10);expect(at(0).appliedTargetPitchDeg).toBe(42);
 expect(at(2.1).trueFlowLMin).toBe(6);expect(at(2.1).sensedFlowLMin).toBe(1);expect(at(2.5).sensedFlowLMin).toBe(6);expect(at(2.5).requestedPitchDeg).toBe(75);
 expect(at(2.6).appliedTargetPitchDeg).toBe(10);expect(at(2.7).appliedTargetPitchDeg).toBe(75);
 expect(at(2.8).actualModeledPitchDeg).toBeGreaterThan(at(2.7).actualModeledPitchDeg);
 for(let i=1;i<run.rows.length;i++)expect(Math.abs(run.rows[i]!.actualModeledPitchDeg-run.rows[i-1]!.actualModeledPitchDeg)).toBeLessThanOrEqual(4.5+1e-10);
 expect(dynamicMetrics(run).stepResponse!.commandResponseDelayS).toBeCloseTo(0.6,12);
});
test('dynamic constant ideal pathway reduces to corrected constant model',()=>{
 const s=scenario();s.profile={kind:'constant',flowLMin:3.5};s.communicationDelayS=0;s.actuatorTimeConstantS=0;s.actuatorRateLimitDegPerS=null;
 const base={...exampleConstantScenario,flowsLMin:[3.5],seeds:[1],durationS:10,measurementStartS:1,speedPerturbationFraction:0};
 for(const id of controllerIds){
  const a=runDynamic({scenario:s,controller,controllerId:id,seed:1}).rows;
  const b=runConstant({scenario:base,controller,controllerId:id,flowLMin:3.5,seed:1});
  expect(a.length).toBe(b.length);a.forEach((r,i)=>{expect(r.timeS).toBe(b[i]!.timeS);expect(r.rpm).toBeCloseTo(b[i]!.rpm,11);expect(r.pLoadW).toBeCloseTo(b[i]!.pLoadW,12);expect(r.actualModeledPitchDeg).toBeCloseTo(b[i]!.actualModeledPitchDeg,12);});
 }
});
test('true flow disturbance reaches plant even when pitch is fixed',()=>{
 const s=scenario();const r=runDynamic({scenario:s,controller,controllerId:'fixed-assumed-peak-42',seed:1}).rows;
 const constant=runDynamic({scenario:{...s,profile:{kind:'constant',flowLMin:1}},controller,controllerId:'fixed-assumed-peak-42',seed:1}).rows;
 expect(r[20]!.rpm).toBe(constant[20]!.rpm);expect(r[21]!.rpm).toBeGreaterThan(constant[21]!.rpm);expect(r[20]!.requestedPitchDeg).toBe(42);
});
test('sensor noise is separate from true flow and shared independent of comparator order',()=>{
 const s=scenario();s.profile={kind:'constant',flowLMin:3.5};s.sensorNoiseHalfWidthLMin=.2;
 const a=controllerIds.map(id=>runDynamic({scenario:s,controller,controllerId:id,seed:123}));
 const b=[...controllerIds].reverse().map(id=>runDynamic({scenario:s,controller,controllerId:id,seed:123}));
 for(const r of a){expect(r.rows).toEqual(b.find(x=>x.rows[0]!.controllerId===r.rows[0]!.controllerId)!.rows);expect(r.rows.map(x=>x.sensedFlowLMin)).toEqual(a[0]!.rows.map(x=>x.sensedFlowLMin));expect(r.rows.every(x=>x.trueFlowLMin===3.5)).toBe(true);}
 expect(a[0]!.rows.some(x=>x.sensedFlowLMin!==x.trueFlowLMin)).toBe(true);
 const quiet=runDynamic({scenario:{...s,sensorNoiseHalfWidthLMin:0},controller,controllerId:'fixed-5',seed:123});
 expect(quiet.rows.map(x=>x.rpm)).toEqual(a[0]!.rows.map(x=>x.rpm));
 expect(dynamicMetrics(a[2]!).stepResponse).toBeNull();
});
test('dynamic metrics are descriptive and undefined protection thresholds stay unavailable',()=>{
 const run=runDynamic({scenario:scenario(),controller,controllerId:'fuzzy-increasing',seed:1}),m=dynamicMetrics(run);
 expect(m.hydraulicEfficiency).toBeNull();expect(m.safetyThresholdRpm).toBeNull();expect(m.protectionValidated).toBe(false);expect(m.rpmCv).toBeGreaterThan(0);expect(m.stepResponse!.targetRpm).toBeGreaterThan(0);expect(m.stepResponse!.settlingTimeS).toBeNull();
});
test('nonfinite aggregate arithmetic fails instead of becoming null in JSON',()=>{
 const run=runDynamic({scenario:scenario(),controller,controllerId:'fuzzy-increasing',seed:1});
 run.rows.forEach((r,i)=>{r.rpm=i%2===0?1e200:2e200;});expect(()=>dynamicMetrics(run)).toThrow();
 run.rows.forEach(r=>{r.rpm=1e308;});expect(()=>dynamicMetrics(run)).toThrow();
});
test('startup displacement is not counted as overshoot for an early downward flow step',()=>{
 const s={...scenario(),durationS:20,profile:{kind:'step' as const,beforeLMin:6,afterLMin:1,atS:.1},communicationDelayS:0,actuatorTimeConstantS:0,actuatorRateLimitDegPerS:null};
 const run=runDynamic({scenario:s,controller,controllerId:'fixed-assumed-peak-42',seed:1}),m=dynamicMetrics(run);
 expect(m.stepResponse!.referenceRpmAtEvent).toBeLessThan(120);expect(m.stepResponse!.targetRpm).toBe(120);expect(m.stepResponse!.overshootFraction).toBe(0);
});
test('malformed scenarios and incompatible ranges fail explicitly',()=>{
 const a=scenario();for(const patch of [{dtS:0},{sensorPeriodS:.15},{communicationDelayS:.25},{sensorNoiseHalfWidthLMin:-1},{actuatorTimeConstantS:-1},{actuatorRateLimitDegPerS:0},{responseBandFraction:NaN},{measurementStartS:10},{profile:{kind:'step',beforeLMin:1,afterLMin:7,atS:2}},{profile:{kind:'profile',knots:[{timeS:0,flowLMin:1},{timeS:0,flowLMin:2},{timeS:10,flowLMin:6}]}}])expect(()=>validateDynamics({...a,...patch},undefined,controller)).toThrow();
 expect(()=>validateDynamics({...a,sensorNoiseHalfWidthLMin:.1},undefined,identityExample)).toThrow();
 expect(()=>runDynamic({scenario:a,controller,controllerId:'fuzzy-increasing',seed:-1})).toThrow();
 expect(()=>validateDynamics({...a,profile:{kind:'profile',knots:[{timeS:0,flowLMin:1},{timeS:1e-12,flowLMin:2},{timeS:10,flowLMin:6}]}},undefined,controller)).toThrow();
 expect(()=>validateDynamics({...a,profile:{kind:'ramp',startLMin:1,endLMin:6,startS:0,endS:1e-12}},undefined,controller)).toThrow();
 expect(()=>validateDynamics({...a,profile:{kind:'step',beforeLMin:1,afterLMin:6,atS:1e-12}},undefined,controller)).toThrow();
});

test('finite-horizon settling time cannot be negative from roundoff',()=>{
 const s={...scenario(),dtS:.3,durationS:3,measurementStartS:.3,sensorPeriodS:.3,initialRpm:120,communicationDelayS:0,actuatorTimeConstantS:0,actuatorRateLimitDegPerS:null,profile:{kind:'step' as const,beforeLMin:1,afterLMin:1.001,atS:.9}};
 const m=dynamicMetrics(runDynamic({scenario:s,controller,controllerId:'fixed-assumed-peak-42',seed:1}));expect(m.stepResponse!.settlingTimeS).toBe(0);
});

test('dynamic CLI preserves schema, source/output hashes, deterministic files and prior runs',async()=>{
 const {mkdtempSync,writeFileSync,readFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {createHash}=await import('node:crypto');
 const {exampleModel}=await import('../src/model/plant');
 const dir=mkdtempSync(join(tmpdir(),'taph-dynamics-'));
 try{
  const config=join(dir,'input.json');writeFileSync(config,JSON.stringify({schemaVersion:'taph.dynamic-run-config.v1',id:'test-only',model:exampleModel,controller,seeds:[1],controllerIds:[...controllerIds],scenarios:[scenario()]}));
  async function execute(out:string){const p=Bun.spawn([process.execPath,'scripts/simulate-dynamics.ts',out,config],{stdout:'pipe',stderr:'pipe'});const errors=await new Response(p.stderr).text();return {code:await p.exited,errors};}
  const first=join(dir,'first'),second=join(dir,'second');expect(await execute(first)).toEqual({code:0,errors:''});expect(await execute(second)).toEqual({code:0,errors:''});
  const manifest=JSON.parse(readFileSync(join(first,'manifest.json'),'utf8'));
  expect(manifest.status).toBe('complete');expect(manifest.category).toBe('corrected-synthetic-simulation');expect(manifest.actualRows).toBe(404);expect(manifest.actualRuns).toBe(4);
  for(const [file,hash]of Object.entries(manifest.outputSha256)){const bytes=readFileSync(join(first,file));expect(createHash('sha256').update(bytes).digest('hex')).toBe(String(hash));expect(bytes.equals(readFileSync(join(second,file)))).toBe(true);}
  const rows=readFileSync(join(first,'samples.csv'),'utf8').trim().split('\n'),header=rows[0]!.split(',');expect(header.length).toBe(33);expect(rows.length).toBe(405);expect(header).toContain('appliedTargetPitchDeg');
  const summaries=JSON.parse(readFileSync(join(first,'comparison.json'),'utf8'));expect(summaries.map((x:any)=>x.controllerId)).toEqual([...controllerIds]);expect(summaries.every((x:any)=>x.category==='corrected-synthetic-simulation'&&x.protectionValidated===false)).toBe(true);
  expect((await execute(first)).code).not.toBe(0);expect(JSON.parse(readFileSync(join(first,'manifest.json'),'utf8')).status).toBe('complete');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
