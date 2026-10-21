#pragma once
inline int mockServoAttach=0,mockServoDetach=0,mockServoWrites=0,mockLastPulseUs=0;
inline bool mockServoAttachSucceeds=true;
class Servo {bool active=false;public:bool attached(){return active;}void detach(){active=false;++mockServoDetach;}
 int attach(int,int,int){active=mockServoAttachSucceeds;++mockServoAttach;return active?1:0;}void writeMicroseconds(int us){++mockServoWrites;mockLastPulseUs=us;}};
