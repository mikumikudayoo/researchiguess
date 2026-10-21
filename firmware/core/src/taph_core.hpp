#pragma once

// Portable, deterministic software boundary. No Arduino calls or hardware defaults.
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cerrno>
#include <limits>
#include <string>
#include <array>

namespace taph {
constexpr std::size_t kMaxResponseBytes = 1024;
constexpr uint32_t kHalfClockRange = 0x80000000u;
inline uint32_t elapsed(uint32_t now, uint32_t before) { return now - before; }
inline bool finite(double v) { return std::isfinite(v); }
inline bool identifier(const std::string& s) {
  if (s.empty() || s.size() > 96) return false;
  for (char c : s) if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
      (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == ':')) return false;
  return true;
}

enum class State { Disabled, Unconfigured, Disarmed, Armed, FaultLatched };
enum class Fault { None, Configuration, InvalidWindow, CounterOverflow, FlowOutOfRange,
  SensorStale, HttpStatus, MalformedResponse, ResponseMismatch, IneligibleResponse,
  CommandOutOfRange, RequestTimeout, CommandStale, UnexpectedResponse, ActuatorUnavailable, NotReady };
enum class ServoAction { None, RemovePwm, WriteCommand };
enum class FaultAction { Unconfigured, RemovePwm, ReviewedCommand };

inline const char* name(State v) {
  switch(v) { case State::Disabled:return "disabled"; case State::Unconfigured:return "unconfigured";
  case State::Disarmed:return "disarmed"; case State::Armed:return "armed"; default:return "fault-latched"; }
}
inline const char* name(Fault v) {
  switch(v) { case Fault::None:return "none"; case Fault::Configuration:return "configuration";
  case Fault::InvalidWindow:return "invalid-window"; case Fault::CounterOverflow:return "counter-overflow";
  case Fault::FlowOutOfRange:return "flow-out-of-range"; case Fault::SensorStale:return "sensor-stale";
  case Fault::HttpStatus:return "http-status"; case Fault::MalformedResponse:return "malformed-response";
  case Fault::ResponseMismatch:return "response-mismatch"; case Fault::IneligibleResponse:return "ineligible-response";
  case Fault::CommandOutOfRange:return "command-out-of-range"; case Fault::RequestTimeout:return "request-timeout";
  case Fault::CommandStale:return "command-stale"; case Fault::UnexpectedResponse:return "unexpected-response";
  case Fault::ActuatorUnavailable:return "actuator-unavailable";
  default:return "not-ready"; }
}

struct Config {
  bool hardwareEnabled = false;
  bool localBenchReviewConfirmed = false;
  bool flowCalibrationReviewed = false;
  bool faultPolicyReviewed = false;
  std::string localReviewId, flowCalibrationRecordId, mappingCalibrationRecordId, serverDeploymentReviewId, controllerId, mappingId;
  double pulseHzPerLMin = 0; // supplied calibration; never copied from legacy as measured
  double minFlowLMin = 1, maxFlowLMin = 6;
  double minPitchDeg = 0, maxPitchDeg = 0;
  double minServoDeg = 0, maxServoDeg = 0;
  double servoOffsetDeg = 0, servoDegreesPerPitchDegree = 0;
  FaultAction faultAction = FaultAction::Unconfigured;
  double reviewedFaultCommandDeg = 0;
  uint32_t samplePeriodMs = 500, maxWindowUs = 2000000;
  uint32_t sensorStaleMs = 1500, requestTimeoutMs = 250, commandStaleMs = 1500;
};

inline bool validConfig(const Config& c) {
  if (!c.localBenchReviewConfirmed || !c.flowCalibrationReviewed || !c.faultPolicyReviewed ||
      !identifier(c.localReviewId) || !identifier(c.flowCalibrationRecordId) ||
      !identifier(c.mappingCalibrationRecordId) || !identifier(c.serverDeploymentReviewId) ||
      !identifier(c.controllerId) || !identifier(c.mappingId)) return false;
  if (!finite(c.pulseHzPerLMin) || c.pulseHzPerLMin <= 0 ||
      !finite(c.minFlowLMin) || !finite(c.maxFlowLMin) || c.minFlowLMin < 0 || c.minFlowLMin >= c.maxFlowLMin ||
      !finite(c.minPitchDeg) || !finite(c.maxPitchDeg) || c.minPitchDeg >= c.maxPitchDeg ||
      !finite(c.minServoDeg) || !finite(c.maxServoDeg) || c.minServoDeg < 0 || c.maxServoDeg > 180 || c.minServoDeg >= c.maxServoDeg ||
      !finite(c.servoOffsetDeg) || !finite(c.servoDegreesPerPitchDegree) || c.servoDegreesPerPitchDegree == 0) return false;
  for (double pitch : {c.minPitchDeg, c.maxPitchDeg}) {
    const double command = c.servoOffsetDeg + c.servoDegreesPerPitchDegree * pitch;
    if (!finite(command) || command < c.minServoDeg || command > c.maxServoDeg) return false;
  }
  if (!c.samplePeriodMs || c.samplePeriodMs >= kHalfClockRange / 1000 ||
      c.maxWindowUs < c.samplePeriodMs * 1000 || c.maxWindowUs >= kHalfClockRange ||
      c.sensorStaleMs < c.samplePeriodMs || c.sensorStaleMs >= kHalfClockRange ||
      !c.requestTimeoutMs || c.requestTimeoutMs >= kHalfClockRange ||
      c.commandStaleMs < c.requestTimeoutMs || c.commandStaleMs >= kHalfClockRange) return false;
  if (c.faultAction != FaultAction::RemovePwm && c.faultAction != FaultAction::ReviewedCommand) return false;
  if (c.faultAction == FaultAction::ReviewedCommand &&
      (!finite(c.reviewedFaultCommandDeg) || c.reviewedFaultCommandDeg < c.minServoDeg ||
       c.reviewedFaultCommandDeg > c.maxServoDeg)) return false;
  return true;
}

struct FlowSample {
  uint32_t pulses = 0, elapsedUs = 0, capturedAtMs = 0;
  double estimatedLMin = std::numeric_limits<double>::quiet_NaN();
  bool valid = false, calibrationReviewed = false, counterOverflow = false;
};
inline FlowSample convertFlow(uint32_t pulses, uint32_t elapsedUs, uint32_t capturedAtMs,
    bool overflow, double hzPerLMin, bool calibrationReviewed, uint32_t maxWindowUs) {
  FlowSample s{pulses, elapsedUs, capturedAtMs};
  s.calibrationReviewed = calibrationReviewed; s.counterOverflow = overflow;
  if (overflow || !elapsedUs || elapsedUs > maxWindowUs || elapsedUs >= kHalfClockRange ||
      !finite(hzPerLMin) || hzPerLMin <= 0) return s;
  s.estimatedLMin = static_cast<double>(pulses) * 1000000.0 / elapsedUs / hzPerLMin;
  s.valid = finite(s.estimatedLMin);
  return s;
}

struct CurrentReading {
  int rawAdcCounts;
  bool calibrated = false;
  double amperes = std::numeric_limits<double>::quiet_NaN();
};
inline CurrentReading currentFromRaw(int raw, bool reviewed, double zeroCounts, double ampsPerCount) {
  CurrentReading r{raw};
  if (raw >= 0 && reviewed && finite(zeroCounts) && finite(ampsPerCount) && ampsPerCount != 0) {
    r.amperes = (raw - zeroCounts) * ampsPerCount; r.calibrated = finite(r.amperes);
  }
  return r;
}

struct Command {
  uint32_t sequence = 0;
  std::string schemaVersion, controllerId, mappingId, calibrationStatus, inputDisposition;
  double flowLMin = 0, requestedPitchDeg = 0, servoCommandDeg = 0;
  bool hardwareEligible = false;
};

// Deliberately small strict subset for the documented, flat v1 wire object.
// Escaped/non-ASCII strings, objects/arrays, duplicate/unknown keys, trailing input,
// non-JSON numeric forms and bodies >1024 bytes are rejected, never coerced.
class FlatParser {
  const std::string& s; std::size_t p = 0;
  void ws() { while(p < s.size() && (s[p]==' ' || s[p]=='\t' || s[p]=='\r' || s[p]=='\n')) ++p; }
  bool take(char c) { ws(); if(p >= s.size() || s[p]!=c) return false; ++p; return true; }
  bool str(std::string& out) {
    if(!take('"')) return false;
    out.clear();
    while(p<s.size() && s[p]!='"') { unsigned char c=s[p++]; if(c<32 || c>126 || c=='\\') return false;
      out.push_back(static_cast<char>(c)); if(out.size()>96) return false; }
    if(p==s.size()) return false;
    ++p; return true;
  }
  bool number(double& out, bool integerOnly = false) {
    ws(); const auto begin=p; if(p<s.size() && s[p]=='-') ++p;
    if(p==s.size()) return false;
    if(s[p]=='0') ++p;
    else { if(s[p]<'1' || s[p]>'9') return false; while(p<s.size() && s[p]>='0' && s[p]<='9') ++p; }
    if(p<s.size() && s[p]=='.') { if(integerOnly) return false; ++p; const auto a=p;
      while(p<s.size() && s[p]>='0' && s[p]<='9') ++p;
      if(p==a) return false; }
    if(p<s.size() && (s[p]=='e' || s[p]=='E')) { if(integerOnly) return false; ++p;
      if(p<s.size() && (s[p]=='+' || s[p]=='-')) ++p;
      const auto a=p;
      while(p<s.size() && s[p]>='0' && s[p]<='9') ++p;
      if(p==a) return false; }
    const auto token=s.substr(begin,p-begin); char* end=nullptr; errno=0;
    out=std::strtod(token.c_str(), &end);
    return errno != ERANGE && end == token.c_str()+token.size() && finite(out);
  }
public:
  explicit FlatParser(const std::string& text):s(text){}
  bool parse(Command& c) {
    if(s.empty() || s.size()>kMaxResponseBytes || !take('{')) return false;
    const std::array<const char*,10> keys{{"schemaVersion","sequence","controllerId","mappingId","flowLMin",
      "requestedPitchDeg","servoCommandDeg","hardwareEligible","calibrationStatus","inputDisposition"}};
    uint16_t seen=0;
    for(std::size_t field=0;field<keys.size();++field) {
      std::string key; if(!str(key) || !take(':')) return false;
      std::size_t k=0; while(k<keys.size() && key!=keys[k]) ++k;
      if(k==keys.size() || (seen & (1u<<k))) return false;
      seen |= (1u<<k);
      bool ok=false; double seq=0;
      switch(k) {
        case 0:ok=str(c.schemaVersion);break;
        case 1:ok=number(seq,true) && seq>=0 && seq<=4294967295.0; c.sequence=ok?static_cast<uint32_t>(seq):0;break;
        case 2:ok=str(c.controllerId);break; case 3:ok=str(c.mappingId);break;
        case 4:ok=number(c.flowLMin);break; case 5:ok=number(c.requestedPitchDeg);break;
        case 6:ok=number(c.servoCommandDeg);break;
        case 7:ws(); if(s.compare(p,4,"true")==0){c.hardwareEligible=true;p+=4;ok=true;}
          else if(s.compare(p,5,"false")==0){c.hardwareEligible=false;p+=5;ok=true;}
          break;
        case 8:ok=str(c.calibrationStatus);break; case 9:ok=str(c.inputDisposition);break;
      }
      if(!ok || !take(field+1<keys.size()?',':'}')) return false;
    }
    ws(); return p==s.size() && c.schemaVersion=="taph.command.v1" && identifier(c.controllerId) &&
      identifier(c.mappingId) && c.flowLMin>=0 &&
      (c.calibrationStatus=="unverified" || c.calibrationStatus=="bench-reviewed") &&
      (c.inputDisposition=="in-range" || c.inputDisposition=="clamped-low" || c.inputDisposition=="clamped-high");
  }
};
inline bool parseCommand(const std::string& body, Command& c) { return FlatParser(body).parse(c); }

struct Request { uint32_t sequence=0, sentAtMs=0, sampleAtMs=0; double flowLMin=0; };
struct OutputIntent { bool configured=false, pumpOn=false; ServoAction servo=ServoAction::None; double servoDeg=0; };

class ControllerGuard {
  Config cfg_; State state_; Fault fault_=Fault::None;
  FlowSample flow_; Command command_; Request request_;
  uint32_t nextSequence_=1, commandAtMs_=0;
  bool haveFlow_=false, haveCommand_=false, pending_=false, everArmed_=false, pumpOn_=false, haveRequestedSample_=false;
  uint32_t requestedSampleAtMs_=0;
  bool freshFlow(uint32_t now) const { return haveFlow_ && flow_.valid && flow_.calibrationReviewed &&
    elapsed(now,flow_.capturedAtMs)<=cfg_.sensorStaleMs &&
    flow_.estimatedLMin>=cfg_.minFlowLMin && flow_.estimatedLMin<=cfg_.maxFlowLMin; }
  bool fail(Fault reason) { haveCommand_=false; pumpOn_=false;
    if(state_==State::Armed) state_=State::FaultLatched;
    if(state_!=State::FaultLatched || fault_==Fault::None) fault_=reason;
    return false;
  }
public:
  explicit ControllerGuard(Config cfg):cfg_(cfg),state_(!cfg.hardwareEnabled?State::Disabled:
    (validConfig(cfg)?State::Disarmed:State::Unconfigured)) {
      if(state_==State::Unconfigured) fault_=Fault::Configuration;
  }
  const Config& config() const { return cfg_; }
  State state() const { return state_; } Fault fault() const { return fault_; }
  const FlowSample& flow() const { return flow_; }
  bool pending() const { return pending_; }
  bool commandAvailable() const { return haveCommand_; }
  const Command& command() const { return command_; }
  uint32_t commandAgeMs(uint32_t now) const { return elapsed(now,commandAtMs_); }
  bool configured() const { return state_!=State::Disabled && state_!=State::Unconfigured; }
  void sample(const FlowSample& s) {
    flow_=s; haveFlow_=true;
    if(!configured()) return;
    if(!s.valid || !s.calibrationReviewed) { fail(s.counterOverflow?Fault::CounterOverflow:Fault::InvalidWindow); return; }
    if(s.estimatedLMin<cfg_.minFlowLMin || s.estimatedLMin>cfg_.maxFlowLMin) fail(Fault::FlowOutOfRange);
  }
  void tick(uint32_t now) {
    if(!configured()) return;
    if(pending_ && elapsed(now,request_.sentAtMs)>cfg_.requestTimeoutMs) { pending_=false; fail(Fault::RequestTimeout); }
    if(state_==State::Armed && !freshFlow(now)) { fail(Fault::SensorStale); return; }
    if(state_==State::Armed && (!haveCommand_ || elapsed(now,commandAtMs_)>cfg_.commandStaleMs)) fail(Fault::CommandStale);
  }
  bool beginRequest(uint32_t now, Request& r) {
    tick(now);
    if(!configured() || state_==State::FaultLatched || pending_ || !freshFlow(now) ||
       (haveRequestedSample_ && requestedSampleAtMs_==flow_.capturedAtMs)) return false;
    request_={nextSequence_++,now,flow_.capturedAtMs,std::round(flow_.estimatedLMin*1e9)/1e9};
    pending_=true; haveRequestedSample_=true; requestedSampleAtMs_=flow_.capturedAtMs; r=request_; return true;
  }
  bool receive(int httpStatus, const std::string& body, uint32_t now) {
    if(!configured() || state_==State::FaultLatched) return false;
    if(!pending_) return fail(Fault::UnexpectedResponse);
    pending_=false;
    if(elapsed(now,request_.sentAtMs)>cfg_.requestTimeoutMs) return fail(Fault::RequestTimeout);
    if(!freshFlow(now) || elapsed(now,request_.sampleAtMs)>cfg_.sensorStaleMs) return fail(Fault::SensorStale);
    if(httpStatus!=200) return fail(Fault::HttpStatus);
    Command c; if(!parseCommand(body,c)) return fail(Fault::MalformedResponse);
    if(c.sequence!=request_.sequence || c.controllerId!=cfg_.controllerId || c.mappingId!=cfg_.mappingId ||
       std::abs(c.flowLMin-request_.flowLMin)>1e-10) return fail(Fault::ResponseMismatch);
    if(!c.hardwareEligible || c.calibrationStatus!="bench-reviewed" || c.inputDisposition!="in-range") return fail(Fault::IneligibleResponse);
    const double mapped=cfg_.servoOffsetDeg+cfg_.servoDegreesPerPitchDegree*c.requestedPitchDeg;
    if(c.requestedPitchDeg<cfg_.minPitchDeg || c.requestedPitchDeg>cfg_.maxPitchDeg ||
       c.servoCommandDeg<cfg_.minServoDeg || c.servoCommandDeg>cfg_.maxServoDeg ||
       std::abs(c.servoCommandDeg-mapped)>1e-8) return fail(Fault::CommandOutOfRange);
    command_=c; commandAtMs_=now; haveCommand_=true; fault_=Fault::None; return true;
  }
  bool arm(uint32_t now) {
    tick(now);
    if(state_!=State::Disarmed || !freshFlow(now) || !haveCommand_ ||
       elapsed(now,commandAtMs_)>cfg_.commandStaleMs) return false;
    state_=State::Armed; everArmed_=true; fault_=Fault::None; return true;
  }
  bool requestPump(bool on, uint32_t now) {
    tick(now); if(on && state_!=State::Armed) return false; pumpOn_=on; return configured();
  }
  void reportActuatorUnavailable() { if(configured()) fail(Fault::ActuatorUnavailable); }
  void disarm() {
    if(!configured()) return;
    state_=State::Disarmed; fault_=Fault::None; pumpOn_=false;
    pending_=false; haveCommand_=false;
  }
  OutputIntent intent() const {
    OutputIntent v; v.configured=configured(); if(!v.configured) return v;
    if(state_==State::Armed && haveCommand_) { v.pumpOn=pumpOn_; v.servo=ServoAction::WriteCommand; v.servoDeg=command_.servoCommandDeg; }
    else if(everArmed_) { v.servo=cfg_.faultAction==FaultAction::RemovePwm?ServoAction::RemovePwm:ServoAction::WriteCommand;
      v.servoDeg=cfg_.reviewedFaultCommandDeg; }
    return v;
  }
};

// The same output boundary is used by the adapter and fake hardware tests.
template<class Port> bool applyIntent(const OutputIntent& v, Port& port) {
  if(!v.configured) return true; // absolutely no actuator calls for disabled/unconfigured builds
  if(!v.pumpOn) port.pump(false); // fault/off request takes priority
  bool accepted=true;
  if(v.servo==ServoAction::RemovePwm) port.removeServoPwm();
  else if(v.servo==ServoAction::WriteCommand) accepted=port.writeServo(v.servoDeg);
  if(v.pumpOn) {
    accepted=accepted && v.servo==ServoAction::WriteCommand;
    port.pump(accepted); // never issue pump-on after a software actuator failure
  }
  return accepted;
}
} // namespace taph
