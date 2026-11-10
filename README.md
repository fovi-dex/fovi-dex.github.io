# FOVI-Dex

Static website for Foveated perception for dexterous manipulation.
Dex Manipulation Workshop, CoRL 2026, Austin TX, USA.

## Files

- `index.html`: complete website, figures, and trial selection.
- Root JavaScript/CSS: interactive charts, calibrated sampling, WebGL rendering, playback, layout, and loading/version checks.
- `assets/paper.pdf`: unchanged camera-ready paper.
- `assets/fovi-dex-explainer.*` and transcript: film, poster, captions, and transcript.
- `assets/videos/`: only the foveated trial clips and their posters shown on the page.
- Other `assets/`: displayed figures/images, plotting observations, rendering meshes, and fonts with their dependency licenses.
- `site-version.json`: browser asset hashes and release identity.
- `release-files.json`: complete file inventory with checksums.
- `.nojekyll`: serve these static files without Jekyll.

## Preview

Run `python3 -m http.server 8000` from this directory, then open http://localhost:8000/. No build or package installation is needed.

## Publishing

Intended repository: `fovi-dex/fovi-dex.github.io`. After the repository is created and the reviewed files are committed and pushed, select Settings → Pages → Deploy from a branch → main → /(root). No custom domain is needed. See the [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

This distribution contains real media files, not Git LFS pointers. It excludes raw training exports, capture recipes, archived recordings, private service links, and manuscript sources. It is generated from the maintained authoring repository; update that source and regenerate before replacing this distribution.
