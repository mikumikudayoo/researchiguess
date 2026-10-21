/** An assumed input-output illustration, not a calibrated turbine or energy model. */
export interface ModelConfig {
  schemaVersion: 'taph.model-config.v1';
  id: string;
  modelVersion: 'illustrative-plant-v2';
  rpmPerLMin: number;
  rpmTimeConstantS: number;
  voltsPerRpm: number;
  internalResistanceOhm: number;
  loadResistanceOhm: number;
  assumedPeakPitchDeg: number;
  pitchWidthDeg: number;
  speedMultiplierDrop: number;
  pitchMinDeg: number;
  pitchMaxDeg: number;
  flowMaxLMin: number;
}
export const exampleModel: ModelConfig = {
  schemaVersion: 'taph.model-config.v1', id: 'assumed-plant-v2', modelVersion: 'illustrative-plant-v2',
  rpmPerLMin: 120, rpmTimeConstantS: 3, voltsPerRpm: 0.015,
  internalResistanceOhm: 1, loadResistanceOhm: 10,
  assumedPeakPitchDeg: 42, pitchWidthDeg: 35, speedMultiplierDrop: 0.45,
  pitchMinDeg: 5, pitchMaxDeg: 75, flowMaxLMin: 6,
};
export function finiteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be finite`);
}
export function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(value);
}
export function exactObject(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).length !== keys.length || Object.keys(value).some(k => !keys.includes(k)))
    throw new Error('unexpected or missing configuration field');
}
export function validateModelConfig(value: unknown): asserts value is ModelConfig {
  exactObject(value, ['schemaVersion','id','modelVersion','rpmPerLMin','rpmTimeConstantS','voltsPerRpm',
    'internalResistanceOhm','loadResistanceOhm','assumedPeakPitchDeg','pitchWidthDeg','speedMultiplierDrop',
    'pitchMinDeg','pitchMaxDeg','flowMaxLMin']);
  const c = value as unknown as ModelConfig;
  if (c.schemaVersion !== 'taph.model-config.v1' || c.modelVersion !== 'illustrative-plant-v2' || !validId(c.id))
    throw new Error('invalid model identity/version');
  for (const [key,v] of Object.entries(c)) if (!['schemaVersion','id','modelVersion'].includes(key)) finiteNumber(v,key);
  if (c.rpmPerLMin < 0 || c.rpmTimeConstantS <= 0 || c.voltsPerRpm < 0 ||
      c.internalResistanceOhm < 0 || c.loadResistanceOhm <= 0 || c.pitchWidthDeg <= 0 ||
      c.speedMultiplierDrop < 0 || c.speedMultiplierDrop >= 1 || c.flowMaxLMin <= 0 ||
      c.pitchMinDeg >= c.pitchMaxDeg || c.assumedPeakPitchDeg < c.pitchMinDeg || c.assumedPeakPitchDeg > c.pitchMaxDeg)
    throw new Error('invalid model coefficient or operating bound');
  for (const x of [c.internalResistanceOhm+c.loadResistanceOhm, c.flowMaxLMin*c.rpmPerLMin,
    c.voltsPerRpm*c.flowMaxLMin*c.rpmPerLMin, c.pitchMaxDeg-c.pitchMinDeg]) finiteNumber(x,'derived model bound');
  electricalOutput(c.flowMaxLMin*c.rpmPerLMin, c);
}
export function assertOperatingPoint(flowLMin: number, pitchDeg: number, c: ModelConfig): void {
  finiteNumber(flowLMin,'flow'); finiteNumber(pitchDeg,'pitch');
  if (flowLMin < 0 || flowLMin > c.flowMaxLMin || pitchDeg < c.pitchMinDeg || pitchDeg > c.pitchMaxDeg)
    throw new RangeError('input outside illustrative model operating bounds');
}
/** Dimensionless assumed speed multiplier; it is NOT hydraulic efficiency. */
export function assumedSpeedMultiplier(pitchDeg: number, c: ModelConfig = exampleModel): number {
  validateModelConfig(c);
  assertOperatingPoint(0,pitchDeg,c);
  return 1-c.speedMultiplierDrop*Math.min(Math.abs(pitchDeg-c.assumedPeakPitchDeg)/c.pitchWidthDeg,1);
}
export function targetRpm(flowLMin: number, pitchDeg: number, c: ModelConfig = exampleModel): number {
  validateModelConfig(c);
  assertOperatingPoint(flowLMin,pitchDeg,c);
  return flowLMin*c.rpmPerLMin*assumedSpeedMultiplier(pitchDeg,c);
}
/** Exact constant-target first-order integration over one interval; no Euler approximation. */
export function updateRpmExact(rpm: number, target: number, dtS: number, tauS: number): number {
  for (const [key,v] of Object.entries({rpm,target,dtS,tauS})) finiteNumber(v,key);
  if (rpm < 0 || target < 0 || dtS <= 0 || tauS <= 0) throw new Error('invalid integration input');
  return rpm+(target-rpm)*(-Math.expm1(-dtS/tauS));
}
export interface ElectricalOutput {
  emfV: number; voltageV: number; currentA: number; pLoadW: number;
  internalCopperLossW: number; emfPowerW: number; hydraulicEfficiency: null;
}
/** Thevenin electrical boundary: E=kn, I=E/(Ri+RL), V=IRL, PL=VI. */
export function electricalOutput(rpm: number, c: ModelConfig = exampleModel): ElectricalOutput {
  finiteNumber(rpm,'rpm');
  for (const [key,v] of Object.entries({k:c.voltsPerRpm,ri:c.internalResistanceOhm,rl:c.loadResistanceOhm})) finiteNumber(v,key);
  if (rpm < 0 || c.voltsPerRpm < 0 || c.internalResistanceOhm < 0 || c.loadResistanceOhm <= 0) throw new Error('invalid electrical input');
  finiteNumber(c.internalResistanceOhm+c.loadResistanceOhm,'total resistance');
  const emfV = rpm*c.voltsPerRpm;
  const currentA = emfV/(c.internalResistanceOhm+c.loadResistanceOhm);
  const voltageV = currentA*c.loadResistanceOhm;
  const out = {emfV,voltageV,currentA,pLoadW:voltageV*currentA,
    internalCopperLossW:currentA*currentA*c.internalResistanceOhm,emfPowerW:emfV*currentA,hydraulicEfficiency:null};
  for (const [key,v] of Object.entries(out)) if (key !== 'hydraulicEfficiency') finiteNumber(v,key);
  return out;
}
