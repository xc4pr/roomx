"""Katalog-Update: Index-Lauf je Shop, Normalisieren mit Schutzregel, Stand-Datum, Import.

    python3 catalog-index/update.py index --shop ikea|jysk|tchibo [--budget-min 270] [--max-urls N]
    python3 catalog-index/update.py normalize [--out <pfad full.json>] [--kuratiert-cache] [--entfernen-erlaubt]
    python3 catalog-index/update.py stand --datum YYYY-MM-DD
    python3 catalog-index/update.py import --von <ordner> [--ab shop=ISO ...]

Exit-Codes: index 0 ok, 2 Shop blockiert, 1 Fehler; normalize 0 geschrieben, 3 Schutzregel (nichts geschrieben), 1 Fehler.
Zustand: catalog-index/state/, Arbeitsdateien und Berichte: catalog-index/out/ (nicht im Repo).
Nur Standardbibliothek; normalize braucht Node im Ordner web/ (Liste der kuratierten Eintraege).
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bericht  # noqa: E402
import gemeinsam as g  # noqa: E402
import ikea  # noqa: E402
import jysk  # noqa: E402
import normalisieren as nm  # noqa: E402
import tchibo  # noqa: E402
import zustand as zs  # noqa: E402

MODULE = {"ikea": ikea, "jysk": jysk, "tchibo": tchibo}
ALTER_AUFFRISCHEN_TAGE = 6
SPEICHERN_ALLE_ABRUFE = 200
SPEICHERN_ALLE_SEKUNDEN = 120


def heute() -> str:
    return dt.date.today().isoformat()


def schreibe_json(pfad: Path, obj) -> None:
    pfad = Path(pfad)
    pfad.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(str(pfad) + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    tmp.replace(pfad)


# ---------------------------------------------------------------- index

def index_lauf(modul, state: Path = g.STATE, out: Path = g.OUT, budget_min: float = 270, max_urls: int | None = None,
               ohne_suche: bool = False, opener=None, lock_dir: Path | None = None, pause: float = g.PAUSE,
               uhr=time.monotonic, tag: str | None = None) -> tuple[int, dict]:
    """Ein Shop: suchen, dann abrufen (nie Gepruefte zuerst, dann aelteste Pruefung), bis Budget oder Limit."""
    tag = tag or heute()
    t0 = uhr()
    frist = t0 + budget_min * 60
    abbruch = lambda: uhr() >= frist  # noqa: E731
    name = modul.SHOP
    zust = zs.Zustand(Path(state) / f"{name}.jsonl", modul.PRAEFIX).laden()
    b = {"shop": name, "tag": tag, "abgerufen": 0, "neu": 0, "neue_produkte": 0, "verschwunden": 0, "wieder_aufgetaucht": 0,
         "fehler": 0, "dauer_s": 0, "blockiert": False, "meldung": None, "suche_fehler": [], "offen_danach": 0,
         "verschwunden_urls": [], "fehler_beispiele": [], "umfang_neu_beurteilt": 0}
    shop = g.Shop(name, modul.HOST, pause=pause, lock_dir=lock_dir, opener=opener)
    ctx = modul.grund_kontext()
    code = 0
    neuer_hash = zs.umfang_hash(modul)
    alter_hash = zs.lies_hashes(state).get(name)
    if alter_hash is not None and alter_hash != neuer_hash:  # Umfangsdatei geaendert: Ausgeschlossene neu beurteilen
        b["umfang_neu_beurteilt"] = zust.beurteile_umfang_neu(lambda u, q: modul.start_umfang(u, q, ctx))
        zust.speichern()
    if alter_hash != neuer_hash:
        zs.schreibe_hash(state, name, neuer_hash)  # erster Lauf ohne Hash: nur merken
    letzte_speicherung = (uhr(), 0)

    def melde(urls: dict[str, str]) -> None:
        b["neu"] += len(zust.fuege_urls_hinzu(urls, lambda u, q: modul.start_umfang(u, q, ctx)))

    def aus_baum(baum, knoten):
        schreibe_json(Path(out) / "ikea-baum.json", nm.blatt_schluessel(baum, knoten))

    try:
        if not ohne_suche:
            ctx, fehler = modul.entdecke(shop, melde, abbruch, aus_baum if name == "ikea" else None)
            b["suche_fehler"] = fehler
            if fehler:
                code = 1
            zust.speichern()
        e = zust.eintraege
        rang = modul.reihenfolge(e)
        grenze = (dt.date.fromisoformat(tag) - dt.timedelta(days=ALTER_AUFFRISCHEN_TAGE)).isoformat()

        def schluessel(u):
            x = e[u]
            if x["geprueft"] is None:
                return (1, rang(u), "", u)  # 2. nie geprueft
            if x["umfang"] is True and x["status"] == "produkt" and x["geprueft"] <= grenze:
                return (0, 0, x["geprueft"], u)  # 1. bekannte Produkte im Umfang, 6 Tage oder aelter, aelteste zuerst
            return (2, 0, x["geprueft"], u)  # 3. Rest nach aeltester Pruefung

        offen = sorted((u for u, x in e.items() if x["umfang"] is not False), key=schluessel)
        queue = collections.deque(offen)
        erledigt: set[str] = set()
        while queue and not abbruch() and (max_urls is None or b["abgerufen"] < max_urls):
            url = queue.popleft()
            if url in erledigt:
                continue
            erledigt.add(url)
            b["abgerufen"] += 1
            neu_gesehen = e[url]["geprueft"] is None
            zeile = modul.hole(shop, url, ctx)
            erledigt.update({zeile["url"], zeile.get("weiter_von") or url})
            if zeile["ergebnis"] == "fehler":
                b["fehler"] += 1
                if len(b["fehler_beispiele"]) < 10:
                    b["fehler_beispiele"].append(f"{url}: {zeile.get('fehler')}")
            ereignis = zust.uebernimm(zeile, tag, name == "ikea")
            b["verschwunden"] += len(ereignis["verschwunden"])
            b["wieder_aufgetaucht"] += len(ereignis["wieder"])
            b["verschwunden_urls"] += ereignis["verschwunden"][: 20 - len(b["verschwunden_urls"])]
            if neu_gesehen and zeile["ergebnis"] == "produkt" and zust.eintraege[zeile["url"]]["umfang"] is not False:
                b["neue_produkte"] += 1
            neue = zust.fuege_urls_hinzu({u: "k" for u in zeile.get("varianten") or []}, lambda u, q: modul.start_umfang(u, q, ctx))
            b["neu"] += len(neue)
            for u in reversed(neue):
                if e[u]["umfang"] is not False:
                    queue.appendleft(u)
            if b["abgerufen"] - letzte_speicherung[1] >= SPEICHERN_ALLE_ABRUFE or uhr() - letzte_speicherung[0] >= SPEICHERN_ALLE_SEKUNDEN:
                zust.speichern()
                letzte_speicherung = (uhr(), b["abgerufen"])
    except g.Blockiert as ex:
        b["blockiert"], b["meldung"] = True, str(ex)
        code = 2
    except Exception as ex:  # Zustand trotzdem sichern
        b["meldung"] = f"{type(ex).__name__}: {ex}"
        code = 1
    finally:
        zust.speichern()
        b["offen_danach"] = sum(1 for x in zust.eintraege.values() if x["umfang"] is not False and x["geprueft"] is None)
        b["dauer_s"] = round(uhr() - t0, 1)
        schreibe_json(Path(out) / f"{name}-index.json", b)
    return code, b


# ---------------------------------------------------------------- normalize

def zeilen_aus_zustand(state: Path) -> dict[str, dict]:
    rows: dict[str, dict] = {}
    for name, modul in MODULE.items():
        z = zs.Zustand(Path(state) / f"{name}.jsonl", modul.PRAEFIX).laden()
        rows[name] = {}
        for url, e in z.eintraege.items():
            if e["zeile"] is None:
                continue
            rows[name][url] = {"shop": name, "url": url, "ergebnis": "produkt", "im_umfang": e["umfang"],
                               "verschwunden": zs.ist_verschwunden(e), **e["zeile"]}
    return rows


def lies_tabelle(pfad: Path, standard):
    return nm.lade_json(str(pfad), standard)


def normalize_lauf(out_pfad: Path = g.FULL_JSON, state: Path = g.STATE, out: Path = g.OUT, web: Path = g.WEB,
                   basis: Path = g.BASIS, cache_erlaubt: bool = False, entfernen_erlaubt: bool = False,
                   zustand_schreiben: bool | None = None) -> int:
    """zustand_schreiben: ids.json und uebernommen.json nur beim Standardpfad von full.json (Probelauf mit --out aendert den Zustand nicht)."""
    if zustand_schreiben is None:
        zustand_schreiben = Path(out_pfad).resolve() == Path(g.FULL_JSON).resolve()
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    try:
        kur_ids, kur_nrn, kur_liste = nm.lade_kuratiert(web, out / "kuratiert.json", cache_erlaubt)
    except nm.KuratiertFehler as e:
        print(f"FEHLER: {e}", file=sys.stderr)
        r = {"geschrieben": False, "fehler": str(e)}
        schreibe_json(out / "report.json", r)
        (out / "report.md").write_text(bericht.markdown(r) + "\n", encoding="utf-8")
        return 1
    zuordnung = lies_tabelle(Path(basis) / "zuordnung.json", {})
    farben = {k.lower(): v for k, v in lies_tabelle(Path(basis) / "farben.json", {}).items()}
    arten = lies_tabelle(Path(basis) / "arten-en.json", {})
    woerter = lies_tabelle(Path(basis) / "woerter-en.json", {})
    ids_pfad = Path(state) / "ids.json"
    ids_tab = lies_tabelle(ids_pfad, {})
    alt = bericht.lies_liste(out_pfad)  # vor dem Schreiben einlesen
    rows = zeilen_aus_zustand(state)
    eintraege, shops, offen_z, offen_f = nm.normalisiere(rows, zuordnung, farben, ids_tab, kur_ids, kur_nrn, arten, woerter)
    gesehen = {o["schluessel"] for o in offen_z}
    for k in lies_tabelle(out / "ikea-baum.json", []):  # Blatt-Kategorien des IKEA-Baums ohne gesehenes Produkt
        if k not in zuordnung and k not in gesehen:
            offen_z.append({"schluessel": k, "anzahl": 0, "beispiele": []})
    diffs = bericht.kuratiert_abgleich(kur_liste, rows)
    curated_md = out / "curated.md"
    if diffs:
        curated_md.write_text("# Kuratierte Eintraege weichen vom Shop ab\n\n" + bericht.kuratiert_tabelle(diffs) + "\n", encoding="utf-8")
    elif curated_md.exists():
        curated_md.unlink()
    uebernommen, ersetzt = [], []
    if alt is not None and not entfernen_erlaubt:
        uebernommen, ersetzt = bericht.uebernehmen(alt, eintraege, kur_ids, kur_nrn, rows)
        eintraege = sorted(eintraege + uebernommen, key=lambda e: e["id"])
    uebernommen_pfad = Path(state) / "uebernommen.json"
    bisher_uebernommen = set(lies_tabelle(uebernommen_pfad, []))
    neu_uebernommen = {e["id"] for e in uebernommen} - bisher_uebernommen
    v = bericht.vergleiche(alt, eintraege, neu_uebernommen)
    s = bericht.schutz(v, alt is not None)
    text = "[\n" + ",\n".join(json.dumps(e, ensure_ascii=False, separators=(",", ":")) for e in eintraege) + "\n]\n" if eintraege else "[]\n"
    geschrieben = not s["ausgeloest"]
    if geschrieben:
        Path(out_pfad).parent.mkdir(parents=True, exist_ok=True)
        tmp = Path(str(out_pfad) + ".tmp")
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(out_pfad)
        if zustand_schreiben:
            ids_pfad.parent.mkdir(parents=True, exist_ok=True)
            uebernommen_pfad.write_text(json.dumps(sorted(e["id"] for e in uebernommen), indent=0) + "\n", encoding="utf-8")
            tmp = Path(str(ids_pfad) + ".tmp")
            tmp.write_text(json.dumps(dict(sorted(ids_tab.items())), ensure_ascii=False, indent=0), encoding="utf-8")
            tmp.replace(ids_pfad)
    blockiert = []
    for name in MODULE:
        idx = lies_tabelle(out / f"{name}-index.json", None)
        shops[name]["index"] = idx
        if idx and idx.get("blockiert"):
            blockiert.append({"shop": name, "meldung": idx.get("meldung")})
    en_gleich = {}
    for sh, st in nm.normalisiere.en_stat.items():
        ohne = st["gesamt"] - st["eigennamen"]
        en_gleich[sh] = {"anzahl": st["gleich"], "gesamt": st["gesamt"],
                         "anteil_prozent": round(100 * st["gleich"] / ohne, 1) if ohne else 0.0,
                         "nur_eigennamen": st["eigennamen"]}
    en_unbekannt = [{"wort": w, "anzahl": n} for w, n in sorted(nm.normalisiere.en_unbekannt.items(), key=lambda kv: (-kv[1], kv[0]))[:200]]
    r = {"erstellt": g.jetzt(), "en_gleich_de": en_gleich, "en_unbekannt": en_unbekannt, "geschrieben": geschrieben, "schutz": {**s, "schwelle_verschwunden_prozent": bericht.SCHWELLE_VERSCHWUNDEN_PROZENT,
         "schwelle_preis_prozent": bericht.SCHWELLE_PREIS_PROZENT}, "vergleich": v, "shops": shops,
         "uebernommen": {"anzahl": len(uebernommen), "neu": len(neu_uebernommen),
                         "beispiele": [bericht._kurz(e) for e in uebernommen[:bericht.BEISPIELE]],
                         "ersetzt_anzahl": len(ersetzt), "ersetzt_beispiele": [bericht._kurz(e) for e in ersetzt[:bericht.BEISPIELE]]},
         "curated_diffs": len(diffs), "curated_diffs_liste": diffs,
         "offene_kategorien": offen_z, "offene_farben": offen_f, "offene_arten": len(nm.normalisiere.arten_offen),
         "blockiert": blockiert, "full_json_bytes": len(text.encode("utf-8"))}
    schreibe_json(out / "report.json", r)
    (out / "report.md").write_text(bericht.markdown(r) + "\n", encoding="utf-8")
    schreibe_json(out / "zuordnung-offen.json", offen_z)
    schreibe_json(out / "farben-offen.json", offen_f)
    schreibe_json(out / "arten-offen.json", nm.normalisiere.arten_offen)
    print(json.dumps({"geschrieben": geschrieben, "eintraege": len(eintraege), "schutz": s["gruende"],
                      "offene_kategorien": len(offen_z)}, ensure_ascii=False))
    return 0 if geschrieben else 3


# ---------------------------------------------------------------- stand, import

STAND_ZEILE = re.compile(r"^(export const CATALOG_PRICES_AS_OF = ')\d{4}-\d{2}(';)[ \t]*$", re.M)


def setze_stand(pfad: Path, datum: str) -> int:
    try:
        d = dt.date.fromisoformat(datum)
    except ValueError:
        print(f"FEHLER: ungueltiges Datum {datum!r} (erwartet YYYY-MM-DD)", file=sys.stderr)
        return 1
    try:
        text = Path(pfad).read_text(encoding="utf-8")
    except OSError as e:
        print(f"FEHLER: {e}", file=sys.stderr)
        return 1
    neu, n = STAND_ZEILE.subn(lambda m: f"{m.group(1)}{d:%Y-%m}{m.group(2)}", text)
    if n != 1:
        print("FEHLER: Zeile 'export const CATALOG_PRICES_AS_OF = ...;' nicht (genau einmal) gefunden", file=sys.stderr)
        return 1
    Path(pfad).write_text(neu, encoding="utf-8")
    print(f"CATALOG_PRICES_AS_OF = {d:%Y-%m}")
    return 0


def import_lauf(von: Path, ab: dict[str, str], state: Path = g.STATE) -> int:
    von = Path(von)
    state = Path(state)
    gefunden = False
    for name, modul in MODULE.items():
        if not (von / f"{name}.jsonl").exists():
            print(f"{name}: keine {name}.jsonl in {von.name}, uebersprungen", file=sys.stderr)
            continue
        gefunden = True
        print(name, json.dumps(zs.importiere(modul, von, state / f"{name}.jsonl", ab.get(name, ""))))
        zs.schreibe_hash(state, name, zs.umfang_hash(modul))
    ids_quelle = von / "ids.json"
    if ids_quelle.exists():  # bestehende IDs behalten Vorrang
        ids = nm.lade_json(str(ids_quelle), {})
        ids.update(nm.lade_json(str(state / "ids.json"), {}))
        state.mkdir(parents=True, exist_ok=True)
        (state / "ids.json").write_text(json.dumps(dict(sorted(ids.items())), ensure_ascii=False, indent=0), encoding="utf-8")
        print(f"ids.json: {len(ids)} IDs")
    return 0 if gefunden else 1


# ---------------------------------------------------------------- main

def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="befehl", required=True)
    i = sub.add_parser("index")
    i.add_argument("--shop", required=True, choices=sorted(MODULE))
    i.add_argument("--budget-min", type=float, default=270)
    i.add_argument("--max-urls", type=int)
    i.add_argument("--ohne-suche", action="store_true", help="Sitemap und Kategorieseiten nicht absuchen (nur bekannte URLs)")
    n = sub.add_parser("normalize")
    n.add_argument("--out", type=Path, default=g.FULL_JSON)
    n.add_argument("--kuratiert-cache", action="store_true",
                   help="bei Node-Fehler den Zwischenspeicher out/kuratiert.json benutzen (sonst Exit 1)")
    n.add_argument("--entfernen-erlaubt", action="store_true",
                   help="fehlende alte Eintraege nicht uebernehmen (bewusste Aenderung der Zuordnung); leert state/uebernommen.json")
    s = sub.add_parser("stand")
    s.add_argument("--datum", required=True)
    m = sub.add_parser("import")
    m.add_argument("--von", required=True, type=Path)
    m.add_argument("--ab", nargs="+", action="extend", default=[], metavar="shop=ISO")
    a = ap.parse_args(argv)
    try:
        if a.befehl == "index":
            code, b = index_lauf(MODULE[a.shop], budget_min=a.budget_min, max_urls=a.max_urls, ohne_suche=a.ohne_suche)
            print(json.dumps({k: v for k, v in b.items() if k not in ("verschwunden_urls", "fehler_beispiele")}, ensure_ascii=False))
            if b["meldung"]:
                print(f"{'ABBRUCH' if b['blockiert'] else 'FEHLER'}: {b['meldung']}", file=sys.stderr)
            for f in b["suche_fehler"]:
                print(f"FEHLER Suche: {f}", file=sys.stderr)
            return code
        if a.befehl == "normalize":
            return normalize_lauf(a.out, cache_erlaubt=a.kuratiert_cache, entfernen_erlaubt=a.entfernen_erlaubt)
        if a.befehl == "stand":
            return setze_stand(g.INDEX_TS, a.datum)
        ab = dict(x.split("=", 1) for x in a.ab if "=" in x)
        return import_lauf(a.von, ab)
    except Exception as e:  # noqa: BLE001
        print(f"FEHLER: {type(e).__name__}: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
