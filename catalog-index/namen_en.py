"""Englische Produktnamen aus deutschen: Wort- und Phrasentabelle plus ein paar feste Regeln.

Nur Standardbibliothek. Die Tokenisierung ist verbindlich (die Paketliste fuer die Tabelle nutzt dieselbe Regel):
Leerraum trennt, `,;()` sind eigene Token (ein Komma zwischen Ziffern, wie in «2,5», nicht).
"""
import re

SERIE_RE = re.compile(r'[A-ZÄÖÜÅØÆ0-9][A-ZÄÖÜÅØÆ0-9\-/&.]*')
# Grossgeschriebene Abkuerzungen, die beim Umstellen des Serienblocks nicht als Serie gelten
KEINE_SERIE = {'LED', 'TV', 'USB', 'XL', 'XXL', 'PC', 'UV', 'PVC', 'MDF', 'WC', 'DVD', 'CD'}
EINHEITEN = {'cm', 'mm', 'm', 'kg', 'g', 'l', 'ml', 'w', 'v', 'hz', 'lm', 'x'}
ZAHL = r'\d+(?:[.,]\d+)?'
ZAHL_BEREICH = ZAHL + r'(?:[-–/]' + ZAHL + r')?'
MASS_WORT = {'breit': 'wide', 'hoch': 'high', 'tief': 'deep', 'lang': 'long'}
BIND_ZAHL = re.compile(r'^\d+(?:[.,]\d+)?-[A-Za-zÄÖÜäöüß]')
BIND_REGEL = re.compile(r'^(' + ZAHL + r')-(türig|teilig|sitzer|flammig)(?:er|e|es|en|em)?(?=-|$)(.*)$', re.I)
BIND_ENDUNG = {'türig': 'door', 'teilig': 'piece', 'sitzer': 'seater', 'flammig': 'light'}
ZITAT_AUF = '»„"“'
ZITAT_ZU = '«"“”'
PHRASE_MAX = 4
MATERIAL = {'metall', 'holz', 'glas', 'bambus', 'rattan'}
PRAEP = {'aus', 'mit', 'von', 'in', 'im', 'für', 'und', 'oder', 'ohne', 'auf', 'an', 'zu', 'zum', 'zur', 'bei', 'nach', 'vor',
         'unter', 'über', 'als', 'inkl.', 'inkl', 'sowie', 'je', 'pro', 'ab'}
ABKUERZUNG = {'approx', 'incl', 'pcs', 'max', 'min', 'excl', 'etc'}
AKRONYME = re.compile(r'(?<![\w])(tv|led|usb|cd|dvd)(?![\w])', re.I)

_cache = {}


def tokens(text):
    """Text -> Token: an Leerraum getrennt, `,;()` eigene Token."""
    text = re.sub(r'(?<!\d),|,(?!\d)|[;()]', lambda m: f' {m.group(0)} ', text or '')
    return text.split()


def _ist_serie(t, serie_teile):
    if t in serie_teile:
        return True
    return bool(SERIE_RE.fullmatch(t)) and sum(c.isalpha() for c in t) >= 2


def _vokabular(woerter, arten):
    k = (id(woerter), id(arten), len(woerter), len(arten))
    if _cache.get('k') != k:
        v = {a.lower(): e for a, e in arten.items() if e and ' ' not in a}
        v.update({w.lower(): e for w, e in woerter.items()})
        _cache.update(k=k, v=v, refs=(woerter, arten))
    return _cache['v']


def _suche(vok, teile):
    """Phrase aus Token-Texten nachschlagen: erst mit Punkten, dann ohne Satzzeichen am Ende. -> (Uebersetzung, Rest) oder None."""
    roh = ' '.join(t.lower() for t in teile)
    if roh in vok:
        return vok[roh], ''
    stumpf = [t.lower() for t in teile]
    letzt = stumpf[-1].rstrip('.:;!?')
    if letzt:
        stumpf[-1] = letzt
        k = ' '.join(stumpf)
        if k in vok:
            tr, rest = vok[k], teile[-1][len(letzt):]
            if '.' in rest:  # Abkuerzungspunkt faellt weg, ausser die Uebersetzung ist selbst eine Abkuerzung
                rest = rest.replace('.', '')
                if tr.lower().rstrip('.') in ABKUERZUNG and not tr.endswith('.'):
                    rest = '.' + rest
            return tr, rest
    return None


def _schluessel(teile):
    stumpf = [t.lower() for t in teile]
    stumpf[-1] = stumpf[-1].rstrip('.:;!?')
    return ' '.join(stumpf)


def _wort(vok, t, unbekannt):
    r = _suche(vok, [t])
    if r:
        return r[0] + r[1]
    if any(c.isalpha() for c in t) and t.lower() not in EINHEITEN:
        unbekannt.append(_schluessel([t]))
    return t


def _zahlwort(vok, t):
    """«2Sch.» -> «2 drawers», «3Pers» -> «3-seater»; sonst None (Masse wie «10cm», «2er» bleiben)."""
    m = re.fullmatch(r'(\d+(?:[.,]\d+)?)([^\W\d_][^\d\s/+]*)', t)
    if not m:
        return None
    n, w = m.groups()
    wl = w.lower().rstrip('.')
    if wl == 'pers' and re.fullmatch(ZAHL, n):
        return f'{n}-seater'
    if wl in EINHEITEN:
        return None
    r = _suche(vok, [w])
    return f'{n} {r[0] + r[1]}' if r else None


def _geteilt(vok, t, unbekannt):
    """Token mit «/» oder «+»: Teile einzeln, Trennzeichen bleibt."""
    out = []
    for p in re.split(r'([/+])', t):
        if p in ('', '/', '+'):
            out.append(p)
        else:
            z = _zahlwort(vok, p)
            out.append(z if z else p if re.search(r'\d', p) or not any(c.isalpha() for c in p) else _wort(vok, p, unbekannt))
    return ''.join(out)


def _bindestrich(vok, t, unbekannt):
    m = BIND_REGEL.match(t)
    if m:
        n, was, rest = m.groups()
        out = f'{n}-{BIND_ENDUNG[was.lower()]}'
        if rest.startswith('-') and rest[1:]:
            out += '-' + _wort(vok, rest[1:], unbekannt)
        return out
    teile = t.split('-')
    return '-'.join(p if (re.search(r'\d', p) or not p) else _wort(vok, p, unbekannt) for p in teile)


def _klassen(text, serie, vok, unbekannt):
    """Text -> Liste von (Art, Text). Art: serie, zahl, frei, zitat, zeichen, wort."""
    serie_teile = set(re.split(r'\s*/\s*', serie)) if serie else set()
    tok = tokens(text)
    out, ors = [], []
    i, n = 0, len(tok)
    while i < n:
        start, i0 = len(out), i
        t = tok[i]
        tl = t.lower()
        if t in ',;()':
            out.append(('zeichen', t))
            i += 1
        elif t[0] in ZITAT_AUF:
            j = i
            if not (len(t) > 1 and t[-1] in ZITAT_ZU):
                while j + 1 < n and tok[j][-1] not in ZITAT_ZU:
                    j += 1
            out.append(('zitat', ' '.join(tok[i:j + 1])))
            i = j + 1
        elif tl == 'ca.' and i + 3 < n and re.fullmatch(ZAHL, tok[i + 1]) and tok[i + 2].lower() == 'cm' \
                and tok[i + 3].lower() in MASS_WORT:
            out.append(('wort', f'approx. {tok[i + 1]} cm {MASS_WORT[tok[i + 3].lower()]}'))
            i += 4
        elif tl == 'für' and i + 2 < n and re.fullmatch(ZAHL_BEREICH, tok[i + 1]) \
                and tok[i + 2].lower().rstrip('.') in ('pers', 'personen'):
            out.append(('wort', f'for {tok[i + 1]} {"person" if tok[i + 1] == "1" else "people"}'))
            i += 3
        elif re.fullmatch(ZAHL, t) and i + 1 < n and tok[i + 1].lower() in ('pers.', 'pers'):
            out.append(('wort', f'{t}-seater'))
            i += 2
        elif re.fullmatch(ZAHL_BEREICH, t) and i + 1 < n and tok[i + 1].lower().rstrip('.') in ('pers', 'personen'):
            out.append(('wort', f'{t} {"person" if t == "1" else "people"}'))
            i += 2
        elif _ist_serie(t, serie_teile):
            out.append(('serie', t))
            i += 1
        elif BIND_ZAHL.match(t):
            out.append(('wort', _bindestrich(vok, t, unbekannt)))
            i += 1
        elif _zahlwort(vok, t):
            out.append(('wort', _zahlwort(vok, t)))
            i += 1
        elif re.search(r'[/+]', t) and any(c.isalpha() for c in t) and not _suche(vok, [t]):
            out.append(('wort', _geteilt(vok, t, unbekannt)))
            i += 1
        elif re.search(r'\d', t):
            out.append(('zahl', t))
            i += 1
        elif not any(c.isalpha() for c in t):
            out.append(('frei', t))
            i += 1
        else:
            # Phrase: laengster Treffer aus bis zu PHRASE_MAX einfachen Wort-Token
            nxt = 1
            res = None
            for k in range(min(PHRASE_MAX, n - i), 0, -1):
                teile = tok[i:i + k]
                if any(x in ',;()' or x[0] in ZITAT_AUF or re.search(r'\d', x) or _ist_serie(x, serie_teile)
                       or not any(c.isalpha() for c in x) for x in teile):
                    continue
                res = _suche(vok, teile)
                if res:
                    nxt = k
                    break
            if res:
                out.append(('mat' if nxt == 1 and tl in MATERIAL else 'wort', res[0] + res[1]))
            else:
                if t.lower() in EINHEITEN:
                    out.append(('wort', t))
                else:
                    unbekannt.append(_schluessel([t]))
                    out.append(('wort', t))
            i += nxt
        ors.extend([tok[i0].lower()] * (len(out) - start))
    return _material_nach_vorn(out, ors)


def _material_nach_vorn(out, ors):
    """«Garderobe Metall» -> «metal Garderobe»: Material hinter einem Nomen (nicht hinter Praeposition oder Komma) kommt
    vor das Kernnomen (nach einem fuehrenden Adjektiv wie «Hohes»)."""
    m = 0
    while m < len(out):
        if out[m][0] == 'mat' and m > 0 and out[m - 1][0] == 'wort' and ors[m - 1] not in PRAEP:
            h = next((x for x in range(m) if out[x][0] == 'wort'), None)
            if h is not None:
                if ors[h].endswith(('e', 'es', 'er', 'en')) and h + 1 < m and out[h + 1][0] == 'wort' and ors[h + 1] not in PRAEP:
                    h += 1
                out.insert(h, out.pop(m))
                ors.insert(h, ors.pop(m))
        m += 1
    return [('wort' if a == 'mat' else a, t) for a, t in out]


def _nach_vorn(items, serie):
    """JYSK: Serienblock (zusammenhaengende Serien-Token) vom Ende der Art an den Anfang."""
    if not items or items[0][0] in ('serie', 'zahl'):
        return items
    teile = set(re.split(r'\s*/\s*', serie)) if serie else set()
    bloecke, k = [], 0
    while k < len(items):
        if items[k][0] == 'serie' and (items[k][1] not in KEINE_SERIE or items[k][1] in teile):
            j = k
            while j < len(items) and items[j][0] == 'serie' and (items[j][1] not in KEINE_SERIE or items[j][1] in teile):
                j += 1
            bloecke.append((k, j))
            k = j
        else:
            k += 1
    if not bloecke:
        return items
    wahl = next((b for b in bloecke if any(items[x][1] in teile for x in range(*b))), bloecke[0])
    a, b = wahl
    return items[a:b] + items[:a] + items[b:]


def _zusammen(items):
    if not items:
        return ''
    texte = [t for _, t in items]
    if items[0][0] not in ('serie', 'zahl') and texte[0] and not texte[0][:2].isupper():
        texte[0] = texte[0][0].lower() + texte[0][1:]
    s = ' '.join(AKRONYME.sub(lambda m: m.group(1).upper(), t) if a != 'zitat' else t for (a, _), t in zip(items, texte))
    s = re.sub(r'\s+([,;)])', r'\1', s)
    s = re.sub(r'\(\s+', '(', s)
    s = re.sub(r'\s{2,}', ' ', s).strip()
    return s


def material_hinten(art):
    """True, wenn ein Material nicht direkt hinter dem ersten Wort steht («Beistelltisch mit Schublade Metall»): die ganze Art
    aus arten-en.json stellt es dann falsch, namen_en ordnet es vor das Kernnomen."""
    t = tokens(art)
    return any(w.lower() in MATERIAL and k > 1 and t[k - 1].lower() not in PRAEP and t[k - 1] not in ',;()'
               for k, w in enumerate(t))


def akronyme_gross(text):
    """tv, led, usb, cd, dvd als ganze Woerter gross (Text in «…» bleibt)."""
    teile = re.split(r'([»„"\u201c][^»«„"\u201c\u201d]*[«"\u201c\u201d])', text)
    return ''.join(t if i % 2 else AKRONYME.sub(lambda m: m.group(1).upper(), t) for i, t in enumerate(teile))


def serie_nach_vorn(text, serie=None):
    """Nur die Umstellung des Serienblocks (JYSK), fuer bereits uebersetzte Namen."""
    items = _klassen(text, serie, {}, [])
    return _zusammen(_nach_vorn(items, serie))


def name_en_info(de, shop, serie, woerter, arten):
    """-> (englischer Name, Liste unbekannter Woerter, hat_woerter). hat_woerter False: nur Eigennamen, Zahlen, Zeichen."""
    unbekannt = []
    items = _klassen(de, serie, _vokabular(woerter or {}, arten or {}), unbekannt)
    if shop == 'jysk':
        items = _nach_vorn(items, serie)
    hat = any(a == 'wort' for a, _ in items)
    return _zusammen(items), unbekannt, hat


def name_en(de, shop, serie, woerter, arten, unbekannt=None):
    """Englischer Name. `unbekannt` (Liste oder Counter), falls gegeben, bekommt die unbekannten Woerter."""
    text, unb, _ = name_en_info(de, shop, serie, woerter, arten)
    if unbekannt is not None:
        for w in unb:
            if hasattr(unbekannt, 'update') and not isinstance(unbekannt, list):
                unbekannt.update([w])
            else:
                unbekannt.append(w)
    return text
