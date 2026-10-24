// Flow: scan the open eAsistent gallery, find missing photos, then save them by date.
const TEXT = {
  photoForms: ["fotografija", "fotografiji", "fotografije", "fotografij"],
  fileForms: ["datoteka", "datoteki", "datoteke", "datotek"],
  delayValue: ms => `${Number(ms).toLocaleString("sl-SI")} ms`,
  unsupportedFolderPicker: "Ta brskalnik ne podpira izbire lokalne mape. Uporabi aktualni Chrome ali Edge.",
  rootSelected: "Osnovna mapa je izbrana. Preglej galerijo in preveri, katerih fotografij še nimaš.",
  rootOpenFailed: "Izbrane mape ni bilo mogoče odpreti.",
  chooseRootFirst: "Najprej izberi osnovno mapo.",
  invalidDates: "Začetni datum mora biti enak končnemu ali starejši od njega.",
  readingGallery: "Berem galerijo fotografij …",
  scanHint: "Pregled prebere ID-je fotografij in datume. Na nalaganje sličic ni treba čakati.",
  scanSummary: (total, missing) => `V izbranem obdobju je ${total}. Za prenos: ${missing}.`,
  scanDetails: (present, missing, root) => `Že shranjene: ${present}  ·  Za prenos: ${missing}\nDatumske mape YYYY-MM-DD bodo ustvarjene v ${root}/.`,
  scanFailed: "Galerije fotografij ni bilo mogoče prebrati.",
  scanErrorHelp: "Odpri prijavljeno stran /photos in tam klikni ikono razširitve. Orodje samo počaka, da se prikažejo podatki galerije; na nalaganje sličic ni treba čakati.",
  sourceTabRequired: "Odpri stran eAsistenta /photos in klikni ikono razširitve na tem zavihku.",
  sourceTabUnavailable: "Izvornega zavihka ni mogoče prebrati. Vrni se na prijavljeno stran /photos in tam znova odpri razširitev.",
  wrongPage: "Pred pregledom odpri https://vrtec.easistent.com/photos v tem zavihku.",
  galleryNotLoaded: "Galerija se ni naložila. Preveri prijavo, odpri zavihek /photos in poskusi znova.",
  rescanRequired: "Izberi osnovno mapo, nato pred prenosom znova preglej galerijo.",
  folderReadFailed: error => `Izbrane mape ni bilo mogoče pregledati: ${error}`,
  nothingMissing: "Vse fotografije za izbrano obdobje so že v izbrani mapi.",
  nothingToDownload: "Ničesar ni treba prenesti.",
  preparingFolders: "Pripravljam lokalne mape …",
  folderAccessDenied: "Dostop do mape ni bil dovoljen. Znova izberi osnovno mapo in poskusi ponovno.",
  downloadProgress: (current, total) => `Potek prenosa: ${current} / ${total}.`,
  downloadDetails: (saved, skipped, failed) => `Shranjeno: ${saved}  ·  Preskočeno: ${skipped}  ·  Napake: ${failed}`,
  stopped: "Ustavljeno.",
  finished: "Končano.",
  downloadSummary: (prefix, saved, skipped, failed) => `${prefix} Shranjeno: ${saved}; preskočeno: ${skipped}; napake: ${failed}.`,
  allSaved: "Vse datoteke so shranjene lokalno.",
  moreFailures: count => `\n… in še ${count} napak.`,
  stoppedRequest: "Zahteva je bila ustavljena.",
  httpError: status => `Zahteva za fotografijo je vrnila HTTP ${status}.`,
  emptyFile: "Portal je vrnil prazno datoteko.",
  notImage: "Portal ni vrnil slikovnih podatkov. Preveri, ali si prijavljen.",
  unknownImageType: "Oblike izvirne fotografije ni bilo mogoče prepoznati, zato datoteka ni bila shranjena.",
  stopping: "Ustavljam po zaključku trenutne zahteve …",
  aborted: "Zahteva je bila ustavljena.",
  noFolderAccess: "Dostop do izbrane mape ni dovoljen.",
  folderSecurity: "Brskalnik je zavrnil dostop do izbrane mape.",
  diskFull: "Na disku ni dovolj prostora.",
  folderMissing: "Izbrane mape ni mogoče najti.",
  networkFailed: "Omrežna zahteva ni uspela. Preveri povezavo in prijavo.",
  unexpectedError: "Prišlo je do nepričakovane napake.",
  settingsChanged: "Nastavitve so se spremenile. Pred prenosom znova preglej galerijo.",
};

const GALLERY_POLL_MS = 500;
const GALLERY_POLL_ATTEMPTS = 20;

const chooseRootButton = document.getElementById("choose-root");
const rootName = document.getElementById("root-name");
const fromInput = document.getElementById("date-from");
const toInput = document.getElementById("date-to");
const requestDelayInput = document.getElementById("request-delay");
const requestDelayValue = document.getElementById("request-delay-value");
const scanButton = document.getElementById("scan");
const downloadButton = document.getElementById("download");
const stopButton = document.getElementById("stop");
const summary = document.getElementById("summary");
const details = document.getElementById("details");
const progressBar = document.getElementById("progress-bar");
const sourceTabValue = new URLSearchParams(location.search).get("sourceTabId");
const sourceTabId = sourceTabValue === null || sourceTabValue === "" ? NaN : Number(sourceTabValue);

let rootHandle = null;
let scannedPhotos = [];
let scannedSignature = "";
let downloadableCount = 0;
let isRunning = false;
let shouldStop = false;
let activeRequest = null;

const PHOTO_FORMS = TEXT.photoForms;
const FILE_FORMS = TEXT.fileForms;

chooseRootButton.addEventListener("click", chooseRoot);
scanButton.addEventListener("click", scanGallery);
downloadButton.addEventListener("click", downloadMissing);
stopButton.addEventListener("click", stopDownload);
requestDelayInput.addEventListener("input", updateRequestDelayLabel);
updateRequestDelayLabel();

function updateRequestDelayLabel() {
  requestDelayValue.textContent = TEXT.delayValue(requestDelayInput.value);
}

async function chooseRoot() {
  if (!window.showDirectoryPicker) {
    setSummary(TEXT.unsupportedFolderPicker);
    return;
  }

  try {
    rootHandle = await window.showDirectoryPicker({
      id: "easistent-photo-backup-root",
      mode: "readwrite",
    });
    rootName.textContent = rootHandle.name;
    invalidateScan(TEXT.rootSelected);
  } catch (error) {
    if (error.name !== "AbortError") setSummary(TEXT.rootOpenFailed);
  }
}

async function scanGallery() {
  if (isRunning) return;
  if (!rootHandle) return setSummary(TEXT.chooseRootFirst);

  const from = fromInput.value;
  const to = toInput.value;
  if (from && to && from > to) return setSummary(TEXT.invalidDates);

  setBusy(true, TEXT.readingGallery);
  details.textContent = TEXT.scanHint;
  progressBar.hidden = true;

  try {
    const allPhotos = await readGalleryFromSourceTab();
    scannedPhotos = allPhotos.filter(photo => (!from || photo.date >= from) && (!to || photo.date <= to));
    scannedSignature = makeSignature(from, to, rootHandle.name);

    const existingByDate = await buildExistingIndex(rootHandle, scannedPhotos);
    const present = scannedPhotos.reduce((count, photo) => count + (existingByDate.get(photo.date)?.has(photo.id) ? 1 : 0), 0);
    const missing = scannedPhotos.length - present;
    downloadableCount = missing;

    setSummary(TEXT.scanSummary(formatCount(scannedPhotos.length, PHOTO_FORMS), formatCount(missing, PHOTO_FORMS)));
    details.textContent = TEXT.scanDetails(formatCount(present, PHOTO_FORMS), formatCount(missing, PHOTO_FORMS), rootHandle.name);
    downloadButton.disabled = missing === 0;
  } catch (error) {
    scannedPhotos = [];
    scannedSignature = "";
    downloadableCount = 0;
    downloadButton.disabled = true;
    setSummary(error.message || TEXT.scanFailed);
    details.textContent = TEXT.scanErrorHelp;
  } finally {
    setBusy(false);
  }
}

async function readGalleryFromSourceTab() {
  if (!Number.isInteger(sourceTabId) || sourceTabId < 0) {
    throw new Error(TEXT.sourceTabRequired);
  }

  for (let attempt = 0; attempt < GALLERY_POLL_ATTEMPTS; attempt++) {
    let executions;
    try {
      executions = await chrome.scripting.executeScript({
        target: { tabId: sourceTabId },
        func: extractGalleryFromPage,
      });
    } catch {
      throw new Error(TEXT.sourceTabUnavailable);
    }

    const result = executions?.[0]?.result;
    if (result?.error) throw new Error(TEXT[result.error] || TEXT.scanFailed);
    if (result?.records?.length) return result.records;
    if (attempt + 1 < GALLERY_POLL_ATTEMPTS) await delay(GALLERY_POLL_MS);
  }
  throw new Error(TEXT.galleryNotLoaded);
}

function extractGalleryFromPage() {
  // This function runs in the eAsistent tab, so keep it self-contained.
  const expectedOrigin = "https://vrtec.easistent.com";
  if (location.origin !== expectedOrigin || location.pathname.replace(/\/$/, "") !== "/photos") {
    return { error: "wrongPage" };
  }

  const container = document.querySelector("#photos-content") || document;
  const selector = ".date-row, [data-original-src]";
  let nodes = container.querySelectorAll(selector);
  if (!container.querySelector("[data-original-src]")) nodes = document.querySelectorAll(selector);

  const records = [];
  const seen = new Set();
  let currentDate = null;

  for (const node of nodes) {
    if (node.matches(".date-row")) {
      const match = (node.textContent || "").match(/\b(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\b/);
      currentDate = null;
      if (match) {
        const day = Number(match[1]);
        const month = Number(match[2]);
        const year = Number(match[3]);
        const date = new Date(Date.UTC(year, month - 1, day));
        if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
          currentDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        }
      }
      continue;
    }

    const rawUrl = node.getAttribute("data-original-src");
    if (!rawUrl || !currentDate) continue;

    let imageUrl;
    try {
      imageUrl = new URL(rawUrl, expectedOrigin);
    } catch {
      continue;
    }
    if (imageUrl.origin !== expectedOrigin || !imageUrl.pathname.startsWith("/image/original/")) continue;

    const pathId = imageUrl.pathname.split("/").filter(Boolean).at(-1) || "";
    const id = (node.getAttribute("data-id") || pathId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
    if (!id || seen.has(`${currentDate}:${id}`)) continue;

    seen.add(`${currentDate}:${id}`);
    records.push({ id, date: currentDate, url: imageUrl.href });
  }

  return { records };
}

async function buildExistingIndex(base, photos) {
  // Match saved IDs so repeat scans skip photos already on disk.
  const result = new Map();
  const dates = [...new Set(photos.map(photo => photo.date))];
  for (const date of dates) {
    let dateHandle;
    try {
      dateHandle = await base.getDirectoryHandle(date, { create: false });
    } catch (error) {
      if (error.name === "NotFoundError") continue;
      throw error;
    }

    const ids = new Set();
    for await (const entry of dateHandle.values()) {
      if (entry.kind !== "file") continue;
      const match = entry.name.match(/^(?:fotografija|photo)_(.+)\.[a-z0-9]{1,8}$/i);
      if (match) ids.add(match[1]);
    }
    result.set(date, ids);
  }
  return result;
}

async function downloadMissing() {
  if (isRunning) return;
  const signature = makeSignature(fromInput.value, toInput.value, rootHandle?.name || "");
  if (!rootHandle || !scannedPhotos.length || signature !== scannedSignature) {
    return setSummary(TEXT.rescanRequired);
  }

  shouldStop = false;
  let existingByDate;
  try {
    existingByDate = await buildExistingIndex(rootHandle, scannedPhotos);
  } catch (error) {
    setSummary(TEXT.folderReadFailed(shortError(error)));
    return;
  }
  const missing = scannedPhotos.filter(photo => !existingByDate.get(photo.date)?.has(photo.id));
  if (!missing.length) {
    downloadableCount = 0;
    downloadButton.disabled = true;
    setSummary(TEXT.nothingMissing);
    details.textContent = TEXT.nothingToDownload;
    return;
  }

  setBusy(true, TEXT.preparingFolders);
  stopButton.hidden = false;
  progressBar.hidden = false;

  let saved = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];
  const directories = new Map();
  progressBar.max = Math.max(1, missing.length);
  progressBar.value = 0;

  try {
    for (let index = 0; index < missing.length; index++) {
      if (shouldStop) break;
      const photo = missing[index];
      try {
        const existingIds = existingByDate.get(photo.date);
        if (existingIds?.has(photo.id)) {
          skipped++;
          progressBar.value = index + 1;
          continue;
        }

        let dateHandle = directories.get(photo.date);
        if (!dateHandle) {
          dateHandle = await rootHandle.getDirectoryHandle(photo.date, { create: true });
          directories.set(photo.date, dateHandle);
        }

        const blob = await fetchOriginal(photo.url);
        const extension = await imageExtension(blob);
        const fileName = `fotografija_${photo.id}.${extension}`;
        const fileHandle = await dateHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        try {
          await writable.write(blob);
          await writable.close();
        } catch (error) {
          await writable.abort().catch(() => {});
          throw error;
        }
        if (existingIds) existingIds.add(photo.id);
        else existingByDate.set(photo.date, new Set([photo.id]));
        saved++;
      } catch (error) {
        if (error?.name === "AbortError" && shouldStop) break;
        failed++;
        failures.push(`${photo.date}: ${shortError(error)}`);
        if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
          shouldStop = true;
          failures.push(TEXT.folderAccessDenied);
        }
        if (/session|HTTP (401|403|429|5\d\d)/i.test(error?.message || "")) shouldStop = true;
      }

      progressBar.value = index + 1;
      if ((index + 1) % 10 === 0 || index + 1 === missing.length || shouldStop) {
        setSummary(TEXT.downloadProgress((index + 1).toLocaleString("sl-SI"), missing.length.toLocaleString("sl-SI")));
        details.textContent = TEXT.downloadDetails(formatCount(saved, FILE_FORMS), formatCount(skipped, FILE_FORMS), failed.toLocaleString("sl-SI"));
      }
      if (!shouldStop && index + 1 < missing.length) await delay(Number(requestDelayInput.value));
    }
  } catch (error) {
    failed++;
    failures.push(shortError(error));
  } finally {
    activeRequest = null;
    setBusy(false);
    stopButton.hidden = true;
  }

  const stopped = shouldStop;
  downloadableCount = failed > 0 || stopped ? 1 : 0;
  const prefix = stopped ? TEXT.stopped : TEXT.finished;
  setSummary(TEXT.downloadSummary(prefix, formatCount(saved, FILE_FORMS), formatCount(skipped, FILE_FORMS), failed.toLocaleString("sl-SI")));
  details.textContent = failures.slice(0, 8).join("\n") || TEXT.allSaved;
  if (failures.length > 8) details.textContent += TEXT.moreFailures(failures.length - 8);
  downloadButton.disabled = downloadableCount === 0;
}

async function fetchOriginal(url) {
  // Retry temporary rate-limit and server errors with a short backoff.
  let response;
  for (let attempt = 0; attempt < 4; attempt++) {
    activeRequest = new AbortController();
    response = await fetch(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: activeRequest.signal,
      headers: { Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" },
    });
    if (response.status !== 429 && response.status < 500) break;
    if (attempt < 3) await delay(750 * (2 ** attempt));
    if (shouldStop) throw new DOMException(TEXT.stoppedRequest, "AbortError");
  }

  if (!response.ok) throw new Error(TEXT.httpError(response.status));
  const blob = await response.blob();
  if (!blob.size) throw new Error(TEXT.emptyFile);
  if (blob.type && !blob.type.toLowerCase().startsWith("image/")) {
    throw new Error(TEXT.notImage);
  }
  return blob;
}

async function imageExtension(blob) {
  const mime = (blob.type || "").split(";")[0].trim().toLowerCase();
  const known = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/avif": "avif",
    "image/bmp": "bmp",
    "image/tiff": "tif",
  };
  if (known[mime]) return known[mime];
  if (mime.startsWith("image/")) return mime.slice("image/".length).replace(/[^a-z0-9]/g, "").slice(0, 8) || "img";

  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "webp";
  throw new Error(TEXT.unknownImageType);
}

function stopDownload() {
  shouldStop = true;
  if (activeRequest) activeRequest.abort();
  setSummary(TEXT.stopping);
}

function makeSignature(from, to, root) {
  return [from, to, root, sourceTabId].join("|");
}

function shortError(error) {
  if (error?.name === "AbortError") return TEXT.aborted;
  if (error?.name === "NotAllowedError") return TEXT.noFolderAccess;
  if (error?.name === "SecurityError") return TEXT.folderSecurity;
  if (error?.name === "QuotaExceededError") return TEXT.diskFull;
  if (error?.name === "NotFoundError") return TEXT.folderMissing;
  if (error?.name === "TypeError") return TEXT.networkFailed;
  return error?.message || TEXT.unexpectedError;
}

function formatCount(count, forms) {
  const absolute = Math.abs(count);
  const lastTwo = absolute % 100;
  const lastDigit = absolute % 10;
  let form = forms[3];
  if (lastDigit === 1 && lastTwo !== 11) form = forms[0];
  else if (lastDigit === 2 && lastTwo !== 12) form = forms[1];
  else if ((lastDigit === 3 || lastDigit === 4) && (lastTwo < 13 || lastTwo > 14)) form = forms[2];
  return `${count.toLocaleString("sl-SI")} ${form}`;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setSummary(text) {
  summary.textContent = text;
}

function setBusy(busy, label) {
  isRunning = busy;
  chooseRootButton.disabled = busy;
  fromInput.disabled = busy;
  toInput.disabled = busy;
  scanButton.disabled = busy;
  const valid = rootHandle && scannedPhotos.length > 0;
  downloadButton.disabled = busy || !valid || downloadableCount === 0;
  if (busy && label) setSummary(label);
}

function invalidateScan(message) {
  scannedPhotos = [];
  scannedSignature = "";
  downloadableCount = 0;
  downloadButton.disabled = true;
  if (message) setSummary(message);
}

for (const input of [fromInput, toInput]) {
  input.addEventListener("input", () => {
    if (scannedPhotos.length) invalidateScan(TEXT.settingsChanged);
  });
}
