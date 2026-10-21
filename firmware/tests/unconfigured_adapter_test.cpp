#define TAPH_ENABLE_HARDWARE 1
#define ARDUINO_ARCH_ESP32 1
#include "../esp32/taph_reliability/taph_reliability.ino"
int main() {
  if (guard.config().hardwareEnabled || guard.configured() || adapterConfigurationValid()) return 1;
  setup();
  for (int i=0; i<10; ++i) loop();
  if (hardwareInitialized || mockGpioCalls || mockServoAttach || mockServoWrites ||
      requestQueue || replyQueue) return 1;
  if (Serial.output.find("\"state\":\"unconfigured\"") == std::string::npos) return 1;
  std::cout << "compile-only fixture: invalid configuration and zero GPIO initialization\n";
  return 0;
}
