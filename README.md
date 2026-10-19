# Wochentisch

Eine kleine, statische Webapp zum Planen der Mahlzeiten für die Woche.

## Lokal starten

`index.html` über einen lokalen HTTP-Server öffnen.

## Anmeldung und Speicherung

Die App verwendet für die geschlossene Testphase E-Mail/Passwort-Login über Supabase Auth. Neue Konten werden nur im Supabase-Dashboard angelegt; öffentliche Registrierungen bleiben deaktiviert. Projekt-URL und Publishable Key stehen in `supabase-config.js`; diese Browserwerte sind öffentlich. Niemals einen Supabase Secret Key oder `service_role`-Key in die Website oder das Repository eintragen.

Gerichte, Wochenpläne und Einkaufszettel werden in Supabase gespeichert und zwischen Mitgliedern desselben Haushalts synchronisiert. Die lokale Speicherung dient zusätzlich als Browserzustand und Backup.

## Supabase-Datenbank

Die Migrationen liegen in `supabase/migrations/`. `20261017_initial_schema.sql` erstellt Haushalte, Mitgliedschaften, Gerichte, Wochenpläne und Einkaufslisten. `20261019_restore_household.sql` stellt bei Bedarf einen fehlenden Haushalt wieder her. `20261019_household_join_codes.sql` ergänzt 12-stellige, 30 Minuten gültige, einmalige Beitrittscodes. Pro Haushalt ist jeweils nur der zuletzt erstellte Code gültig. Ein angemeldetes Haushaltsmitglied kann ihn direkt teilen; eingelöste Codes fügen das zweite Konto dem Haushalt hinzu. Der vorherige private Haushalt bleibt bestehen. Row Level Security erlaubt Zugriff auf gemeinsame Daten nur für Haushaltsmitglieder.

Führe alle Migrationen in zeitlicher Reihenfolge im Supabase Dashboard unter **SQL Editor** aus.

`datenschutz.html` enthält einen Entwurf der Datenschutzerklärung. Vor einer Veröffentlichung müssen Verantwortlicher, Kontaktadresse und Supabase-Projektregion ergänzt sowie der Text geprüft werden.

## GitHub Pages

Das Projekt besteht aus statischen Dateien und kann direkt mit GitHub Pages veröffentlicht werden:

1. Im Repository unter **Settings → Pages** bei **Build and deployment** die Quelle **Deploy from a branch** auswählen.
2. Den Branch `main` und den Ordner `/(root)` auswählen und speichern.

Gerichte, Wochenpläne und Einkaufszettel werden über Supabase zwischen den Mitgliedern eines Haushalts synchronisiert.
