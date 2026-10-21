#include "taph_core.hpp"
#include <iostream>
#include <sstream>
#include <iomanip>
#include <functional>
#include <vector>
#include <stdexcept>
using namespace taph;
int checks=0;
#define CHECK(x) do { ++checks; if(!(x)) throw std::runtime_error(std::string("line ")+std::to_string(__LINE__)+": "+#x); } while(0)
Config fixture() {
  // Simulated test fixture only. These IDs do not attest to physical review.
  Config c; c.hardwareEnabled=true;c.localBenchReviewConfirmed=true;c.flowCalibrationReviewed=true;c.faultPolicyReviewed=true;
  c.localReviewId="mock-local-review";c.flowCalibrationRecordId="mock-flow-record";
  c.mappingCalibrationRecordId="mock-mapping-record";c.serverDeploymentReviewId="mock-server-review";
  c.controllerId="mock-controller";c.mappingId="mock-mapping";c.pulseHzPerLMin=10;
  c.minPitchDeg=10;c.maxPitchDeg=75;c.minServoDeg=10;c.maxServoDeg=75;c.servoDegreesPerPitchDegree=1;
  c.faultAction=FaultAction::RemovePwm;return c;
}
std::string body(const Request& r,double pitch=40,double servo=40) {
  std::ostringstream s;s<<std::setprecision(17);
  s<<"{\"schemaVersion\":\"taph.command.v1\",\"sequence\":"<<r.sequence
   <<",\"controllerId\":\"mock-controller\",\"mappingId\":\"mock-mapping\",\"flowLMin\":"<<r.flowLMin
   <<",\"requestedPitchDeg\":"<<pitch<<",\"servoCommandDeg\":"<<servo
   <<",\"hardwareEligible\":true,\"calibrationStatus\":\"bench-reviewed\",\"inputDisposition\":\"in-range\"}";
  return s.str();
}
std::string replace(std::string s,const std::string& a,const std::string& b) {
  auto p=s.find(a); if(p==std::string::npos) throw std::runtime_error("bad test replacement");s.replace(p,a.size(),b);return s;
}
FlowSample flow(uint32_t at=500,uint32_t pulses=20,uint32_t dt=500000) {return convertFlow(pulses,dt,at,false,10,true,2000000);}
Request ready(ControllerGuard& g,uint32_t at=500) {g.sample(flow(at));Request r;CHECK(g.beginRequest(at,r));return r;}
void arm(ControllerGuard& g,uint32_t at=500) {auto r=ready(g,at);CHECK(g.receive(200,body(r),at+10));CHECK(g.arm(at+11));}
struct MockPort {int calls=0,pumpCalls=0,servoWrites=0,detachCalls=0;bool on=false,servoAccepts=true;double command=0;
 void pump(bool v){++calls;++pumpCalls;on=v;}void removeServoPwm(){++calls;++detachCalls;}
 bool writeServo(double v){++calls;++servoWrites;command=v;return servoAccepts;}};

void flowTests() {
  CHECK(elapsed(10,UINT32_MAX-9)==20);
  auto a=convertFlow(15,500000,500,false,7.5,false,2000000);
  CHECK(a.valid && !a.calibrationReviewed && std::abs(a.estimatedLMin-4)<1e-12);
  auto b=convertFlow(15,750000,750,false,7.5,true,2000000);CHECK(std::abs(b.estimatedLMin-8.0/3)<1e-12);
  CHECK(!convertFlow(1,0,0,false,10,true,2000000).valid);
  CHECK(!convertFlow(1,2000001,0,false,10,true,2000000).valid);
  CHECK(!convertFlow(1,500000,0,true,10,true,2000000).valid);
  CHECK(!convertFlow(1,500000,0,false,0,true,2000000).valid);
  CHECK(!convertFlow(1,500000,0,false,NAN,true,2000000).valid);
  auto z=convertFlow(0,500000,500,false,10,true,2000000);CHECK(z.valid && z.estimatedLMin==0);
  auto raw=currentFromRaw(2048,false,2048,.001);CHECK(!raw.calibrated && std::isnan(raw.amperes) && raw.rawAdcCounts==2048);
  CHECK(std::abs(currentFromRaw(2058,true,2048,.001).amperes-.01)<1e-12);
  CHECK(!currentFromRaw(1,true,NAN,1).calibrated);
}
void parserTests() {
  Request r{1,500,500,4}; Command c;const auto ok=body(r);
  CHECK(parseCommand(ok,c));CHECK(c.sequence==1 && c.requestedPitchDeg==40);
  CHECK(parseCommand(" \n"+ok+"\t\r",c));
  std::vector<std::string> bad{"", "{}", "[]",ok+"garbage",ok+std::string(1,'\0'),std::string(1025,'x'),
    replace(ok,"\"sequence\":1","\"sequence\":1.0"),replace(ok,"\"sequence\":1","\"sequence\":4294967296"),
    replace(ok,"\"sequence\":1","\"sequence\":-1"),replace(ok,"\"sequence\":1","\"sequence\":1e0"),
    replace(ok,"\"sequence\":1","\"sequence\":01"),replace(ok,"\"sequence\":1","\"sequence\":true"),
    replace(ok,"\"flowLMin\":4","\"flowLMin\":NaN"),replace(ok,"\"flowLMin\":4","\"flowLMin\":1e309"),
    replace(ok,"\"flowLMin\":4","\"flowLMin\":\"4\""),replace(ok,"\"flowLMin\":4","\"flowLMin\":0x4"),
    replace(ok,"\"flowLMin\":4","\"flowLMin\":+4"),replace(ok,"\"flowLMin\":4","\"flowLMin\":4."),
    replace(ok,"\"flowLMin\":4","\"flowLMin\":.4"),replace(ok,"\"flowLMin\":4","\"flowLMin\":4e"),
    replace(ok,"\"hardwareEligible\":true","\"hardwareEligible\":1"),
    replace(ok,"mock-controller","mock\\u002dcontroller"),replace(ok,"mock-controller",std::string(97,'a')),
    replace(ok,"\"mappingId\":\"mock-mapping\"","\"controllerId\":\"mock-mapping\""),
    replace(ok,"\"flowLMin\":4","\"unknown\":4"),replace(ok,"taph.command.v1","taph.command.v2"),
    replace(ok,"bench-reviewed","verified"),replace(ok,"in-range","anything")};
  for(const auto& s:bad) CHECK(!parseCommand(s,c));
  for(unsigned i=0;i<ok.size();++i) CHECK(!parseCommand(ok.substr(0,i),c));
  CHECK(parseCommand(replace(ok,"\"sequence\":1","\"sequence\":4294967295"),c));CHECK(c.sequence==UINT32_MAX);
  CHECK(parseCommand(replace(ok,"\"flowLMin\":4","\"flowLMin\":4e0"),c));
}
void configTests() {
  CHECK(validConfig(fixture()));
  for(const auto& mutate:std::vector<std::function<void(Config&)>>{
      [](auto& c){c.localBenchReviewConfirmed=false;},[](auto& c){c.flowCalibrationReviewed=false;},
      [](auto& c){c.faultPolicyReviewed=false;},[](auto& c){c.flowCalibrationRecordId="";},
      [](auto& c){c.mappingCalibrationRecordId="";},[](auto& c){c.serverDeploymentReviewId="";},
      [](auto& c){c.controllerId="bad id";},[](auto& c){c.pulseHzPerLMin=INFINITY;},
      [](auto& c){c.servoDegreesPerPitchDegree=0;},[](auto& c){c.maxServoDeg=181;},
      [](auto& c){c.maxPitchDeg=200;},[](auto& c){c.samplePeriodMs=0;},
      [](auto& c){c.requestTimeoutMs=kHalfClockRange;},[](auto& c){c.maxWindowUs=10;},
      [](auto& c){c.sensorStaleMs=10;},[](auto& c){c.faultAction=FaultAction::Unconfigured;},
      [](auto& c){c.faultAction=static_cast<FaultAction>(99);},
      [](auto& c){c.faultAction=FaultAction::ReviewedCommand;c.reviewedFaultCommandDeg=190;}}) {
    auto c=fixture();mutate(c);CHECK(!validConfig(c));ControllerGuard g(c);CHECK(g.state()==State::Unconfigured);
    MockPort p;applyIntent(g.intent(),p);CHECK(p.calls==0);CHECK(!g.arm(0));
  }
  Config c;ControllerGuard disabled(c);MockPort p;applyIntent(disabled.intent(),p);CHECK(p.calls==0);
  CHECK(disabled.state()==State::Disabled);CHECK(!disabled.requestPump(true,0));
  Request r;CHECK(!disabled.beginRequest(0,r));CHECK(!disabled.receive(200,body(r),0));
}
void guardTests() {
  ControllerGuard g(fixture());MockPort port;applyIntent(g.intent(),port);CHECK(!port.on && port.servoWrites==0);
  CHECK(!g.arm(0));CHECK(!g.requestPump(true,0));
  auto r=ready(g);Request twice;CHECK(!g.beginRequest(501,twice));
  CHECK(g.receive(200,body(r),510));CHECK(!g.beginRequest(511,twice)); // at most one request per sample
  applyIntent(g.intent(),port);CHECK(port.servoWrites==0);
  CHECK(g.arm(511));applyIntent(g.intent(),port);CHECK(port.command==40 && !port.on);
  CHECK(g.requestPump(true,512));applyIntent(g.intent(),port);CHECK(port.on);
  g.tick(2001);applyIntent(g.intent(),port);CHECK(g.state()==State::FaultLatched && g.fault()==Fault::SensorStale);
  CHECK(!port.on && port.detachCalls==1);CHECK(!g.arm(2002));CHECK(!g.receive(200,body(r),2002));
  g.disarm();CHECK(g.state()==State::Disarmed);CHECK(!g.arm(2002));arm(g,2500);CHECK(g.state()==State::Armed);

  for(int status:{-1,0,201,204,301,400,404,422,500}) {ControllerGuard h(fixture());arm(h);h.sample(flow(1000));Request q;CHECK(h.beginRequest(1000,q));
    CHECK(!h.receive(status,body(q),1010));CHECK(h.state()==State::FaultLatched && h.fault()==Fault::HttpStatus);}
  for(const auto& mutate:std::vector<std::function<std::string(std::string)>>{
    [](auto s){return replace(s,"\"sequence\":2","\"sequence\":1");},
    [](auto s){return replace(s,"mock-mapping","other-mapping");},
    [](auto s){return replace(s,"mock-controller","other-controller");},
    [](auto s){return replace(s,"\"flowLMin\":4","\"flowLMin\":3");},
    [](auto s){return replace(s,"\"hardwareEligible\":true","\"hardwareEligible\":false");},
    [](auto s){return replace(s,"bench-reviewed","unverified");},
    [](auto s){return replace(s,"in-range","clamped-high");},
    [](auto s){return replace(s,"\"servoCommandDeg\":40","\"servoCommandDeg\":41");},
    [](auto s){return replace(s,"\"requestedPitchDeg\":40","\"requestedPitchDeg\":190");},
    [](auto){return "40 degrees";}}) {
      ControllerGuard h(fixture());arm(h);h.sample(flow(1000));Request q;CHECK(h.beginRequest(1000,q));
      CHECK(!h.receive(200,mutate(body(q)),1010));CHECK(h.state()==State::FaultLatched);CHECK(!h.intent().pumpOn);
  }
  ControllerGuard timeout(fixture());arm(timeout);auto q=ready(timeout,1000);timeout.tick(1251);
  CHECK(timeout.state()==State::FaultLatched && timeout.fault()==Fault::RequestTimeout);CHECK(!timeout.receive(200,body(q),1252));
  auto shortConfig=fixture();shortConfig.commandStaleMs=600;ControllerGuard stale(shortConfig);arm(stale);stale.sample(flow(1000));stale.tick(1111);
  CHECK(stale.fault()==Fault::CommandStale && stale.state()==State::FaultLatched);
  ControllerGuard zero(fixture());arm(zero);zero.sample(flow(1000,0));CHECK(zero.fault()==Fault::FlowOutOfRange);
  CHECK(zero.flow().valid); // zero pulse rate is not proof of a disconnected sensor
  ControllerGuard overflow(fixture());arm(overflow);auto of=flow(1000);of.valid=false;of.counterOverflow=true;overflow.sample(of);CHECK(overflow.fault()==Fault::CounterOverflow);
  auto reverse=fixture();reverse.servoOffsetDeg=100;reverse.servoDegreesPerPitchDegree=-1;reverse.minServoDeg=25;reverse.maxServoDeg=90;
  ControllerGuard reversed(reverse);auto rr=ready(reversed);CHECK(reversed.receive(200,body(rr,40,60),510));CHECK(reversed.arm(511));CHECK(reversed.intent().servoDeg==60);
  ControllerGuard attachFailure(fixture());arm(attachFailure);CHECK(attachFailure.requestPump(true,512));
  MockPort broken;broken.servoAccepts=false;CHECK(!applyIntent(attachFailure.intent(),broken));CHECK(!broken.on);
  attachFailure.reportActuatorUnavailable();CHECK(attachFailure.state()==State::FaultLatched && attachFailure.fault()==Fault::ActuatorUnavailable);
  auto reviewed=fixture();reviewed.faultAction=FaultAction::ReviewedCommand;reviewed.reviewedFaultCommandDeg=25;
  ControllerGuard custom(reviewed);arm(custom);custom.disarm();CHECK(custom.intent().servo==ServoAction::WriteCommand && custom.intent().servoDeg==25 && !custom.intent().pumpOn);
  ControllerGuard wrapping(fixture());const uint32_t before=UINT32_MAX-200;auto wr=ready(wrapping,before);
  CHECK(wrapping.receive(200,body(wr),before+10));CHECK(wrapping.arm(before+11));wrapping.tick(100);CHECK(wrapping.state()==State::Armed);
  wrapping.tick(1500);CHECK(wrapping.state()==State::FaultLatched);
}
int main(){try{flowTests();parserTests();configTests();guardTests();std::cout<<"firmware core: "<<checks<<" checks passed\n";return 0;}catch(const std::exception& e){std::cerr<<e.what()<<"\n";return 1;}}
