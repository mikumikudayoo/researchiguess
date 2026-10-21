import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { exampleModel, assumedSpeedMultiplier, electricalOutput, targetRpm, updateRpmExact, validateModelConfig } from '../src/model/plant';
import { seededRng } from '../src/model/random';
import { comparatorCommand, exampleConstantScenario, runConstant, summarizeRun, validateConstantScenario } from '../src/simulation/constant';
import { identityExample } from '../src/control/controller';
import { simulationCommand } from '../src/simulation/controller';

const small=()=>({...structuredClone(exampleConstantScenario),flowsLMin:[3.5],seeds:[42],dtS:0.1,durationS:1,measurementStartS:0.5});
describe('corrected electrical and assumed speed boundaries',()=>{
  test('load power is VI, I²RL, and E I minus internal copper loss',()=>{
    for(const rpm of [0,1,120,500,720]) {
      const e=electricalOutput(rpm);
      expect(e.pLoadW).toBeCloseTo(e.voltageV*e.currentA,12);
      expect(e.pLoadW).toBeCloseTo(e.currentA**2*exampleModel.loadResistanceOhm,12);
      expect(e.emfPowerW).toBeCloseTo(e.pLoadW+e.internalCopperLossW,12);
      expect(e.emfV).toBeCloseTo(e.voltageV+e.currentA*exampleModel.internalResistanceOhm,12);
      expect(e.hydraulicEfficiency).toBeNull();
    }
    expect(electricalOutput(0).pLoadW).toBe(0);
    expect(electricalOutput(500).pLoadW).toBeCloseTo((7.5/11)**2*10,12);
  });
  test('declares a peak assumption, not an optimized or hydraulic efficiency value',()=>{
    expect(assumedSpeedMultiplier(42)).toBe(1);
    expect(assumedSpeedMultiplier(5)).toBeCloseTo(0.55,12);
    expect(targetRpm(0,42)).toBe(0);
    expect(targetRpm(6,42)).toBe(720);
    expect(()=>targetRpm(6.1,42)).toThrow();
    expect(()=>targetRpm(1,76)).toThrow();
  });
  test('exact integration agrees with analytic constant-target solution',()=>{
    let rpm=17; const target=500,dt=0.1,tau=3;
    for(let k=1;k<=600;k++) {
      rpm=updateRpmExact(rpm,target,dt,tau);
      expect(rpm).toBeCloseTo(target+(17-target)*Math.exp(-k*dt/tau),10);
    }
    expect(updateRpmExact(0,0,0.1,3)).toBe(0);
    for(const args of [[0,1,0,3],[0,1,1,0],[-1,1,1,3],[0,NaN,1,3],[0,1,Infinity,3]])
      expect(()=>updateRpmExact(...args as [number,number,number,number])).toThrow();
  });
  test('rejects invalid model parameters instead of silently coercing them',()=>{
    for(const [key,value] of [['rpmPerLMin',-1],['rpmTimeConstantS',0],['rpmTimeConstantS',NaN],['voltsPerRpm',Infinity],
      ['internalResistanceOhm',-1],['loadResistanceOhm',0],['pitchWidthDeg',0],['speedMultiplierDrop',1],['flowMaxLMin',0],
      ['pitchMinDeg',80],['assumedPeakPitchDeg',100]])
      expect(()=>validateModelConfig({...exampleModel,[key as string]:value})).toThrow();
    expect(()=>validateModelConfig({...exampleModel,claimedEfficiency:0.65})).toThrow();
    for(const rpm of [-1,NaN,Infinity]) expect(()=>electricalOutput(rpm)).toThrow();
  });
});
describe('scenario timing, comparison and descriptive summaries',()=>{
  test('initial row precedes updates, followed by exactly duration/dt transitions',()=>{
    const scenario=small();
    const rows=runConstant({scenario,flowLMin:3.5,seed:42,controllerId:'fixed-5'});
    expect(rows).toHaveLength(11);
    expect(rows[0]!.timeS).toBe(0); expect(rows[0]!.rpm).toBe(0);
    expect(rows[0]!.actualModeledPitchDeg).toBe(42);
    expect(rows[1]!.actualModeledPitchDeg).toBe(5);
    expect(rows[1]!.rpm).toBeCloseTo(targetRpm(3.5,5)*(1-Math.exp(-0.1/3)),12);
    expect(rows.at(-1)!.timeS).toBe(1);
    expect(rows.at(-1)!.rpm).toBeCloseTo(targetRpm(3.5,5)*(1-Math.exp(-1/3)),12);
    expect(rows.every(r=>r.nominalFlowLMin===3.5 && r.trueFlowLMin===3.5 && r.sensedFlowLMin===3.5)).toBe(true);
  });
  test('changing schedules share domain, resolution, mapping and increasing endpoints',()=>{
    for(const q of [1,2.25,3.5,4.75,6]) {
      const shared=simulationCommand(q);
      expect(comparatorCommand('fuzzy-increasing',q)).toEqual({requestedPitchDeg:shared.requestedPitchDeg,servoCommandDeg:shared.servoCommandDeg});
      for(const id of ['fuzzy-increasing','linear-increasing'] as const) {
        const pitch=comparatorCommand(id,q).requestedPitchDeg;
        expect(pitch).toBeGreaterThanOrEqual(10); expect(pitch).toBeLessThanOrEqual(75);
      }
    }
    expect(comparatorCommand('linear-increasing',1).requestedPitchDeg).toBe(10);
    expect(comparatorCommand('linear-increasing',6).requestedPitchDeg).toBe(75);
    expect(comparatorCommand('fixed-5',1).requestedPitchDeg).toBe(5);
    expect(()=>comparatorCommand('linear-increasing',0)).toThrow();
  });
  test('every comparator preserves the simulation schema and exact output keys',()=>{
    const scenario=small();
    const runs=scenario.controllerIds.map(controllerId=>runConstant({scenario,flowLMin:3.5,seed:42,controllerId}));
    const keys=Object.keys(runs[0]![0]!);
    for(let i=0;i<runs.length;i++) for(const row of runs[i]!) {
      expect(Object.keys(row)).toEqual(keys);
      expect(row.schemaVersion).toBe('taph.simulation-row.v2');
      expect(row.controllerId).toBe(scenario.controllerIds[i]!);
    }
  });
  test('portable RNG has known values and rejects non-uint32 seeds',()=>{
    const random=seededRng(1);
    expect([random(),random(),random()]).toEqual([0.6270739405881613,0.002735721180215478,0.5274470399599522]);
    for(const seed of [-1,0.5,2**32,NaN,Infinity]) expect(()=>seededRng(seed)).toThrow();
  });
  test('paired speed perturbations are reproducible and do not disturb flow or state',()=>{
    const scenario={...small(),speedPerturbationFraction:0.03};
    const options={scenario,flowLMin:3.5,seed:42,controllerId:'fuzzy-increasing' as const};
    const a=runConstant(options),b=runConstant(options);
    expect(a).toEqual(b);
    const fixed=runConstant({...options,controllerId:'fixed-5'});
    expect(a.map(r=>r.speedPerturbationMultiplier)).toEqual(fixed.map(r=>r.speedPerturbationMultiplier));
    const quiet=runConstant({...options,scenario:{...scenario,speedPerturbationFraction:0}});
    expect(a.map(r=>r.stateRpm)).toEqual(quiet.map(r=>r.stateRpm));
    expect(a[0]!.speedPerturbationMultiplier).toBe(1);
    expect(a.every(r=>r.speedPerturbationMultiplier>=0.97 && r.speedPerturbationMultiplier<1.03)).toBe(true);
  });
  test('scenario rejects bad grids, windows, noise and initial values',()=>{
    for(const change of [{dtS:0},{dtS:NaN},{durationS:1.05},{measurementStartS:0},{measurementStartS:1},
      {measurementStartS:0.55},{speedPerturbationFraction:-0.1},{speedPerturbationFraction:1},{speedPerturbationFraction:NaN},
      {initialRpm:-1},{initialPitchDeg:76},{seeds:[-1]},{seeds:[42,42]},{flowsLMin:[7]},{flowsLMin:[]}])
      expect(()=>validateConstantScenario({...small(),...change})).toThrow();
  });
  test('zero flow at zero initial speed stays zero for declared fixed comparison',()=>{
    const scenario={...small(),flowsLMin:[0],controllerIds:['fixed-5' as const]};
    const rows=runConstant({scenario,flowLMin:0,seed:42,controllerId:'fixed-5'});
    expect(rows.every(r=>r.rpm===0 && r.pLoadW===0 && r.currentA===0 && r.voltageV===0)).toBe(true);
  });
  test('measurement window excludes startup and uses trapezoidal time weighting',()=>{
    const rows=runConstant({scenario:small(),flowLMin:3.5,seed:42,controllerId:'fixed-5'});
    const manufactured=rows.map(r=>({...r,rpm:r.timeS*10,pLoadW:r.timeS*20}));
    const summary=summarizeRun(manufactured);
    expect(summary.sampleCount).toBe(6); expect(summary.meanRpm).toBeCloseTo(7.5,12);
    expect(summary.meanPLoadW).toBeCloseTo(15,12); expect(summary.loadEnergyJ).toBeCloseTo(7.5,12);
    expect(summary.maxRpm).toBe(10); expect(summary.minRpm).toBe(5);
    const quadratic=summarizeRun(rows.map(r=>({...r,rpm:100*r.timeS**2,pLoadW:200*r.timeS**2})));
    expect(quadratic.meanRpm).toBeCloseTo(58.5,12); // Endpoint half weights; arithmetic sample mean would be 59.1666…
    expect(quadratic.meanPLoadW).toBeCloseTo(117,12); expect(quadratic.loadEnergyJ).toBeCloseTo(58.5,12);
    expect(summary).not.toHaveProperty('pValue'); expect(summary).not.toHaveProperty('confidenceInterval');
    expect(()=>summarizeRun(rows.filter(r=>r.timeS<1))).toThrow();
    expect(()=>summarizeRun(rows.filter((_,i)=>i!==7))).toThrow();
    expect(()=>summarizeRun([...rows].reverse())).toThrow();
    expect(()=>summarizeRun(rows.map((r,i)=>i===1?{...r,runId:'different'}:r))).toThrow();
  });
  test('CLI writes traceable manifests and refuses an existing output directory',()=>{
    const temp=mkdtempSync(join(tmpdir(),'taph-model-test-'));
    try {
      const configPath=join(temp,'input.json'), output=join(temp,'new-output');
      writeFileSync(configPath,JSON.stringify({schemaVersion:'taph.run-config.v1',id:'test-config',model:exampleModel,scenario:small(),controller:identityExample}));
      const args=[process.execPath,resolve(import.meta.dir,'../scripts/simulate.ts'),output,configPath];
      const result=Bun.spawnSync(args,{stdout:'pipe',stderr:'pipe'});
      expect(result.exitCode).toBe(0);
      const manifest=JSON.parse(readFileSync(join(output,'manifest.json'),'utf8'));
      expect(manifest.status).toBe('complete'); expect(manifest.actualRows).toBe(44);
      expect(manifest.configSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(manifest.sources['src/control/controller.ts']).toMatch(/^[0-9a-f]{64}$/);
      expect(manifest.outputSha256['samples.csv']).toMatch(/^[0-9a-f]{64}$/);
      expect(manifest.runtime.version).toBe(Bun.version);
      const csvRows=readFileSync(join(output,'samples.csv'),'utf8').trim().split('\n').map(line=>line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/));
      const header=csvRows[0]!;
      for(const row of csvRows.slice(1)) {
        expect(row.length).toBe(header.length);
        expect(row[header.indexOf('schemaVersion')]).toBe('taph.simulation-row.v2');
        expect(small().controllerIds.map(String)).toContain(row[header.indexOf('controllerId')]!);
      }
      const again=Bun.spawnSync(args,{stdout:'pipe',stderr:'pipe'});
      expect(again.exitCode).not.toBe(0); expect(again.stderr.toString()).toContain('refusing existing output');
    } finally {rmSync(temp,{recursive:true,force:true});}
  });
});
