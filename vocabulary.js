const PDFJS_VERSION = "4.10.38";
const PDFJS_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`;
const PDFJS_WORKER_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
const DICTIONARY_API_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const DATAMUSE_API_URL = "https://api.datamuse.com/words";
const IMPORT_STOP_WORDS = new Set(["copybook", "english", "model", "word", "words"]);
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
let currentPdfDocument;
let currentPdfPageCount = 1;
let importRequestId = 0;
let importDebounceTimer;
let previewRenderId = 0;
let entries = [];
let britishVoices = [];

const els = {
  pdf: document.querySelector("#pdfInput"),
  pageFrom: document.querySelector("#pageFromInput"),
  pageTo: document.querySelector("#pageToInput"),
  refresh: document.querySelector("#refreshBtn"),
  status: document.querySelector("#status"),
  previewCount: document.querySelector("#previewCount"),
  pagePreviewList: document.querySelector("#pagePreviewList"),
  wordList: document.querySelector("#wordList"),
  wordCount: document.querySelector("#wordCount"),
  wordCardTemplate: document.querySelector("#wordCardTemplate"),
};

function setStatus(message, type = "") {
  els.status.textContent = message;
  els.status.className = `status ${type}`.trim();
}

function clampPageNumber(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(Math.max(parsed, min), max);
}

function getImportPageRange() {
  const from = clampPageNumber(els.pageFrom.value, 1, currentPdfPageCount);
  const to = clampPageNumber(els.pageTo.value, from, currentPdfPageCount);
  return { from, to };
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

async function getPdfDocument(file) {
  if (file === currentPdfFile && currentPdfDocument) return currentPdfDocument;

  const pdfjsLib = await loadPdfJs();
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  if (file === currentPdfFile) currentPdfDocument = pdf;
  return pdf;
}

async function getPdfPageCount(file) {
  const pdf = await getPdfDocument(file);
  return pdf.numPages;
}

async function extractPdfTableEntries(file, firstPage, lastPage) {
  const pdf = await getPdfDocument(file);
  const importedEntries = [];
  const { from, to } = normalizePdfPageRange(firstPage, lastPage, pdf.numPages);

  for (let pageNumber = from; pageNumber <= to; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    importedEntries.push(...extractWordsPdfPageEntries(textContent.items, pageNumber));
  }

  return sortEntriesByPdfSerial(importedEntries);
}

async function extractPdfLines(file, firstPage, lastPage) {
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

function normalizePdfPageRange(firstPage, lastPage, pageCount) {
  const from = clampPageNumber(firstPage, 1, pageCount);
  const to = clampPageNumber(lastPage, from, pageCount);
  return { from, to };
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

function extractWordsPdfPageEntries(items, pageNumber) {
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

  let sourceOrder = 0;
  return bands
    .sort((a, b) => b.y - a.y)
    .flatMap((band) =>
      [
        parseWordsPdfTableCell(band.items.filter((item) => item.x < 300), pageNumber, sourceOrder++),
        parseWordsPdfTableCell(band.items.filter((item) => item.x >= 300), pageNumber, sourceOrder++),
      ]
    )
    .filter(Boolean);
}

function parseWordsPdfTableCell(items, pageNumber, sourceOrder) {
  if (!items.length) return null;

  const sortedItems = [...items].sort((a, b) => a.x - b.x);
  const serialNumber = Number.parseInt(
    sortedItems.find((item) => /^\d+$/.test(item.text))?.text || "",
    10
  );
  const hasSerialNumber = Number.isFinite(serialNumber);
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
  return {
    word,
    translation: chinese,
    phonetic: "",
    audio: "",
    serialNumber: hasSerialNumber ? serialNumber : null,
    sourcePage: pageNumber,
    sourceOrder,
  };
}

function sortEntriesByPdfSerial(importedEntries) {
  const hasSerialEntries = importedEntries.some((entry) => Number.isFinite(entry.serialNumber));
  if (!hasSerialEntries) return importedEntries;

  return [...importedEntries].sort((a, b) => {
    const pageDiff = (a.sourcePage || 0) - (b.sourcePage || 0);
    if (pageDiff) return pageDiff;

    const aSerial = Number.isFinite(a.serialNumber) ? a.serialNumber : Number.MAX_SAFE_INTEGER;
    const bSerial = Number.isFinite(b.serialNumber) ? b.serialNumber : Number.MAX_SAFE_INTEGER;
    const serialDiff = aSerial - bSerial;
    if (serialDiff) return serialDiff;

    return (a.sourceOrder || 0) - (b.sourceOrder || 0);
  });
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
  return { word, translation: chinese, phonetic, audio: "" };
}

function extractEntriesFromLine(line) {
  if (/[\u3400-\u9fff]/.test(line) || /\/[^/]{1,80}\/|\[[^\]]{1,80}\]/.test(line)) {
    const parsed = parseImportedLineWithMeta(line);
    return parsed ? [parsed] : [];
  }

  return [...line.matchAll(/[A-Za-z][A-Za-z'-]*/g)]
    .map((match) => normalizeImportedWord(match[0]))
    .filter((word) => word.length >= 2)
    .map((word) => ({ word, translation: "", phonetic: "", audio: "" }));
}

function extractEntriesFromPdfLines(lines) {
  return lines.flatMap(extractEntriesFromLine);
}

function filterImportedEntries(importedEntries) {
  return importedEntries.filter((entry) => !IMPORT_STOP_WORDS.has(entry.word.toLowerCase()));
}

function updateSelectedPreviewPages() {
  const { from, to } = getImportPageRange();
  els.pagePreviewList.querySelectorAll(".page-thumb").forEach((button) => {
    const pageNumber = Number.parseInt(button.dataset.page, 10);
    button.classList.toggle("is-selected", pageNumber >= from && pageNumber <= to);
  });
}

function renderPreviewEmpty(message) {
  els.previewCount.textContent = "No PDF";
  els.pagePreviewList.textContent = "";
  const empty = document.createElement("p");
  empty.className = "preview-empty";
  empty.textContent = message;
  els.pagePreviewList.append(empty);
}

async function renderPdfPagePreviews(pdf, requestId = previewRenderId) {
  els.previewCount.textContent = `${pdf.numPages} pages`;
  els.pagePreviewList.textContent = "";

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    if (requestId !== previewRenderId) return;

    const button = document.createElement("button");
    button.className = "page-thumb";
    button.type = "button";
    button.dataset.page = String(pageNumber);
    button.setAttribute("aria-label", `Select page ${pageNumber}`);

    const canvas = document.createElement("canvas");
    const label = document.createElement("span");
    label.textContent = `Page ${pageNumber}`;
    button.append(canvas, label);
    button.addEventListener("click", () => {
      els.pageFrom.value = String(pageNumber);
      els.pageTo.value = String(pageNumber);
      updateSelectedPreviewPages();
      importCurrentPdf();
    });
    els.pagePreviewList.append(button);

    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 0.24 });
    const context = canvas.getContext("2d");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: context, viewport }).promise;
    updateSelectedPreviewPages();
  }
}

function isPhonetic(value) {
  return /^\/.+\/$/.test(value) || /^\[.+\]$/.test(value);
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

function getBestDictionaryMeta(dictionaryEntries) {
  const phonetics = (dictionaryEntries || []).flatMap((entry) => entry.phonetics || []);
  const ukAudio = phonetics.find((item) => isBritishAudio(item.audio || ""));
  const phonetic =
    phonetics.find((item) => isPhonetic(item.text || ""))?.text ||
    (dictionaryEntries || []).find((entry) => isPhonetic(entry.phonetic || ""))?.phonetic ||
    "";

  return {
    phonetic: normalizePhonetic(phonetic),
    audio: ukAudio?.audio || "",
  };
}

function isBritishAudio(url) {
  return /[-_/](uk|gb)[-_.]/i.test(url) || /-uk\.mp3/i.test(url);
}

async function fetchDictionaryMeta(word) {
  const response = await fetch(`${DICTIONARY_API_URL}${encodeURIComponent(word)}`);
  if (!response.ok) return { phonetic: "", audio: "" };
  return getBestDictionaryMeta(await response.json());
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
  try {
    const spellingPhonetic = await fetchDatamusePhoneticByQuery("sp", word);
    if (spellingPhonetic) return spellingPhonetic;
  } catch (error) {
    console.warn(`Datamuse spelling phonetic lookup failed for ${word}`, error);
  }

  try {
    return await fetchDatamusePhoneticByQuery("sl", word);
  } catch (error) {
    console.warn(`Datamuse sounds-like phonetic lookup failed for ${word}`, error);
    return "";
  }
}

function needsMetaRefresh(entry) {
  return (
    isSingleEnglishWord(entry.word) &&
    (!entry.phonetic || isArpabetPhonetic(entry.phonetic) || !entry.audio)
  );
}

async function enrichEntriesWithMeta(sourceEntries, requestId = importRequestId) {
  const enrichedEntries = sourceEntries.map((entry) => ({ ...entry }));
  const refreshEntries = enrichedEntries.filter((entry) => needsMetaRefresh(entry));

  for (let index = 0; index < refreshEntries.length; index += 1) {
    if (requestId !== importRequestId) return enrichedEntries;

    const entry = refreshEntries[index];
    setStatus(`Fetching word details ${index + 1}/${refreshEntries.length}: ${entry.word}...`);

    try {
      const dictionaryMeta = await fetchDictionaryMeta(entry.word);
      if (dictionaryMeta.phonetic) entry.phonetic = dictionaryMeta.phonetic;
      if (dictionaryMeta.audio) entry.audio = dictionaryMeta.audio;
      if (!entry.phonetic || isArpabetPhonetic(entry.phonetic)) {
        entry.phonetic = await fetchDatamusePhonetic(entry.word.toLowerCase());
      }
    } catch (error) {
      console.warn(`Word detail lookup failed for ${entry.word}`, error);
    }

    entries = enrichedEntries;
    renderWordList();
  }

  return enrichedEntries;
}

function renderWordList() {
  els.wordList.textContent = "";
  els.wordCount.textContent = `${entries.length} ${entries.length === 1 ? "word" : "words"}`;

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Select a PDF to import words.";
    els.wordList.append(empty);
    return;
  }

  entries.forEach((entry, index) => {
    const fragment = els.wordCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".word-card");
    card.querySelector(".word-number").textContent = `${index + 1}.`;
    card.querySelector(".word-text").textContent = entry.word;
    card.querySelector(".translation").textContent = entry.translation || "No translation";
    card.querySelector(".phonetic").textContent = entry.phonetic || "No phonetic";
    card.setAttribute("aria-label", `Play ${entry.word}`);
    card.addEventListener("click", () => playPronunciation(entry));
    els.wordList.append(card);
  });
}

async function playPronunciation(entry) {
  window.speechSynthesis?.cancel();

  if (entry.audio) {
    try {
      const audio = new Audio(entry.audio);
      await audio.play();
      return;
    } catch (error) {
      console.warn(`Audio playback failed for ${entry.word}`, error);
    }
  }

  if (!("speechSynthesis" in window)) {
    setStatus("This browser does not support speech playback.", "error");
    return;
  }

  const utterance = new SpeechSynthesisUtterance(entry.word);
  utterance.lang = "en-GB";
  utterance.rate = 0.86;
  utterance.voice = britishVoices[0] || null;
  window.speechSynthesis.speak(utterance);
}

function refreshVoices() {
  if (!("speechSynthesis" in window)) return;
  britishVoices = window.speechSynthesis
    .getVoices()
    .filter((voice) => /^en[-_]GB/i.test(voice.lang));
}

async function importCurrentPdf() {
  if (!currentPdfFile) return;

  const requestId = ++importRequestId;
  const { from, to } = getImportPageRange();
  els.pageFrom.value = String(from);
  els.pageTo.value = String(to);
  updateSelectedPreviewPages();

  try {
    setStatus(`Reading ${currentPdfFile.name} pages ${from}-${to}...`);
    entries = filterImportedEntries(await extractPdfTableEntries(currentPdfFile, from, to));

    if (!entries.length) {
      const lines = await extractPdfLines(currentPdfFile, from, to);
      entries = filterImportedEntries(extractEntriesFromPdfLines(lines));
    }

    if (!entries.length) {
      renderWordList();
      setStatus(
        "No selectable English words were found. This may be a scanned/image PDF and will need OCR.",
        "error"
      );
      return;
    }

    renderWordList();
    entries = await enrichEntriesWithMeta(entries, requestId);
    if (requestId !== importRequestId) return;
    renderWordList();

    const missingCount = entries.filter((entry) => isSingleEnglishWord(entry.word) && !entry.phonetic).length;
    const orderDescription = entries.some((entry) => Number.isFinite(entry.serialNumber))
      ? "sorted by PDF serial number"
      : "kept in PDF text order";
    setStatus(
      missingCount
        ? `Imported ${entries.length} words ${orderDescription}. ${missingCount} single words still have no phonetic result.`
        : `Imported ${entries.length} words ${orderDescription}. Tap any word to play British pronunciation.`,
      missingCount ? "error" : "success"
    );
  } catch (error) {
    console.error(error);
    setStatus(
      "PDF import failed. Check network access for PDF.js, or use a PDF with selectable text.",
      "error"
    );
  }
}

function scheduleCurrentPdfImport() {
  updateSelectedPreviewPages();
  window.clearTimeout(importDebounceTimer);
  importDebounceTimer = window.setTimeout(() => importCurrentPdf(), 500);
}

els.pdf.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;

  currentPdfFile = file;
  currentPdfDocument = null;
  importRequestId += 1;
  previewRenderId += 1;

  try {
    setStatus(`Reading ${file.name}...`);
    currentPdfDocument = await getPdfDocument(file);
    currentPdfPageCount = currentPdfDocument.numPages;
    els.pageFrom.max = String(currentPdfPageCount);
    els.pageTo.max = String(currentPdfPageCount);
    els.pageFrom.value = "1";
    els.pageTo.value = String(currentPdfPageCount);
    renderPdfPagePreviews(currentPdfDocument, previewRenderId);
    await importCurrentPdf();
  } catch (error) {
    console.error(error);
    setStatus(
      "PDF import failed. Check network access for PDF.js, or use a PDF with selectable text.",
      "error"
    );
  } finally {
    event.target.value = "";
  }
});

els.pageFrom.addEventListener("input", scheduleCurrentPdfImport);
els.pageTo.addEventListener("input", scheduleCurrentPdfImport);
els.refresh.addEventListener("click", async () => {
  const requestId = ++importRequestId;
  entries = await enrichEntriesWithMeta(entries, requestId);
  if (requestId !== importRequestId) return;
  renderWordList();
  setStatus("Word details refreshed. Tap any word to play British pronunciation.", "success");
});

if ("speechSynthesis" in window) {
  refreshVoices();
  if (typeof window.speechSynthesis.addEventListener === "function") {
    window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
  } else {
    window.speechSynthesis.onvoiceschanged = refreshVoices;
  }
}

renderWordList();
