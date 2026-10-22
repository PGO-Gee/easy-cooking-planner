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

Führe die SQL-Migrationen unter `supabase/migrations/` einmal im Supabase SQL Editor aus. Dazu gehören die Spalte für fixierte Gerichte (`20261022090000_pinned_meals.sql`) und der gespeicherte Resteabend-Status (`20261022110000_rest_days.sql`). Bestehende Gerichte bleiben standardmäßig nicht fixiert; bestehende Wochenpläne starten ohne Resteabende.

## Veröffentlichung mit GitHub Pages

Die Website besteht aus statischen Dateien und benötigt keinen Build-Schritt:

1. Im Repository **Settings → Pages** öffnen.
2. Unter **Build and deployment** die Quelle **Deploy from a branch** wählen.
3. Den vorgesehenen Veröffentlichungsbranch und den Ordner `/(root)` auswählen.

Änderungen am ausgewählten Branch werden anschließend von GitHub Pages veröffentlicht. Mit GitHub Free muss das Repository für GitHub Pages öffentlich sein. GitHub Pages unterstützt auch eine eigene Domain; die Domain registriert und bezahlt man separat.
