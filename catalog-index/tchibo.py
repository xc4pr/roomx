"""Tchibo-Schweiz (tchibo.ch): Produkt-URLs sammeln, Produktseiten lesen (ohne Sprachmodell). Wird von update.py benutzt.

Das Sortiment wechselt woechentlich: vor jedem Abruf wird neu nach URLs gesucht.
Quellen: (1) robots.txt -> Sitemap-Index -> Produkt-Sitemaps (nur 'nonfood-*', siehe tchibo-kategorien.json),
Produkt-URLs https://www.tchibo.ch/products/<nummer>/<slug>; die Sitemap kennt keinen Kategoriepfad, deshalb
Umfangsfilter ueber den Slug (Muster in tchibo-kategorien.json). (2) Kategorieseiten des Umfangs
(/categories/wohnen/...), mit ?page=N bis keine neuen Produkte mehr kommen; dort nennt der Shop selbst die
Anzahl ("Sie haben N von M Produkten gesehen"). Produkte von Kategorieseiten sind immer im Umfang.
Produktseite: JSON-LD Product (Name, mpn, Verfuegbarkeit), Preise aus dem sichtbaren Preisblock
(Vorheriger Preis / Aktueller Preis), Masse aus dem Abschnitt "Masse". Beschreibungen/Bewertungen werden nicht gespeichert.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

try:
    import gemeinsam as g
except ImportError:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import gemeinsam as g

SHOP = "tchibo"
HOST = "www.tchibo.ch"
KATEGORIEN = g.BASIS / "tchibo-kategorien.json"
PRAEFIX = "https://www.tchibo.ch/products/"
MAX_KATEGORIE_SEITEN = 60

P_URL = re.compile(r"^https://www\.tchibo\.ch/products/(\d+)/([^/?#]+)/?$")
PLURAL = "(?:s|e|en|n)?"


def url_norm(url: str) -> str:
    return g.vereinheitliche(url, HOST)


def abruf_url(url: str) -> str:
    return url_norm(url).rstrip("/")


# ------------------------------------------------------------ Umfang

def lade_umfang(pfad: Path = KATEGORIEN) -> dict:
    return json.loads(Path(pfad).read_text(encoding="utf-8"))


class Umfang:
    """Slug-Filter aus tchibo-kategorien.json (vorkompilierte Muster)."""

    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.ein = [re.compile(p) for p in cfg["slug_einschliessen"]]
        self.aus = ([re.compile(r"(?:^|-)[a-z0-9]*(?:%s)%s(?=-|$)" % (w, PLURAL)) for w in cfg["slug_ausschliessen_wortende"]]
                    + [re.compile(r"(?:^|-)(?:%s)[a-z0-9]*(?=-|$)" % w) for w in cfg["slug_ausschliessen_wortanfang"]])

    def slug_passt(self, slug: str) -> bool:
        return any(r.search(slug) for r in self.ein) and not any(r.search(slug) for r in self.aus)

    def url_passt(self, url: str) -> bool:
        m = P_URL.match(url_norm(url))
        return bool(m) and self.slug_passt(m.group(2))

    def eintrag_passt(self, eintrag: dict) -> bool:
        """Von Kategorieseite oder Variante: immer; aus der Sitemap: Slug-Filter."""
        if any(q != "sitemap" for q in eintrag.get("quellen", [])):
            return True
        return self.url_passt(eintrag["url"])


# ------------------------------------------------------------ Sitemap und Kategorien

def sitemap_dateien(index_xml: str, namen: list[str]) -> list[str]:
    out = []
    for u in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", index_xml):
        m = re.search(r"/products/([a-z0-9-]+)/sitemap\.xml$", u)
        if m and m.group(1) in namen:
            out.append(u)
    return out


def parse_sitemap(xml: str) -> list[str]:
    return [url_norm(u) for u in re.findall(r"<loc>\s*(https://www\.tchibo\.ch/products/\d+/[^<\s]+)\s*</loc>", xml)]


def parse_kategorie(page: str) -> dict:
    """Produkte (Nummer -> URL), Artikelnummern, Anzahl laut Shop und Breadcrumb-Namen einer Kategorieseite."""
    produkte: dict[str, str] = {}
    for nr, slug in re.findall(r'href="/products/(\d+)/([a-z0-9-]+)(?:\?[^"]*)?"', page):
        produkte.setdefault(nr, url_norm(f"https://{HOST}/products/{nr}/{slug}"))
    artikel = set(re.findall(r'/products/\d+/[a-z0-9-]+\?article_id=(\d+)', page))
    m = re.search(r"Sie haben (\d+) von (\d+) Produkten gesehen", page)
    pfad = None
    for d in g.ld_objekte(page):
        if d.get("@type") == "BreadcrumbList":
            pfad = [(i.get("item") or {}).get("name") for i in d.get("itemListElement") or [] if isinstance(i.get("item"), dict)]
    return {"produkte": produkte, "artikel": artikel, "total": int(m.group(2)) if m else None, "pfad": pfad}


# ------------------------------------------------------------ Produktseite

PREIS_BLOCK = re.compile(r'class="[^"]*pdp-price-display[^"]*"')
PREV = re.compile(r'<del class="ds-price-previous">.*?<span class="ds-price-raw">\s*([\d.,\']+)\s*CHF</span>', re.S)
AKT = re.compile(r'<ins>.*?<span class="ds-price-raw ds-price-number">\s*([\d.,\']+)\s*</span>', re.S)
DL = re.compile(r"<dt[^>]*>(.*?)</dt>\s*(?:<!--.*?-->\s*)*<dd[^>]*>(.*?)</dd>", re.S)
# Die Bestellnummer auf der Seite (wie im kuratierten Katalog); `mpn` im JSON-LD ist eine andere Nummer.
BESTELLNUMMER = re.compile(r"Bestellnummer:\s*(\d{4,8})")


def parse_produkt(page: str) -> dict:
    out: dict = {"name": None, "artikelnummer": None, "kategorie_pfad": None, "masse": g.leere_masse(),
                 "masse_zeilen": [], "preis_chf": None, "aktionspreis_chf": None, "farbe": None, "verfuegbarkeit": None}
    ld_preis = None
    for d in g.ld_objekte(page):
        if d.get("@type") != "Product":
            continue
        out["name"] = d.get("name")
        out["artikelnummer"] = str(d["mpn"]) if d.get("mpn") else None
        offers = d.get("offers") or []
        offers = offers if isinstance(offers, list) else [offers]
        if offers:
            out["verfuegbarkeit"] = str(offers[0].get("availability") or "").rsplit("/", 1)[-1] or None
            ld_preis = g.zahl(offers[0].get("price"))
        break
    bestell = BESTELLNUMMER.search(page)
    if bestell:
        out["artikelnummer"] = bestell.group(1)
    # Preisblock: "Vorheriger Preis" (durchgestrichen) und "Aktueller Preis"
    m = PREIS_BLOCK.search(page)
    block = re.sub(r' data-v-[0-9a-f]+(?:="")?', "", page[m.start(): m.start() + 6000]) if m else ""
    prev, akt = PREV.search(block), AKT.search(block)
    aktuell = g.zahl(akt.group(1)) if akt else ld_preis
    vorher = g.zahl(prev.group(1)) if prev else None
    if vorher is not None and aktuell is not None and vorher > aktuell:
        out["preis_chf"], out["aktionspreis_chf"] = vorher, aktuell
    else:
        out["preis_chf"] = aktuell
    # Farbe und Masse aus der Produktbeschreibung
    mf = re.search(r'data-test="hard-fact-colours".*?<dd[^>]*>(.*?)</dd>', page, re.S)
    if mf:
        out["farbe"] = g.html_text(mf.group(1)) or None
    ms = re.search(r"<dt[^>]*>\s*Masse\s*</dt>\s*(?:<!--.*?-->\s*)*<dd[^>]*>(.*?)</dd>", page, re.S)
    if ms:
        roh = re.sub(r"<br\s*/?>", "\n", ms.group(1))
        zeilen = [g.html_text(z) for z in roh.split("\n")]
        out["masse_zeilen"] = [z for z in zeilen if z][:30]
        for z in out["masse_zeilen"]:
            if "zusammengeklappt" in z.lower():
                continue  # abweichender Zustand, nicht das Grundmass
            for achse, wert in g.masse_aus_text(z).items():
                if out["masse"][achse] is None:
                    out["masse"][achse] = wert
    return out


def ruf_seite(shop: g.Shop, url: str, umfang: Umfang | None = None, kategorie_pfade: dict | None = None) -> dict:
    zeile = {"shop": SHOP, "url": url, "abgerufen": g.jetzt()}
    try:
        a = shop.hole(abruf_url(url))
        zeile.update(status=a.status)
        if a.status in (301, 302, 303, 307, 308):
            zeile.update(ergebnis="weiterleitung", weiter=url_norm(a.weiter) if a.weiter else None)
        elif a.status in (404, 410):
            zeile["ergebnis"] = "404"
        elif a.status == 200:
            d = parse_produkt(a.text)
            if d["name"]:
                d.update(ergebnis="produkt", varianten=[])
                if kategorie_pfade and kategorie_pfade.get(url):
                    d["kategorie_pfad"] = kategorie_pfade[url]
                if umfang is not None:
                    m = P_URL.match(url)
                    d["im_umfang"] = True if d["kategorie_pfad"] else (umfang.slug_passt(m.group(2)) if m else None)
                zeile.update(d)
            else:
                zeile["ergebnis"] = "keine produktdaten"
        else:
            zeile.update(ergebnis="fehler", fehler=f"Status {a.status}")
    except g.Verboten as e:
        zeile.update(ergebnis="fehler", fehler=str(e))
    except (OSError, ValueError) as e:
        zeile.update(ergebnis="fehler", fehler=str(e))
    zeile.setdefault("weiter", None)
    return zeile


# ------------------------------------------------------------ Schnittstelle fuer update.py

def kontext(kat_pfade: dict | None = None) -> dict:
    return {"umfang": Umfang(lade_umfang()), "kategorie_pfade": kat_pfade or {}}


def grund_kontext() -> dict:
    return kontext()


def entdecke(shop: g.Shop, melde, abbruch, aus_baum=None) -> tuple[dict, list[str]]:
    """Produkt-Sitemaps (Quelle 's', nur Slug-Treffer) und Kategorieseiten (Quelle 'k') absuchen."""
    cfg = lade_umfang()
    umfang = Umfang(cfg)
    fehler: list[str] = []
    kat_pfade: dict[str, list[str]] = {}
    index = None
    for sm in shop.sitemaps():
        a = shop.hole(sm, "application/xml,text/xml")
        if a.status == 200 and "<sitemapindex" in a.text:
            index = a.text
    if index is None:
        fehler.append("Sitemap-Index nicht gefunden")
    else:
        for datei in sitemap_dateien(index, cfg["sitemaps_produkte"]):
            a = shop.hole(datei, "application/xml,text/xml")
            if a.status != 200:
                fehler.append(f"Sitemap {datei}: Status {a.status}")
                continue
            melde({u: "s" for u in parse_sitemap(a.text) if umfang.url_passt(u)})
    for pfad in cfg["kategorieseiten"]:
        if abbruch():
            break
        basis = f"https://{HOST}/categories/{pfad}"
        gesehen: dict[str, str] = {}
        artikel: set[str] = set()
        total, namen = None, None
        # ?page=N liefert kumulativ die ersten N*24 Artikel: Seite 1 nennt die Gesamtzahl, danach genuegt
        # die letzte Seite (ceil(total/24)); fehlen noch Artikel, hoechstens zwei weitere Seiten versuchen.
        naechste, extra = 1, 0
        while naechste <= MAX_KATEGORIE_SEITEN:
            seite = naechste
            a = shop.hole(basis if seite == 1 else f"{basis}?page={seite}")
            if a.status != 200:
                fehler.append(f"Kategorie {pfad}: Status {a.status}")
                break
            k = parse_kategorie(a.text)
            total, namen = k["total"] or total, k["pfad"] or namen
            gesehen.update(k["produkte"])
            artikel |= k["artikel"]
            if total is None or len(artikel) >= total:
                break
            letzte = -(-total // 24)
            if seite < letzte:
                naechste = letzte
            elif extra < 2:
                extra += 1
                naechste = seite + 1
            else:
                break
        if gesehen:
            melde({u: "k" for u in gesehen.values()})
            if namen:
                for u in gesehen.values():
                    kat_pfade.setdefault(u, namen)
    return kontext(kat_pfade), fehler


def start_umfang(url: str, quelle: str, ctx: dict) -> bool | None:
    return True if quelle == "k" else ctx["umfang"].url_passt(url)


def hole(shop: g.Shop, url: str, ctx: dict) -> dict:
    return ruf_seite(shop, url, ctx["umfang"], ctx["kategorie_pfade"])


def reihenfolge(eintraege: dict[str, dict]):
    return lambda url: 0
