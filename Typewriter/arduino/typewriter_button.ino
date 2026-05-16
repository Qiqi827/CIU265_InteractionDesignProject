/*
 * Typewriter publish button for exhibition newsroom.
 * Wire a momentary button between pin 2 and GND (use INPUT_PULLUP).
 * On press, sends "PUBLISH" over Serial at 9600 baud.
 */

const int BUTTON_PIN = 2;
const unsigned long DEBOUNCE_MS = 400;

bool lastReading = HIGH;
unsigned long lastPublishAt = 0;

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  Serial.begin(9600);
  while (!Serial) {
    ;
  }
}

void loop() {
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
