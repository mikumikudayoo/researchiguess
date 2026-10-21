#!/usr/bin/env bash
# Compile only. No upload, board discovery, monitor, or physical-device operation.
set -euo pipefail
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cli=("${ARDUINO_CLI:-arduino-cli}")
if [[ -n "${TAPH_ARDUINO_CONFIG_FILE:-}" ]]; then
  cli+=(--config-file "$TAPH_ARDUINO_CONFIG_FILE")
fi
# A known compatibility target, not an assertion about the project's actual board.
fqbn=esp32:esp32:esp32
cli_version=1.3.1
core_version=3.3.0
servo_version=3.0.9
"${cli[@]}" version --format json | python3 -c \
  'import json,sys; v=json.load(sys.stdin); assert v["VersionString"] == sys.argv[1], v; print(v)' "$cli_version"
"${cli[@]}" core list --format json | python3 -c \
  'import json,sys; v=json.load(sys.stdin); assert any(p["id"] == "esp32:esp32" and p["installed_version"] == sys.argv[1] for p in v["platforms"]), "required core missing"; print("esp32:esp32@"+sys.argv[1])' "$core_version"
servo_library=$("${cli[@]}" lib list --format json | python3 -c \
  'import json,sys; v=json.load(sys.stdin); matches=[p["library"] for p in v["installed_libraries"] if p["library"]["name"] == "ESP32Servo" and p["library"]["version"] == sys.argv[1]]; assert len(matches) == 1, v; print(matches[0]["install_dir"])' "$servo_version")
printf 'explicit ESP32Servo %s library: %s\n' "$servo_version" "$servo_library"
build_root=$(mktemp -d "${TMPDIR:-/tmp}/taph-esp32-compile.XXXXXX")
trap 'rm -rf "$build_root"' EXIT
sketch="$build_root/taph_reliability"
mkdir "$sketch"
# Deliberately copy only reviewed public sources. An ambient private config is
# neither read nor overwritten and cannot shadow the compile-only fixture.
cp "$repo_root/firmware/esp32/taph_reliability/taph_reliability.ino" "$sketch/"
printf 'compile target: %s; default-disabled; no extra build flags\n' "$fqbn"
"${cli[@]}" compile --fqbn "$fqbn" --warnings all --jobs 2 --verbose \
  --library "$repo_root/firmware/core" --library "$servo_library" --build-path "$build_root/disabled" "$sketch"
# This fixture keeps invalid pins, false review flags, empty credentials/records,
# and hardwareEnabled=false. The operational translation unit is still compiled.
cp "$repo_root/firmware/esp32/taph_reliability/local_config.example.hpp" "$sketch/local_config.hpp"
printf 'compile target: %s; operational-path; compiler.cpp.extra_flags=-DTAPH_ENABLE_HARDWARE=1\n' "$fqbn"
"${cli[@]}" compile --fqbn "$fqbn" --warnings all --jobs 2 --verbose \
  --library "$repo_root/firmware/core" --library "$servo_library" --build-path "$build_root/operational" \
  --build-property compiler.cpp.extra_flags=-DTAPH_ENABLE_HARDWARE=1 "$sketch"
printf 'both real ESP32 compile-only configurations passed; no deployment or physical validation performed\n'
