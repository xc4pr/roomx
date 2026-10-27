import json
import sys
import tempfile
import unittest
from pathlib import Path

HIER = Path(__file__).resolve().parent
sys.path.insert(0, str(HIER.parent))
sys.path.insert(0, str(HIER))
import bericht  # noqa: E402
import gemeinsam as g  # noqa: E402
import jysk  # noqa: E402
import normalisieren as nm  # noqa: E402
import ikea  # noqa: E402
import tchibo  # noqa: E402
import update  # noqa: E402
import zustand as zs  # noqa: E402
from test_index import Antwort, FalscherOpener  # noqa: E402

ROBOTS = "User-agent: *\nDisallow: /search\nSitemap: https://jysk.ch/sitemap.xml\n"
PFAD = "https://jysk.ch/de/wohnaccessoires/spiegel/"
SPIEGEL = (HIER / "jysk_spiegel.html").read_bytes()


def tmp() -> Path:
    return Path(tempfile.mkdtemp())


def sitemap(*slugs) -> dict:
    urls = "".join(f"<url><loc>{PFAD}{s}</loc></url>" for s in slugs)
    return {
        "https://jysk.ch/robots.txt": Antwort(200, ROBOTS.encode(), "text/plain"),
        "https://jysk.ch/sitemap.xml": Antwort(200, b"<sitemapindex><sitemap><loc>https://jysk.ch/sitemap.xml?page=1</loc></sitemap></sitemapindex>", "application/xml"),
        "https://jysk.ch/sitemap.xml?page=1": Antwort(200, f"<urlset>{urls}</urlset>".encode(), "application/xml"),
    }


def seiten(*slugs, **besonders) -> dict:
    return {PFAD + s: besonders.get(s, Antwort(200, SPIEGEL)) for s in slugs}


def lauf(state, out, antworten, **kw):
    op = FalscherOpener(antworten)
    kw.setdefault("pause", 0.0)
    code, b = update.index_lauf(jysk, state=state, out=out, opener=op, lock_dir=tmp(), **kw)
    return code, b, op


def vorbereiten(state, geprueft: dict[str, str | None]):
    """Zustand mit bekannten JYSK-Produkten: slug -> Pruefdatum (None: nie geprueft)."""
    z = zs.Zustand(state / "jysk.jsonl", jysk.PRAEFIX)
    for slug, d in geprueft.items():
        e = z.eintrag(f"{PFAD}{slug}/")
        e["umfang"] = True
        if d:
            e.update(status="produkt", geprueft=d, zeile={"name": "Spiegel X", "artikelnummer": "1", "preis_chf": 10})
    z.speichern()


class ZustandTest(unittest.TestCase):
    def test_sortiert_und_nur_pruefdatum_aendert_sich(self):
        d = tmp()
        z = zs.Zustand(d / "x.jsonl", "https://x/")
        z.uebernimm({"url": "https://x/b/", "ergebnis": "produkt", "name": "B", "preis_chf": 5, "masse": {"breite_cm": 1, "tiefe_cm": None}}, "2026-10-01", False)
        z.uebernimm({"url": "https://x/a/", "ergebnis": "404"}, "2026-10-01", False)
        z.speichern()
        vorher = (d / "x.jsonl").read_text().splitlines()
        self.assertEqual([json.loads(x)["u"] for x in vorher], ["a/", "b/"])
        self.assertEqual(json.loads(vorher[1])["zeile"], {"name": "B", "masse": {"breite_cm": 1}, "preis_chf": 5})
        z2 = zs.Zustand(d / "x.jsonl", "https://x/").laden()
        z2.uebernimm({"url": "https://x/b/", "ergebnis": "produkt", "name": "B", "preis_chf": 5, "masse": {"breite_cm": 1}}, "2026-10-08", False)
        z2.speichern()
        nachher = (d / "x.jsonl").read_text().splitlines()
        self.assertEqual(nachher[0], vorher[0])
        self.assertEqual(nachher[1].replace("2026-10-08", "2026-10-01"), vorher[1])

    def test_verschwunden_behaelt_zeile_und_wiederauftauchen(self):
        z = zs.Zustand(tmp() / "x.jsonl", "https://x/")
        p = {"url": "https://x/a/", "ergebnis": "produkt", "name": "A", "preis_chf": 5}
        self.assertEqual(z.uebernimm(p, "2026-10-01", False), {"verschwunden": [], "wieder": []})
        self.assertEqual(z.uebernimm({"url": "https://x/a/", "ergebnis": "404"}, "2026-10-08", False)["verschwunden"], ["https://x/a/"])
        e = z.eintraege["https://x/a/"]
        self.assertTrue(zs.ist_verschwunden(e))
        self.assertEqual(e["zeile"]["name"], "A")
        self.assertEqual(z.uebernimm(p, "2026-10-15", False)["wieder"], ["https://x/a/"])
        self.assertFalse(zs.ist_verschwunden(z.eintraege["https://x/a/"]))
        # Weiterleitung auf eine Uebersicht
        z.uebernimm({"url": "https://x/a/", "ergebnis": "weiterleitung", "weiter": "https://x/kat/"}, "2026-10-22", False)
        self.assertEqual(z.eintraege["https://x/a/"]["weiter"], "https://x/kat/")
        self.assertTrue(zs.ist_verschwunden(z.eintraege["https://x/a/"]))
        # Fehler und fehlende Produktdaten gelten nicht als verschwunden
        z.uebernimm(p, "2026-10-29", False)
        z.uebernimm({"url": "https://x/a/", "ergebnis": "fehler", "fehler": "x"}, "2026-11-05", False)
        self.assertTrue(zs.ist_lebend(z.eintraege["https://x/a/"]))


class IndexTest(unittest.TestCase):
    def test_bekannte_und_neue_urls_reihenfolge(self):
        state, out = tmp(), tmp()
        vorbereiten(state, {"neu-c": None, "alt-b": "2026-09-01", "frisch-a": "2026-10-10"})
        antworten = {**sitemap("neu-c", "alt-b", "frisch-a", "neu-d"), **seiten("neu-c", "alt-b", "frisch-a", "neu-d")}
        code, b, op = lauf(state, out, antworten, tag="2026-10-15")
        self.assertEqual(code, 0)
        geholt = [u.rsplit("/", 1)[-1] for u in op.urls if "/spiegel/" in u]
        # 1. Produkte im Umfang, 6 Tage oder aelter; 2. nie geprueft; 3. Rest nach aeltester Pruefung
        self.assertEqual(geholt, ["alt-b", "neu-c", "neu-d", "frisch-a"])
        self.assertEqual((b["abgerufen"], b["neu"], b["neue_produkte"], b["fehler"], b["blockiert"]), (4, 1, 2, 0, False))
        z = zs.Zustand(state / "jysk.jsonl", jysk.PRAEFIX).laden()
        self.assertTrue(all(e["geprueft"] == "2026-10-15" for e in z.eintraege.values()))
        self.assertEqual(json.loads((out / "jysk-index.json").read_text())["abgerufen"], 4)

    def test_reihenfolge_stale_vor_nie_geprueft_vor_rest(self):
        state, out = tmp(), tmp()
        vorbereiten(state, {"s1": "2026-09-20", "s2": "2026-10-09", "n1": None, "f1": "2026-10-10", "f2": "2026-10-14", "g1": "2026-10-01"})
        z = zs.Zustand(state / "jysk.jsonl", jysk.PRAEFIX).laden()
        z.eintraege[PFAD + "g1/"]["status"] = "404"  # verschwunden, alt: kein Auffrischen im Umfang -> Rest
        z.speichern()
        slugs = ["s1", "s2", "n1", "f1", "f2", "g1"]
        code, b, op = lauf(state, out, seiten(*slugs), ohne_suche=True, tag="2026-10-15")
        geholt = [u.rsplit("/", 1)[-1] for u in op.urls if "/spiegel/" in u]
        self.assertEqual(geholt, ["s1", "s2", "n1", "g1", "f1", "f2"])  # s2: genau 6 Tage alt zaehlt als alt

    def test_nur_neue_und_bekannte_im_umfang(self):
        state, out = tmp(), tmp()
        aus = "https://jysk.ch/de/garten/gartenmobel/stuhl-x/"
        z = zs.Zustand(state / "jysk.jsonl", jysk.PRAEFIX)
        z.eintrag(aus)["umfang"] = False
        z.speichern()
        antworten = {**sitemap("neu-d"), **seiten("neu-d")}
        code, b, op = lauf(state, out, antworten)
        self.assertEqual([u for u in op.urls if "stuhl-x" in u], [])
        self.assertEqual(b["abgerufen"], 1)

    def test_budget_und_max_urls_und_fortsetzung(self):
        state, out = tmp(), tmp()
        slugs = ["a", "b", "c", "d", "e", "f"]
        vorbereiten(state, {s: None for s in slugs})
        antworten = seiten(*slugs)
        geholt = lambda op: [u.rsplit("/", 1)[-1] for u in op.urls if "/spiegel/" in u]
        code, b, op = lauf(state, out, antworten, ohne_suche=True, max_urls=2)
        self.assertEqual((b["abgerufen"], b["offen_danach"], geholt(op)), (2, 4, ["a", "b"]))
        zeit = iter(range(0, 100000, 100))  # jeder Aufruf der Uhr: 100 s
        code, b, op2 = lauf(state, out, antworten, ohne_suche=True, budget_min=10, uhr=lambda: next(zeit))
        self.assertEqual(code, 0)
        self.assertTrue(0 < b["abgerufen"] < 4, b["abgerufen"])  # Budget beendet den Lauf vorzeitig
        self.assertEqual(geholt(op2), slugs[2:2 + b["abgerufen"]])  # der Rest kommt zuerst
        code, b, op3 = lauf(state, out, antworten, ohne_suche=True)
        schon = geholt(op) + geholt(op2)
        rest = [s for s in slugs if s not in schon]
        self.assertEqual(len(set(schon)), len(schon))  # nichts doppelt
        self.assertEqual(geholt(op3), rest + schon)  # erst nie Gepruefte, dann aelteste Pruefung zuerst
        self.assertEqual(b["offen_danach"], 0)

    def test_blockiert_speichert_zustand(self):
        state, out = tmp(), tmp()
        vorbereiten(state, {"a": None, "b": None, "c": None})
        antworten = seiten("a", "b", "c", b=Antwort(403))
        code, b, op = lauf(state, out, antworten, ohne_suche=True)
        self.assertEqual(code, 2)
        self.assertTrue(b["blockiert"])
        self.assertIn("403", b["meldung"])
        z = zs.Zustand(state / "jysk.jsonl", jysk.PRAEFIX).laden()
        self.assertEqual(z.eintraege[PFAD + "a/"]["status"], "produkt")
        self.assertIsNone(z.eintraege[PFAD + "b/"]["geprueft"])
        self.assertIsNone(z.eintraege[PFAD + "c/"]["geprueft"])
        rep = json.loads((out / "jysk-index.json").read_text())
        self.assertTrue(rep["blockiert"])

    def test_verschwunden_und_wieder_da(self):
        state, out = tmp(), tmp()
        vorbereiten(state, {"a": "2026-09-01", "b": "2026-09-01"})
        code, b, _ = lauf(state, out, seiten("a", "b", a=Antwort(404), b=Antwort(301, weiter="https://jysk.ch/de/wohnaccessoires/spiegel/")),
                          ohne_suche=True)
        self.assertEqual((code, b["verschwunden"], b["fehler"]), (0, 2, 0))
        z = zs.Zustand(state / "jysk.jsonl", jysk.PRAEFIX).laden()
        self.assertEqual(z.eintraege[PFAD + "a/"]["status"], "404")
        self.assertEqual(z.eintraege[PFAD + "a/"]["zeile"]["name"], "Spiegel X")  # bleibt erhalten
        code, b, _ = lauf(state, out, seiten("a", "b", b=Antwort(410)), ohne_suche=True)
        self.assertEqual((b["wieder_aufgetaucht"], b["verschwunden"]), (1, 0))
        self.assertEqual(zs.Zustand(state / "jysk.jsonl", jysk.PRAEFIX).laden().eintraege[PFAD + "b/"]["status"], "404")  # 410

    def test_suchfehler_gibt_exit_1(self):
        state, out = tmp(), tmp()
        vorbereiten(state, {"a": None})
        antworten = {"https://jysk.ch/robots.txt": Antwort(200, ROBOTS.encode(), "text/plain"), **seiten("a")}
        code, b, _ = lauf(state, out, antworten)
        self.assertEqual(code, 1)
        self.assertEqual(b["abgerufen"], 1)  # bekannte Produkte werden trotzdem geholt


def ikea_zeile(name, nr, preis, farbe="schwarz", breite=80):
    return {"name": name, "artikelnummer": nr, "kategorie_pfad": ["Kommoden"], "preis_chf": preis, "farbe": farbe,
            "masse": {"breite_cm": breite, "tiefe_cm": 48, "hoehe_cm": 100}}


class NormalizeTest(unittest.TestCase):
    def aufbau(self, zeilen: dict):
        """basis (Tabellen), state, out, web (ohne Node-Projekt), full.json; zeilen: url -> (status, zeile)."""
        d = tmp()
        basis, state, out, web = d / "basis", d / "state", d / "out", d / "web"
        for p in (basis, state, out, web):
            p.mkdir()
        (basis / "zuordnung.json").write_text(json.dumps({"ikea|Kommoden": {"category": "dresser", "model": "dresser"}}))
        (basis / "farben.json").write_text(json.dumps({"schwarz": "#222222", "weiss": "#f4f4f0"}))
        (basis / "arten-en.json").write_text("{}")
        z = zs.Zustand(state / "ikea.jsonl", "https://www.ikea.com/ch/de/p/")
        for url, (status, zeile) in zeilen.items():
            e = z.eintrag(url)
            e.update(umfang=True, status=status, geprueft="2026-10-15", zeile=zeile)
        z.speichern()
        return basis, state, out, web, d / "full.json"

    def lauf(self, basis, state, out, web, full, kur=None):
        (out / "kuratiert.json").write_text(json.dumps(kur if kur is not None else [{"id": "x-kur", "articleNo": "999.999.99"}]))
        return update.normalize_lauf(full, state, out, web, basis, cache_erlaubt=True, zustand_schreiben=True)

    def viele(self, n, **gone):
        return {f"https://www.ikea.com/ch/de/p/malm-{i:03d}/": (gone.get(i, "produkt"), ikea_zeile(f"MALM{i} Kommode - schwarz 80x48 cm", f"100.000.{i:02d}", 100, breite=80 + i))
                for i in range(n)}

    def test_out_ohne_zustandsaenderung_und_englisch_bericht(self):
        a = self.aufbau(self.viele(3))
        (a[2] / "kuratiert.json").write_text(json.dumps([{"id": "x-kur", "articleNo": "999.999.99"}]))
        (a[0] / "woerter-en.json").write_text(json.dumps({"kommode": "chest"}))
        self.assertEqual(update.normalize_lauf(a[4], a[1], a[2], a[3], a[0], cache_erlaubt=True), 0)
        self.assertFalse((a[1] / "ids.json").exists())
        self.assertFalse((a[1] / "uebernommen.json").exists())
        rep = json.loads((a[2] / "report.json").read_text())
        self.assertEqual(rep["en_gleich_de"]["ikea"]["gesamt"], 3)
        self.assertEqual(rep["en_gleich_de"]["ikea"]["anzahl"], 0)
        self.assertIn("## Englische Namen", (a[2] / "report.md").read_text())
        self.assertEqual(self.lauf(*a), 0)
        self.assertTrue((a[1] / "ids.json").exists())

    def test_discontinued_statt_loeschen_und_wieder_da(self):
        u0, u1 = "https://www.ikea.com/ch/de/p/malm-000/", "https://www.ikea.com/ch/de/p/malm-001/"
        a = self.aufbau({u0: ("produkt", ikea_zeile("A Kommode - schwarz 80x48 cm", "1.1", 10)),
                         u1: ("404", ikea_zeile("B Kommode - schwarz 90x48 cm", "2.2", 20, breite=90))})
        self.assertEqual(self.lauf(*a), 0)
        neu = {e["id"]: e for e in json.loads(a[4].read_text())}
        self.assertEqual(len(neu), 2)
        weg = [e for e in neu.values() if e.get("discontinued")]
        self.assertEqual(len(weg), 1)
        self.assertEqual(weg[0]["articleNo"], "2.2")
        # Wieder aufgetaucht: Feld verschwindet
        z = zs.Zustand(a[1] / "ikea.jsonl", "https://www.ikea.com/ch/de/p/").laden()
        z.uebernimm({"url": u1, "ergebnis": "produkt", **ikea_zeile("B Kommode - schwarz 90x48 cm", "2.2", 20, breite=90), "im_umfang": True}, "2026-10-22", True)
        z.speichern()
        self.assertEqual(self.lauf(*a), 0)
        self.assertFalse(any(e.get("discontinued") for e in json.loads(a[4].read_text())))

    def test_gruppe_mit_lebender_variante_bleibt_lebendig(self):
        u0, u1 = "https://www.ikea.com/ch/de/p/malm-000/", "https://www.ikea.com/ch/de/p/malm-001/"
        a = self.aufbau({u0: ("404", ikea_zeile("A Kommode - schwarz 80x48 cm", "1.1", 10, "schwarz")),
                         u1: ("produkt", ikea_zeile("A Kommode - weiss 80x48 cm", "1.2", 30, "weiss"))})
        self.lauf(*a)
        e = json.loads(a[4].read_text())
        self.assertEqual(len(e), 1)
        self.assertNotIn("discontinued", e[0])
        self.assertEqual(e[0]["priceChf"], 30)

    def alt_schreiben(self, a, n_alt, **disc_neu):
        """Bisherige full.json = Ergebnis eines Laufs ohne Aenderungen; dann Zustand aendern."""
        self.assertEqual(self.lauf(*a), 0)
        return json.loads(a[4].read_text())

    def test_schutzregel_verschwunden_grenze(self):
        # 100 Eintraege; 5 neu verschwunden = 5 % -> noch erlaubt, 6 -> Schutz
        for anzahl, erwartet in ((5, 0), (6, 3)):
            a = self.aufbau(self.viele(100))
            self.alt_schreiben(a, 100)
            alt_text = a[4].read_text()
            z = zs.Zustand(a[1] / "ikea.jsonl", "https://www.ikea.com/ch/de/p/").laden()
            for i in range(anzahl):
                z.uebernimm({"url": f"https://www.ikea.com/ch/de/p/malm-{i:03d}/", "ergebnis": "404"}, "2026-10-22", True)
            z.speichern()
            self.assertEqual(self.lauf(*a), erwartet, anzahl)
            if erwartet == 3:
                self.assertEqual(a[4].read_text(), alt_text)  # nichts geschrieben
                rep = json.loads((a[2] / "report.json").read_text())
                self.assertFalse(rep["geschrieben"])
                self.assertTrue(rep["schutz"]["ausgeloest"])
                self.assertIn("discontinued", (a[2] / "report.md").read_text())
            else:
                self.assertEqual(sum(1 for e in json.loads(a[4].read_text()) if e.get("discontinued")), 5)

    def test_schutzregel_preis_grenze(self):
        for anzahl, erwartet in ((20, 0), (21, 3)):
            a = self.aufbau(self.viele(100))
            self.alt_schreiben(a, 100)
            z = zs.Zustand(a[1] / "ikea.jsonl", "https://www.ikea.com/ch/de/p/").laden()
            for i in range(anzahl):
                z.eintraege[f"https://www.ikea.com/ch/de/p/malm-{i:03d}/"]["zeile"]["preis_chf"] = 120
            z.speichern()
            self.assertEqual(self.lauf(*a), erwartet, anzahl)

    # ---- nie automatisch loeschen
    def basis_100(self):
        a = self.aufbau(self.viele(100))
        self.assertEqual(self.lauf(*a), 0)
        return a

    def entferne(self, a, anzahl, status=None):
        z = zs.Zustand(a[1] / "ikea.jsonl", "https://www.ikea.com/ch/de/p/").laden()
        for i in range(anzahl):
            u = f"https://www.ikea.com/ch/de/p/malm-{i:03d}/"
            if status:
                z.uebernimm({"url": u, "ergebnis": status}, "2026-10-22", True)
            else:
                z.eintraege.pop(u, None)
        z.speichern()

    def test_fehlende_eintraege_werden_uebernommen(self):
        a = self.basis_100()
        alt = {e["id"]: e for e in json.loads(a[4].read_text())}
        self.entferne(a, 3)
        self.assertEqual(self.lauf(*a), 0)
        neu = json.loads(a[4].read_text())
        self.assertEqual(len(neu), 100)
        self.assertEqual([e["id"] for e in neu], sorted(e["id"] for e in neu))  # Reihenfolge wie bisher
        self.assertEqual({e["id"]: e for e in neu}, alt)  # unveraendert
        self.assertEqual(len(json.loads((a[1] / "uebernommen.json").read_text())), 3)
        rep = json.loads((a[2] / "report.json").read_text())
        self.assertEqual((rep["uebernommen"]["anzahl"], rep["uebernommen"]["neu"], len(rep["uebernommen"]["beispiele"])), (3, 3, 3))
        self.assertIn("uebernommen", (a[2] / "report.md").read_text().lower())

    def test_uebernommen_mit_discontinued_wenn_zustand_verschwunden_sagt(self):
        a = self.basis_100()
        u = "https://www.ikea.com/ch/de/p/malm-000/"
        z = zs.Zustand(a[1] / "ikea.jsonl", "https://www.ikea.com/ch/de/p/").laden()
        # Normalisierer erzeugt ihn nicht mehr (keine Masse), der Zustand kennt die URL als 404
        z.eintraege[u]["zeile"] = {"name": "MALM0 Kommode"}
        z.eintraege[u]["status"] = "404"
        z.speichern()
        # alte full.json kennt die URL: Treffer ueber die URL
        alt = json.loads(a[4].read_text())
        self.assertEqual(self.lauf(*a), 0)
        neu = {e["id"]: e for e in json.loads(a[4].read_text())}
        e0 = next(e for e in alt if e["url"] == u)
        self.assertTrue(neu[e0["id"]]["discontinued"])
        self.assertEqual(len(neu), 100)

    def test_ersatz_durch_kuratiert(self):
        a = self.basis_100()
        alt = json.loads(a[4].read_text())
        self.entferne(a, 2)
        e0, e1 = alt[0], alt[1]
        e0_nr = next(e for e in alt if e["url"].endswith("malm-000/"))
        e1_nr = next(e for e in alt if e["url"].endswith("malm-001/"))
        self.lauf(*a, kur=[{"id": e0_nr["id"], "articleNo": None}, {"id": "andere-id", "articleNo": e1_nr["articleNo"]}])
        ids = {e["id"] for e in json.loads(a[4].read_text())}
        self.assertNotIn(e0_nr["id"], ids)  # gleiche id
        self.assertNotIn(e1_nr["id"], ids)  # gleiche Artikelnummer (nur Ziffern)
        rep = json.loads((a[2] / "report.json").read_text())
        self.assertEqual((rep["uebernommen"]["anzahl"], rep["uebernommen"]["ersetzt_anzahl"]), (0, 2))
        self.assertEqual(len(rep["uebernommen"]["ersetzt_beispiele"]), 2)

    def test_neu_uebernommen_zaehlt_nicht_zweimal(self):
        a = self.basis_100()
        self.entferne(a, 5)  # genau 5 %: erlaubt
        self.assertEqual(self.lauf(*a), 0)
        # zweiter Lauf: dieselben 5 sind schon uebernommen, 5 weitere (5 %) -> erlaubt, nicht 10 %
        self.entferne(a, 10)
        self.assertEqual(self.lauf(*a), 0)
        rep = json.loads((a[2] / "report.json").read_text())
        self.assertEqual((rep["uebernommen"]["anzahl"], rep["uebernommen"]["neu"]), (10, 5))
        self.assertEqual(len(json.loads(a[4].read_text())), 100)

    def test_schutzregel_mit_uebernommenen_grenze(self):
        for anzahl, erwartet in ((5, 0), (6, 3)):
            a = self.basis_100()
            vorher = a[4].read_text()
            self.entferne(a, anzahl)
            self.assertEqual(self.lauf(*a), erwartet, anzahl)
            if erwartet:
                self.assertEqual(a[4].read_text(), vorher)
                self.assertEqual(json.loads((a[1] / "uebernommen.json").read_text()), [])  # nicht geschrieben
        # Mischung: 3 neu verschwunden + 3 neu uebernommen = 6 %
        a = self.basis_100()
        self.entferne(a, 3, status="404")
        z = zs.Zustand(a[1] / "ikea.jsonl", "https://www.ikea.com/ch/de/p/").laden()
        for i in (50, 51, 52):
            z.eintraege.pop(f"https://www.ikea.com/ch/de/p/malm-{i:03d}/")
        z.speichern()
        self.assertEqual(self.lauf(*a), 3)

    def test_entfernen_erlaubt(self):
        a = self.basis_100()
        self.entferne(a, 20)  # weit ueber 5 %
        (a[1] / "uebernommen.json").write_text('["alt"]')
        (a[2] / "kuratiert.json").write_text(json.dumps([{"id": "x-kur", "articleNo": "999.999.99"}]))
        code = update.normalize_lauf(a[4], a[1], a[2], a[3], a[0], cache_erlaubt=True, zustand_schreiben=True, entfernen_erlaubt=True)
        self.assertEqual(code, 0)
        self.assertEqual(len(json.loads(a[4].read_text())), 80)
        self.assertEqual(json.loads((a[1] / "uebernommen.json").read_text()), [])

    def test_schutz_nur_mit_bisheriger_datei(self):
        v = bericht.vergleiche(None, [{"id": "a", "brand": "IKEA", "discontinued": True}])
        self.assertFalse(bericht.schutz(v, False)["ausgeloest"])
        v = bericht.vergleiche([], [])
        self.assertFalse(bericht.schutz(v, True)["ausgeloest"])

    def test_kuratiert_pflicht_ohne_cache_schalter(self):
        a = self.aufbau(self.viele(2))
        (a[2] / "kuratiert.json").write_text(json.dumps([{"id": "x", "articleNo": "1.1"}]))
        # Node-Import schlaegt fehl (kein Projekt im Web-Ordner): ohne Schalter Exit 1, nichts geschrieben
        self.assertEqual(update.normalize_lauf(a[4], a[1], a[2], a[3], a[0]), 1)
        self.assertFalse(a[4].exists())
        self.assertIn("kuratiert", json.loads((a[2] / "report.json").read_text())["fehler"].lower())
        # mit Schalter und vorhandenem Cache laeuft es
        self.assertEqual(update.normalize_lauf(a[4], a[1], a[2], a[3], a[0], cache_erlaubt=True, zustand_schreiben=True), 0)
        self.assertTrue(a[4].exists())
        # Schalter, aber Cache leer: weiterhin Fehler
        (a[2] / "kuratiert.json").write_text("[]")
        self.assertEqual(update.normalize_lauf(a[4], a[1], a[2], a[3], a[0], cache_erlaubt=True, zustand_schreiben=True), 1)

    def test_neuer_schluessel_behaelt_id_ueber_artikelnummer(self):
        u = "https://www.ikea.com/ch/de/p/malm-000/"
        a = self.aufbau({u: ("produkt", ikea_zeile("A Kommode - schwarz 80x48 cm", "100.000.01", 10))})
        self.assertEqual(self.lauf(*a), 0)
        alt = json.loads(a[4].read_text())
        z = zs.Zustand(a[1] / "ikea.jsonl", "https://www.ikea.com/ch/de/p/").laden()
        z.uebernimm({"url": u, "ergebnis": "produkt", **ikea_zeile("A Kommode - schwarz 81x48 cm", "100.000.01", 10, breite=81),
                     "im_umfang": True}, "2026-10-22", True)
        z.speichern()
        self.assertEqual(self.lauf(*a), 0)
        neu = json.loads(a[4].read_text())
        self.assertEqual([e["id"] for e in neu], [alt[0]["id"]])
        self.assertEqual(neu[0]["dims"]["w"], 810)
        ids = json.loads((a[1] / "ids.json").read_text())
        self.assertEqual(list(ids.values()), [alt[0]["id"]])
        self.assertTrue(next(iter(ids)).endswith("|810x480x1000"))

    def test_id_eines_anderen_schluessels_wird_nicht_uebernommen(self):
        u0, u1 = "https://www.ikea.com/ch/de/p/malm-000/", "https://www.ikea.com/ch/de/p/malm-001/"
        a = self.aufbau({u0: ("produkt", ikea_zeile("A Kommode - schwarz 80x48 cm", "100.000.01", 10))})
        self.assertEqual(self.lauf(*a), 0)
        alt = json.loads(a[4].read_text())[0]["id"]
        z = zs.Zustand(a[1] / "ikea.jsonl", "https://www.ikea.com/ch/de/p/").laden()
        z.uebernimm({"url": u1, "ergebnis": "produkt", **ikea_zeile("B Kommode - schwarz 90x48 cm", "100.000.02", 20, breite=90),
                     "im_umfang": True}, "2026-10-22", True)
        z.speichern()
        self.assertEqual(self.lauf(*a), 0)
        neu = {e["articleNo"]: e["id"] for e in json.loads(a[4].read_text())}
        self.assertEqual(neu["100.000.01"], alt)
        self.assertNotEqual(neu["100.000.02"], alt)

    def test_umbenannte_seite_ergibt_einen_eintrag_mit_alter_id(self):
        u0, u1 = "https://www.ikea.com/ch/de/p/a-waschbeckschr-000/", "https://www.ikea.com/ch/de/p/a-waschbeckenschrank-000/"
        a = self.aufbau({u0: ("produkt", ikea_zeile("A Waschbeckschr - schwarz 80x48 cm", "396.294.48", 10))})
        self.assertEqual(self.lauf(*a), 0)
        alt = json.loads(a[4].read_text())[0]["id"]
        for status_alt in ("produkt", "404"):
            with self.subTest(alte_seite=status_alt):
                z = zs.Zustand(a[1] / "ikea.jsonl", "https://www.ikea.com/ch/de/p/").laden()
                z.eintraege[u0]["status"] = status_alt
                z.uebernimm({"url": u1, "ergebnis": "produkt", **ikea_zeile("A Waschbeckenschrank - schwarz 80x48 cm", "396.294.48", 10),
                             "im_umfang": True}, "2026-10-26", True)
                z.speichern()
                self.assertEqual(self.lauf(*a), 0)
                neu = json.loads(a[4].read_text())
                self.assertEqual([(e["id"], e["url"], e["priceChf"]) for e in neu], [(alt, u1, 10)])
                self.assertFalse(neu[0].get("discontinued", False))
                rep = json.loads((a[2] / "report.json").read_text())
                self.assertEqual(rep["shops"]["ikea"]["verworfen"].get("gleiche_artikelnummer"), 1)

    def test_gleiche_artikelnummer_am_selben_tag_behaelt_bisherige_url(self):
        u0, u1 = "https://www.ikea.com/ch/de/p/b-kommode-000/", "https://www.ikea.com/ch/de/p/a-kommode-000/"
        a = self.aufbau({u0: ("produkt", ikea_zeile("B Kommode - schwarz 80x48 cm", "100.000.07", 10))})
        self.assertEqual(self.lauf(*a), 0)
        z = zs.Zustand(a[1] / "ikea.jsonl", "https://www.ikea.com/ch/de/p/").laden()
        z.eintrag(u1).update(umfang=True, status="produkt", geprueft="2026-10-15", zeile=ikea_zeile("A Kommode - schwarz 80x48 cm", "100.000.07", 10))
        z.speichern()
        self.assertEqual(self.lauf(*a), 0)
        self.assertEqual([e["url"] for e in json.loads(a[4].read_text())], [u0])

    def test_nummer_wechselt_zu_anderem_eintrag(self):
        """Eine Farbseite zeigt neu die Nummer der anderen Farbe: der alte Eintrag bleibt ohne Nummer."""
        ua, ub = "https://www.ikea.com/ch/de/p/a-kommode-000/", "https://www.ikea.com/ch/de/p/b-kommode-000/"
        zeilen = self.viele(40)
        zeilen[ua] = ("produkt", ikea_zeile("A Kommode - schwarz 70x48 cm", "100.700.01", 10, breite=70))
        zeilen[ub] = ("produkt", ikea_zeile("B Kommode - schwarz 75x48 cm", "100.700.02", 10, breite=75))
        a = self.aufbau(zeilen)
        self.assertEqual(self.lauf(*a), 0)
        alt = {e["articleNo"]: e["id"] for e in json.loads(a[4].read_text())}
        z = zs.Zustand(a[1] / "ikea.jsonl", "https://www.ikea.com/ch/de/p/").laden()
        z.uebernimm({"url": ub, "ergebnis": "produkt", **ikea_zeile("B Kommode - schwarz 75x48 cm", "100.700.01", 10, breite=75),
                     "im_umfang": True}, "2026-10-26", True)
        z.speichern()
        self.assertEqual(self.lauf(*a), 0)
        neu = {e["id"]: e for e in json.loads(a[4].read_text())}
        self.assertEqual(neu[alt["100.700.02"]]["articleNo"], "100.700.01")
        bleibt = neu[alt["100.700.01"]]
        self.assertNotIn("articleNo", bleibt)
        self.assertTrue(bleibt["discontinued"])
        self.assertEqual(update.doppelte(list(neu.values())), [])

    def test_doppelte_artikelnummer_bricht_ab(self):
        a = self.aufbau({"https://www.ikea.com/ch/de/p/malm-000/": ("produkt", ikea_zeile("A Kommode - schwarz 80x48 cm", "5.5", 10))})
        # Zwei alte Eintraege mit derselben Nummer, die kein Eintrag dieses Laufs traegt.
        doppelt = [{"id": "ikea-x1", "brand": "IKEA", "articleNo": "6.6", "name": {"de": "X1", "en": "X1"}},
                   {"id": "ikea-x2", "brand": "IKEA", "articleNo": "6.6", "name": {"de": "X2", "en": "X2"}}]
        a[4].write_text(json.dumps(doppelt))
        self.assertEqual(self.lauf(*a), 1)
        self.assertEqual(json.loads(a[4].read_text()), doppelt)
        self.assertIn("IKEA 66", json.loads((a[2] / "report.json").read_text())["fehler"])
        self.assertEqual(update.doppelte([{"id": "a", "brand": "IKEA", "articleNo": "1.2"}, {"id": "a", "brand": "JYSK", "articleNo": "1.2"}]), ["a"])

    def test_kuratiert_vorrang_ueber_cache_artikelnummer(self):
        a = self.aufbau({"https://www.ikea.com/ch/de/p/malm-000/": ("produkt", ikea_zeile("A Kommode - schwarz 80x48 cm", "100.000.01", 10))})
        self.lauf(*a, kur=[{"id": "kur", "articleNo": "100.000.01"}])
        self.assertEqual(json.loads(a[4].read_text()), [])


class KuratiertAbgleich(unittest.TestCase):
    URL = "https://www.ikea.com/ch/de/p/malm-000/"

    def rows(self, status="produkt", preis=100, nr="100.000.01"):
        return {"ikea": {self.URL: {"url": self.URL, "artikelnummer": nr, "preis_chf": preis, "verschwunden": status != "produkt"}}}

    def test_preis_anders(self):
        d = bericht.kuratiert_abgleich([{"id": "k", "url": self.URL.rstrip("/") + "?x=1", "priceChf": 90}], self.rows())
        self.assertEqual([(x["id"], x["alt"], x["neu"], x["grund"]) for x in d], [("k", 90, 100, "Preis")])

    def test_preis_gleich_und_treffer_ueber_artikelnummer(self):
        k = [{"id": "k", "articleNo": "100.000.01", "priceChf": 100.0}]
        self.assertEqual(bericht.kuratiert_abgleich(k, self.rows()), [])
        k[0]["priceChf"] = 80
        self.assertEqual(len(bericht.kuratiert_abgleich(k, self.rows())), 1)

    def test_verschwunden(self):
        d = bericht.kuratiert_abgleich([{"id": "k", "url": self.URL, "priceChf": 100}], self.rows("404"))
        self.assertEqual((d[0]["neu"], d[0]["grund"][:12]), ("verschwunden", "verschwunden"))
        # bereits discontinued: keine Abweichung
        self.assertEqual(bericht.kuratiert_abgleich([{"id": "k", "url": self.URL, "discontinued": True}], self.rows("404")), [])

    def test_wieder_da(self):
        d = bericht.kuratiert_abgleich([{"id": "k", "url": self.URL, "priceChf": 100, "discontinued": True}], self.rows())
        self.assertEqual((d[0]["alt"], d[0]["neu"]), ("discontinued", "wieder da"))

    def test_kein_treffer(self):
        k = [{"id": "k", "url": "https://www.ikea.com/ch/de/p/anders-1/", "articleNo": "999.999.99", "priceChf": 1}]
        self.assertEqual(bericht.kuratiert_abgleich(k, self.rows()), [])

    def test_bericht_und_curated_md(self):
        d = tmp()
        basis, state, out, web = d / "basis", d / "state", d / "out", d / "web"
        for p in (basis, state, out, web):
            p.mkdir()
        (basis / "zuordnung.json").write_text("{}")
        z = zs.Zustand(state / "ikea.jsonl", "https://www.ikea.com/ch/de/p/")
        e = z.eintrag(self.URL)
        e.update(umfang=True, status="produkt", geprueft="2026-10-15", zeile=ikea_zeile("A Kommode", "100.000.01", 100))
        z.speichern()
        kur = [{"id": f"k{i}", "articleNo": "100.000.01", "priceChf": 200 + i} for i in range(60)]
        (out / "kuratiert.json").write_text(json.dumps(kur))
        self.assertEqual(update.normalize_lauf(d / "full.json", state, out, web, basis, cache_erlaubt=True, zustand_schreiben=True), 0)
        rep = json.loads((out / "report.json").read_text())
        self.assertEqual(rep["curated_diffs"], 60)
        md = (out / "curated.md").read_text()
        self.assertEqual(md.count("| `k"), 50)
        self.assertIn("und 10 weitere", md)
        self.assertIn("Kuratierte Eintraege", (out / "report.md").read_text())
        # ohne Abweichung: Schluessel mit 0, Datei wird geloescht
        (out / "kuratiert.json").write_text(json.dumps([{"id": "k", "articleNo": "100.000.01", "priceChf": 100}]))
        update.normalize_lauf(d / "full.json", state, out, web, basis, cache_erlaubt=True, zustand_schreiben=True)
        self.assertEqual(json.loads((out / "report.json").read_text())["curated_diffs"], 0)
        self.assertFalse((out / "curated.md").exists())


class UmfangTest(unittest.TestCase):
    def test_zeile_faellt_bei_false_weg(self):
        d = tmp()
        z = zs.Zustand(d / "x.jsonl", "https://x/")
        z.uebernimm({"url": "https://x/a/", "ergebnis": "produkt", "name": "A", "im_umfang": False}, "2026-10-01", True)
        self.assertIsNone(z.eintraege["https://x/a/"]["zeile"])
        z.eintraege["https://x/b/"] = {**zs.neuer_eintrag(), "umfang": False, "status": "produkt", "zeile": {"name": "B"}}
        z.speichern()
        self.assertNotIn("zeile", (d / "x.jsonl").read_text())
        (d / "y.jsonl").write_text('{"u":"c/","umfang":false,"status":"produkt","geprueft":"2026-10-01","zeile":{"name":"C"}}\n')
        self.assertIsNone(zs.Zustand(d / "y.jsonl", "https://x/").laden().eintraege["https://x/c/"]["zeile"])

    def zustand_mit_ausgeschlossenen(self, state):
        z = zs.Zustand(state / "jysk.jsonl", jysk.PRAEFIX)
        aus = "https://jysk.ch/de/badezimmer/handtuecher/x/"
        ein = PFAD + "a/"
        z.eintrag(aus).update(umfang=False, status="offen")
        z.eintrag(ein).update(umfang=True, status="produkt", geprueft="2026-10-14", zeile={"name": "A"})
        z.speichern()
        return aus

    def test_hash_unveraendert_nichts_passiert(self):
        state, out = tmp(), tmp()
        aus = self.zustand_mit_ausgeschlossenen(state)
        zs.schreibe_hash(state, "jysk", zs.umfang_hash(jysk))
        code, b, op = lauf(state, out, sitemap(), ohne_suche=True, tag="2026-10-15")
        self.assertEqual(b["umfang_neu_beurteilt"], 0)
        self.assertIs(zs.Zustand(state / "jysk.jsonl", jysk.PRAEFIX).laden().eintraege[aus]["umfang"], False)

    def test_erster_lauf_ohne_hash_merkt_nur(self):
        state, out = tmp(), tmp()
        self.zustand_mit_ausgeschlossenen(state)
        code, b, _ = lauf(state, out, {}, ohne_suche=True, max_urls=0)
        self.assertEqual(b["umfang_neu_beurteilt"], 0)
        self.assertEqual(zs.lies_hashes(state)["jysk"], zs.umfang_hash(jysk))

    def test_hash_geaendert_jysk_sofort_neu_berechnet(self):
        state, out = tmp(), tmp()
        aus = self.zustand_mit_ausgeschlossenen(state)
        zs.schreibe_hash(state, "jysk", "alt")
        # Umfang erweitert: 'badezimmer' gehoert jetzt dazu -> Eintrag war False, wird True (Hash-Wechsel), Rest bleibt
        cfg = jysk.lade_umfang()
        orig = jysk.lade_umfang
        neu = {**cfg, "einschliessen": list(cfg["einschliessen"]) + ["badezimmer/handtuecher"]}
        jysk.lade_umfang = lambda *a, **k: neu
        try:
            code, b, op = lauf(state, out, {**seiten("a")}, ohne_suche=True, max_urls=0, tag="2026-10-15")
        finally:
            jysk.lade_umfang = orig
        self.assertEqual(b["umfang_neu_beurteilt"], 1)
        e = zs.Zustand(state / "jysk.jsonl", jysk.PRAEFIX).laden().eintraege[aus]
        self.assertIs(e["umfang"], True)
        self.assertEqual(e["status"], "offen")
        # zweiter Lauf: Hash gespeichert, kein erneutes Zuruecksetzen
        code, b, _ = lauf(state, out, {}, ohne_suche=True, max_urls=0)
        self.assertEqual(b["umfang_neu_beurteilt"], 0)

    def test_hash_geaendert_ikea_auf_none_und_in_warteschlange(self):
        state, out = tmp(), tmp()
        u = "https://www.ikea.com/ch/de/p/foo-kommode-10000001/"
        z = zs.Zustand(state / "ikea.jsonl", ikea.PRAEFIX)
        z.eintrag(u).update(umfang=False, status="produkt", geprueft="2026-10-14")
        z.speichern()
        zs.schreibe_hash(state, "ikea", "alt")
        produkt = ('<script type="application/ld+json">{"@type":"Product","name":"FOO Kommode","sku":"100.000.01"}</script>'
                   '<script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[{"name":"Produkte"},{"name":"X","item":"https://www.ikea.com/ch/de/cat/x-st001/"}]}</script>')
        robots = {"https://www.ikea.com/robots.txt": Antwort(200, b"User-agent: *\n", "text/plain")}
        op = FalscherOpener({**robots, u: Antwort(200, produkt.encode())})
        code, b = update.index_lauf(ikea, state=state, out=out, opener=op, lock_dir=tmp(), pause=0.0, ohne_suche=True, tag="2026-10-15")
        self.assertEqual((b["umfang_neu_beurteilt"], b["abgerufen"]), (1, 1))
        self.assertIn(u, op.urls)
        e = zs.Zustand(state / "ikea.jsonl", ikea.PRAEFIX).laden().eintraege[u]
        self.assertEqual(e["geprueft"], "2026-10-15")
        self.assertIs(e["umfang"], True)  # Kategorie st001 liegt im Umfang
        self.assertEqual(zs.lies_hashes(state)["ikea"], zs.umfang_hash(ikea))
        # ist die Seite ausserhalb, bleibt False bis zur naechsten Aenderung (keine Endlosschleife)
        zs.schreibe_hash(state, "ikea", "alt2")
        z = zs.Zustand(state / "ikea.jsonl", ikea.PRAEFIX).laden()
        z.eintraege[u]["umfang"] = False
        z.speichern()
        produkt2 = produkt.replace("st001", "zz999")
        op = FalscherOpener({**robots, u: Antwort(200, produkt2.encode())})
        update.index_lauf(ikea, state=state, out=out, opener=op, lock_dir=tmp(), pause=0.0, ohne_suche=True, tag="2026-10-16")
        e = zs.Zustand(state / "ikea.jsonl", ikea.PRAEFIX).laden().eintraege[u]
        self.assertIs(e["umfang"], False)
        self.assertIsNone(e["zeile"])
        op = FalscherOpener(robots)
        code, b = update.index_lauf(ikea, state=state, out=out, opener=op, lock_dir=tmp(), pause=0.0, ohne_suche=True, tag="2026-10-17")
        self.assertEqual((b["umfang_neu_beurteilt"], b["abgerufen"]), (0, 0))

    def test_tchibo_neu_berechnet(self):
        state, out = tmp(), tmp()
        z = zs.Zustand(state / "tchibo.jsonl", tchibo.PRAEFIX)
        z.eintrag("https://www.tchibo.ch/products/1/regal-metall/").update(umfang=False, status="offen")
        z.eintrag("https://www.tchibo.ch/products/2/pyjama-x/").update(umfang=False, status="offen")
        z.speichern()
        zs.schreibe_hash(state, "tchibo", "alt")
        op = FalscherOpener({})
        code, b = update.index_lauf(tchibo, state=state, out=out, opener=op, lock_dir=tmp(), pause=0.0, ohne_suche=True, max_urls=0)
        self.assertEqual(b["umfang_neu_beurteilt"], 2)
        e = zs.Zustand(state / "tchibo.jsonl", tchibo.PRAEFIX).laden().eintraege
        self.assertIs(e["https://www.tchibo.ch/products/1/regal-metall/"]["umfang"], True)
        self.assertIs(e["https://www.tchibo.ch/products/2/pyjama-x/"]["umfang"], False)


class ImportUndStand(unittest.TestCase):
    def test_import(self):
        von, ziel = tmp(), tmp()
        u1, u2, u3 = PFAD + "a/", PFAD + "b/", "https://jysk.ch/de/badezimmer/handtuecher/c/"
        zeile = lambda u, tag, **k: json.dumps({"shop": "jysk", "url": u, "abgerufen": f"{tag}T10:00:00+02:00", "ergebnis": "produkt",
                                                "name": "N", "artikelnummer": "1", "preis_chf": 9, "masse": g.leere_masse(), "farbe": "Weiss",
                                                "masse_zeilen": ["x"], "varianten": [], "verfuegbarkeit": "InStock", **k})
        (von / "jysk.jsonl").write_text("\n".join([zeile(u1, "2026-10-01", preis_chf=8), zeile(u1, "2026-10-08"),
                                                   json.dumps({"url": u2, "abgerufen": "2026-10-08T10:00:00+02:00", "ergebnis": "404"}),
                                                   zeile(u2, "2026-10-01")]) + '\n{"url": "halb')
        (von / "jysk-urls.jsonl").write_text("\n".join(json.dumps({"url": u, "quellen": ["sitemap"]}) for u in (u1, u2, u3)) + "\n")
        (von / "ids.json").write_text('{"a": "b"}')
        (ziel / "ids.json").write_text('{"a": "alt", "c": "d"}')
        self.assertEqual(update.import_lauf(von, {}, ziel), 0)
        z = zs.Zustand(ziel / "jysk.jsonl", jysk.PRAEFIX).laden()
        self.assertEqual(z.eintraege[u1]["zeile"]["preis_chf"], 9)  # neueste Zeile gewinnt
        self.assertEqual(z.eintraege[u1]["geprueft"], "2026-10-08")
        self.assertEqual(z.eintraege[u2]["status"], "produkt")  # spaeter in der Datei = neuer
        self.assertEqual(z.eintraege[u3]["status"], "offen")
        self.assertIs(z.eintraege[u3]["umfang"], False)  # ausserhalb des Umfangs
        self.assertNotIn("masse_zeilen", z.eintraege[u1]["zeile"])
        self.assertEqual(json.loads((ziel / "ids.json").read_text()), {"a": "alt", "c": "d"})
        # --ab: aeltere Zeilen werden ignoriert
        self.assertEqual(update.import_lauf(von, {"jysk": "2026-10-05"}, ziel), 0)
        z = zs.Zustand(ziel / "jysk.jsonl", jysk.PRAEFIX).laden()
        self.assertEqual(z.eintraege[u2]["status"], "404")
        self.assertIsNone(z.eintraege[u2]["zeile"])

    def test_import_404_nach_produkt_behaelt_zeile(self):
        von, ziel = tmp(), tmp()
        u = PFAD + "a/"
        (von / "jysk.jsonl").write_text(
            json.dumps({"url": u, "abgerufen": "2026-10-01T10:00:00+02:00", "ergebnis": "produkt", "name": "N", "preis_chf": 9}) + "\n"
            + json.dumps({"url": u, "abgerufen": "2026-10-08T10:00:00+02:00", "ergebnis": "404"}) + "\n")
        update.import_lauf(von, {}, ziel)
        e = zs.Zustand(ziel / "jysk.jsonl", jysk.PRAEFIX).laden().eintraege[u]
        self.assertEqual((e["status"], e["zeile"]["name"]), ("404", "N"))

    def test_stand(self):
        d = tmp()
        p = d / "index.ts"
        p.write_text("import x from 'y';\n\nexport const CATALOG_PRICES_AS_OF = '2026-10';\nexport const ANDERS = '2026-10';\n")
        self.assertEqual(update.setze_stand(p, "2026-12-03"), 0)
        self.assertEqual(p.read_text(), "import x from 'y';\n\nexport const CATALOG_PRICES_AS_OF = '2026-12';\nexport const ANDERS = '2026-10';\n")
        self.assertEqual(update.setze_stand(p, "2027-01-31"), 0)
        self.assertIn("'2027-01'", p.read_text())
        self.assertEqual(update.setze_stand(p, "kaputt"), 1)
        p.write_text("export const CATALOG_PRICES_AS_OF = 'bald';\n")
        self.assertEqual(update.setze_stand(p, "2026-12-03"), 1)
        self.assertEqual(update.setze_stand(d / "fehlt.ts", "2026-12-03"), 1)

    def test_lock_verzeichnis(self):
        import os
        alt = os.environ.get("ROOMX_INDEX_LOCKS")
        try:
            os.environ["ROOMX_INDEX_LOCKS"] = "/x/y"
            self.assertEqual(g.lock_verzeichnis(), Path("/x/y"))
            del os.environ["ROOMX_INDEX_LOCKS"]
            self.assertEqual(g.lock_verzeichnis(), Path(tempfile.gettempdir()) / "roomx-index")
        finally:
            if alt is not None:
                os.environ["ROOMX_INDEX_LOCKS"] = alt


class UntypischeSeite(unittest.TestCase):
    """Eine Ausnahme aus modul.hole ist Fehler dieser URL, ausser Blockiert."""

    def modul(self, wirf):
        class M:
            def __getattr__(self, n):
                return getattr(jysk, n)

            def hole(self, shop, url, ctx):
                if url.endswith("/a/"):
                    raise wirf
                return jysk.hole(shop, url, ctx)
        return M()

    def test_fremde_ausnahme_beendet_lauf_nicht(self):
        state, out = tmp(), tmp()
        vorbereiten(state, {"a": None, "b": None})
        op = FalscherOpener({**sitemap(), **seiten("a", "b")})
        code, b = update.index_lauf(self.modul(AttributeError("'str' object has no attribute 'get'")), state=state, out=out,
                                    opener=op, lock_dir=tmp(), pause=0.0, ohne_suche=True)
        self.assertEqual((code, b["abgerufen"], b["fehler"]), (0, 2, 1))
        self.assertIn("AttributeError", b["fehler_beispiele"][0])
        z = zs.Zustand(state / "jysk.jsonl", jysk.PRAEFIX).laden()
        self.assertEqual(z.eintraege[PFAD + "b/"]["status"], "produkt")

    def test_blockiert_bleibt_code_2(self):
        state, out = tmp(), tmp()
        vorbereiten(state, {"a": None, "b": None})
        op = FalscherOpener({**sitemap(), **seiten("a", "b")})
        code, b = update.index_lauf(self.modul(g.Blockiert("403")), state=state, out=out,
                                    opener=op, lock_dir=tmp(), pause=0.0, ohne_suche=True)
        self.assertEqual((code, b["blockiert"]), (2, True))


class BerichtTextTest(unittest.TestCase):
    def test_shop_text_entschaerft(self):
        t = bericht.md_text("Kommode | a\nb @xc4pr " + "x" * 300)
        self.assertNotIn("\n", t)
        self.assertNotIn("@x", t)
        self.assertIn("\\|", t)
        self.assertEqual(len(t), 200)
        self.assertTrue(t.endswith("\u2026"))
        md = bericht.kuratiert_tabelle([{"id": "i", "alt": 1, "neu": 2, "grund": "Preis", "url": "https://x/a|b"}])
        self.assertIn("a\\|b", md)


if __name__ == "__main__":
    unittest.main()
