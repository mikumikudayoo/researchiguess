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

test('single-run validation excludes unused flow and pitch constraints',async()=>{
 const {exampleModel}=await import('../src/model/plant');
 const s={...scenario(),profile:{kind:'constant' as const,flowLMin:0}};
 const fixed=runDynamic({scenario:s,controller:identityExample,controllerId:'fixed-assumed-peak-42',seed:1});
 expect(fixed.rows.every(r=>r.trueFlowLMin===0&&r.requestedPitchDeg===42&&r.rpm===0&&r.pLoadW===0)).toBe(true);
 expect(fixed.controller.outOfRange).toBe('reject');
 const fuzzy=runDynamic({scenario:{...s,profile:{kind:'constant',flowLMin:3.5}},model:{...exampleModel,pitchMinDeg:10},controller:identityExample,controllerId:'fuzzy-increasing',seed:1});
 expect(fuzzy.rows.every(r=>r.requestedPitchDeg===40&&r.actualModeledPitchDeg>=40&&r.actualModeledPitchDeg<=42)).toBe(true);
 expect(fuzzy.model.pitchMinDeg).toBe(10);expect(fuzzy.controller.outOfRange).toBe('reject');
});

test('selected-controller validation retains range, initial-state, and selection checks',async()=>{
 const {exampleModel}=await import('../src/model/plant');
 const s={...scenario(),profile:{kind:'constant' as const,flowLMin:0}};
 for(const controllerId of ['fuzzy-increasing','linear-increasing'] as const)
  expect(()=>runDynamic({scenario:s,controller:identityExample,controllerId,seed:1})).toThrow('flow outside configured operating range');
 const narrowModel={...exampleModel,pitchMinDeg:10};
 const nominal={...s,profile:{kind:'constant' as const,flowLMin:3.5}};
 expect(()=>runDynamic({scenario:nominal,model:narrowModel,controller:identityExample,controllerId:'fixed-5',seed:1})).toThrow('input outside illustrative model operating bounds');
 expect(()=>runDynamic({scenario:{...nominal,initialPitchDeg:5},model:narrowModel,controller:identityExample,controllerId:'fuzzy-increasing',seed:1})).toThrow();
 expect(()=>runDynamic({scenario:{...nominal,profile:{kind:'constant',flowLMin:7}},controllerId:'fixed-assumed-peak-42',seed:1})).toThrow();
 expect(()=>runDynamic({scenario:{...nominal,profile:{kind:'constant',flowLMin:1},sensorNoiseHalfWidthLMin:.1},controller:identityExample,controllerId:'fuzzy-increasing',seed:1})).toThrow();
 expect(()=>validateDynamics(s,exampleModel,identityExample)).toThrow(); // Omission still checks all four.
 expect(()=>validateDynamics(s,exampleModel,identityExample,['fixed-assumed-peak-42','fuzzy-increasing'])).toThrow();
 expect(()=>validateDynamics(nominal,narrowModel,identityExample,['fuzzy-increasing','fixed-5'])).toThrow();
 for(const ids of [[],['unknown'],['fixed-5','fixed-5'],null])
  expect(()=>validateDynamics(nominal,exampleModel,identityExample,ids as any)).toThrow('nonempty unique known controller IDs required');
 expect(()=>runDynamic({scenario:nominal,controllerId:'unknown' as any,seed:1})).toThrow('known controller IDs');
});

test('CLI validates exactly selected comparators and preserves subset provenance',async()=>{
 const {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {createHash}=await import('node:crypto');
 const {exampleModel}=await import('../src/model/plant');
 const dir=mkdtempSync(join(tmpdir(),'taph-selected-dynamics-'));
 try{
  const cases=[
   {ids:['fixed-assumed-peak-42'],flow:0,minPitch:5,valid:true},
   {ids:['fuzzy-increasing'],flow:3.5,minPitch:10,valid:true},
   {ids:['fuzzy-increasing','linear-increasing'],flow:3.5,minPitch:10,valid:true},
   {ids:['fuzzy-increasing'],flow:0,minPitch:5,valid:false},
   {ids:['fixed-5'],flow:3.5,minPitch:10,valid:false},
   {ids:['fixed-assumed-peak-42','fuzzy-increasing'],flow:0,minPitch:5,valid:false},
   {ids:['fuzzy-increasing','fixed-5'],flow:3.5,minPitch:10,valid:false},
   {ids:[],flow:3.5,minPitch:5,valid:false},
   {ids:['unknown'],flow:3.5,minPitch:5,valid:false},
   {ids:['fixed-5','fixed-5'],flow:3.5,minPitch:5,valid:false},
  ];
  for(const [i,c] of cases.entries()){
   const config={schemaVersion:'taph.dynamic-run-config.v1',id:'selected-regression',model:{...exampleModel,pitchMinDeg:c.minPitch},controller:identityExample,seeds:[123],controllerIds:c.ids,scenarios:[{...scenario(),profile:{kind:'constant',flowLMin:c.flow}}]};
   const input=join(dir,`input-${i}.json`),out=join(dir,`output-${i}`);writeFileSync(input,JSON.stringify(config));
   const p=Bun.spawn([process.execPath,'scripts/simulate-dynamics.ts',out,input],{stdout:'pipe',stderr:'pipe'});
   const errors=await new Response(p.stderr).text(),code=await p.exited;
   if(!c.valid){expect(code).not.toBe(0);expect(errors).toMatch(/RangeError|nonempty unique known controller IDs required/);expect(existsSync(out)).toBe(false);continue;}
   expect({code,errors}).toEqual({code:0,errors:''});
   const manifest=JSON.parse(readFileSync(join(out,'manifest.json'),'utf8'));
   expect(manifest.status).toBe('complete');expect(manifest.controllerIds).toEqual(c.ids);expect(manifest.actualRuns).toBe(c.ids.length);expect(manifest.actualRows).toBe(101*c.ids.length);
   expect(JSON.parse(readFileSync(join(out,'config.json'),'utf8'))).toEqual(config);
   const summaries=JSON.parse(readFileSync(join(out,'comparison.json'),'utf8'));expect(summaries.map((x:any)=>x.controllerId)).toEqual(c.ids);
   for(const [file,hash]of Object.entries(manifest.outputSha256))expect(createHash('sha256').update(readFileSync(join(out,file))).digest('hex')).toBe(String(hash));
   for(const [file,hash]of Object.entries(manifest.sources))expect(createHash('sha256').update(readFileSync(file)).digest('hex')).toBe(String(hash));
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});

// Captured from PR #4 at 5ed8be355facf77049e7b3779458afb90f3bf15b, before the
// selection fix. These are synthetic model outputs, not measured research data.
test('built-in four-controller outputs retain their pre-fix hashes',async()=>{
 const {mkdtempSync,readFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {createHash}=await import('node:crypto');
 const dir=mkdtempSync(join(tmpdir(),'taph-default-regression-'));
 try{
  const out=join(dir,'run'),p=Bun.spawn([process.execPath,'scripts/simulate-dynamics.ts',out],{stdout:'pipe',stderr:'pipe'});
  const errors=await new Response(p.stderr).text();expect({code:await p.exited,errors}).toEqual({code:0,errors:''});
  const manifest=JSON.parse(readFileSync(join(out,'manifest.json'),'utf8'));
  expect(manifest.actualRows).toBe(19232);expect(manifest.actualRuns).toBe(32);expect(manifest.controllerIds).toEqual([...controllerIds]);
  expect(manifest.configSha256).toBe("9a18b9b281770148fe835e6955f5a13d4e829806aa7447f2e4cd2950615ee7ca");
  const expected={
  "config.json": "16ac954049da16028d02d0b9ee3457097a87216d5570edfa5433886881318ed2",
  "samples.csv": "7afa8d4d145ddcf835a23b2d1daaa778c0f92853c398ce4584206564fe89274b",
  "comparison.json": "6ed31a04fc20c7a7de203134c031219b062b388eb544a897f41d83e75f775f80",
  "comparison.csv": "e6fbf35b5832fe13d7010243e1e2b0f255c17b10b13160a3c81c90e2e581412f",
  "deliveries.json": "3bdb8599b45f21dbc695be38d4ea28dbd3aaabae819aa9ef06331b9ce84114e2",
  "timeseries-constant-sensor-noise-v1.svg": "509aebec9eaccb57987bb16fc2393202f3d5d8aa00469fd4e35a3e6cc01c6e80",
  "timeseries-noise-free-step-v1.svg": "84f49f1ad69353397f79130a33cff9438db064ae2885960dc1ebe5c1a1ee0684",
  "timeseries-ramp-sensor-noise-v1.svg": "2f07bf6e0686306c877611e8fa7722748189493ae128a3111fc955a1fcdb229e",
  "timeseries-profile-sensor-noise-v1.svg": "6a21ad850c5a4e2b12192ae9e788941f0f26d9e8a113d5698de19dd092f144de",
  "comparison-power-versus-speed.svg": "376b3530cc96018b5bf538fe966f7cf7f367fe302fe09253616ad0eb5b861956"
};
  expect(manifest.outputSha256).toEqual(expected);
  for(const [file,hash]of Object.entries(expected))expect(createHash('sha256').update(readFileSync(join(out,file))).digest('hex')).toBe(hash);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
