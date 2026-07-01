# Decisions

- 2026-07-01: Implemented the first copybook generator as a dependency-free static page (`index.html`, `styles.css`, `script.js`) because the source directory had no existing app framework and the reference DOCX is image-based.
- 2026-07-01: Used browser print-to-PDF with CSS `@page size: A4` for export. This keeps the first version simple and avoids adding a PDF dependency before the layout is validated.
- 2026-07-01: Initially left PDF import visible but disabled as an OCR placeholder; later enabled it for selectable-text PDF import.
- 2026-07-01: Implemented first-pass PDF import with browser-side PDF.js loaded from a pinned CDN URL. This supports PDFs with selectable text and intentionally defers scanned-image OCR.
- 2026-07-01: Updated PDF import to prioritize the `words.pdf` table format from pages 2-31: two side-by-side groups of `序号 / 英文 / 中文` rows per page.
- 2026-07-01: Added browser-side phonetic lookup through the public Dictionary API (`api.dictionaryapi.dev`) and kept it optional through a checkbox plus manual button because large imported ranges can trigger many network requests.
- 2026-07-01: Print page numbering is handled at the A4 page level as `- current/total -` in the footer. Imported word rows do not carry source-page output.
- 2026-07-01: Changed the copybook density to 10 words per A4 page. Each word keeps the model row and uses one tracing row with two gray trace words followed by blank writing space.
- 2026-07-01: Practice trace words are rendered as inline SVG text so their text baseline can align exactly to the light-red writing guide line.
- 2026-07-01: Phonetic lookup now uses Dictionary API first and Datamuse IPA metadata (`md=r&ipa=1`) as a fallback for single English words. Phrases are intentionally skipped.
