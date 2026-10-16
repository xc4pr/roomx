"""Vergleich mit der bisherigen full.json, Schutzregel, Abgleich der kuratierten Eintraege und Bericht."""

from __future__ import annotations

import json
import re
import urllib.parse
from pathlib import Path

import gemeinsam as g

SCHWELLE_VERSCHWUNDEN_PROZENT = 5   # neu als discontinued markiert, Anteil an allen bisherigen Eintraegen
SCHWELLE_PREIS_PROZENT = 20         # geaenderter priceChf, Anteil an den Eintraegen in beiden Staenden
BEISPIELE = 10
MAX_KURATIERT_ZEILEN = 50
MARKEN = {"IKEA": "ikea", "JYSK": "jysk", "Tchibo": "tchibo"}


def md_text(t, maximal: int = 200) -> str:
    """Shop-Text fuer Markdown in oeffentlichen Issues: eine Zeile, keine Tabellenzeichen, keine @-Erwaehnung, gekuerzt."""
    t = " ".join(str(t if t is not None else "").split()).replace("|", "\\|").replace("@", "@\u200b")
    return t if len(t) <= maximal else t[: maximal - 1] + "\u2026"


def lies_liste(pfad: Path) -> list[dict] | None:
    """Bisherige full.json; None wenn es sie nicht gibt oder sie nicht lesbar ist."""
    try:
        d = json.loads(Path(pfad).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return [e for e in d if isinstance(e, dict) and e.get("id")] if isinstance(d, list) else None


def shop_von(e: dict) -> str:
    return MARKEN.get(e.get("brand"), str(e.get("brand")))


def _kurz(e: dict) -> dict:
    n = e.get("name") or {}
    return {"id": e["id"], "name": n.get("de") if isinstance(n, dict) else n, "url": e.get("url")}


def vergleiche(alt: list[dict] | None, neu: list[dict], neu_uebernommen: frozenset | set = frozenset()) -> dict:
    """Zahlen und Beispiele des Unterschieds alt -> neu. `neu_uebernommen`: ids, die in diesem Lauf erstmals
    aus der bisherigen Datei uebernommen wurden (zaehlt mit den neu verschwundenen fuer die Schutzregel)."""
    a = {e["id"]: e for e in alt or []}
    n = {e["id"]: e for e in neu}
    beide = [i for i in n if i in a]
    weg_neu = [i for i in beide if n[i].get("discontinued") and not a[i].get("discontinued")]
    wieder = [i for i in beide if a[i].get("discontinued") and not n[i].get("discontinued")]
    preis = [i for i in beide if a[i].get("priceChf") != n[i].get("priceChf")]
    zu = (set(weg_neu) | (set(neu_uebernommen) & set(n)))
    dazu = [i for i in n if i not in a]
    fehlt = [i for i in a if i not in n]
    out = {
        "bisher": len(a), "neu": len(n), "in_beiden": len(beide),
        "verschwunden_neu": len(weg_neu), "neu_uebernommen": len(set(neu_uebernommen) & set(n)),
        "verschwunden_oder_uebernommen": len(zu), "wieder_aufgetaucht": len(wieder), "preis_geaendert": len(preis),
        "hinzugekommen": len(dazu), "fehlend": len(fehlt),
        "discontinued_gesamt": sum(1 for e in n.values() if e.get("discontinued")),
        "pro_shop": {}, "beispiele": {},
    }
    for s in sorted({shop_von(e) for e in list(a.values()) + list(n.values())}):
        ids = lambda liste, quelle: [i for i in liste if shop_von(quelle[i]) == s]
        out["pro_shop"][s] = {
            "bisher": sum(1 for e in a.values() if shop_von(e) == s), "neu": sum(1 for e in n.values() if shop_von(e) == s),
            "verschwunden_neu": len(ids(weg_neu, n)), "preis_geaendert": len(ids(preis, n)),
            "hinzugekommen": len(ids(dazu, n)), "fehlend": len(ids(fehlt, a)),
        }
        out["beispiele"][s] = {
            "verschwunden": [_kurz(n[i]) for i in ids(weg_neu, n)[:BEISPIELE]],
            "preise": [{**_kurz(n[i]), "alt": a[i].get("priceChf"), "neu": n[i].get("priceChf")} for i in ids(preis, n)[:BEISPIELE]],
            "neue_eintraege": [_kurz(n[i]) for i in ids(dazu, n)[:BEISPIELE]],
            "wieder": [_kurz(n[i]) for i in ids(wieder, n)[:BEISPIELE]],
        }
    return out


def schutz(v: dict, vorhanden: bool) -> dict:
    """Schutzregel: nichts schreiben, wenn zu viel verschwindet oder sich zu viele Preise aendern."""
    gruende = []
    if vorhanden and v["bisher"] and v["verschwunden_oder_uebernommen"] * 100 > SCHWELLE_VERSCHWUNDEN_PROZENT * v["bisher"]:
        gruende.append(f"{v['verschwunden_oder_uebernommen']} von {v['bisher']} Eintraegen neu als discontinued markiert "
                       f"({v['verschwunden_neu']}) oder neu aus der bisherigen Datei uebernommen ({v['neu_uebernommen']}), "
                       f"mehr als {SCHWELLE_VERSCHWUNDEN_PROZENT} %")
    if vorhanden and v["in_beiden"] and v["preis_geaendert"] * 100 > SCHWELLE_PREIS_PROZENT * v["in_beiden"]:
        gruende.append(f"bei {v['preis_geaendert']} von {v['in_beiden']} Eintraegen hat sich der Preis geaendert "
                       f"(mehr als {SCHWELLE_PREIS_PROZENT} %)")
    return {"ausgeloest": bool(gruende), "gruende": gruende}


def _prozent(a: int, b: int) -> str:
    return f"{100 * a / b:.1f} %" if b else "-"


def markdown(r: dict) -> str:
    v = r.get("vergleich") or {}
    z = []
    if r.get("fehler"):
        z += ["# Katalog-Update: Fehler", "", r["fehler"], ""]
        return "\n".join(z)
    titel = "geschrieben" if r["geschrieben"] else "NICHT geschrieben (Schutzregel)"
    z += [f"# Katalog-Update: full.json {titel}", ""]
    if r["schutz"]["ausgeloest"]:
        z += ["**Schutzregel ausgeloest:**", ""] + [f"- {g}" for g in r["schutz"]["gruende"]] + [""]
    z += [f"Eintraege: bisher {v.get('bisher', 0)}, neu {v.get('neu', 0)}; hinzugekommen {v.get('hinzugekommen', 0)}, "
          f"fehlend {v.get('fehlend', 0)}, neu verschwunden {v.get('verschwunden_neu', 0)} "
          f"({_prozent(v.get('verschwunden_neu', 0), v.get('bisher', 0))}), wieder aufgetaucht {v.get('wieder_aufgetaucht', 0)}, "
          f"Preis geaendert {v.get('preis_geaendert', 0)} ({_prozent(v.get('preis_geaendert', 0), v.get('in_beiden', 0))}).", ""]
    if r.get("blockiert"):
        z += ["## Blockierte Shops", ""] + [f"- {b['shop']}: {md_text(b['meldung'])}" for b in r["blockiert"]] + [""]
    z += ["## Zahlen pro Shop", "", "| Shop | bisher | neu | hinzu | neu verschwunden | Preis geaendert | Produkte im Umfang | Zeilen verwendet | discontinued |",
          "|---|---|---|---|---|---|---|---|---|"]
    for s, b in r["shops"].items():
        p = v.get("pro_shop", {}).get(s, {})
        z.append(f"| {s} | {p.get('bisher', 0)} | {p.get('neu', 0)} | {p.get('hinzugekommen', 0)} | {p.get('verschwunden_neu', 0)} | "
                 f"{p.get('preis_geaendert', 0)} | {b.get('im_umfang', 0)} | {b.get('uebernommen', 0)} | {b.get('discontinued', 0)} |")
    z.append("")
    for titel, schl, fmt in (
        ("Neu verschwunden", "verschwunden", lambda e: f"{md_text(e['name'])} (`{e['id']}`)"),
        ("Preisaenderungen", "preise", lambda e: f"{md_text(e['name'])}: {e['alt']} -> {e['neu']} CHF (`{e['id']}`)"),
        ("Neue Eintraege", "neue_eintraege", lambda e: f"{md_text(e['name'])} (`{e['id']}`)"),
        ("Wieder aufgetaucht", "wieder", lambda e: f"{md_text(e['name'])} (`{e['id']}`)"),
    ):
        teile = []
        for s, b in (v.get("beispiele") or {}).items():
            if b.get(schl):
                teile += [f"**{s}**", ""] + [f"- {fmt(e)}" for e in b[schl]] + [""]
        if teile:
            z += [f"## {titel} (je Shop bis {BEISPIELE} Beispiele)", ""] + teile
    ue = r.get("uebernommen") or {}
    if ue.get("anzahl") or ue.get("ersetzt_anzahl"):
        z += ["## Unveraendert uebernommen / durch kuratiert ersetzt", "",
              f"Uebernommen (Normalisierer erzeugt sie nicht mehr, bleiben aber): {ue.get('anzahl', 0)}, davon neu {ue.get('neu', 0)}. "
              f"Durch kuratierte Eintraege ersetzt: {ue.get('ersetzt_anzahl', 0)}.", ""]
        for titel, schl in (("Uebernommen", "beispiele"), ("Durch kuratiert ersetzt", "ersetzt_beispiele")):
            if ue.get(schl):
                z += [f"**{titel}** (bis {BEISPIELE})", ""] + [f"- {md_text(e['name'])} (`{e['id']}`)" for e in ue[schl]] + [""]
    if r.get("curated_diffs_liste"):
        z += [f"## Kuratierte Eintraege ({r['curated_diffs']} Abweichungen, nichts wurde geaendert)", "",
              kuratiert_tabelle(r["curated_diffs_liste"]), ""]
    if r["offene_kategorien"]:
        z += ["## Offene Kategorien (uebersprungen, braucht Zuordnung)", ""]
        for o in r["offene_kategorien"][:30]:
            z.append(f"- `{o['schluessel']}`: {o['anzahl']} Artikel" + (f", z. B. {', '.join(md_text(x) for x in o['beispiele'])}" if o.get("beispiele") else ""))
        if len(r["offene_kategorien"]) > 30:
            z.append(f"- ... und {len(r['offene_kategorien']) - 30} weitere (siehe report.json)")
        z.append("")
    if r["offene_farben"]:
        z += ["## Offene Farben", "", ", ".join(f"{md_text(k)} ({n})" for k, n in list(r["offene_farben"].items())[:40]), ""]
    if r["offene_arten"]:
        z += [f"Offene Produktarten ohne englischen Namen: {r['offene_arten']}", ""]
    if r.get("en_gleich_de"):
        z += ["## Englische Namen", "", "Eintraege, deren englischer Name noch dem deutschen gleicht (ohne reine Eigennamen; Anteil an den Eintraegen ohne reine Eigennamen):", ""]
        for s, b in r["en_gleich_de"].items():
            z.append(f"- {s}: {b['anzahl']} von {b['gesamt']} ({b['anteil_prozent']} %), nur Eigennamen: {b['nur_eigennamen']}")
        z.append("")
        if r.get("en_unbekannt"):
            z += ["Haeufigste unbekannte Woerter (Tabelle `woerter-en.json` erweitern):", "",
                  ", ".join(f"{md_text(u['wort'])} ({u['anzahl']})" for u in r["en_unbekannt"][:30]), ""]
    idx = {s: b["index"] for s, b in r["shops"].items() if b.get("index")}
    if idx:
        z += ["## Letzter Index-Lauf", ""]
        for s, i in idx.items():
            z.append(f"- {s}: {i.get('abgerufen', 0)} abgerufen, {i.get('neu', 0)} neue URLs, {i.get('verschwunden', 0)} verschwunden, "
                     f"{i.get('fehler', 0)} Fehler, {i.get('dauer_s', 0)} s" + (", BLOCKIERT" if i.get("blockiert") else ""))
        z.append("")
    return "\n".join(z)


def _url_schluessel(url: str | None) -> str | None:
    if not url:
        return None
    host = urllib.parse.urlsplit(url.strip()).netloc
    return g.vereinheitliche(url, host) if host else None


def kuratiert_abgleich(kuratiert: list[dict], rows: dict[str, dict[str, dict]]) -> list[dict]:
    """Kuratierte Eintraege gegen den Zustand: anderer Shop-Preis, verschwunden oder (trotz discontinued) wieder da.
    Treffer ueber die URL (normalisiert), sonst ueber die Artikelnummer (nur Ziffern). Schreibt nichts."""
    nach_url: dict[str, dict] = {}
    nach_nr: dict[str, dict] = {}
    for shop_rows in rows.values():
        for url, r in shop_rows.items():
            nach_url[_url_schluessel(url) or url] = r
            nr = re.sub(r"\D", "", r.get("artikelnummer") or "")
            if nr:
                prev = nach_nr.get(nr)
                if prev is None or (prev.get("verschwunden") and not r.get("verschwunden")):
                    nach_nr[nr] = r
    out = []
    for k in kuratiert:
        r = nach_url.get(_url_schluessel(k.get("url")) or "")
        if r is None:
            nr = re.sub(r"\D", "", k.get("articleNo") or "")
            r = nach_nr.get(nr) if nr else None
        if r is None:
            continue
        gone = bool(r.get("verschwunden"))
        p_alt, p_neu = k.get("priceChf"), r.get("preis_chf")
        d = {"id": k["id"], "url": k.get("url") or r.get("url")}
        if gone and not k.get("discontinued"):
            out.append({**d, "alt": "verfuegbar", "neu": "verschwunden", "grund": "verschwunden (404/410/Weiterleitung)"})
        elif not gone and k.get("discontinued"):
            out.append({**d, "alt": "discontinued", "neu": "wieder da", "grund": "wieder aufgetaucht"})
        elif not gone and p_neu is not None and p_alt != p_neu:
            out.append({**d, "alt": p_alt, "neu": p_neu, "grund": "Preis"})
    return sorted(out, key=lambda x: x["id"])


def kuratiert_tabelle(diffs: list[dict]) -> str:
    """Markdown-Tabelle (hoechstens 50 Zeilen, dann 'und N weitere')."""
    z = ["| id | alt -> neu | Grund | URL |", "|---|---|---|---|"]
    for d in diffs[:MAX_KURATIERT_ZEILEN]:
        z.append(f"| `{d['id']}` | {d['alt']} -> {d['neu']} | {d['grund']} | {md_text(d.get('url'))} |")
    if len(diffs) > MAX_KURATIERT_ZEILEN:
        z.append("")
        z.append(f"und {len(diffs) - MAX_KURATIERT_ZEILEN} weitere (siehe report.json)")
    return "\n".join(z)


def uebernehmen(alt: list[dict], neu: list[dict], kur_ids: set, kur_nrn: set, rows: dict[str, dict[str, dict]]) -> tuple[list[dict], list[dict]]:
    """Alte Eintraege, die der Normalisierer nicht mehr erzeugt, bleiben (nie automatisch loeschen).
    Ausnahme: ein kuratierter Eintrag (gleiche id oder Artikelnummer in Ziffern) ersetzt sie.
    Sagt der Zustand fuer die URL 'verschwunden', wird der Eintrag mit discontinued: true uebernommen.
    Gibt (uebernommen, ersetzt) zurueck."""
    da = {e["id"] for e in neu}
    weg = {}
    for shop_rows in rows.values():
        for url, r in shop_rows.items():
            weg[_url_schluessel(url) or url] = bool(r.get("verschwunden"))
    uebernommen, ersetzt = [], []
    for e in alt:
        if e["id"] in da:
            continue
        nr = re.sub(r"\D", "", e.get("articleNo") or "")
        if e["id"] in kur_ids or (nr and nr in kur_nrn):
            ersetzt.append(e)
            continue
        e = dict(e)
        if weg.get(_url_schluessel(e.get("url")) or "") and not e.get("discontinued"):
            e["discontinued"] = True
        uebernommen.append(e)
    return uebernommen, ersetzt
