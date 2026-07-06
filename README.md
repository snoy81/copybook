# English Copybook and Word Reader

This project is a static browser app for making English vocabulary practice materials from a PDF word list.

It includes two pages:

- `index.html` - A4 English copybook generator with handwriting guide lines and print-to-PDF export.
- `vocabulary.html` - PDF vocabulary reader that shows words, Chinese translations, phonetics, and tap-to-play British pronunciation.

No build step or server framework is required. The app is plain HTML, CSS, and JavaScript.

## Features

### Copybook Generator

- Import selectable-text PDFs and extract English words with Chinese translations.
- Supports the included `words.pdf` table layout.
- Choose PDF page ranges before import.
- Automatically fetch phonetics for single English words.
- Generate A4 copybook pages with 10 words per page.
- Export through the browser print dialog as an A4 PDF.

### Vocabulary Reader

- Import a PDF and keep words ordered by PDF serial number when available.
- Preview PDF pages in the left panel to help choose page ranges.
- Display each word with Chinese translation and phonetic text.
- Tap or click a word to play pronunciation.
- Prefers British dictionary audio; falls back to browser speech synthesis with `en-GB`.
- Responsive layout for Windows, MacBook, and iPad browsers.

## How to Use

Open the pages directly in a browser:

- Copybook: `index.html`
- Word reader: `vocabulary.html`

For best compatibility with PDF.js module loading, run a local static server:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://127.0.0.1:8000/index.html
http://127.0.0.1:8000/vocabulary.html
```

## PDF Import Notes

The app reads selectable text from PDFs. It does not perform OCR.

If a PDF is scanned or image-only, the import will not find words. Convert it to a text-based PDF first, or add OCR before importing.

The included `words.pdf` has a two-column vocabulary table with serial numbers, English words, and Chinese translations. The reader uses those serial numbers to restore the intended word order.

## Online Services

The browser loads PDF.js from jsDelivr:

```text
https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/
```

Phonetics and pronunciation metadata are fetched from:

```text
https://api.dictionaryapi.dev/
https://api.datamuse.com/
```

The vocabulary reader only uses dictionary audio when it detects a British/UK audio URL. Otherwise it falls back to the device browser's `en-GB` speech synthesis voice.

## Deploy to GitHub Pages

1. Push this repository to GitHub.
2. Open the repository settings.
3. Go to `Pages`.
4. Set source to `Deploy from a branch`.
5. Choose branch `main` and folder `/root`.
6. Save and wait for GitHub Pages to publish.

The site URL should look like:

```text
https://snoy81.github.io/copybook/
```

Useful direct links:

```text
https://snoy81.github.io/copybook/index.html
https://snoy81.github.io/copybook/vocabulary.html
```

On iPad, open the `vocabulary.html` page in Safari, then use Share -> Add to Home Screen.

## Project Files

- `index.html`, `styles.css`, `script.js` - Copybook generator.
- `vocabulary.html`, `vocabulary.css`, `vocabulary.js` - Vocabulary reader.
- `words.pdf` - Example PDF vocabulary source.
- `house_words_red_trace_copybook.docx` - Original copybook style reference.
- `handwriting-chart.pdf` and screenshots - Handwriting/layout references.

## Limitations

- PDF import requires selectable text.
- Phonetic lookup requires network access.
- Browser print settings must preserve backgrounds/print color for best PDF output.
- Speech quality depends on browser and device voice support, especially on iPad.
