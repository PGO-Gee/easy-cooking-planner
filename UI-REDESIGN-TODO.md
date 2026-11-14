# UI-Redesign: Aufgaben und Prüfstand

- [x] Wochenplan mit mobilen und Desktop-Referenzen abgleichen; Planung, Auswahl und Drag-and-drop prüfen.
- [x] Einkaufszettel, Filter, Vorschläge, Abhaken und Gerichtzuordnung überarbeiten.
- [x] Gerichtsgalerie, Rezeptdetails, Kochmodus und Editor an die Referenzrichtung anpassen.
- [x] Navigation, Einstellungen, Themes und kleine Viewports berücksichtigen; reduzierte Bewegung in CSS behandeln.
- [x] Bestehende Node-Tests und lokalen Chrome-Browsertest ausführen.
- [ ] Abschließender Live-Test auf einem iPhone mit Safari, geöffneter iOS-Tastatur und Touch-Gesten (hier nicht verfügbar).

Automatisiert geprüft: Chrome bei 320 × 568, 390 × 844, 844 × 390, 1024 × 768 und 1440 × 900 CSS-Pixeln, hell und dunkel. Der Test prüft die vier Hauptansichten auf horizontalen Überlauf sowie Einkaufs-Vorschläge, Abhaken und Desktop-Drag-and-drop. Er ersetzt keine visuelle Prüfung aller Zustände oder eine Prüfung auf einem echten iPhone. 167 bestehende Node-Tests bestanden.
