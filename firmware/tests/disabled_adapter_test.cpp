#include "../esp32/taph_reliability/taph_reliability.ino"
int main(){setup();for(int i=0;i<10;++i)loop();if(mockGpioCalls!=0 || mockSerialCalls!=2)return 1;
 std::cout<<"disabled ESP32 adapter: zero GPIO/network/servo initialization\n";return 0;}
