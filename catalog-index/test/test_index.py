import io
import json
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
from email.message import Message
from pathlib import Path

HIER = Path(__file__).resolve().parent
sys.path.insert(0, str(HIER.parent))
import gemeinsam as g  # noqa: E402
import ikea  # noqa: E402


def lies(name):
    return (HIER / name).read_text(encoding="utf-8")


class Antwort:
    def __init__(self, status=200, body=b"", typ="text/html; charset=utf-8", weiter=None):
        self.status, self.body, self.typ, self.weiter = status, body, typ, weiter


class FalscherOpener:
    """Ersetzt urllib: Antworten je URL; HTTP-Fehler und Weiterleitungen als HTTPError wie in echt."""

    def __init__(self, antworten, log=None):
        self.antworten = antworten
        self.urls = []
        self.zeiten = log if log is not None else []

    def open(self, req, timeout=30):
        url = req.full_url
        self.urls.append(url)
        self.zeiten.append(time.time())
        a = self.antworten.get(url) or Antwort(404)
        h = Message()
        h["Content-Type"] = a.typ
        if a.weiter:
            h["Location"] = a.weiter
        if a.status >= 300:
            raise urllib.error.HTTPError(url, a.status, "x", h, io.BytesIO(a.body))
        o = type("R", (), {})()
        o.status, o.headers = a.status, h
        o.read = lambda n=-1, b=a.body: b
        o.__enter__ = lambda s: s
        o.__exit__ = lambda s, *x: False
        return _Ctx(o)


class _Ctx:
    def __init__(self, o):
        self.o = o
        self.status, self.headers = o.status, o.headers

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self, n=-1):
        return self.o.read(n)


ROBOTS = "User-agent: *\nDisallow: */search/?q=*\nDisallow: /compare*\nDisallow: *?filter=*\nSitemap: https://www.ikea.com/sitemaps/sitemap.xml\n"


def shop(antworten, pause=0.0, tmp=None, zeiten=None):
    antworten = {"https://www.ikea.com/robots.txt": Antwort(200, ROBOTS.encode(), "text/plain"), **antworten}
    s = g.Shop("test", "www.ikea.com", pause=pause, lock_dir=Path(tmp or tempfile.mkdtemp()),
               opener=FalscherOpener(antworten, zeiten))
    return s


def ld_seite(produkt, krumel=None):
    teile = [f'<script type="application/ld+json">{json.dumps(produkt)}</script>']
    if krumel:
        teile.append(f'<script type="application/ld+json">{json.dumps(krumel)}</script>')
    return "<html><body>" + "".join(teile) + "</body></html>"


class Url(unittest.TestCase):
    def test_vereinheitlichen(self):
        w = "https://www.ikea.com/ch/de/p/x-123/"
        for u in ("http://ikea.com/ch/de/p/x-123", "https://www.ikea.com/ch/de/p/x-123/?a=1#content",
                  "https://www.ikea.com//ch/de/p/x-123/"):
            self.assertEqual(ikea.url_norm(u), w)

    def test_medien(self):
        self.assertTrue(g.medien_url("https://www.ikea.com/ch/de/images/products/a.jpg"))
        self.assertTrue(g.medien_url("https://web-api.ikea.com/dimma/assets/1/x"))
        self.assertTrue(g.medien_url("https://x/geomagical/a"))
        self.assertFalse(g.medien_url("https://www.ikea.com/ch/de/p/x-123/"))


class Parser(unittest.TestCase):
    def test_produkt(self):
        d = ikea.parse_produkt(lies("ikea_rast.html"))
        self.assertEqual(d["artikelnummer"], "206.098.60")
        self.assertEqual(d["masse"]["breite_cm"], 60)
        self.assertEqual(d["masse"]["tiefe_cm"], 35)
        self.assertEqual(d["masse"]["hoehe_cm"], 59)
        self.assertEqual(d["preis_chf"], 49.95)
        self.assertIsNone(d["aktionspreis_chf"])
        self.assertEqual(d["kategorie_pfad"], ["Aufbewahrungsmöbel", "Kommoden & Nachttische", "Kommoden"])
        self.assertEqual(d["kategorie_ids"], ["st001", "st004", "10451"])
        self.assertIn("Breite 60 cm", d["masse_zeilen"])

    def test_aktion(self):
        p = {"@type": "Product", "name": "GULLABERG", "sku": "806.098.95", "offers": {"price": "179", "priceSpecification": [
            {"price": "179", "priceCurrency": "CHF"},
            {"price": "199", "priceCurrency": "CHF", "priceType": "https://schema.org/StrikethroughPrice"}]}}
        d = ikea.parse_produkt(ld_seite(p))
        self.assertEqual((d["preis_chf"], d["aktionspreis_chf"]), (199, 179))

    def test_family_preis_ist_kein_regulaerer_preis(self):
        p = {"@type": "Product", "name": "LUSTEBO", "sku": "905.344.61", "offers": {"price": "119", "priceSpecification": {
            "@type": "UnitPriceSpecification", "price": "99.95", "priceCurrency": "CHF",
            "validForMemberTier": {"@type": "MemberProgramTier", "name": "IKEA Family"}}}}
        d = ikea.parse_produkt(ld_seite(p))
        self.assertEqual((d["preis_chf"], d["aktionspreis_chf"]), (119, None))

    def test_einheit_mm_und_rohwerte(self):
        p = {"@type": "Product", "name": "RANARP", "width": "280 mm", "depth": "760 mm", "height": "153 cm"}
        d = ikea.parse_produkt(ld_seite(p))
        self.assertEqual((d["masse"]["breite_cm"], d["masse"]["tiefe_cm"], d["masse"]["hoehe_cm"]), (28, 76, 153))
        # Schreibtisch mit vertauschten Werten: unveraendert speichern
        p = {"@type": "Product", "name": "LAGKAPTEN 120x60 cm", "width": "60 cm", "depth": "120 cm"}
        d = ikea.parse_produkt(ld_seite(p))
        self.assertEqual((d["masse"]["breite_cm"], d["masse"]["tiefe_cm"]), (60, 120))

    def test_massangaben_ersatz(self):
        zeile = ('<li class="pipf-measurements-tab__measurement-row"><span class="pipf-measurements-tab__measurement-name">Durchmesser</span>'
                 '<span class="pipf-measurements-tab__measurement-value">45 cm</span></li>')
        d = ikea.parse_produkt(ld_seite({"@type": "Product", "name": "X"}) + zeile)
        self.assertEqual(d["masse"]["durchmesser_cm"], 45)
        self.assertEqual(d["masse_zeilen"], ["Durchmesser 45 cm"])

    def test_keine_produktdaten(self):
        self.assertIsNone(ikea.parse_produkt("<html></html>")["name"])

    def test_varianten(self):
        v = ikea.varianten(lies("ikea_storklinta.html"), "https://www.ikea.com/ch/de/p/storklinta-kommode-mit-4-schubladen-dunkelgrau-40628221/")
        self.assertEqual(len(v), 3)
        self.assertTrue(all(u.endswith("/") and "#" not in u for u in v))

    def test_kategorie(self):
        k = ikea.parse_kategorie(lies("ikea_kategorie.html"))
        self.assertEqual((k["id"], k["total"]), ("10451", 116))
        self.assertEqual(len(k["produkte"]), 24)
        self.assertTrue(any(l[-1] == "18708" for _, l in k["karten"]))

    def test_sitemap_ohne_bild_urls(self):
        xml = ('<urlset><url><loc>https://www.ikea.com/ch/de/p/a-123/</loc><image:image><image:loc>https://www.ikea.com/ch/de/images/products/a.jpg</image:loc></image:image></url>'
               '<url><loc>https://www.ikea.com/ch/de/cat/x-1/</loc></url></urlset>')
        self.assertEqual(ikea.parse_sitemap(xml), ["https://www.ikea.com/ch/de/p/a-123/"])
        idx = "<sitemapindex><loc>https://www.ikea.com/sitemaps/prod-de-CH_1.xml</loc><loc>https://www.ikea.com/sitemaps/prod-fr-CH_1.xml</loc><loc>https://www.ikea.com/sitemaps/cat-de-CH_1.xml</loc></sitemapindex>"
        self.assertEqual(ikea.sitemap_dateien(idx), ["https://www.ikea.com/sitemaps/prod-de-CH_1.xml"])

    def test_umfang(self):
        baum = [{"id": "st001", "name": "A", "url": "/ch/de/cat/a-st001/", "subs": [
                    {"id": "1", "name": "B", "url": "/ch/de/cat/b-1/"}, {"id": "2", "name": "Bad", "url": "/ch/de/cat/bad-2/"}]},
                {"id": "kt001", "name": "Kueche", "url": "/ch/de/cat/k-kt001/", "subs": [{"id": "3", "name": "Wagen", "url": "/ch/de/cat/w-3/"}]}]
        umfang = {"einschliessen": {"st001": ""}, "zusaetzlich": {"3": ""}, "ausschliessen": {"2": ""}}
        ids = {k["id"] for k in ikea.knoten_im_umfang(baum, umfang)}
        self.assertEqual(ids, {"st001", "1", "3"})
        self.assertTrue(ikea.im_umfang(["st001", "1"], umfang, ids))
        self.assertFalse(ikea.im_umfang(["st001", "2"], umfang, ids))


class Robots(unittest.TestCase):
    def test_wildcards(self):
        r = g.Robots(ROBOTS)
        self.assertFalse(r.erlaubt("https://www.ikea.com/ch/de/search/?q=bett"))
        self.assertFalse(r.erlaubt("https://www.ikea.com/compare/x"))
        self.assertFalse(r.erlaubt("https://www.ikea.com/ch/de/cat/x/?filter=a"))
        self.assertTrue(r.erlaubt("https://www.ikea.com/ch/de/p/a-123/"))

    def test_verboten_wird_nicht_abgerufen(self):
        s = shop({})
        with self.assertRaises(g.Verboten):
            s.hole("https://www.ikea.com/compare/x")
        self.assertNotIn("https://www.ikea.com/compare/x", s.opener.urls)


class Abruf(unittest.TestCase):
    def test_403_bricht_ab(self):
        s = shop({"https://www.ikea.com/ch/de/p/a-1/": Antwort(403)})
        with self.assertRaises(g.Blockiert):
            s.hole("https://www.ikea.com/ch/de/p/a-1/")

    def test_fuenf_fehler_in_folge(self):
        s = shop({f"https://www.ikea.com/ch/de/p/a-{i}/": Antwort(500) for i in range(5)})
        for i in range(4):
            self.assertEqual(s.hole(f"https://www.ikea.com/ch/de/p/a-{i}/").status, 500)
        with self.assertRaises(g.Blockiert):
            s.hole("https://www.ikea.com/ch/de/p/a-4/")

    def test_medientyp_wird_nicht_gelesen(self):
        s = shop({"https://www.ikea.com/ch/de/p/a-1/": Antwort(200, b"\xff" * 10, "image/jpeg")})
        self.assertEqual(s.hole("https://www.ikea.com/ch/de/p/a-1/").text, "")

    def test_sperre_zwischen_prozessen(self):
        tmp = tempfile.mkdtemp()
        zeiten = []
        urls = {f"https://www.ikea.com/ch/de/p/a-{i}/": Antwort(200, b"<html></html>") for i in range(6)}
        s = [shop(urls, pause=0.3, tmp=tmp, zeiten=zeiten) for _ in range(3)]
        for x in s:
            x.robots = g.Robots("")

        def lauf(x, k):
            for i in (k, k + 3):
                x.hole(f"https://www.ikea.com/ch/de/p/a-{i}/")

        ts = [threading.Thread(target=lauf, args=(x, k)) for k, x in enumerate(s)]
        [t.start() for t in ts]
        [t.join() for t in ts]
        zeiten.sort()
        self.assertEqual(len(zeiten), 6)
        abstaende = [b - a for a, b in zip(zeiten, zeiten[1:])]
        self.assertGreaterEqual(min(abstaende), 0.28)
        self.assertTrue((Path(tmp) / "shop-test.lock").read_text().strip())

    def test_weiterleitungen(self):
        a, b, c = ("https://www.ikea.com/ch/de/p/" + n + "/" for n in ("-111", "ziel-111", "weg-222"))
        produkt = ld_seite({"@type": "Product", "name": "ZIEL", "sku": "1", "width": "50 cm"})
        s = shop({a: Antwort(301, weiter=b), b: Antwort(200, produkt.encode()),
                  c: Antwort(301, weiter="https://www.ikea.com/ch/de/cat/kuechenstuehle-25220/"),
                  "https://www.ikea.com/ch/de/p/tot-3/": Antwort(404)})
        z = ikea.ruf_seite(s, a, None, set())
        self.assertEqual((z["ergebnis"], z["url"], z["weiter_von"]), ("produkt", b, a))
        z = ikea.ruf_seite(s, c, None, set())
        self.assertEqual((z["ergebnis"], z["status"], z["weiter"]), ("weiterleitung", 301, "https://www.ikea.com/ch/de/cat/kuechenstuehle-25220/"))
        self.assertEqual(ikea.ruf_seite(s, "https://www.ikea.com/ch/de/p/tot-3/", None, set())["ergebnis"], "404")


class SitemapRangTest(unittest.TestCase):
    def test_reihenfolge(self):
        u = "https://www.ikea.com/ch/de/p/{}-{}-weiss-{}/"
        zeilen = {
            "a": {"url": u.format("malm", "kommode", "10403550"), "ergebnis": "produkt", "im_umfang": True},
            "b": {"url": u.format("ikea365", "topf", "s00000001"), "ergebnis": "produkt", "im_umfang": False},
        }
        rang = ikea.sitemap_rang(zeilen)
        e = lambda serie, art, nr, q=("sitemap",): {"url": u.format(serie, art, nr), "quellen": list(q)}
        liste = [e("x", "topf", "20000001"), e("y", "sessel", "20000002"), e("hemnes", "kommode", "20000003"),
                 e("z", "topf", "20000004", ("kategorie:k", "sitemap"))]
        liste.sort(key=rang)
        self.assertEqual([ikea.art_wort(x["url"]) for x in liste], ["topf", "kommode", "sessel", "topf"])
        self.assertEqual(rang(liste[0]), 0)
        self.assertEqual(len(liste), 4)


if __name__ == "__main__":
    unittest.main()
