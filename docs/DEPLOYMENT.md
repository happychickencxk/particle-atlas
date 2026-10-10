# GitHub Pages deployment

- Repository: https://github.com/happychickencxk/particle-atlas
- Website: https://happychickencxk.github.io/particle-atlas/
- Publishing source: branch `main`, folder `/`.
- `.nojekyll` disables Jekyll processing; this is an already-built static site.
- HTTPS is enabled through GitHub Pages.

## Updating the website

Edit the sources, run `npm ci` once, then `npm run build`. Commit the changed
source and built files, and push `main`. GitHub Pages publishes the new commit.
The build preserves the relative resource URLs required by the repository's
`/particle-atlas/` URL prefix and by direct local opening.

This repository contains the website, editable source, frozen public data,
attribution and licenses. Local browser diagnostics, machine-specific test
reports, temporary backups and credentials are excluded.

If updating from the separate offline edition, copy its rebuilt `index.html`,
`assets/`, `data/`, `src/`, package files and build scripts into this repository,
keeping `.git/` and `.nojekyll` in place. Commit and push after checking the site.

## A custom domain later

Keep this free address unless you already own another domain. To change it,
configure the domain in repository Settings → Pages, then add the appropriate
DNS records at your domain provider and wait for certificate approval. Domain
registration and DNS are separate from this deployment.

Official documentation:
- https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
