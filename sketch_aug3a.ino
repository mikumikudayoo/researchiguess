#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP32Servo.h> // Make sure to install ESP32Servo library in Arduino IDE!

// --- OLED SETUP ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define SDA_PIN 2
#define SCL_PIN 0
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// --- PIN DEFINITIONS ---
#define BTN_MINUS 12
#define BTN_PLUS  13
#define BTN_SEND  14

#define SERVO_PIN 5       // Connect SG90 Yellow Signal wire here! 🔄
#define CURRENT_PIN 34    // Connect ACS712 OUT pin here! ⚡

// --- HARDWARE OBJECTS ---
Servo bladeServo;

// --- ACCESS POINT CONFIG ---
const char* ap_ssid = "MIKUDAYOOOOOO (no internet btw)";
const char* ap_password = "mikumikumikuofficial";

// Your laptop/phone IP address running the Node.js server
const char* server_ip = "192.168.4.2"; 

int currentWaterAmount = 50; // Manual input or sensor input
String lastAngleRx = "0";
float rawCurrentVal = 0.0;

void updateOLED(String statusMsg) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);

  display.println("== miku dayoooo :D ==");
  display.print("water in : ");
  display.println(currentWaterAmount);
  
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

  // Configure Button pins
  pinMode(BTN_MINUS, INPUT_PULLUP);
  pinMode(BTN_PLUS,  INPUT_PULLUP);
  pinMode(BTN_SEND,  INPUT_PULLUP);

  // Servo setup for ESP32
  bladeServo.attach(SERVO_PIN);
  bladeServo.write(0); // Default 0 degrees angle

  // Init OLED
  Wire.begin(SDA_PIN, SCL_PIN);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  
  // Start ESP32 Wi-Fi AP Hotspot
  WiFi.softAP(ap_ssid, ap_password);
  Serial.print("AP Created! IP: ");
  Serial.println(WiFi.softAPIP());

  updateOLED("Ready!");
}

void loop() {
  // 1. Minus Button Pressed
  if (digitalRead(BTN_MINUS) == LOW) {
    if (currentWaterAmount > 0) currentWaterAmount -= 1;
    updateOLED("set angle - 1");
    delay(200);
  }

  // 2. Plus Button Pressed
  if (digitalRead(BTN_PLUS) == LOW) {
    if (currentWaterAmount < 100) currentWaterAmount += 1;
    updateOLED("set angle + 1");
    delay(200);
  }

  // 3. Send Button Pressed
  if (digitalRead(BTN_SEND) == LOW) {
    updateOLED("sending...");
    
    // Read current sensor (ACS712 raw analog value)
    rawCurrentVal = analogRead(CURRENT_PIN);

    if (WiFi.softAPgetStationNum() > 0) { 
      HTTPClient http;
      
      // GET Request to Node.js / Bun server
      String url = "http://" + String(server_ip) + ":3000/a/" + String(currentWaterAmount);
      http.begin(url);
      
      int httpCode = http.GET();
      
      if (httpCode > 0) {
        String payload = http.getString();
        lastAngleRx = payload; 

        // Convert received string response to an integer angle
        int targetAngle = payload.toInt(); 
        
        // Constrain angle to SG90 limits (0-180)
        targetAngle = constrain(targetAngle, 0, 180); 
        
        // ACTUATE SERVO! 🔄
        bladeServo.write(targetAngle); 
        
        updateOLED("Success (" + String(httpCode) + ")");
      } else {
        updateOLED("http error!!");
      }
      http.end();
    } else {
      updateOLED("no server :(");
    }
    
    delay(400); 
  }
}