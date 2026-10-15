import importlib.util
import os
import unittest
from collections import Counter

HIER = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('namen_en', os.path.join(HIER, '..', 'namen_en.py'))
ne = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ne)

W = {'grau': 'grey', 'grauer': 'grey', 'stoff': 'fabric', 'kunstleder': 'faux leather', 'relaxsofa': 'recliner sofa',
     'esszimmerstuhl': 'dining chair', 'kerzenständer': 'candle holder', 'kleiderschrank': 'wardrobe',
     'bettgestell': 'bed frame', 'ca.': 'approx.', 'lampe': 'lamp', 'dekorative': 'decorative', 'tisch': 'table',
     'metall': 'metal', 'holz': 'wood', 'garderobe': 'coat rack', 'hohes': 'tall', 'regal': 'shelf unit', 'beistelltisch': 'side table',
     'schublade': 'drawer', 'deckenleuchte': 'ceiling lamp', 'aus': 'made of', 'sch.': 'drawers', 'wilde': 'wild', 'stk': 'pcs',
     'inkl.': 'incl.', 'tv': 'tv', 'bank': 'bench', 'led': 'led', 'modul-sofa': 'modular sofa',
     'spüle': 'sink', 'fronten': 'fronts', 'sch': 'drawers', 'drinnen': 'indoor', 'draußen': 'outdoor', 'pack': 'pack', 'chaise': 'chaise',
     'mit': 'with', 'sofa': 'sofa', 'wand': 'wall', 'wand lampe': 'wall light', 'stühle': 'chairs', 'schubl.': 'drawers'}
A = {'Hocker': 'stool', 'Sessel': 'armchair', 'Zwei Wörter': 'x'}


def en(de, shop='jysk', serie=None, unb=None):
    return ne.name_en(de, shop, serie, W, A, unb)


class Beispiele(unittest.TestCase):
    def test_fuenf(self):
        self.assertEqual(en('Relaxsofa ABILDSKOV grau Stoff Kunstleder'), 'ABILDSKOV recliner sofa grey fabric faux leather')
        self.assertEqual(en('Esszimmerstuhl ADSLEV grauer'), 'ADSLEV dining chair grey')
        self.assertEqual(en('Kerzenständer ADRIAN Ø7xH19cm'), 'ADRIAN candle holder Ø7xH19cm')
        self.assertEqual(en('1-türiger Kleiderschrank, ca. 45 cm breit', 'tchibo'), '1-door wardrobe, approx. 45 cm wide')
        self.assertEqual(en('Bettgestell SAGEBY 100x200'), 'SAGEBY bed frame 100x200')


class Fein(unittest.TestCase):
    def test_material(self):
        self.assertEqual(en('Garderobe Metall »CN3« mit Schublade', 'tchibo'), 'metal coat rack »CN3« with drawer')
        self.assertEqual(en('Hohes Regal Metall', 'tchibo'), 'tall metal shelf unit')
        self.assertEqual(en('Beistelltisch mit Schublade Metall', 'tchibo'), 'metal side table with drawer')
        self.assertEqual(en('Deckenleuchte aus Metall', 'tchibo'), 'ceiling lamp made of metal')
        self.assertEqual(en('Regal, Holz', 'tchibo'), 'shelf unit, wood')
        self.assertEqual(en('Regal Rattan', 'tchibo'), 'Regal Rattan'.replace('Regal', 'shelf unit'))

    def test_abkuerzungspunkt(self):
        self.assertEqual(en('3 Sch. wilde', 'tchibo'), '3 drawers wild')
        self.assertEqual(en('Tisch 2 Stk.', 'tchibo'), 'table 2 pcs.')
        self.assertEqual(en('Tisch inkl. Lampe', 'tchibo'), 'table incl. lamp')

    def test_akronyme(self):
        self.assertEqual(en('Tv Bank led', 'tchibo'), 'TV bench LED')
        self.assertEqual(en('Bank »Led Zeppelin«', 'tchibo'), 'bench »Led Zeppelin«')
        self.assertEqual(ne.akronyme_gross('HAUGA tv bench »tv«'), 'HAUGA TV bench »tv«')


class Fein2(unittest.TestCase):
    def test_teilen(self):
        c = []
        self.assertEqual(en('Spüle/2 Fronten/2Sch.', 'ikea', None, c), 'sink/2 fronts/2 drawers')
        self.assertEqual(en('drinnen/draußen', 'tchibo'), 'indoor/outdoor')
        self.assertEqual(en('3Stk/Pack.', 'tchibo'), '3 pcs/pack')
        self.assertEqual(en('Tisch + Lampe', 'tchibo'), 'table + lamp')
        self.assertEqual(en('KALLAX / LACK PAX/MEHAMN L190/280', 'ikea'), 'KALLAX / LACK PAX/MEHAMN L190/280')
        self.assertEqual(en('Tisch 10cm 2er', 'tchibo', None, c), 'table 10cm 2er')
        self.assertEqual(c, [])

    def test_ganzes_token_vor_zerlegen(self):
        w = dict(W, **{'m/stauraum': 'with storage', 'pouf': 'pouf', 'teddystoff': 'teddy fabric', 'stauraum': 'X'})
        self.assertEqual(ne.name_en('Pouf NYSTED 38x38 m/Stauraum Teddystoff', 'jysk', 'NYSTED', w, A),
                         'NYSTED pouf 38x38 with storage teddy fabric')

    def test_aussen_und_ziffern_mit_slash(self):
        w = dict(W, **{'2er-sitzgruppe': '2-seat seating set', '2er-sitzgruppe/außen': 'FALSCH', '2er-sofa': '2-seater sofa'})
        f = lambda de: ne.name_en(de, 'ikea', 'HAVSTEN', w, A)
        self.assertEqual(f('HAVSTEN / LÅGASKÄR 2er-Sitzgruppe/außen'), 'HAVSTEN / LÅGASKÄR outdoor 2-seat seating set')
        self.assertEqual(f('HAVSTEN 2er-Sofa/außen 179x92x76 cm'), 'HAVSTEN outdoor 2-seater sofa 179x92x76 cm')
        self.assertEqual(f('HAVSTEN Tisch 109/74 80x60/2 L190/280'), 'HAVSTEN table 109/74 80x60/2 L190/280')
        self.assertEqual(f('HAVSTEN drinnen/draußen'), 'HAVSTEN indoor/outdoor')

    def test_pers_ohne_leerzeichen(self):
        self.assertEqual(en('Modul-Sofa LYBY 3Pers chaise'), 'LYBY modular sofa 3-seater chaise')
        self.assertEqual(en('Sofa 3Pers.', 'tchibo'), 'sofa 3-seater')
        self.assertEqual(en('Sofa 4 Pers', 'tchibo'), 'sofa 4-seater')

    def test_material_hinter_mit_gruppe(self):
        self.assertEqual(en('Beistelltisch mit Schublade Metall »CN3«', 'tchibo', 'CN3'), 'metal side table with drawer »CN3«')
        self.assertEqual(en('Beistelltisch mit Schublade Metall »CN3«, orange', 'tchibo', 'CN3'), 'metal side table with drawer »CN3«, orange')
        self.assertTrue(ne.material_hinten('Beistelltisch mit Schublade Metall'))
        self.assertFalse(ne.material_hinten('Kommode Metall mit 2 Schubladen'))
        self.assertFalse(ne.material_hinten('Deckenleuchte aus Metall'))


class Regeln(unittest.TestCase):
    def test_ca_masse(self):
        for de, e in (('hoch', 'high'), ('tief', 'deep'), ('lang', 'long'), ('breit', 'wide')):
            self.assertEqual(en(f'Tisch ca. 2,5 cm {de}', 'ikea'), f'table approx. 2,5 cm {e}')

    def test_personen(self):
        self.assertEqual(en('Sofa 5 Pers.', 'tchibo'), 'sofa 5-seater')
        self.assertEqual(en('Modul-Sofa SKEJBY 5 Pers.'), 'SKEJBY modular sofa 5-seater')
        self.assertEqual(en('Sofa für 5 Pers.', 'tchibo'), 'sofa for 5 people')
        self.assertEqual(en('Sofa für 1 Personen', 'tchibo'), 'sofa for 1 person')
        self.assertEqual(en('Tisch für 6 Personen', 'tchibo'), 'table for 6 people')
        self.assertEqual(en('Tisch für 1 Person', 'tchibo').startswith('table'), True)

    def test_bindestrich(self):
        self.assertEqual(en('2-teiliger Tisch', 'tchibo'), '2-piece table')
        self.assertEqual(en('3-Sitzer Sofa', 'tchibo'), '3-seater sofa')
        self.assertEqual(en('Lampe 3-flammig', 'tchibo'), 'lamp 3-light')
        self.assertEqual(en('2,5-Sitzer Sofa', 'tchibo'), '2,5-seater sofa')
        self.assertEqual(en('1-türige Lampe', 'tchibo'), '1-door lamp')

    def test_serienblock_nach_vorn(self):
        self.assertEqual(en('Sofa GEDVED NORDBY grau'), 'GEDVED NORDBY sofa grey')
        self.assertEqual(en('Sofa grau GEDVED', serie='GEDVED'), 'GEDVED sofa grey')
        self.assertEqual(en('Sofa LED GEDVED', serie='GEDVED'), 'GEDVED sofa LED')
        self.assertEqual(en('ADSLEV Sofa grau'), 'ADSLEV sofa grey')
        self.assertEqual(en('Sofa GEDVED grau', 'ikea'), 'sofa GEDVED grey')
        self.assertEqual(en('Sofa GEDVED grau', 'tchibo'), 'sofa GEDVED grey')

    def test_unbekannt_bleibt_und_zaehlt(self):
        c = Counter()
        self.assertEqual(en('Wickelkommode Sofa Wickelkommode', 'tchibo', None, c), 'Wickelkommode sofa Wickelkommode'.replace('Wickelkommode sofa', 'wickelkommode sofa'))
        self.assertEqual(c['wickelkommode'], 2)
        l = []
        en('Tisch xyz.', 'ikea', None, l)
        self.assertEqual(l, ['xyz'])

    def test_phrase_vor_einzelwort(self):
        self.assertEqual(en('Wand Lampe', 'tchibo'), 'wall light')
        self.assertEqual(en('Wand Tisch', 'tchibo'), 'wall table')

    def test_artenwoerter_und_vorrang(self):
        self.assertEqual(en('Hocker grau', 'ikea'), 'stool grey')
        self.assertEqual(ne.name_en('Hocker', 'ikea', None, {'hocker': 'footstool'}, A), 'footstool')

    def test_zeichen_und_punkt(self):
        self.assertEqual(en('Tisch ( grau ) , Lampe ;', 'tchibo'), 'table (grey), lamp;')
        self.assertEqual(en('Tisch mit 3 Schubl.', 'tchibo'), 'table with 3 drawers')
        self.assertEqual(en('Tisch grau.', 'tchibo'), 'table grey')

    def test_zitate_eigennamen(self):
        c = []
        self.assertEqual(en('Dekorative Lampe »Star Wars« grau', 'tchibo', None, c), 'decorative lamp »Star Wars« grey')
        self.assertEqual(en('Sofa »Thore« mit Tisch', 'tchibo', None, c), 'sofa »Thore« with table')
        self.assertEqual(c, [])
        self.assertEqual(en('Sideboard Metall »CN3« grau', 'tchibo', 'CN3', c), 'metal Sideboard »CN3« grey')
        self.assertEqual(c, ['sideboard'])

    def test_nur_eigennamen(self):
        self.assertFalse(ne.name_en_info('ABILDSKOV 80x200', 'ikea', None, W, A)[2])
        self.assertTrue(ne.name_en_info('Sofa ABILDSKOV', 'ikea', None, W, A)[2])


if __name__ == '__main__':
    unittest.main()
