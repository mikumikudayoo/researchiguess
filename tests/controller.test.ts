import { test, expect } from 'bun:test';
import { commandForFlow, memberships, identityExample, validateConfig, servoToPitch, type ControllerConfig } from '../src/control/controller';
import { simulationCommand } from '../src/simulation/controller';
import { handleRequest } from '../src/server';
const copy=()=>structuredClone(identityExample);
test('five nominal commands and deterministic weighted-average rules',()=>{
  expect([1,2.25,3.5,4.75,6].map(q=>commandForFlow(q).requestedPitchDeg)).toEqual([10,25,40,58,75]);
  for(const q of [1,1.125,2.7,3.5,3.6,5.9,6]) {
    const u=memberships(q,[1,3.5,6]); expect(u.low+u.medium+u.high).toBeCloseTo(1,14);
    expect(commandForFlow(q)).toEqual(commandForFlow(q));
  }
});
test('physical pitch monotonicity survives reversed unverified linkage',()=>{
  const reverse=copy();reverse.mapping.direction=-1;reverse.mapping.servoZeroDeg=180;
  let previous=-Infinity,servo=Infinity;
  for(let i=0;i<=1000;i++) {
    const q=1+5*i/1000;const result=commandForFlow(q,0,reverse);
    expect(result.requestedPitchDeg).toBeGreaterThanOrEqual(previous);
    expect(result.servoCommandDeg).toBeLessThanOrEqual(servo);
    expect(servoToPitch(result.servoCommandDeg,reverse.mapping)).toBeCloseTo(result.requestedPitchDeg,12);
    expect(result.hardwareEligible).toBe(false);previous=result.requestedPitchDeg;servo=result.servoCommandDeg;
  }
});
test('boundaries, explicit clamping, and malformed inputs',()=>{
  for(const q of [NaN,Infinity,-Infinity,-1,'2' as unknown as number]) expect(()=>commandForFlow(q)).toThrow();
  for(const q of [0,0.999,6.001]) expect(()=>commandForFlow(q)).toThrow(RangeError);
  const c=copy();c.outOfRange='clamp';expect(commandForFlow(0,0,c).inputDisposition).toBe('clamped-low');expect(commandForFlow(7,0,c).requestedPitchDeg).toBe(75);
  for(const seq of [-1,1.5,2**32,NaN]) expect(()=>commandForFlow(3,seq)).toThrow();
});
test('configuration and coordinate bounds reject impossible or nonmonotonic mappings',()=>{
  const cases:ControllerConfig[]=[];
  let c=copy();c.pitchConsequentsDeg=[70,40,10];cases.push(c);
  c=copy();c.mapping.servoMaxDeg=50;cases.push(c);
  c=copy();c.mapping.pitchPerServoDeg=0;cases.push(c);
  c=copy();c.mapping.calibrationStatus='bench-reviewed';cases.push(c);
  c=copy();c.pitchResolutionDeg=NaN;cases.push(c);
  c=copy();c.pitchResolutionDeg=Number.MIN_VALUE;cases.push(c);
  c=copy();c.flowKnotsLMin=[1,1,6];cases.push(c);
  for(const value of [...cases,null,{}, {...copy(),extra:1}]) expect(()=>validateConfig(value)).toThrow();
  c=copy();c.mapping.calibrationStatus='bench-reviewed';c.mapping.calibrationRecordId='test-fixture';
  expect(commandForFlow(2,0,c).hardwareEligible).toBe(false);
  c.deploymentReviewId='test-fixture-only';expect(commandForFlow(2,0,c).hardwareEligible).toBe(true);
});
test('real HTTP adapter agrees with simulator under identical selected mapping',async()=>{
  const c=copy();c.mapping.direction=-1;c.mapping.servoZeroDeg=180;
  const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:r=>handleRequest(r,c)});
  try {for(const q of [1,2.25,3.5,4.75,6]) {
    const response=await fetch(`${server.url}v1/command?flowLMin=${q}&sequence=0`);
    expect(response.status).toBe(200);expect(await response.json()).toEqual(simulationCommand(q,c));
  }} finally{server.stop(true);}
});
test('HTTP rejects permissive parseFloat strings and retires old numeric-only protocol',()=>{
  for(const q of ['NaN','Infinity','1abc','1e309','-1','',' 2','1,5'])expect(handleRequest(new Request(`http://test/v1/command?flowLMin=${encodeURIComponent(q)}&sequence=0`)).status).toBe(400);
  expect(handleRequest(new Request('http://test/v1/command?flowLMin=2&flowLMin=3&sequence=0')).status).toBe(400);
  expect(handleRequest(new Request('http://test/v1/command?flowLMin=7&sequence=0')).status).toBe(422);
  expect(handleRequest(new Request('http://test/a/2')).status).toBe(410);
  expect(handleRequest(new Request('http://test/v1/command?flowLMin=2&sequence=0',{method:'POST'})).status).toBe(405);
});
