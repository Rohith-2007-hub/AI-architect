# HomeBrief

A mobile-first pre-architect planning and 2D floor plan generator for homeowners.

HomeBrief guides you from raw plot details to a dimensioned, multi-floor 2D presentation floor plan — no architecture software skills required. Enter your requirements, shape your plot boundary interactively to match your exact land area, and generate a practical concept brief ready to discuss with a licensed architect.

## Features

- **3-Step Guided Flow** — `1. Land Details` → `2. Match Plot Shape` → `3. 2D Floor Plan` with persistent state when navigating back and forth.
- **5 Building Types** — Dedicated architectural layouts for `Independent House`, `Duplex House`, `Luxury Villa`, `Commercial + Residential`, and `Rental Apartments (Multi-Unit)` — each with `Option A` and `Option B` variations.
- **Interactive Plot Editor** — Fixed-scale grid workspace (10 ft major / 5 ft minor gridlines), road strip(s), North compass, shape presets (`Square`, `Standard Rectangle`, `Deep Plot`, `Tapered / Irregular`), mouse & touch corner/edge dragging, smooth `Length (ft)` & `Width (ft)` inputs/sliders, Shoelace area matching, and one-click `Auto-Fit to Exact Area`.
- **Presentation 2D Floor Plan Renderer** — Clean homeowner-friendly presentation floor plans with solid 9" exterior and 4.5" interior walls broken at openings, 90° door swing arcs, triple-line exterior windows, open road-facing driveways/shutters, soft room color fills, proportional minimalist furniture, zoom/fullscreen viewer controls, and a clean Plan Summary bar.
- **Planning Knowledge & Exports** — Space efficiency summary, construction cost estimate (±10% range + trade breakdown), sunlight & ventilation notes, 5 tailored questions for your architect, and one-click `SVG`, `PNG`, and A4 `PDF` exports via `html2pdf.js`.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Markup | HTML5 |
| Styling | CSS3 (mobile-first, responsive) |
| Logic | Modular Vanilla JavaScript (ES6+) |
| PDF Export | [html2pdf.js](https://github.com/eKoopmans/html2pdf.js) via CDN |
| Backend | **None** — runs 100% client-side in the browser |

## Getting Started

1. **Serve locally**

   ```bash
   python -m http.server 8000
   ```

2. **Open in your browser**

   Navigate to `http://localhost:8000`

> No build step, no `npm install`, no API keys required.

## File Structure

```text
HomeBrief/
├── index.html           # Entry point & 3-step guided UI
├── styles.css           # Mobile-first responsive styles & print rules
├── js/
│   ├── plotEditor.js    # Interactive scaled land grid & Shoelace area matcher
│   ├── layoutEngine.js  # Parametric spatial solver for all 5 building types
│   ├── planRenderer.js  # Presentation 2D architectural SVG renderer
│   └── app.js           # UI state, 3-step flow, cost math & SVG/PNG/PDF exports
├── .gitignore
└── README.md
```

## Disclaimer

Educational concept plan only. Not a structural drawing or municipal approval plan. Consult a licensed architect or structural engineer before construction.

## License

MIT
