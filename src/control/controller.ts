/** Fixed zero-order Sugeno-style schedule; no learning or optimization. */
export type Disposition = 'in-range' | 'clamped-low' | 'clamped-high';
export interface PitchMapping {
  id: string;
  servoZeroDeg: number;
  direction: 1 | -1;
  pitchPerServoDeg: number;
  servoMinDeg: number;
  servoMaxDeg: number;
  calibrationStatus: 'unverified' | 'bench-reviewed';
  calibrationRecordId: string | null;
}
export interface ControllerConfig {
  schemaVersion: 'taph.controller.v1';
  id: string;
  flowKnotsLMin: [number, number, number];
  pitchConsequentsDeg: [number, number, number];
  pitchMinDeg: number;
  pitchMaxDeg: number;
  pitchResolutionDeg: number;
  outOfRange: 'reject' | 'clamp';
  mapping: PitchMapping;
  deploymentReviewId: string | null;
}
export interface Command {
  schemaVersion: 'taph.command.v1'; sequence: number;
  controllerId: string; mappingId: string; flowLMin: number;
  requestedPitchDeg: number; servoCommandDeg: number;
  hardwareEligible: boolean; calibrationStatus: PitchMapping['calibrationStatus'];
  inputDisposition: Disposition;
}
export const identityExample: ControllerConfig = {
  schemaVersion: 'taph.controller.v1', id: 'increasing-pitch-v1',
  flowKnotsLMin: [1, 3.5, 6], pitchConsequentsDeg: [10, 40, 75],
  pitchMinDeg: 10, pitchMaxDeg: 75, pitchResolutionDeg: 1, outOfRange: 'reject',
  mapping: { id: 'identity-example-unverified', servoZeroDeg: 0, direction: 1,
    pitchPerServoDeg: 1, servoMinDeg: 0, servoMaxDeg: 180,
    calibrationStatus: 'unverified', calibrationRecordId: null },
  deploymentReviewId: null,
};
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const id = (x: unknown): x is string => typeof x === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(x);
function assert(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function exactKeys(x: object, keys: string[]): void {
  assert(Object.keys(x).length === keys.length && Object.keys(x).every(k => keys.includes(k)), 'unexpected or missing configuration field');
}
export function validateConfig(value: unknown): asserts value is ControllerConfig {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), 'configuration must be an object');
  exactKeys(value, ['schemaVersion','id','flowKnotsLMin','pitchConsequentsDeg','pitchMinDeg','pitchMaxDeg','pitchResolutionDeg','outOfRange','mapping','deploymentReviewId']);
  const c = value as ControllerConfig;
  assert(c.schemaVersion === 'taph.controller.v1' && id(c.id), 'invalid controller identity');
  assert(Array.isArray(c.flowKnotsLMin) && c.flowKnotsLMin.length === 3 && c.flowKnotsLMin.every(finite), 'three finite flow knots required');
  const [lo, mid, hi] = c.flowKnotsLMin;
  assert(lo >= 0 && lo < mid && mid < hi, 'flow knots must increase');
  assert(Array.isArray(c.pitchConsequentsDeg) && c.pitchConsequentsDeg.length === 3 && c.pitchConsequentsDeg.every(finite), 'three finite pitch consequents required');
  assert(finite(c.pitchMinDeg) && finite(c.pitchMaxDeg) && c.pitchMinDeg < c.pitchMaxDeg, 'invalid physical pitch limits');
  const [a,b,d] = c.pitchConsequentsDeg;
  assert(c.pitchMinDeg <= a && a <= b && b <= d && d <= c.pitchMaxDeg && a < d, 'physical pitch rules must be nondecreasing within limits');
  assert(finite(c.pitchResolutionDeg) && c.pitchResolutionDeg > 0 && c.pitchResolutionDeg <= c.pitchMaxDeg - c.pitchMinDeg, 'invalid pitch resolution');
  assert([c.pitchMinDeg,c.pitchMaxDeg].every(p => Number.isFinite(p/c.pitchResolutionDeg)), 'pitch resolution is not numerically representable');
  assert(c.outOfRange === 'reject' || c.outOfRange === 'clamp', 'invalid range policy');
  const m = c.mapping;
  assert(m && typeof m === 'object' && !Array.isArray(m), 'mapping required');
  exactKeys(m, ['id','servoZeroDeg','direction','pitchPerServoDeg','servoMinDeg','servoMaxDeg','calibrationStatus','calibrationRecordId']);
  assert(id(m.id) && finite(m.servoZeroDeg) && (m.direction === 1 || m.direction === -1), 'invalid mapping coordinate');
  assert(finite(m.pitchPerServoDeg) && m.pitchPerServoDeg > 0, 'positive mapping scale required');
  assert(finite(m.servoMinDeg) && finite(m.servoMaxDeg) && 0 <= m.servoMinDeg && m.servoMinDeg < m.servoMaxDeg && m.servoMaxDeg <= 180, 'invalid servo limits');
  assert(m.calibrationStatus === 'unverified' || m.calibrationStatus === 'bench-reviewed', 'invalid calibration status');
  assert(m.calibrationRecordId === null || id(m.calibrationRecordId), 'invalid calibration record');
  assert(c.deploymentReviewId === null || id(c.deploymentReviewId), 'invalid deployment review');
  assert(m.calibrationStatus !== 'bench-reviewed' || m.calibrationRecordId !== null, 'reviewed mapping requires a record id');
  for (const pitch of [c.pitchMinDeg, c.pitchMaxDeg]) {
    const servo = m.servoZeroDeg + m.direction * pitch / m.pitchPerServoDeg;
    assert(finite(servo) && servo >= m.servoMinDeg && servo <= m.servoMaxDeg, 'mapping cannot reach requested pitch limits');
  }
}
export function pitchToServo(pitchDeg: number, m: PitchMapping): number {
  if (!finite(pitchDeg)) throw new Error('pitch must be finite');
  const command = m.servoZeroDeg + m.direction * pitchDeg / m.pitchPerServoDeg;
  if (!finite(command) || command < m.servoMinDeg || command > m.servoMaxDeg) throw new Error('servo command outside configured limits');
  return command;
}
export function servoToPitch(servoDeg: number, m: PitchMapping): number {
  if (!finite(servoDeg) || servoDeg < m.servoMinDeg || servoDeg > m.servoMaxDeg) throw new Error('invalid servo command');
  return m.direction * (servoDeg - m.servoZeroDeg) * m.pitchPerServoDeg;
}
export function memberships(flow: number, knots: [number,number,number]): { low: number; medium: number; high: number } {
  const [lo,mid,hi] = knots;
  if (!finite(flow) || flow < lo || flow > hi || !(lo < mid && mid < hi)) throw new Error('membership input outside validated domain');
  const low = flow <= mid ? (mid-flow)/(mid-lo) : 0;
  const high = flow >= mid ? (flow-mid)/(hi-mid) : 0;
  return { low, medium: 1-low-high, high };
}
export function commandForFlow(flowLMin: number, sequence = 0, c: ControllerConfig = identityExample): Command {
  validateConfig(c);
  if (!finite(flowLMin) || flowLMin < 0) throw new Error('flow must be finite and nonnegative');
  if (!Number.isInteger(sequence) || sequence < 0 || sequence > 0xffffffff) throw new Error('sequence must be uint32');
  const [lo,,hi] = c.flowKnotsLMin;
  const disposition: Disposition = flowLMin < lo ? 'clamped-low' : flowLMin > hi ? 'clamped-high' : 'in-range';
  if (disposition !== 'in-range' && c.outOfRange === 'reject') throw new RangeError('flow outside configured operating range');
  const q = Math.max(lo,Math.min(hi,flowLMin));
  const u = memberships(q,c.flowKnotsLMin);
  const [low,medium,high] = c.pitchConsequentsDeg;
  const raw = (u.low*low + u.medium*medium + u.high*high)/(u.low+u.medium+u.high);
  const rounded = Math.round(raw/c.pitchResolutionDeg)*c.pitchResolutionDeg;
  assert(finite(raw) && finite(rounded), 'nonfinite pitch inference');
  const requestedPitchDeg = Math.max(c.pitchMinDeg,Math.min(c.pitchMaxDeg,rounded));
  return { schemaVersion: 'taph.command.v1', sequence, controllerId:c.id, mappingId:c.mapping.id, flowLMin,
    requestedPitchDeg, servoCommandDeg:pitchToServo(requestedPitchDeg,c.mapping),
    hardwareEligible: c.mapping.calibrationStatus === 'bench-reviewed' && c.mapping.calibrationRecordId !== null && c.deploymentReviewId !== null,
    calibrationStatus:c.mapping.calibrationStatus, inputDisposition:disposition };
}
