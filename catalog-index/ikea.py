"""IKEA-Schweiz: Produkt-URLs sammeln, Produktseiten lesen (ohne Sprachmodell). Wird von update.py benutzt.

URL-Quellen: (1) Produkt-Sitemaps prod-de-CH_*.xml, (2) Kategorieseiten des Umfangs (der Kategoriebaum
steht als `catalogSlim` im HTML der Seite /cat/produkte-products/), (3) Variantenlinks der Produktseiten.
Paginierung: `?page=N` wird ohne JavaScript vom Server ignoriert (gleiche 24 Kacheln); die Seite nennt
die Gesamtzahl in `data-category` (`totalCount`). Weitere Produkte kommen deshalb aus Sitemap und Varianten.
"""

from __future__ import annotations

import html
import json
import re
import sys
import urllib.parse
from pathlib import Path

try:
    import gemeinsam as g
except ImportError:  # Aufruf aus anderem Ordner mit -I
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import gemeinsam as g

SHOP = "ikea"
HOST = "www.ikea.com"
START = "https://www.ikea.com/ch/de/cat/produkte-products/"
KATEGORIEN = g.BASIS / "ikea-kategorien.json"
PRAEFIX = "https://www.ikea.com/ch/de/p/"  # Anfang aller Produkt-URLs (der Zustand speichert den Rest)

LD = re.compile(r"<script[^>]*application/ld\+json[^>]*>(.*?)</script>", re.S)
ROW = re.compile(r'<li class="pipf-measurements-tab__measurement-row[^"]*">(.*?)</li>', re.S)
TAG = re.compile(r"<[^>]+>")
P_URL = re.compile(r"^https://www\.ikea\.com/ch/de/p/[^/?#]+/?$")
ID_ENDE = re.compile(r"-(s?\d{5,8}|[a-z]{2}\d{3}|\d{4,6})/?$")


def url_norm(url: str) -> str:
    return g.vereinheitliche(url, HOST)


# ------------------------------------------------------------ Produktseite

def _text(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(TAG.sub(" ", fragment))).strip()


def cm(wert) -> float | int | None:
    """'60 cm' -> 60, '280 mm' -> 28, '1,2 m' -> 120. Ohne Einheit: cm."""
    if wert is None:
        return None
    m = re.match(r"\s*(-?\d+(?:[.,]\d+)?)\s*(mm|cm|m)?\b", str(wert))
    if not m:
        return None
    x = float(m.group(1).replace(",", "."))
    x *= {"mm": 0.1, "cm": 1, "m": 100, None: 1}[m.group(2)]
    x = round(x, 2)
    return int(x) if x == int(x) else x


def _zahl(p) -> float | int | None:
    try:
        x = float(str(p).replace(",", "."))
    except (TypeError, ValueError):
        return None
    return int(x) if x == int(x) else x


MASS_ZEILEN = {"breite": "breite_cm", "tiefe": "tiefe_cm", "hoehe": "hoehe_cm", "länge": "laenge_cm",
               "laenge": "laenge_cm", "durchmesser": "durchmesser_cm", "höhe": "hoehe_cm"}


def parse_produkt(page: str) -> dict:
    """Liest Produktdaten aus JSON-LD und Massangaben. Rohwerte unveraendert (nur Einheit -> cm)."""
    out: dict = {"name": None, "artikelnummer": None, "kategorie_pfad": None, "kategorie_ids": None,
                 "masse": {"breite_cm": None, "tiefe_cm": None, "hoehe_cm": None, "laenge_cm": None, "durchmesser_cm": None},
                 "masse_zeilen": [], "preis_chf": None, "aktionspreis_chf": None, "farbe": None,
                 "verfuegbarkeit": None, "kategorie": None}
    produkt = None
    for m in LD.finditer(page):
        try:
            d = json.loads(m.group(1))
        except json.JSONDecodeError:
            continue
        if not isinstance(d, dict):
            continue
        if d.get("@type") == "Product" and produkt is None:
            produkt = d
        elif d.get("@type") == "BreadcrumbList":
            items = d.get("itemListElement") or []
            namen = [i.get("name") for i in items if i.get("name")]
            ids = []
            for i in items:
                mm = re.search(r"-([a-z]{0,3}\d{3,6})/?$", str(i.get("item") or ""))
                if mm:
                    ids.append(mm.group(1))
            out["kategorie_pfad"] = [n for n in namen if n != "Produkte"] or None
            out["kategorie_ids"] = ids or None
    if produkt:
        offers = produkt.get("offers") or {}
        if isinstance(offers, list):
            offers = offers[0] if offers else {}
        out.update(name=produkt.get("name"), artikelnummer=produkt.get("sku") or produkt.get("mpn"),
                   kategorie=produkt.get("category"), farbe=produkt.get("color"),
                   verfuegbarkeit=str(offers.get("availability") or "").rsplit("/", 1)[-1] or None)
        out["masse"]["breite_cm"] = cm(produkt.get("width"))
        out["masse"]["tiefe_cm"] = cm(produkt.get("depth"))
        out["masse"]["hoehe_cm"] = cm(produkt.get("height"))
        specs = offers.get("priceSpecification") or []
        if isinstance(specs, dict):
            specs = [specs]
        # Preise nur für Mitglieder (IKEA Family, validForMemberTier) sind keine regulären Preise.
        specs = [s for s in specs if isinstance(s, dict) and not s.get("validForMemberTier")]
        if specs:
            regulaer = [s for s in specs if "strikethrough" in str(s.get("priceType") or "").lower()]
            aktuell = [s for s in specs if s not in regulaer]
            if regulaer:
                out["preis_chf"] = _zahl(regulaer[0].get("price"))
                out["aktionspreis_chf"] = _zahl(aktuell[0].get("price")) if aktuell else None
            elif aktuell:
                out["preis_chf"] = _zahl(aktuell[0].get("price"))
        if out["preis_chf"] is None:
            out["preis_chf"] = _zahl(offers.get("price"))
    zeilen = [_text(r) for r in ROW.findall(page)]
    out["masse_zeilen"] = zeilen[:30]
    for r in ROW.findall(page):
        mm = re.search(r'name">(.*?)</span>\s*<span[^>]*value">(.*?)</span>', r, re.S)
        if not mm:
            continue
        key = MASS_ZEILEN.get(_text(mm.group(1)).lower())
        if key and out["masse"][key] is None:
            out["masse"][key] = cm(_text(mm.group(2)))
    return out


def varianten(page: str, eigene_url: str) -> list[str]:
    """Links der Stil-/Variantenwahl (andere Farben und Groessen)."""
    out: list[str] = []
    for m in re.finditer(r'<a [^>]*href="(https://www\.ikea\.com/ch/de/p/[^"]*)"[^>]*>', page):
        if "picker" not in m.group(0) and "variant" not in m.group(0):
            continue
        u = url_norm(m.group(1))
        if u != eigene_url and P_URL.match(u) and u not in out:
            out.append(u)
    return out


# ------------------------------------------------------------ Kategorien

def parse_baum(page: str) -> list[dict]:
    i = page.find('"catalogSlim":')
    if i < 0:
        return []
    return json.JSONDecoder().raw_decode(page[i + len('"catalogSlim":'):])[0]


def parse_kategorie(page: str) -> dict:
    m = re.search(r'data-category="([^"]+)"', page)
    meta = json.loads(html.unescape(m.group(1))) if m else {}
    teile = re.split(r'data-testid="plp-product-card"', page)[1:]
    produkte: list[str] = []
    for t in teile:
        mm = re.search(r'https://www\.ikea\.com/ch/de/p/[^"\'#?\s<>]+', t)
        if mm:
            u = url_norm(mm.group(0))
            if u not in produkte:
                produkte.append(u)
    karten = re.findall(
        r'<a href="(https://www\.ikea\.com/ch/de/cat/[^"]*)"[^>]*data-tracking-label="([^"]*)"[^>]*class="[^"]*hnf-inpage-nav__card(?: [^"]*)?"', page)
    return {"id": meta.get("id"), "total": meta.get("totalCount"), "produkte": produkte,
            "karten": [(url_norm(u), [t.strip() for t in lab.split("|")]) for u, lab in karten]}


def lade_umfang(pfad: Path = KATEGORIEN) -> dict:
    return json.loads(Path(pfad).read_text(encoding="utf-8"))


def knoten_im_umfang(baum: list[dict], umfang: dict) -> list[dict]:
    """Alle Kategorien (je id einmal) im Umfang: {id, name, url, pfad}."""
    ein = set(umfang["einschliessen"])
    zus = set(umfang.get("zusaetzlich", []))
    aus = set(umfang["ausschliessen"])
    gefunden: dict[str, dict] = {}

    def gehe(n, pfad, drin):
        if n["id"] in aus and n["id"] not in zus:
            return
        drin = drin or n["id"] in ein or n["id"] in zus
        p = pfad + [n["id"]]
        if drin and n["id"] not in gefunden:
            gefunden[n["id"]] = {"id": n["id"], "name": n["name"], "url": url_norm("https://www.ikea.com" + n["url"]), "pfad": p}
        for s in n.get("subs", []):
            gehe(s, p, drin)

    for n in baum:
        gehe(n, [], False)
    return list(gefunden.values())


def im_umfang(kategorie_ids: list[str] | None, umfang: dict | None, ids_im_umfang: set[str]) -> bool | None:
    if not kategorie_ids or umfang is None:
        return None
    if any(i in set(umfang["ausschliessen"]) and i not in umfang.get("zusaetzlich", []) for i in kategorie_ids):
        return False
    return any(i in ids_im_umfang for i in kategorie_ids)


# ------------------------------------------------------------ Sitemap

def parse_sitemap(xml: str) -> list[str]:
    """Nur <loc> der Produktseiten (Bild-URLs <image:loc> werden ignoriert)."""
    return [url_norm(u) for u in re.findall(r"<loc>\s*(https://www\.ikea\.com/ch/de/p/[^<\s]+)\s*</loc>", xml)]


def sitemap_dateien(index_xml: str) -> list[str]:
    return [u for u in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", index_xml) if re.search(r"/prod-de-CH_\d+\.xml$", u)]


# ------------------------------------------------------------ Seiten und Suche

def art_wort(url: str) -> str:
    """Produktart aus dem Slug: /p/<serie>-<art>-<farbe>-<nr>/ -> <art>."""
    m = re.search(r"/p/([a-z0-9-]+?)-[a-z]?\d{8}/?$", url)
    teile = m.group(1).split("-") if m else []
    return teile[1] if len(teile) > 1 else ""


def sitemap_rang(zeilen: dict[str, dict]):
    """Reihenfolge: Kategorie-URLs, dann Sitemap-URLs mit Arten, die bisher im Umfang lagen,
    dann unbekannte oder gemischte, zuletzt bisher nie im Umfang. Ausgelassen wird nichts."""
    zaehl: dict[str, list[int]] = {}
    for z in zeilen.values():
        if z.get("ergebnis") != "produkt" or z.get("im_umfang") is None:
            continue
        a = zaehl.setdefault(art_wort(z["url"]), [0, 0])
        a[0] += bool(z["im_umfang"])
        a[1] += 1

    def rang(e: dict) -> int:
        if not all(q == "sitemap" for q in e["quellen"]):
            return 0
        ja, n = zaehl.get(art_wort(e["url"]), [0, 0])
        if n == 0:
            return 2
        if ja / n >= 0.5:
            return 1
        return 2 if ja else 3

    return rang


def ruf_seite(shop: g.Shop, url: str, umfang: dict | None, ids_umfang: set[str]) -> dict:
    zeile = {"shop": SHOP, "url": url, "abgerufen": g.jetzt()}
    try:
        a = shop.hole(url)
        if a.status in (301, 302, 303, 307, 308) and a.weiter:
            ziel = url_norm(a.weiter)
            zeile.update(status=a.status, weiter=ziel)
            if "/cat/" in ziel or not re.match(r"^https://www\.ikea\.com/ch/(de|en)/p/", ziel):
                zeile["ergebnis"] = "weiterleitung"
                return zeile
            # Produkt -> Produkt: genau einem Hop folgen, unter der Ziel-URL speichern
            b = shop.hole(ziel)
            zeile.update(url=ziel, weiter_von=url, weiter=None)
            if b.status in (301, 302, 303, 307, 308):
                zeile.update(status=b.status, weiter=url_norm(b.weiter or ""), ergebnis="weiterleitung")
                return zeile
            a = b
        zeile.update(status=a.status)
        if a.status in (404, 410):
            zeile["ergebnis"] = "404"
        elif a.status == 200:
            d = parse_produkt(a.text)
            if d["name"]:
                d.update(ergebnis="produkt", varianten=varianten(a.text, zeile["url"]),
                         im_umfang=im_umfang(d["kategorie_ids"], umfang, ids_umfang))
            else:
                d["ergebnis"] = "keine produktdaten"
                d = {"ergebnis": d["ergebnis"]}
            zeile.update(d)
        else:
            zeile.update(ergebnis="fehler", fehler=f"Status {a.status}")
    except g.Verboten as e:
        zeile.update(ergebnis="fehler", fehler=str(e))
    except (OSError, ValueError) as e:
        zeile.update(ergebnis="fehler", fehler=str(e))
    zeile.setdefault("weiter", None)
    return zeile


# ------------------------------------------------------------ Schnittstelle fuer update.py

def kontext(umfang: dict | None, extra_ids: set[str] = frozenset()) -> dict:
    ids = set(extra_ids)
    if umfang:
        ids |= set(umfang["einschliessen"]) | set(umfang.get("zusaetzlich", []))
    return {"umfang": umfang, "ids_umfang": ids}


def grund_kontext() -> dict:
    return kontext(lade_umfang())


def entdecke(shop: g.Shop, melde, abbruch, aus_baum=None) -> tuple[dict, list[str]]:
    """Sitemap und Kategorieseiten nach Produkt-URLs absuchen. `melde({url: quelle})` mit quelle 's' (Sitemap)
    oder 'k' (Kategorieseite). Gibt (Kontext, Fehlermeldungen) zurueck; Blockiert wird nicht gefangen."""
    fehler: list[str] = []
    umfang = lade_umfang()
    ctx = kontext(umfang)
    index = None
    for sm in shop.sitemaps():
        a = shop.hole(sm, "application/xml,text/xml")
        if a.status == 200 and "<sitemapindex" in a.text:
            index = a.text
    if index is None:
        fehler.append("Sitemap-Index nicht gefunden")
    else:
        for datei in sitemap_dateien(index):
            a = shop.hole(datei, "application/xml,text/xml")
            if a.status != 200:
                fehler.append(f"Sitemap {datei}: Status {a.status}")
                continue
            melde({u: "s" for u in parse_sitemap(a.text)})
    a = shop.hole(START)
    baum = parse_baum(a.text) if a.status == 200 else []
    if not baum:
        fehler.append("Kategoriebaum nicht gefunden")
        return ctx, fehler
    knoten = knoten_im_umfang(baum, umfang)
    if aus_baum:
        aus_baum(baum, knoten)
    bekannt = {k["id"] for k in knoten}
    ctx["ids_umfang"] |= bekannt
    warte = list(knoten)
    gesehen = {k["url"] for k in knoten}
    while warte and not abbruch():
        k = warte.pop(0)
        a = shop.hole(k["url"])
        if a.status != 200:
            fehler.append(f"Kategorie {k['id']}: Status {a.status}")
            continue
        kat = parse_kategorie(a.text)
        melde({u: "k" for u in kat["produkte"]})
        # unbekannte Unterkategorien (Label-Pfad = eigener Pfad + 1)
        for u, label in kat["karten"]:
            if u not in gesehen and label[:-1] == ["products"] + k["pfad"]:
                gesehen.add(u)
                mm = re.search(r"-([a-z]{0,3}\d{3,6})/?$", u)
                if mm and mm.group(1) not in bekannt:
                    ctx["ids_umfang"].add(mm.group(1))
                    warte.append({"id": mm.group(1), "name": mm.group(1), "url": u, "pfad": k["pfad"] + [mm.group(1)]})
    return ctx, fehler


def start_umfang(url: str, quelle: str, ctx: dict) -> bool | None:
    """Vor dem ersten Abruf unbekannt (None); die Produktseite entscheidet."""
    return None


def hole(shop: g.Shop, url: str, ctx: dict) -> dict:
    return ruf_seite(shop, url, ctx.get("umfang"), ctx.get("ids_umfang", set()))


def reihenfolge(eintraege: dict[str, dict]):
    """Sortierschluessel fuer nie gepruefte URLs. eintraege: url -> {status, umfang, quelle}."""
    zeilen = {u: {"url": u, "ergebnis": e["status"], "im_umfang": e["umfang"]} for u, e in eintraege.items()
              if e["status"] == "produkt"}
    rang = sitemap_rang(zeilen)
    return lambda url: rang({"url": url, "quellen": ["kategorie" if eintraege[url].get("quelle") == "k" else "sitemap"]})
