# roomx

Capture rooms, build them in 3D, furnish them. Local-first PWA with an optional sync server.

- **Dev:** `pnpm -C web install && pnpm -C web dev`
- **Checks:** `pnpm -C web check && pnpm -C web test && pnpm -C web test:e2e`
- **Build:** `pnpm -C web build` (static output in `web/build`)
- **Server:** `cd server && python -m venv .venv && .venv/bin/pip install -e '.[dev]' && .venv/bin/uvicorn app.main:app`
- **Deploy:** `cp deploy/.env.example deploy/.env`, set `ROOMX_TOKEN`, then `docker compose -f deploy/compose.yaml up -d --build`
- **GitHub Pages:** every push to `main` publishes the app to `https://<user>.github.io/roomx/` (no server, no sync)
- **iPad:** open the HTTPS address in Safari, tap Share, then "Add to Home Screen"
