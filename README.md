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

`supabase-config.js` enthält die Supabase-Projekt-URL und den öffentlichen Publishable Key, den die Browser-App benötigt. Diese Werte sind öffentlich. Bei einem Projektwechsel muss der neue Supabase-Host auch im `connect-src` der Content Security Policy in `index.html` stehen. Einen Supabase Secret Key oder `service_role`-Key niemals in die Website oder ins Repository eintragen.

Die SQL-Dateien unter `supabase/migrations/` dokumentieren die Einrichtung und Änderungen des Supabase-Datenbankschemas. Sie werden nicht als Teil des GitHub-Pages-Deployments ausgeführt.

Bei einer Neueinrichtung führe die SQL-Migrationen unter `supabase/migrations/` einmal in Zeitstempelreihenfolge im Supabase SQL Editor aus. Dazu gehören die Spalte für fixierte Gerichte (`20261022090000_pinned_meals.sql`), der gespeicherte Resteabend-Status (`20261022110000_rest_days.sql`), die haushaltsweit synchronisierten Einkaufszettel-Mengen (`20261023120000_shopping_quantities.sql`), ausgeblendete Einträge auf dem Einkaufszettel (`20261024191810_household_realtime_and_quantity_merge.sql`) und ausgeblendete Einkaufszettel-Artikel (`20261024213131_shopping_hidden_items.sql`) sowie der Kochassistent samt Katalogverwaltung (`20261103175353_recipe_cooking_catalog.sql`, `20261103175442_index_dishes_catalog_source_id.sql`, `20261103183928_create_catalog_dish_v1.sql`). Die Realtime-Veröffentlichung samt Mengen-Merge ist bereits auf dem verbundenen Supabase-Projekt angewendet; bei einer neuen Instanz muss sie nach den vorherigen Migrationen ausgeführt werden. Die Rezeptmigration ergänzt den vorhandenen Katalog einmalig und erhält alte Gerichtsdaten. `20261106161742_harden_household_access_and_sync.sql` schränkt die Datenbankrechte ein und ergänzt den lesenden Haushaltsabgleich.

## Offline-Start und Haushalts-Sync

Wochentisch enthält ein Web-App-Manifest, Icons für den Home-Bildschirm und einen Service Worker für den Offline-Start. Öffne die App nach der Veröffentlichung einmal mit Internetverbindung und melde dich an. Danach stehen Wochenplan, eigene Gerichte und Einkaufsliste offline zur Verfügung. Der Standardkatalog wird beim ersten Onlineabruf lokal zwischengespeichert; offline übernommene Gerichte werden mit stabiler lokaler ID vorgemerkt und beim nächsten Abgleich synchronisiert.

App-Zustand, letzter Cloud-Stand, ausstehende Anfragen, Katalog und ungelöste Konflikte liegen in IndexedDB. Der lokale App-Zustand ist nach Konto getrennt. Die neue Synchronisierung verwendet einen eigenen lokalen Speicher; Daten aus älteren Entwicklungsversionen werden nicht übernommen. Änderungen werden beim Wiederherstellen der Verbindung sowie beim Öffnen oder Zurückkehren zur App abgeglichen. Supabase führt den Drei-Wege-Abgleich aus und gibt Konflikte zur Entscheidung zurück; Requests werden bei Verbindungsabbrüchen mit derselben ID wiederholt. In der installierten iPhone-PWA startet ein Ziehen nach unten an beliebiger Stelle den Abgleich und lädt die App danach neu, sofern die Seite bereits ganz oben steht. Anmeldung, Haushaltseinladungen und Beitritt benötigen weiterhin Internet. Ein Abgleich bei geschlossener App wird nicht zugesichert. Ein bereitgestelltes App-Update erscheint als Hinweis und wird erst nach Antippen aktiviert. Bei jeder Veröffentlichung mit Änderungen am App-Shell-Cache muss die Versionsnummer in `service-worker.js` erhöht werden. Der Schnittstellenvertrag steht in `supabase/SYNC-CONTRACT.md`.

Zutaten werden über einen gepflegten Alias-Katalog vereinheitlicht. Er führt bekannte Schreibweisen und ausgewählte Varianten wie `Zwiebel`/`Zwiebeln`, Rindfleischzuschnitte, Reissorten und Käsesorten auf gemeinsame Namen zurück; unbekannte eigene Einträge bleiben erhalten. Lokale Daten werden beim Start bereinigt, vorhandene Haushaltsdaten bei der nächsten erfolgreichen Synchronisierung. Kataloggerichte werden beim Laden, Zwischenspeichern und Übernehmen kanonisiert. Für neue oder bestehende Standardkatalogdaten kann `catalog_additions.sql` einmal im Supabase SQL Editor ausgeführt werden; das Skript normalisiert vorhandene Zutaten und fügt fehlende Kataloggerichte idempotent hinzu. Das Datenbankschema bleibt unverändert.

## Veröffentlichung mit GitHub Pages

Die Website besteht aus statischen Dateien und benötigt keinen Build-Schritt:

1. Im Repository **Settings → Pages** öffnen.
2. Unter **Build and deployment** die Quelle **Deploy from a branch** wählen.
3. Den vorgesehenen Veröffentlichungsbranch und den Ordner `/(root)` auswählen.

Änderungen am ausgewählten Branch werden anschließend von GitHub Pages veröffentlicht. Mit GitHub Free muss das Repository für GitHub Pages öffentlich sein. GitHub Pages unterstützt auch eine eigene Domain; die Domain registriert und bezahlt man separat.

## Backrezepte

Die Migration `20261107203423_baking_recipe_type.sql` vor der Veröffentlichung der zugehörigen App-Version auf die Datenbank anwenden. Sie ergänzt die Rezeptart für Haushalts- und Katalogrezepte und fügt zehn Backrezepte zum Standardkatalog hinzu. Bereits vorhandene Rezepte bleiben Gerichte. Backrezepte erscheinen erst nach Übernahme in die eigene Sammlung im Wochenplan und werden beim Mischen erhalten.
