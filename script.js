/* KAILU CREATION storefront.
 * Render products-data.js immediately so the storefront is never blank while
 * catalog-sync.js fetches the deployed Excel workbook in the background.
 * The validated workbook replaces this snapshot without a page reload.
 * Keep the current Apps Script order contract and pincode data source intact.
 */
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx7SEmC90BTOz6VWnkckZiJ8rtX0fFXXCKa8kVzS0Uz-e34p1XKkZuMUU4ddYQuLT_IlA/exec";
const CURRENCY = "INR";
const PINCODE_DATA = window.KAILU_PINCODE_DATA || Object.create(null);
const SIZE_ORDER = ["S", "M", "L", "XL", "XXL", "3XL"];
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function normalizeCatalogProductList(input) {
  if (!Array.isArray(input)) return [];
  return input.map(product => ({
    ...product,
    id: String(product.id ?? ""),
    groupCode: String(product.groupCode ?? ""),
    variants: (product.variants || []).map(variant => ({
      ...variant,
      sku: String(variant.sku ?? ""),
      size: String(variant.size ?? ""),
      inventory: variant.inventory === null || variant.inventory === "" ? null : Number(variant.inventory),
      mrp: variant.mrp === null || variant.mrp === "" ? null : Number(variant.mrp),
      price: variant.price === null || variant.price === "" ? null : Number(variant.price),
      rating: variant.rating === null || variant.rating === "" ? null : Number(variant.rating),
      reviews: variant.reviews === null || variant.reviews === "" ? null : Number(variant.reviews)
    }))
  })).filter(product => product.id && product.variants.length > 0);
}

// Start with bundled last-known-good data immediately. Excel sync updates these
// indexes later; this avoids a blank page while a CDN or workbook request is slow.
let products = normalizeCatalogProductList(window.KAILU_PRODUCT_CATALOG || []);
let productById = new Map();
let variantBySku = new Map();
function rebuildProductIndexes() {
  productById = new Map(products.map(product => [product.id, product]));
  variantBySku = new Map(products.flatMap(product =>
    product.variants.map(variant => [variant.sku, { product, variant }])
  ));
}
rebuildProductIndexes();
if (!window.KAILU_CATALOG_SYNC_STATUS) {
  window.KAILU_CATALOG_SYNC_STATUS = {
    mode: "loading",
    ok: null,
    message: "Loading latest catalog from Excel…"
  };
}

const productGrid = $("#productGrid");
const searchInput = $("#searchInput");
const categoryFilter = $("#categoryFilter");
const sortSelect = $("#sortSelect");
const cartDrawer = $("#cartDrawer");
const overlay = $("#overlay");
const cartItems = $("#cartItems");
const cartEmpty = $("#cartEmpty");
const cartBottom = $("#cartBottom");
const toast = $("#toast");
let toastTimer = null;
let cartState = [];
let isSubmittingOrder = false;
const PENDING_ORDER_STORAGE_KEY = "kailu_pending_order_request_id_v1";
function readPendingOrderRequestId() {
  try { return sessionStorage.getItem(PENDING_ORDER_STORAGE_KEY) || ""; }
  catch (_) { return ""; }
}
function clearPendingOrderRequestId() {
  pendingClientOrderId = "";
  try { sessionStorage.removeItem(PENDING_ORDER_STORAGE_KEY); } catch (_) {}
}
let pendingClientOrderId = readPendingOrderRequestId();
let checkoutStarted = false;
let currentDetailProduct = null;
let currentDetailVariant = null;
let currentDetailQuantity = 1;
let detailMedia = [];
let detailMediaIndex = 0;
let videoAvailability = new Map();
let lightboxItems = [];
let lightboxIndex = 0;
let openingFromSharedUrl = false;
let lastPincodeValue = $("#pincode")?.value.trim() || "";

const money = amount => amount === null || amount === undefined || amount === "" || !Number.isFinite(Number(amount))
  ? "Price unavailable"
  : new Intl.NumberFormat("en-IN", { style: "currency", currency: CURRENCY, maximumFractionDigits: 0 }).format(Number(amount));
const numeric = value => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
const stockQuantity = variant => Number.isFinite(variant?.inventory) ? variant.inventory : null;
const isInStock = variant => stockQuantity(variant) !== null && stockQuantity(variant) > 0;
const discountPercent = variant => {
  const mrp = numeric(variant?.mrp), price = numeric(variant?.price);
  return mrp !== null && price !== null && mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : null;
};
const firstAvailableVariant = product => {
  const ordered = [...(product?.variants || [])].sort((a, b) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size));
  return ordered.find(isInStock) || ordered[0] || null;
};
const getVariant = (product, sku) => product?.variants.find(variant => variant.sku === sku) || null;
const getProductImage = product => (product?.images || []).find(image => image?.url || image?.fallback) || null;
const localImageUrl = path => path ? new URL(path, document.baseURI).href : "";

// Product grid/detail thumbnails use lightweight derivatives when the Excel
// link points to the matching local Product_Photos asset. Main images continue
// to use the original Excel URL and full-resolution fallback.
function thumbnailSources(media) {
  const url = String(media?.url || "").trim();
  const fallback = String(media?.fallback || "").trim();
  const thumbnailFallback = String(media?.thumbnailFallback || "").trim() ||
    fallback.replace("images/Product_Photos/", "images/Product_Thumbnails/")
      .replace(/\.(webp|png|jpe?g)(\?.*)?$/i, "-thumb.webp");
  const remoteFallback = String(media?.remoteFallback || "").trim();
  const remoteThumbnailFallback = String(media?.remoteThumbnailFallback || "").trim() || remoteFallback;
  const cleanPath = value => String(value || "").replace(/^\.\//, "").replace(/^\//, "");
  if (!url) return { primary: thumbnailFallback || fallback, fallback, remoteFallback: remoteThumbnailFallback };
  if (fallback && cleanPath(url) === cleanPath(fallback)) {
    return { primary: thumbnailFallback || url, fallback, remoteFallback: remoteThumbnailFallback };
  }
  // Treat a raw GitHub URL as the same asset when its path matches our SKU map.
  try {
    const parsed = new URL(url, document.baseURI);
    const rawPath = decodeURIComponent(parsed.pathname).replace(/^.*?\/(images\/Product_Photos\/)/, "$1");
    if (fallback && cleanPath(rawPath) === cleanPath(fallback)) {
      return { primary: thumbnailFallback || fallback, fallback, remoteFallback: remoteThumbnailFallback };
    }
  } catch (_) {}
  return { primary: url, fallback: thumbnailFallback || fallback, remoteFallback: remoteThumbnailFallback };
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function configureImage(image, primaryUrl, fallbackUrl, onMissing, secondaryFallbackUrl = "") {
  if (!image) return;
  const rawCandidates = [primaryUrl, fallbackUrl, secondaryFallbackUrl]
    .map(value => String(value || "").trim())
    .filter(Boolean);
  const candidates = [];
  const seen = new Set();
  rawCandidates.forEach(source => {
    try {
      const absolute = new URL(source, document.baseURI).href;
      if (!seen.has(absolute)) {
        seen.add(absolute);
        candidates.push(absolute);
      }
    } catch (_) { /* Ignore malformed media URLs and continue with the next fallback. */ }
  });

  image.dataset.primary = String(primaryUrl || "");
  image.dataset.fallback = String(fallbackUrl || "");
  image.dataset.secondaryFallback = String(secondaryFallbackUrl || "");
  image.dataset.fallbackTried = "false";
  let attempt = 0;
  image.hidden = candidates.length === 0;
  image.onerror = () => {
    attempt += 1;
    image.dataset.fallbackTried = attempt > 0 ? "true" : "false";
    if (attempt < candidates.length) {
      image.src = candidates[attempt];
      return;
    }
    image.hidden = true;
    if (typeof onMissing === "function") onMissing(image);
  };
  image.onload = () => { image.hidden = false; };
  if (candidates.length) image.src = candidates[0];
  else if (typeof onMissing === "function") onMissing(image);
}

function renderCategories() {
  if (!categoryFilter) return;
  const selected = categoryFilter.value || "all";
  categoryFilter.replaceChildren(new Option("All categories", "all"));
  [...new Set(products.map(product => String(product.category || "").trim()).filter(Boolean))].sort().forEach(category => {
    categoryFilter.add(new Option(category, category));
  });
  categoryFilter.value = [...categoryFilter.options].some(option => option.value === selected) ? selected : "all";
}

function visibleProducts() {
  const query = (searchInput?.value || "").trim().toLowerCase();
  const category = categoryFilter?.value || "all";
  let result = products.filter(product => {
    const content = [product.name, product.category, product.color, product.fabric, product.description, product.baseSku]
      .join(" ").toLowerCase();
    return content.includes(query) && (category === "all" || product.category === category);
  });
  if (sortSelect?.value === "low") result.sort((a, b) => cardPrice(a) - cardPrice(b));
  if (sortSelect?.value === "high") result.sort((a, b) => cardPrice(b) - cardPrice(a));
  if (sortSelect?.value === "name") result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

function cardPrice(product) {
  const variant = firstAvailableVariant(product);
  return numeric(variant?.price) ?? Number.POSITIVE_INFINITY;
}

function renderProducts() {
  if (!productGrid) return;
  const visible = visibleProducts();
  productGrid.replaceChildren();
  const empty = $("#emptyProducts");
  if (empty) empty.hidden = visible.length !== 0;
  const summary = $("#productSummary");
  if (summary) {
    const countText = `${visible.length} catalog${visible.length === 1 ? "" : "s"} to explore`;
    const syncStatus = window.KAILU_CATALOG_SYNC_STATUS || null;
    if (syncStatus?.ok) {
      const syncLabel = syncStatus.mode === "local-file"
        ? "Loaded from Selected Local Excel — PC Test Only"
        : "Synced from Excel";
      summary.textContent = `${countText} · ${syncLabel}`;
      summary.dataset.syncState = "success";
      summary.title = syncStatus.syncedAt ? `Excel loaded at ${new Date(syncStatus.syncedAt).toLocaleString()}${syncStatus.mode === "local-file" ? " (local PC test; select the saved workbook again after editing)" : ""}` : "Catalog data loaded from Excel";
    } else if (syncStatus && syncStatus.ok === false) {
      const fallbackLabel = syncStatus.mode === "cache"
        ? "Sync Failed — Showing Last Synced Data"
        : "Sync Failed — Showing Backup Data";
      summary.textContent = `${countText} · ${fallbackLabel}`;
      summary.dataset.syncState = "warning";
      summary.title = `${syncStatus.message || fallbackLabel}. Cause: ${syncStatus.detail || "Excel catalog could not be refreshed."}`;
    } else if (syncStatus && syncStatus.mode === "loading") {
      summary.textContent = `${countText} · Loading latest catalog from Excel…`;
      summary.dataset.syncState = "loading";
      summary.title = "Showing the available catalog while the latest Excel workbook is checked.";
    } else {
      summary.textContent = countText;
      summary.removeAttribute("data-sync-state");
      summary.removeAttribute("title");
    }
  }

  visible.forEach((product, productIndex) => {
    const variant = firstAvailableVariant(product);
    const sourceImages = (product.images || []).map((image, sourceIndex) => ({ ...image, sourceIndex })).filter(image => image && (image.url || image.fallback));
    const displayThumbs = sourceImages.slice(0, 4);
    const image1 = sourceImages[0] || { url: "", fallback: "" };
    const discount = discountPercent(variant);
    const inStock = (product.variants || []).some(isInStock);
    const card = document.createElement("article");
    card.className = "product-card catalog-card";
    card.dataset.productId = product.id;
    card.innerHTML = `
      <div class="catalog-card-media">
        <button class="catalog-main-trigger" type="button" data-open-product="${escapeHtml(product.id)}" aria-label="Open catalog ${escapeHtml(product.name)}">
          <span class="product-tag">${discount !== null && discount > 0 ? "SALE" : escapeHtml(product.tag || "CATALOG")}</span>
          <span class="catalog-image-wrap"><img class="catalog-photo" alt="${escapeHtml(product.name)}" loading="${productIndex < 3 ? "eager" : "lazy"}" decoding="async" fetchpriority="${productIndex === 0 ? "high" : productIndex < 3 ? "auto" : "low"}" width="900" height="1400"></span>
          <span class="catalog-photo-unavailable" hidden>Photo unavailable</span>
        </button>
        <div class="catalog-thumb-rail" aria-label="${escapeHtml(product.name)} photos">
          ${displayThumbs.map((image, index) => `
            <button type="button" class="catalog-rail-thumb ${index === 0 ? "active" : ""}" data-card-photo="${index}" data-source-index="${image.sourceIndex}" aria-label="Show product photo ${index + 1}" ${index === 0 ? 'aria-pressed="true"' : 'aria-pressed="false"'}>
              <img alt="" loading="lazy" decoding="async" fetchpriority="low" width="180" height="240">
            </button>`).join("")}
        </div>
      </div>
      <div class="catalog-card-info">
        <div class="catalog-category">${escapeHtml(product.category || "")}</div>
        <h3>${escapeHtml(product.name || "")}</h3>
        <div class="catalog-price-row">
          <strong class="catalog-sale-price">${money(variant?.price)}</strong>
          <span class="catalog-mrp">MRP <del>${money(variant?.mrp)}</del></span>
          ${discount !== null ? `<span class="catalog-discount">${discount}% OFF</span>` : ""}
        </div>
        <div class="catalog-card-meta">${inStock ? `${(product.variants || []).filter(isInStock).length} sizes available` : "Out of Stock"}</div>
        <div class="catalog-card-actions">
          <button class="view-catalog-button" type="button" data-open-product="${escapeHtml(product.id)}"><span aria-hidden="true">▤</span> View Catalog <span aria-hidden="true">↗</span></button>
          <button class="catalog-share-button" type="button" data-share-product="${escapeHtml(product.id)}" aria-label="Share ${escapeHtml(product.name)}" title="Share catalog">↗</button>
        </div>
      </div>`;
    productGrid.appendChild(card);

    const main = $(".catalog-photo", card);
    const mainButton = $(".catalog-main-trigger", card);
    configureImage(main, image1.url, image1.fallback, () => {
      const wrap = $(".catalog-image-wrap", card);
      if (wrap) wrap.hidden = true;
      const placeholder = $(".catalog-photo-unavailable", card);
      if (placeholder) placeholder.hidden = false;
    }, image1.remoteFallback);
    $$(".catalog-rail-thumb", card).forEach((button, index) => {
      const media = displayThumbs[index];
      const img = $("img", button);
      // Do not use the HTML hidden attribute while loading: browsers may defer
      // loading an image inside a display:none ancestor, leaving every rail item
      // hidden forever. Keep the grid slot reserved but visually hidden until load.
      button.hidden = false;
      button.style.visibility = "hidden";
      // Avoid eagerly downloading every thumbnail in every off-screen card.
      // First thumbnail of the first row is eager; other thumbnails use native lazy loading.
      img.loading = productIndex < 3 && index === 0 ? "eager" : "lazy";
      img.decoding = "async";
      img.fetchPriority = "low";
      img.addEventListener("load", () => { button.style.visibility = "visible"; });
      const thumbSource = thumbnailSources(media);
      configureImage(img, thumbSource.primary, thumbSource.fallback, () => {
        button.hidden = true;
        const remaining = $$(".catalog-rail-thumb", card).filter(thumb => !thumb.hidden);
        if (!remaining.some(thumb => thumb.classList.contains("active")) && remaining.length) {
          remaining[0].classList.add("active");
          remaining[0].setAttribute("aria-pressed", "true");
          setCardMainImage(card, displayThumbs[Number(remaining[0].dataset.cardPhoto)]);
        }
      }, thumbSource.remoteFallback);
      button.dataset.cardPhoto = String(index);
      button.dataset.primary = media.url || "";
      button.dataset.fallback = media.fallback || "";
    });
    if (!inStock) {
      const tag = $(".product-tag", card);
      if (tag) { tag.textContent = "OUT OF STOCK"; tag.classList.add("out-of-stock-tag"); }
      const openButtons = $$('[data-open-product]', card);
      openButtons.forEach(button => button.setAttribute("aria-label", `View details for out of stock ${product.name}`));
    }
  });
}

function setCardMainImage(card, media) {
  if (!card || !media) return;
  const image = $(".catalog-photo", card);
  const wrap = $(".catalog-image-wrap", card);
  const placeholder = $(".catalog-photo-unavailable", card);
  if (wrap) wrap.hidden = false;
  if (placeholder) placeholder.hidden = true;
  configureImage(image, media.url, media.fallback, () => {
    if (wrap) wrap.hidden = true;
    if (placeholder) placeholder.hidden = false;
  }, media.remoteFallback);
}

function ensureDetailModal() {
  if ($("#productDetailModal")) return;
  const modal = document.createElement("div");
  modal.id = "productDetailModal";
  modal.className = "product-detail-modal";
  modal.hidden = true;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "detailProductName");
  modal.innerHTML = `
    <section class="product-detail-panel">
      <button class="detail-close" type="button" data-detail-close aria-label="Close catalog details">×</button>
      <div class="detail-layout">
        <div class="detail-gallery">
          <div class="detail-stage">
            <button class="detail-nav detail-prev" type="button" data-detail-prev aria-label="Previous photo or video">‹</button>
            <img id="detailMainImage" alt="Product image">
            <div id="detailPhotoUnavailable" class="detail-photo-unavailable" hidden>Photo unavailable</div>
            <video id="detailMainVideo" controls muted playsinline preload="metadata" hidden aria-label="Product video"></video>
            <button class="detail-nav detail-next" type="button" data-detail-next aria-label="Next photo or video">›</button>
          </div>
          <div id="detailThumbnails" class="detail-thumbnails" aria-label="Product images and video"></div>
        </div>
        <div class="detail-information">
          <span id="detailCategory" class="detail-category"></span>
          <h2 id="detailProductName"></h2>
          <div id="detailRating" class="detail-rating"></div>
          <div class="detail-pricing"><strong id="detailPrice"></strong><span id="detailMrp"></span><span id="detailDiscount"></span></div>
          <div id="detailStock" class="detail-stock" aria-live="polite"></div>
          <div class="detail-option-group"><div class="detail-option-heading">Color <span id="detailColorLabel"></span></div><div id="detailColors" class="detail-color-options"></div></div>
          <div class="detail-option-group"><div class="detail-option-heading">Select Size</div><div id="detailSizes" class="detail-size-options"></div></div>
          <div id="detailSku" class="detail-sku"></div>
          <div id="detailFabric" class="detail-fabric"></div>
          <p id="detailDescription" class="detail-description"></p>
          <div class="detail-quantity"><span>Quantity</span><div><button type="button" data-detail-qty="-1" aria-label="Decrease quantity">−</button><strong id="detailQuantity">1</strong><button type="button" data-detail-qty="1" aria-label="Increase quantity">+</button></div></div>
          <div class="detail-actions">
            <button id="detailAddToCart" class="detail-add-button" type="button">＋ Add to Cart</button>
            <button id="detailBuyNow" class="detail-buy-button" type="button">Buy Now</button>
          </div>
          <button class="detail-share-button" type="button" data-detail-share>↗ Share this Catalog</button>
        </div>
      </div>
    </section>`;
  document.body.appendChild(modal);
}

function mediaKey(product, index) { return `${product.id}:image:${index}`; }
function makeDetailImageMedia(product) {
  return (product.images || []).map((image, index) => ({
    type: "image", key: mediaKey(product, index), label: `Image ${index + 1}`,
    url: image?.url || "", fallback: image?.fallback || "",
    thumbnailFallback: image?.thumbnailFallback || "",
    remoteFallback: image?.remoteFallback || "",
    remoteThumbnailFallback: image?.remoteThumbnailFallback || "",
    alt: `${product.name} — Image ${index + 1}`
  })).filter(media => media.url || media.fallback);
}

function checkVideoAvailability(product) {
  if (videoAvailability.has(product.id)) return videoAvailability.get(product.id);
  const promise = new Promise(resolve => {
    const candidates = [];
    if (product.videoUrl) candidates.push(product.videoUrl);
    if (product.localVideo && !candidates.includes(product.localVideo)) candidates.push(product.localVideo);
    if (product.remoteVideoUrl && !candidates.includes(product.remoteVideoUrl)) candidates.push(product.remoteVideoUrl);
    if (!candidates.length) { resolve(null); return; }
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.muted = true;
    let position = 0;
    let settled = false;
    const timeout = setTimeout(() => finish(null), 9000);
    function finish(value) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      probe.onloadedmetadata = null;
      probe.onerror = null;
      probe.removeAttribute("src");
      probe.load();
      resolve(value);
    }
    function tryNext() {
      if (position >= candidates.length) { finish(null); return; }
      const candidate = candidates[position++];
      probe.onloadedmetadata = () => finish(candidate);
      probe.onerror = tryNext;
      probe.src = candidate;
      probe.load();
    }
    tryNext();
  });
  videoAvailability.set(product.id, promise);
  return promise;
}

function updateDetailMediaForProduct(product) {
  const preservedIndex = 0;
  detailMedia = makeDetailImageMedia(product);
  detailMediaIndex = Math.min(preservedIndex, Math.max(0, detailMedia.length - 1));
  renderDetailThumbnails();
  showDetailMedia(detailMediaIndex, { playVideo: false });
  checkVideoAvailability(product).then(availableVideo => {
    if (!currentDetailProduct || currentDetailProduct.id !== product.id || !availableVideo) return;
    if (!detailMedia.some(media => media.type === "video")) {
      detailMedia.push({ type: "video", key: `${product.id}:video`, label: "VIDEO", url: availableVideo, fallback: "", alt: `${product.name} video` });
      renderDetailThumbnails();
    }
  });
}

function renderDetailThumbnails() {
  const container = $("#detailThumbnails");
  if (!container) return;
  container.replaceChildren();
  detailMedia.forEach((media, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `detail-thumb ${index === detailMediaIndex ? "active" : ""}`;
    button.dataset.detailMedia = String(index);
    button.setAttribute("aria-pressed", index === detailMediaIndex ? "true" : "false");
    button.setAttribute("aria-label", media.type === "video" ? "Play product video" : media.label);
    let imageToConfigure = null;
    if (media.type === "video") {
      button.innerHTML = '<span class="detail-video-thumb"><span aria-hidden="true">▶</span><small>VIDEO</small></span>';
    } else {
      const image = document.createElement("img");
      image.alt = "";
      // A hidden button prevents lazy images from loading in several browsers.
      // Keep the thumbnail in layout, then reveal it only after a valid image loads.
      button.style.visibility = "hidden";
      image.loading = "eager";
      image.addEventListener("load", () => { button.style.visibility = "visible"; });
      button.appendChild(image);
      imageToConfigure = image;
    }
    container.appendChild(button);
    // Attach the thumbnail to the document before setting src, so cached images
    // cannot finish loading before their load listener/visibility state is ready.
    if (imageToConfigure) {
      const thumbSource = thumbnailSources(media);
      configureImage(imageToConfigure, thumbSource.primary, thumbSource.fallback, () => {
        button.hidden = true;
        removeFailedDetailMedia(media.key);
      }, thumbSource.remoteFallback);
    }
  });
  const navHidden = detailMedia.length <= 1;
  $$('[data-detail-prev], [data-detail-next]').forEach(button => { button.hidden = navHidden; });
}

function removeFailedDetailMedia(key) {
  const index = detailMedia.findIndex(media => media.key === key);
  if (index < 0) return;
  detailMedia.splice(index, 1);
  if (!detailMedia.length) {
    detailMediaIndex = 0;
    const image = $("#detailMainImage");
    if (image) image.hidden = true;
    const placeholder = $("#detailPhotoUnavailable");
    if (placeholder) placeholder.hidden = false;
  } else {
    if (index < detailMediaIndex) detailMediaIndex -= 1;
    if (detailMediaIndex >= detailMedia.length) detailMediaIndex = 0;
    renderDetailThumbnails();
    showDetailMedia(detailMediaIndex, { playVideo: false });
  }
}

function showDetailMedia(index, options = {}) {
  if (!detailMedia.length) {
    const image = $("#detailMainImage");
    const placeholder = $("#detailPhotoUnavailable");
    if (image) image.hidden = true;
    if (placeholder) placeholder.hidden = false;
    const video = $("#detailMainVideo");
    if (video) { video.pause(); video.hidden = true; }
    return;
  }
  detailMediaIndex = (index + detailMedia.length) % detailMedia.length;
  const media = detailMedia[detailMediaIndex];
  const image = $("#detailMainImage");
  const placeholder = $("#detailPhotoUnavailable");
  const video = $("#detailMainVideo");
  if (placeholder) placeholder.hidden = true;
  if (image) image.hidden = media.type !== "image";
  if (video) {
    video.pause();
    video.hidden = media.type !== "video";
  }
  if (media.type === "image") {
    if (video) { video.removeAttribute("src"); video.load(); }
    configureImage(image, media.url, media.fallback, () => {
      if (placeholder) placeholder.hidden = false;
      removeFailedDetailMedia(media.key);
    }, media.remoteFallback);
  } else if (video) {
    if (image) image.hidden = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    if (video.src !== new URL(media.url, document.baseURI).href) video.src = media.url;
    video.load();
    if (options.playVideo) {
      video.play().catch(() => showToast("Tap Play on the video controls when it is ready."));
    }
  }
  $$(".detail-thumb").forEach((button, thumbIndex) => {
    button.classList.toggle("active", thumbIndex === detailMediaIndex);
    button.setAttribute("aria-pressed", thumbIndex === detailMediaIndex ? "true" : "false");
  });
}

function relatedColors(product) {
  return products.filter(candidate => candidate.groupCode === product.groupCode);
}

function renderDetailInfo() {
  const product = currentDetailProduct;
  const variant = currentDetailVariant;
  if (!product || !variant) return;
  $("#detailCategory").textContent = product.category || "";
  $("#detailProductName").textContent = product.name || "";
  $("#detailColorLabel").textContent = product.color || "";
  $("#detailPrice").textContent = money(variant.price);
  $("#detailMrp").innerHTML = variant.mrp !== null ? `MRP <del>${money(variant.mrp)}</del>` : "";
  const discount = discountPercent(variant);
  $("#detailDiscount").textContent = discount !== null && discount > 0 ? `${discount}% OFF` : "";
  const rating = numeric(variant.rating);
  const reviews = numeric(variant.reviews);
  $("#detailRating").textContent = rating !== null || reviews !== null
    ? `★ ${rating === null ? "Rating not provided" : rating} · ${reviews === null ? "Reviews not provided" : `${reviews.toLocaleString("en-IN")} reviews`}`
    : "Rating and reviews not provided";
  const stock = stockQuantity(variant);
  $("#detailStock").textContent = stock === null ? "Stock availability not confirmed" : stock > 0 ? `In Stock · ${stock} available` : "Out of Stock";
  $("#detailStock").classList.toggle("is-out-of-stock", !isInStock(variant));
  $("#detailSku").textContent = `SKU: ${variant.sku}`;
  $("#detailFabric").textContent = product.fabric ? `Fabric: ${product.fabric}` : "Fabric information not provided";
  $("#detailDescription").textContent = product.description || "Description not provided";

  const colorsContainer = $("#detailColors");
  colorsContainer.replaceChildren();
  const colorProducts = relatedColors(product);
  colorProducts.forEach(colorProduct => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `detail-color-button ${colorProduct.id === product.id ? "selected" : ""}`;
    button.textContent = colorProduct.color || "Color";
    button.dataset.detailColor = colorProduct.id;
    button.setAttribute("aria-pressed", colorProduct.id === product.id ? "true" : "false");
    colorsContainer.appendChild(button);
  });

  const sizesContainer = $("#detailSizes");
  sizesContainer.replaceChildren();
  [...product.variants].sort((a,b) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size)).forEach(sizeVariant => {
    const button = document.createElement("button");
    const available = isInStock(sizeVariant);
    button.type = "button";
    button.className = `detail-size-button ${sizeVariant.sku === variant.sku ? "selected" : ""} ${available ? "" : "disabled"}`;
    button.textContent = sizeVariant.size || "—";
    button.title = available ? `${sizeVariant.size}: ${sizeVariant.inventory} in stock` : `${sizeVariant.size}: Out of Stock`;
    button.dataset.detailSku = sizeVariant.sku;
    button.disabled = !available;
    button.setAttribute("aria-pressed", sizeVariant.sku === variant.sku ? "true" : "false");
    sizesContainer.appendChild(button);
  });
  const available = isInStock(variant);
  const addButton = $("#detailAddToCart");
  const buyButton = $("#detailBuyNow");
  addButton.disabled = !available;
  buyButton.disabled = !available;
  $("#detailQuantity").textContent = String(currentDetailQuantity);
  $$('[data-detail-qty]').forEach(button => {
    const delta = Number(button.dataset.detailQty);
    button.disabled = !available || (delta < 0 && currentDetailQuantity <= 1) || (delta > 0 && currentDetailQuantity >= stockQuantity(variant));
  });
}

function updateCatalogUrl(productId, { replace = false, fromUrl = false } = {}) {
  if (fromUrl) return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("catalog", productId);
    url.hash = "products";
    const state = {
      ...(history.state && typeof history.state === "object" ? history.state : {}),
      kailuUI: "detail",
      catalogId: String(productId)
    };
    history[replace ? "replaceState" : "pushState"](state, "", url.toString());
  } catch (_) { /* URL history is progressive enhancement; catalog still works without it. */ }
}

function openProductDetail(productId, options = {}) {
  const product = productById.get(String(productId));
  if (!product) { showToast("This catalog link is not available."); return; }
  const modal = $("#productDetailModal");
  const alreadyOpen = modal && !modal.hidden;
  currentDetailProduct = product;
  const previousVariant = currentDetailVariant;
  const sizeMatch = previousVariant ? product.variants.find(variant => variant.size === previousVariant.size && isInStock(variant)) : null;
  currentDetailVariant = sizeMatch || firstAvailableVariant(product);
  currentDetailQuantity = 1;
  renderDetailInfo();
  updateDetailMediaForProduct(product);
  modal.hidden = false;
  document.body.classList.add("product-detail-open");
  if (!options.fromUrl) updateCatalogUrl(product.id, { replace: alreadyOpen || Boolean(options.replaceUrl) });
  const closeButton = $("[data-detail-close]", modal);
  if (closeButton) closeButton.focus({ preventScroll: true });
}

function closeProductDetail(options = {}) {
  // A user-initiated close should consume the detail entry, returning to the
  // catalog entry underneath it. Internal flows (Buy Now / Continue Shopping)
  // pass replaceUrl so they can close the detail without interrupting checkout.
  if (!options.fromPopstate && !options.replaceUrl) {
    const hasCatalogParam = new URLSearchParams(window.location.search).has("catalog");
    const isOurDetailEntry = history.state?.kailuUI === "detail" && hasCatalogParam;
    if (isOurDetailEntry) {
      history.back();
      return;
    }
  }

  const modal = $("#productDetailModal");
  if (modal) modal.hidden = true;
  document.body.classList.remove("product-detail-open");
  const video = $("#detailMainVideo");
  if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
  if (!options.fromPopstate) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("catalog");
      url.hash = "products";
      const state = { ...(history.state && typeof history.state === "object" ? history.state : {}) };
      delete state.kailuUI;
      delete state.catalogId;
      history.replaceState(state, "", url.toString());
    } catch (_) { /* no-op */ }
  }
}

async function shareCatalog(productId) {
  const product = productById.get(String(productId));
  if (!product) return;
  const url = new URL(window.location.href);
  url.searchParams.set("catalog", product.id);
  url.hash = "products";
  const payload = { title: product.name, text: `${product.name} — KAILU CREATION`, url: url.toString() };
  if (navigator.share) {
    try {
      await navigator.share(payload);
      return;
    } catch (error) {
      if (error && error.name === "AbortError") return;
      // If share API fails or is unavailable, use the copy-link fallback.
    }
  }
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(payload.url);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = payload.url;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      const copied = document.execCommand("copy");
      textArea.remove();
      if (!copied) throw new Error("Clipboard copy was not available");
    }
    showToast("Link Copied!");
  } catch (_) {
    showToast("Unable to copy link automatically. Please copy the page URL from the address bar.");
  }
}

function addToCart(product, variant, quantity = 1) {
  if (!product || !variant) return;
  if (!isInStock(variant)) { showToast("This size is Out of Stock."); return; }
  const existing = cartState.find(item => item.sku === variant.sku);
  const currentQuantity = existing ? existing.quantity : 0;
  if (currentQuantity + quantity > stockQuantity(variant)) {
    showToast(`Only ${stockQuantity(variant)} item(s) are available for size ${variant.size}.`);
    return;
  }
  if (existing) existing.quantity += quantity;
  else cartState.push({ productId: product.id, sku: variant.sku, quantity });
  renderCart();
  showToast(`${product.name} (${variant.size}) added to your cart.`);
}

function cartLineItems() {
  return cartState.map(item => {
    const match = variantBySku.get(item.sku);
    if (!match) return null;
    return { ...item, product: match.product, variant: match.variant, lineTotal: match.variant.price * item.quantity };
  }).filter(Boolean);
}

function renderCart() {
  if (!cartItems) return;
  const entries = cartLineItems();
  const count = entries.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = entries.reduce((sum, item) => sum + item.lineTotal, 0);
  $("#cartCount").textContent = String(count);
  $("#drawerCount").textContent = `(${count})`;
  $("#cartTotal").textContent = money(subtotal);
  cartItems.replaceChildren();
  cartItems.hidden = entries.length === 0;
  if (cartEmpty) cartEmpty.hidden = entries.length !== 0;
  cartBottom.hidden = entries.length === 0;

  entries.forEach(({ product, variant, quantity, sku, lineTotal }) => {
    const row = document.createElement("div");
    row.className = "cart-line catalog-cart-line";
    row.dataset.cartSku = sku;
    row.innerHTML = `
      <div class="cart-thumb"><img alt="${escapeHtml(product.name)}" loading="lazy"></div>
      <div class="cart-product-details">
        <h4>${escapeHtml(product.name)}</h4>
        <div class="cart-variant-line">${escapeHtml(product.color || "")} · Size ${escapeHtml(variant.size)} · SKU ${escapeHtml(sku)}</div>
        <div class="unit-price">${money(variant.price)} each</div>
        <div class="quantity-controls cart-quantity-controls">
          <button type="button" data-cart-qty="-1" data-sku="${escapeHtml(sku)}" aria-label="Decrease quantity">−</button>
          <strong>${quantity}</strong>
          <button type="button" data-cart-qty="1" data-sku="${escapeHtml(sku)}" aria-label="Increase quantity" ${quantity >= stockQuantity(variant) ? "disabled" : ""}>+</button>
          <button type="button" class="remove-button" data-cart-remove="${escapeHtml(sku)}">Remove</button>
        </div>
      </div>
      <div class="line-price">${money(lineTotal)}</div>`;
    cartItems.appendChild(row);
    const media = getProductImage(product);
    const thumbSource = thumbnailSources(media);
    const cartImage = $("img", row);
    cartImage.loading = "lazy";
    cartImage.decoding = "async";
    configureImage(cartImage, thumbSource.primary, thumbSource.fallback, image => { image.hidden = true; }, thumbSource.remoteFallback);
  });
  const proceed = $("#proceedCheckout");
  if (proceed) proceed.hidden = entries.length === 0 || checkoutStarted;
  const checkoutFields = $("#checkoutFields");
  if (checkoutFields) checkoutFields.hidden = entries.length === 0 || !checkoutStarted;
  const deliveryFields = $("#deliveryFields");
  if (deliveryFields) deliveryFields.hidden = entries.length === 0 || !checkoutStarted;
  const continueDetails = $("#continueToDetails");
  if (continueDetails) continueDetails.hidden = checkoutStarted;
}

function openCart(options = {}) {
  cartDrawer.hidden = false;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  checkoutStarted = options.checkout === true;
  renderCart();
  if (pendingClientOrderId && !isSubmittingOrder) {
    showOrderError("A previous order may already be saved. Check its status before submitting another order.", { showVerify: true });
  }
  if (options.checkout) {
    const first = $("#customerName");
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 60);
  } else {
    $("#closeCart").focus({ preventScroll: true });
  }
}

function closeCart() {
  cartDrawer.hidden = true;
  overlay.hidden = true;
  document.body.style.overflow = "";
}

function buyNow(product, variant, quantity = 1) {
  if (!product || !variant || !isInStock(variant)) {
    showToast("Please choose an available size before buying.");
    return;
  }
  cartState = [{ productId: product.id, sku: variant.sku, quantity: Math.min(quantity, stockQuantity(variant)) }];
  checkoutStarted = true;
  renderCart();
  closeProductDetail({ replaceUrl: true });
  openCart({ checkout: true });
  const details = $("#deliveryFields");
  if (details) details.hidden = false;
  const checkoutFields = $("#checkoutFields");
  if (checkoutFields) checkoutFields.hidden = false;
  $("#proceedCheckout").hidden = true;
}

function highlightMissingFields() {
  const ids = ["customerName", "mobileNumber", "houseBuilding", "roadArea", "pincode", "city", "state"];
  $$(".customer-input").forEach(field => {
    field.classList.remove("field-invalid");
    field.setAttribute("aria-invalid", "false");
  });
  const missing = [];
  ids.forEach(id => {
    const field = $("#" + id);
    if (!field || !field.value.trim()) {
      if (field) { field.classList.add("field-invalid"); field.setAttribute("aria-invalid", "true"); missing.push(field); }
    }
  });
  const mobile = $("#mobileNumber");
  if (mobile.value.trim() && !/^[6-9][0-9]{9}$/.test(mobile.value.trim())) {
    mobile.classList.add("field-invalid"); mobile.setAttribute("aria-invalid", "true"); if (!missing.includes(mobile)) missing.push(mobile);
  }
  const pin = $("#pincode");
  if (pin.value.trim() && !/^\d{6}$/.test(pin.value.trim())) {
    pin.classList.add("field-invalid"); pin.setAttribute("aria-invalid", "true"); if (!missing.includes(pin)) missing.push(pin);
  }
  if (missing[0]) {
    missing[0].scrollIntoView({ behavior: "smooth", block: "center" });
    missing[0].focus({ preventScroll: true });
  }
  return missing;
}

function setPincodeFeedback(message, status = "info") {
  const feedback = $("#pincodeFeedback");
  if (!feedback) return;
  feedback.textContent = message;
  feedback.dataset.status = status;
}

function setManualLocationEntry(manual) {
  const city = $("#city"), state = $("#state");
  [city, state].forEach(field => {
    if (!field) return;
    field.readOnly = !manual;
    if (manual) field.placeholder = "Enter city / district";
    else field.placeholder = "Auto-filled from PIN code";
  });
}

function validatePincode(options = {}) {
  const field = $("#pincode"), city = $("#city"), state = $("#state");
  const pin = field.value.trim();
  if (!/^\d{6}$/.test(pin)) {
    city.value = ""; state.value = ""; setManualLocationEntry(true);
    field.classList.toggle("field-invalid", options.showIncomplete === true);
    field.setAttribute("aria-invalid", options.showIncomplete === true ? "true" : "false");
    const message = pin ? "Please enter a valid 6-digit PIN code." : "Please enter your 6-digit PIN code.";
    setPincodeFeedback(options.showIncomplete ? message : "Enter a 6-digit PIN code to look up City and State.", options.showIncomplete ? "error" : "info");
    return { valid: false, message };
  }
  const match = PINCODE_DATA[pin];
  if (!match) {
    // Preserve city/state manually entered for this unknown PIN. The input handler
    // clears stale location values when the PIN changes; submit-time validation must not.
    setManualLocationEntry(true);
    field.classList.remove("field-invalid"); field.setAttribute("aria-invalid", "false");
    setPincodeFeedback("PIN code is not listed for automatic lookup. Enter City / District and State manually; delivery serviceability will be confirmed.", "info");
    return { valid: true, unknown: true, message: "Pincode format is valid; city and state are manual." };
  }
  city.value = match.district || "";
  state.value = match.state || "";
  setManualLocationEntry(false);
  if (match.cod === false) {
    field.classList.add("field-invalid"); field.setAttribute("aria-invalid", "true");
    setPincodeFeedback(`PIN code found (${match.district}, ${match.state}), but Cash on Delivery is not available for this PIN code.`, "error");
    return { valid: false, message: "Cash on Delivery is not available for this PIN code.", record: match };
  }
  field.classList.remove("field-invalid"); field.setAttribute("aria-invalid", "false");
  setPincodeFeedback(`✓ Delivery listed for ${match.district}, ${match.state} (Cash on Delivery).`, "success");
  return { valid: true, record: match };
}

function showOrderError(message, options = {}) {
  const error = $("#orderError");
  if (error) { error.textContent = message; error.hidden = false; }
  const verifyButton = $("#verifyOrderStatus");
  if (verifyButton) {
    verifyButton.hidden = options.showVerify !== true || !pendingClientOrderId;
    verifyButton.disabled = false;
    verifyButton.textContent = "Check Order Status";
  }
  showToast(message);
}
function clearOrderError() {
  const error = $("#orderError");
  if (error) { error.textContent = ""; error.hidden = true; }
  const verifyButton = $("#verifyOrderStatus");
  if (verifyButton) { verifyButton.hidden = true; verifyButton.disabled = false; verifyButton.textContent = "Check Order Status"; }
}

function clientRequestId() {
  if (pendingClientOrderId) return pendingClientOrderId;
  pendingClientOrderId = window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `KC-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  try { sessionStorage.setItem(PENDING_ORDER_STORAGE_KEY, pendingClientOrderId); } catch (_) {}
  return pendingClientOrderId;
}

function verifyOrderSaved(requestId, maxAttempts = 4) {
  return new Promise(async resolve => {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await new Promise(done => {
        const callbackName = `kailuOrderVerify_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const script = document.createElement("script");
        let settled = false;
        let missingCallbackTimer = 0;
        const finish = value => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          clearTimeout(missingCallbackTimer);
          try { delete window[callbackName]; } catch (_) { window[callbackName] = undefined; }
          script.remove();
          done(value);
        };
        window[callbackName] = data => finish(data && typeof data === "object" ? data : null);
        script.onerror = () => finish({
          ok: false, pending: true, code: "VERIFY_ENDPOINT_LOAD_FAILED",
          message: "Google Apps Script verification could not load. Check the deployed Web App URL, access permissions, and latest deployment version. Do not submit the order again yet."
        });
        // Apps Script can cold-start and read the Sheet/ledger; 1.8 seconds caused
        // false failures even after doPost had saved the order successfully.
        const timeout = setTimeout(() => finish(null), 6500);
        // An older deployed version may return the generic endpoint text without
        // invoking the JSONP callback. Detect that separately from a slow response.
        script.onload = () => {
          missingCallbackTimer = setTimeout(() => {
            if (!settled) finish({
              ok: false, pending: true, code: "VERIFY_CALLBACK_MISSING",
              message: "The published Apps Script did not return the order-verification callback. Deploy the latest Code.gs as a New version to the existing Web App deployment. The order may already be saved; check its status before retrying."
            });
          }, 250);
        };
        const url = new URL(GOOGLE_SCRIPT_URL);
        url.searchParams.set("action", "verify");
        url.searchParams.set("clientRequestId", requestId);
        url.searchParams.set("callback", callbackName);
        url.searchParams.set("_", `${Date.now()}-${attempt}`);
        script.src = url.toString();
        document.head.appendChild(script);
      });
      if (response?.ok === true && response.orderId) return resolve(response);
      if (response?.code === "VERIFY_CALLBACK_MISSING" || response?.code === "VERIFY_ENDPOINT_LOAD_FAILED") return resolve(response);
      if (response && response.pending !== true && response.message) return resolve(response);
      if (attempt < maxAttempts - 1) await new Promise(done => setTimeout(done, 350 * (attempt + 1)));
    }
    resolve({ ok: false, pending: true, message: "We still could not confirm whether the order was saved. Do not place it again yet. Check Order Status again or check the Orders sheet." });
  });
}

function completeOrderSuccess(orderId) {
  // Only called after the Apps Script reports a confirmed row for this request ID.
  clearPendingOrderRequestId();
  cartState = [];
  checkoutStarted = false;
  renderCart();
  closeCart();
  ["customerName", "mobileNumber", "houseBuilding", "landmark", "roadArea", "pincode", "city", "state"].forEach(id => {
    const field = $("#" + id);
    if (field) { field.value = ""; field.classList.remove("field-invalid"); field.setAttribute("aria-invalid", "false"); }
  });
  lastPincodeValue = "";
  setManualLocationEntry(true);
  setPincodeFeedback("Enter a 6-digit PIN code to fill City and State automatically.", "info");
  clearOrderError();
  const successModal = $("#orderSuccessModal");
  const orderIdSpot = $("#successOrderId");
  if (orderIdSpot) orderIdSpot.textContent = `Order ID: ${orderId}`;
  if (successModal) successModal.hidden = false;
  document.body.classList.add("success-modal-open");
  const continueButton = $("#continueShoppingSuccess");
  if (continueButton) continueButton.focus({ preventScroll: true });
}

async function checkPendingOrderStatus() {
  if (isSubmittingOrder || !pendingClientOrderId) return;
  const verifyButton = $("#verifyOrderStatus");
  const requestId = pendingClientOrderId;
  clearOrderError();
  isSubmittingOrder = true;
  if (verifyButton) { verifyButton.hidden = false; verifyButton.disabled = true; verifyButton.textContent = "Checking Order Status..."; }
  try {
    // This is verification only: never creates a new order or sends a second POST.
    const result = await verifyOrderSaved(requestId, 4);
    if (result?.ok === true && result.orderId) {
      completeOrderSuccess(result.orderId);
      return;
    }
    const message = result?.pending
      ? (result?.code ? result.message : (result?.message || "The order status is still being confirmed. Do not place the order again yet. Please check the status again shortly or verify the Orders sheet."))
      : (result?.message || "The saved order could not be confirmed. Please check the Orders sheet before submitting a new order.");
    if (result && result.pending !== true && result.ok !== true) {
      clearPendingOrderRequestId(); // Definite rejection: safe to correct the form and submit a new request.
      showOrderError(message);
    } else {
      showOrderError(message, { showVerify: true });
    }
  } catch (error) {
    console.error("[KAILU Order] Status verification failed:", error);
    showOrderError("Could not verify the order status. Do not submit again until you check the Orders sheet.", { showVerify: true });
  } finally {
    isSubmittingOrder = false;
    if (verifyButton && !verifyButton.hidden) { verifyButton.disabled = false; verifyButton.textContent = "Check Order Status"; }
    const submitButton = $("#whatsappOrder");
    if (submitButton) submitButton.disabled = false;
  }
}

async function submitOrder() {
  if (isSubmittingOrder) return;
  // If an earlier request has an unknown outcome, verify that SAME request first.
  // Never issue a second POST merely because the customer tapped Place Order again.
  if (pendingClientOrderId) {
    await checkPendingOrderStatus();
    if (pendingClientOrderId) {
      showOrderError("A previous order may already be saved. Use Check Order Status or check the Orders sheet before trying another order.", { showVerify: true });
    }
    return;
  }
  clearOrderError();
  const entries = cartLineItems();
  if (!entries.length) { showOrderError("Your cart is empty. Please add a catalog first."); return; }
  const missing = highlightMissingFields();
  if (missing.length) { showOrderError("Please complete the required fields highlighted above."); return; }
  const pinResult = validatePincode({ showIncomplete: true });
  if (!pinResult.valid) { $("#pincode").focus(); showOrderError(pinResult.message); return; }
  const city = $("#city").value.trim(), state = $("#state").value.trim();
  if (!city || !state) { showOrderError("Please enter City / District and State for this PIN code."); return; }
  for (const item of entries) {
    if (!isInStock(item.variant) || item.quantity > stockQuantity(item.variant)) {
      showOrderError(`${item.product.name} (${item.variant.size}) is no longer available in the selected quantity. Update your cart and try again.`);
      return;
    }
  }
  const mobileNumber = $("#mobileNumber").value.trim();
  const pincode = $("#pincode").value.trim();
  if (!/^[6-9]\d{9}$/.test(mobileNumber)) { $("#mobileNumber").focus(); showOrderError("Enter a valid 10-digit Indian mobile number."); return; }
  if (!/^\d{6}$/.test(pincode)) { $("#pincode").focus(); showOrderError("Enter a valid 6-digit PIN code."); return; }
  if (!GOOGLE_SCRIPT_URL.startsWith("https://script.google.com/macros/s/") || GOOGLE_SCRIPT_URL.includes("PASTE_YOUR")) {
    showOrderError("The Google Sheets order endpoint is not configured. Please contact the store."); return;
  }

  const total = entries.reduce((sum, item) => sum + Number(item.variant.price) * item.quantity, 0);
  const items = entries.map(({ product, variant, quantity, lineTotal }) => ({
    sku: variant.sku, productName: product.name, name: product.name, color: product.color || "",
    size: variant.size, quantity, qty: quantity, unitPrice: variant.price, lineTotal
  }));
  const totalQty = entries.reduce((sum, item) => sum + item.quantity, 0);
  // Keep one stable request ID until the outcome is confirmed. Retries therefore
  // reuse the same idempotency key instead of creating a duplicate order.
  const requestId = clientRequestId();
  const payload = new URLSearchParams({
    store: "KAILU CREATION™", clientRequestId: requestId,
    customerName: $("#customerName").value.trim(), mobileNumber,
    size: items.map(item => `${item.color} ${item.size}`.trim()).join("; "),
    qty: String(totalQty), houseBuilding: $("#houseBuilding").value.trim(),
    landmark: $("#landmark").value.trim(), roadArea: $("#roadArea").value.trim(),
    pincode, city, state, paymentMethod: "Cash on Delivery (COD)", currency: CURRENCY,
    total: String(total), items: JSON.stringify(items)
  });

  const submitButton = $("#whatsappOrder");
  const originalHtml = submitButton.innerHTML;
  isSubmittingOrder = true;
  submitButton.disabled = true;
  submitButton.textContent = "Submitting Order...";
  try {
    // Apps Script's opaque no-cors response cannot prove success. A network error
    // is treated as an unknown outcome, then the same request ID is verified.
    try {
      await fetch(GOOGLE_SCRIPT_URL, { method: "POST", mode: "no-cors", body: payload });
    } catch (networkError) {
      console.warn("[KAILU Order] POST response was unavailable; checking the same request ID before any retry:", networkError);
    }

    const result = await verifyOrderSaved(requestId, 4);
    if (result?.ok === true && result.orderId) {
      completeOrderSuccess(result.orderId);
      return;
    }

    // A non-pending server result is a confirmed backend rejection. A timeout or
    // missing callback is ambiguous: show a verification-only button, not a new POST.
    if (result?.code === "VERIFY_CALLBACK_MISSING" || result?.code === "VERIFY_ENDPOINT_LOAD_FAILED") {
      showOrderError(result.message, { showVerify: true });
    } else if (result && result.pending !== true && result.message && !/could not be confirmed/i.test(result.message)) {
      clearPendingOrderRequestId(); // Explicit backend rejection is not an unknown save outcome.
      showOrderError(result.message);
    } else {
      showOrderError(
        result?.message || "We couldn't confirm whether your order was saved. It may already be in the Orders sheet. Do not place it again yet; use Check Order Status or check the sheet first.",
        { showVerify: true }
      );
    }
  } catch (error) {
    console.error("[KAILU Order] Submission/verification error:", error);
    showOrderError(
      "Your order status is unknown. Do not submit a second order until you verify the Orders sheet.",
      { showVerify: true }
    );
  } finally {
    isSubmittingOrder = false;
    submitButton.disabled = false;
    submitButton.innerHTML = originalHtml;
  }
}

function returnToCatalogList() {
  const successModal = $("#orderSuccessModal");
  if (successModal) successModal.hidden = true;
  document.body.classList.remove("success-modal-open");
  closeCart();
  closeProductDetail({ replaceUrl: true });
  const url = new URL(window.location.href);
  url.searchParams.delete("catalog");
  url.hash = "products";
  history.replaceState({}, "", url.toString());
  const section = $("#products");
  if (section) window.scrollTo({ top: Math.max(0, section.getBoundingClientRect().top + window.scrollY - 12), behavior: "smooth" });
}

function openPhotoLightbox(items, index) {
  lightboxItems = items.filter(item => item.type === "video" || item.url || item.fallback);
  if (!lightboxItems.length) return;
  lightboxIndex = Math.max(0, Math.min(index, lightboxItems.length - 1));
  showLightboxItem(lightboxIndex);
  $("#photoLightbox").hidden = false;
  document.body.classList.add("photo-viewer-open");
}

function showLightboxItem(index) {
  if (!lightboxItems.length) return;
  lightboxIndex = (index + lightboxItems.length) % lightboxItems.length;
  const item = lightboxItems[lightboxIndex];
  const image = $("#photoLightboxImage");
  const video = $("#photoLightboxVideo");
  if (item.type === "video") {
    image.hidden = true;
    video.hidden = false;
    video.pause();
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.src = item.url;
    video.load();
    video.play().catch(() => { /* controls remain available if autoplay is blocked */ });
  } else {
    video.pause(); video.removeAttribute("src"); video.load(); video.hidden = true;
    image.hidden = false;
    configureImage(image, item.url, item.fallback, () => { image.hidden = true; showToast("This image is no longer available."); }, item.remoteFallback);
    image.alt = item.alt || "Catalog full-screen photo";
  }
}

function closePhotoLightbox() {
  const lightbox = $("#photoLightbox");
  lightbox.hidden = true;
  const video = $("#photoLightboxVideo");
  video.pause(); video.removeAttribute("src"); video.load(); video.hidden = true;
  $("#photoLightboxImage").hidden = false;
  document.body.classList.remove("photo-viewer-open");
  lightboxItems = [];
}

function openSharedCatalogFromUrl() {
  const sharedUrl = new URL(window.location.href);
  const id = sharedUrl.searchParams.get("catalog");
  if (!id || !productById.has(id)) return;

  // A direct shared link is initially the browser's current entry, with no
  // same-site catalog entry beneath it. Turn that entry into the catalog URL,
  // then push the shared product URL on top so Android/iOS Back closes the
  // popup before leaving the website. Refreshing the share URL repeats safely.
  try {
    const catalogUrl = new URL(sharedUrl.href);
    catalogUrl.searchParams.delete("catalog");
    catalogUrl.hash = "products";
    const baseState = {
      ...(history.state && typeof history.state === "object" ? history.state : {}),
      kailuUI: "catalog"
    };
    history.replaceState(baseState, "", catalogUrl.toString());
    history.pushState({ ...baseState, kailuUI: "detail", catalogId: String(id) }, "", sharedUrl.toString());
  } catch (_) { /* The detail still opens if History API is unavailable. */ }

  openingFromSharedUrl = true;
  openProductDetail(id, { fromUrl: true });
  openingFromSharedUrl = false;
}

// PRODUCT CARD INTERACTIONS
productGrid.addEventListener("click", event => {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  if (!target) return;
  const photoButton = target.closest("[data-card-photo]");
  if (photoButton) {
    const card = photoButton.closest(".catalog-card");
    const index = Number(photoButton.dataset.cardPhoto);
    const sourceIndex = Number(photoButton.dataset.sourceIndex ?? index);
    const product = productById.get(card?.dataset.productId);
    const image = product?.images?.[sourceIndex];
    if (card && image) {
      $$(".catalog-rail-thumb", card).forEach(button => {
        const selected = button === photoButton;
        button.classList.toggle("active", selected);
        button.setAttribute("aria-pressed", selected ? "true" : "false");
      });
      setCardMainImage(card, image);
    }
    return;
  }
  const share = target.closest("[data-share-product]");
  if (share) { event.preventDefault(); shareCatalog(share.dataset.shareProduct); return; }
  const open = target.closest("[data-open-product]");
  if (open) { event.preventDefault(); openProductDetail(open.dataset.openProduct); }
});

// DETAIL VIEW INTERACTIONS
$("body").addEventListener("click", event => {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  if (!target) return;
  if (target.closest("[data-detail-close]")) { closeProductDetail(); return; }
  if (target.id === "productDetailModal") { closeProductDetail(); return; }
  if (target.closest("[data-detail-prev]")) { showDetailMedia(detailMediaIndex - 1); renderDetailThumbnails(); return; }
  if (target.closest("[data-detail-next]")) { showDetailMedia(detailMediaIndex + 1); renderDetailThumbnails(); return; }
  const mediaThumb = target.closest("[data-detail-media]");
  if (mediaThumb) { showDetailMedia(Number(mediaThumb.dataset.detailMedia), { playVideo: detailMedia[Number(mediaThumb.dataset.detailMedia)]?.type === "video" }); renderDetailThumbnails(); return; }
  const colorButton = target.closest("[data-detail-color]");
  if (colorButton) { openProductDetail(colorButton.dataset.detailColor, { replaceUrl: true }); return; }
  const sizeButton = target.closest("[data-detail-sku]");
  if (sizeButton && !sizeButton.disabled) {
    currentDetailVariant = getVariant(currentDetailProduct, sizeButton.dataset.detailSku);
    currentDetailQuantity = 1;
    renderDetailInfo();
    return;
  }
  const quantityButton = target.closest("[data-detail-qty]");
  if (quantityButton && currentDetailVariant) {
    currentDetailQuantity = Math.max(1, Math.min(stockQuantity(currentDetailVariant) || 1, currentDetailQuantity + Number(quantityButton.dataset.detailQty)));
    renderDetailInfo();
    return;
  }
  if (target.closest("#detailAddToCart")) { addToCart(currentDetailProduct, currentDetailVariant, currentDetailQuantity); return; }
  if (target.closest("#detailBuyNow")) { buyNow(currentDetailProduct, currentDetailVariant, currentDetailQuantity); return; }
  if (target.closest("[data-detail-share]")) { shareCatalog(currentDetailProduct?.id); return; }
  if (target.closest("#detailMainImage")) {
    openPhotoLightbox(detailMedia, detailMediaIndex);
  }
});

// CART INTERACTIONS
cartItems.addEventListener("click", event => {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  if (!target) return;
  const remove = target.closest("[data-cart-remove]");
  if (remove) {
    cartState = cartState.filter(item => item.sku !== remove.dataset.cartRemove);
    renderCart();
    return;
  }
  const qtyButton = target.closest("[data-cart-qty]");
  if (qtyButton) {
    const sku = qtyButton.dataset.sku;
    const entry = cartState.find(item => item.sku === sku);
    const match = variantBySku.get(sku);
    if (!entry || !match) return;
    const next = entry.quantity + Number(qtyButton.dataset.cartQty);
    if (next <= 0) cartState = cartState.filter(item => item.sku !== sku);
    else if (next > stockQuantity(match.variant)) showToast(`Only ${stockQuantity(match.variant)} item(s) are available.`);
    else entry.quantity = next;
    renderCart();
  }
});

// PIN validation and form feedback.
$("#pincode").addEventListener("input", () => {
  const field = $("#pincode");
  field.value = field.value.replace(/\D/g, "").slice(0, 6);
  const pinChanged = field.value !== lastPincodeValue;
  lastPincodeValue = field.value;
  if (pinChanged) {
    $("#city").value = ""; $("#state").value = "";
    setManualLocationEntry(true);
  }
  if (field.value.length === 6) validatePincode();
  else {
    $("#city").value = ""; $("#state").value = ""; setManualLocationEntry(true);
    field.classList.remove("field-invalid"); field.setAttribute("aria-invalid", "false");
    setPincodeFeedback(field.value ? `Enter ${6 - field.value.length} more digit(s) to look up City and State.` : "Enter a 6-digit PIN code to fill City and State automatically.", "info");
  }
  clearOrderError();
});
$("#pincode").addEventListener("blur", () => {
  if ($( "#pincode").value.length === 6) validatePincode();
});
$("#mobileNumber").addEventListener("input", () => {
  const field = $("#mobileNumber");
  field.value = field.value.replace(/\D/g, "").slice(0, 10);
  if (field.value && !/^[6-9]\d{9}$/.test(field.value)) {
    field.classList.add("field-invalid"); field.setAttribute("aria-invalid", "true");
  } else {
    field.classList.remove("field-invalid"); field.setAttribute("aria-invalid", "false");
  }
  clearOrderError();
});
$$(".customer-input").forEach(field => field.addEventListener("input", () => {
  field.classList.remove("field-invalid"); field.setAttribute("aria-invalid", "false"); clearOrderError();
}));

// Preserve cart entry behavior: Add to Cart is separate from checkout.
$("#cartShortcut").addEventListener("click", () => openCart({ checkout: false }));
$("#closeCart").addEventListener("click", closeCart);
overlay.addEventListener("click", closeCart);
$("#continueShoppingEmpty").addEventListener("click", closeCart);
$("#proceedCheckout").addEventListener("click", () => {
  checkoutStarted = true;
  renderCart();
  const first = $("#customerName");
  if (first) first.focus({ preventScroll: true });
});
$("#continueToDetails").addEventListener("click", () => {
  checkoutStarted = true;
  renderCart();
  const first = $("#customerName");
  if (first) first.focus({ preventScroll: true });
});
$("#whatsappOrder").addEventListener("click", submitOrder);
$("#verifyOrderStatus").addEventListener("click", checkPendingOrderStatus);
$("#continueShoppingSuccess").addEventListener("click", returnToCatalogList);
$("#closePhotoLightbox").addEventListener("click", closePhotoLightbox);
$("#photoLightbox").addEventListener("click", event => { if (event.target.id === "photoLightbox") closePhotoLightbox(); });
$("#photoLightboxPrev").addEventListener("click", () => showLightboxItem(lightboxIndex - 1));
$("#photoLightboxNext").addEventListener("click", () => showLightboxItem(lightboxIndex + 1));
searchInput.addEventListener("input", renderProducts);
categoryFilter.addEventListener("change", renderProducts);
sortSelect.addEventListener("change", renderProducts);

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    if (!$("#photoLightbox").hidden) closePhotoLightbox();
    else if (!$("#productDetailModal").hidden) closeProductDetail();
    else if (!$("#orderSuccessModal").hidden) returnToCatalogList();
    else if (!cartDrawer.hidden) closeCart();
  }
  if (!$("#photoLightbox").hidden && event.key === "ArrowRight") showLightboxItem(lightboxIndex + 1);
  if (!$("#photoLightbox").hidden && event.key === "ArrowLeft") showLightboxItem(lightboxIndex - 1);
});

window.addEventListener("popstate", () => {
  const catalogId = new URLSearchParams(window.location.search).get("catalog");
  if (catalogId && productById.has(catalogId)) openProductDetail(catalogId, { fromUrl: true });
  else if (!$("#productDetailModal").hidden) closeProductDetail({ fromPopstate: true });
  if (!$("#photoLightbox").hidden) closePhotoLightbox();
  if (!cartDrawer.hidden) closeCart();
  const successModal = $("#orderSuccessModal");
  if (successModal && !successModal.hidden) { successModal.hidden = true; document.body.classList.remove("success-modal-open"); }
});

// The storefront renders immediately from the bundled snapshot, then the sync
// module calls this function when a fresh workbook has been validated.
window.KAILU_APPLY_CATALOG = function applyCatalog(rawCatalog, syncStatus) {
  const nextProducts = normalizeCatalogProductList(rawCatalog);
  if (!nextProducts.length) throw new Error("Refusing to apply an empty or invalid catalog.");
  const openDetailId = currentDetailProduct?.id || "";
  const selectedSku = currentDetailVariant?.sku || "";
  products = nextProducts;
  window.KAILU_PRODUCT_CATALOG = rawCatalog;
  if (syncStatus) window.KAILU_CATALOG_SYNC_STATUS = syncStatus;
  rebuildProductIndexes();
  // Workbook URLs may have changed for a product; do not reuse old video probes.
  videoAvailability = new Map();

  // Keep cart rows whose SKUs still exist. Removed variants cannot accidentally
  // point to another product after a workbook update.
  cartState = cartState.filter(item => variantBySku.has(item.sku));
  renderCategories();
  renderProducts();
  renderCart();

  const modal = $("#productDetailModal");
  if (openDetailId && modal && !modal.hidden) {
    const updatedProduct = productById.get(openDetailId);
    if (updatedProduct) {
      currentDetailProduct = updatedProduct;
      currentDetailVariant = getVariant(updatedProduct, selectedSku) || firstAvailableVariant(updatedProduct);
      renderDetailInfo();
      updateDetailMediaForProduct(updatedProduct);
    } else {
      closeProductDetail({ replaceUrl: true });
    }
  }
  return true;
};

window.KAILU_UPDATE_CATALOG_STATUS = function updateCatalogStatus(status) {
  window.KAILU_CATALOG_SYNC_STATUS = status || {};
  renderProducts();
};

// Initialize immediately from the bundled last-known-good catalog. Excel is fetched
// in the background by catalog-sync.js, so the page never waits for a CDN to paint.
ensureDetailModal();
renderCategories();
renderProducts();
renderCart();
// Query-string sharing links reopen the exact color/catalog on refresh.
openSharedCatalogFromUrl();

// Mobile browsers may discard the page after an opaque POST response. Restore
// the same request ID and verify read-only; never submit a second POST on reload.
if (pendingClientOrderId) {
  const verifyButton = $("#verifyOrderStatus");
  if (verifyButton) verifyButton.hidden = false;
  window.setTimeout(async () => {
    const requestId = pendingClientOrderId;
    if (!requestId || isSubmittingOrder) return;
    try {
      const result = await verifyOrderSaved(requestId, 2);
      if (pendingClientOrderId === requestId && result?.ok === true && result.orderId) {
        completeOrderSuccess(result.orderId);
      }
    } catch (error) {
      console.warn("[KAILU Order] Restored request verification did not complete; keep the request ID for manual status checking.", error);
    }
  }, 500);
}
