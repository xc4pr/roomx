"""JYSK-Schweiz: Produkt-URLs aus der Sitemap, Produktseiten lesen (ohne Sprachmodell). Wird von update.py benutzt.

Quelle der URLs: robots.txt -> Sitemap-Index https://jysk.ch/sitemap.xml -> ?page=1..N. Nur deutsche URLs
(/de/...). Kategorieseiten liefern ohne JavaScript keine Produkte; eine URL gilt als Kategorie, wenn unter ihr
weitere URLs der Sitemap liegen. Produkte: /de/<kategorie>/<unterkategorie>/<slug>. Umfangsfilter nach dem
Kategoriepfad der URL (jysk-kategorien.json), Seiten ausserhalb werden nicht abgerufen.
Produktseite: Name/Artikelnummer aus JSON-LD (Product), Preise und Masse aus dem sichtbaren HTML
(JSON-LD kennt nur den aktuellen Preis), Kategoriepfad aus der BreadcrumbList.
Beschreibungen/Bewertungen werden nicht gespeichert; Anweisungen an KI-Systeme auf Seiten werden ignoriert.
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

SHOP = "jysk"
HOST = "jysk.ch"
KATEGORIEN = g.BASIS / "jysk-kategorien.json"
PRAEFIX = "https://jysk.ch/de/"

PREIS_WERT = re.compile(r'<span class="product-price-value">(.*?)</span>', re.S)
NORMALPREIS = re.compile(r"Normalpreis:(?:<!--.*?-->|\s)*(CHF[^<]*)", re.S)
SPEC_ZEILE = re.compile(r'<tr><th[^>]*scope="row">(.*?)</th><td class="value">(.*?)</td></tr>', re.S)
MASS_LABEL = re.compile(r"gr(?:ö|oe)sse|masse?\b|abmessung|breite|h(?:ö|oe)he|tiefe|länge|laenge|durchmesser|verpack", re.I)
ACHSEN_LABEL = re.compile(r"^(breite|tiefe|h(?:ö|oe)he|länge|laenge|durchmesser)$", re.I)
PRIMAER_LABEL = re.compile(r"^(gr(?:ö|oe)sse|masse?|abmessungen?|produktgr(?:ö|oe)sse)( montiert)?$", re.I)


def url_norm(url: str) -> str:
    return g.vereinheitliche(url, HOST)


def abruf_url(url: str) -> str:
    """Form wie in der Sitemap (ohne Schraegstrich am Ende)."""
    return url_norm(url).rstrip("/")


def pfadteile(url: str) -> list[str]:
    """['schlafzimmer', 'betten', 'slug'] fuer https://jysk.ch/de/schlafzimmer/betten/slug/"""
    p = url_norm(url)[len(f"https://{HOST}/"):].strip("/").split("/")
    return p[1:] if p and p[0] == "de" else []


# ------------------------------------------------------------ Umfang

def lade_umfang(pfad: Path = KATEGORIEN) -> dict:
    return json.loads(Path(pfad).read_text(encoding="utf-8"))


def im_umfang(url: str, umfang: dict) -> bool:
    """Laengster passender Praefix aus Aus-/Einschluss entscheidet; ohne Treffer: aufnehmen."""
    teile = pfadteile(url)
    beste: tuple[int, bool] | None = None
    for ein, tabelle in ((True, umfang["einschliessen"]), (False, umfang["ausschliessen"])):
        for pre in tabelle:
            p = pre.split("/")
            if teile[:len(p)] == p and (beste is None or len(p) > beste[0]):
                beste = (len(p), ein)
    return True if beste is None else beste[1]


# ------------------------------------------------------------ Sitemap

def sitemap_seiten(index_xml: str) -> list[str]:
    return re.findall(r"<loc>\s*(https://jysk\.ch/sitemap\.xml\?page=\d+)\s*</loc>", index_xml)


def parse_sitemap(xml: str) -> list[str]:
    """Deutsche URLs (<loc>); xhtml:link-Alternativen und andere Sprachen werden ignoriert."""
    return [url_norm(u) for u in re.findall(r"<loc>\s*(https://jysk\.ch/de(?:/[^<\s]*)?)\s*</loc>", xml)]


def produkt_urls(alle: list[str]) -> list[str]:
    """Aus allen deutschen URLs die Produkte: Tiefe >= 3 und keine Kategorie (keine URL liegt darunter)."""
    eltern = set()
    for u in alle:
        t = pfadteile(u)
        for i in range(1, len(t)):
            eltern.add("/".join(t[:i]))
    return [u for u in alle if len(pfadteile(u)) >= 3 and "/".join(pfadteile(u)) not in eltern]


# ------------------------------------------------------------ Produktseite

def _slug(url: str) -> str:
    return str(url or "").rstrip("/").rsplit("/", 1)[-1]


def parse_produkt(page: str, url: str | None = None) -> dict:
    """`url`: Adresse der Seite; bei Produktgruppen (ProductGroup mit hasVariant) waehlt sie die Variante der Seite."""
    out: dict = {"name": None, "artikelnummer": None, "kategorie_pfad": None, "masse": g.leere_masse(),
                 "masse_zeilen": [], "preis_chf": None, "aktionspreis_chf": None, "farbe": None,
                 "verfuegbarkeit": None}
    produkt = None
    varianten: list[str] = []
    for d in g.ld_objekte(page):
        if d.get("@type") == "Product" and produkt is None:
            produkt = d
        elif d.get("@type") == "ProductGroup" and produkt is None:
            hv = [v for v in d.get("hasVariant") or [] if isinstance(v, dict)]
            for v in hv:
                o = v.get("offers")
                o = o[0] if isinstance(o, list) and o else o
                ou = (o or {}).get("url") if isinstance(o, dict) else None
                if ou:
                    varianten.append(ou)
            eigene = [v for v, u in zip(hv, varianten) if url and _slug(u) == _slug(url)] if len(hv) == len(varianten) else []
            produkt = (eigene or hv or [None])[0]
            if produkt is not None and not produkt.get("category"):
                produkt = {**produkt, "category": d.get("category")}
        elif d.get("@type") == "BreadcrumbList":
            namen = [i.get("name") for i in d.get("itemListElement") or [] if i.get("name")]
            out["kategorie_pfad"] = namen[1:-1] or None  # ohne "Startseite" und ohne das Produkt selbst
    if produkt:
        out["name"] = produkt.get("name")
        out["artikelnummer"] = str(produkt["sku"]) if produkt.get("sku") else None
        offers = produkt.get("offers") or {}
        if isinstance(offers, list):
            offers = offers[0] if offers else {}
        av = str(offers.get("availability") or "").rsplit("/", 1)[-1]
        out["verfuegbarkeit"] = av or None
        ld_preis = g.zahl(offers.get("price"))
    else:
        ld_preis = None
    # Preise aus dem sichtbaren HTML: aktueller Preis, bei Aktion daneben "Normalpreis"
    m = PREIS_WERT.search(page)
    aktuell = g.preis_aus_text(g.html_text(m.group(1))) if m else None
    if aktuell is None:
        aktuell = ld_preis
    mn = NORMALPREIS.search(page)
    normal = g.preis_aus_text(g.html_text(mn.group(1))) if mn else None
    if normal is not None and aktuell is not None and normal > aktuell:
        out["preis_chf"], out["aktionspreis_chf"] = normal, aktuell
    else:
        out["preis_chf"] = aktuell
    out["varianten"] = []  # andere Varianten nennt die Seite nur als Suchlink (articlelookup), nicht als Seite; die Sitemap listet sie
    # Spezifikationstabelle
    zeilen = [(g.html_text(a), g.html_text(b)) for a, b in SPEC_ZEILE.findall(page)]
    for k, v in zeilen:
        if k.lower() == "farbe" and out["farbe"] is None:
            out["farbe"] = v
    primaer, sekundaer, anzeige = [], [], []
    for k, v in zeilen:
        if not MASS_LABEL.search(k):
            continue
        anzeige.append(f"{k}: {v}")
        if "verpack" in k.lower():
            continue
        if "unmontiert" in k.lower():
            sekundaer.append(f"{k}: {v}")
        elif PRIMAER_LABEL.match(k):
            primaer.append(v)
        elif ACHSEN_LABEL.match(k):
            primaer.append(f"{k}: {v}")
    out["masse_zeilen"] = anzeige[:30]
    for text in primaer:
        for achse, wert in g.masse_aus_text(text).items():
            if out["masse"][achse] is None:
                out["masse"][achse] = wert
    if all(v is None for v in out["masse"].values()):
        for text in sekundaer:
            for achse, wert in g.masse_aus_text(text).items():
                if out["masse"][achse] is None:
                    out["masse"][achse] = wert
    if all(v is None for v in out["masse"].values()) and produkt:
        # Ersatz: "B70 x H160 x T2 cm" in der Kurzbeschreibung; Text selbst wird nicht gespeichert
        out["masse"] = g.masse_aus_text(str(produkt.get("description") or ""))
    return out


def ruf_seite(shop: g.Shop, url: str) -> dict:
    zeile = {"shop": SHOP, "url": url, "abgerufen": g.jetzt()}
    try:
        a = shop.hole(abruf_url(url))
        zeile.update(status=a.status)
        if a.status in (301, 302, 303, 307, 308):
            zeile.update(ergebnis="weiterleitung", weiter=url_norm(a.weiter) if a.weiter else None)
        elif a.status in (404, 410):
            zeile["ergebnis"] = "404"
        elif a.status == 200:
            d = parse_produkt(a.text, url)
            if d["name"]:
                d.update(ergebnis="produkt")
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

def kontext() -> dict:
    return {"umfang": lade_umfang()}


def grund_kontext() -> dict:
    return kontext()


def entdecke(shop: g.Shop, melde, abbruch, aus_baum=None) -> tuple[dict, list[str]]:
    """Sitemap-Seiten lesen und die Produkt-URLs melden (Quelle 's')."""
    fehler: list[str] = []
    index = None
    for sm in shop.sitemaps():
        a = shop.hole(sm, "application/xml,text/xml")
        if a.status == 200 and "<sitemapindex" in a.text:
            index = a.text
    if index is None:
        return kontext(), ["Sitemap-Index nicht gefunden"]
    alle: list[str] = []
    for seite in sitemap_seiten(index):
        a = shop.hole(seite, "application/xml,text/xml")
        if a.status != 200:
            return kontext(), fehler + [f"{seite}: Status {a.status}"]  # unvollstaendig: keine Teilmenge melden
        alle.extend(parse_sitemap(a.text))
    melde({u: "s" for u in produkt_urls(list(dict.fromkeys(alle)))})
    return kontext(), fehler


def start_umfang(url: str, quelle: str, ctx: dict) -> bool | None:
    return im_umfang(url, ctx["umfang"])


def hole(shop: g.Shop, url: str, ctx: dict) -> dict:
    return ruf_seite(shop, url)


def reihenfolge(eintraege: dict[str, dict]):
    return lambda url: 0
