#include <Arduino.h>
#ifndef TAPH_ENABLE_HARDWARE
#define TAPH_ENABLE_HARDWARE 0
#endif

#if !TAPH_ENABLE_HARDWARE
// This build has no servo/relay/network/sensor initialization or GPIO calls.
void setup() {
  Serial.begin(115200);
  Serial.println("{\"schemaVersion\":\"taph.telemetry.v1\",\"state\":\"disabled\",\"hardwareInitialized\":false}");
}
void loop() { delay(25); }
#else
#if !defined(ARDUINO_ARCH_ESP32)
#error "The operational adapter targets a reviewed ESP32 board only."
#endif
#if !__has_include("local_config.hpp")
#error "Operational build requires private local_config.hpp and supervised physical review."
#endif
#include <WiFi.h>
#include <HTTPClient.h>
#include <ESP32Servo.h>
#include <driver/gpio.h>
#include <taph_core.hpp>
#include "local_config.hpp"

using namespace taph;
ControllerGuard guard(bench::makeConfig());
Servo pitchServo;
portMUX_TYPE pulseMux = portMUX_INITIALIZER_UNLOCKED;
volatile uint32_t pulseCount = 0, lastPulseUs = 0;
volatile bool pulseOverflow = false, havePulse = false;
uint32_t lastWindowUs = 0, lastTelemetryMs = 0;
int rawCurrentAdcCounts = 0;
bool hardwareInitialized = false, networkBusy = false;
QueueHandle_t requestQueue = nullptr, replyQueue = nullptr;
struct NetworkReply { int status = 0; std::size_t bodyLength = 0; char body[kMaxResponseBytes+1] = {}; };

struct HardwarePort {
  void pump(bool on) {
    digitalWrite(bench::pumpRelayPin, on ? (bench::pumpInactiveLevel==HIGH?LOW:HIGH) : bench::pumpInactiveLevel);
  }
  void removeServoPwm() { if(pitchServo.attached()) pitchServo.detach(); }
  bool writeServo(double degrees) {
    // Pulse-width conversion retains fractional commands; no implicit integer truncation.
    const int us=static_cast<int>(std::lround(bench::servoMinPulseUs+
      (bench::servoMaxPulseUs-bench::servoMinPulseUs)*degrees/180.0));
    // ESP32Servo may emit a library-defined pulse between attach and this write.
    // The explicit servoAttachTransientReviewed gate requires a bench check with
    // actuator power isolated; software cannot declare that transient physically safe.
    if(!pitchServo.attached()) pitchServo.attach(bench::servoPin,bench::servoMinPulseUs,bench::servoMaxPulseUs);
    if(!pitchServo.attached()) return false;
    pitchServo.writeMicroseconds(us);
    return true;
  }
} hardware;

void IRAM_ATTR countPulse() {
  const uint32_t now=micros();
  portENTER_CRITICAL_ISR(&pulseMux);
  if(!havePulse || static_cast<uint32_t>(now-lastPulseUs)>=bench::minimumPulseIntervalUs) {
    if(pulseCount==UINT32_MAX) pulseOverflow=true; else ++pulseCount;
    lastPulseUs=now; havePulse=true;
  }
  portEXIT_CRITICAL_ISR(&pulseMux);
}

bool adapterConfigurationValid() {
  const int pins[]{bench::flowPin,bench::currentAdcPin,bench::servoPin,bench::pumpRelayPin};
  for(int i=0;i<4;++i) { if(!GPIO_IS_VALID_GPIO(pins[i])) return false; for(int j=0;j<i;++j) if(pins[i]==pins[j]) return false; }
  const auto& c=guard.config();
  return guard.configured() && bench::electricalConfigurationReviewed && bench::externalShutdownReviewed &&
    bench::networkIsolationReviewed && bench::inputPullupReviewed && bench::servoAttachTransientReviewed &&
    GPIO_IS_VALID_OUTPUT_GPIO(bench::servoPin) && GPIO_IS_VALID_OUTPUT_GPIO(bench::pumpRelayPin) &&
    (bench::pumpInactiveLevel==LOW || bench::pumpInactiveLevel==HIGH) &&
    bench::servoMinPulseUs>=500 && bench::servoMaxPulseUs<=2500 && bench::servoMinPulseUs<bench::servoMaxPulseUs &&
    bench::minimumPulseIntervalUs<kHalfClockRange && c.requestTimeoutMs<=60000 &&
    String(bench::wifiSsid).length()>0 && String(bench::wifiPassword).length()>=8 &&
    String(bench::commandBaseUrl).startsWith("http://") &&
    (!bench::currentCalibrationReviewed || (identifier(bench::currentCalibrationRecordId) &&
      taph::finite(bench::currentZeroAdcCounts) && taph::finite(bench::currentAmpsPerAdcCount) && bench::currentAmpsPerAdcCount!=0));
}

// Network blocking is isolated in a worker. The main loop continues freshness/fault checks.
// This is not a certified real-time guarantee; worker/socket/scheduler behavior needs bench testing.
void networkWorker(void*) {
  Request request;
  for(;;) {
    if(xQueueReceive(requestQueue,&request,portMAX_DELAY)!=pdTRUE) continue;
    NetworkReply reply;
    if(WiFi.status()==WL_CONNECTED) {
      HTTPClient http;
      const String url=String(bench::commandBaseUrl)+"/v1/command?flowLMin="+String(request.flowLMin,9)+"&sequence="+String(request.sequence);
      http.setConnectTimeout(static_cast<int32_t>(guard.config().requestTimeoutMs));
      http.setTimeout(static_cast<uint16_t>(guard.config().requestTimeoutMs));
      const char* headers[]{"Content-Type"};
      http.collectHeaders(headers,1);
      if(http.begin(url)) {
        reply.status=http.GET();
        const int length=http.getSize();
        const String contentType=http.header("Content-Type");
        // The v1 server emits a bounded Content-Length. Chunked/unknown bodies are rejected.
        if(reply.status==200 && length>0 && length<=static_cast<int>(kMaxResponseBytes) && (contentType=="application/json" || contentType.startsWith("application/json;"))) {
          auto* stream=http.getStreamPtr(); int used=0;
          while(used<length && elapsed(millis(),request.sentAtMs)<=guard.config().requestTimeoutMs) {
            if(stream->available()) { const int ch=stream->read(); if(ch<0) break; reply.body[used++]=static_cast<char>(ch); }
            else if(!http.connected()) break;
            else vTaskDelay(pdMS_TO_TICKS(1));
          }
          if(used==length) {reply.body[used]='\0';reply.bodyLength=static_cast<std::size_t>(used);}
        }
        http.end();
      }
    }
    // One in-flight request, one reply slot: no unbounded queue growth.
    xQueueSend(replyQueue,&reply,portMAX_DELAY);
  }
}

void sampleInputs(uint32_t nowMs) {
  uint32_t count, windowNow; bool overflow;
  // Only snapshot/reset bookkeeping under the lock. No Serial, ADC or network I/O.
  portENTER_CRITICAL(&pulseMux);
  windowNow=micros(); count=pulseCount; overflow=pulseOverflow;
  pulseCount=0; pulseOverflow=false;
  portEXIT_CRITICAL(&pulseMux);
  const auto& c=guard.config();
  const auto sample=convertFlow(count,elapsed(windowNow,lastWindowUs),nowMs,overflow,c.pulseHzPerLMin,c.flowCalibrationReviewed,c.maxWindowUs);
  lastWindowUs=windowNow;
  guard.sample(sample);
  rawCurrentAdcCounts=analogRead(bench::currentAdcPin);
}

void emitTelemetry(uint32_t now) {
  const auto& f=guard.flow(); const auto& c=guard.config();
  const auto current=currentFromRaw(rawCurrentAdcCounts,bench::currentCalibrationReviewed,bench::currentZeroAdcCounts,bench::currentAmpsPerAdcCount);
  Serial.print("{\"schemaVersion\":\"taph.telemetry.v1\",\"evidenceCategory\":\"unverified-bench-telemetry\",\"uptimeMsModulo32\":"); Serial.print(now);
  Serial.print(",\"state\":\"");Serial.print(name(guard.state()));Serial.print("\",\"fault\":\"");Serial.print(name(guard.fault()));
  Serial.print("\",\"localReviewId\":\"");Serial.print(c.localReviewId.c_str());Serial.print("\",\"flowCalibrationRecordId\":\"");Serial.print(c.flowCalibrationRecordId.c_str());
  Serial.print("\",\"controllerId\":\"");Serial.print(c.controllerId.c_str());Serial.print("\",\"mappingId\":\"");Serial.print(c.mappingId.c_str());Serial.print("\"");
  Serial.print(",\"flowPulseCount\":");Serial.print(f.pulses);Serial.print(",\"flowWindowUs\":");Serial.print(f.elapsedUs);
  Serial.print(",\"flowSampleAtMsModulo32\":");Serial.print(f.capturedAtMs);Serial.print(",\"flowSampleValid\":");Serial.print(f.valid?"true":"false");
  Serial.print(",\"estimatedFlowLMin\":");if(f.valid) Serial.print(f.estimatedLMin,9); else Serial.print("null");
  Serial.print(",\"flowCalibrationReviewedAssertion\":");Serial.print(f.calibrationReviewed?"true":"false");
  Serial.print(",\"rawCurrentAdcCounts\":");Serial.print(rawCurrentAdcCounts);Serial.print(",\"calibratedCurrentA\":");if(current.calibrated) Serial.print(current.amperes,9); else Serial.print("null");
  Serial.print(",\"currentCalibrationRecordId\":"); if(current.calibrated) {Serial.print("\"");Serial.print(bench::currentCalibrationRecordId);Serial.print("\"");}else Serial.print("null");
  Serial.print(",\"commandAvailable\":");Serial.print(guard.commandAvailable()?"true":"false");
  Serial.print(",\"requestedPhysicalPitchDeg\":");if(guard.commandAvailable())Serial.print(guard.command().requestedPitchDeg,9);else Serial.print("null");
  Serial.print(",\"servoCommandDeg\":");if(guard.commandAvailable())Serial.print(guard.command().servoCommandDeg,9);else Serial.print("null");
  Serial.println(",\"actualPitchDeg\":null,\"rpm\":null,\"electricalPowerW\":null}");
}

void localConsole(uint32_t now) {
  static char line[24] = {}; static unsigned used=0; static bool invalidLine=false, sawCarriageReturn=false;
  // Never block waiting for a line; cap bytes processed per loop.
  for(int i=0;i<32 && Serial.available();++i) {
    const char ch=static_cast<char>(Serial.read());
    if(ch=='\n') {
      line[used]='\0';
      bool accepted=false;
      if(!invalidLine) {
        const String command(line);
        if(command=="ARM") accepted=guard.arm(now);
        else if(command=="DISARM") {guard.disarm();accepted=true;}
        else if(command=="PUMP ON") accepted=guard.requestPump(true,now);
        else if(command=="PUMP OFF") accepted=guard.requestPump(false,now);
      }
      Serial.println(accepted?"{\"event\":\"local-command\",\"accepted\":true}":"{\"event\":\"local-command\",\"accepted\":false}");
      used=0;invalidLine=false;sawCarriageReturn=false;
    } else if(ch=='\r') {
      if(sawCarriageReturn) invalidLine=true;
      sawCarriageReturn=true;
    } else {
      const auto byte=static_cast<unsigned char>(ch);
      if(sawCarriageReturn || byte<32 || byte>126) invalidLine=true;
      if(used<sizeof(line)-1) line[used++]=ch; else invalidLine=true;
    }
  }
}

void setup() {
  Serial.begin(115200);
  if(!adapterConfigurationValid()) {Serial.println("{\"state\":\"unconfigured\",\"hardwareInitialized\":false}");return;}
  requestQueue=xQueueCreate(1,sizeof(Request)); replyQueue=xQueueCreate(1,sizeof(NetworkReply));
  if(!requestQueue || !replyQueue) {Serial.println("{\"state\":\"unconfigured\",\"fault\":\"queue-allocation\"}");return;}
  // Reviewed inactive level first, then output mode. External power isolation is still required.
  digitalWrite(bench::pumpRelayPin,bench::pumpInactiveLevel);pinMode(bench::pumpRelayPin,OUTPUT);
  pinMode(bench::flowPin,INPUT_PULLUP);pinMode(bench::currentAdcPin,INPUT);
  lastWindowUs=micros();attachInterrupt(digitalPinToInterrupt(bench::flowPin),countPulse,FALLING);
  // No servo attach, pitch write or pump-on request occurs at startup.
  WiFi.mode(WIFI_STA);WiFi.begin(bench::wifiSsid,bench::wifiPassword);
  if(xTaskCreate(networkWorker,"taph-http",6144,nullptr,1,nullptr)!=pdPASS) {
    detachInterrupt(digitalPinToInterrupt(bench::flowPin));Serial.println("{\"state\":\"unconfigured\",\"fault\":\"worker-allocation\"}");return;
  }
  hardwareInitialized=true;
}
void loop() {
  if(!hardwareInitialized) {delay(25);return;}
  const uint32_t now=millis();
  if(elapsed(micros(),lastWindowUs)>=guard.config().samplePeriodMs*1000) sampleInputs(now);
  guard.tick(now);
  NetworkReply reply;
  if(xQueueReceive(replyQueue,&reply,0)==pdTRUE) {networkBusy=false;guard.receive(reply.status,std::string(reply.body,reply.bodyLength),now);}
  localConsole(now);
  if(!networkBusy) {
    Request request;
    if(guard.beginRequest(now,request)) {
      if(xQueueSend(requestQueue,&request,0)==pdTRUE) networkBusy=true;
      else guard.receive(-1,"",now);
    }
  }
  if(!applyIntent(guard.intent(),hardware)) {
    guard.reportActuatorUnavailable();
    applyIntent(guard.intent(),hardware);
  }
  if(elapsed(now,lastTelemetryMs)>=guard.config().samplePeriodMs) {lastTelemetryMs=now;emitTelemetry(now);}
  delay(1);
}
#endif
