#pragma once
#include "Arduino.h"
constexpr int WL_CONNECTED=3,WIFI_STA=1;
inline int mockNetworkInitializations=0;
struct MockWiFi {int status(){return WL_CONNECTED;}void mode(int){++mockNetworkInitializations;}void begin(const char*,const char*){++mockNetworkInitializations;}};
inline MockWiFi WiFi;
