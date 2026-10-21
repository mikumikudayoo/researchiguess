# Firmware reliability pathway

This milestone addresses software portions of **F09, F10, F11, F14 and F29**. It is not a safety certification, evidence of deployed hardware, calibrated flow/current measurement, overspeed governor, or proof that the turbine works. No physical equipment is energized by the tests.

## Historical boundary and source layout

The original firmware is preserved at immutable commit [`a37d1d5abf4d13d775ae206b4cd1c4c59f0e88ce`](https://github.com/mikumikudayoo/researchiguess/blob/a37d1d5abf4d13d775ae206b4cd1c4c59f0e88ce/sketch_aug3a.ino). Its original behavior included pump-on startup, a zero servo command, fixed 0.5-second pulse conversion, raw ADC readings, acceptance of any positive HTTP code, and retention of the previous command after failures. The root `sketch_aug3a.ino` is now a compile-stopping pointer to the new sketch. Its old credentials are absent from the current source tree; history is not rewritten. If any historical credential remains in use, replace it locally before a bench test.

| Path | Responsibility |
|---|---|
| `firmware/core/src/taph_core.hpp` | Portable C++17 pulse conversion, strict v1 message parser, configuration validation, freshness/arming state machine, and output intent |
| `firmware/esp32/taph_reliability/taph_reliability.ino` | ESP32 adapter; completely disabled by default |
| `firmware/esp32/taph_reliability/local_config.example.hpp` | Intentionally incomplete configuration template; no working credentials or invented calibration |
| `firmware/tests/core_test.cpp` | Host tests of computation, response faults, configuration and state transitions |
| `firmware/tests/disabled_adapter_test.cpp` | Compiles and runs the actual default sketch with fake Arduino APIs; checks no GPIO initialization |
| `firmware/tests/enabled_adapter_test.cpp` | Compiles and executes the operational adapter against fake GPIO, network, clocks, queues and servo APIs |
| `firmware/tests/unconfigured_adapter_test.cpp` | Runs the operational adapter with invalid public example settings and checks zero GPIO initialization |
| `scripts/compile-esp32.sh` | Real pinned ESP32 compiler check of both paths with temporary nondeployable configuration |
| `tests/firmware.test.ts` | Bun runner compiling C++ tests into a temporary directory with `g++`, then cleaning it |

`badapple.ino` is an unrelated display/LittleFS demo and remains unchanged. Its absent `/bad_apple.bin`, unchecked short frame reads and `LittleFS.begin(true)` formatting-on-mount-failure behavior are not turbine control or research measurements. Do not compile both sketches together: they have duplicate `setup`, `loop` and display declarations. The repository root is not an Arduino sketch target.

## Default state and deployment gates

The default sketch sets `TAPH_ENABLE_HARDWARE=0`. It initializes only serial status reporting and calls no sensor, Wi-Fi, servo, relay or GPIO setup. It cannot arm or start the pump. This does **not** assert that an attached but unconfigured circuit is electrically safe: disconnect actuator/pump power and use a separately reviewed external interlock. Floating pins, relay modules, bootstrapping pins and power-up transients are hardware properties.

The operational build additionally requires all of the following. The flags record **researcher assertions and record identifiers**, not facts independently verified by software:

- A private `local_config.hpp`, explicitly enabled hardware configuration and local bench-review record.
- Actual ESP32 model, GPIO capabilities, sensor voltage compatibility, pin uniqueness, power wiring and reviewed input pull-up choice. The source checks valid GPIO/output capabilities; it cannot establish ADC suitability or correct wiring.
- Measured flow pulse-frequency coefficient and record ID; a justified pulse debounce interval and operating range. The legacy divisor 7.5 is not supplied as a default calibration.
- Physical pitch reference, mechanical direction, allowed travel, measured command-to-pitch mapping and mapping record ID.
- Matching server controller/mapping IDs and the corresponding server deployment-review record ID. The ten-field wire response does not carry all record IDs; review both configuration files and their records together.
- Reviewed relay inactive level, servo pulse-width range and external shutdown behavior. No relay polarity is assumed. Startup writes the reviewed inactive latch before switching the relay pin to output.
- A reviewed servo-attachment transient. ESP32Servo can emit a library-defined pulse between attaching PWM and writing the first requested pulse. Verify this with actuator power isolated before enabling physical motion.
- An explicit fault policy: remove servo PWM, or command a separately reviewed position. Neither is declared physically safe by the software. Removing PWM may release or retain mechanical force depending on the actuator. A reviewed command may require continued electrical power. A failed PWM attachment latches a software actuator fault and prevents pump-on; successful attachment still does not establish actual blade motion. External power isolation is still required.
- An isolated reviewed bench network. This adapter uses plain HTTP with sequence/freshness checks, **not cryptographic authentication**. It is not suitable for an untrusted or publicly reachable network.

The local example has invalid pins and incomplete calibration/limits and therefore cannot pass these gates. No complete deployable hardware configuration is committed.

## Coordinates and wire protocol

Requested **physical pitch** and **servo command** are different fields. The fixed controller specification in phase 2 rounds requested physical pitch to its configured resolution, then performs the affine coordinate conversion without final servo-angle rounding:

```
servoCommandDeg = servoZeroDeg + direction * requestedPitchDeg / pitchPerServoDeg
```

Set the local guard's `servoOffsetDeg = servoZeroDeg` and `servoDegreesPerPitchDegree = direction / pitchPerServoDeg`. A negative local slope is legitimate for a reversed linkage: increasing requested physical pitch can require decreasing servo command. It does not reverse the authoritative requirement that intended physical pitch increases with flow. The guard checks the numeric transform and limits; it cannot measure actual pitch, backlash or angle of attack.

The adapter requests `GET /v1/command?flowLMin=<decimal>&sequence=<uint32>`. Requests are sent at most once per new pulse window. Flow is rounded to nine decimal places for transport; this is serialization precision, not sensor accuracy. A successful response has exactly ten fields:

```
schemaVersion, sequence, controllerId, mappingId, flowLMin,
requestedPitchDeg, servoCommandDeg, hardwareEligible,
calibrationStatus, inputDisposition
```

The host-tested flat JSON parser accepts this bounded protocol and rejects missing, duplicate or unknown fields; incorrect types; nonfinite or malformed numeric values; overlong bodies/strings; trailing data; nested structures; escaped/non-ASCII strings; and unsupported schema versions. Server IDs use an ASCII identifier alphabet, so escaped strings are unnecessary. A new response schema requires an explicit firmware parser change.

Actuation additionally requires HTTP **200**, exact sequence/controller/mapping identity, matching echoed flow, `hardwareEligible=true`, `calibrationStatus="bench-reviewed"`, `inputDisposition="in-range"`, fresh local sensor/request/command timestamps, and matching affine conversion within configured pitch/servo travel. The server's unverified identity example is intentionally refused. The server can optionally clamp out-of-range input; this hardware adapter deliberately refuses clamped responses and faults on out-of-range measured flow. It never silently clamps an unsafe command into a plausible command.

The ESP32 network task has explicit connection/read timeouts, a 1024-byte body cap, required positive bounded Content-Length, and a JSON Content-Type check. Chunked/unknown-length replies are refused. A single request and reply queue prevent unlimited backlog. The main loop continues checking deadlines while the network worker waits; a late reply cannot restore a latched fault. These checks do not establish a measured real-time deadline or authenticated server identity.

## Acquisition and telemetry

The ISR counts falling edges, records overflow and applies only the explicitly configured pulse-spacing filter. Pulse snapshot/reset occurs under an ESP32 spinlock. Serial output, ADC reads and HTTP are outside the critical section. Flow uses the **actual measured interval**:

```
estimatedFlowLMin = pulseCount * 1_000_000 / elapsedWindowUs / pulseHzPerLMin
```

Unsigned clock subtraction supports a timer wrap for bounded intervals; all accepted intervals are below half the 32-bit range. Zero-length, excessive or overflowed pulse windows are invalid. A fresh zero-pulse window means an observed zero pulse rate. It does not prove that a sensor is disconnected; the adapter refuses operation below the configured flow range without inventing a diagnosis. Staleness is separately detected when no fresh valid sample arrives.

`rawCurrentAdcCounts` is always distinct from `calibratedCurrentA`. The latter is null unless the local linear ADC-count calibration and record are explicitly reviewed. No ADC resolution, zero offset or sensitivity is silently assumed. Characterize the exact board, attenuation, supply and sensor configuration before using coefficients. Negative calibrated current is retained if supported by a bidirectional sensor; it is not forced positive.

Serial JSON-lines use `taph.telemetry.v1` and `evidenceCategory="unverified-bench-telemetry"`. Records include modulo-32-bit uptime/sample times, raw pulse count and duration, estimated flow and review assertion, raw ADC counts, optional current, configuration IDs, requested physical pitch, servo command and status/fault. Actual pitch, rpm and electrical power are null because those channels are not implemented. This is status/acquisition telemetry, not a complete calibrated experiment schema: capture a separate run manifest with board/build IDs, full configuration, calibration records, host clock, sequence of runs and independent measurements. Preserve raw logs unchanged.

## State and error behavior

| State | Output behavior |
|---|---|
| Disabled / unconfigured | No actuator API calls; no hardware initialization in default build |
| Configured, disarmed startup | Reviewed relay inactive; servo never attached; no automatic pump or startup angle |
| Armed with fresh eligible command | Requested servo command; pump remains off unless a separate local command enables it |
| Latched fault | Pump requests removed; reviewed inactive relay and reviewed servo fault action applied |
| Disarmed after previous actuation | Reviewed fault action; prior command discarded; fresh sensor/response needed before another arm |

Local serial commands are exact complete lines: `ARM`, `DISARM`, `PUMP ON`, `PUMP OFF`. LF and CRLF line endings are accepted; embedded NUL, other control/non-ASCII bytes, misplaced CR and overlong lines invalidate the whole command. Commands are nonblocking to read and report acceptance/rejection. Arming requires a fresh eligible response; it never automatically starts the pump. The separate `PUMP ON` command is accepted only while armed and fresh. A physical priming/flow-establishment procedure is **not** invented: establish it under supervision using the external water supply/pump controls. No automatic retry bypasses a latched fault. `DISARM` clears the latch but requires fresh evidence and a new `ARM` action before motion resumes.

Communication failure, invalid response, unavailable/out-of-range flow, pulse-counter overflow, failed PWM attachment, excessive sampling window, stale request, stale command or stale sensor prevent or interrupt armed operation. `RemovePwm` and `ReviewedCommand` are configurable electrical actions, not claims of overspeed protection. The system has no measured speed input or justified speed limit. A blocked scheduler, power failure or library defect still requires an external interlock; this code is not a certified independent safety controller.

## Verification

With Bun 1.4.3 and a C++17-capable `g++` on the host:

```sh
bun test tests/firmware.test.ts
```

The suite compiles with `-Wall -Wextra -Werror -pedantic`. It covers measured pulse windows, timer rollover, zero/invalid/overflowed windows, calibration boundaries, malformed/truncated/oversized replies, exact HTTP status, identity/sequence/flow mismatches, affine direction, travel limits, stale data, latching/rearming, and fake actuator calls. The enabled-adapter mock runs the actual ISR/snapshot/HTTP-body/servo/pump code with fake APIs. All flags and IDs in those fixtures are explicitly fictitious. No test uploads firmware, opens a serial device or energizes equipment.

A mock build checks software structure and specified behavior. It does not verify ESP32 ABI, FreeRTOS scheduling, IRAM placement, ADC accuracy, PWM startup, network timing, memory margins or real wiring. The separate compile-only fixture regression includes the operational adapter with the incomplete example and checks that it remains unconfigured with no GPIO initialization. Invalid mock GPIO access fails explicitly instead of indexing outside the mock pin array.

### Real ESP32 compile-only verification

The compatibility target is **`esp32:esp32:esp32` (generic ESP32 Dev Module)** with its core-default board options. This is an illustrative compiler target, not identification of the project's physical board.

| Dependency | Pinned version |
|---|---|
| Arduino CLI | 1.3.1 |
| Espressif Arduino core | `esp32:esp32@3.3.0` |
| ESP32Servo | 3.0.9 |
| WiFi, HTTPClient, Network and FreeRTOS/ESP-IDF headers | Supplied with core 3.3.0; no separate override |
| Xtensa toolchain selected by the core | `esp-x32@2411` |
| ESP-IDF Arduino libraries selected by the core | `idf-release_v5.5-b66b5448-v1` |
| Image-generation tool selected by the core | `esptool_py@5.0.0` (image generation only) |

Other platform tools resolve to the exact versions declared by the pinned core package. Python 3 checks installed dependency versions. The script refuses different CLI/core/ESP32Servo versions. Install the official CLI 1.3.1 binary, then run:

```sh
arduino-cli core update-index --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core install esp32:esp32@3.3.0 --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli lib install ESP32Servo@3.0.9
bash scripts/compile-esp32.sh
```

`ARDUINO_CLI` can specify the CLI executable; `TAPH_ARDUINO_CONFIG_FILE` can specify its configuration file. The script copies only the public sketch into a temporary directory, so it never reads or replaces a private `local_config.hpp`. It compiles two separate build directories:

1. **Default-disabled:** no extra build flags or local configuration. The sketch's default `TAPH_ENABLE_HARDWARE=0` remains intact.
2. **Operational code path:** `compiler.cpp.extra_flags=-DTAPH_ENABLE_HARDWARE=1`, with the deliberately incomplete `local_config.example.hpp` copied as the temporary `local_config.hpp`. All review flags remain false, credentials and record IDs empty, pins invalid, and `hardwareEnabled=false`. This compiles the operational code but cannot pass its runtime configuration gate. No approval or physical calibration is invented.

Both use `--warnings all`, `--jobs 2`, `--verbose` (to record selected libraries and compiler commands), `--library firmware/core` and the explicit path of the uniquely matched ESP32Servo 3.0.9 installation. The core supplies the remaining compiler flags and board defaults. No upload command, board discovery or serial connection is used. Temporary binaries are removed when the script exits. The dedicated `esp32-compile-only` GitHub Actions job repeats the process separately from host tests.

**Verification record (2026-10-21):** the complete script exited 0 with the real Linux x86-64 target toolchain. Both configurations compiled and linked without errors; no production firmware source change was required. The compiler selected core-bundled WiFi, Networking, HTTPClient and NetworkClientSecure 3.3.0, ESP32Servo 3.0.9, and the repository's TaphGuard 1.0.0.

| Configuration | Program-storage bytes | Global-variable bytes |
|---|---:|---:|
| Default-disabled | 294,875 | 20,688 |
| Operational path with invalid compile fixture | 936,211 | 44,340 |

These are compiler reports for this fixture, not measured runtime memory use or deployment margins. `--warnings all` reported the existing volatile-counter increment deprecation under the core's C++20 configuration, upstream touch-driver deprecation, and upstream ESP32Servo unused-variable warnings. They did not prevent compilation and are not hidden by a warning-suppression flag. The existing host regressions still compile with warnings treated as errors. CI repeats the real check for each changed revision.

Compilation does not establish wiring, measured pitch, sensor calibration, relay polarity, servo travel, safe failure behavior, actual deadlines, overspeed protection or turbine performance. Supervised bench validation remains outstanding.

Before any physical test, independently identify the true board and review its full build configuration, then verify inactive relay level, PWM attachment/fault transitions, pulse calibration, actual pitch mapping, timeout behavior and external stop procedure with actuator power isolated. Preserve new logs separately from historical evidence.

Pinned upstream sources: [Arduino CLI 1.3.1](https://github.com/arduino/arduino-cli/releases/tag/v1.3.1), [Espressif core 3.3.0](https://github.com/espressif/arduino-esp32/releases/tag/3.3.0), [HTTPClient 3.3.0 interface](https://github.com/espressif/arduino-esp32/blob/3.3.0/libraries/HTTPClient/src/HTTPClient.h), and [ESP32Servo 3.0.9](https://github.com/madhephaestus/ESP32Servo/tree/3.0.9). API reference: [Arduino CLI compile options](https://arduino.github.io/arduino-cli/1.3/commands/arduino-cli_compile/).

## Audit traceability and unresolved evidence

| Finding | Software change | Still unresolved |
|---|---|---|
| F09 | Raw ADC separated from optional calibrated current; structured timestamped telemetry; unimplemented channels explicitly null | Actual sensor calibration, synchronized voltage/rpm/pitch acquisition, historical measurements |
| F10 | Separate explicit ESP32 adapter, board/pin review gates, no mixed Uno/ESP32 construction claim | As-built schematic, board/sensor specifications, electrical compatibility |
| F11 | No automatic pump-on or zero-angle startup; strict HTTP/response/freshness handling; explicit arming and latched faults | Physically justified fault behavior, external interlock, transient/overspeed evidence |
| F14 | Requested physical pitch separated from affine servo command; local mapping/limits checked | Measured linkage direction, pitch zero, travel/backlash, loaded actuation |
| F29 | Actual pulse-window duration; short critical section; counter-overflow/timing checks | Pulse calibration, justified filtering/debounce, uncertainty and low-flow validation |

The firmware improvement does not resolve historical data provenance (F01), physical input power/efficiency (F12), or lifetime/protection claims (F04). The supplied PDFs explicitly retain these boundaries. Their numerical tables and prior outputs were not changed.
