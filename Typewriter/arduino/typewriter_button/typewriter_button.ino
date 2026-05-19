/*
 * Typewriter publish button + status LED for exhibition newsroom.
 * Button: momentary between D2 and GND (INPUT_PULLUP). Sends PUBLISH on press.
 * LED: D9 — HIGH = waiting to publish, LOW = idle.
 * Serial 9600: host may send LIGHT_ON / LIGHT_OFF (newline-terminated).
 */

const int BUTTON_PIN = 2;
const int LED_PIN = 9;
const unsigned long DEBOUNCE_MS = 400;

bool lastReading = HIGH;
unsigned long lastPublishAt = 0;

void setLed(bool on) {
  digitalWrite(LED_PIN, on ? HIGH : LOW);
}

void handleHostCommand(const String& cmd) {
  if (cmd == "LIGHT_ON") {
    setLed(true);
  } else if (cmd == "LIGHT_OFF") {
    setLed(false);
  }
}

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  setLed(false);
  Serial.begin(9600);
  while (!Serial) {
    ;
  }
}

void loop() {
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.length() > 0) {
      handleHostCommand(cmd);
    }
  }

  bool reading = digitalRead(BUTTON_PIN);

  if (reading == LOW && lastReading == HIGH) {
    unsigned long now = millis();
    if (now - lastPublishAt > DEBOUNCE_MS) {
      Serial.println("PUBLISH");
      lastPublishAt = now;
    }
  }

  lastReading = reading;
}
