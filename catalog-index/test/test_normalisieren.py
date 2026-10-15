import importlib.util
import os
import unittest

HIER = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('normalisieren', os.path.join(HIER, '..', 'normalisieren.py'))
n = importlib.util.module_from_spec(spec)
spec.loader.exec_module(n)

FARBEN = {'weiß': '#f4f4f0', 'weiss': '#f4f4f0', 'schwarz': '#222222', 'eiche': '#c8a572', 'grau': '#9a9a9a'}


def masse(b=None, t=None, h=None, l=None, d=None):
    return {'breite_cm': b, 'tiefe_cm': t, 'hoehe_cm': h, 'laenge_cm': l, 'durchmesser_cm': d}


def zeile(url, name, nr, preis, m, farbe='', kat=None, shop='ikea', **kw):
    r = {'shop': shop, 'url': url, 'name': name, 'artikelnummer': nr, 'preis_chf': preis, 'masse': m, 'farbe': farbe,
         'kategorie_pfad': kat or ['Kommoden'], 'ergebnis': 'produkt', 'im_umfang': True}
    r.update(kw)
    return r


def lauf(rows, zuordnung=None, ids=None, kur_ids=(), kur_nrn=()):
    z = zuordnung if zuordnung is not None else {'ikea|Kommoden': {'category': 'dresser', 'model': 'dresser'}}
    ids = {} if ids is None else ids
    return n.normalisiere({'ikea': {r['url']: r for r in rows}}, z, FARBEN, ids, set(kur_ids), set(kur_nrn))


class Masse(unittest.TestCase):
    def test_cm_und_mm(self):
        self.assertEqual(n.berechne_masse('dresser', masse(80, 48, 100), 'X'), {'w': 800, 'd': 480, 'h': 1000})
        self.assertEqual(n.name_dims('Tisch 1200x600 mm'), [1200, 600])
        self.assertEqual(n.name_dims('Tisch 120x60 cm'), [1200, 600])

    def test_tisch_vertauscht(self):
        self.assertEqual(n.berechne_masse('desk', masse(60, 120, 75), 'Schreibtisch 120x60 cm'), {'w': 1200, 'd': 600, 'h': 750})
        self.assertEqual(n.berechne_masse('table', masse(60, 120, 75), 'Tisch 120x60'), {'w': 1200, 'd': 600, 'h': 750})

    def test_bett(self):
        self.assertEqual(n.berechne_masse('bed', masse(b=146, l=211, h=100), 'Bett'), {'w': 1460, 'd': 2110, 'h': 1000})
        self.assertIsNone(n.berechne_masse('bed', masse(b=180, l=200, h=5), 'Boxspringbett mit Topper 5 cm'))

    def test_rund(self):
        self.assertEqual(n.berechne_masse('roundTable', masse(h=75, d=110), 'Tisch'), {'w': 1100, 'd': 1100, 'h': 750})
        self.assertEqual(n.berechne_masse('roundRug', masse(d=150), 'Teppich'), {'w': 1500, 'd': 1500, 'h': 10})

    def test_teppich(self):
        self.assertEqual(n.berechne_masse('rug', masse(b=170, l=240), 'Teppich'), {'w': 1700, 'd': 2400, 'h': 10})

    def test_vorhang(self):
        self.assertEqual(n.berechne_masse('curtain', masse(b=145, l=250), 'Vorhang'), {'w': 1450, 'd': 20, 'h': 2500})

    def test_bereich(self):
        self.assertEqual(n.zahl('106-124'), 106.0)
        self.assertEqual(n.name_dims('Tisch 106-124x60 cm'), [1060, 600])

    def test_fehlt(self):
        self.assertIsNone(n.berechne_masse('dresser', masse(80, None, 100), 'X'))

    def test_tippfehler_im_shop(self):
        self.assertEqual(n.berechne_masse('wardrobe', masse(152, 40, 1945), 'X'), {'w': 1520, 'd': 400, 'h': 1945})
        self.assertTrue(n.masse_korrigiert('wardrobe', masse(152, 40, 1945), 'X'))
        self.assertFalse(n.masse_korrigiert('wardrobe', masse(152, 40, 194), 'X'))
        self.assertIsNone(n.berechne_masse('wardrobe', masse(152, 40, 50000), 'X'))
        self.assertEqual(n.berechne_masse('ledStrip', masse(b=600, t=0.6, h=1), 'X')['w'], 6000)


class Zusammenfuehren(unittest.TestCase):
    def rows(self):
        m = masse(80, 48, 100)
        return [
            zeile('u1', 'MALM Kommode - schwarz 80x48 cm', '100.000.01', 99, m, 'schwarz'),
            zeile('u2', 'MALM Kommode - weiß 80x48 cm', '100.000.02', 89, m, 'weiß'),
            zeile('u3', 'MALM Kommode - grau 80x48 cm', '100.000.03', 89, m, 'grau'),
            zeile('u4', 'MALM Kommode - weiß 120x48 cm', '100.000.04', 129, masse(120, 48, 100), 'weiß'),
        ]

    def test_varianten(self):
        e, b, _, _ = lauf(self.rows())
        self.assertEqual(len(e), 2)
        k = next(x for x in e if x['dims']['w'] == 800)
        self.assertEqual(set(k['colors']), {'#222222', '#f4f4f0', '#9a9a9a'})
        self.assertEqual(k['articleNo'], '100.000.02')  # gleicher Preis, weiss gewinnt
        self.assertEqual(k['url'], 'u2')
        self.assertEqual(k['priceChf'], 89)
        self.assertEqual(k['series'], 'MALM')
        self.assertEqual(b['ikea']['eintraege'], 2)

    def test_id_stabil(self):
        ids = {}
        e1, *_ = lauf(self.rows(), ids=ids)
        e2, *_ = lauf(list(reversed(self.rows())), ids=ids)
        self.assertEqual([x['id'] for x in e1], [x['id'] for x in e2])
        ids2 = {}
        e3, *_ = lauf(self.rows(), ids=ids2)
        self.assertEqual([x['id'] for x in e1], [x['id'] for x in e3])

    def test_kuratiert_vorrang(self):
        e, b, _, _ = lauf(self.rows(), kur_nrn={'10000002'})
        self.assertEqual(b['ikea']['verworfen']['kuratiert'], 1)
        k = next(x for x in e if x['dims']['w'] == 800)
        self.assertEqual(k['articleNo'], '100.000.03')

    def test_id_kollision_mit_kuratiert(self):
        e0, *_ = lauf(self.rows())
        e, *_ = lauf(self.rows(), kur_ids={x['id'] for x in e0})
        self.assertFalse({x['id'] for x in e} & {x['id'] for x in e0})

    def test_aus_und_offen(self):
        z = {'ikea|Kommoden': 'aus'}
        e, b, offen, _ = lauf(self.rows(), zuordnung=z)
        self.assertEqual(e, [])
        self.assertEqual(b['ikea']['verworfen']['aus'], 4)
        e, b, offen, _ = lauf(self.rows(), zuordnung={})
        self.assertEqual(offen[0]['schluessel'], 'ikea|Kommoden')
        self.assertEqual(offen[0]['anzahl'], 4)
        self.assertEqual(len(offen[0]['beispiele']), 3)

    def test_nicht_im_umfang(self):
        r = self.rows()
        r[0]['im_umfang'] = False
        e, b, *_ = lauf(r)
        self.assertEqual(b['ikea']['verworfen']['nicht_im_umfang'], 1)


class Namen(unittest.TestCase):
    def test_ikea(self):
        self.assertEqual(n.ikea_name('LAGKAPTEN / ADILS Schreibtisch - weiß 120x60 cm'),
                         ('LAGKAPTEN / ADILS Schreibtisch 120x60 cm', 'LAGKAPTEN / ADILS', 'weiß'))

    def test_jysk(self):
        self.assertEqual(n.jysk_name('Spiegel RAVNDAL 70x160 Eiche natur', 'Natürliche Eiche', FARBEN),
                         ('Spiegel RAVNDAL 70x160', 'RAVNDAL'))

    def test_tchibo(self):
        self.assertEqual(n.tchibo_art('Offenes Regal Metall »CN3«, all black'), 'regal')
        self.assertEqual(n.tchibo_art('Deckenleuchte mit Textilschirm, 3-flammig'), 'deckenleuchte')
        self.assertEqual(n.tchibo_art('Ovaler Ausziehtisch'), 'ausziehtisch')
        self.assertEqual(n.tchibo_art('LED-Akku-Outdoor-Stehleuchte, salbei'), 'stehleuchte')
        self.assertEqual(n.tchibo_art('Duschregal zum Aufhängen, blau'), 'duschregal')
        self.assertEqual(n.tchibo_art('2,5-Sitzer-Sofa, anthrazit'), 'sofa')
        self.assertEqual(n.tchibo_art('LED-Decken- und Wandleuchte mit Glasschirm'), 'wandleuchte')
        self.assertEqual(n.tchibo_art('Bett- und Couchorganizer'), 'couchorganizer')

    def test_tchibo_leere_art(self):
        r = zeile('t1', '«CN3»', None, 10, masse(), shop='tchibo')
        self.assertEqual(n.tchibo_art(r['name']), '')
        z = {'tchibo|': {'category': 'lamp', 'model': 'wallLamp', 'mount': 'wall'}}
        e, *_ = n.normalisiere({'tchibo': {r['url']: r}}, z, FARBEN, {}, set(), set())
        self.assertEqual(e, [])

    def test_jysk_farbreste(self):
        self.assertEqual(n.jysk_name('Couchtisch ROLSTED 58x58 Eiche natur 2 Stk', 'Natürliche Eiche', FARBEN),
                         ('Couchtisch ROLSTED 58x58 2 Stk', 'ROLSTED'))
        self.assertEqual(n.jysk_name('Schreibtisch LINDVED 48x120 2 Schubladen Eiche dunkel', 'Eiche dunkel', FARBEN)[0],
                         'Schreibtisch LINDVED 48x120 2 Schubladen')

    def test_art_und_englisch(self):
        self.assertEqual(n.art_text('GULLABERG Kommode mit 8 Schubladen 168x48x100 cm', 'GULLABERG'), 'Kommode mit 8 Schubladen')
        self.assertEqual(n.uebersetze('GULLABERG Kommode mit 8 Schubladen', 'Kommode mit 8 Schubladen', {'Kommode mit 8 Schubladen': 'Chest of 8 drawers'}),
                         'GULLABERG Chest of 8 drawers')
        self.assertEqual(n.uebersetze('MALM Kommode', 'Kommode', {'Kommode': 'Dresser'}), 'MALM Dresser')

    def test_ganze_art_unveraendert_und_woerter(self):
        rows = [zeile('u1', 'MALM Kommode - schwarz 80x48 cm', '1', 10, masse(80, 48, 100))]
        e = n.normalisiere({'ikea': {r['url']: r for r in rows}}, {'ikea|Kommoden': {'category': 'dresser', 'model': 'dresser'}},
                           FARBEN, {}, set(), set(), {'Kommode': 'chest of drawers'}, {'kommode': 'andere'})[0]
        self.assertEqual(e[0]['name']['en'], 'MALM chest of drawers 80x48 cm')
        self.assertEqual(n.normalisiere.en_stat['ikea']['gesamt'], 1)
        e = n.normalisiere({'ikea': {r['url']: r for r in rows}}, {'ikea|Kommoden': {'category': 'dresser', 'model': 'dresser'}},
                           FARBEN, {}, set(), set(), {}, {'kommode': 'chest'})[0]
        self.assertEqual(e[0]['name']['en'], 'MALM chest 80x48 cm')

    def test_arten_offen(self):
        lauf(Zusammenfuehren.rows(None))
        self.assertEqual(n.normalisiere.arten_offen, [{'art': 'Kommode', 'anzahl': 4}])

    def test_baum_blaetter(self):
        baum = [{'id': 'a', 'name': 'A', 'subs': [{'id': 'b', 'name': 'B', 'subs': [{'id': 'c', 'name': 'C'}]}, {'id': 'x', 'name': 'X'}]}]
        knoten = [{'id': 'a'}, {'id': 'b'}, {'id': 'c'}]
        self.assertEqual(n.blatt_schluessel(baum, knoten), ['ikea|A > B > C'])


if __name__ == '__main__':
    unittest.main()
