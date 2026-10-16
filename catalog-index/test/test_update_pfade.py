"""Schalter fuer Zustand und Ausgabe in update.py: Probelaeufe fassen die Standardpfade nicht an."""
import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HIER = Path(__file__).resolve().parent
sys.path.insert(0, str(HIER.parent))
sys.path.insert(0, str(HIER))
import gemeinsam as g  # noqa: E402
import normalisieren as nm  # noqa: E402
import update  # noqa: E402
from test_index import FalscherOpener  # noqa: E402
from test_update import PFAD, SPIEGEL, Antwort, sitemap, vorbereiten  # noqa: E402


def tmp() -> Path:
    return Path(tempfile.mkdtemp())


def schnappschuss() -> dict:
    """Pfad -> (Zeitstempel, Groesse, Inhalt) aller Dateien unter state, out und web/src/lib/catalog."""
    r = {}
    for wurzel in (g.STATE, g.OUT, g.WEB / "src" / "lib" / "catalog"):
        for p in sorted(Path(wurzel).rglob("*")):
            if p.is_file() and "__pycache__" not in p.parts:
                st = p.stat()
                r[str(p)] = (st.st_mtime_ns, st.st_size, p.read_bytes())
    return r


def ruhig(argv):
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        return update.main(argv)


def mit_fake_opener(antworten):
    """index_lauf mit Fake-Opener, ohne Pause und mit eigenem Sperrordner; merkt sich die Aufrufe."""
    echt = update.index_lauf
    aufrufe = []

    def f(modul, **kw):
        aufrufe.append(kw)
        kw.update(opener=FalscherOpener(antworten), lock_dir=tmp(), pause=0.0)
        return echt(modul, **kw)
    return f, aufrufe


class PfadSchalterTest(unittest.TestCase):
    def setUp(self):
        self.vorher = schnappschuss()

    def tearDown(self):
        self.assertEqual(schnappschuss(), self.vorher, "Standardpfade wurden veraendert")

    def test_index(self):
        state, out = tmp() / "neu" / "state", tmp() / "neu" / "out"
        f, _ = mit_fake_opener({**sitemap("a"), PFAD + "a": Antwort(200, SPIEGEL)})
        with mock.patch.object(update, "index_lauf", f):
            ruhig(["index", "--shop", "jysk", "--state", str(state), "--out-dir", str(out)])
        self.assertTrue((state / "jysk.jsonl").exists())
        self.assertTrue((out / "jysk-index.json").exists())

    def test_normalize(self):
        state, out, full = tmp() / "s", tmp() / "o", tmp() / "x" / "full.json"
        out.mkdir()
        (out / "kuratiert.json").write_text(json.dumps([{"id": "x-kur", "articleNo": "999.999.99"}]))
        with mock.patch.object(nm.subprocess, "run", side_effect=OSError("kein Node")):
            code = ruhig(["normalize", "--state", str(state), "--out", str(full), "--out-dir", str(out), "--kuratiert-cache"])
        self.assertEqual(code, 0)
        self.assertTrue(full.exists())
        self.assertTrue((state / "ids.json").exists())
        self.assertTrue((out / "report.json").exists())

    def test_stand(self):
        datei = tmp() / "index.ts"
        datei.write_text("export const CATALOG_PRICES_AS_OF = '2020-01';\n")
        self.assertEqual(ruhig(["stand", "--datum", "2026-10-16", "--out", str(datei)]), 0)
        self.assertIn("'2026-10';", datei.read_text())

    def test_import(self):
        von, state = tmp(), tmp() / "neu" / "state"
        (von / "ids.json").write_text(json.dumps({"a": "b"}))
        (von / "jysk.jsonl").write_text("")
        ruhig(["import", "--von", str(von), "--state", str(state)])
        self.assertEqual(json.loads((state / "ids.json").read_text()), {"a": "b"})


class StandardpfadTest(unittest.TestCase):
    def test_index_standard(self):
        with mock.patch.object(update, "index_lauf", return_value=(0, {"meldung": None, "blockiert": False, "suche_fehler": []})) as m:
            ruhig(["index", "--shop", "jysk"])
        self.assertEqual((m.call_args.kwargs["state"], m.call_args.kwargs["out"]), (g.STATE, g.OUT))

    def test_normalize_standard(self):
        with mock.patch.object(update, "normalize_lauf", return_value=0) as m:
            ruhig(["normalize"])
        self.assertEqual(m.call_args.args[0], g.FULL_JSON)
        self.assertEqual((m.call_args.kwargs["state"], m.call_args.kwargs["out"]), (g.STATE, g.OUT))
        self.assertTrue(m.call_args.kwargs["zustand_schreiben"])

    def test_stand_standard(self):
        with mock.patch.object(update, "setze_stand", return_value=0) as m:
            ruhig(["stand", "--datum", "2026-10-16"])
        self.assertEqual(m.call_args.args[0], g.INDEX_TS)

    def test_import_standard(self):
        with mock.patch.object(update, "import_lauf", return_value=0) as m:
            ruhig(["import", "--von", "x"])
        self.assertEqual(m.call_args.kwargs["state"], g.STATE)

    def test_normalize_regel_zustand(self):
        def schreibt(argv):
            with mock.patch.object(update, "normalize_lauf", return_value=0) as m:
                ruhig(["normalize", *argv])
            return m.call_args.kwargs["zustand_schreiben"], m.call_args.kwargs["state"]
        self.assertEqual(schreibt([]), (True, g.STATE))
        self.assertEqual(schreibt(["--out", str(g.FULL_JSON)]), (True, g.STATE))
        self.assertEqual(schreibt(["--out", "/x/full.json"]), (False, g.STATE))
        self.assertEqual(schreibt(["--out", "/x/full.json", "--out-dir", "/x/o"]), (False, g.STATE))
        self.assertEqual(schreibt(["--out", "/x/full.json", "--state", "/x/s"]), (True, Path("/x/s")))
        self.assertEqual(schreibt(["--state", "/x/s"]), (True, Path("/x/s")))


if __name__ == "__main__":
    unittest.main()
