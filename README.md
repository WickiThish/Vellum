# Vellum

**Read PDFs on warm paper, not blinding white screens.**

Vellum is a 100% client-side web app and PWA that transforms harsh white PDF backgrounds into tactile, eye-comfort paper stocks — softening stark `#000000` black text into deep charcoal and espresso ink while preserving colored charts, links, and diagrams.

Read comfortably right in the browser, or **export a transformed PDF** to take with you to any tablet, laptop, or e-reader.

## Features

- **Four Curated Paper Stocks:**
  - **Kraft Paper** — warm brown paper (`#D8C2A3`) & deep espresso ink (`#2B2017`)
  - **Warm Parchment** — aged vellum (`#F0E4CE`) & warm charcoal ink (`#2E261F`)
  - **Soft Sepia** — gentle amber tone (`#E6D2B2`) & dark walnut ink (`#35261A`)
  - **Dim Slate** — low-glare dark slate (`#1F2227`) & soft warm off-white ink (`#D8D3CA`)
- **Luminance-Based Color & Ink Engine:** Maps white margins to paper and softens harsh black text, while multiplying chromatic elements so embedded charts and photos stay natural.
- **Tactile Fine-Tuning:** Adjust **Paper Fiber Grain**, **Ink Softness**, and **Preserve Colors** live with instant feedback.
- **Export Transformed PDF:** Bake your chosen paper stock and grain into a new `.pdf` file at Standard or High Detail resolution.
- **100% Local & Private:** Powered by `pdfjs-dist` and `pdf-lib` in your browser. Files never leave your device.
- **Focus Mode & Shortcuts:** Press `1`–`4` to switch paper stocks, `O` to compare against the white original, `F` for distraction-free Focus Mode, and `+`/`-` to zoom.
- **PWA Installable:** Install Vellum as a standalone desktop or tablet app.

## Local Development

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

## Deploy to GitHub Pages

This repository includes `.github/workflows/deploy.yml`:

1. Push this repository to GitHub (`main` branch).
2. In your repository settings, go to **Settings → Pages → Build and deployment** and select **GitHub Actions**.
3. Every push to `main` will automatically build and publish Vellum to `https://<your-username>.github.io/<repo-name>/`.

## License

MIT
