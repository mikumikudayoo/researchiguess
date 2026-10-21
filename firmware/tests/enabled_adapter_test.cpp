#define TAPH_ENABLE_HARDWARE 1
#define ARDUINO_ARCH_ESP32 1
#include "../esp32/taph_reliability/taph_reliability.ino"
#define CHECK(x) do{if(!(x)){std::cerr<<"adapter line "<<__LINE__<<": "<<#x<<"\n";return 1;}}while(0)
std::string body(uint32_t sequence=1){return "{\"schemaVersion\":\"taph.command.v1\",\"sequence\":"+std::to_string(sequence)+",\"controllerId\":\"mock-controller\",\"mappingId\":\"mock-mapping\",\"flowLMin\":4,\"requestedPitchDeg\":40,\"servoCommandDeg\":40,\"hardwareEligible\":true,\"calibrationStatus\":\"bench-reviewed\",\"inputDisposition\":\"in-range\"}";}
NetworkReply runWorker(Request r){xQueueSend(requestQueue,&r,0);mockThrowAfterSend=replyQueue;try{networkWorker(nullptr);}catch(const WorkerDone&){}mockThrowAfterSend=nullptr;NetworkReply reply;xQueueReceive(replyQueue,&reply,0);return reply;}
int main(){
 setup();CHECK(hardwareInitialized);CHECK(mockServoAttach==0 && mockServoWrites==0);CHECK(mockPinLevels[bench::pumpRelayPin]==HIGH);
 // Real adapter ISR/snapshot path with fake clocks/pins; delayed window is measured.
 for(int i=1;i<=20;++i){mockUs=i*20000;countPulse();}
 mockMs=500;mockUs=500000;loop();CHECK(guard.flow().pulses==20 && guard.flow().estimatedLMin==4);
 CHECK(mockCriticalDepth==0);CHECK(networkBusy);Request request;CHECK(xQueueReceive(requestQueue,&request,0)==pdTRUE);
 mockHttpBody=body();mockMs=510;auto reply=runWorker(request);CHECK(reply.status==200 && reply.bodyLength==mockHttpBody.size());
 xQueueSend(replyQueue,&reply,0);Serial.feed(std::string("ARM\0junk\n",9));loop();CHECK(guard.state()==State::Disarmed);
 Serial.feed("A\rRM\n");loop();CHECK(guard.state()==State::Disarmed);
 Serial.feed("ARM\t\n");loop();CHECK(guard.state()==State::Disarmed);
 Serial.feed("ARM\r\n");loop();CHECK(guard.state()==State::Armed);CHECK(mockServoAttach==1 && mockServoWrites==1);
 CHECK(mockPinLevels[bench::pumpRelayPin]==HIGH);CHECK(mockLastPulseUs==922);
 Serial.feed(std::string("PUMP ON\0junk\n",13));loop();CHECK(mockPinLevels[bench::pumpRelayPin]==HIGH);
 Serial.feed("PUMP ON\n");loop();CHECK(mockPinLevels[bench::pumpRelayPin]==LOW);
 // A stopped main-loop/sample window is detected rather than converted with fixed 500 ms.
 mockMs=5000;mockUs=5000000;loop();CHECK(guard.state()==State::FaultLatched);
 CHECK(mockPinLevels[bench::pumpRelayPin]==HIGH && mockServoDetach==1);CHECK(guard.fault()==Fault::InvalidWindow);
 CHECK(Serial.output.find("\"rawCurrentAdcCounts\":2048")!=std::string::npos);
 CHECK(Serial.output.find("\"calibratedCurrentA\":null")!=std::string::npos);
 // Adapter bounds network payloads and preserves embedded NUL for rejection by core.
 request.sentAtMs=mockMs;mockHttpBody=body()+std::string("\0junk",5);auto nul=runWorker(request);
 CHECK(nul.bodyLength==mockHttpBody.size());Command c;CHECK(!parseCommand(std::string(nul.body,nul.bodyLength),c));
 mockHttpBody=std::string(kMaxResponseBytes+1,'x');CHECK(runWorker(request).bodyLength==0);
 mockHttpBody=body();mockHttpLength=-1;CHECK(runWorker(request).bodyLength==0);mockHttpLength=-2;
 mockHttpContentType="text/html";CHECK(runWorker(request).bodyLength==0);
 mockHttpContentType="application/json-invalid";CHECK(runWorker(request).bodyLength==0);mockHttpContentType="application/json";
 mockHttpStatus=500;CHECK(runWorker(request).bodyLength==0);mockHttpStatus=200;
 // A failed PWM attach prevents pump-on and latches a software actuator fault.
 guard.disarm();mockServoAttachSucceeds=false;
 for(int i=1;i<=20;++i){mockUs=5000000+i*20000;countPulse();}
 mockMs=5500;mockUs=5500000;loop();Request second;CHECK(xQueueReceive(requestQueue,&second,0)==pdTRUE);
 mockHttpBody=body(second.sequence);mockMs=5510;auto secondReply=runWorker(second);xQueueSend(replyQueue,&secondReply,0);
 const int writesBefore=mockServoWrites;Serial.feed("ARM\n");loop();
 CHECK(guard.state()==State::FaultLatched && guard.fault()==Fault::ActuatorUnavailable);
 CHECK(mockPinLevels[bench::pumpRelayPin]==HIGH && mockServoWrites==writesBefore);
 for(auto q:mockQueues)delete q;
 std::cout<<"enabled adapter mock: startup, pulse timing, strict network bounds and fault outputs passed\n";
 return 0;
}
