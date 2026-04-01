import "./styles.css";
import JSZip from "jszip";
import QRCode from "qrcode";

const STORAGE_KEY = "amelie-qr-studio.entries";

const form = document.querySelector("#qrForm");
const generateButton = document.querySelector("#generateButton");
const clearStatusButton = document.querySelector("#clearStatusButton");
const clearAllButton = document.querySelector("#clearAllButton");
const exportAllButton = document.querySelector("#exportAllButton");
const formStatus = document.querySelector("#formStatus");
const entryCount = document.querySelector("#entryCount");
const historyList = document.querySelector("#historyList");
const previewShell = document.querySelector("#previewShell");
const previewMeta = document.querySelector("#previewMeta");
const previewTitle = document.querySelector("#previewTitle");
const previewUrl = document.querySelector("#previewUrl");
const previewDate = document.querySelector("#previewDate");
const downloadLinks = document.querySelector("#downloadLinks");
const downloadPngButton = document.querySelector("#downloadPngButton");
const downloadSvgButton = document.querySelector("#downloadSvgButton");

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

let entries = loadEntries();
let currentEntry = entries[0] || null;

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function setStatus(message, type = "") {
  formStatus.textContent = message;
  formStatus.className = type ? `status ${type}` : "status";
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function extractVideoId(urlValue) {
  try {
    const url = new URL(urlValue);
    const hostname = url.hostname.replace(/^www\./, "");

    if (hostname === "youtu.be") {
      return url.pathname.replace(/^\/+/, "").split("/")[0] || null;
    }

    if (hostname.endsWith("youtube.com")) {
      if (url.searchParams.get("v")) {
        return url.searchParams.get("v");
      }

      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "shorts" || parts[0] === "embed") {
        return parts[1] || null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function isYoutubeUrl(urlValue) {
  try {
    const url = new URL(urlValue);
    const hostname = url.hostname.replace(/^www\./, "");
    return (
      hostname === "youtu.be" ||
      hostname === "youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "music.youtube.com" ||
      hostname.endsWith(".youtube.com")
    );
  } catch {
    return false;
  }
}

function buildSlug(name, urlValue) {
  const videoId = extractVideoId(urlValue);
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const base = slugify(name || `youtube-${videoId || "video"}`) || "youtube-video";
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${base}-${timestamp}-${suffix}`;
}

function getEntryLabel(entry) {
  return entry.name?.trim() || entry.slug || "QR YouTube";
}

async function downloadBlob(filename, blob, type) {
  const objectUrl = URL.createObjectURL(new Blob([blob], { type }));
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

function updateCounter() {
  const count = entries.length;
  entryCount.textContent = count > 1 ? `${count} QR enregistrés` : `${count} QR enregistré`;
}

function renderPreview(entry) {
  currentEntry = entry || null;

  if (!entry) {
    previewShell.className = "preview-shell empty";
    previewShell.innerHTML = `
      <div>
        <strong>Aucun QR généré pour l’instant.</strong>
        <p>L’aperçu apparaîtra ici dès la première génération.</p>
      </div>
    `;
    previewMeta.hidden = true;
    downloadLinks.hidden = true;
    return;
  }

  previewShell.className = "preview-shell";
  previewShell.innerHTML = `
    <div class="preview-visual">
      <img src="${entry.pngDataUrl}" alt="QR code ${getEntryLabel(entry)}" />
    </div>
  `;

  previewMeta.hidden = false;
  previewTitle.textContent = getEntryLabel(entry);
  previewUrl.href = entry.url;
  previewUrl.textContent = entry.url;
  previewDate.textContent = `Créé le ${dateFormatter.format(new Date(entry.createdAt))}`;
  downloadLinks.hidden = false;
}

function renderHistory() {
  historyList.innerHTML = "";

  if (entries.length === 0) {
    historyList.innerHTML = `
      <article class="history-empty">
        <strong>Aucun QR enregistré.</strong>
        <p>Générez votre premier QR pour voir l’historique apparaître ici.</p>
      </article>
    `;
    renderPreview(null);
    updateCounter();
    return;
  }

  for (const entry of entries) {
    const article = document.createElement("article");
    article.className = "history-item";
    article.innerHTML = `
      <div class="history-item-header">
        <div>
          <h3>${getEntryLabel(entry)}</h3>
          <p class="history-date">${dateFormatter.format(new Date(entry.createdAt))}</p>
        </div>
        <div class="history-preview">
          <img src="${entry.pngDataUrl}" alt="QR code ${getEntryLabel(entry)}" />
        </div>
      </div>
      <p class="history-url">${entry.url}</p>
      <div class="history-links">
        <button class="micro-link" type="button" data-action="preview">Voir l’aperçu</button>
        <button class="micro-link" type="button" data-action="png">PNG</button>
        <button class="micro-link" type="button" data-action="svg">SVG</button>
        <a class="micro-link" href="${entry.url}" target="_blank" rel="noreferrer">YouTube</a>
      </div>
    `;

    article.querySelector('[data-action="preview"]').addEventListener("click", () => {
      renderPreview(entry);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    article.querySelector('[data-action="png"]').addEventListener("click", async () => {
      const blob = await dataUrlToBlob(entry.pngDataUrl);
      await downloadBlob(`${entry.slug}.png`, blob, "image/png");
    });

    article.querySelector('[data-action="svg"]').addEventListener("click", async () => {
      await downloadBlob(`${entry.slug}.svg`, entry.svgMarkup, "image/svg+xml;charset=utf-8");
    });

    historyList.appendChild(article);
  }

  renderPreview(currentEntry || entries[0]);
  updateCounter();
}

async function createEntry(url, name) {
  const slug = buildSlug(name, url);
  const pngDataUrl = await QRCode.toDataURL(url, {
    width: 1200,
    margin: 2,
    color: {
      dark: "#1C3D5A",
      light: "#FFFFFFFF",
    },
  });

  const svgMarkup = await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    color: {
      dark: "#1C3D5A",
      light: "#FFFFFFFF",
    },
  });

  return {
    id: crypto.randomUUID(),
    url,
    name,
    slug,
    createdAt: new Date().toISOString(),
    pngDataUrl,
    svgMarkup,
  };
}

async function handleSubmit(event) {
  event.preventDefault();

  const formData = new FormData(form);
  const url = String(formData.get("url") || "").trim();
  const name = String(formData.get("name") || "").trim();

  if (!url) {
    setStatus("Merci de coller une URL YouTube.", "error");
    return;
  }

  if (!isYoutubeUrl(url)) {
    setStatus("L’URL doit pointer vers une vidéo YouTube valide.", "error");
    return;
  }

  generateButton.disabled = true;
  setStatus("Génération du QR code en cours…");

  try {
    const entry = await createEntry(url, name);
    entries.unshift(entry);
    persistEntries();
    form.reset();
    setStatus("Le QR code a bien été généré et stocké localement dans ce navigateur.", "success");
    renderHistory();
    renderPreview(entry);
  } catch (error) {
    console.error(error);
    setStatus("La génération du QR code a échoué.", "error");
  } finally {
    generateButton.disabled = false;
  }
}

async function exportAll() {
  if (entries.length === 0) {
    setStatus("Aucun QR à exporter pour l’instant.", "error");
    return;
  }

  exportAllButton.disabled = true;
  setStatus("Préparation de l’archive ZIP…");

  try {
    const zip = new JSZip();
    const folder = zip.folder("qrcodes");
    const manifest = entries.map(({ id, url, name, slug, createdAt }) => ({
      id,
      url,
      name,
      slug,
      createdAt,
      files: {
        png: `${slug}.png`,
        svg: `${slug}.svg`,
      },
    }));

    for (const entry of entries) {
      const pngBlob = await dataUrlToBlob(entry.pngDataUrl);
      folder.file(`${entry.slug}.png`, pngBlob);
      folder.file(`${entry.slug}.svg`, entry.svgMarkup);
    }

    folder.file("index.json", JSON.stringify(manifest, null, 2));

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const archiveName = `qrcodes-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}.zip`;
    await downloadBlob(archiveName, zipBlob, "application/zip");
    setStatus("L’archive ZIP a bien été générée.", "success");
  } catch (error) {
    console.error(error);
    setStatus("L’export ZIP a échoué.", "error");
  } finally {
    exportAllButton.disabled = false;
  }
}

downloadPngButton.addEventListener("click", async () => {
  if (!currentEntry) {
    return;
  }

  const pngBlob = await dataUrlToBlob(currentEntry.pngDataUrl);
  await downloadBlob(`${currentEntry.slug}.png`, pngBlob, "image/png");
});

downloadSvgButton.addEventListener("click", async () => {
  if (!currentEntry) {
    return;
  }

  await downloadBlob(`${currentEntry.slug}.svg`, currentEntry.svgMarkup, "image/svg+xml;charset=utf-8");
});

clearStatusButton.addEventListener("click", () => setStatus(""));

clearAllButton.addEventListener("click", () => {
  if (entries.length === 0) {
    setStatus("L’historique est déjà vide.");
    return;
  }

  const confirmed = window.confirm("Supprimer tous les QR enregistrés dans ce navigateur ?");
  if (!confirmed) {
    return;
  }

  entries = [];
  currentEntry = null;
  persistEntries();
  setStatus("L’historique local a été vidé.", "success");
  renderHistory();
});

exportAllButton.addEventListener("click", exportAll);
form.addEventListener("submit", handleSubmit);

renderHistory();
