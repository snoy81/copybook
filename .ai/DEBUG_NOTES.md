# Debug Notes

- 2026-07-01: `.ai` files were absent at task start, so shared project context could not be read before implementation.
- 2026-07-01: `.git` exists as an empty directory in this environment. `git status --short` returns `fatal: not a git repository (or any of the parent directories): .git`.
- 2026-07-01: `house_words_red_trace_copybook.docx` stores A4 pages as embedded PNG files. `word/media/image1.png` is `2480 x 3508`, matching 300 DPI A4.
- 2026-07-01: Browser PDF export may omit CSS background gradients when print backgrounds are disabled. Writing guide lines were changed from background gradients to real dashed border elements.
- 2026-07-01: PDF import depends on runtime network access to `cdn.jsdelivr.net` for `pdfjs-dist@4.10.38`. It extracts selectable text only; scanned/image PDFs currently return a user-facing OCR-needed message.
- 2026-07-01: `words.pdf` has 34 pages. Pages 2-31 contain vocabulary tables with `DayN` headers and two side-by-side `序号 / 英文 / 中文` column groups. The source table has no phonetic column.
- 2026-07-01: Phonetic lookup depends on runtime browser access to `https://api.dictionaryapi.dev/api/v2/entries/en/<word>`. Lookup failures leave the phonetic field empty and do not block copybook generation.
- 2026-07-01: The apparent gap between duplicate trace words was caused by each SVG having a fixed width, not by the flex `gap`. Trace SVG width is now estimated per word length.
- 2026-07-01: SVG trace words also need explicit `width`, `min-width`, and `max-width`; otherwise the browser may preserve the SVG intrinsic width and keep a visible gap.
- 2026-07-01: Missing phonetics can happen when Dictionary API returns no `phonetic`/`phonetics.text` for a word, especially inflected forms. The fallback uses Datamuse `pron:` IPA metadata for single-word entries.
- 2026-07-01: Datamuse can still return ARPABET symbols like `HH AO1 R S` despite requesting `ipa=1`. These must be detected and converted to IPA instead of being wrapped directly in slashes.
