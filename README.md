# Wochentisch

Eine statische Web-App zum Planen der Mahlzeiten für die Woche. Die App bietet Wochenplanung, eine eigene Gerichtesammlung und einen Einkaufszettel. Sie ist für eine geschlossene Testphase mit ausgewählten Nutzer:innen vorgesehen.

## Lokal starten

Im Projektverzeichnis einen lokalen HTTP-Server starten, zum Beispiel:

```sh
python3 -m http.server 8000
```

Anschließend <http://localhost:8000> im Browser öffnen.

## Anmeldung und Daten

Die Anmeldung erfolgt über Supabase Auth. Nutzerkonten werden für die geschlossene Testphase manuell angelegt; öffentliche Registrierungen sind nicht vorgesehen. Gerichte, Wochenpläne und Einkaufszettel werden in Supabase gespeichert und innerhalb eines Haushalts synchronisiert. Der Browser speichert zusätzlich einen lokalen Zustand und ein Backup.

`supabase-config.js` enthält die Supabase-Projekt-URL und den öffentlichen Publishable Key, den die Browser-App benötigt. Diese Werte sind keine Geheimnisse. Einen Supabase Secret Key oder `service_role`-Key niemals in die Website oder ins Repository eintragen.

Die SQL-Dateien unter `supabase/migrations/` dokumentieren die Einrichtung und Änderungen des Supabase-Datenbankschemas. Sie werden nicht als Teil des GitHub-Pages-Deployments ausgeführt.

Bei einer Neueinrichtung führe die SQL-Migrationen unter `supabase/migrations/` einmal im Supabase SQL Editor aus. Dazu gehören die Spalte für fixierte Gerichte (`20261022090000_pinned_meals.sql`), der gespeicherte Resteabend-Status (`20261022110000_rest_days.sql`), die haushaltsweit synchronisierten Einkaufszettel-Mengen (`20261023120000_shopping_quantities.sql`) und ausgeblendete Einträge auf dem Einkaufszettel (`20261024213131_shopping_hidden_items.sql`). Die Realtime-Veröffentlichung samt Mengen-Merge (`20261024191810_household_realtime_and_quantity_merge.sql`) ist bereits auf dem verbundenen Supabase-Projekt angewendet. Bei einer anderen, neuen Supabase-Instanz muss sie nach den vorherigen Migrationen einmal ausgeführt werden. Bestehende Gerichte bleiben standardmäßig nicht fixiert; bestehende Wochenpläne starten ohne Resteabende.

## Offline-Start und Haushalts-Sync

Wochentisch enthält ein Web-App-Manifest, Icons für den Home-Bildschirm und einen Service Worker für den Offline-Start. Öffne die App nach der Veröffentlichung einmal mit Internetverbindung und melde dich an. Danach stehen Wochenplan, eigene Gerichte und Einkaufsliste offline zur Verfügung. Der Standardkatalog wird beim ersten Onlineabruf lokal zwischengespeichert; offline übernommene Gerichte werden mit stabiler lokaler ID vorgemerkt und beim nächsten Abgleich synchronisiert.

App-Zustand, letzter Cloud-Stand, Katalog und ungelöste Konflikte liegen in IndexedDB. Vorhandene App-Daten aus `localStorage` werden beim ersten Start übernommen. Änderungen werden beim Wiederherstellen der Verbindung sowie beim Öffnen oder Zurückkehren zur App abgeglichen. In der installierten iPhone-PWA startet ein Ziehen nach unten an beliebiger Stelle den Abgleich und lädt die App danach neu, sofern die Seite bereits ganz oben steht. Eingabefelder und geöffnete Dialoge behalten ihre normale Bedienung. Treffen Änderungen aufeinander, bleiben beide Fassungen zur Auswahl erhalten. Anmeldung, Haushaltseinladungen und Beitritt benötigen weiterhin Internet. Ein Abgleich bei geschlossener App wird nicht zugesichert. Ein bereitgestelltes App-Update erscheint als Hinweis und wird erst nach Antippen aktiviert.

## Veröffentlichung mit GitHub Pages

Die Website besteht aus statischen Dateien und benötigt keinen Build-Schritt:

1. Im Repository **Settings → Pages** öffnen.
2. Unter **Build and deployment** die Quelle **Deploy from a branch** wählen.
3. Den vorgesehenen Veröffentlichungsbranch und den Ordner `/(root)` auswählen.

Änderungen am ausgewählten Branch werden anschließend von GitHub Pages veröffentlicht. Mit GitHub Free muss das Repository für GitHub Pages öffentlich sein. GitHub Pages unterstützt auch eine eigene Domain; die Domain registriert und bezahlt man separat.
