// ====== CONFIG: how many images exist per category ======
const COUNTS = {
  street: 50,     // street-01.jpg ... street-50.jpg
  landscape: 50,  // landscape-01.jpg ... landscape-50.jpg
  portrait: 50,   // portrait-01.jpg ... portrait-50.jpg
};

const EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

// ✅ 分目录：列表缩略图 / 打开放大图
const THUMBS_DIR = "thumbs";
const IMAGES_DIR = "images";

// ====== DOM refs ======
const streetGrid = document.getElementById("streetGrid");
const landscapeGrid = document.getElementById("landscapeGrid");
const portraitGrid = document.getElementById("portraitGrid");

const lightbox = document.getElementById("lightbox");
const lbImg = document.getElementById("lbImg");
const lbClose = document.getElementById("lbClose");

const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ====== helpers ======
function pad2(n) { return String(n).padStart(2, "0"); }

function probeImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(url);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function resolveImageSrc(basePathNoExt) {
  for (const ext of EXTENSIONS) {
    const url = `${basePathNoExt}.${ext}`;
    const ok = await probeImage(url);
    if (ok) return ok;
  }
  return null;
}

function buildItems(category, count) {
  const items = [];
  for (let i = 1; i <= count; i++) {
    const num = pad2(i);
    items.push({
      category,
      id: `${category}-${num}`,
      thumbBaseNoExt: `${THUMBS_DIR}/${category}-${num}`, // ✅ 缩略图
      fullBaseNoExt: `${IMAGES_DIR}/${category}-${num}`,  // ✅ 原图
    });
  }
  return items;
}

// ====== Per-category lists for navigation ======
// ✅ 存两份：thumbSrc 用于列表；fullSrc 用于 lightbox
const LISTS = { street: [], landscape: [], portrait: [] };
let currentCategory = null;
let currentIndex = -1;

// ====== Lightbox UI (stage + nav buttons) ======
let lbStage = null;

function ensureLightboxUI() {
  if (!lightbox || !lbImg) return;

  if (!lightbox.querySelector(".lb-stage")) {
    const stage = document.createElement("div");
    stage.className = "lb-stage";
    lbStage = stage;

    // Move lbImg into stage
    if (lbImg.parentElement === lightbox) {
      lightbox.insertBefore(stage, lbImg);
      stage.appendChild(lbImg);
    } else {
      stage.appendChild(lbImg);
      lightbox.appendChild(stage);
    }

    // Prev / Next buttons
    const prev = document.createElement("button");
    prev.className = "lb-nav lb-prev";
    prev.type = "button";
    prev.setAttribute("aria-label", "Previous image");
    prev.textContent = "‹";

    const next = document.createElement("button");
    next.className = "lb-nav lb-next";
    next.type = "button";
    next.setAttribute("aria-label", "Next image");
    next.textContent = "›";

    prev.addEventListener("click", (e) => { e.stopPropagation(); showPrev(); });
    next.addEventListener("click", (e) => { e.stopPropagation(); showNext(); });

    stage.appendChild(prev);
    stage.appendChild(next);
  } else {
    lbStage = lightbox.querySelector(".lb-stage");
  }
}

// ====== Zoom + Pan (drag to move when zoomed) ======
let zoom = 1;
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.12;

let panX = 0;
let panY = 0;

let baseRect = { w: 0, h: 0 };

let isDragging = false;
let startX = 0;
let startY = 0;
let startPanX = 0;
let startPanY = 0;

function updateCursor() {
  if (!lbImg) return;
  if (zoom > 1) lbImg.classList.add("is-zoomed");
  else lbImg.classList.remove("is-zoomed");
}

function clampPan() {
  if (!lbStage) return;

  const cw = lbStage.clientWidth || 1;
  const ch = lbStage.clientHeight || 1;

  const scaledW = baseRect.w * zoom;
  const scaledH = baseRect.h * zoom;

  const maxX = Math.max(0, (scaledW - cw) / 2);
  const maxY = Math.max(0, (scaledH - ch) / 2);

  panX = Math.min(maxX, Math.max(-maxX, panX));
  panY = Math.min(maxY, Math.max(-maxY, panY));
}

function applyTransform(skipClamp = false) {
  if (!lbImg) return;
  if (!skipClamp) clampPan();
  lbImg.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  updateCursor();
}

async function measureBaseRectStable() {
  if (!lbImg || !lbStage) return;

  try { if (lbImg.decode) await lbImg.decode(); } catch (_) {}

  await new Promise(r => requestAnimationFrame(() => r()));
  await new Promise(r => requestAnimationFrame(() => r()));

  const prevZoom = zoom, prevX = panX, prevY = panY;
  zoom = 1; panX = 0; panY = 0;
  applyTransform(true);

  const r = lbImg.getBoundingClientRect();
  baseRect.w = Math.max(1, r.width);
  baseRect.h = Math.max(1, r.height);

  zoom = prevZoom; panX = prevX; panY = prevY;
  applyTransform(true);
}

function resetZoomPan() {
  zoom = 1;
  panX = 0;
  panY = 0;
  applyTransform(true);
}

function zoomIn() {
  zoom = Math.min(ZOOM_MAX, +(zoom + ZOOM_STEP).toFixed(2));
  applyTransform();
}
function zoomOut() {
  zoom = Math.max(ZOOM_MIN, +(zoom - ZOOM_STEP).toFixed(2));
  if (zoom === 1) { panX = 0; panY = 0; }
  applyTransform();
}

function onWheelZoom(e) {
  if (!lightbox || !lightbox.classList.contains("is-open")) return;
  e.preventDefault();
  if (e.deltaY < 0) zoomIn();
  else zoomOut();
}

// Drag handlers
function onPointerDown(e) {
  if (!lightbox || !lightbox.classList.contains("is-open")) return;
  if (!lbImg || !lbStage) return;

  if (zoom <= 1) return;

  const t = e.target;
  if (t && t.classList && t.classList.contains("lb-nav")) return;

  isDragging = true;
  startX = e.clientX;
  startY = e.clientY;
  startPanX = panX;
  startPanY = panY;

  try { lbImg.setPointerCapture(e.pointerId); } catch (_) {}
  e.preventDefault();
}

function onPointerMove(e) {
  if (!isDragging) return;
  if (!lbImg) return;

  const dx = e.clientX - startX;
  const dy = e.clientY - startY;

  panX = startPanX + dx;
  panY = startPanY + dy;

  applyTransform();
}

function onPointerUp(e) {
  if (!isDragging) return;
  isDragging = false;
  try { lbImg.releasePointerCapture(e.pointerId); } catch (_) {}
}

// ====== Lightbox open/close/nav ======
async function openLightbox(category, index) {
  if (!lightbox || !lbImg) return;

  const list = LISTS[category] || [];
  if (list.length === 0) return;

  currentCategory = category;
  currentIndex = ((index % list.length) + list.length) % list.length;

  ensureLightboxUI();

  lightbox.classList.add("is-open");
  lightbox.setAttribute("aria-hidden", "false");

  resetZoomPan();

  // ✅ 打开时用 fullSrc（原图）
  lbImg.src = list[currentIndex].fullSrc;
  lbImg.alt = list[currentIndex].id;

  await measureBaseRectStable();
  applyTransform(true);
}

function closeLightbox() {
  if (!lightbox || !lbImg) return;
  lightbox.classList.remove("is-open");
  lightbox.setAttribute("aria-hidden", "true");
  lbImg.src = "";
  lbImg.alt = "";
  currentCategory = null;
  currentIndex = -1;
  resetZoomPan();
}

function showPrev() {
  if (!currentCategory) return;
  const list = LISTS[currentCategory];
  if (!list || list.length === 0) return;
  openLightbox(currentCategory, currentIndex - 1);
}

function showNext() {
  if (!currentCategory) return;
  const list = LISTS[currentCategory];
  if (!list || list.length === 0) return;
  openLightbox(currentCategory, currentIndex + 1);
}

// ====== Render cards ======
function createCard(category, index, thumbSrc, id) {
  const card = document.createElement("article");
  card.className = "card";
  card.setAttribute("tabindex", "0");
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `Open image ${id}`);

  // ✅ 列表用 thumbSrc
  card.innerHTML = `<img class="card-img" src="${thumbSrc}" alt="${id}" loading="lazy" decoding="async">`;

  const openThis = () => openLightbox(category, index);
  card.addEventListener("click", openThis);
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") openThis();
  });

  return card;
}

async function renderCategory(gridEl, category, count) {
  if (!gridEl) return;
  gridEl.innerHTML = "";
  LISTS[category] = [];

  const items = buildItems(category, count);
  let idx = 0;

  for (const item of items) {
    // ✅ 必须同时存在：thumb + full
    const thumbSrc = await resolveImageSrc(item.thumbBaseNoExt);
    if (!thumbSrc) continue;

    const fullSrc = await resolveImageSrc(item.fullBaseNoExt);
    if (!fullSrc) continue;

    LISTS[category].push({ thumbSrc, fullSrc, id: item.id });

    const card = createCard(category, idx, thumbSrc, item.id);
    gridEl.appendChild(card);

    idx++;
  }

  if (LISTS[category].length === 0) {
    const hint = document.createElement("div");
    hint.className = "muted";
    hint.style.padding = "12px 0";
    hint.textContent =
      `No images found for "${category}". Put files like "${category}-01.jpg" in /thumbs and /images.`;
    gridEl.appendChild(hint);
  }
}

// ====== Init ======
async function init() {
  ensureLightboxUI();
  await renderCategory(streetGrid, "street", COUNTS.street);
  await renderCategory(landscapeGrid, "landscape", COUNTS.landscape);
  await renderCategory(portraitGrid, "portrait", COUNTS.portrait);
}
init();

// ====== Lightbox events ======
if (lbClose) lbClose.addEventListener("click", closeLightbox);

if (lightbox) {
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  lightbox.addEventListener("wheel", onWheelZoom, { passive: false });
}

if (lbImg) {
  lbImg.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
}

window.addEventListener("resize", async () => {
  if (!lightbox || !lightbox.classList.contains("is-open")) return;
  await measureBaseRectStable();
  applyTransform();
});

document.addEventListener("keydown", (e) => {
  if (!lightbox || !lightbox.classList.contains("is-open")) return;

  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") showPrev();
  if (e.key === "ArrowRight") showNext();

  if (e.key === "+" || e.key === "=") zoomIn();
  if (e.key === "-" || e.key === "_") zoomOut();
});