"""Gemeinsamer Code der Katalog-Index-Skripte (IKEA, JYSK, Tchibo).

Nur Standardbibliothek. Regeln:
- hoechstens 1 Anfrage pro 1,2 s und Shop, auch ueber mehrere Prozesse (flock auf einer Sperrdatei)
- ehrlicher User-Agent, robots.txt vor jeder URL (inkl. Wildcards * und $)
- Weiterleitungen werden nicht verfolgt, sondern festgehalten
- 403, 429, Captcha oder 5 Fehler in Folge: Abbruch (Blockiert -> Exit-Code 2)
- keine Bilder, 3D-Dateien, Videos oder PDFs: weder URL noch Content-Type
"""

from __future__ import annotations

import datetime as dt
import fcntl
import gzip
import json
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from dataclasses import dataclass
from pathlib import Path

UA = "RoomX-catalog-index/1.0 (+https://github.com/xc4pr/roomx)"
PAUSE = 1.2
BASIS = Path(__file__).resolve().parent
REPO = BASIS.parent
WEB = REPO / "web"
STATE = BASIS / "state"
OUT = BASIS / "out"
FULL_JSON = WEB / "src" / "lib" / "catalog" / "data" / "full.json"
INDEX_TS = WEB / "src" / "lib" / "catalog" / "index.ts"


def lock_verzeichnis() -> Path:
    """Ordner der Sperrdateien: ROOMX_INDEX_LOCKS, sonst <Systemtemp>/roomx-index."""
    return Path(os.environ.get("ROOMX_INDEX_LOCKS") or Path(tempfile.gettempdir()) / "roomx-index")


MAX_FEHLER_FOLGE = 5
MAX_BYTES = 120_000_000

VERBOTENE_ENDUNGEN = (
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg", ".ico", ".bmp", ".tif", ".tiff",
    ".glb", ".gltf", ".usdz", ".obj", ".fbx", ".mp4", ".webm", ".mov", ".pdf", ".zip",
)
VERBOTENE_TEILE = ("dimma", "geomagical")
ERLAUBTE_TYPEN = ("text/html", "text/plain", "application/xml", "text/xml", "application/xhtml", "application/gzip", "application/x-gzip", "application/octet-stream")


class Blockiert(Exception):
    """Shop blockiert oder zu viele Fehler: Lauf sofort beenden (Exit-Code 2)."""


class Verboten(Exception):
    """URL durch robots.txt oder Medienregel ausgeschlossen."""


@dataclass
class Antwort:
    url: str
    status: int
    weiter: str | None
    text: str


def jetzt() -> str:
    return dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds")


# ---------------------------------------------------------------- URLs

def vereinheitliche(url: str, host: str, pfad_prefix: str | None = None) -> str:
    """https, fester Host (www), ohne Query/Fragment, Schraegstrich am Ende."""
    u = urllib.parse.urlsplit(url.strip())
    pfad = u.path or "/"
    if not pfad.endswith("/"):
        pfad += "/"
    return urllib.parse.urlunsplit(("https", host, re.sub(r"/{2,}", "/", pfad), "", ""))


def medien_url(url: str) -> bool:
    pfad = urllib.parse.urlsplit(url).path.lower().rstrip("/")
    return pfad.endswith(VERBOTENE_ENDUNGEN) or any(t in url.lower() for t in VERBOTENE_TEILE)


# ---------------------------------------------------------------- robots.txt

def _muster(pfad: str) -> re.Pattern:
    ende = pfad.endswith("$")
    if ende:
        pfad = pfad[:-1]
    return re.compile("^" + ".*".join(re.escape(p) for p in pfad.split("*")) + ("$" if ende else ""))


class Robots:
    """robots.txt: urllib.robotparser plus eigene Wildcard-Regeln (robotparser kennt kein * im Pfad)."""

    def __init__(self, text: str, ua: str = UA):
        self.rp = urllib.robotparser.RobotFileParser()
        self.rp.parse(text.splitlines())
        self.regeln: list[tuple[bool, str, re.Pattern]] = []
        gruppe: list[str] = []
        letzte_war_agent = False
        gruppen: list[tuple[list[str], list[tuple[bool, str]]]] = []
        for zeile in text.splitlines():
            zeile = zeile.split("#", 1)[0].strip()
            if ":" not in zeile:
                continue
            k, v = (s.strip() for s in zeile.split(":", 1))
            k = k.lower()
            if k == "user-agent":
                if not letzte_war_agent:
                    gruppen.append(([], []))
                gruppen[-1][0].append(v.lower())
                letzte_war_agent = True
            elif k in ("allow", "disallow") and gruppen:
                letzte_war_agent = False
                if v:
                    gruppen[-1][1].append((k == "allow", v))
            else:
                letzte_war_agent = False
        name = ua.split("/")[0].lower()
        passend = [g for g in gruppen if any(a != "*" and a in name for a in g[0])] or [g for g in gruppen if "*" in g[0]]
        for _, regeln in passend:
            for erlaubt, v in regeln:
                self.regeln.append((erlaubt, v, _muster(v)))

    def erlaubt(self, url: str, ua: str = UA) -> bool:
        u = urllib.parse.urlsplit(url)
        ziel = u.path + ("?" + u.query if u.query else "")
        best: tuple[int, bool] | None = None
        for erlaubt, v, m in self.regeln:
            if m.match(ziel) and (best is None or (len(v), erlaubt) > best):
                best = (len(v), erlaubt)
        if best is not None and not best[1]:
            return False
        return self.rp.can_fetch(ua, url) if best is None else True


# ---------------------------------------------------------------- Abruf

class _KeineWeiterleitung(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Shop:
    def __init__(self, name: str, host: str, pause: float = PAUSE, lock_dir: Path | None = None, opener=None):
        self.name = name
        self.host = host
        self.pause = pause
        self.lock_pfad = Path(lock_dir or lock_verzeichnis()) / f"shop-{name}.lock"
        self.opener = opener or urllib.request.build_opener(_KeineWeiterleitung)
        self.robots: Robots | None = None
        self.fehler_folge = 0
        self.anfragen = 0

    # Sperre: eine Anfrage pro `pause` Sekunden, prozessuebergreifend
    def _gesperrt_warten(self, f) -> None:
        f.seek(0)
        try:
            letzte = float(f.read().strip() or 0)
        except ValueError:
            letzte = 0.0
        warte = letzte + self.pause - time.time()
        if warte > 0:
            time.sleep(warte)
        f.seek(0)
        f.truncate()
        f.write(repr(time.time()))
        f.flush()

    def _anfrage(self, url: str, accept: str) -> Antwort:
        self.lock_pfad.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(self.lock_pfad, os.O_RDWR | os.O_CREAT, 0o600)
        with os.fdopen(fd, "r+") as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            try:
                self._gesperrt_warten(f)
                self.anfragen += 1
                req = urllib.request.Request(url, headers={
                    "User-Agent": UA, "Accept": accept, "Accept-Language": "de-CH,de;q=0.9",
                })
                try:
                    with self.opener.open(req, timeout=30) as r:
                        typ = (r.headers.get("Content-Type") or "").lower()
                        if typ and not typ.startswith(ERLAUBTE_TYPEN):
                            return Antwort(url, r.status, None, "")  # Medien nie laden
                        roh = r.read(MAX_BYTES)
                        status, weiter = r.status, None
                except urllib.error.HTTPError as e:
                    status, weiter = e.code, e.headers.get("Location")
                    roh = e.read(200_000) if status != 404 else b""
                    e.close()
            finally:
                fcntl.flock(f, fcntl.LOCK_UN)
        if roh[:2] == b"\x1f\x8b":
            roh = gzip.decompress(roh)
        if weiter:
            weiter = urllib.parse.urljoin(url, weiter)
        return Antwort(url, status, weiter, roh.decode("utf-8", "replace"))

    def hole(self, url: str, accept: str = "text/html,application/xhtml+xml,application/xml;q=0.9") -> Antwort:
        """Eine URL abrufen. Wirft Verboten (nicht abgerufen) oder Blockiert (Lauf beenden)."""
        if medien_url(url):
            raise Verboten(f"Medien-URL: {url}")
        if self.robots is None and not url.endswith("/robots.txt"):
            self.lade_robots()
        if self.robots is not None and not self.robots.erlaubt(url):
            raise Verboten(f"robots.txt: {url}")
        try:
            a = self._anfrage(url, accept)
        except (urllib.error.URLError, TimeoutError, OSError, ConnectionError) as e:
            self._fehler(f"Netzwerkfehler {url}: {e}")
            raise
        if a.status in (403, 429):
            raise Blockiert(f"{self.name}: Status {a.status} bei {url}")
        if a.status == 200 and re.search(r"captcha|are you a robot|access denied", a.text[:6000], re.I):
            raise Blockiert(f"{self.name}: Captcha oder Sperrseite bei {url}")
        if a.status >= 500:
            self._fehler(f"Status {a.status} bei {url}")
        else:
            self.fehler_folge = 0
        return a

    def _fehler(self, meldung: str) -> None:
        self.fehler_folge += 1
        if self.fehler_folge >= MAX_FEHLER_FOLGE:
            raise Blockiert(f"{self.name}: {MAX_FEHLER_FOLGE} Fehler in Folge, zuletzt: {meldung}")

    def lade_robots(self) -> None:
        a = self._anfrage(f"https://{self.host}/robots.txt", "text/plain")
        if a.status in (403, 429):
            raise Blockiert(f"{self.name}: robots.txt Status {a.status}")
        # Fehlende robots.txt (404) heisst: alles erlaubt; sonst Regeln lesen
        self.robots = Robots(a.text if a.status == 200 else "")
        self.robots_text = a.text if a.status == 200 else ""

    def sitemaps(self) -> list[str]:
        if self.robots is None:
            self.lade_robots()
        return re.findall(r"(?im)^\s*sitemap:\s*(\S+)", self.robots_text)


def lies_jsonl(pfad: Path) -> list[dict]:
    """Zeilen einer jsonl-Datei; leere und halb geschriebene Zeilen (laufender Abruf) werden uebersprungen."""
    if not Path(pfad).exists():
        return []
    out = []
    with open(pfad, encoding="utf-8") as f:
        for zeile in f:
            zeile = zeile.strip()
            if zeile:
                try:
                    out.append(json.loads(zeile))
                except json.JSONDecodeError:
                    pass
    return out


# ---------------------------------------------------------------- Hilfen fuer JYSK und Tchibo (Teil 2, nur Ergaenzungen)

import html as _html  # noqa: E402

_LD = re.compile(r"<script[^>]*application/ld\+json[^>]*>(.*?)</script>", re.S)
_TAG = re.compile(r"<[^>]+>")
_ZAHL = r"(\d+(?:[.,]\d+)?)"
_EINHEIT = {"mm": 0.1, "cm": 1, "m": 100, None: 1}
_ACHSEN = {"b": "breite_cm", "breite": "breite_cm", "t": "tiefe_cm", "tiefe": "tiefe_cm", "h": "hoehe_cm",
           "höhe": "hoehe_cm", "hoehe": "hoehe_cm", "l": "laenge_cm", "länge": "laenge_cm", "laenge": "laenge_cm",
           "d": "durchmesser_cm", "ø": "durchmesser_cm", "durchmesser": "durchmesser_cm"}


def leere_masse() -> dict:
    return {"breite_cm": None, "tiefe_cm": None, "hoehe_cm": None, "laenge_cm": None, "durchmesser_cm": None}


def html_text(fragment: str) -> str:
    return re.sub(r"\s+", " ", _html.unescape(_TAG.sub(" ", fragment))).strip()


def ld_objekte(page: str) -> list[dict]:
    """Alle JSON-LD-Objekte der Seite (Listen und @graph aufgeloest)."""
    out: list[dict] = []
    for m in _LD.finditer(page):
        try:
            d = json.loads(m.group(1))
        except json.JSONDecodeError:
            continue
        for x in (d if isinstance(d, list) else [d]):
            if isinstance(x, dict):
                out.extend(x["@graph"] if isinstance(x.get("@graph"), list) else [x])
    return [x for x in out if isinstance(x, dict)]


def zahl(wert) -> float | int | None:
    try:
        x = float(str(wert).replace(",", "."))
    except (TypeError, ValueError):
        return None
    return int(x) if x == int(x) else x


def preis_aus_text(text: str) -> float | int | None:
    """'CHF 109.-' -> 109, 'CHF 12.95' -> 12.95, "CHF 1'299.-" -> 1299."""
    m = re.search(r"(\d[\d'’ ]*(?:[.,]\d{1,2})?)", text or "")
    if not m:
        return None
    return zahl(re.sub(r"['’ ]", "", m.group(1)))


def _cm(wert: str, einheit: str | None) -> float | int:
    x = round(float(wert.replace(",", ".")) * _EINHEIT[einheit], 2)
    return int(x) if x == int(x) else x


def masse_aus_text(text: str) -> dict:
    """Massangaben aus Freitext in cm. Erkennt 'Breite: 70 cm', 'B x H x T ca. 16,5 x 10 x 25,5 cm',
    'B70 x H160 x T2 cm' und 'Ø 30 cm'. Fehlendes bleibt None; Rohtext bleibt beim Aufrufer (masse_zeilen)."""
    out = leere_masse()
    text = _html.unescape(text or "").replace("\xa0", " ")

    def setze(achse: str, wert: str, einheit):
        k = _ACHSEN.get(achse.lower())
        if k and out[k] is None:
            out[k] = _cm(wert, einheit)

    for m in re.finditer(r"(?:gesamt)?(Breite|Tiefe|Höhe|Hoehe|Länge|Laenge|Durchmesser|Ø)\s*:?\s*(?:je\s+)?(?:ca\.?\s*)?" + _ZAHL + r"\s*(mm|cm|m)\b", text, re.I):
        setze(m.group(1), m.group(2), m.group(3).lower())
    for m in re.finditer(r"((?:[BHTLDØ]\s*x\s*)+[BHTLDØ])\s*:?\s*(?:ca\.?\s*)?(" + _ZAHL + r"(?:\s*[x×]\s*" + _ZAHL + r")+)\s*(mm|cm|m)?\b", text):
        achsen = re.findall(r"[BHTLDØ]", m.group(1))
        werte = re.findall(_ZAHL, m.group(2))
        if len(achsen) == len(werte):
            for a, w in zip(achsen, werte):
                setze(a, w, m.group(len(m.groups())))
    for m in re.finditer(r"((?:\b[BHTLD]\s?" + _ZAHL + r"\s*[x×]?\s*)+)(?P<u>mm|cm|m)\b", text):
        paare = re.findall(r"\b([BHTLD])\s?" + _ZAHL, m.group(1))
        if len(paare) >= 2:
            for a, w in paare:
                setze(a, w, m.group("u"))
    if out["durchmesser_cm"] is None:
        m = re.search(r"Ø\s*(?:je\s+)?(?:ca\.?\s*)?" + _ZAHL + r"\s*(mm|cm|m)?\b", text)
        if m:
            setze("ø", m.group(1), m.group(2))
    return out
