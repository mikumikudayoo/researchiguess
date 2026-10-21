#pragma once
#include "Arduino.h"
inline std::string mockHttpBody,mockHttpContentType="application/json";
inline int mockHttpStatus=200,mockHttpLength=-2;
class MockStream {std::size_t pos=0;public:
 void reset(){pos=0;}int available(){return static_cast<int>(mockHttpBody.size()-pos);}
 int read(){return pos<mockHttpBody.size()?static_cast<unsigned char>(mockHttpBody[pos++]):-1;}};
class HTTPClient {MockStream stream;public:
 void setConnectTimeout(int32_t){}void setTimeout(uint16_t){}void collectHeaders(const char**,int){}
 bool begin(const String&){stream.reset();return true;}int GET(){return mockHttpStatus;}
 int getSize(){return mockHttpLength==-2?static_cast<int>(mockHttpBody.size()):mockHttpLength;}
 String header(const char*){return String(mockHttpContentType);}MockStream* getStreamPtr(){return &stream;}
 bool connected(){return stream.available()>0;}void end(){}};
