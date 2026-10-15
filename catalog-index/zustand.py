"""Zustand je Shop: state/<shop>.jsonl, eine Zeile pro bekannter URL, nach URL sortiert.

Zeile: {"u": <URL ohne gemeinsamen Anfang>, "umfang": true|false|null, "status": ..., "geprueft": "YYYY-MM-DD",
        "quelle": "k" (nur wenn von einer Kategorieseite oder Variante), "weiter": <Ziel> (nur bei Weiterleitung),
        "zeile": {geparste Felder, nur die, die normalisieren.py liest}}
status: offen (nie abgerufen), produkt, 404 (auch 410), weiterleitung, keine produktdaten, fehler.
404 und Weiterleitung heissen "verschwunden": die zuletzt gelesene Zeile bleibt erhalten (Eintrag wird nie geloescht).
Unveraenderte Produkte aendern in der Datei nur das Pruefdatum.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import gemeinsam as g

VERSCHWUNDEN = ("404", "weiterleitung")
MASS_ACHSEN = ("breite_cm", "tiefe_cm", "hoehe_cm", "laenge_cm", "durchmesser_cm")


def schlank(z: dict) -> dict:
    """Nur die Felder, die normalisieren.py liest; Leeres (None) entfaellt."""
    out: dict = {}
    for k in ("name", "artikelnummer", "kategorie_pfad", "kategorie"):
        if z.get(k) is not None:
            out[k] = z[k]
    m = {k: v for k, v in (z.get("masse") or {}).items() if v is not None and k in MASS_ACHSEN}
    if m:
        out["masse"] = m
    for k in ("preis_chf", "farbe"):
        if z.get(k) is not None:
            out[k] = z[k]
    return out


def tag(iso: str | None) -> str | None:
    return iso[:10] if iso else None


def neuer_eintrag() -> dict:
    return {"umfang": None, "status": "offen", "geprueft": None, "quelle": None, "weiter": None, "zeile": None}


def ist_verschwunden(e: dict) -> bool:
    return e["status"] in VERSCHWUNDEN


def ist_lebend(e: dict) -> bool:
    return e["zeile"] is not None and not ist_verschwunden(e)


class Zustand:
    def __init__(self, pfad: Path, praefix: str):
        self.pfad = Path(pfad)
        self.praefix = praefix
        self.eintraege: dict[str, dict] = {}

    # ------------------------------------------------------------ Datei
    def _voll(self, u: str) -> str:
        return u if u.startswith("https://") else self.praefix + u

    def _kurz(self, url: str) -> str:
        return url[len(self.praefix):] if url.startswith(self.praefix) else url

    def laden(self) -> "Zustand":
        self.eintraege = {}
        for z in g.lies_jsonl(self.pfad):
            e = neuer_eintrag()
            e.update(umfang=z.get("umfang"), status=z.get("status", "offen"), geprueft=z.get("geprueft"),
                     quelle=z.get("quelle"), weiter=z.get("weiter"), zeile=z.get("zeile"))
            self.eintraege[self._voll(z["u"])] = e
        return self

    def speichern(self) -> None:
        self.pfad.parent.mkdir(parents=True, exist_ok=True)
        tmp = Path(str(self.pfad) + ".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            for url in sorted(self.eintraege):
                e = self.eintraege[url]
                z: dict = {"u": self._kurz(url), "umfang": e["umfang"], "status": e["status"], "geprueft": e["geprueft"]}
                if e["quelle"]:
                    z["quelle"] = e["quelle"]
                if e["weiter"]:
                    z["weiter"] = e["weiter"]
                if e["zeile"] is not None:
                    z["zeile"] = e["zeile"]
                f.write(json.dumps(z, ensure_ascii=False, separators=(",", ":")) + "\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, self.pfad)

    # ------------------------------------------------------------ Aenderungen
    def eintrag(self, url: str) -> dict:
        return self.eintraege.setdefault(url, neuer_eintrag())

    def fuege_urls_hinzu(self, urls: dict[str, str], start_umfang) -> list[str]:
        """urls: url -> Quelle ('s' Sitemap, 'k' Kategorie/Variante). Gibt die neuen URLs zurueck.
        `start_umfang(url, quelle) -> bool|None` entscheidet fuer neue URLs; bekannte behalten ihren Wert,
        ausser eine Kategorieseite nennt sie nun (dann gehoert sie dazu)."""
        neu = []
        for url, q in urls.items():
            e = self.eintraege.get(url)
            if e is None:
                e = self.eintrag(url)
                e["umfang"] = start_umfang(url, q)
                neu.append(url)
            if q == "k":
                e["quelle"] = "k"
                if e["umfang"] is False and e["status"] == "offen":
                    e["umfang"] = start_umfang(url, q)
        return neu

    def uebernimm(self, zeile: dict, tag_: str, shop_hat_umfang_im_ergebnis: bool) -> dict:
        """Ergebnis eines Abrufs eintragen. Gibt {"verschwunden": [...], "wieder": [...]} (URLs) zurueck."""
        ereignis = {"verschwunden": [], "wieder": []}
        url = zeile["url"]
        erg = zeile.get("ergebnis")
        if zeile.get("weiter_von"):  # Produkt -> Produkt: die alte Adresse gilt als verschwunden, die neue steht fuer sich
            alt = self.eintrag(zeile["weiter_von"])
            war = ist_lebend(alt)
            alt.update(status="weiterleitung", weiter=url, geprueft=tag_)
            if war:
                ereignis["verschwunden"].append(zeile["weiter_von"])
        e = self.eintrag(url)
        war_weg = ist_verschwunden(e)
        war_lebend = ist_lebend(e)
        e["geprueft"] = tag_
        if erg == "produkt":
            e["status"] = "produkt"
            e["zeile"] = schlank(zeile)
            e["weiter"] = None
            if shop_hat_umfang_im_ergebnis:
                e["umfang"] = zeile.get("im_umfang")
            elif e["umfang"] is None:
                e["umfang"] = zeile.get("im_umfang")
            if war_weg:
                ereignis["wieder"].append(url)
        elif erg in ("404", "weiterleitung"):
            e["status"] = erg
            e["weiter"] = zeile.get("weiter") if erg == "weiterleitung" else None
            if war_lebend:
                ereignis["verschwunden"].append(url)
        elif erg in ("keine produktdaten", "fehler"):
            e["status"] = erg
        return ereignis


def importiere(shop_modul, von: Path, ziel: Path, ab: str = "") -> dict:
    """Startzustand aus den Rohdaten (<shop>.jsonl, <shop>-urls.jsonl). Neueste Zeile pro URL gewinnt; die zuletzt
    gelesenen Produktdaten bleiben auch erhalten, wenn die URL danach verschwand. Gibt Zaehler zurueck."""
    shop = shop_modul.SHOP
    z = Zustand(ziel, shop_modul.PRAEFIX)
    ctx = None if shop == "ikea" else shop_modul.kontext()
    for u in g.lies_jsonl(Path(von) / f"{shop}-urls.jsonl"):
        if "url" not in u:
            continue
        e = z.eintrag(u["url"])
        if any(q != "sitemap" for q in u.get("quellen", [])):
            e["quelle"] = "k"
    zeilen = [r for r in g.lies_jsonl(Path(von) / f"{shop}.jsonl")
              if r.get("url") and str(r.get("abgerufen", "")) >= ab]
    for r in zeilen:
        z.uebernimm(r, tag(r.get("abgerufen")), shop == "ikea")
    for url, e in z.eintraege.items():
        if e["umfang"] is None and ctx is not None:
            e["umfang"] = shop_modul.start_umfang(url, e["quelle"] or "s", ctx)
    z.speichern()
    return {"urls": len(z.eintraege), "zeilen": len(zeilen),
            "produkte": sum(1 for e in z.eintraege.values() if e["status"] == "produkt")}
