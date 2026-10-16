import json
import sys
import tempfile
import unittest
from pathlib import Path

HIER = Path(__file__).resolve().parent
sys.path.insert(0, str(HIER.parent))
sys.path.insert(0, str(HIER))
import gemeinsam as g  # noqa: E402
import jysk  # noqa: E402
import tchibo  # noqa: E402
from test_index import Antwort, FalscherOpener  # noqa: E402


def lies(name):
    return (HIER / name).read_text(encoding="utf-8")


def shop(name, host, robots, antworten):
    antworten = {f"https://{host}/robots.txt": Antwort(200, robots.encode(), "text/plain"), **antworten}
    return g.Shop(name, host, pause=0.0, lock_dir=Path(tempfile.mkdtemp()), opener=FalscherOpener(antworten))


JYSK_ROBOTS = "User-agent: *\nDisallow: /search\nDisallow: /basket/\nDisallow: *filters=*\nSitemap: https://jysk.ch/sitemap.xml\n"
TCHIBO_ROBOTS = "User-agent: *\nDisallow: /search\nDisallow: /*?x=\nSitemap: https://www.tchibo.ch/sitemap.xml\n"


class Hilfen(unittest.TestCase):
    def test_masse_aus_text(self):
        m = g.masse_aus_text
        self.assertEqual({k: v for k, v in m("Breite: 70 cm, Höhe: 160 cm, Tiefe: 2 cm").items() if v}, {"breite_cm": 70, "hoehe_cm": 160, "tiefe_cm": 2})
        self.assertEqual({k: v for k, v in m("B x H x T ca. 16,5 x 10 x 25,5 cm").items() if v}, {"breite_cm": 16.5, "hoehe_cm": 10, "tiefe_cm": 25.5})
        self.assertEqual({k: v for k, v in m("Massive Eiche. B70 x H160 x T2 cm").items() if v}, {"breite_cm": 70, "hoehe_cm": 160, "tiefe_cm": 2})
        self.assertEqual(m("Ø ca. 30 cm")["durchmesser_cm"], 30)
        self.assertEqual(m("Länge: 1,2 m")["laenge_cm"], 120)
        self.assertEqual(m("Höhe 280 mm")["hoehe_cm"], 28)
        self.assertTrue(all(v is None for v in m("Höhe: 106-124 cm, ohne Angabe").values()))  # Bereiche bleiben null

    def test_preis_aus_text(self):
        self.assertEqual(g.preis_aus_text("CHF 109.- /Stk"), 109)
        self.assertEqual(g.preis_aus_text("CHF 12.95"), 12.95)
        self.assertEqual(g.preis_aus_text("CHF 1'299.-"), 1299)
        self.assertIsNone(g.preis_aus_text("kostenlos"))


class Jysk(unittest.TestCase):
    def test_produkt_mit_aktion(self):
        d = jysk.parse_produkt(lies("jysk_spiegel.html"))
        self.assertEqual((d["name"], d["artikelnummer"]), ("Spiegel RAVNDAL 70x160 Eiche natur", "7200639"))
        self.assertEqual((d["preis_chf"], d["aktionspreis_chf"]), (109, 75))
        self.assertEqual((d["masse"]["breite_cm"], d["masse"]["hoehe_cm"], d["masse"]["tiefe_cm"]), (70, 160, 2))
        self.assertEqual(d["kategorie_pfad"], ["Wohnaccessoires", "Spiegel"])
        self.assertEqual(d["farbe"], "Natürliche Eiche")
        self.assertIn("Grösse montiert: Breite: 70 cm, Höhe: 160 cm, Tiefe: 2 cm", d["masse_zeilen"])

    def test_bestellnummer_statt_mpn(self):
        seite = ('<script type="application/ld+json">{"@type":"Product","name":"Offene Garderobe","mpn":"654865"}</script>'
                 '<p class="pdp__product-description__orderNumber">Bestellnummer: 177964</p>')
        self.assertEqual(tchibo.parse_produkt(seite)["artikelnummer"], "177964")
        self.assertEqual(tchibo.parse_produkt(seite.split("<p")[0])["artikelnummer"], "654865")

    def test_produktgruppe_waehlt_variante_der_seite(self):
        url = "https://jysk.ch/de/aufbewahrung/kommoden/4-schubladen-kommode-limfjorden-weiss/"
        d = jysk.parse_produkt(lies("jysk_kommode.html"), url)
        self.assertEqual((d["artikelnummer"], d["preis_chf"], d["aktionspreis_chf"]), ("3618930", 90, None))
        self.assertEqual((d["masse"]["breite_cm"], d["masse"]["tiefe_cm"], d["masse"]["hoehe_cm"]), (81, 48, 101))
        self.assertEqual(d["varianten"], [])  # nur Suchlinks, keine Seiten

    def test_unmontiert_nur_als_ersatz(self):
        seite = ('<script type="application/ld+json">{"@type":"Product","name":"X","sku":"1"}</script>'
                 '<table><tr><th scope="row">Grösse unmontiert</th><td class="value">Breite: 51 cm, Länge: 112 cm</td></tr></table>')
        self.assertEqual(jysk.parse_produkt(seite)["masse"]["laenge_cm"], 112)

    def test_sitemap_nur_deutsch_und_kategorien_erkennen(self):
        xml = ('<urlset><url><loc>https://jysk.ch/de/a/b/p1</loc><xhtml:link rel="alternate" hreflang="fr" href="https://jysk.ch/fr/x/y/p1"/></url>'
               '<url><loc>https://jysk.ch/fr/x/y/p1</loc></url><url><loc>https://jysk.ch/de/a/b</loc></url>'
               '<url><loc>https://jysk.ch/de/a</loc></url><url><loc>https://jysk.ch/de/a/b/c/p2</loc></url>'
               '<url><loc>https://jysk.ch/de/a/b/c</loc></url><url><loc>https://jysk.ch/de/seite</loc></url></urlset>')
        alle = jysk.parse_sitemap(xml)
        self.assertNotIn("https://jysk.ch/fr/x/y/p1/", alle)
        self.assertEqual(jysk.produkt_urls(alle), ["https://jysk.ch/de/a/b/p1/", "https://jysk.ch/de/a/b/c/p2/"])
        idx = "<sitemapindex><loc>https://jysk.ch/sitemap.xml?page=1</loc><loc>https://jysk.ch/sitemap.xml?page=2</loc></sitemapindex>"
        self.assertEqual(len(jysk.sitemap_seiten(idx)), 2)

    def test_umfang(self):
        u = jysk.lade_umfang()
        ok = lambda p: jysk.im_umfang("https://jysk.ch/de/" + p, u)  # noqa: E731
        self.assertTrue(ok("wohnzimmer/sofas/sofa-x"))
        self.assertTrue(ok("schlafzimmer/betten/bett-x"))
        self.assertFalse(ok("schlafzimmer/matratzen/matratze-x"))
        self.assertFalse(ok("schlafzimmer/bettwasche/set/x"))
        self.assertFalse(ok("badezimmer/badtextilien/x"))
        self.assertFalse(ok("filialen/zuerich/x"))
        self.assertTrue(ok("neue-kategorie/unter/x"))  # im Zweifel aufnehmen

    def test_robots_und_url_form(self):
        self.assertEqual(jysk.url_norm("http://jysk.ch/de/a/b/c?x=1"), "https://jysk.ch/de/a/b/c/")
        self.assertEqual(jysk.abruf_url("https://jysk.ch/de/a/b/c/"), "https://jysk.ch/de/a/b/c")
        s = shop("jysk-test", "jysk.ch", JYSK_ROBOTS, {})
        with self.assertRaises(g.Verboten):
            s.hole("https://jysk.ch/search?q=bett")
        with self.assertRaises(g.Verboten):
            s.hole("https://jysk.ch/de/a/b/?filters=x")
        self.assertNotIn("https://jysk.ch/search?q=bett", s.opener.urls)

    def test_ruf_seite_ergebnisse(self):
        p = "https://jysk.ch/de/wohnaccessoires/spiegel/spiegel-ravndal-70x160-eiche-natur"
        s = shop("jysk-test", "jysk.ch", JYSK_ROBOTS, {
            p: Antwort(200, lies("jysk_spiegel.html").encode()),
            "https://jysk.ch/de/a/b/weg": Antwort(301, weiter="https://jysk.ch/de/a/b"),
            "https://jysk.ch/de/a/b/leer": Antwort(200, b"<html><body>nichts</body></html>"),
            "https://jysk.ch/de/a/b/tot": Antwort(404)})
        z = jysk.ruf_seite(s, p + "/")
        self.assertEqual((z["ergebnis"], z["status"], z["url"]), ("produkt", 200, p + "/"))
        self.assertEqual(z["aktionspreis_chf"], 75)
        self.assertIn(p, s.opener.urls)  # ohne Schraegstrich abgerufen
        z = jysk.ruf_seite(s, "https://jysk.ch/de/a/b/weg/")
        self.assertEqual((z["ergebnis"], z["weiter"]), ("weiterleitung", "https://jysk.ch/de/a/b/"))
        self.assertEqual(jysk.ruf_seite(s, "https://jysk.ch/de/a/b/leer/")["ergebnis"], "keine produktdaten")
        self.assertEqual(jysk.ruf_seite(s, "https://jysk.ch/de/a/b/tot/")["ergebnis"], "404")

    def test_403_bricht_ab(self):
        s = shop("jysk-test", "jysk.ch", JYSK_ROBOTS, {"https://jysk.ch/de/a/b/x": Antwort(403)})
        with self.assertRaises(g.Blockiert):
            jysk.ruf_seite(s, "https://jysk.ch/de/a/b/x/")


class TchiboTests(unittest.TestCase):
    def test_produkt(self):
        d = tchibo.parse_produkt(lies("tchibo_ordnungskisten.html"))
        self.assertEqual((d["name"], d["artikelnummer"], d["verfuegbarkeit"]), ("2 klappbare Ordnungskisten", "755962", "InStock"))
        self.assertEqual((d["preis_chf"], d["aktionspreis_chf"]), (9.95, 9))
        self.assertEqual((d["masse"]["breite_cm"], d["masse"]["hoehe_cm"], d["masse"]["tiefe_cm"]), (16.5, 10, 25.5))
        self.assertEqual(d["farbe"], "Türkis-blaugrün")
        self.assertEqual(d["masse_zeilen"][0], "B x H x T ca. 16,5 x 10 x 25,5 cm")

    def test_preis_ab_1000_mit_apostroph(self):
        bestpreis = '<div class="ds-price-best"><span>30-Tage-Bestpreis: </span><span class="ds-price-raw">849.00 CHF</span></div>'
        aktion = ('<div class="ds-stack pdp-price-display" data-v-6a3574be><div class="ds-price">'
                  '<del class="ds-price-previous"><span class="ds-price-a11y">Vorheriger Preis</span>'
                  '<span class="ds-price-raw">1&#39;099.00 CHF</span></del><!----><ins>'
                  '<span class="ds-price-a11y">Aktueller Preis</span><span class="ds-price-raw ds-price-number">849.00</span>'
                  '<span class="ds-currency-raw ds-price-currency">CHF</span></ins></div>' + bestpreis + '</div>')
        d = tchibo.parse_produkt(aktion)
        self.assertEqual((d["preis_chf"], d["aktionspreis_chf"]), (1099, 849))
        regulaer = ('<div class="ds-stack pdp-price-display"><div class="ds-price"><ins>'
                    '<span class="ds-price-a11y">Aktueller Preis</span><span class="ds-price-raw ds-price-number">1&#39;299.00</span>'
                    '<span class="ds-currency-raw ds-price-currency">CHF</span></ins></div>'
                    + bestpreis.replace("849.00", "1&#39;299.00") + '</div>')
        d = tchibo.parse_produkt(regulaer)
        self.assertEqual((d["preis_chf"], d["aktionspreis_chf"]), (1299, None))

    def test_ausverkauft_bleibt_erhalten(self):
        seite = ('<script type="application/ld+json">{"@type":"Product","name":"Sessel","mpn":"1","offers":[{"availability":"https://schema.org/OutOfStock","price":"99.00"}]}</script>')
        z = tchibo.parse_produkt(seite)
        self.assertEqual((z["verfuegbarkeit"], z["preis_chf"]), ("OutOfStock", 99))

    def test_kategorie(self):
        k = tchibo.parse_kategorie(lies("tchibo_kategorie.html"))
        self.assertEqual(k["total"], 89)
        self.assertEqual(len(k["artikel"]), 24)
        self.assertEqual(len(k["produkte"]), 20)
        self.assertEqual(k["pfad"], ["Wohnen & Garten", "Möbel", "Regale"])
        self.assertTrue(all(u.startswith("https://www.tchibo.ch/products/") and "?" not in u for u in k["produkte"].values()))

    def test_umfang_slug(self):
        u = tchibo.Umfang(tchibo.lade_umfang())
        for s in ("regal-metall-cn3", "tischleuchte-mit-glasschirm", "outdoor-teppich-ca-165-x-115-cm", "led-akku-tischleuchte",
                  "garderobe-metall-cn3-mit-kleiderstange", "dekokissenbezug", "kommode", "vorhang-set"):
            self.assertTrue(u.slug_passt(s), s)
        for s in ("2-kinder-pyjamas", "jerseykleid-mit-spitze", "bettwaesche-renforce", "kaffeemaschine-mit-tisch", "duschvorhang",
                  "seamless-sport-bh", "damenuhr-verziert", "spannbettlaken-jersey", "tischgrill-dinner4all"):
            self.assertFalse(u.slug_passt(s), s)
        self.assertTrue(u.eintrag_passt({"url": "https://www.tchibo.ch/products/1/pyjama-x/", "quellen": ["kategorie:https://www.tchibo.ch/categories/wohnen/moebel/"]}))
        self.assertFalse(u.eintrag_passt({"url": "https://www.tchibo.ch/products/1/pyjama-x/", "quellen": ["sitemap"]}))

    def test_sitemaps(self):
        idx = ("<sitemapindex><loc>https://www.tchibo.ch/service/sitemap/api/products/nonfood-1/sitemap.xml</loc>"
               "<loc>https://www.tchibo.ch/service/sitemap/api/products/coffee-1/sitemap.xml</loc>"
               "<loc>https://www.tchibo.ch/service/sitemap/api/categories/full-range/sitemap.xml</loc></sitemapindex>")
        self.assertEqual(len(tchibo.sitemap_dateien(idx, ["nonfood-1", "nonfood-2"])), 1)
        xml = "<urlset><url><loc>https://www.tchibo.ch/products/123/regal-x</loc></url><url><loc>https://www.tchibo.ch/categories/a</loc></url></urlset>"
        self.assertEqual(tchibo.parse_sitemap(xml), ["https://www.tchibo.ch/products/123/regal-x/"])

    def test_ruf_seite(self):
        p = "https://www.tchibo.ch/products/100003753046/2-klappbare-ordnungskisten"
        s = shop("tchibo-test", "www.tchibo.ch", TCHIBO_ROBOTS, {
            p: Antwort(200, lies("tchibo_ordnungskisten.html").encode()),
            "https://www.tchibo.ch/products/2/weg": Antwort(302, weiter="https://www.tchibo.ch/categories/wohnen"),
            "https://www.tchibo.ch/products/3/tot": Antwort(404)})
        u = tchibo.Umfang(tchibo.lade_umfang())
        z = tchibo.ruf_seite(s, p + "/", u, {})
        self.assertEqual((z["ergebnis"], z["im_umfang"]), ("produkt", True))
        z = tchibo.ruf_seite(s, p + "/", u, {p + "/": ["Wohnen & Garten", "Möbel"]})
        self.assertEqual(z["kategorie_pfad"], ["Wohnen & Garten", "Möbel"])
        self.assertEqual(tchibo.ruf_seite(s, "https://www.tchibo.ch/products/2/weg/", u)["ergebnis"], "weiterleitung")
        self.assertEqual(tchibo.ruf_seite(s, "https://www.tchibo.ch/products/3/tot/", u)["ergebnis"], "404")
        with self.assertRaises(g.Verboten):
            s.hole("https://www.tchibo.ch/search?q=x")
        with self.assertRaises(g.Verboten):
            s.hole("https://www.tchibo.ch/categories/wohnen?x=1")


if __name__ == "__main__":
    unittest.main()
