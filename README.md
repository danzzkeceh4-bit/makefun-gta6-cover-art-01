# Vice Cover Studio

[![make.fun](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/c/gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/danzzkeceh4-bit/makefun-gta6-cover-art-01/rank.svg)](https://make.fun/c/gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/danzzkeceh4-bit/makefun-gta6-cover-art-01/reward.svg)](https://make.fun/c/gta6-cover-art-01)

**Vice Cover Studio** turns a photo and a caption into GTA 6-style poster
cover art, right in the browser — no upload, no account, no network at all.

## What it does

- **Photos stay on your machine** — drag & drop or pick several photos; they
  are read locally and never uploaded anywhere.
- **Six multi-panel poster layouts** — Hero, Split-V, Split-H, Trio, Quad and
  a diagonal Slash split. Fill several panels with one photo in different
  crops, or put a different photo in each panel.
- **Crop and position per panel** — click a panel to select it, drag to pan,
  scroll or use the slider to zoom, one button to reset the fill. Arrow keys
  nudge the crop too.
- **Bold caption lettering** — a huge condensed title with a black outline,
  drop shadow and a slight tilt, plus an editable subtitle and footer line.
- **Colour grades** — Sunset (warm orange-pink-purple), Neon (magenta/cyan),
  Noir (high-contrast black & white) and Original, finished with a vignette
  and a touch of film grain.
- **Export PNG** — 1920 × 1080, 1080 × 1080 or 1080 × 1350, ready to post.

## Try it

Serve `app/` with any static server and open `index.html`:

```sh
python3 -m http.server 8080 --directory app
```

Then open http://localhost:8080 — a finished-looking cover (sample photo,
Trio layout, Sunset grade) is already on screen. Add your own photo, pick a
layout and grade, edit the caption, hit **Export PNG**.

Deterministic views for screenshots and testing: `?shot=cover&size=landscape|square|portrait&layout=...&grade=...`
renders a full-bleed cover, `?shot=editor` shows the editor, and `?selftest=1`
renders the export pipeline headlessly and prints `SELFTEST OK <bytes>`.

## Original work

The lettering uses [Anton](app/fonts/Anton-Regular.ttf) (SIL Open Font
License, see `app/fonts/OFL.txt`). The two sample photos under `app/samples/`
were made with an image model for make.fun and are free to use. No Rockstar
Games logo, wordmark, artwork or font is used anywhere.

## License

MIT — see [LICENSE](LICENSE).
