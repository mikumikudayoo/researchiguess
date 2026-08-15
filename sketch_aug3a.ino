#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP32Servo.h>

// --- OLED SETUP ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define SDA_PIN 2
#define SCL_PIN 0
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// --- PIN DEFINITIONS ---
#define FLOW_SENSOR_PIN 19 // Sensor signal connected to GPIO 19 🌊
#define SERVO_PIN 5        // SG90 Yellow Signal wire 🔄
#define CURRENT_PIN 34     // ACS712 OUT pin ⚡
#define RELAY_PIN 26       // 12V Water Pump Switch 🔌

// --- HARDWARE OBJECTS ---
Servo bladeServo;

// --- FLOW SENSOR INTERRUPT VARIABLES ---
volatile unsigned long pulseCount = 0;
volatile unsigned long lastMicros = 0; // NEW: Debounce timer to block motor EMI noise!
float flowRateLmin = 0.0;
unsigned long lastLoopTime = 0;

// Debounced Interrupt Function to ignore ghost pulses!
void IRAM_ATTR countPulse() {
  unsigned long currentMicros = micros();
  // Only count if its been at least 2000 microseconds (2ms) since the last pulse
  if (currentMicros - lastMicros > 2000) { 
    pulseCount++;
    lastMicros = currentMicros;
  }
}

// --- ACCESS POINT CONFIG ---
const char* ap_ssid = "MIKUDAYOOOOOO (no internet btw)";
const char* ap_password = "mikumikumikuofficial";

// phone IP address running the bun.js server
const char* server_ip = "192.168.4.2"; 

int lastAngleRx = 0;
float rawCurrentVal = 0.0;

void updateOLED(String statusMsg) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);

  display.println("=== miku dayo :3 ===");
  display.print("flow : ");
  display.print(flowRateLmin, 2);
  display.println(" L/min");
  
  display.println("--------------------");
  display.print("status: ");
  display.println(statusMsg);
  display.print("angle set: ");
  display.print(lastAngleRx);
  display.println(" deg");
  display.print("ACS712 read: ");
  display.println(rawCurrentVal);
  
  display.display();
}

void setup() {
  Serial.begin(115200);

  // Flow Sensor Setup
  pinMode(FLOW_SENSOR_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), countPulse, FALLING);

  // Relay Setup for 12V Pump
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW); // Active LOW is ON by default

  // Servo setup 
  bladeServo.attach(SERVO_PIN, 500, 2400);
  bladeServo.write(0); // Start at 0 degrees

  // Init OLED
  Wire.begin(SDA_PIN, SCL_PIN);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  
  // Start wifi ap Hotspot
  WiFi.softAP(ap_ssid, ap_password);
  Serial.print("AP Created! IP: ");
  Serial.println(WiFi.softAPIP());

  updateOLED("we are ready to GAME");
}

void loop() {
  // Run automatically every 500ms
  if (millis() - lastLoopTime >= 500) {
    lastLoopTime = millis();

    // 1. Read Flow Sensor Pulses safely
    noInterrupts();
    unsigned long pulses = pulseCount;
    pulseCount = 0;
    Serial.println(pulses);
    interrupts();

    //Multiply by 2.0 to convert to a 1-second pulse rate
    flowRateLmin = (((float)pulses * 2.0) / 7.5);

    // 2. Read ACS712 Current Sensor
    rawCurrentVal = analogRead(CURRENT_PIN);

    // 3. Send Data to Server & Move Servo Automatically
    if (WiFi.softAPgetStationNum() > 0) { 
      HTTPClient http;
      
      String url = "http://" + String(server_ip) + ":3000/a/" + String(flowRateLmin, 2);
      http.begin(url);
      http.setTimeout(150); // Fast timeout to prevent blocking if wifi drops
      
      int httpCode = http.GET();
      
      if (httpCode > 0) {
        String payload = http.getString();
        payload.trim(); 

        // Convert received payload to integer angle
        int targetAngle = payload.toInt(); 
        
        // CONSTRAIN TO FULL SERVO RANGE (0 to 180)
        targetAngle = constrain(targetAngle, 0, 180); 
        lastAngleRx = targetAngle;

        // ACTUATE SERVO
        bladeServo.write(targetAngle); 
        
        updateOLED("active (http " + String(httpCode) + ")");
      } else {
        updateOLED("http error :(");
      }
      http.end();
    } else {
      updateOLED("miku waiting for server");
    }
  }
}
