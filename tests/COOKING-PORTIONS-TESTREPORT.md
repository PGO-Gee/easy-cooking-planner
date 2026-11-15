# Haushaltsportionen und Kochblöcke – 15. November 2026

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

Keine Liveprüfung auf einem echten iPhone oder in Safari. Kein Test mit zwei
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
