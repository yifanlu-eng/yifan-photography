// ====== CONFIG: how many images exist per category ======
const COUNTS = {
  street: 50,     // street-01.jpg ... street-50.jpg
  landscape: 50,  // landscape-01.jpg ... landscape-50.jpg
  portrait: 50,   // portrait-01.jpg ... portrait-50.jpg
};

const EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
const IMG_DIR = "images";

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
function pad2(n){ return String(n).padStart(2,"0"); }

function probeImage(url){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = () => reject();
    img.src = url;
  });
}

async function resolveImageSrc(basePathNoExt){
  for (const ext of EXTENSIONS){
    const url = `${basePathNoExt}.${ext}`;
    try { return await probeImage(url); } catch (_) {}
  }
  return null;
}

function buildItems(category, count){
  const items = [];
  for (let i=1; i<=count; i++){
    const num = pad2(i);
    items.push({
      category,
      id: `${category}-${num}`,
      basePathNoExt: `${IMG_DIR}/${category}-${num}`,
    });
  }
  return items;
}

// ====== Per-category lists for navigation ======
const LISTS = {
  street: [],
  landscape: [],
  portrait: [],
};

// Lightbox state (per-category)
let currentCategory = null; // "street" | "landscape" | "portrait"
let currentIndex = -1;      // index within LISTS[currentCategory]

// ====== Lightbox UI (stage + nav buttons) ======
let lbStage = null;

function ensureLightboxUI(){
  if (!lightbox) return;

  if (!lightbox.querySelector(".lb-stage")){
    const stage = document.createElement("div");
    stage.className = "lb-stage";
    lbStage = stage;

    // Move img into stage
    if (lbImg && lbImg.parentElement === lightbox){
      lightbox.insertBefore(stage, lbImg);
      stage.appendChild(lbImg);
    } else if (lbImg){
      stage.appendChild(lbImg);
      lightbox.appendChild(stage);
    }

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

// For boundary clamping: base rendered size at zoom=1 (fits inside stage)
let baseRect = { w: 0, h: 0 };

// Drag state
let isDragging = false;
let startX = 0;
let startY = 0;
let startPanX = 0;
let startPanY = 0;

function measureBaseRect(){
  if (!lbImg || !lbStage) return;
  // Temporarily apply zoom=1, pan=0 to get a clean base size
  const prevZoom = zoom;
  const prevPanX = panX;
  const prevPanY = panY;

  zoom = 1;
  panX = 0;
  panY = 0;
  applyTransform(true);

  const r = lbImg.getBoundingClientRect();
  baseRect.w = r.width;
  baseRect.h = r.height;

  // restore
  zoom = prevZoom;
  panX = prevPanX;
  panY = prevPanY;
  applyTransform(true);
}

function clampPan(){
  if (!lbStage) return;

  const cw = lbStage.clientWidth;
  const ch = lbStage.clientHeight;

  const scaledW = baseRect.w * zoom;
  const scaledH = baseRect.h * zoom;

  const maxX = Math.max(0, (scaledW - cw) / 2);
  const maxY = Math.max(0, (scaledH - ch) / 2);

  panX = Math.min(maxX, Math.max(-maxX, panX));
  panY = Math.min(maxY, Math.max(-maxY, panY));
}

function updateCursor(){
  if (!lbImg) return;
  if (zoom > 1) {
    lbImg.classList.add("is-zoomed");
  } else {
    lbImg.classList.remove("is-zoomed");
  }
}

function applyTransform(skipClamp = false){
  if (!lbImg) return;
  if (!skipClamp) clampPan();
  lbImg.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  updateCursor();
}

function resetZoomPan(){
  zoom = 1;
  panX = 0;
  panY = 0;
  applyTransform(true);
  // baseRect will be measured after image load
}

function zoomIn(){
  zoom = Math.min(ZOOM_MAX, +(zoom + ZOOM_STEP).toFixed(2));
  applyTransform();
}
function zoomOut(){
  zoom = Math.max(ZOOM_MIN, +(zoom - ZOOM_STEP).toFixed(2));
  if (zoom === 1) { panX = 0; panY = 0; }
  applyTransform();
}

function onWheelZoom(e){
  if (!lightbox || !lightbox.classList.contains("is-open")) return;
  e.preventDefault();
  if (e.deltaY < 0) zoomIn();
  else zoomOut();
}

// Drag handlers (Pointer Events: mouse + touch + pen)
function onPointerDown(e){
  if (!lightbox || !lightbox.classList.contains("is-open")) return;
  if (!lbImg || !lbStage) return;

  // Only allow drag when zoomed in
  if (zoom <= 1) return;

  // Don’t start drag if clicking nav buttons
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

function onPointerMove(e){
  if (!isDragging) return;
  if (!lbImg) return;

  const dx = e.clientX - startX;
  const dy = e.clientY - startY;

  panX = startPanX + dx;
  panY = startPanY + dy;

  applyTransform();
}

function onPointerUp(e){
  if (!isDragging) return;
  isDragging = false;
  try { lbImg.releasePointerCapture(e.pointerId); } catch (_) {}
}

// Re-clamp on resize (keep image within bounds)
function onResize(){
  if (!lightbox || !lightbox.classList.contains("is-open")) return;
  if (!lbImg) return;
  // baseRect might change with responsive layout; re-measure at zoom=1
  const prevZoom = zoom;
  const prevPanX = panX;
  const prevPanY = panY;

  zoom = 1; panX = 0; panY = 0;
  applyTransform(true);
  measureBaseRect();

  zoom = prevZoom;
  panX = prevPanX;
  panY = prevPanY;
  applyTransform();
}

// ====== Lightbox open/close/nav (category loop) ======
function openLightbox(category, index){
  if (!lightbox || !lbImg) return;

  const list = LISTS[category] || [];
  if (list.length === 0) return;

  currentCategory = category;
  currentIndex = ((index % list.length) + list.length) % list.length; // safe wrap

  // Load image
  lbImg.src = list[currentIndex].src;
  lbImg.alt = list[currentIndex].id;

  // Reset before show
  resetZoomPan();

  lightbox.classList.add("is-open");
  lightbox.setAttribute("aria-hidden", "false");

  // After image is painted, measure base size for pan bounds
  // Use decode() if available for more reliable sizing
  const done = () => {
    measureBaseRect();
    applyTransform(true);
  };

  if (lbImg.decode) {
    lbImg.decode().then(done).catch(() => { setTimeout(done, 0); });
  } else {
    setTimeout(done, 0);
  }
}

function closeLightbox(){
  if (!lightbox || !lbImg) return;
  lightbox.classList.remove("is-open");
  lightbox.setAttribute("aria-hidden", "true");
  lbImg.src = "";
  lbImg.alt = "";
  currentCategory = null;
  currentIndex = -1;
  resetZoomPan();
}

function showPrev(){
  if (!currentCategory) return;
  const list = LISTS[currentCategory];
  if (!list || list.length === 0) return;
  openLightbox(currentCategory, currentIndex - 1);
}

function showNext(){
  if (!currentCategory) return;
  const list = LISTS[currentCategory];
  if (!list || list.length === 0) return;
  openLightbox(currentCategory, currentIndex + 1);
}

// ====== Render cards ======
function createCard(category, index, src, id){
  const card = document.createElement("article");
  card.className = "card";
  card.setAttribute("tabindex", "0");
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `Open image ${id}`);

  card.innerHTML = `<img src="${src}" alt="${id}" loading="lazy">`;

  const openThis = () => openLightbox(category, index);

  card.addEventListener("click", openThis);
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") openThis();
  });

  return card;
}

async function renderCategory(gridEl, category, count){
  if (!gridEl) return;
  gridEl.innerHTML = "";
  LISTS[category] = [];

  const items = buildItems(category, count);
  let idx = 0;

  for (const item of items){
    const src = await resolveImageSrc(item.basePathNoExt);
    if (!src) continue;

    LISTS[category].push({ src, id: item.id });
    const card = createCard(category, idx, src, item.id);
    gridEl.appendChild(card);

    idx++;
  }

  if (LISTS[category].length === 0){
    const hint = document.createElement("div");
    hint.className = "muted";
    hint.style.padding = "12px 0";
    hint.textContent =
      `No images found for "${category}". Put files like "${category}-01.jpg" in /images.`;
    gridEl.appendChild(hint);
  }
}

// ====== Init ======
async function init(){
  ensureLightboxUI();
  await renderCategory(streetGrid, "street", COUNTS.street);
  await renderCategory(landscapeGrid, "landscape", COUNTS.landscape);
  await renderCategory(portraitGrid, "portrait", COUNTS.portrait);
}
init();

// ====== Lightbox events ======
if (lbClose) lbClose.addEventListener("click", closeLightbox);

if (lightbox){
  // Click overlay closes (only when click on overlay itself)
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  // Zoom with wheel/trackpad
  lightbox.addEventListener("wheel", onWheelZoom, { passive: false });
}

// Drag to pan: bind on image (pointer events)
if (lbImg){
  lbImg.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
}

window.addEventListener("resize", onResize);

document.addEventListener("keydown", (e) => {
  if (!lightbox || !lightbox.classList.contains("is-open")) return;

  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") showPrev();
  if (e.key === "ArrowRight") showNext();

  // Optional keyboard zoom
  if (e.key === "+" || e.key === "=") zoomIn();
  if (e.key === "-" || e.key === "_") zoomOut();
});