const WORDS_PER_PAGE = 10;
const PRACTICE_ROWS = 1;
const WRITING_LINES = 4;
const TRACE_WORDS_PER_ROW = 2;
const PDFJS_VERSION = "4.10.38";
const PDFJS_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`;
const PDFJS_WORKER_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
const DICTIONARY_API_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const DATAMUSE_API_URL = "https://api.datamuse.com/words";
const IMPORT_STOP_WORDS = new Set(["copybook", "english", "model", "word", "words"]);
const SVG_NS = "http://www.w3.org/2000/svg";
const ARPABET_IPA = {
  AA: "ɑ",
  AE: "æ",
  AH: "ə",
  AO: "ɔ",
  AW: "aʊ",
  AY: "aɪ",
  B: "b",
  CH: "tʃ",
  D: "d",
  DH: "ð",
  EH: "ɛ",
  ER: "ər",
  EY: "eɪ",
  F: "f",
  G: "ɡ",
  HH: "h",
  IH: "ɪ",
  IY: "i",
  JH: "dʒ",
  K: "k",
  L: "l",
  M: "m",
  N: "n",
  NG: "ŋ",
  OW: "oʊ",
  OY: "ɔɪ",
  P: "p",
  R: "r",
  S: "s",
  SH: "ʃ",
  T: "t",
  TH: "θ",
  UH: "ʊ",
  UW: "uː",
  V: "v",
  W: "w",
  Y: "j",
  Z: "z",
  ZH: "ʒ",
};
const ARPABET_VOWELS = new Set([
  "AA",
  "AE",
  "AH",
  "AO",
  "AW",
  "AY",
  "EH",
  "ER",
  "EY",
  "IH",
  "IY",
  "OW",
  "OY",
  "UH",
  "UW",
]);

let pdfJsPromise;
let currentPdfFile;
let currentPdfPageCount = 1;
let importRequestId = 0;
let importDebounceTimer;

const els = {
  title: document.querySelector("#titleInput"),
  subtitle: document.querySelector("#subtitleInput"),
  words: document.querySelector("#wordsInput"),
  pages: document.querySelector("#pages"),
  pdf: document.querySelector("#pdfInput"),
  pageFrom: document.querySelector("#pageFromInput"),
  pageTo: document.querySelector("#pageToInput"),
  autoPhonetics: document.querySelector("#autoPhoneticsInput"),
  importStatus: document.querySelector("#importStatus"),
  generate: document.querySelector("#generateBtn"),
  print: document.querySelector("#printBtn"),
  phonetics: document.querySelector("#phoneticsBtn"),
  pageTemplate: document.querySelector("#pageTemplate"),
  wordTemplate: document.querySelector("#wordTemplate"),
};

function splitLine(line) {
  const rawParts = line.split(/[,，\t|]/).map((part) => part.trim());
  const phoneticIndex = rawParts.findIndex((part) => isPhonetic(part));

  return {
    word: rawParts[0] || "",
    translation: rawParts[1] || "",
    phonetic: phoneticIndex >= 0 ? rawParts[phoneticIndex] : "",
  };
}

function parseWords(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(splitLine)
    .filter((entry) => entry.word);
}

function chunk(entries, size) {
  const pages = [];
  for (let index = 0; index < entries.length; index += size) {
    pages.push(entries.slice(index, index + size));
  }
  return pages;
}

function setImportStatus(message, type = "") {
  els.importStatus.textContent = message;
  els.importStatus.className = `import-status ${type}`.trim();
}

function isPhonetic(value) {
  return /^\/.+\/$/.test(value) || /^\[.+\]$/.test(value);
}

function getImportPageRange() {
  const from = clampPageNumber(els.pageFrom.value, 1, currentPdfPageCount);
  const to = clampPageNumber(els.pageTo.value, from, currentPdfPageCount);
  return { from, to };
}

function clampPageNumber(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(Math.max(parsed, min), max);
}

async function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import(PDFJS_URL).then((pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return pdfjsLib;
    });
  }

  return pdfJsPromise;
}

function groupTextItemsIntoLines(items) {
  const lines = [];
  const sortedItems = [...items].sort((a, b) => {
    const yDiff = b.transform[5] - a.transform[5];
    return Math.abs(yDiff) > 2 ? yDiff : a.transform[4] - b.transform[4];
  });

  sortedItems.forEach((item) => {
    const text = item.str.trim();
    if (!text) return;

    const x = item.transform[4];
    const y = item.transform[5];
    let line = lines.find((candidate) => Math.abs(candidate.y - y) <= 2);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push({ x, text });
  });

  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) =>
      line.items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);
}

async function getPdfDocument(file) {
  const pdfjsLib = await loadPdfJs();
  const data = await file.arrayBuffer();
  return pdfjsLib.getDocument({ data }).promise;
}

async function extractPdfLines(file, firstPage = 1, lastPage = currentPdfPageCount) {
  const pdf = await getPdfDocument(file);
  const lines = [];
  const { from, to } = normalizePdfPageRange(firstPage, lastPage, pdf.numPages);

  for (let pageNumber = from; pageNumber <= to; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    lines.push(...groupTextItemsIntoLines(textContent.items));
  }

  return lines;
}

async function getPdfPageCount(file) {
  const pdf = await getPdfDocument(file);
  return pdf.numPages;
}

async function extractPdfTableEntries(file, firstPage, lastPage) {
  const pdf = await getPdfDocument(file);
  const entries = [];
  const { from, to } = normalizePdfPageRange(firstPage, lastPage, pdf.numPages);

  for (let pageNumber = from; pageNumber <= to; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    entries.push(...extractWordsPdfPageEntries(textContent.items));
  }

  return entries;
}

function normalizePdfPageRange(firstPage, lastPage, pageCount) {
  const from = clampPageNumber(firstPage, 1, pageCount);
  const to = clampPageNumber(lastPage, from, pageCount);
  return { from, to };
}

function extractWordsPdfPageEntries(items) {
  const bands = [];
  const positionedItems = items
    .map((item) => ({
      text: item.str.replace(/\s+/g, " ").trim(),
      x: item.transform[4],
      y: item.transform[5],
      width: item.width || 0,
    }))
    .filter((item) => item.text);

  positionedItems.forEach((item) => {
    let band = bands.find((candidate) => Math.abs(candidate.y - item.y) <= 3);
    if (!band) {
      band = { y: item.y, items: [] };
      bands.push(band);
    }
    band.items.push(item);
  });

  return bands
    .sort((a, b) => b.y - a.y)
    .flatMap((band) => [
      parseWordsPdfTableCell(band.items.filter((item) => item.x < 300)),
      parseWordsPdfTableCell(band.items.filter((item) => item.x >= 300)),
    ])
    .filter(Boolean);
}

function parseWordsPdfTableCell(items) {
  if (!items.length) return null;

  const sortedItems = [...items].sort((a, b) => a.x - b.x);
  const hasSerialNumber = sortedItems.some((item) => /^\d+$/.test(item.text));
  const chinese = sortedItems
    .filter((item) => /[\u3400-\u9fff]/.test(item.text))
    .map((item) => item.text)
    .join("");
  const englishItems = sortedItems.filter(
    (item) => /[A-Za-z]/.test(item.text) && !/day/i.test(item.text)
  );

  if (!englishItems.length || (!hasSerialNumber && !chinese)) return null;

  const word = normalizeImportedWord(joinEnglishFragments(englishItems));
  if (!word || word.length < 2) return null;
  return { word, translation: chinese, phonetic: "" };
}

function joinEnglishFragments(items) {
  return items
    .sort((a, b) => a.x - b.x)
    .reduce((result, item, index, sortedItems) => {
      if (index === 0) return item.text;

      const previous = sortedItems[index - 1];
      const gap = item.x - (previous.x + previous.width);
      const separator = gap > 5 ? " " : "";
      return `${result}${separator}${item.text}`;
    }, "");
}

function normalizeImportedWord(word) {
  return word
    .replace(/^[^A-Za-z]+|[^A-Za-z'-]+$/g, "")
    .replace(/[’]/g, "'")
    .trim();
}

function parseImportedLineWithMeta(line) {
  const phoneticMatch = line.match(/(\/[^/]{1,80}\/|\[[^\]]{1,80}\])/);
  const phonetic = phoneticMatch ? phoneticMatch[1].trim() : "";
  const chinese = [...line.matchAll(/[\u3400-\u9fff]+/g)]
    .map((match) => match[0])
    .join("");
  const wordMatch = line.match(/[A-Za-z][A-Za-z'-]*/);
  const word = wordMatch ? normalizeImportedWord(wordMatch[0]) : "";

  if (!word || word.length < 2) return null;
  return { word, translation: chinese, phonetic };
}

function extractEntriesFromLine(line) {
  if (/[\u3400-\u9fff]/.test(line) || /\/[^/]{1,80}\/|\[[^\]]{1,80}\]/.test(line)) {
    const parsed = parseImportedLineWithMeta(line);
    return parsed ? [parsed] : [];
  }

  return [...line.matchAll(/[A-Za-z][A-Za-z'-]*/g)]
    .map((match) => normalizeImportedWord(match[0]))
    .filter((word) => word.length >= 2)
    .map((word) => ({ word, translation: "", phonetic: "" }));
}

function extractEntriesFromPdfLines(lines) {
  return lines.flatMap(extractEntriesFromLine);
}

function extractUniqueEntries(entries) {
  const seen = new Set();
  const uniqueEntries = [];

  entries.forEach((entry) => {
    const key = entry.word.toLowerCase();
    if (seen.has(key) || IMPORT_STOP_WORDS.has(key)) return;

    seen.add(key);
    uniqueEntries.push(entry);
  });

  return uniqueEntries;
}

function serializeEntries(entries) {
  return entries
    .map((entry) => {
      const parts = [entry.word];
      if (entry.translation || entry.phonetic) parts.push(entry.translation);
      if (entry.phonetic) parts.push(entry.phonetic);
      return parts.join(", ");
    })
    .join("\n");
}

function getBestPhonetic(dictionaryEntries) {
  for (const entry of dictionaryEntries || []) {
    if (isPhonetic(entry.phonetic || "")) return entry.phonetic;
    const phonetic = (entry.phonetics || []).find((item) => isPhonetic(item.text || ""));
    if (phonetic) return phonetic.text;
  }
  return "";
}

function isSingleEnglishWord(word) {
  return /^[A-Za-z]+(?:'[A-Za-z]+)?$/.test(word.trim());
}

function stripPhoneticWrapper(value) {
  return String(value || "")
    .trim()
    .replace(/^[/[]|[/\]]$/g, "")
    .trim();
}

function parseArpabetTokens(value) {
  const rawTokens = stripPhoneticWrapper(value).split(/\s+/).filter(Boolean);
  if (!rawTokens.length) return [];

  const parsedTokens = rawTokens.map((token) => {
    const match = token.match(/^([A-Z]+)([012])?$/);
    if (!match || !ARPABET_IPA[match[1]]) return null;
    return {
      phoneme: match[1],
      stress: match[2] || "",
    };
  });

  return parsedTokens.every(Boolean) ? parsedTokens : [];
}

function isArpabetPhonetic(value) {
  return parseArpabetTokens(value).length > 0;
}

function convertArpabetToIpa(value) {
  const tokens = parseArpabetTokens(value);
  if (!tokens.length) return "";

  const pieces = tokens.map((token) => {
    let ipa = ARPABET_IPA[token.phoneme];
    if (token.phoneme === "AH" && token.stress === "1") ipa = "ʌ";
    return {
      ipa,
      stress: token.stress,
      isVowel: ARPABET_VOWELS.has(token.phoneme),
    };
  });

  pieces.forEach((piece, index) => {
    if (!piece.isVowel || !piece.stress || piece.stress === "0") return;

    const stressMark = piece.stress === "1" ? "ˈ" : "ˌ";
    let insertIndex = index;
    while (insertIndex > 0 && !pieces[insertIndex - 1].isVowel) {
      insertIndex -= 1;
    }
    pieces[insertIndex].ipa = `${stressMark}${pieces[insertIndex].ipa}`;
  });

  return `/${pieces.map((piece) => piece.ipa).join("")}/`;
}

function normalizePhonetic(value) {
  const phonetic = String(value || "").trim();
  if (!phonetic) return "";
  const ipaFromArpabet = convertArpabetToIpa(phonetic);
  if (ipaFromArpabet) return ipaFromArpabet;
  if (isPhonetic(phonetic)) return phonetic;
  return `/${phonetic}/`;
}

async function fetchDictionaryPhonetic(word) {
  const response = await fetch(`${DICTIONARY_API_URL}${encodeURIComponent(word)}`);
  if (!response.ok) return "";
  return getBestPhonetic(await response.json());
}

async function fetchDatamusePhoneticByQuery(queryKey, word) {
  const params = new URLSearchParams({
    [queryKey]: word,
    qe: queryKey,
    md: "r",
    ipa: "1",
    max: "1",
  });
  const response = await fetch(`${DATAMUSE_API_URL}?${params.toString()}`);
  if (!response.ok) return "";

  const [result] = await response.json();
  const pronTag = (result?.tags || []).find((tag) => tag.startsWith("pron:"));
  return normalizePhonetic(pronTag ? pronTag.slice(5) : "");
}

async function fetchDatamusePhonetic(word) {
  let spellingPhonetic = "";
  try {
    spellingPhonetic = await fetchDatamusePhoneticByQuery("sp", word);
  } catch (error) {
    console.warn(`Datamuse spelling phonetic lookup failed for ${word}`, error);
  }
  if (spellingPhonetic) return spellingPhonetic;

  try {
    return await fetchDatamusePhoneticByQuery("sl", word);
  } catch (error) {
    console.warn(`Datamuse sounds-like phonetic lookup failed for ${word}`, error);
    return "";
  }
}

async function fetchPhonetic(word) {
  if (!isSingleEnglishWord(word)) return "";

  let dictionaryPhonetic = "";
  try {
    dictionaryPhonetic = normalizePhonetic(await fetchDictionaryPhonetic(word));
  } catch (error) {
    console.warn(`Dictionary phonetic lookup failed for ${word}`, error);
  }
  if (dictionaryPhonetic) return dictionaryPhonetic;

  return fetchDatamusePhonetic(word.toLowerCase());
}

function countMissingSingleWordPhonetics(entries) {
  return entries.filter((entry) => needsPhoneticRefresh(entry)).length;
}

function needsPhoneticRefresh(entry) {
  return (
    isSingleEnglishWord(entry.word) &&
    (!entry.phonetic || isArpabetPhonetic(entry.phonetic))
  );
}

async function enrichEntriesWithPhonetics(entries, requestId = importRequestId) {
  const enrichedEntries = entries.map((entry) => ({ ...entry }));
  const missingEntries = enrichedEntries.filter((entry) => needsPhoneticRefresh(entry));
  if (!missingEntries.length) return enrichedEntries;

  for (let index = 0; index < missingEntries.length; index += 1) {
    if (requestId !== importRequestId) return enrichedEntries;

    const entry = missingEntries[index];
    setImportStatus(`Fetching phonetics ${index + 1}/${missingEntries.length}: ${entry.word}...`);
    try {
      entry.phonetic = await fetchPhonetic(entry.word);
    } catch (error) {
      console.warn(`Phonetic lookup failed for ${entry.word}`, error);
    }
    els.words.value = serializeEntries(enrichedEntries);
    render();
  }

  return enrichedEntries;
}

function createPracticeRow(word) {
  const row = document.createElement("div");
  row.className = "practice-row";

  const lines = document.createElement("div");
  lines.className = "writing-lines";
  for (let lineIndex = 1; lineIndex <= WRITING_LINES; lineIndex += 1) {
    const line = document.createElement("span");
    line.className = "writing-line";
    line.dataset.line = String(lineIndex);
    lines.append(line);
  }

  const trace = document.createElement("span");
  trace.className = "trace-words";
  for (let traceIndex = 0; traceIndex < TRACE_WORDS_PER_ROW; traceIndex += 1) {
    trace.append(createTraceWord(word));
  }

  row.append(lines, trace);
  return row;
}

function createTraceWord(word) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("trace-word");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("x", "0");
  text.setAttribute("y", "61%");
  text.textContent = word;
  svg.append(text);

  return svg;
}

function createWordBlock(entry, wordIndex) {
  const fragment = els.wordTemplate.content.cloneNode(true);
  const block = fragment.querySelector(".word-block");

  block.querySelector(".word-index").textContent = `${wordIndex}.`;
  block.querySelector(".model-word").textContent = entry.word;
  block.querySelector(".translation").textContent = entry.translation;
  block.querySelector(".phonetic").textContent = entry.phonetic;

  const rows = block.querySelector(".practice-rows");
  for (let index = 1; index <= PRACTICE_ROWS; index += 1) {
    rows.append(createPracticeRow(entry.word));
  }

  return block;
}

function render() {
  const entries = parseWords(els.words.value);
  const pageGroups = chunk(entries, WORDS_PER_PAGE);
  const totalPages = pageGroups.length;
  els.pages.textContent = "";

  pageGroups.forEach((group, pageIndex) => {
    const fragment = els.pageTemplate.content.cloneNode(true);
    const page = fragment.querySelector(".copybook-page");
    page.querySelector("h2").textContent = els.title.value.trim();
    page.querySelector("p").textContent = els.subtitle.value.trim();
    page.querySelector(".page-footer").textContent = `- ${pageIndex + 1}/${totalPages} -`;

    const blocks = page.querySelector(".word-blocks");
    group.forEach((entry, groupIndex) => {
      const wordIndex = pageIndex * WORDS_PER_PAGE + groupIndex + 1;
      blocks.append(createWordBlock(entry, wordIndex));
    });

    for (let index = group.length; index < WORDS_PER_PAGE; index += 1) {
      const spacer = document.createElement("section");
      spacer.className = "word-block empty";
      blocks.append(spacer);
    }

    els.pages.append(page);
  });
}

els.generate.addEventListener("click", render);
els.print.addEventListener("click", () => {
  render();
  window.print();
});
els.phonetics.addEventListener("click", async () => {
  const requestId = ++importRequestId;
  const entries = parseWords(els.words.value);
  const enrichedEntries = await enrichEntriesWithPhonetics(entries, requestId);
  if (requestId !== importRequestId) return;
  els.words.value = serializeEntries(enrichedEntries);
  render();
  const missingCount = countMissingSingleWordPhonetics(enrichedEntries);
  setImportStatus(
    missingCount
      ? `Phonetic lookup finished, but ${missingCount} single words still have no phonetic result.`
      : "Phonetic lookup finished. All single words have phonetics.",
    missingCount ? "error" : "success"
  );
});
els.pageFrom.addEventListener("input", scheduleCurrentPdfImport);
els.pageTo.addEventListener("input", scheduleCurrentPdfImport);
els.pdf.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  currentPdfFile = file;
  importRequestId += 1;

  try {
    setImportStatus(`Reading ${file.name}...`);
    currentPdfPageCount = await getPdfPageCount(file);
    els.pageFrom.max = String(currentPdfPageCount);
    els.pageTo.max = String(currentPdfPageCount);
    els.pageFrom.value = "1";
    els.pageTo.value = String(currentPdfPageCount);
    await importCurrentPdf();
  } catch (error) {
    console.error(error);
    setImportStatus(
      "PDF import failed. Check network access for PDF.js, or use a PDF with selectable text.",
      "error"
    );
  } finally {
    event.target.value = "";
  }
});

async function importCurrentPdf() {
  if (!currentPdfFile) return;

  const requestId = ++importRequestId;
  const { from, to } = getImportPageRange();
  els.pageFrom.value = String(from);
  els.pageTo.value = String(to);

  try {
    setImportStatus(`Reading ${currentPdfFile.name} pages ${from}-${to}...`);
    let entries = extractUniqueEntries(await extractPdfTableEntries(currentPdfFile, from, to));

    if (!entries.length) {
      const lines = await extractPdfLines(currentPdfFile, from, to);
      entries = extractUniqueEntries(extractEntriesFromPdfLines(lines));
    }

    if (!entries.length) {
      setImportStatus(
        "No selectable English words were found. This may be a scanned/image PDF and will need OCR.",
        "error"
      );
      return;
    }

    els.words.value = serializeEntries(entries);
    render();
    if (els.autoPhonetics.checked) {
      entries = await enrichEntriesWithPhonetics(entries, requestId);
      if (requestId !== importRequestId) return;
      els.words.value = serializeEntries(entries);
      render();
    }
    const missingCount = countMissingSingleWordPhonetics(entries);
    setImportStatus(
      missingCount
        ? `Imported ${entries.length} words from ${currentPdfFile.name} pages ${from}-${to}. ${missingCount} single words still have no phonetic result.`
        : `Imported ${entries.length} unique words from ${currentPdfFile.name} pages ${from}-${to}. All single words have phonetics.`,
      missingCount ? "error" : "success"
    );
  } catch (error) {
    console.error(error);
    setImportStatus(
      "PDF import failed. Check network access for PDF.js, or use a PDF with selectable text.",
      "error"
    );
  }
}

function scheduleCurrentPdfImport() {
  window.clearTimeout(importDebounceTimer);
  importDebounceTimer = window.setTimeout(() => importCurrentPdf(), 500);
}

render();
