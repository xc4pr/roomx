"""Zustand (state/<shop>.jsonl) -> Katalogeintraege (full.json). Reine Funktionen; die Befehle stehen in update.py.

Nur Standardbibliothek.
"""
import json
import os
import re
import subprocess
import sys
import unicodedata
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import namen_en  # noqa: E402

SHOPS = ['ikea', 'jysk', 'tchibo']
BRAND = {'ikea': 'IKEA', 'jysk': 'JYSK', 'tchibo': 'Tchibo'}

# Standardwerte pro Modelltyp: (mount, power W, front mm, side mm)
MODEL_DEFAULTS = {
    'bed': ('floor', 0, 600, 500), 'sofa': ('floor', 0, 600, 0), 'cornerSofa': ('floor', 0, 600, 0),
    'armchair': ('floor', 0, 500, 0), 'chair': ('floor', 0, 400, 0), 'officeChair': ('floor', 0, 600, 0),
    'stool': ('floor', 0, 300, 0), 'table': ('floor', 0, 800, 0), 'roundTable': ('floor', 0, 800, 0),
    'desk': ('floor', 0, 900, 0), 'wardrobe': ('floor', 0, 700, 0), 'shelf': ('floor', 0, 600, 0),
    'cubeShelf': ('floor', 0, 600, 0), 'wallShelf': ('wall', 0, 0, 0), 'dresser': ('floor', 0, 600, 0),
    'sideboard': ('floor', 0, 500, 0), 'nightstand': ('floor', 0, 400, 0), 'box': ('floor', 0, 300, 0),
    'rug': ('floor', 0, 0, 0), 'roundRug': ('floor', 0, 0, 0), 'plant': ('floor', 0, 0, 0),
    'hangingPlant': ('ceiling', 0, 0, 0), 'picture': ('wall', 0, 0, 0), 'mirror': ('wall', 0, 400, 0),
    'curtain': ('wall', 0, 0, 0), 'cushion': ('on-top', 0, 0, 0), 'throw': ('on-top', 0, 0, 0),
    'vase': ('on-top', 0, 0, 0), 'basket': ('floor', 0, 0, 0), 'books': ('on-top', 0, 0, 0),
    'clock': ('wall', 0, 0, 0), 'floorLamp': ('floor', 10, 0, 0), 'tableLamp': ('on-top', 10, 0, 0),
    'pendantLamp': ('ceiling', 10, 0, 0), 'wallLamp': ('wall', 10, 0, 0), 'ledStrip': ('wall', 10, 0, 0),
    'monitor': ('on-top', 40, 500, 0), 'tv': ('floor', 100, 1500, 0), 'pc': ('floor', 200, 300, 0),
    'printer': ('on-top', 30, 300, 0), 'smallDevice': ('on-top', 20, 0, 0), 'speaker': ('floor', 30, 0, 0),
    'monitorArm': ('on-top', 0, 0, 0), 'powerStrip': ('floor', 0, 0, 0),
}
# Tchibo: Endungen der Namenswoerter, die als Stichwort fuer die Zuordnung gelten
TCHIBO_STICH = [
    'schreibtisch', 'sideboard', 'kommode', 'schrank', 'regal', 'tisch', 'stuhl', 'sessel', 'sofa', 'bett',
    'bank', 'hocker', 'lampe', 'leuchte', 'spiegel', 'teppich', 'vorhang', 'kissen', 'decke', 'pflanze',
    'bild', 'uhr', 'vase', 'korb', 'box', 'kiste', 'garderobe', 'liege', 'truhe', 'leiter', 'ständer',
    'paravent', 'wandhaken', 'kerze', 'laterne', 'kranz', 'girlande', 'matte', 'läufer', 'rollo', 'gardine',
]

NUM = r'\d+(?:[.,]\d+)?'


def zahl(x):
    """Zahl aus Zahl oder Text (Bereich -> kleinster Wert); sonst None."""
    if x is None or isinstance(x, bool):
        return None
    if isinstance(x, (int, float)):
        return float(x)
    s = collapse_ranges(str(x))
    m = re.search(NUM, s)
    return float(m.group(0).replace(',', '.')) if m else None


def collapse_ranges(s):
    def f(m):
        vals = [float(v.replace(',', '.')) for v in re.findall(NUM, m.group(0))]
        v = min(vals)
        return str(int(v)) if v == int(v) else str(v)
    return re.sub(NUM + r'(?:\s*[/–-]\s*' + NUM + r')+', f, s)


def mm(cm):
    return None if cm is None else int(round(cm * 10))


def name_dims(name):
    """Mass im Namen: Liste von Zahlen in mm ('120x60 cm', '42x13x4.5 cm', in mm)."""
    s = collapse_ranges(name)
    m = re.search(r'(' + NUM + r'(?:\s*[x×]\s*' + NUM + r'){1,2})\s*(mm|cm)?(?![a-zA-Z])', s)
    if not m:
        return None
    unit = m.group(2) or 'cm'
    vals = [float(v.replace(',', '.')) for v in re.findall(NUM, m.group(1))]
    f = 1 if unit == 'mm' else 10
    return [int(round(v * f)) for v in vals]


GRENZE_MM = 4000
OHNE_GRENZE = {'ledStrip'}


def berechne_masse(model, masse, name):
    """Gibt {'w','d','h'} in mm oder None (Grund 'masse'). Ein Mass ueber 4 m (ausser Lichterketten)
    gilt als Tippfehler im Shop, wenn ein Zehntel plausibel ist (z. B. «152 x 1945 x 40 cm»), sonst verworfen."""
    dims = _masse_roh(model, masse, name)
    if dims is None or model in OHNE_GRENZE:
        return dims
    out = {}
    for k, v in dims.items():
        if v > GRENZE_MM:
            if not 100 <= v / 10 <= GRENZE_MM:
                return None
            v = round(v / 10)
        out[k] = v
    return out


def masse_korrigiert(model, masse, name):
    return berechne_masse(model, masse, name) != _masse_roh(model, masse, name)


def _masse_roh(model, masse, name):
    masse = masse or {}
    b, t, h, l, dia = (zahl(masse.get(k)) for k in ('breite_cm', 'tiefe_cm', 'hoehe_cm', 'laenge_cm', 'durchmesser_cm'))
    nd = name_dims(name or '')
    pos = lambda v: v is not None and v > 0
    if model in ('rug', 'roundRug'):
        if pos(dia) and not pos(b) and not pos(l):
            w = d = mm(dia)
        else:
            w = mm(b) if pos(b) else (nd[0] if nd and len(nd) >= 2 else None)
            d = mm(l) if pos(l) else (mm(t) if pos(t) else (nd[1] if nd and len(nd) >= 2 else None))
            if w is None and pos(l):
                w = mm(l)
        h_ = 10
        if not (w and d):
            return None
        return {'w': w, 'd': d, 'h': h_}
    if model == 'curtain':
        w = mm(b) if pos(b) else (nd[0] if nd and len(nd) >= 2 else None)
        hh = mm(l) if pos(l) else (mm(h) if pos(h) else (nd[1] if nd and len(nd) >= 2 else None))
        if not (w and hh):
            return None
        return {'w': w, 'd': 20, 'h': hh}
    if model == 'bed':
        w, d, hh = mm(b) if pos(b) else None, mm(l) if pos(l) else (mm(t) if pos(t) else None), mm(h) if pos(h) else None
        if (w is None or d is None) and nd and len(nd) >= 2:
            w, d = w or nd[0], d or nd[1]
        if not (w and d and hh) or hh < 200:
            return None
        return {'w': w, 'd': d, 'h': hh}
    if model in ('table', 'desk') and nd and len(nd) >= 2:
        w, d = nd[0], nd[1]
        hh = mm(h) if pos(h) else (nd[2] if len(nd) >= 3 else None)
        if not hh:
            return None
        return {'w': w, 'd': d, 'h': hh}
    if pos(dia) and not pos(b) and not pos(t) and not pos(l):
        if not pos(h):
            return None
        return {'w': mm(dia), 'd': mm(dia), 'h': mm(h)}
    w = mm(b) if pos(b) else (mm(l) if pos(l) else None)
    d = mm(t) if pos(t) else (mm(l) if pos(l) and pos(b) else (mm(dia) if pos(dia) else None))
    hh = mm(h) if pos(h) else None
    if not (w and d and hh):
        return None
    return {'w': w, 'd': d, 'h': hh}


# ---------- Farben ----------

def lade_json(pfad, default):
    try:
        with open(pfad, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def farbe_hex(text, tabelle):
    """Hex fuer einen Farbtext oder None. Ganzer Text, dann Woerter, dann laengster Teilstring (>= 5 Zeichen)."""
    t = text.strip().lower()
    if not t:
        return None
    if t in tabelle:
        return tabelle[t]
    woerter = [w for w in re.split(r'[^a-zäöüéß]+', t) if w]
    for w in woerter:
        if w in tabelle:
            return tabelle[w]
    best = None
    for w in woerter:
        for k, v in tabelle.items():
            if len(k) >= 5 and k in w and (best is None or len(k) > len(best[0])):
                best = (k, v)
    return best[1] if best else None


def farben_aus(texte, tabelle, offen=None):
    """texte: Liste von Farbtexten -> (Hexliste ohne Doppelte, unbekannte Texte)."""
    out, unbekannt = [], []
    for roh in texte:
        for teil in re.split(r'\s*[,;/]\s*|\s+und\s+|\s+mit\s+', roh or ''):
            teil = teil.strip()
            if not teil:
                continue
            h = farbe_hex(teil, tabelle)
            if h:
                if h not in out:
                    out.append(h)
            else:
                unbekannt.append(teil.lower())
    return out, unbekannt


# ---------- Namen ----------

def slug(s):
    s = s.lower().replace('ä', 'ae').replace('ö', 'oe').replace('ü', 'ue').replace('ß', 'ss')
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


IKEA_SERIE = re.compile(r'^([A-ZÄÖÜÅØÆ0-9][A-ZÄÖÜÅØÆ0-9\-]+(?:\s*/\s*[A-ZÄÖÜÅØÆ0-9][A-ZÄÖÜÅØÆ0-9\-]+)*)\s+(\S.*)$')
JYSK_STOP = {'LED', 'TV', 'USB', 'XL', 'XXL', 'PC', 'UV', 'PVC', 'MDF', 'WC', 'DVD', 'CD'}


def ikea_name(name):
    """-> (basis, serie, farbtext). 'SERIE Art - Farbe 80x100 cm'."""
    name = (name or '').strip()
    dims_txt = ''
    m = re.search(r'\s(' + NUM + r'(?:\s*[x×/]\s*' + NUM + r')*\s*(?:cm|mm))\s*$', name)
    if m:
        dims_txt = m.group(1)
        name = name[:m.start()].rstrip()
    if ' - ' in name:
        links, farb = name.split(' - ', 1)
    else:
        links, farb = name, ''
    basis = (links.strip() + (' ' + dims_txt if dims_txt else '')).strip()
    serie = None
    ms = IKEA_SERIE.match(links.strip())
    if ms:
        serie = re.sub(r'\s*/\s*', ' / ', ms.group(1))
    return basis, serie, farb


DIMS_TOKEN = re.compile(r'^(?:B?\d+(?:[.,]\d+)?(?:[x\u00d7/]H?T?\d+(?:[.,]\d+)?)+(?:cm|mm)?|\d+(?:[.,]\d+)?(?:cm|mm))$', re.I)


def jysk_name(name, farbfeld, tabelle):
    """-> (basis, serie). Entfernt Farbwoerter am Ende und direkt hinter dem Mass."""
    woerter = (name or '').split()
    vokab = set(w for w in re.split(r'[^a-zäöüéß]+', (farbfeld or '').lower()) if w) | {'dunkel', 'hell', 'weis', 'natur'}

    def ist_farbe(w):
        w = w.lower().strip(',;')
        if not w or re.search(r'\d', w) or w.isupper() and len(w) > 2:
            return False
        return w in vokab or w in tabelle or (len(w) >= 5 and farbe_hex(w, tabelle) is not None)

    while len(woerter) > 1 and ist_farbe(woerter[-1]):
        woerter.pop()
    for i, w in enumerate(woerter):  # Farbe direkt hinter dem Mass (z. B. '70x160 Eiche natur 2 Stk')
        if DIMS_TOKEN.match(w):
            j = i + 1
            while j < len(woerter) and ist_farbe(woerter[j]):
                woerter.pop(j)
            break
    basis = ' '.join(woerter)
    serie = None
    for w in woerter[1:]:
        c = w.strip(',;')
        if c.isupper() and len(c) >= 3 and c.isalpha() and c not in JYSK_STOP:
            serie = c
            break
    return basis, serie


def tchibo_art(name):
    """Produktart (Hauptwort) aus dem Tchibo-Namen, kleingeschrieben."""
    kern = re.sub(r'[»«\u201e\u201c"].*?[»«\u201e\u201c"]', ' ', name or '')
    # Kein Schnitt im Dezimalkomma («2,5-Sitzer») und nicht nach «Decken- und Wandleuchte».
    kern = re.split(r',(?!\d)|\(|(?<!-)\s+(?:mit|für|aus|und|im|in|zum|zur|von|inkl\.?)\s+', kern, maxsplit=1)[0]
    tokens = []
    for t in kern.split():
        t = t.split('-')[-1].lower().strip('.:;!?')
        if t and not re.fullmatch(r'[\d.,x/]+', t):
            tokens.append(t)
    for t in tokens:
        for suf in TCHIBO_STICH:
            if t.endswith(suf) or t.endswith(suf + 'n') or t.endswith(suf + 's') or t.endswith(suf + 'e'):
                return t
    return tokens[-1] if tokens else ''





# ---------- Eingabe ----------

def kategorie_schluessel(shop, r):
    if shop == 'tchibo':
        return 'tchibo|' + tchibo_art(r.get('name'))
    pfad = r.get('kategorie_pfad') or []
    txt = ' > '.join(pfad) if pfad else (r.get('kategorie') or '(ohne)')
    return f'{shop}|{txt}'


class KuratiertFehler(RuntimeError):
    """Die Liste der kuratierten Eintraege konnte nicht gelesen werden."""


def lade_kuratiert(web, cache, cache_erlaubt=False):
    """IDs, Artikelnummern und die Liste der kuratierten Eintraege (id, articleNo, url, priceChf, discontinued), per Node aus dem Web-Ordner (Schreibt den Zwischenspeicher).
    Schlaegt Node fehl, gibt es nur mit `cache_erlaubt` einen Rueckfall auf den Zwischenspeicher; sonst KuratiertFehler.
    Eine leere Liste waere falsch: kuratierte Artikel kaemen sonst doppelt in den Katalog."""
    code = ("import('#lib/catalog/index.ts').then(m=>console.log(JSON.stringify("
            "m.catalog.map(e=>({id:e.id,articleNo:e.articleNo??null,url:e.url??null,priceChf:e.priceChf??null,discontinued:e.discontinued===true})))))")
    try:
        out = subprocess.run(['node', '--input-type=module', '-e', code], cwd=str(web), capture_output=True,
                             text=True, timeout=120, check=True).stdout
        data = json.loads(out.strip().splitlines()[-1])
        if not isinstance(data, list) or not data:
            raise ValueError('leere Liste')
        os.makedirs(os.path.dirname(str(cache)), exist_ok=True)
        with open(cache, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception as e:
        if not cache_erlaubt:
            raise KuratiertFehler(f'Kuratierte Eintraege nicht lesbar (Node-Import in {web} fehlgeschlagen: {e}). '
                                  'Mit --kuratiert-cache darf der Zwischenspeicher out/kuratiert.json benutzt werden.') from e
        data = lade_json(cache, [])
        if not data:
            raise KuratiertFehler('Zwischenspeicher fuer kuratierte Eintraege fehlt oder ist leer.') from e
    ids = {e['id'] for e in data}
    nrn = {re.sub(r'\D', '', e['articleNo']) for e in data if e.get('articleNo')}
    nrn.discard('')
    return ids, nrn, data


def artnr_zahl(s):
    return re.sub(r'\D', '', s or '')


def preis(r):
    p = r.get('preis_chf')
    return float(p) if isinstance(p, (int, float)) and p >= 0 else None


def ist_weiss(r):
    return bool(re.search(r'wei(ss|ß)', (r.get('farbe') or '') + ' ' + (r.get('name') or ''), re.I))


def waehle_variante(rows):
    """Tiefster regulaerer Preis, bei Gleichstand weiss, sonst kleinste Artikelnummer."""
    def k(r):
        p = preis(r)
        return (p if p is not None else float('inf'), 0 if ist_weiss(r) else 1, int(artnr_zahl(r.get('artikelnummer')) or 10**15))
    return min(rows, key=k)


def id_vorschlag(shop, serie, basis, dims):
    art = basis
    if serie:
        for teil in re.split(r'\s*/\s*', serie):
            art = re.sub(r'\b' + re.escape(teil) + r'\b', '', art, count=1)
    art = re.sub(NUM + r'(?:\s*[x\u00d7/]\s*' + NUM + r')+(?:\s*(?:cm|mm)\b)?', '', art)
    art = re.sub(NUM + r'\s*(?:cm|mm)\b', '', art)
    art = slug(art)[:48].strip('-')
    cmf = lambda v: (str(v // 10) if v % 10 == 0 else f'{v // 10}p{v % 10}')
    teile = [shop, slug(serie)[:30] if serie else '', art, f"{cmf(dims['w'])}x{cmf(dims['d'])}x{cmf(dims['h'])}"]
    return '-'.join(t for t in teile if t).strip('-')


def art_text(basis, serie):
    """Produktart: Name ohne Serie, Farbe (schon entfernt), Masse und «Anfuehrungen»."""
    art = basis or ''
    if serie:
        for teil in re.split(r'\s*/\s*', serie):
            art = re.sub(r'(?<!\w)' + re.escape(teil) + r'(?!\w)', ' ', art, count=1)
    art = re.sub(r'[»«\u201e\u201c"][^»«\u201e\u201c"]*[»«\u201e\u201c"]', ' ', art)
    art = re.sub(NUM + r'(?:\s*[x\u00d7/]\s*' + NUM + r')+(?:\s*(?:cm|mm)\b)?', ' ', art)
    art = re.sub(NUM + r'\s*(?:cm|mm)\b', ' ', art)
    return re.sub(r'\s+', ' ', art).strip(' ,;-')


def art_schluessel(basis, serie, arten):
    """Art fuer arten-en.json: zuerst mit Serie (Eintraege aus der Zeit, als Serien mit Å/Ø/Æ nicht erkannt wurden), sonst ohne."""
    if serie and arten:
        voll = art_text(basis, None)
        if arten.get(voll):
            return voll
    return art_text(basis, serie)


def uebersetze(name, art, arten):
    """Wendet arten-en.json an: ganze Art, sonst einzelne Art-Woerter."""
    if art and art in arten and arten[art]:
        return name.replace(art, arten[art], 1)
    for de, en in arten.items():
        if en and ' ' not in de:
            name = re.sub(r'(?<!\w)' + re.escape(de) + r'(?!\w)', en, name)
    return name


def englisch(de, art, shop, serie, arten, woerter):
    """-> (englischer Name, unbekannte Woerter, hat_woerter). Ganze Art aus arten-en.json wie bisher, sonst namen_en."""
    if art and art in arten and arten[art] and art in de and not namen_en.material_hinten(art):  # steht die Art nicht woertlich im Namen (z. B. «Kommode »CN3« mit Fach»), greift namen_en
        en = de.replace(art, arten[art], 1)
        if shop == 'jysk':
            en = namen_en.serie_nach_vorn(en, serie)
        return namen_en.akronyme_gross(en), [], True
    if shop == 'jysk' and serie and serie in de:  # «5 Schubladen Kommode TAPDRUP breit»: Art vor der Serie ganz, Rest Wort fuer Wort
        vor, _, nach = de.partition(serie)
        vor, nach = vor.strip(), nach.strip()
        if vor[:1].isdigit() and vor in arten and arten[vor] and nach:
            rest, unb, _hat = namen_en.name_en_info(nach, shop, None, woerter, arten)
            sep = ' ' if rest[:1].isdigit() else ', '
            return namen_en.akronyme_gross(f'{serie} {arten[vor]}{sep}{rest}'), unb, True
    return namen_en.name_en_info(de, shop, serie, woerter, arten)


def normalisiere(rows_by_shop, zuordnung, farben, ids_tab, kur_ids, kur_nrn, arten=None, woerter=None, vorher=None):
    """Kernlauf. Gibt (eintraege, bericht, offen_zuordnung, offen_farben) zurueck; veraendert ids_tab.
    vorher: bisherige full.json; ihre IDs gehen an einen neuen Schluessel mit derselben Artikelnummer."""
    arten = arten or {}
    woerter = woerter or {}
    en_stat = {sh: {'gesamt': 0, 'gleich': 0, 'eigennamen': 0} for sh in SHOPS}
    en_unbekannt = Counter()
    bericht = {}
    offen_z = {}
    offen_f = Counter()
    art_zaehler = Counter()
    gruppen = defaultdict(list)  # key -> [(row, cat-info, basis, serie, farben_hex)]
    for shop in SHOPS:
        rows = rows_by_shop.get(shop, {})
        b = {'zeilen': len(rows), 'produkte': 0, 'im_umfang': 0, 'uebernommen': 0, 'eintraege': 0, 'discontinued': 0, 'verworfen': Counter()}
        bericht[shop] = b
        for r in rows.values():
            if r.get('ergebnis') != 'produkt':
                b['verworfen']['kein_produkt'] += 1
                continue
            b['produkte'] += 1
            if shop == 'ikea' and r.get('im_umfang') is not True:
                b['verworfen']['nicht_im_umfang'] += 1
                continue
            b['im_umfang'] += 1
            nr = artnr_zahl(r.get('artikelnummer'))
            if nr and nr in kur_nrn:
                b['verworfen']['kuratiert'] += 1
                continue
            # Name, Serie, Farben
            if shop == 'ikea':
                basis, serie, ftxt = ikea_name(r.get('name'))
                quellen = [r.get('farbe') or ''] if r.get('farbe') else [ftxt]
            elif shop == 'jysk':
                basis, serie = jysk_name(r.get('name'), r.get('farbe'), farben)
                quellen = [r.get('farbe') or '']
            else:
                basis = (r.get('name') or '').strip()
                serie = 'CN3' if re.search(r'\bCN3\b', basis) else None
                quellen = [r.get('farbe') or '']
            art_zaehler[art_schluessel(basis, serie, arten)] += 1
            key = kategorie_schluessel(shop, r)
            z = 'aus' if key.endswith('|') else zuordnung.get(key)
            if z is None:
                b['verworfen']['zuordnung_offen'] += 1
                o = offen_z.setdefault(key, {'anzahl': 0, 'beispiele': []})
                o['anzahl'] += 1
                if len(o['beispiele']) < 3:
                    o['beispiele'].append(r.get('name'))
                continue
            if z == 'aus':
                b['verworfen']['aus'] += 1
                continue
            model = z['model']
            dims = berechne_masse(model, r.get('masse'), r.get('name'))
            if dims is None:
                b['verworfen']['masse'] += 1
                continue
            hexe, unbek = farben_aus(quellen, farben)
            if shop == 'ikea' and not hexe and ftxt:
                hexe, unbek2 = farben_aus([ftxt], farben)
            if unbek and not hexe:
                for u in unbek:
                    offen_f[u] += 1
            if not basis:
                b['verworfen']['masse'] += 1
                continue
            b['uebernommen'] += 1
            skey = f"{shop}|{slug(basis)}|{dims['w']}x{dims['d']}x{dims['h']}"
            gruppen[skey].append((shop, r, z, basis, serie, hexe))
    eintraege = []
    benutzt = set(kur_ids) | set(ids_tab.values())
    # Aendert sich der Schluessel (Mass korrigiert, Name oder Farbwort anders), behaelt der Artikel seine bisherige
    # ID, sofern sie keinem Schluessel dieses Laufs mehr gehoert. Gespeicherte Projekte behalten so ihr Moebel.
    belegt = {ids_tab[k] for k in gruppen if k in ids_tab}
    frei = {}
    for e in vorher or []:
        nr = artnr_zahl(e.get('articleNo'))
        if nr and e.get('id') and e['id'] not in belegt and e['id'] not in kur_ids:
            k = (e.get('brand'), nr)
            frei[k] = None if k in frei and frei[k] != e['id'] else e['id']
    for skey in sorted(gruppen):
        g = gruppen[skey]
        shop = g[0][0]
        lebend = [x for x in g if not x[1].get('verschwunden')]
        pool = lebend or g
        sieger = waehle_variante([x[1] for x in pool])
        _, r, z, basis, serie, _h = next(x for x in pool if x[1] is sieger)
        model = z['model']
        dims = berechne_masse(model, r.get('masse'), r.get('name'))
        hexe = []
        for x in pool:
            for h in x[5]:
                if h not in hexe:
                    hexe.append(h)
        if not hexe:
            hexe = ['#cfcfcf']
        alt_id = None
        if skey not in ids_tab:
            for nr in sorted({artnr_zahl(x[1].get('artikelnummer')) for x in g} - {''}):
                alt_id = frei.get((BRAND[shop], nr))
                if alt_id:
                    del frei[(BRAND[shop], nr)]
                    break
        if skey in ids_tab:
            eid = ids_tab[skey]
        elif alt_id:
            eid = alt_id
            for k in [k for k, v in ids_tab.items() if v == alt_id]:
                del ids_tab[k]
            ids_tab[skey] = eid
        else:
            eid = id_vorschlag(shop, serie, basis, dims)[:190]
            cand, n = eid, 2
            while cand in benutzt:
                cand = f'{eid}-{n}'
                n += 1
            eid = cand
            ids_tab[skey] = eid
            benutzt.add(eid)
        mount0, power, front, side = MODEL_DEFAULTS.get(model, ('floor', 0, 0, 0))
        mount = z.get('mount') or mount0
        p = preis(sieger)
        de = basis
        e = {'id': eid, 'brand': BRAND[shop]}
        if serie:
            e['series'] = serie
        en, unb, hat = englisch(de, art_schluessel(basis, serie, arten), shop, serie, arten, woerter)
        e['name'] = {'de': de, 'en': en}
        st = en_stat[shop]
        st['gesamt'] += 1
        if en == de:
            st['eigennamen' if not hat else 'gleich'] += 1
        en_unbekannt.update(unb)
        e['category'] = z['category']
        e['model'] = model
        e['dims'] = dims
        e['colors'] = hexe[:8]
        e['mount'] = mount
        e['power'] = power
        e['clearance'] = {'front': front, 'side': side}
        if p is not None:
            e['priceChf'] = p
        if sieger.get('url'):
            e['url'] = sieger['url'].rstrip('/') if shop == 'jysk' else sieger['url']
        if sieger.get('artikelnummer'):
            e['articleNo'] = str(sieger['artikelnummer'])
        e['verified'] = bool(p is not None and sieger.get('url') and sieger.get('artikelnummer') and basis
                             and not masse_korrigiert(model, r.get('masse'), r.get('name')))
        if not lebend:
            e['discontinued'] = True
            bericht[shop]['discontinued'] += 1
        eintraege.append(e)
        bericht[shop]['eintraege'] += 1
    eintraege.sort(key=lambda e: e['id'])
    for b in bericht.values():
        b['verworfen'] = dict(b['verworfen'])
    offen_liste = [{'schluessel': k, **v} for k, v in sorted(offen_z.items(), key=lambda kv: -kv[1]['anzahl'])]
    offen_arten = [{'art': a, 'anzahl': n} for a, n in sorted(art_zaehler.items(), key=lambda kv: (-kv[1], kv[0])) if a and a not in arten]
    normalisiere.arten_offen = offen_arten
    normalisiere.en_stat = en_stat
    normalisiere.en_unbekannt = en_unbekannt
    return eintraege, bericht, offen_liste, dict(offen_f.most_common())


def schreibe_json(pfad, obj):
    tmp = pfad + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write('\n')
    os.replace(tmp, pfad)


def blatt_schluessel(baum, knoten):
    drin = {k['id'] for k in knoten}
    out = []

    def gehe(n, namen):
        namen = namen + [n['name']]
        kinder = [s for s in n.get('subs', []) if s['id'] in drin]
        if n['id'] in drin and not kinder:
            out.append('ikea|' + ' > '.join(namen))
        for s in n.get('subs', []):
            gehe(s, namen)

    for n in baum:
        gehe(n, [])
    return sorted(set(out))
