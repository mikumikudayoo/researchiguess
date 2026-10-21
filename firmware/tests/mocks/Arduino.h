#pragma once
#include <stdexcept>
#include <cstdint>
#include <string>
#include <iostream>
#include <sstream>
#include <iomanip>
#include <deque>
#include <vector>
#include <cstring>
#include <stdexcept>
inline int mockGpioCalls=0,mockSerialCalls=0,mockCriticalDepth=0;
inline uint32_t mockMs=0,mockUs=0;
inline int mockPinLevels[64]={};
#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2
#define FALLING 3
#define IRAM_ATTR
class String {
 std::string s;
public:
 String()=default; String(const char* v):s(v){} String(const std::string& v):s(v){}
 String(uint32_t v):s(std::to_string(v)){} String(int v):s(std::to_string(v)){}
 String(double v,int digits){std::ostringstream os;os<<std::fixed<<std::setprecision(digits)<<v;s=os.str();}
 std::size_t length()const{return s.size();}const char* c_str()const{return s.c_str();}
 bool startsWith(const char* p)const{return s.rfind(p,0)==0;}
 bool operator==(const char* p)const{return s==p;}
 friend String operator+(const String& a,const String& b){return String(a.s+b.s);}
 friend std::ostream& operator<<(std::ostream& os,const String& x){return os<<x.s;}
};
struct MockSerial {
 std::deque<char> input;std::string output;
 void check(){if(mockCriticalDepth)throw std::runtime_error("Serial inside critical section");++mockSerialCalls;}
 void begin(int){check();}
 template<class T>void print(T v){check();std::ostringstream s;s<<v;output+=s.str();}
 void print(double v,int digits){check();std::ostringstream s;s<<std::setprecision(digits)<<v;output+=s.str();}
 void println(const char* s){check();output+=std::string(s)+"\n";}
 int available(){return static_cast<int>(input.size());}
 int read(){if(input.empty())return -1;auto c=input.front();input.pop_front();return c;}
 void feed(const std::string& s){for(char c:s)input.push_back(c);}
};
inline MockSerial Serial;
inline void delay(unsigned){}
inline uint32_t millis(){return mockMs;}
inline uint32_t micros(){return mockUs;}
inline void pinMode(int,int){++mockGpioCalls;}
inline void digitalWrite(int pin,int level){++mockGpioCalls;if(pin<0 || pin>=64) throw std::out_of_range("invalid mock GPIO");mockPinLevels[pin]=level;}
inline int analogRead(int){return 2048;}
inline int digitalPinToInterrupt(int p){return p;}
inline void attachInterrupt(int,void(*)(),int){++mockGpioCalls;}
inline void detachInterrupt(int){++mockGpioCalls;}
using portMUX_TYPE=int;
#define portMUX_INITIALIZER_UNLOCKED 0
inline void portENTER_CRITICAL(portMUX_TYPE*){++mockCriticalDepth;}
inline void portEXIT_CRITICAL(portMUX_TYPE*){--mockCriticalDepth;}
inline void portENTER_CRITICAL_ISR(portMUX_TYPE* p){portENTER_CRITICAL(p);}
inline void portEXIT_CRITICAL_ISR(portMUX_TYPE* p){portEXIT_CRITICAL(p);}
constexpr int pdTRUE=1,pdPASS=1;
constexpr uint32_t portMAX_DELAY=UINT32_MAX;
inline uint32_t pdMS_TO_TICKS(uint32_t v){return v;}
inline void vTaskDelay(uint32_t v){mockMs+=v;mockUs+=v*1000;}
struct MockQueue{std::size_t bytes;std::deque<std::vector<char>> data;};
using QueueHandle_t=MockQueue*;
inline QueueHandle_t mockThrowAfterSend=nullptr;
struct WorkerDone{};
inline std::vector<QueueHandle_t> mockQueues;
inline QueueHandle_t xQueueCreate(int,std::size_t n){auto p=new MockQueue{n,{}};mockQueues.push_back(p);return p;}
inline int xQueueReceive(QueueHandle_t q,void* out,uint32_t){if(q->data.empty())return 0;std::memcpy(out,q->data.front().data(),q->bytes);q->data.pop_front();return pdTRUE;}
inline int xQueueSend(QueueHandle_t q,const void* value,uint32_t){const auto p=static_cast<const char*>(value);q->data.emplace_back(p,p+q->bytes);if(q==mockThrowAfterSend)throw WorkerDone{};return pdTRUE;}
inline int xTaskCreate(void(*)(void*),const char*,unsigned,void*,unsigned,void*){return pdPASS;}
