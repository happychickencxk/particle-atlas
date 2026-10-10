# PARTICLE ATLAS

Seven monochrome particle studies, with real data and scroll-driven motion.

**Website:** [happychickencxk.github.io/particle-atlas](https://happychickencxk.github.io/particle-atlas/)

FORM → DISTRIBUTION → SCALE → EARTH → TIME → TERRAIN → IDENTITY.

The formed artworks stay as particles. Grains move and shimmer continuously;
the pointer repels them into a small circular opening, with impact and spring
return. Chapter transitions use a thick infinity water stream with waves and
spray. Earth and terrain support drag rotation, buttons and keyboard controls.
Touch keeps native vertical scrolling. Reduced motion, unavailable WebGL and
disabled JavaScript use local fallback artwork.

All data and assets are local, and the site can also be opened directly through
`index.html`. Data snapshots were captured on 2026-10-10; this is not a live feed.

## Edit and rebuild

```sh
npm ci
npm run build
```

The committed `index.html`, `src/style.css`, `assets/atlas.js` and local resource
files are served directly by GitHub Pages. Building and committing changes to
`main` updates the website automatically. No application server or account
backend is needed. Publishing source: `main` / root, with `.nojekyll`.

Source files live in `src/`; frozen snapshots and provenance hashes are in
`data/`. Fonts and dependency licenses are included under `assets/`.

See [sources and credits](docs/SOURCES.md) for image, data and font attribution,
and [deployment instructions](docs/DEPLOYMENT.md) for publishing and updates.
