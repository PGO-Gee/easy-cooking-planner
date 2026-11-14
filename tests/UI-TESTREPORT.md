# UI-Umbau · Prüfbericht

Stand: 14. November 2026.

## Nachbesserungen nach iPhone-15-Pro-Rückmeldung

- Pinnadel und Titel der großen Gerichtskarte liegen in getrennten Rasterspalten, auch bei mehrzeiligen Namen. Der grüne Tagesbalken zeigt zentriert „Reste“.
- Ein durchgehend erreichbarer Kontokreis zeigt Initialen aus dem vorhandenen Anzeigenamen und öffnet Profil/Haushalt, Theme und weitere Kontoeinstellungen. Der Name wird für die Offlineanzeige pro Konto lokal gespeichert und nicht für Berechtigungen verwendet. Die Kontoeinträge entfallen im Planen-Menü und unten in der Desktop-Seitenleiste.
- Das Planen-Menü hat eine klar gegliederte Wochenauswahl und einen eigenen Misch-Button. Die untere Navigation liegt auf einer vollbreiten, bis zum unteren Rand deckenden Fläche einschließlich Safe-Area.
- Die Gerichtsuche erhält einen einzigen Fokusrahmen am Feldcontainer. 62 reproduzierbar erzeugte WebP-Kartenbilder mit 384 × 288 px benötigen insgesamt 1.050.758 statt 12.742.192 Byte der großen Originale (**91,8 % weniger**). Die ersten vier Karten laden sofort, weitere bei Annäherung; bei fehlendem WebP fällt die Anzeige auf das vorhandene kleine JPEG zurück. Generierung: `tools/build-recipe-card-images.py` mit Pillow.
- Die Einkaufseingabe bleibt beim Scrollen und im simulierten Tastaturzustand oben unter dem Kontokreis. Langes Drücken zeigt die Zuordnung drei Sekunden; ein besonders langes Halten darf den Artikel beim Loslassen nicht zusätzlich abhaken. Tastatur-/Rechtsklick-Aufrufe bleiben ohne Zeitlimit schließbar.
- Aktuelle App-Shell: **v124**, Asset-Version `20261114-2`.

Aktueller Prüfumfang: **177 Node-Tests** und **126 Browserkombinationen** (sieben Screens × neun Größen × Light/Dark). Zusätzlich zu den unten genannten Größen wurden **393 × 852** und **852 × 393 CSS-Pixel** geprüft. Gezielte Assertions kontrollieren getrennte Titel-/Aktionsspalten, Reste-Zentrierung, Initialen/Kontomenü, den Suchfokus, kleinere Bildquellen, die oben bleibende Eingabe, den bis zum unteren Rand deckenden Navigationsbereich sowie das zeitgesteuerte Pop-up. Dies sind Desktop-Chrome-Prüfungen; die echte iPhone-/Safari-Prüfung stammt weiterhin vom Nutzer.

## Umsetzung

Die sieben mobilen Referenzansichten und die ausgewählte Desktop-Wochenliste sind in die bestehende statische App integriert. Die übrigen Desktop-Ansichten sind aus den mobilen Vorlagen abgeleitet. `ui.js` bündelt die Darstellung und lokale Auswahlzustände; Planung, Rezepte, IndexedDB und Synchronisierung bleiben in den vorhandenen Modulen.

Der Zeitraum umfasst weiterhin sieben Tage ab heute. Mehrere Rezepte pro Tag, Fixierungen, Verschieben, Resteabende, Backrezepte, Mengenänderungen, Verlauf, Katalog und Import bleiben zugänglich. Abgehakte Einkaufsartikel behalten Position und angepasste Menge. Der Rezepteditor verwendet aufklappbare Abschnitte; seine Minutenangabe erhält auch Werte außerhalb der früheren Sliderstufen.

Die Shell-Version wurde auf **v123** erhöht und `ui.js` in den Offline-Cache aufgenommen. Ein bereits veralteter CSP-Hash des unveränderten Service-Worker-Startskripts wurde korrigiert; ein zusätzlicher Test verhindert erneutes Auseinanderlaufen von Skript und Hash.

## Ausgeführte Prüfungen

- **177 Node-Tests bestanden**, einschließlich bestehender Planungs-, Rezept-, Import-, Speicher- und Sync-Tests sowie neuer Tests für Fokusauswahl, Initialen und Offline-/Bild-Assets/CSP.
- **126 Browserkombinationen bestanden:** sieben Screens × neun Viewports × Light/Dark. Geprüft wurden 320 × 568, 390 × 844, 393 × 852, 430 × 932, 844 × 390, 852 × 393, 1024 × 768, 1280 × 800 und 1440 × 900 CSS-Pixel.
- Browser: Desktop-Google-Chrome **157.0.8103.78**, headless über Playwright; bei allen Kombinationen reduzierte Bewegung emuliert. Keine horizontalen Seitenüberläufe oder seitlich außerhalb des Viewports liegenden Formularbedienelemente festgestellt.
- Screenshots aller sieben Ansichten bei 390 und 1440 px in beiden Themes erzeugt; Wochenplan, Galerie, Rezept, Zubereiten-Auswahl, Kochmodus und Editor visuell anhand ausgewählter Aufnahmen kontrolliert.
- Desktop-Tagesauswahl, Rezeptdialog und Schließen mit Escape; Planen-Menü und Fokus-Rückgabe geprüft.
- Verschieben über das Aktionsmenü einschließlich erhaltener Fixierung geprüft. Die vorhandene Ziehlogik wird weiterhin verwendet; die Ziehgesten wurden in diesem Lauf nicht auf einem echten Touchgerät geprüft.
- Einkaufsreihenfolge nach dem Abhaken, Erhalt einer angepassten Menge, Gerichtzuordnung per Enter, langes Drücken ohne zusätzliches Abhaken sowie Abbruch durch Bewegung geprüft.
- Mehrere Rezepte pro Tag, Resteabend, freie Tage, ausschließlich freie Tage, langer eigener Rezeptname und fehlendes Foto als Testdaten verwendet.
- Editor bei 390 × 340 px, Öffnen des Zutatenabschnitts und Speichern einer exakten Minutenangabe geprüft. Bei fokussierter Einkaufseingabe und reduziertem Visual Viewport wird die feste Navigation ausgeblendet.
- **Lokale OCR tatsächlich ausgeführt:** synthetisches Rezeptbild hochgeladen, lokal erkannt und „250 g Reis“ im erkannten Text bestätigt. Es wurden keine Nutzerbilder verwendet.
- **Service-Worker-Update und Offline-Neustart tatsächlich geprüft:** in einem frischen Browserprofil eine ausschließlich vom lokalen Testserver simulierte Folgeversion installiert, über den bestehenden Updatepfad aktiviert und offline neu geladen. Gespeicherter Testplan und neue Oberfläche waren verfügbar.
- Keine JavaScript-Laufzeitfehler im Prüflauf. Keine Anmeldung mit einem echten Konto und keine Änderung produktiver Haushaltsdaten.

## Reproduzieren

```powershell
node --test tests/*.test.cjs
node tests/ui-browser.cjs
```

Für die Browserprüfung müssen Playwright und Google Chrome vorhanden sein. Falls Playwright nicht über den normalen Modulpfad erreichbar ist, `WOCHENTISCH_PLAYWRIGHT_MODULE` auf das installierte Playwright-Paket setzen. Der Test startet seinen eigenen lokalen HTTP-Server, verwendet isolierte Browserprofile und blockiert externe Seitenanfragen. Der OCR-Worker lädt ausschließlich lokale Projektdateien.

Screenshots und maschinenlesbarer Bericht liegen standardmäßig im ignorierten Verzeichnis `.ui-check/`. `WOCHENTISCH_UI_OUTPUT` kann ein anderes Ausgabeverzeichnis bestimmen. Die simulierte Folgeversion verändert keine Repositorydatei und veröffentlicht nichts.

## Grenzen

Keine echte iPhone-/Safari-, Home-Screen-PWA- oder reale iOS-Tastaturprüfung durchgeführt. Die geringe Viewporthöhe und die Visual-Viewport-Simulation ersetzen diese Geräteprüfung nicht. Safe-Area-Regeln sind implementiert, aber nicht an einem echten Displayausschnitt überprüft.

Kein neuer Ende-zu-Ende-Test gegen einen produktiven Supabase-Haushalt, keine realen Einladungen und keine tatsächliche Veröffentlichung. Die bestehenden automatisierten Sync-Tests bestehen; Sync- und Offline-Hinweise bleiben in der Oberfläche erhalten. OCR wurde mit einem synthetischen Bild geprüft, nicht erneut mit sämtlichen historischen Testbildern. Dies ist keine vollständige Screenreader- oder WCAG-Zertifizierung.
