Danke für die Antworten. Hier der Plan (eine Variante) mit Begründung, Einkaufsliste und Hinweisen. Der Heizkörper unter dem Wohnzimmerfenster ist in den Daten nicht erfasst, ich habe den Bereich vor dem Fenster (Wand 3, x 1000 bis 2400) freigehalten. Die Lage des Sideboards fällt weg, nichts bleibt.

```json
{
  "format": "roomx-plan",
  "schemaVersion": 1,
  "projectId": "dc117369-3ba3-47f7-9828-0d175ae79c2a",
  "brief": {
    "persons": { "adults": 2, "children": 0, "pets": "keine" },
    "bedSizes": [],
    "workstations": [],
    "style": "skandinavisch, hell und ruhig; Sofa grau, Parkett hell, Wände weiss, helles Holz",
    "budgetChf": 3000,
    "retailers": ["IKEA", "JYSK", "Tchibo"],
    "keep": [],
    "wishes": "Sofa für 3 Personen, Esstisch für 4 (rechteckig, in der Küche), TV 55 Zoll auf TV-Bank, etwas Stauraum für Bücher, 1-2 Pflanzen, Teppich im Wohnzimmer, keine Vorhänge, kein Schlafsofa; Küchenzeile kommt später und ist nicht Teil der Planung; keine Allergien"
  },
  "variants": [
    {
      "name": "A: Hell und skandinavisch",
      "rooms": [
        {
          "roomId": "6102e410-ce6e-4f03-aa7d-40a3c165adfc",
          "items": [
            { "id": "tvbank", "catalogId": "ikea-lack-tv-160x35x36", "anchor": { "wall": 4, "offset": 1500 }, "color": "#f4f4f0" },
            { "id": "tv", "catalogId": "generic-tv-55", "on": "tvbank" },
            { "id": "sofa", "catalogId": "ikea-soederhamn-sofa-3-198x99x83", "x": 2795, "y": 1700, "rotation": 90, "color": "#9a9a9a" },
            { "catalogId": "generic-cushion-50x50", "on": "sofa", "color": "#d8c9a8" },
            { "id": "rug", "catalogId": "generic-rug-160x230", "x": 2300, "y": 1700, "rotation": 90, "color": "#d8c9a8" },
            { "id": "coffee", "catalogId": "ikea-lack-coffee-table-90x55x45", "x": 1575, "y": 1700, "rotation": 90, "color": "#d9b98a" },
            { "id": "billy1", "catalogId": "ikea-billy-80x28x202", "anchor": { "wall": 3, "offset": 200 }, "color": "#d9b98a" },
            { "id": "billy2", "catalogId": "ikea-billy-80x28x202", "anchor": { "wall": 3, "offset": 1000 }, "color": "#d9b98a" },
            { "catalogId": "generic-plant-m-40x40x90", "x": 300, "y": 3700, "rotation": 0 },
            { "catalogId": "generic-plant-snake-30x30x80", "x": 4600, "y": 300, "rotation": 0 },
            { "catalogId": "ikea-ranarp-floor-lamp-36x36x153", "anchor": { "wall": 1, "offset": 2500 }, "color": "#efe6d2" },
            { "catalogId": "generic-pendant-lamp-40x40x25", "x": 1575, "y": 1700, "color": "#f4f4f0" },
            { "catalogId": "generic-picture-70x100", "anchor": { "wall": 1, "offset": 1300 }, "elevation": 1100, "color": "#f4f4f0" }
          ],
          "electrical": [
            { "kind": "socket", "wall": 4, "offset": 1510, "elevation": 450, "gang": 2, "reason": "TV-Wand: Fernseher und Zubehör, neben dem TV über der TV-Bank" },
            { "kind": "socket", "wall": 4, "offset": 3110, "elevation": 260, "gang": 2, "reason": "TV-Wand: weitere Geräte (Router, Konsole), unter dem Ende der TV-Bank" },
            { "kind": "dataPort", "wall": 4, "offset": 2930, "elevation": 450, "portType": "both", "reason": "LAN und TV-Anschluss neben dem Fernseher" },
            { "kind": "socket", "wall": 1, "offset": 2900, "elevation": 260, "gang": 2, "reason": "Stehleuchte und Steckdose neben dem Sofa" },
            { "kind": "switch", "wall": 2, "offset": 2500, "elevation": 1010, "reason": "Deckenlicht-Schalter am Eingang, auf der Griffseite der Tür" },
            { "kind": "ceilingLamp", "x": 1575, "y": 1700, "reason": "Grundlicht über dem Couchtisch, dimmbar, warmweiss" }
          ],
          "notes": "Sitzen und TV liegen auf der freien Wand 4: Die TV-Bank steht dort, das Sofa schaut frei im Raum Richtung TV (ca. 2,05 m Abstand, passend für 55 Zoll). Hinter dem Sofa bleiben 91 cm zum Türschwenk, nördlich davon ein breiter Weg zum Fenster. Der Bereich vor dem Fenster (Wand 3, Heizkörper darunter, nicht erfasst) bleibt frei, die zwei BILLY-Regale stehen rechts davon an Wand 3. Hohe Möbel (BILLY, Pflanze, Stehleuchte) an der Wand sichern. Masse und Preise der Artikel ausser BILLY sind nicht beim Hersteller geprüft: vor dem Kauf beim Händler kontrollieren. Das Deckenlicht und die Steckdosen sind Vorschläge für den Elektriker."
        },
        {
          "roomId": "72e7873d-a242-4144-8f34-5fea849e4688",
          "items": [
            { "id": "dtable", "catalogId": "ikea-lisabo-table-140x78x74", "x": 1850, "y": 2100, "rotation": 90, "color": "#c8a572" },
            { "catalogId": "ikea-ingolf-chair-43x52x91", "x": 1200, "y": 1750, "rotation": 270, "color": "#d9b98a" },
            { "catalogId": "ikea-ingolf-chair-43x52x91", "x": 1200, "y": 2450, "rotation": 270, "color": "#d9b98a" },
            { "catalogId": "ikea-ingolf-chair-43x52x91", "x": 2500, "y": 1750, "rotation": 90, "color": "#d9b98a" },
            { "catalogId": "ikea-ingolf-chair-43x52x91", "x": 2500, "y": 2450, "rotation": 90, "color": "#d9b98a" },
            { "catalogId": "generic-pendant-lamp-60x60x30", "x": 1850, "y": 2100, "elevation": 1390, "color": "#f4f4f0" },
            { "id": "kshelf", "catalogId": "generic-wall-shelf-120x20x4", "anchor": { "wall": 4, "offset": 200 }, "elevation": 1500, "color": "#f4f4f0" },
            { "catalogId": "generic-plant-s-20x20x35", "on": "kshelf" }
          ],
          "electrical": [
            { "kind": "switch", "wall": 4, "offset": 1450, "elevation": 1010, "reason": "Deckenlicht-Schalter am Eingang, auf der Griffseite der Tür" },
            { "kind": "ceilingLamp", "x": 1850, "y": 2100, "reason": "Pendelleuchte mittig über dem Esstisch" }
          ],
          "notes": "Der Esstisch für 4 steht mit der Längsseite in Richtung Wand 4/2 in der Raummitte, mit je zwei Stühlen pro Seite. Zwischen Tür und Stühlen bleiben 94 cm, vor dem Fenster (Wand 3) und im Bereich der Tür bleibt alles frei. Wand 1 (unterer Bereich, 1,4 m tief) bleibt frei für die spätere Küchenzeile, Wand 2 ebenfalls; die Küchenzeile ist nicht Teil dieser Planung. Das Wandregal an Wand 4 mit einer Pflanze dient als kleiner Stauraum. Die Pendelleuchte hängt rund 65 cm über der Tischplatte. Alle Artikel sind nicht beim Hersteller geprüft: Masse und Preise vor dem Kauf beim Händler kontrollieren."
        }
      ],
      "shoppingList": [
        { "catalogId": "ikea-soederhamn-sofa-3-198x99x83", "name": "SÖDERHAMN 3er-Sofa 198x99x83 cm, grau (IKEA)", "qty": 1, "priceChf": 700 },
        { "catalogId": "ikea-lack-tv-160x35x36", "name": "LACK TV-Bank 160x35x36 cm, weiss (IKEA)", "qty": 1, "priceChf": 50 },
        { "catalogId": "generic-tv-55", "name": "Fernseher 55\" mit Fuss", "qty": 1, "priceChf": 500 },
        { "catalogId": "generic-cushion-50x50", "name": "Kissen 50x50", "qty": 1, "priceChf": 30 },
        { "catalogId": "generic-rug-160x230", "name": "Teppich 160x230", "qty": 1, "priceChf": 220 },
        { "catalogId": "ikea-lack-coffee-table-90x55x45", "name": "LACK Couchtisch 90x55x45 cm (IKEA)", "qty": 1, "priceChf": 40 },
        { "catalogId": "ikea-billy-80x28x202", "name": "BILLY Bücherregal 80x28x202 cm (IKEA)", "qty": 2, "priceChf": 59.95 },
        { "catalogId": "generic-plant-m-40x40x90", "name": "Pflanze M", "qty": 1, "priceChf": 40 },
        { "catalogId": "generic-plant-snake-30x30x80", "name": "Bogenhanf", "qty": 1, "priceChf": 35 },
        { "catalogId": "ikea-ranarp-floor-lamp-36x36x153", "name": "RANARP Stehleuchte (IKEA)", "qty": 1, "priceChf": 55 },
        { "catalogId": "generic-pendant-lamp-40x40x25", "name": "Pendelleuchte Ø 40", "qty": 1, "priceChf": 70 },
        { "catalogId": "generic-picture-70x100", "name": "Bild 70x100", "qty": 1, "priceChf": 90 },
        { "catalogId": "ikea-lisabo-table-140x78x74", "name": "LISABO Tisch 140x78 cm (IKEA)", "qty": 1, "priceChf": 200 },
        { "catalogId": "ikea-ingolf-chair-43x52x91", "name": "INGOLF Stuhl (IKEA)", "qty": 4, "priceChf": 70 },
        { "catalogId": "generic-pendant-lamp-60x60x30", "name": "Pendelleuchte Ø 60", "qty": 1, "priceChf": 130 },
        { "catalogId": "generic-wall-shelf-120x20x4", "name": "Wandregal 120x20", "qty": 1, "priceChf": 35 },
        { "catalogId": "generic-plant-s-20x20x35", "name": "Pflanze S", "qty": 1, "priceChf": 15 }
      ]
    }
  ]
}
```

**Begründung**

- **Wohnzimmer:** TV-Bank mit 55-Zoll-TV an der freien Wand 4 (die vorhandene Steckdose bleibt frei). Das 3er-Sofa steht frei im Raum und schaut zum TV (ca. 2,05 m Abstand), Couchtisch 45 cm vor dem Sofa, Teppich unter den vorderen Sofafüssen. Hinter dem Sofa bleiben 91 cm bis zum Türschwenk, nördlich davon über 1 m Weg zum Fenster. Zwei BILLY-Regale (Bücher) stehen an Wand 3 rechts vom Fenster, damit das Tageslicht nicht verdeckt wird. Fenster und Heizkörper bleiben ganz frei. Elektro: 2 neue Doppelsteckdosen und LAN/TV bei der TV-Wand (mit der vorhandenen 5 Plätze), eine Doppelsteckdose neben dem Sofa für die Stehleuchte, Deckenlicht mit Schalter an der Tür (Wand 2, Griffseite), dimmbar und warmweiss.
- **Küche:** Rechteckiger Esstisch (140 x 78 cm) für 4 in der Raummitte, je 2 Stühle pro Längsseite, Pendelleuchte rund 65 cm über der Tischplatte. Zwischen Tür und Stühlen bleiben 94 cm, der Bereich vor der Tür (60 cm) und das Fenster bleiben frei. Der untere Teil (Wand 1, 1,4 m tief) bleibt für die spätere Küchenzeile frei. Ein Wandregal mit einer Pflanze an Wand 4. Schalter an der Tür (Griffseite), Deckenlicht über dem Tisch.
- **Sicherheit:** BILLY-Regale, Pflanze und Stehleuchte an der Wand sichern. Das Deckenlicht, die Steckdosen und das LAN/TV-Dose sind Vorschläge für den Elektriker.

**Einkaufsliste (CHF, alles Richtpreise, Stand Katalog 2026-10, nicht im Web geprüft)**

| Artikel | Händler | Anz. | Einzelpreis | Total |
|---|---|---|---|---|
| SÖDERHAMN 3er-Sofa, grau (Masse ungeprüft) | IKEA | 1 | 700 | 700 |
| LACK TV-Bank 160 cm, weiss (Masse ungeprüft) | IKEA | 1 | 50 | 50 |
| Fernseher 55" (Richtpreis, Gerät frei wählbar) | frei | 1 | 500 | 500 |
| Kissen 50x50 | frei | 1 | 30 | 30 |
| Teppich 160x230 | frei | 1 | 220 | 220 |
| LACK Couchtisch 90x55 (Masse ungeprüft) | IKEA | 1 | 40 | 40 |
| BILLY Regal 80x28x202 (geprüft) | IKEA | 2 | 59.95 | 119.90 |
| Pflanze M | frei | 1 | 40 | 40 |
| Bogenhanf | frei | 1 | 35 | 35 |
| RANARP Stehleuchte (Masse ungeprüft) | IKEA | 1 | 55 | 55 |
| Pendelleuchte Ø 40 | frei | 1 | 70 | 70 |
| Bild 70x100 | frei | 1 | 90 | 90 |
| LISABO Tisch 140x78 (Masse ungeprüft) | IKEA | 1 | 200 | 200 |
| INGOLF Stuhl (Masse ungeprüft) | IKEA | 4 | 70 | 280 |
| Pendelleuchte Ø 60 | frei | 1 | 130 | 130 |
| Wandregal 120x20 | frei | 1 | 35 | 35 |
| Pflanze S | frei | 1 | 15 | 15 |
| **Summe** | | | | **CHF 2609.90** |

Das liegt unter den CHF 3000 und lässt rund CHF 390 (13 %) Reserve. Der Fernseher ist mit CHF 500 eingerechnet: Falls du schon einen hast, entfällt der Posten. Elektroarbeiten (Steckdosen, Schalter, Lampenanschlüsse) sind nicht eingerechnet. Alle ausser den BILLY-Regalen haben ungeprüfte Masse und Preise, bitte beim Händler vor dem Kauf prüfen.

**Prüfung:** Ich habe von Hand nachgerechnet (alle Möbel im Raum, keine Überschneidungen, Türschwenk und 60 cm vor den Türen frei, Fenster und Heizkörper frei, Hauptwege über 90 cm, Geräte höchstens 1,5 m von einer Steckdose, alle Katalog- und Raum-IDs vorhanden, Summe stimmt). Das Schema habe ich mangels Bibliothek nicht maschinell geprüft, nur die IDs und die Summe per Skript; die App prüft beim Import noch einmal.

**Import:** In roomx unter «Plan importieren» den JSON-Block einfügen (oder als Datei `roomx-plan-wohnung-beispiel.json` speichern und wählen) und die neue Variante in 2D und 3D ansehen. Offen: Lage und Breite des Heizkörpers bitte in roomx erfassen.
