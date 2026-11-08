# Screenshot-Import: Prüfung vom 8. November 2026

## Umgebung

- Lokaler macOS-Rechner, isolierte Playwright-Browserprofile ohne Anmeldung.
- Chromium 151.0.7922.34 und WebKit 26.5 (Playwright-Build 2336).
- Viewports: 320 × 568, 375 × 812, 812 × 375, 1280 × 800 und 375 × 360.
- Light-/Dark-Theme, reduzierte Bewegung, Hoch-/Querformat. Screenshots visuell
  kontrolliert; horizontalen Überlauf automatisch geprüft.
- 375 × 360 simuliert einen verringerten sichtbaren Bereich. **Kein echtes
  iPhone, kein mobiles Safari und keine tatsächlich geöffnete iOS-Tastatur
  geprüft.** Speicherverhalten und Dauer auf einem echten iPhone bleiben offen.

## Durchgeführte Fälle

- Echte lokale OCR mit zwei Rezeptbildern und einem leeren Bild: zehn Zutaten,
  sechs Schritte, getrennte Mandel-Mengen 150 g und 50 g; Backform bleibt ohne
  Portionsbasis. Leeres Bild erhält eine eigene Fehlermeldung.
- Der ursprüngliche, lokal bereitgestellte Social-Media-Screenshot wird zusätzlich
  geprüft. Chromium und WebKit erkennen nach Layoutaufbereitung zehn Zutaten und sechs
  Schritte; Backform und Aufbewahrungstipp werden nicht als Portion/Schritt
  übernommen. Name bleibt offen. Das Benutzerbild wird nicht ins Repository
  aufgenommen; optionaler Pfad über `OCR_ORIGINAL_SCREENSHOT`.
- Vollimport und alle drei Bereichsimporte, Sortieren, Anhängen an vorhandenen
  Text, Textkorrektur, Abbruch, Schließen/erneutes Öffnen, beschädigtes Bild.
- PNG, JPEG und WebP durch echte Browserdekodierung und OCR verarbeitet;
  wiederholte Zutaten bleiben getrennt. Auswahl oberhalb von fünf Bildern
  wird abgewiesen, ohne die vorhandene Auswahl zu verändern.
- Rezept entsteht erst beim Speichern; Duplikat wird abgewiesen. Gespeicherte
  Rezeptdaten enthalten weder Screenshot-Dateinamen noch Quelltext.
- Erstdownload erfolgt erst beim Start der OCR. Erfolgreicher Offline-Neustart
  und erneute OCR mit abgeschaltetem isoliertem Ursprungsserver. Ein absichtlich
  gelöschtes Sprachmodell führt zur verständlichen Offline-Fehlermeldung.
- Externe Seitenanfragen sind im Test blockiert. Die OCR verwendet ausschließlich
  GET-Anfragen für eigene statische Dateien; keine Bild-/Textübertragung.
- Unit-Tests prüfen zusätzlich Datei-/Pixelgrenzen, JPEG/WebP-Header,
  Asset-Prüfsummen, sequenzielle Verarbeitung, Abbruch während der Initialisierung,
  unterbrochene Downloads und konservative Layoutaufbereitung.
- Gesamte Node-Test-Suite: **127 Tests erfolgreich**. Beide Browserdurchläufe
  erfolgreich, einschließlich Originalbild und Offline-Fehlerfall.

## Beobachtete Grenzen

- OCR macht Zeichenfehler. Im synthetischen dunklen Nährwertbild wurde `12 g`
  beispielsweise als `129` beziehungsweise `129g` gelesen; `Öl` teilweise als
  `ÖI`. Solche Werte werden **nicht automatisch korrigiert**. Der bearbeitbare
  Text und die Bildvorschau müssen vor der Übernahme geprüft werden. Der Test
  korrigiert die Nährwerte ausdrücklich vor dem Bereichsimport.
- Im ursprünglichen Screenshot können dekorative Zeichen am Satzende bleiben.
  Die Layoutaufbereitung entfernt nur isolierte Symbolreste vor eindeutigen
  Überschriften/Mengen und rekonstruiert wiederholte Einzüge als Absatzgrenzen.
  Die unbearbeitete Erkennung bleibt im Import aufrufbar.
- Der synthetische Durchgang benötigte auf diesem Desktop etwa 0,7–1,0 Sekunden
  einschließlich lokalem Erstdownload. Daraus folgt keine Laufzeitzusage für
  iPhones, langsame Netze oder große Bilder.
- Playwrights WebKit-Offlinesimulation scheitert an einem bekannten Fehler,
  auch bei direkt vom Service Worker gelieferten Antworten:
  https://github.com/microsoft/playwright/issues/42775
  Deshalb wird für den belastbaren Offlinetest der eigene Testserver beendet.

## Wiederholen

```sh
node --test tests/*.test.cjs
# Playwright und dessen Browser müssen lokal installiert sein.
OCR_MANAGED_SERVER=1 node tests/ocr-browser.cjs
OCR_MANAGED_SERVER=1 OCR_BROWSER=webkit node tests/ocr-browser.cjs
```

`OCR_BROWSER_EXECUTABLE` kann einen eigenen Chromium-Pfad setzen;
`OCR_TEST_OUTPUT` bestimmt das Verzeichnis für Screenshots und Request-Protokoll.
Ohne verwalteten Testserver wird `OCR_BASE_URL` (Standard: localhost:8765)
verwendet. In diesem Modus ist der Offline-Neuladetest für Chromium vorgesehen.
