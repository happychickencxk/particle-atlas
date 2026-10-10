# Path-reveal headings

Each SVG contains real Source Serif 4 filled glyph outlines under an SVG mask. The mask contains wide **centreline pen paths** for every glyph; those paths are clipped naturally by the filled letter outlines. `pathLength="1"`, `stroke-dasharray: 1`, and `stroke-dashoffset: 1` create the initial hidden state.

When inline-injected into the page, use:

```css
.atlas-heading .pen-stroke { stroke-dasharray: 1; stroke-dashoffset: 1; transition: stroke-dashoffset 1.05s cubic-bezier(.22,1,.36,1); }
.atlas-heading.is-revealed .pen-stroke { stroke-dashoffset: 0; }
```

Stagger `.pen-stroke` by index if desired. Do not use these SVGs as external `<img>` files when animation is required: fetch/embed their text into the DOM, or insert the SVG markup directly. Their intrinsic `viewBox` and title remain available offline.
