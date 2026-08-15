// unrelated to the actual research, just used to test out the oled
// made by gemini pro extended
// oh and i also dont know how to remove the .bin file in littlefs so... thats there forever i guess

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <LittleFS.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

#define SDA_PIN 2
#define SCL_PIN 0

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// Active frame buffer stored in RAM (1024 bytes)
uint8_t frameBuffer[1024] = {0};

// Exact target frame time for 30.0 FPS in microseconds!
// 1000000us / 30fps = 33333us per frame ✨
const unsigned long FRAME_TARGET_US = 33333;

void playDeltaVideo() {
  File videoFile = LittleFS.open("/bad_apple.bin", "r");
  if (!videoFile) {
    Serial.println("miku cant open the file");
    
    display.clearDisplay();
    display.setCursor(0, 28);
    display.println(F("miku cant open the file"));
    display.display();
    return;
  }

  // Reset active frame buffer to all black
  memset(frameBuffer, 0, sizeof(frameBuffer));

  // Stream and decode delta changes
  while (videoFile.available() >= 2) {
    unsigned long frameStartUs = micros(); // ⏱️ Microsecond timer!

    // 1. Read total number of byte changes in this frame
    uint16_t changeCount = 0;
    videoFile.read((uint8_t*)&changeCount, 2);

    // 2. Read each [2 bytes index, 1 byte value] update
    for (uint16_t c = 0; c < changeCount; c++) {
      uint16_t byteIdx = 0;
      uint8_t newVal = 0;
      
      videoFile.read((uint8_t*)&byteIdx, 2);
      videoFile.read(&newVal, 1);

      // Apply update directly to active frame buffer
      if (byteIdx < 1024) {
        frameBuffer[byteIdx] = newVal;
      }
    }

    // 3. Render updated frame buffer to screen
    display.drawBitmap(0, 0, frameBuffer, 128, 64, SSD1306_WHITE, SSD1306_BLACK);
    display.display();

    // 🌸 High-precision microsecond auto-sync delay calculation!
    unsigned long elapsedUs = micros() - frameStartUs;
    if (elapsedUs < FRAME_TARGET_US) {
      delayMicroseconds(FRAME_TARGET_US - elapsedUs);
    } else {
      yield(); // If rendering took longer than 33333us, don't delay!
    }
  }

  videoFile.close();

  // Show finished text!
  display.clearDisplay();
  display.setCursor(0, 28);
  display.println(F("hey get back to studying"));
  display.display();
}

void setup() {
  Serial.begin(115200);

  // Initialize High-Speed I2C (SDA=2, SCL=0)
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(800000); // 800 kHz fast I2C clock

  // Initialize SSD1306 Display
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("SSD1306 allocation failed!"));
    for (;;);
  }

  // Initialize LittleFS Flash Storage
  if (!LittleFS.begin(true)) {
    Serial.println("An Error has occurred while mounting LittleFS");
    return;
  }

  // Display Ready Screen
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(15, 28);
  display.println(F("Starting in 1s..."));
  display.display();

  // Wait 1 second before playing automatically! ✨
  delay(1000);

  Serial.println("playing the video...");
  playDeltaVideo();
}

void loop() {
  // Nothing needed here! Everything runs automatically on setup!
}
