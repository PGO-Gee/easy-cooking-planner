# Haushaltsportionen und Kochblöcke – 15. November 2026

## Ergänzung: sichtbare Fixierung, mittiger Gerichtdialog und Drag-Undo

- Pinnadeln erscheinen rechts an allen Gerichten. Aktive Fixierungen sind mit
  Hintergrund und gefülltem Symbol markiert; die Ziele bleiben mindestens 44 × 44 px.
- „Kochmenge ändern“ trägt ein Kochtopf-Symbol. Der Gerichtdialog ist im
  verfügbaren Visual Viewport zentriert und bei kleiner Höhe weiterhin scrollbar.
- Drag & Drop bewahrt die vollständige Rückgängig-Aktion des Kochplanmodells.
  Die ältere Rückgängig-Aktion für nur zwei Tage überschrieb diese zuvor und
  ließ weitergeschobene Gerichte beim Zurücksetzen als Duplikate stehen.
- 213 Node-Tests bestanden, einschließlich dreimaligem Verschieben und Undo
  mit Verdrängung mehrerer Kochblöcke über einen Wochenwechsel und Restetagen.
- Im Browser tatsächlich per Maus dreimal auf einen belegten Tag gezogen und
  den Toast-Button „Rückgängig“ betätigt: jedes Mal identischer Ausgangsplan.
  Fixieren eines späteren Gerichts über das Menü, sichtbare rechte Pinnadel
  und direktes Aufheben der Fixierung ebenfalls geprüft.
- 50 gezielte und 126 allgemeine Browserkombinationen bestanden. Größen:
  320 × 568, 390 × 844, 393 × 852, 430 × 932, 844 × 390, 852 × 393,
  1024 × 768, 1280 × 800, 1440 × 900 sowie gezielt 390 × 360; Light/Dark
  und reduzierte Bewegung. Zentrierung vor dem Ausklappen der Kochmenge
  gemessen; Menü-Screenshots in beiden Themes bei 390 × 844 visuell geprüft.
- Keine echte iPhone-/Safari- oder iOS-Tastaturprüfung. Die geringe Höhe
  simuliert verfügbaren Eingabeplatz. App-Shell v136, UI-Assets `20261115-8`.

## Ergänzung: Haushalt als Planungsstandard und gemeinsamer Gerichtdialog

- „7 Tage mischen“ und die einzelne Gerichtauswahl verwenden den Haushalt
  für einen Tag. Frühere individuelle Portions- oder Tagesvorgaben werden
  beim Mischen ignoriert. Ohne eingerichteten Haushalt gilt die Rezeptmenge.
- Die Drei-Punkte-Aktion entfällt. Klick, Tipp oder Enter auf eine Gerichtskarte
  öffnen denselben Dialog mit Rezeptzugang, Kochmenge und Planaktionen.
- „Für zwei Tage kochen“ übernimmt die Portionen pro Tag und legt nach dem
  Speichern einen verknüpften Restetag an. Belegte Folgetage werden verschoben;
  Fixierungen bleiben geschützt. Einkaufsmengen und Rückgängig bleiben erhalten.
- 211 Node-Tests bestanden. Der gezielte Browserlauf prüft außerdem
  Haushaltsvorgabe, sieben einzelne Kochtage, Restetag samt Verschieben,
  500-g-Einkaufsbedarf, Mengenkorrektur, Offline-Speicherung und Rückgängig.
- 50 Browserkombinationen: Haushalt, Planen, Gerichtdialog, Reste und Einkauf
  bei 320 × 568, 390 × 844, 844 × 390, 1440 × 900 und 390 × 360 CSS-Pixeln,
  jeweils Light/Dark und reduzierte Bewegung. Gerichtdialog per Enter auch am
  Desktop geprüft; Eingabe und erreichbares Speichern bei reduzierter Höhe.
- Screenshots des hellen Gerichtdialogs und des dunklen Planen-Dialogs bei
  390 × 844 visuell geprüft. Keine echte iPhone-/Safari- oder iOS-Tastaturprüfung;
  390 × 360 simuliert ausschließlich den verfügbaren Platz bei Tastatureingabe.
- Zusätzlich besteht der vorhandene UI-Regressionstest mit 126 Kombinationen
  bei 320 × 568, 390 × 844, 393 × 852, 430 × 932, 844 × 390, 852 × 393,
  1024 × 768, 1280 × 800 und 1440 × 900, jeweils Light/Dark und reduzierte
  Bewegung. Desktop-Rezeptzugang aus dem Gerichtdialog, Verschieben mit
  erhaltener Fixierung, lokaler OCR-Smoke-Test und Offline-Neustart nach
  Service-Worker-Update bestanden ebenfalls.
- App-Shell auf v132 und geänderte UI-Assets auf `20261115-4` erhöht.

Die folgenden Abschnitte dokumentieren den vorherigen Stand.

## Ergebnis

Implementiert sind Haushaltsgröße mit anpassbarem Kinderfaktor, Portions- und
Tagesauswahl, verknüpfte Restetage, Verschieben vollständiger Kochblöcke,
rezeptbasierte Einkaufsmengen und Korrekturen je Einkaufswoche. Die neue
Datenbankmigration wurde am **15. November 2026 auf die verbundene
Supabase-Datenbank angewendet**. Der Server führt sie als
`20261115140525_household_cooking_portions`; die lokale Quelldatei heißt
`20261115095535_household_cooking_portions.sql`.

## Tatsächlich ausgeführte Prüfungen

- `node --test tests/*.test.cjs`: 205 Tests bestanden. Neue Fälle prüfen unter
  anderem 2 Erwachsene + 1 Kind = 2,5 Portionen, 2 Tage = 5 Kochportionen,
  200 g bei zwei Basisportionen = 500 g Einkaufsbedarf, Einheitenumrechnung,
  fehlende Mengen, mehrfache Rezeptvorkommen, Wochenwechsel, stabile IDs,
  Fixierungen, Verschiebeketten einschließlich manueller Restetage, entfernte
  Restetage und geschützte Tage bei automatischer Planung.
- `tools/test-cooking-sync.cjs` mit PGlite 0.3.14: vollständige Migration in
  einer isolierten PostgreSQL-Datenbank installiert. Synthetische Daten werden
  zurückgerollt. Geprüft wurden v3-Lesen/Schreiben, Haushaltsvorgaben,
  Mengenüberschreibungen, Wochenwechsel, Request-Wiederholung,
  atomare Plankonflikte, Konfliktauflösung, konkurrierendes Rezeptlöschen,
  ungültige Eingaben, Haushaltszugriff und Schutz vor älteren Plan-Writern.
- `tests/cooking-planner-browser.cjs` mit Chromium Headless Shell 143:
  50 neue Ansichts-/Theme-Prüfungen bestanden. Haushalt über das Formular
  gespeichert; Gericht für zwei Tage eingetragen; 500 g auf 600 g korrigiert
  und zurückgesetzt; IndexedDB-Zustand erneut geladen; automatische Planung
  und Änderung einzelner Kochmengen ausgeführt.
- `tests/ui-browser.cjs`: 126 bestehende Ansichts-/Theme-Prüfungen sowie
  Interaktions- und Offlineprüfungen bestanden, einschließlich manueller
  Einkaufsmengen, Desktop-Rezeptdialog, Verschieben mit Fixierung,
  Touch-Halten, Rezepteditor, lokalem OCR-Test und Service-Worker-Update
  mit anschließendem Offline-Neuladen.
- Screenshots der neuen Ansichten visuell geprüft. Dabei gefundene Überlagerung
  von Zutatenname und unbekannter Mengenangabe korrigiert; anschließender
  Browsertest prüft auch die Trennung dieser Bereiche.
- `git diff --check`: ohne Befund.

Neue Ansichten wurden bei **320×568, 390×844, 844×390, 1440×900 und 390×360**
geprüft, jeweils in Light/Dark und mit `prefers-reduced-motion: reduce`.
Die bestehende Matrix deckt zusätzlich 393×852, 430×932, 852×393,
1024×768 und 1280×800 ab. Bedienelemente der neuen Portionsauswahl wurden auf
mindestens 44 px Höhe, Formulareingaben auf die vorhandenen 16-px-Stile und
horizontales Überlaufen geprüft. Die 390×360-Ansicht simuliert weniger Platz
bei Tastatureingabe; der Speichern-Button blieb durch Scrollen erreichbar.

## Grenzen

Die ursprüngliche Abnahme erfolgte ohne Liveprüfung auf einem echten iPhone
oder in Safari; die spätere Prüfung im Device Hub ist unten dokumentiert. Kein Test mit zwei
realen angemeldeten Haushaltsgeräten; Sync-Konflikte wurden automatisiert mit
synthetischen Daten geprüft. Die Migration ist live angewendet; die
Veröffentlichung der App-Oberfläche ist nicht Teil dieses Migrationsschritts.

Das gesamte Kalendergerüst bildet in v3 eine gemeinsame Konflikteinheit, damit
Verschiebungen über Wochen hinweg atomar bleiben. Gleichzeitige Änderungen
an verschiedenen Tagen können deshalb ebenfalls eine Konfliktentscheidung
benötigen. Bereits gespeicherte alte Konfliktentscheidungen bleiben an ihre
API-Version gebunden und können bei geschützten Planänderungen abgelehnt
werden; sie werden nicht stillschweigend überschrieben.

## Wiederholen

```sh
node --test tests/*.test.cjs
WOCHENTISCH_PGLITE_MODULE=/path/to/@electric-sql/pglite node tools/test-cooking-sync.cjs
WOCHENTISCH_PLAYWRIGHT_MODULE=/path/to/playwright node tests/cooking-planner-browser.cjs
WOCHENTISCH_PLAYWRIGHT_MODULE=/path/to/playwright WOCHENTISCH_BROWSER_CHANNEL=bundled node tests/ui-browser.cjs
```

Für die Browserprüfungen muss ein zum Playwright-Modul passender Chromium-Browser
installiert sein. `PLAYWRIGHT_BROWSERS_PATH` und `WOCHENTISCH_UI_OUTPUT` können auf
einen temporären Ordner zeigen. Es werden ausschließlich lokale Fixtures genutzt.

## Verifikation nach der Live-Migration

- Die Migration ist in `supabase_migrations.schema_migrations` als
  `20261115140525_household_cooking_portions` eingetragen.
- Die SQL-Integrationstests aus `tests/sync-cooking-v3.sql` wurden zusätzlich
  auf der verbundenen Datenbank in einer vollständig zurückgerollten
  Transaktion ausgeführt. Dafür wurde ein synthetischer Auth-Benutzer ebenfalls
  ausschließlich innerhalb dieser Transaktion angelegt. Alle Prüfungen
  bestanden; anschließend waren keine Testbenutzer mehr vorhanden.
- Neue v3-RPCs sind für `authenticated` ausführbar und für `anon` gesperrt.
  Die private Tabelle hat RLS und keine direkten Leserechte für Clients.
  `households` ist Teil der Realtime-Veröffentlichung.
- Die Supabase-Sicherheitsprüfung meldet für die neue private Tabelle den
  erwarteten [Hinweis auf RLS ohne direkte Client-Policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
  und für die drei bewusst bereitgestellten, mit Haushaltsprüfung geschützten
  RPCs den [Hinweis auf SECURITY-DEFINER-Funktionen](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
  Der bereits vor der Migration vorhandene Hinweis auf
  [deaktivierten Schutz vor kompromittierten Passwörtern](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
  bleibt unverändert; Auth-Einstellungen wurden nicht geändert.

## Korrektur: Restetage trotz „1 Tag“

Am 15. November 2026 auf dem echten **iPhone 15 Pro, iOS 27.2.1**, über den
Device Hub in der geöffneten App reproduziert (Light, Hochformat):

- Der Planungsdialog zeigte „1 Tag“ und „2,5 Portionen × 1 Tag“.
- Auch nach erneutem „7 Tage mischen“ standen zwischen den vier Gerichten
  weiterhin die alten, eigenständigen Restemarkierungen.
- „Rückgängig“ wurde mit „Der Plan wurde inzwischen geändert“ abgelehnt. Die
  vier ursprünglichen Gerichte wurden anschließend über die Oberfläche wieder
  auf ihren ursprünglichen Tagen eingetragen und die Testgerichte entfernt.

Ursache des Restetagefehlers war die Behandlung eigenständiger Restemarkierungen
als geschützte Tage bei jeder neuen Planung. Die Korrektur ersetzt sie innerhalb
des neu geplanten Zeitraums. Verknüpfte Restetage von beibehaltenen, fixierten
oder vor dem Zeitraum begonnenen Kochblöcken bleiben erhalten. Eigenständige
Restetage außerhalb des Zeitraums bleiben unverändert.

Zusätzlich vergleicht der Rückgängig-Schutz jetzt den tatsächlichen Planinhalt,
ohne leere Wochen und aufgefüllte `false`-Fixierungen aus einem Cloud-Abgleich
als nachträgliche Bearbeitung zu behandeln. Echte Änderungen bleiben geschützt.

Nach der Korrektur bestanden **211 Node-Tests** und die **50 Browserprüfungen**
für die neue Funktion. Hinzu kamen automatisierte Fälle für alte Restemarkierungen
bei Ein-Tages-Planung, den Wechsel von zwei auf einen Tag, unveränderte Restetage
außerhalb des Zeitraums und Rückgängig nach einem simulierten Cloud-Abgleich.
Der Fehler wurde auf dem iPhone bestätigt; die Korrektur wurde lokal geprüft und
noch nicht auf der veröffentlichten iPhone-App getestet. Keine zusätzliche
Datenbankmigration erforderlich.

## Kürzere Texte und kompakter Planungsdialog

Restetage tragen in der Übersicht und im Restedialog nur noch „Reste“; der
Rezeptbezug bleibt für die Aktionen erhalten. Der Dialog „7 Tage planen“ zeigt
Portionsauswahl, Kochdauer, eine kurze Rechnung und optionale Vorräte. Lange
Erklärungen, doppelte Überschriften und der leere Auswahlkasten entfallen.
Beim Öffnen wird kein Zutatenfeld fokussiert und damit keine Tastatur angefordert.

211 Node-Tests und 50 Chromium-Prüfungen bestanden. Der Standarddialog passt
auch mit einer ausgewählten Zutat bei 320×568 und 390×844 vollständig in den
Viewport, einschließlich Speichern-Button, jeweils in Light und Dark. Weitere
Prüfungen: 844×390, 1440×900 und 390×360 mit reduziertem Platz bei Eingabe sowie
`prefers-reduced-motion: reduce`. Screenshots in Light/Dark visuell geprüft.
Viele ausgewählte Vorräte und kleine Querformat-/Tastaturansichten bleiben
scrollbar. Diese Text-/Layoutänderung wurde lokal geprüft, nicht erneut auf dem
physischen iPhone. Keine Datenbankänderung erforderlich.
