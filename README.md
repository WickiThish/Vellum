# Vellum

**Read PDFs comfortably for hours — without harsh white glare or inverted images.**

[![Live Demo](https://img.shields.io/badge/Live_Demo-wickithish.github.io%2FVellum-E3E3E3?style=for-the-badge&labelColor=141414)](https://wickithish.github.io/Vellum/)
[![License: MIT](https://img.shields.io/badge/License-MIT-9A9A9A?style=for-the-badge&labelColor=141414)](./LICENSE)

Vellum is a 100% client-side PDF reader, transformer, and installable PWA designed for multi-hour study sessions on tablets and desktops. It transforms glaring white PDFs into neutral, headache-free reading modes while keeping **embedded photos un-inverted**, **layouts 1:1 intact**, and **exported PDFs 100% native vector text**.

---

## Features

- **Five Neutral, Zero-Glare Reading Modes**
  | Shortcut | Mode | Background | Ink | Designed For |
  | :---: | :--- | :---: | :---: | :--- |
  | `1` | **True Dark** *(default)* | `#0F0F0F` | `#E3E3E3` | Dim / evening study sessions |
  | `2` | **Soft Graphite** | `#232529` | `#D8DADF` | Anti-halation dark reading for multi-hour focus |
  | `3` | **E-Ink Grey** | `#E2E4E7` | `#1A1C1E` | Bright daytime rooms (matte light grey, zero yellow cast) |
  | `4` | **Soft Sage** | `#DFE6E0` | `#1B241E` | Calm daytime reading with an ultra-subtle cool mist |
  | `5` | **OLED Black** | `#000000` | `#D4D4D4` | Zero-emission pure black for OLED/AMOLED screens |
- **Smart Image & Diagram Preservation:** Inspects the PDF's drawing operator list (`page.getOperatorList()`) to keep embedded photos, logos, and diagrams un-inverted, while still transforming full-page black-and-white scanned book pages cleanly.
- **True Vector PDF Export:** Rewrites PDF content-stream color operators directly (`g`/`rg`/`k`/`scn` across page streams and nested Form XObjects) to export **tiny, infinitely sharp, searchable & highlightable PDFs** — plus a High-Res Visual Snapshot fallback for scanned documents.
- **Device-Adaptive Reading UX:**
  - Automatically defaults to **Single-Page Swipe Mode** with thumb-friendly navigation and larger touch targets on tablets & phones, and **Continuous Scroll** on desktops (toggle anytime with `V`).
  - **Fit-to-Width** auto-scaling on open and tablet orientation change, plus **Quick Page Jump** (click the page counter).
  - **True Full-Screen Mode** (`F`) using the browser Fullscreen API.
- **Local Reading Library & Auto-Resume:** Saves opened PDFs privately in IndexedDB and resumes on the exact page and reading mode you left off on.
- **100% Private & Offline-Ready PWA:** Powered locally by `pdfjs-dist` and `pdf-lib`. Files never leave your device, and a Network-First service worker supports offline reading.

---

## Keyboard & Touch Controls

| Control | Action |
| :--- | :--- |
| `1` – `5` | Switch between True Dark, Soft Graphite, E-Ink Grey, Soft Sage, and OLED Black |
| `O` | Toggle Original white PDF for instant before/after comparison |
| `F` | Enter / exit True Full-Screen reading mode |
| `V` | Toggle Single-Page Swipe Mode vs. Continuous Scroll |
| `←` / `→` or **Swipe** | Previous / next page (in Single-Page Mode) |
| `+` / `-` | Zoom in / out (click zoom `%` to reset to Fit Width) |

---

## How It Works

1. **Live Reader (`src/lib/pdfImageMask.ts` + `src/lib/colorTransform.ts`):** Renders pages via PDF.js at super-sampled resolution (`1.75×–2.5×`), extracts embedded raster image bounding boxes from the PDF operator list, caches raw pixels per zoom level for instant preset switching, and applies a text-clarity curve with natural color preservation.
2. **True Vector Exporter (`src/lib/vectorPdfExporter.ts`):** Parses PDF content streams and Form XObjects via `pdf-lib`, safely preserving string literals and inline image payloads while remapping vector colors and prepending a clean background layer.
3. **Local Library (`src/lib/libraryDb.ts`):** Stores PDFs, last-read page numbers, and preferred reading modes locally in IndexedDB.

---

## Local Development

```bash
npm install
npm run dev
```

Build and lint:

```bash
npm run build
npm run lint
```

## License

MIT — see [LICENSE](./LICENSE).
