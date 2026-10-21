# physical-pitch specification v1

researcher decision (21 october 2026): intended physical blade pitch increases monotonically with volumetric flow. this resolves future direction only; it does not establish historical deployment, optimality or calibration (F05, F13, F14).

physical pitch is a **geometric chord-line angle in degrees at a documented reference radius relative to a fixed runner datum**. the team must mark the datum, radius and positive rotation on an as-built drawing. this coordinate is not blade angle of attack (which depends on relative water velocity), servo shaft rotation or a servo command. no as-built zero is known yet.

`increasing-pitch-v1` adopts the historical server's increasing singleton values as an initial *physical-pitch schedule*: low/medium/high flows at 1/3.5/6 L/min map to 10/40/75 degrees. this follows the intended direction, not evidence that the angles are optimal. overlapping shoulder/triangle memberships sum to one. output is membership-weighted constant consequents (zero-order Sugeno-style inference), rounded to configurable pitch resolution, then limited to the declared physical-pitch range. no training, adaptation, rpm feedback or power optimization occurs.

## explicit mapping

```
servo_command_deg = servo_zero_deg + direction * requested_pitch_deg / pitch_per_servo_deg
physical_pitch_deg = direction * (servo_command_deg - servo_zero_deg) * pitch_per_servo_deg
```

`direction` is +1 or -1; scale is positive. `servo_zero_deg` is the modeled servo command corresponding to physical pitch zero. a larger command may mean smaller pitch. the identity example uses zero offset, +1 direction and unit scale and is **unverified**. a reverse-linkage example uses 180-degree offset and -1 direction. all pitch limits must be reachable within the configured servo command limits; unreachable configurations are rejected, never silently clamped into a different physical schedule.

an affine transform is an illustrative approximation, not a claim that the linkage is linear. replace it with measured supported geometry/calibration if needed, retaining explicit versioning. `bench-reviewed` and record IDs are researcher-supplied attestations, not measurements generated or certified by the software. hardware eligibility additionally requires a deployment review ID; defaults are ineligible. firmware must independently enforce local configuration and arming requirements.

## protocol and use

```sh
bun server.ts
# example computation only; default localhost bind and unverified mapping
curl 'http://127.0.0.1:3000/v1/command?flowLMin=2.25&sequence=0'
# explicit JSON configuration: TAPH_CONFIG=config/identity-example.json bun server.ts
```

`GET /v1/command` requires a complete nonnegative decimal flow and uint32 sequence. duplicate, unknown, malformed or non-finite query inputs are rejected. default out-of-range policy is reject (422); explicit `clamp` reports `clamped-low` or `clamped-high`. valid replies contain exactly `schemaVersion`, `sequence`, `controllerId`, `mappingId`, `flowLMin`, `requestedPitchDeg`, `servoCommandDeg`, `hardwareEligible`, `calibrationStatus`, `inputDisposition`. no command is a protective safe-position claim. the old `/a/` route returns 410 rather than silently feeding a changed convention to legacy firmware. archival server/simulator remain separate and unchanged.

`TAPH_HOST` defaults to 127.0.0.1. exposing the server on a reviewed isolated bench network is a separate deployment decision; this protocol has no remote authentication and must not be exposed publicly. no hardware is driven by server tests. the simulator imports the exact same command implementation, with HTTP parity and reverse-linkage tests.
