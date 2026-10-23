// KAILU CREATION — catalog products and WhatsApp order settings.
// IMPORTANT: Replace WHATSAPP_NUMBER with your number including country code,
// digits only. Example India: "919876543210" (no +, spaces, or hyphens).

const WHATSAPP_NUMBER = "918160621151"; // Optional WhatsApp fallback
const CATALOG_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw5iZVZUar2NKIoAWmQDKCLwyUntGFjNL9veaElyUSowmEeXcm6c3ckJX-rC0v9V564/exec";
const ORDER_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxg3I-214qS0-hZE_JWUBZEZf60u2nw144cIlQi-PGG3E4eAdz9vPjTWw2AQtnlbkd05w/exec";
const CURRENCY = "INR";

const PINCODE_DATA = window.KAILU_PINCODE_DATA || Object.create(null);
window.KAILU_LOCAL_VIDEO_ASSETS = ["videos/catalog-1.mp4", "videos/catalog-3.mp4", "videos/catalog-4.mp4"];

function setPincodeFeedback(message, status = "info") {
  const feedback = $("#pincodeFeedback");
  if (!feedback) return;
  feedback.textContent = message;
  feedback.dataset.status = status;
}

function clearAutoLocationFields() {
  const city = $("#city");
  const state = $("#state");
  if (city) city.value = "";
  if (state) state.value = "";
  if (city) city.classList.remove("field-invalid");
  if (state) state.classList.remove("field-invalid");
}

// Uses the supplied courier serviceability list. District is shown in the City field.
function validatePincode(options = {}) {
  const pincodeField = $("#pincode");
  const cityField = $("#city");
  const stateField = $("#state");
  if (!pincodeField || !cityField || !stateField) {
    return { valid: false, message: "Pincode validation is unavailable." };
  }

  const pin = pincodeField.value.trim();
  const showIncomplete = options.showIncomplete === true;
  pincodeField.setAttribute("aria-invalid", "false");

  if (!/^[0-9]{6}$/.test(pin)) {
    clearAutoLocationFields();
    if (showIncomplete) {
      const message = pin ? "Please enter a valid 6-digit PIN code." : "Please enter your 6-digit PIN code.";
      pincodeField.classList.add("field-invalid");
      pincodeField.setAttribute("aria-invalid", "true");
      setPincodeFeedback(message, "error");
      return { valid: false, message };
    }
    pincodeField.classList.remove("field-invalid");
    if (pin.length > 0) {
      setPincodeFeedback(`Enter ${Math.max(0, 6 - pin.length)} more digit${6 - pin.length === 1 ? "" : "s"} to look up City and State.`, "info");
    } else {
      setPincodeFeedback("Enter a 6-digit PIN code to fill City and State automatically.", "info");
    }
    return { valid: false, message: "Enter a valid 6-digit PIN code." };
  }

  const match = PINCODE_DATA[pin];
  if (!match) {
    clearAutoLocationFields();
    const message = `PIN code ${pin} was not found in the courier serviceability list. Please check the PIN code.`;
    pincodeField.classList.add("field-invalid");
    pincodeField.setAttribute("aria-invalid", "true");
    setPincodeFeedback(`✕ ${message}`, "error");
    return { valid: false, message };
  }

  cityField.value = match.district || "";
  stateField.value = match.state || "";
  cityField.classList.remove("field-invalid");
  stateField.classList.remove("field-invalid");

  if (!match.cod) {
    const message = `PIN code found (${match.district}, ${match.state}), but Cash on Delivery is not available for this PIN. Please use another PIN code.`;
    pincodeField.classList.add("field-invalid");
    pincodeField.setAttribute("aria-invalid", "true");
    setPincodeFeedback(`✕ ${message}`, "error");
    return { valid: false, message, record: match };
  }

  pincodeField.classList.remove("field-invalid");
  pincodeField.setAttribute("aria-invalid", "false");
  setPincodeFeedback(`✓ Delivery available for ${match.district}, ${match.state} (Cash on Delivery).`, "success");
  return { valid: true, message: "Pincode verified.", record: match };
}

function stableCatalogId(key) {
  let hash = 2166136261;
  for (const character of String(key)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

const CATALOG_SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "Free Size"];
const CATALOG_COLOR_SURFACES = {
  blue: "#e9dfd0", mustard: "#f0e4c9", cream: "#e4e5d8", black: "#e4e5d8",
  red: "#f0dddd", green: "#dfe9df", pink: "#f4e1e8", maroon: "#eadce0",
  beige: "#eee5d7", brown: "#e7dbcf", white: "#f3f1ec", gold: "#f1e4c6",
  "lemon yellow": "#f4edca", "mint green": "#dfeee6", "aqua blue": "#dcedef"
};
function getColorSurface(colorName) {
  return CATALOG_COLOR_SURFACES[String(colorName || "").trim().toLowerCase()] || "#eee7dd";
}
function catalogNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value ?? "").replace(/,/g, "").replace(/[^0-9.\-]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) && cleaned !== "" ? number : fallback;
}
function normalizeCatalogText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}
function normalizeDriveAsset(value, kind) {
  const raw = normalizeCatalogText(value);
  if (!raw) return "";
  const isDrive = /drive\.google\.com/i.test(raw);
  const idMatch = raw.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || raw.match(/[?&]id=([a-zA-Z0-9_-]+)/) || raw.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (!isDrive || !idMatch) return raw;
  const fileId = encodeURIComponent(idMatch[1]);
  return kind === "video"
    ? `https://drive.google.com/uc?export=download&id=${fileId}`
    : `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`;
}
function normalizeGitHubAsset(value) {
  const raw = normalizeCatalogText(value);
  if (!raw) return "";
  // Accept either raw.githubusercontent.com links or GitHub "blob" links from the Sheet.
  return raw
    .replace(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\//i,
      "https://raw.githubusercontent.com/$1/$2/$3/")
    .replace(/^https?:\/\/raw\.githubusercontent\.com\//i,
      "https://raw.githubusercontent.com/");
}
function normalizeCatalogAsset(value, kind) {
  return normalizeGitHubAsset(normalizeDriveAsset(value, kind));
}
function localPhotoFallback(catalogIndex, imageIndex = 1) {
  const catalogNo = Math.max(1, Math.min(4, Number(catalogIndex) + 1 || 1));
  const photoNo = Math.max(1, Math.min(4, Number(imageIndex) || 1));
  return `images/catalog-${catalogNo}-${photoNo}.JPG`;
}
function githubPhotoNumber(value, fallbackNumber = 1) {
  const name = String(value || "").split(/[?#]/)[0].split("/").pop() || "";
  const match = name.match(/-(\d+)\.(?:webp|jpe?g|png|avif)$/i);
  return match ? Math.max(1, Math.min(4, Number(match[1]) || fallbackNumber)) : fallbackNumber;
}
function normalizeRating(value) {
  let rating = catalogNumber(value, 0);
  // A value such as 48 in the supplied sheet likely means 4.8/5.
  if (rating > 5 && rating <= 50) rating /= 10;
  return Math.max(0, Math.min(5, rating));
}
function getVariantsForColor(product, colorName = product.selectedColor) {
  return (product.variants || []).filter(variant =>
    catalogNumber(variant.inventory, 0) > 0 &&
    String(variant.colorName || "Default") === String(colorName || "Default")
  );
}
function getSelectedVariant(product, colorName = product.selectedColor, size = "") {
  const choices = getVariantsForColor(product, colorName);
  return choices.find(variant => String(variant.size || "") === String(size || "")) || choices[0] || (product.variants || [])[0] || {
    price: product.price || 0, mrp: product.mrp || 0, rating: product.rating || 0,
    reviews: product.reviews || 0, fabric: product.fabric || "", description: product.description || "",
    images: [product.image].filter(Boolean), video: product.video || "", inventory: 0, size: "", colorName: colorName || ""
  };
}
function getAvailableSizes(product, colorName = product.selectedColor) {
  const active = getVariantsForColor(product, colorName);
  const sizes = [...new Set(active.map(variant => normalizeCatalogText(variant.size)).filter(Boolean))];
  return sizes.sort((a, b) => {
    const ai = CATALOG_SIZE_ORDER.indexOf(a), bi = CATALOG_SIZE_ORDER.indexOf(b);
    if (ai < 0 && bi < 0) return a.localeCompare(b);
    if (ai < 0) return 1;
    if (bi < 0) return -1;
    return ai - bi;
  });
}
function getProductColorList(product) {
  return [...new Set((product.variants || []).filter(v => catalogNumber(v.inventory, 0) > 0).map(v => normalizeCatalogText(v.colorName || "Default")))];
}

function makeFallbackProduct(config) {
  const imageList = [1, 2, 3, 4, 5].map(number => config.images[number - 1]).filter(Boolean);
  const variants = CATALOG_SIZE_ORDER.filter(size => config.skus[size]).map(size => ({
    sku: config.skus[size], size, colorName: config.colorName, inventory: 99,
    price: config.price, mrp: config.mrp, rating: config.rating, reviews: config.reviews,
    tag: config.tag || "SALE", fabric: config.fabric, description: config.description,
    images: imageList, video: config.video || ""
  }));
  return {
    id: stableCatalogId(`${config.groupCode}|${config.name}`), groupCode: String(config.groupCode),
    name: config.name, category: config.category, price: config.price, mrp: config.mrp,
    rating: config.rating, reviews: config.reviews, tag: config.tag || "SALE", fabric: config.fabric,
    description: config.description, colorName: config.colorName, colors: [config.colorName],
    selectedColor: config.colorName, selectedSize: "", color: getColorSurface(config.colorName),
    variants, sku: variants.map(v => v.sku).join(" "),
    image: imageList[0] || "images/kailu-logo-mark-tm.png", gallery: imageList.slice(1), video: config.video || ""
  };
}

// Local fallback lets the current four catalogs remain visible while the private Sheet feed is being connected.
let products = [
  makeFallbackProduct({groupCode:1, name:"Navy Blue Floral Printed Anarkali Kurta Pant Dupatta Set", category:"3-Piece Kurti Set", colorName:"Blue", price:349, mrp:1499, rating:4.2, reviews:5030, tag:"SALE", fabric:"Rayon", description:"3-piece ethnic suit with a matching printed dupatta and traditional motifs.", images:["https://raw.githubusercontent.com/Kaklotar9985/KAILU-CREATION-V2/main/images/Product_Photos/NavyBlue_Gown-1.webp","https://raw.githubusercontent.com/Kaklotar9985/KAILU-CREATION-V2/main/images/Product_Photos/NavyBlue_Gown-2.webp","https://raw.githubusercontent.com/Kaklotar9985/KAILU-CREATION-V2/main/images/Product_Photos/NavyBlue_Gown-3.webp","https://raw.githubusercontent.com/Kaklotar9985/KAILU-CREATION-V2/main/images/Product_Photos/NavyBlue_Gown-4.webp"], video:"https://raw.githubusercontent.com/Kaklotar9985/KAILU-CREATION-V2/main/videos/Product_Videos/NavyBlue_Gown.mp4", skus:{"S":"NavyBlue_Gown_S","M":"NavyBlue_Gown_M","L":"NavyBlue_Gown_L","XL":"NavyBlue_Gown_XL","XXL":"NavyBlue_Gown_XXL","3XL":"NavyBlue_Gown_3XL"}}),
  makeFallbackProduct({groupCode:2, name:"Mustard Yellow Floral Printed Kurta Pant Dupatta Set", category:"3-Piece Kurti Set", colorName:"Mustard", price:349, mrp:1499, rating:4.4, reviews:6531, tag:"SALE", fabric:"Cotton Blend", description:"3-piece ethnic suit with a matching printed dupatta and traditional motifs.", images:["images/catalog-2-1.JPG","images/catalog-2-2.JPG","images/catalog-2-3.JPG","images/catalog-2-4.JPG"], video:"", skus:{"S":"Mustard_Yellow_S","M":"Mustard_Yellow_M","L":"Mustard_Yellow_L","XL":"Mustard_Yellow_XL","XXL":"Mustard_Yellow_XXL","3XL":"Mustard_Yellow_3XL"}}),
  makeFallbackProduct({groupCode:3, name:"Cream Ethnic Printed Kurta with Bottomwear and Dupatta", category:"3-Piece Kurti Set", colorName:"Cream", price:349, mrp:1499, rating:4.6, reviews:7609, tag:"SALE", fabric:"Cotton Blend", description:"3-piece ethnic suit with a matching printed dupatta and traditional motifs.", images:["images/catalog-3-1.JPG","images/catalog-3-2.JPG","images/catalog-3-3.JPG","images/catalog-3-4.JPG"], video:"videos/catalog-3.mp4", skus:{"S":"Cream_Ethnic_S","M":"Cream_Ethnic_M","L":"Cream_Ethnic_L","XL":"Cream_Ethnic_XL","XXL":"Cream_Ethnic_XXL","3XL":"Cream_Ethnic_3XL"}}),
  makeFallbackProduct({groupCode:4, name:"Black Kurti With Bottomwear", category:"Corset", colorName:"Black", price:349, mrp:1999, rating:4.8, reviews:5574, tag:"SALE", fabric:"Rayon", description:"Black kurti with embroidered details and matching bottomwear.", images:["images/catalog-4-1.JPG","images/catalog-4-2.JPG","images/catalog-4-3.JPG","images/catalog-4-4.JPG"], video:"videos/catalog-4.mp4", skus:{"S":"Black_Kurti_Paint_S","M":"Black_Kurti_Paint_M","L":"Black_Kurti_Paint_L","XL":"Black_Kurti_Paint_XL","XXL":"Black_Kurti_Paint_XXL","3XL":"Black_Kurti_Paint_3XL"}})
];

function buildCatalogProductsFromRows(rows) {
  if (!Array.isArray(rows)) return [];
  const groups = new Map();
  const productImageFields = ["image1", "image2", "image3", "image4", "image5"];
  rows.forEach(row => {
    if (!row || typeof row !== "object") return;
    const groupCode = normalizeCatalogText(row.groupCode ?? row["Group Code"]);
    const name = normalizeCatalogText(row.productName ?? row.name ?? row["Product Name"]);
    const category = normalizeCatalogText(row.category ?? row["Category"]);
    const colorName = normalizeCatalogText(row.color ?? row.colorName ?? row["Color"]) || "Default";
    const size = normalizeCatalogText(row.size ?? row["Size"]);
    const inventory = catalogNumber(row.inventory ?? row["Inventory"], 0);
    const sellingPrice = catalogNumber(row.sellPrice ?? row.price ?? 0, 0);
    if (!groupCode || !name || !size || inventory <= 0 || sellingPrice <= 0) return;

    const groupKey = `${groupCode}::${name.toLowerCase()}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        groupCode, name, category, tag: normalizeCatalogText(row.tag ?? row["tag"]),
        byVariant: new Map()
      });
    }
    const group = groups.get(groupKey);
    if (!group.category && category) group.category = category;
    const images = [...new Set(productImageFields.map(field => normalizeCatalogAsset(row[field] ?? row[({image1:"image1FrontLink",image2:"image2Link",image3:"image3Link",image4:"image4Link",image5:"image5Link"})[field]] ?? "", "image")).filter(Boolean))];
    const video = normalizeCatalogAsset(row.video ?? row.videoLink ?? "", "video");
    const rating = normalizeRating(row.rating ?? 0);
    const tagText = normalizeCatalogText(row.tag ?? "");
    const tag = tagText.toLowerCase() === "sell" ? "SALE" : tagText;
    const sku = normalizeCatalogText(row.sku ?? "");
    const variant = {
      sku, size, colorName, inventory,
      price: catalogNumber(row.sellPrice ?? row.price ?? 0, 0),
      mrp: catalogNumber(row.mrpPrice ?? row.mrp ?? 0, 0),
      rating, reviews: Math.round(catalogNumber(row.reviews ?? 0, 0)),
      tag, fabric: normalizeCatalogText(row.fabric ?? ""),
      description: normalizeCatalogText(row.description ?? ""),
      images, video
    };
    const variantKey = `${colorName.toLowerCase()}::${size.toLowerCase()}`;
    group.byVariant.set(variantKey, variant); // If a SKU/size was edited in the sheet, the latest row wins.
  });

  const result = [];
  for (const group of groups.values()) {
    const variants = [...group.byVariant.values()].filter(v => v.inventory > 0 && v.size);
    if (!variants.length) continue; // All sizes at Inventory 0: hide the catalog completely.
    const colors = [...new Set(variants.map(v => v.colorName))];
    const initialColor = colors[0];
    const initialVariant = variants.find(v => v.colorName === initialColor) || variants[0];
    // Keep every photo supplied by every size/colour row, not only the first row.
    const allImages = [...new Set(variants.flatMap(variant => variant.images || []).filter(Boolean))];
    const assetNumber = result.length + 1; // Match the ordered local catalog assets (01, 02, 03, 04), even if Sheet codes are duplicated.
    // The ZIP's local product photos are a safety net when the Sheet has fewer than four photos.
    if (assetNumber >= 1 && assetNumber <= 4 && allImages.length < 4) {
      for (let photoNumber = 1; photoNumber <= 4 && allImages.length < 4; photoNumber++) {
        const localPhoto = `images/catalog-${assetNumber}-${photoNumber}.JPG`;
        if (!allImages.includes(localPhoto)) allImages.push(localPhoto);
      }
    }
    if (!allImages.length) allImages.push("images/kailu-logo-mark-tm.png");
    const stableKey = `${group.groupCode}|${group.name}`;
    const suppliedVideo = variants.map(variant => variant.video).find(Boolean) || "";
    const localVideo = assetNumber >= 1 && assetNumber <= 4 ? `videos/catalog-${assetNumber}.mp4` : "";
    const videoFallbackExists = localVideo && window.KAILU_LOCAL_VIDEO_ASSETS?.includes(localVideo);
    result.push({
      id: stableCatalogId(stableKey), groupCode: group.groupCode, name: group.name,
      category: group.category || "Other", price: initialVariant.price, mrp: initialVariant.mrp,
      rating: initialVariant.rating, reviews: initialVariant.reviews,
      tag: "", fabric: initialVariant.fabric, description: initialVariant.description,
      colors, colorName: initialColor, selectedColor: initialColor, selectedSize: "",
      color: getColorSurface(initialColor), variants,
      sku: variants.map(v => v.sku).filter(Boolean).join(" "),
      image: allImages[0], gallery: allImages.slice(1), video: suppliedVideo || (videoFallbackExists ? localVideo : "")
    });
  }
  return result;
}

function loadCatalogFromGoogleSheet() {
  if (!CATALOG_SCRIPT_URL || !CATALOG_SCRIPT_URL.startsWith("https://script.google.com/macros/s/")) {
    console.warn("KAILU live catalog feed is not configured; showing the built-in catalog fallback.");
    return;
  }
  let settled = false;
  const script = document.createElement("script");
  const timeout = window.setTimeout(() => {
    if (settled) return;
    settled = true;
    script.remove();
    console.warn("KAILU live catalog feed did not respond; showing the built-in catalog fallback.");
  }, 15000);
  window.KAILU_CATALOG_CALLBACK = payload => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeout);
    script.remove();
    if (!payload || payload.ok !== true || !Array.isArray(payload.rows)) {
      console.warn("KAILU live catalog feed reported an error; showing the built-in catalog fallback.", payload && payload.message);
      return;
    }
    const liveProducts = buildCatalogProductsFromRows(payload.rows);
    if (!liveProducts.length) {
      console.warn("KAILU live catalog feed returned no in-stock catalog variants; showing the built-in catalog fallback.");
      return;
    }
    products = liveProducts;
    renderCategories();
    renderProducts();
    renderCart();
  };
  script.async = true;
  script.onerror = () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeout);
    script.remove();
    console.warn("KAILU live catalog feed could not load; showing the built-in catalog fallback.");
  };
  script.src = `${CATALOG_SCRIPT_URL}?action=catalog&callback=KAILU_CATALOG_CALLBACK&_=${Date.now()}`;
  document.head.appendChild(script);
}

const $ = (selector) => document.querySelector(selector);
const productGrid = $("#productGrid");
let openCatalogId = null;
const searchInput = $("#searchInput");
const categoryFilter = $("#categoryFilter");
const sortSelect = $("#sortSelect");
const cartDrawer = $("#cartDrawer");
const overlay = $("#overlay");
const cartItems = $("#cartItems");
const cartEmpty = $("#cartEmpty");
const cartBottom = $("#cartBottom");
const toast = $("#toast");
let cart = {};
const cartUnitSizes = {};
const cartUnitColors = {};
const WISHLIST_STORAGE_KEY = "kailuCreationWishlistV1";
let wishlistIds = new Set();
try {
  const savedWishlist = JSON.parse(localStorage.getItem(WISHLIST_STORAGE_KEY) || "[]");
  if (Array.isArray(savedWishlist)) wishlistIds = new Set(savedWishlist.map(Number).filter(Number.isFinite));
} catch (error) {
  wishlistIds = new Set();
}
let toastTimer;

const money = (amount) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: CURRENCY, maximumFractionDigits: 2
}).format(amount);
const catalogMoney = (amount) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: CURRENCY, maximumFractionDigits: 0
}).format(amount);

function renderCategories() {
  const selected = categoryFilter.value || "all";
  while (categoryFilter.options.length > 1) categoryFilter.remove(1);
  [...new Set(products.map(p => p.category).filter(Boolean))].sort().forEach(category => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categoryFilter.appendChild(option);
  });
  categoryFilter.value = [...categoryFilter.options].some(option => option.value === selected) ? selected : "all";
}

function getVisibleProducts() {
  const query = searchInput.value.trim().toLowerCase();
  let visible = products.filter(p => {
    const matchesQuery = `${p.name} ${p.category} ${p.description} ${p.fabric || ""} ${p.sku || ""} ${(p.colors || []).join(" ")}`.toLowerCase().includes(query);
    const matchesCategory = categoryFilter.value === "all" || p.category === categoryFilter.value;
    return matchesQuery && matchesCategory;
  });
  if (sortSelect.value === "low") visible.sort((a,b) => catalogNumber(getSelectedVariant(a).price ?? a.price) - catalogNumber(getSelectedVariant(b).price ?? b.price));
  if (sortSelect.value === "high") visible.sort((a,b) => catalogNumber(getSelectedVariant(b).price ?? b.price) - catalogNumber(getSelectedVariant(a).price ?? a.price));
  if (sortSelect.value === "name") visible.sort((a,b) => a.name.localeCompare(b.name));
  return visible;
}

function renderProducts() {
  const restoreCatalogId = openCatalogId;
  const visible = getVisibleProducts();
  productGrid.replaceChildren();
  $("#emptyProducts").hidden = visible.length !== 0;
  $("#productSummary").textContent = `${visible.length} catalog${visible.length === 1 ? "" : "s"} to explore`;
  visible.forEach((product, productIndex) => {
    const colorName = product.selectedColor || product.colors?.[0] || product.colorName || "Default";
    const sizes = getAvailableSizes(product, colorName);
    if (!sizes.includes(product.selectedSize)) product.selectedSize = "";
    const selectedSize = product.selectedSize || "";
    const displayVariant = getSelectedVariant(product, colorName, selectedSize);
    const images = [...new Set([...(displayVariant.images || []), product.image, ...(product.gallery || [])].filter(Boolean))];
    const mainImage = images[0] || "images/kailu-logo-mark-tm.png";
    const galleryImages = images.slice(1);
    const stableCatalogIndex = Math.max(0, products.findIndex(item => item.id === product.id));
    const suppliedProductVideo = displayVariant.video || product.video || "";
    // Prefer the provided direct GitHub Raw URL. Use a bundled MP4 only as a fallback.
    const localCatalogVideo = `videos/catalog-${stableCatalogIndex + 1}.mp4`;
    const hasLocalCatalogVideo = (window.KAILU_LOCAL_VIDEO_ASSETS || []).includes(localCatalogVideo);

    const productVideo = suppliedProductVideo || (hasLocalCatalogVideo ? localCatalogVideo : "");
    const videoFallback = hasLocalCatalogVideo && productVideo !== localCatalogVideo
      ? localCatalogVideo : "";
    const price = catalogNumber(displayVariant.price ?? product.price, 0);
    const mrp = catalogNumber(displayVariant.mrp ?? product.mrp, 0);
    const rating = normalizeRating(displayVariant.rating ?? product.rating);
    const reviews = Math.round(catalogNumber(displayVariant.reviews ?? product.reviews, 0));
    const tag = (displayVariant.tag || product.tag || "").toLowerCase() === "sell" ? "SALE" : (displayVariant.tag || product.tag || "");
    const fabric = displayVariant.fabric || product.fabric || "";
    const description = displayVariant.description || product.description || "";
    const colors = [...new Set((product.colors || [colorName]).filter(Boolean))];
    const colorSwatches = colors.map(color => {
      const colorVariant = getVariantsForColor(product, color)[0] || (product.variants || []).find(v => String(v.colorName) === String(color));
      const swatchImage = colorVariant?.images?.[0] || product.image || mainImage;
      const active = color === colorName;
      return `<button type="button" class="product-color-swatch${active ? " active" : ""}" data-color-swatch data-product-id="${product.id}" data-color-value="${escapeHtml(color)}" aria-pressed="${active}" aria-label="Choose colour ${escapeHtml(color)}" title="${escapeHtml(color)}"><span class="swatch-image-wrap"><img src="${escapeHtml(swatchImage)}" alt="" loading="lazy"></span><span class="swatch-color-name">${escapeHtml(color)}</span></button>`;
    }).join("");
    const sizeButtons = sizes.map(size => `<button type="button" class="product-size-option${size === selectedSize ? " active" : ""}" data-product-size="${product.id}" data-size-value="${escapeHtml(size)}" aria-pressed="${size === selectedSize}" aria-label="Select size ${escapeHtml(size)}">${escapeHtml(size)}</button>`).join("");
    const saved = wishlistIds.has(Number(product.id));
    const catalogLabel = String(stableCatalogIndex + 1).padStart(2, "0");
    const previewImages = [...new Set([...images.filter(Boolean).slice(1), ...[2, 3, 4].map(photoNo => localPhotoFallback(stableCatalogIndex, photoNo))].filter(src => src && src !== mainImage))].slice(0, 4);
    // If the catalog has only three alternate images, keep four preview slots for a fuller premium gallery.
    if (previewImages.length === 3) previewImages.push(previewImages[2]);
    const discountPercent = mrp > 0 && price <= mrp ? Math.round((1 - price / mrp) * 100) : 0;

    const card = document.createElement("article");
    card.className = "product-card";
    card.dataset.productId = String(product.id);
    card.innerHTML = `
      <div class="catalog-listing">
        <div class="catalog-preview" style="background:${getColorSurface(colorName)}">
          <img class="catalog-cover-image" src="${escapeHtml(mainImage)}" data-fallback-src="${escapeHtml(localPhotoFallback(stableCatalogIndex, githubPhotoNumber(mainImage, 1)))}" alt="${escapeHtml(product.name)}" loading="lazy" draggable="false">
          <span class="catalog-number-badge">SALE</span>
          ${previewImages.length ? `<div class="catalog-preview-strip" aria-label="Catalog photo previews">${previewImages.map((src, index) => `<button type="button" class="catalog-preview-thumb${index === 0 ? " active" : ""}" data-preview-photo="${product.id}" data-src="${escapeHtml(src)}" aria-label="Show catalog photo ${index + 2}"><img src="${escapeHtml(src)}" data-fallback-src="${escapeHtml(localPhotoFallback(stableCatalogIndex, githubPhotoNumber(src, index + 2)))}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}
        </div>
        <div class="catalog-listing-info">
          <span class="product-category">${escapeHtml(product.category || "KAILU COLLECTION")}</span>
          <h3 class="catalog-listing-title">${escapeHtml(product.name)}</h3>
          <p class="catalog-short-description">${escapeHtml(description || fabric || "Explore the KAILU CREATION collection.")}</p>
          <div class="catalog-pricing" aria-label="Catalog price">
            <strong class="catalog-current-price">${catalogMoney(price)}</strong>
            <span class="catalog-mrp">MRP <del>${catalogMoney(mrp)}</del></span>
            <span class="catalog-discount">${discountPercent}% OFF</span>
          </div>
          <button class="view-catalog-button" type="button" data-view-catalog="${product.id}"><span aria-hidden="true">▤</span> View Catalog <b aria-hidden="true">↗</b></button>
        </div>
      </div>
      <div class="product-detail-modal" data-product-modal="${product.id}" hidden role="dialog" aria-modal="true" aria-label="${escapeHtml(product.name)} catalog details">
        <div class="product-detail-backdrop" data-close-catalog="${product.id}"></div>
        <section class="product-detail-dialog">
          <button class="product-detail-close" type="button" data-close-catalog="${product.id}" aria-label="Close catalog details">×</button>
          <div class="product-detail-layout">
            <div class="product-detail-media">
              <div class="product-image" style="background:${getColorSurface(colorName)}">
                <img class="catalog-photo" src="${escapeHtml(mainImage)}" data-fallback-src="${escapeHtml(localPhotoFallback(stableCatalogIndex, githubPhotoNumber(mainImage, 1)))}" alt="${escapeHtml(product.name)}" role="button" tabindex="0" aria-label="Open full-size photo: ${escapeHtml(product.name)}" draggable="false" loading="lazy">
                <video class="catalog-video" data-main-video="${product.id}" data-video-fallback="${escapeHtml(videoFallback)}" controls muted preload="metadata" playsinline webkit-playsinline aria-label="${escapeHtml(product.name)} product video" hidden></video>
                <button class="gallery-next" type="button" aria-label="Next photo or video" data-gallery-next="${product.id}" hidden>›</button>
              </div>
              <div class="product-gallery" data-gallery="${product.id}">
                <div class="gallery-controls-row">
                  <div class="gallery-thumbnails" aria-label="Product photos">
                    <button type="button" class="gallery-thumb active" data-gallery-photo="${product.id}" data-src="${escapeHtml(mainImage)}" aria-label="Main photo">
                      <img src="${escapeHtml(mainImage)}" data-fallback-src="${escapeHtml(localPhotoFallback(stableCatalogIndex, githubPhotoNumber(mainImage, 1)))}" alt="" loading="lazy">
                    </button>
                    ${galleryImages.map((src, index) => `
                      <button type="button" class="gallery-thumb" data-gallery-photo="${product.id}" data-src="${escapeHtml(src)}" aria-label="Product photo ${index + 2}">
                        <img src="${escapeHtml(src)}" data-fallback-src="${escapeHtml(localPhotoFallback(stableCatalogIndex, githubPhotoNumber(src, index + 2)))}" alt="" loading="lazy">
                      </button>`).join("")}
                    <button type="button" class="gallery-thumb gallery-video-thumb" data-gallery-video="${product.id}" aria-label="Play ${escapeHtml(product.name)} video" ${productVideo ? "" : "hidden"}>
                      <span class="video-thumb-poster"><img src="${escapeHtml(mainImage)}" data-fallback-src="${escapeHtml(localPhotoFallback(stableCatalogIndex, githubPhotoNumber(mainImage, 1)))}" alt="" loading="lazy"><span class="video-play-icon" aria-hidden="true">▶</span><small>VIDEO</small></span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div class="product-info product-detail-info">
              <span class="product-category">${escapeHtml(product.category)}</span>
              <h3>${escapeHtml(product.name)}</h3>
              <div class="product-rating product-rating-pill" aria-label="Rated ${rating.toFixed(1)} out of 5 based on ${reviews.toLocaleString("en-IN")} reviews">
                <strong>${rating.toFixed(1)}</strong><span class="rating-star" aria-hidden="true">★</span>
                <span class="rating-divider" aria-hidden="true"></span><span class="rating-count">${reviews.toLocaleString("en-IN")} Ratings</span>
              </div>
              <div class="product-pricing" aria-label="Discounted price">
                <span class="price">${catalogMoney(price)}</span>
                <span class="mrp-label">MRP <del>${catalogMoney(mrp)}</del></span>
                <span class="discount-badge">${discountPercent}% OFF</span>
              </div>
              <small class="inclusive-tax-note">inclusive of all taxes</small>
              <section class="product-color-section" aria-label="Available colours">
                <div class="product-selection-heading"><strong>${colors.length > 1 ? "MORE COLORS" : "COLOR"}</strong>${colors.length > 1 ? `<span>${colors.length} options</span>` : ""}</div>
                <div class="product-color-swatches">${colorSwatches}</div>
              </section>
              <section class="product-size-block" aria-label="Select size">
                <div class="product-selection-heading"><strong>SELECT SIZE</strong><button class="size-chart-link" type="button" data-size-guide="${product.id}" aria-expanded="false">SIZE CHART <span aria-hidden="true">›</span></button></div>
                <div class="product-size-options" role="group" aria-label="Available clothing sizes">${sizeButtons || `<span class="stock-unavailable">Currently unavailable</span>`}</div>
                <p class="size-guide-note" data-size-guide-note="${product.id}" hidden>Available sizes are based on current stock. For fit or garment measurements, contact KAILU CREATION before ordering.</p>
              </section>
              <div class="product-detail-extra">
                ${fabric ? `<p class="product-fabric-line">Fabric: <strong>${escapeHtml(fabric)}</strong></p>` : ""}
                ${description ? `<p class="product-sheet-description">${escapeHtml(description)}</p>` : ""}
              </div>
              <div class="product-buy product-buy-reference">
                <div class="product-actions product-actions-reference">
                  <button class="add-button" type="button" data-add="${product.id}" ${sizes.length ? "" : "disabled"}><span aria-hidden="true">＋</span> ADD TO CART</button>
                  <button class="buy-now-button product-buy-now" type="button" data-buy="${product.id}" ${sizes.length ? "" : "disabled"}>BUY NOW</button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>`;
    productGrid.appendChild(card);

    card.querySelectorAll("[data-gallery-photo]").forEach(thumb => {
      const image = thumb.querySelector("img");
      image.addEventListener("error", () => {
        const fallback = image.dataset.fallbackSrc || "";
        const current = image.currentSrc || image.src || "";
        if (fallback && current !== new URL(fallback, document.baseURI).href && image.dataset.triedFallback !== "1") {
          image.dataset.triedFallback = "1";
          image.src = fallback;
          thumb.dataset.src = fallback;
          return;
        }
        if (thumb.dataset.src !== mainImage) thumb.remove();
        updateGalleryControls(card, product);
      });
      image.addEventListener("load", () => updateGalleryControls(card, product));
    });
    const mainPhoto = card.querySelector(".catalog-photo");
    const coverPhoto = card.querySelector(".catalog-cover-image");
    card.querySelectorAll(".catalog-preview-thumb img, .video-thumb-poster img").forEach(image => {
      image.addEventListener("error", () => {
        const fallback = image.dataset.fallbackSrc || "";
        if (fallback && image.dataset.triedFallback !== "1") {
          image.dataset.triedFallback = "1";
          image.src = fallback;
        }
      });
    });
    [mainPhoto, coverPhoto].filter(Boolean).forEach(image => {
      image.addEventListener("error", () => {
        const fallback = image.dataset.fallbackSrc || "";
        if (fallback && image.dataset.triedFallback !== "1") {
          image.dataset.triedFallback = "1";
          image.src = fallback;
        }
      });
    });
    const video = card.querySelector("[data-main-video]");
    const videoThumb = card.querySelector("[data-gallery-video]");
    video.muted = true;
    video.defaultMuted = true;
    video.preload = "none";
    video.playsInline = true;
    if (productVideo) video.dataset.videoSrc = productVideo;
    else videoThumb.hidden = true;
    video.addEventListener("error", () => {
      // If the direct GitHub video fails, retry using the bundled MP4 fallback.
      const fallbackSrc = video.dataset.videoFallback || "";
      const currentSrc = video.currentSrc || video.getAttribute("src") || "";
      if (fallbackSrc && currentSrc !== fallbackSrc && video.dataset.triedFallback !== "1") {
        video.dataset.triedFallback = "1";
        video.pause();
        video.src = fallbackSrc;
        video.load();
        const retry = video.play();
        if (retry && typeof retry.catch === "function") retry.catch(() => {});
        return;
      }
      video.pause();
      video.hidden = true;
      mainPhoto.hidden = false;
      // Keep the video thumbnail visible so customers can retry playback.
      videoThumb.hidden = false;
      updateGalleryControls(card, product);
      showToast("Video load nahi hua. GitHub Raw link aur MP4 file check karein; player par Play bhi dabayein.");
    });
    updateGalleryControls(card, product);
  });
  if (restoreCatalogId !== null && restoreCatalogId !== undefined) {
    const stillVisible = productGrid.querySelector(`[data-product-modal="${Number(restoreCatalogId)}"]`);
    if (stillVisible) openCatalogDetail(restoreCatalogId, { focus: false });
    else closeCatalogDetail({ restoreFocus: false });
  }
}

function openCatalogDetail(id, options = {}) {
  const numericId = Number(id);
  const modal = productGrid.querySelector(`[data-product-modal="${numericId}"]`);
  if (!modal) return;
  productGrid.querySelectorAll(".product-detail-modal:not([hidden])").forEach(other => { other.hidden = true; });
  modal.hidden = false;
  openCatalogId = numericId;
  document.body.classList.add("catalog-detail-open");
  if (options.focus !== false) modal.querySelector(".product-detail-close")?.focus({ preventScroll: true });
}

function closeCatalogDetail(options = {}) {
  const active = productGrid.querySelector(".product-detail-modal:not([hidden])");
  const priorId = openCatalogId;
  if (active) active.hidden = true;
  openCatalogId = null;
  document.body.classList.remove("catalog-detail-open");
  if (options.restoreFocus !== false && priorId !== null) {
    productGrid.querySelector(`[data-view-catalog="${Number(priorId)}"]`)?.focus({ preventScroll: true });
  }
}

function updateGalleryControls(card, product) {
  const photoThumbs = [...card.querySelectorAll("[data-gallery-photo]")];
  const displayVariant = getSelectedVariant(product);
  const images = displayVariant.images && displayVariant.images.length ? displayVariant.images : [product.image, ...(product.gallery || [])].filter(Boolean);
  const mainImage = images[0] || product.image;
  const extraPhotos = photoThumbs.filter(thumb => thumb.dataset.src !== mainImage);
  const videoThumb = card.querySelector("[data-gallery-video]");
  const next = card.querySelector("[data-gallery-next]");
  const hasVideo = videoThumb && !videoThumb.hidden;
  next.hidden = extraPhotos.length === 0 && !hasVideo;
  const gallery = card.querySelector(".product-gallery");
  gallery.hidden = extraPhotos.length === 0 && !hasVideo;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[char]));
}

function addToCart(id, size = "", color = "") {
  const product = products.find(item => item.id === Number(id));
  const chosenColor = color || product?.selectedColor || product?.colors?.[0] || "Default";
  const availableSizes = product ? getAvailableSizes(product, chosenColor) : [];
  const chosenSize = size || product?.selectedSize || "";
  if (!product || !availableSizes.length) {
    showToast("This catalog has no available sizes right now.");
    return;
  }
  if (!chosenSize || !availableSizes.includes(chosenSize)) {
    showToast("Please select a clothing size first.");
    const card = productGrid.querySelector(`[data-product-id="${Number(id)}"]`);
    const sizeBlock = card && card.querySelector(".product-size-block");
    if (sizeBlock) {
      sizeBlock.classList.add("size-selection-required");
      sizeBlock.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => sizeBlock.classList.remove("size-selection-required"), 1600);
    }
    return;
  }
  if (!Array.isArray(cartUnitSizes[id])) cartUnitSizes[id] = [];
  if (!Array.isArray(cartUnitColors[id])) cartUnitColors[id] = [];
  cart[id] = (cart[id] || 0) + 1;
  cartUnitSizes[id].push(chosenSize);
  cartUnitColors[id].push(chosenColor);
  renderCart();
  showToast(`${product.name} (${chosenSize}) added to your bag.`);
}

function buyNow(id, size = "", color = "") {
  const product = products.find(item => item.id === Number(id));
  const chosenColor = color || product?.selectedColor || product?.colors?.[0] || "Default";
  const availableSizes = product ? getAvailableSizes(product, chosenColor) : [];
  const chosenSize = size || product?.selectedSize || "";
  if (!product || !availableSizes.length) {
    showToast("This catalog has no available sizes right now.");
    return;
  }
  if (!chosenSize || !availableSizes.includes(chosenSize)) {
    showToast("Please select a clothing size first.");
    const card = productGrid.querySelector(`[data-product-id="${Number(id)}"]`);
    const sizeBlock = card && card.querySelector(".product-size-block");
    if (sizeBlock) {
      sizeBlock.classList.add("size-selection-required");
      sizeBlock.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => sizeBlock.classList.remove("size-selection-required"), 1600);
    }
    return;
  }
  cart = { [id]: 1 };
  Object.keys(cartUnitSizes).forEach(key => delete cartUnitSizes[key]);
  Object.keys(cartUnitColors).forEach(key => delete cartUnitColors[key]);
  cartUnitSizes[id] = [chosenSize];
  cartUnitColors[id] = [chosenColor];
  renderCart();
  openCart();
  startSizeStep();
  showToast(`${product.name} (${chosenSize}) ready for checkout.`);
}

function startSizeStep() {
  const checkoutFields = $("#checkoutFields");
  const deliveryFields = $("#deliveryFields");
  const proceedButton = $("#proceedCheckout");
  if (checkoutFields) {
    checkoutFields.hidden = false;
    checkoutFields.dataset.opened = "true";
  }
  if (deliveryFields) deliveryFields.hidden = true;
  if (proceedButton) proceedButton.hidden = true;
  clearValidationHighlights();
  const firstProductSize = cartItems.querySelector(".cart-size-picker");
  if (firstProductSize) firstProductSize.scrollIntoView({behavior:"smooth", block:"center"});
}

function clearValidationHighlights() {
  document.querySelectorAll(".field-invalid, .size-invalid").forEach(el => el.classList.remove("field-invalid", "size-invalid"));
}

function highlightMissingFields() {
  clearValidationHighlights();
  const missing = [];
  ["customerName", "mobileNumber", "houseBuilding", "roadArea", "pincode", "city", "state"].forEach(id => {
    const field = $("#" + id);
    if (field && !field.value.trim()) {
      field.classList.add("field-invalid");
      missing.push(field);
    }
  });
  if ($("#pincode").value.trim() && !/^[0-9]{6}$/.test($("#pincode").value.trim())) {
    $("#pincode").classList.add("field-invalid");
    missing.push($("#pincode"));
  }
  const mobileField = $("#mobileNumber");
  if (mobileField && mobileField.value.trim() && !/^[6-9][0-9]{9}$/.test(mobileField.value.trim())) {
    mobileField.classList.add("field-invalid");
    missing.push(mobileField);
  }
  const first = missing.find(Boolean);
  if (first) first.scrollIntoView({behavior:"smooth", block:"center"});
  return missing;
}

function addCartUnit(id) {
  const product = products.find(item => item.id === Number(id));
  if (!product || !getAvailableSizes(product, product.selectedColor).length) return;
  if (!Array.isArray(cartUnitSizes[id])) cartUnitSizes[id] = [];
  if (!Array.isArray(cartUnitColors[id])) cartUnitColors[id] = [];
  cart[id] = (cart[id] || 0) + 1;
  cartUnitSizes[id].push("");
  cartUnitColors[id].push(product.selectedColor || product.colors[0] || "Default");
  renderCart();
}

function removeCartUnit(id, unitIndex) {
  const key = String(id);
  if (!cart[key]) return;
  const sizes = Array.isArray(cartUnitSizes[key]) ? cartUnitSizes[key] : [];
  const colors = Array.isArray(cartUnitColors[key]) ? cartUnitColors[key] : [];
  const index = Number(unitIndex);
  if (Number.isInteger(index) && index >= 0 && index < sizes.length) sizes.splice(index, 1);
  if (Number.isInteger(index) && index >= 0 && index < colors.length) colors.splice(index, 1);
  cart[key] -= 1;
  if (cart[key] <= 0) {
    delete cart[key]; delete cartUnitSizes[key]; delete cartUnitColors[key];
  } else {
    cartUnitSizes[key] = sizes.slice(0, cart[key]);
    cartUnitColors[key] = colors.slice(0, cart[key]);
  }
  renderCart();
}

function getCartUnits() {
  const units = [];
  Object.entries(cart).forEach(([id, quantity]) => {
    const product = products.find(item => item.id === Number(id));
    if (!product || quantity <= 0) return;
    if (!Array.isArray(cartUnitSizes[id])) cartUnitSizes[id] = [];
    if (!Array.isArray(cartUnitColors[id])) cartUnitColors[id] = [];
    while (cartUnitSizes[id].length < quantity) cartUnitSizes[id].push("");
    while (cartUnitColors[id].length < quantity) cartUnitColors[id].push(product.selectedColor || product.colors[0] || "Default");
    if (cartUnitSizes[id].length > quantity) cartUnitSizes[id].length = quantity;
    if (cartUnitColors[id].length > quantity) cartUnitColors[id].length = quantity;
    for (let unitIndex = 0; unitIndex < quantity; unitIndex += 1) {
      const color = cartUnitColors[id][unitIndex] || product.selectedColor || product.colors[0] || "Default";
      const size = cartUnitSizes[id][unitIndex] || "";
      const variant = getSelectedVariant(product, color, size);
      units.push({ product, variant, unitIndex, size, color });
    }
  });
  return units;
}

// Aggregate individual pieces by catalog + color + size for the order backend.
function getCartEntries() {
  const grouped = new Map();
  getCartUnits().forEach(unit => {
    const key = `${unit.product.id}::${unit.color}::${unit.size}`;
    if (!grouped.has(key)) grouped.set(key, { product: unit.product, variant: unit.variant, quantity: 0, size: unit.size, color: unit.color });
    grouped.get(key).quantity += 1;
  });
  return [...grouped.values()];
}

function renderCart() {
  const previousScrollTop = cartItems.scrollTop;
  const units = getCartUnits();
  const count = units.length;
  const total = units.reduce((sum, unit) => sum + catalogNumber(unit.variant.price ?? unit.product.price, 0), 0);

  $("#cartCount").textContent = count;
  $("#drawerCount").textContent = `(${count})`;
  $("#cartTotal").textContent = money(total);
  cartItems.replaceChildren();
  cartItems.hidden = count === 0;
  cartEmpty.hidden = count > 0;
  cartBottom.hidden = count === 0;
  cartItems.style.display = count > 0 ? "block" : "";
  const checkoutFields = $("#checkoutFields");
  const proceedButton = $("#proceedCheckout");
  if (count === 0) {
    if (checkoutFields) { checkoutFields.hidden = true; checkoutFields.dataset.opened = "false"; }
    if (proceedButton) proceedButton.hidden = true;
  } else if (checkoutFields && checkoutFields.dataset.opened !== "true") {
    checkoutFields.hidden = true;
    if (proceedButton) proceedButton.hidden = false;
  }

  units.forEach(({product, variant, unitIndex, size, color}) => {
    const availableColors = product.colors || [color];
    const availableSizes = getAvailableSizes(product, color);
    const row = document.createElement("div");
    row.className = "cart-line cart-unit-line";
    row.dataset.cartProductId = String(product.id);
    row.dataset.cartUnitIndex = String(unitIndex);
    const image = (variant.images && variant.images[0]) || product.image || "images/kailu-logo-mark-tm.png";
    const price = catalogNumber(variant.price ?? product.price, 0);
    const colorControl = availableColors.length > 1
      ? `<label class="cart-color-picker"><span>Color:</span><select data-unit-color="${product.id}" data-unit-index="${unitIndex}" aria-label="Choose color for ${escapeHtml(product.name)}">${availableColors.map(option => `<option value="${escapeHtml(option)}" ${option === color ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>`
      : `<div class="cart-unit-color">Color: ${escapeHtml(color)}</div>`;
    row.innerHTML = `
      <div class="cart-thumb"><img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" loading="lazy"></div>
      <div class="cart-product-details">
        <h4>${escapeHtml(product.name)}</h4>
        ${variant.sku ? `<div class="unit-sku">SKU: ${escapeHtml(variant.sku)}</div>` : ""}
        <div class="unit-price">${money(price)} / item</div>
        ${colorControl}
        <div class="cart-size-picker ${availableSizes.length ? "" : "size-invalid"}" role="group" aria-label="Choose size for item ${unitIndex + 1}: ${escapeHtml(product.name)}">
          <span class="cart-size-label">Size:</span>
          ${availableSizes.map(itemSize => `<button type="button" class="size-button cart-size-button ${size === itemSize ? "selected" : ""}" data-unit-size="${escapeHtml(itemSize)}" data-product-id="${product.id}" data-unit-index="${unitIndex}" aria-pressed="${size === itemSize ? "true" : "false"}">${escapeHtml(itemSize)}</button>`).join("")}
          ${availableSizes.length ? "" : `<span class="stock-unavailable">Out of stock</span>`}
        </div>
        <div class="quantity-controls cart-unit-controls">
          <button type="button" class="cart-add-one" data-add-unit="${product.id}" aria-label="Add one more ${escapeHtml(product.name)}">＋ Add one</button>
          <button type="button" class="remove-button" data-remove-unit="${product.id}" data-unit-index="${unitIndex}">Remove item</button>
        </div>
      </div>
      <div class="line-price">${money(price)}</div>`;
    cartItems.appendChild(row);
  });
  cartItems.scrollTop = previousScrollTop;
}
// In-app browser Back behavior: keep Back inside the storefront when a UI panel is open.
function pushKailuUiHistory(uiName) {
  const currentState = history.state && typeof history.state === "object" ? history.state : {};
  history.pushState(
    { ...currentState, kailuUI: uiName, kailuUiToken: Date.now() + Math.random() },
    "",
    window.location.href
  );
}

function replaceKailuUiHistory(uiName) {
  const currentState = history.state && typeof history.state === "object" ? { ...history.state } : {};
  if (uiName) {
    currentState.kailuUI = uiName;
    currentState.kailuUiToken = Date.now();
  } else {
    delete currentState.kailuUI;
    delete currentState.kailuUiToken;
  }
  const nextUrl = `${window.location.pathname}${window.location.search}#products`;
  history.replaceState(currentState, "", nextUrl);
}

function scrollToCatalogList() {
  const catalogSection = $("#products");
  replaceKailuUiHistory(null);
  if (catalogSection) {
    catalogSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function openCart() {
  const wasHidden = cartDrawer.hidden;
  cartDrawer.hidden = false;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  if (wasHidden) pushKailuUiHistory("cart");
  $("#closeCart").focus();
}
function closeCart(options = {}) {
  const wasOpen = !cartDrawer.hidden;
  cartDrawer.hidden = true;
  overlay.hidden = true;
  document.body.style.overflow = "";
  if (!options.skipHistory && !options.fromPopstate && wasOpen &&
      history.state && history.state.kailuUI === "cart") {
    history.back();
  }
  if (!options.fromPopstate) $("#cartShortcut").focus();
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2100);
}

async function sendWhatsAppOrder() {
  const deliveryFields = $("#deliveryFields");
  if (deliveryFields) deliveryFields.hidden = false;
  const missingUnitSize = getCartUnits().find(unit => !unit.size);
  if (missingUnitSize) {
    const row = cartItems.querySelector(`[data-cart-product-id="${missingUnitSize.product.id}"][data-cart-unit-index="${missingUnitSize.unitIndex}"]`);
    if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
    showToast(`Please select a size for every item. Missing size: ${missingUnitSize.product.name}.`);
    return;
  }
  const pincodeValidation = validatePincode({ showIncomplete: true });
  if (!pincodeValidation.valid) {
    const pincodeField = $("#pincode");
    if (pincodeField) {
      pincodeField.scrollIntoView({ behavior: "smooth", block: "center" });
      pincodeField.focus({ preventScroll: true });
    }
    showToast(pincodeValidation.message);
    return;
  }
  const missingFields = highlightMissingFields();
  if (missingFields.length) {
    showToast("Please complete the highlighted fields.");
    return;
  }
  const entries = getCartEntries();
  if (!entries.length) {
    showToast("Please add a product first");
    return;
  }
  const name = $("#customerName").value.trim();
  const mobileNumber = $("#mobileNumber").value.trim();
  const houseBuilding = $("#houseBuilding").value.trim();
  const landmark = $("#landmark").value.trim();
  const roadArea = $("#roadArea").value.trim();
  const pincode = $("#pincode").value.trim();
  const city = $("#city").value.trim();
  const state = $("#state").value.trim();
  const fields = [
    ["customerName", name], ["mobileNumber", mobileNumber], ["houseBuilding", houseBuilding],
    ["roadArea", roadArea], ["pincode", pincode], ["city", city], ["state", state]
  ];
  const missing = fields.find(([, value]) => !value);
  if (missing) {
    $("#" + missing[0]).focus();
    showToast("Please complete all required fields");
    return;
  }
  if (!/^[0-9]{6}$/.test(pincode)) {
    $("#pincode").focus();
    showToast("Please enter a valid 6-digit PIN code");
    return;
  }
  if (!/^[6-9][0-9]{9}$/.test(mobileNumber)) {
    $("#mobileNumber").focus();
    showToast("Please enter a valid 10-digit mobile number");
    return;
  }
  if (!ORDER_SCRIPT_URL.startsWith("https://script.google.com/macros/s/") ||
      ORDER_SCRIPT_URL.includes("PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE")) {
    showToast("Order system not connected. Add your Apps Script Web App URL in script.js.");
    return;
  }

  const total = entries.reduce((sum, item) => sum + catalogNumber(item.variant.price ?? item.product.price, 0) * item.quantity, 0);
  const orderItems = entries.map(({product, variant, quantity, size, color}) => ({
    productName: `${product.name}${color ? ` (${color})` : ""}`,
    productId: product.id,
    sku: variant?.sku || "",
    color: color || "",
    size: size || "",
    quantity,
    unitPrice: catalogNumber(variant?.price ?? product.price, 0),
    lineTotal: catalogNumber(variant?.price ?? product.price, 0) * quantity
  }));
  const payload = new URLSearchParams({
    store: "KAILU CREATION™",
    customerName: name,
    mobileNumber,
    size: orderItems.map(item => `${item.size}`).join(";"),
    // size: orderItems.map(item => `${item.productName}: ${item.size}`).join("; "),
    houseBuilding,
    landmark,
    roadArea,
    pincode,
    city,
    state,
    paymentMethod: "Cash on Delivery (COD)",
    currency: "INR",
    total: String(total),
    items: JSON.stringify(orderItems)
  });

  const submitButton = $("#whatsappOrder");
  const originalText = submitButton.innerHTML;
  submitButton.disabled = true;
  submitButton.textContent = "Submitting order…";
  try {
    // Apps Script is cross-origin; no-cors allows a simple form POST.
    // The browser cannot read the response, so verify a test order in Sheets/email.
    await fetch(ORDER_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      body: payload
    });
    submitButton.textContent = "Order Request Sent";

    // Return the customer to the catalog and close the cart after submission.
    cart = {};
    Object.keys(cartUnitSizes).forEach(id => delete cartUnitSizes[id]);
    Object.keys(cartUnitColors).forEach(id => delete cartUnitColors[id]);
    renderCart();
    closeCart({ skipHistory: true });
    ["customerName", "mobileNumber", "houseBuilding", "landmark", "roadArea", "pincode", "city", "state"].forEach(id => {
      const field = $("#" + id);
      if (field) field.value = "";
    });
    $("#products").scrollIntoView({ behavior: "smooth", block: "start" });
    const successModal = $("#orderSuccessModal");
    if (successModal) {
      replaceKailuUiHistory("success");
      successModal.hidden = false;
      document.body.classList.add("success-modal-open");
      const continueButton = $("#continueShoppingSuccess");
      if (continueButton) continueButton.focus({preventScroll:true});
    } else {
      showToast("Order request sent. Check your Google Sheet and email.");
    }
  } catch (error) {
    showToast("Could not send order. Check internet and try again.");
    submitButton.innerHTML = originalText;
    submitButton.disabled = false;
    return;
  }
  setTimeout(() => {
    submitButton.innerHTML = originalText;
    submitButton.disabled = false;
  }, 3500);
}

const continueShoppingSuccess = $("#continueShoppingSuccess");
function returnToCatalogList() {
  const successModal = $("#orderSuccessModal");
  if (successModal) successModal.hidden = true;
  document.body.classList.remove("success-modal-open");
  closeCart({ skipHistory: true });

  // Clear the in-app UI history marker and move the actual page to Shop Catalogs.
  const catalogSection = $("#products");
  replaceKailuUiHistory(null);
  if (catalogSection) {
    window.scrollTo({ top: Math.max(0, catalogSection.getBoundingClientRect().top + window.scrollY - 12), behavior: "smooth" });
  }
}
if (continueShoppingSuccess) {
  continueShoppingSuccess.addEventListener("click", returnToCatalogList);
}
document.addEventListener("keydown", event => {
  const successModal = $("#orderSuccessModal");
  if (event.key === "Escape" && successModal && !successModal.hidden) {
    returnToCatalogList();
  }
});

// Full-screen viewer sequence contains all valid product photos and, when
// available, the product video as the final gallery item.
let lightboxItems = [];
let lightboxIndex = 0;
let lightboxCard = null;

function stopLightboxVideo() {
  const video = $("#photoLightboxVideo");
  if (!video) return;
  video.pause();
  video.hidden = true;
  video.removeAttribute("src");
  video.load();
}

function showLightboxItem(index) {
  if (!lightboxItems.length) return;
  lightboxIndex = (index + lightboxItems.length) % lightboxItems.length;
  const item = lightboxItems[lightboxIndex];
  const img = $("#photoLightboxImage");
  const video = $("#photoLightboxVideo");

  if (item.type === "video") {
    img.hidden = true;
    video.hidden = false;
    video.pause();
    video.src = item.src;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    // load() resets playback to the beginning when switching between gallery items.
    video.load();
    // Video automatically starts silently when reached with Next/Previous.
    const playAttempt = video.play();
    if (playAttempt && typeof playAttempt.catch === "function") {
      playAttempt.catch(() => {
        // Native controls remain available if autoplay is blocked by the browser.
      });
    }
  } else {
    stopLightboxVideo();
    video.muted = true;
    video.defaultMuted = true;
    img.hidden = false;
    img.src = item.src;
    img.alt = item.alt || "Catalog full screen photo";
  }
}

function openPhotoLightbox(card, clickedSrc) {
  lightboxCard = card;
  lightboxItems = [...card.querySelectorAll("[data-gallery-photo][data-src]")]
    .map(button => ({ type: "photo", src: button.dataset.src, alt: button.getAttribute("aria-label") || "Catalog photo" }))
    .filter(item => Boolean(item.src));

  const videoThumb = card.querySelector("[data-gallery-video]");
  const cardVideo = card.querySelector("[data-main-video]");
  // A video is added to the full-screen sequence only after it is confirmed available.
  if (videoThumb && !videoThumb.hidden && cardVideo && cardVideo.dataset.videoSrc) {
    // Include the known local video even when it has not yet been fetched; load it only if reached.
    lightboxItems.push({ type: "video", src: cardVideo.dataset.videoSrc, alt: "Product video" });
  }
  if (!lightboxItems.length) lightboxItems = [{ type: "photo", src: clickedSrc, alt: "Catalog photo" }];

  const clickedUrl = new URL(clickedSrc, document.baseURI).href;
  const matchedIndex = lightboxItems.findIndex(item => item.type === "photo" && new URL(item.src, document.baseURI).href === clickedUrl);
  showLightboxItem(matchedIndex >= 0 ? matchedIndex : 0);
  $("#photoLightbox").hidden = false;
  document.body.classList.add("photo-viewer-open");
  pushKailuUiHistory("photo");
}

function moveLightboxPhoto(delta) {
  if (!lightboxItems.length) return;
  showLightboxItem(lightboxIndex + delta);
}

// Mobile tap fallback: open the full-screen viewer from a deliberate touch
// without mistaking a swipe/scroll gesture for a photo tap. The following
// synthetic click is ignored so one tap cannot open the viewer twice.
let photoTouchStart = null;
let lastTouchPhotoOpenedAt = 0;
productGrid.addEventListener("pointerdown", event => {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  const photo = target && target.closest(".catalog-photo");
  if (event.pointerType === "touch" && photo && !photo.hidden) {
    photoTouchStart = { photo, x: event.clientX, y: event.clientY };
  } else if (event.pointerType === "touch") {
    photoTouchStart = null;
  }
}, { passive: true });

productGrid.addEventListener("pointerup", event => {
  if (event.pointerType !== "touch" || !photoTouchStart) return;
  const start = photoTouchStart;
  photoTouchStart = null;
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  const photo = target && target.closest(".catalog-photo");
  const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
  if (!photo || photo !== start.photo || photo.hidden || moved > 12) return;
  lastTouchPhotoOpenedAt = Date.now();
  openPhotoLightbox(photo.closest(".product-card"), photo.currentSrc || photo.src);
}, { passive: true });

productGrid.addEventListener("change", event => {
  const select = event.target instanceof Element ? event.target.closest("[data-product-color]") : null;
  if (!select) return;
  const product = products.find(item => item.id === Number(select.dataset.productColor));
  if (!product) return;
  product.selectedColor = select.value;
  product.colorName = select.value;
  renderProducts();
  const restored = productGrid.querySelector(`[data-product-color="${product.id}"]`);
  if (restored) restored.focus({preventScroll:true});
});

productGrid.addEventListener("click", event => {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  const clickedPhoto = target && target.closest(".catalog-photo");
  if (clickedPhoto && !clickedPhoto.hidden) {
    // Touch browsers often dispatch click just after pointerup; avoid duplicate
    // history entries/reopening after the pointer handler already opened it.
    if (Date.now() - lastTouchPhotoOpenedAt < 900) return;
    openPhotoLightbox(clickedPhoto.closest(".product-card"), clickedPhoto.currentSrc || clickedPhoto.src);
    return;
  }
  const photoButton = event.target.closest("[data-gallery-photo]");
  const videoButton = event.target.closest("[data-gallery-video]");
  const nextButton = event.target.closest("[data-gallery-next]");

  if (photoButton) {
    const card = photoButton.closest(".product-card");
    const main = card.querySelector(".catalog-photo");
    const video = card.querySelector("[data-main-video]");
    video.pause();
    try { video.currentTime = 0; } catch (_) {}
    video.muted = true;
    video.defaultMuted = true;
    video.hidden = true;
    main.hidden = false;
    main.src = photoButton.dataset.src;
    card.querySelectorAll(".gallery-thumb").forEach(thumb => thumb.classList.toggle("active", thumb === photoButton));
    return;
  }
  if (videoButton && !videoButton.hidden) {
    const card = videoButton.closest(".product-card");
    const main = card.querySelector(".catalog-photo");
    const video = card.querySelector("[data-main-video]");
    const videoSrc = video.dataset.videoSrc;
    if (!videoSrc) return;
    main.hidden = true;
    video.hidden = false;
    // Load only on an intentional tap, to avoid downloading several large videos on mobile.
    // Resolve against the current page so this works from localhost and GitHub Pages subpaths.
    const resolvedVideoSrc = new URL(videoSrc, document.baseURI).href;
    if (!video.getAttribute("src") || video.getAttribute("src") !== resolvedVideoSrc) {
      video.pause();
      video.setAttribute("src", resolvedVideoSrc);
      video.preload = "auto";
      video.load();
    }
    // Always start muted (browser/mobile autoplay policy); customers can unmute with native controls.
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    card.querySelectorAll(".gallery-thumb").forEach(thumb => thumb.classList.toggle("active", thumb === videoButton));
    const startPlayback = () => {
      const playAttempt = video.play();
      if (playAttempt && typeof playAttempt.catch === "function") {
        playAttempt.catch(() => showToast("Video load ho gaya ho to player par Play dabayein."));
      }
    };
    if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      startPlayback();
    } else {
      video.addEventListener("canplay", startPlayback, { once: true });
      video.addEventListener("loadeddata", startPlayback, { once: true });
      // Force a visible, actionable message if media metadata cannot be fetched.
      window.setTimeout(() => {
        if (video.hidden || video.readyState >= HTMLMediaElement.HAVE_METADATA) return;
        showToast("Video file nahi mili. GitHub Raw URL ya MP4 file ka naam check karein.");
      }, 4000);
    }
    return;
  }
  if (nextButton) {
    const card = nextButton.closest(".product-card");
    const thumbs = [...card.querySelectorAll('[data-gallery-photo], [data-gallery-video]:not([hidden])')];
    const current = Math.max(0, thumbs.findIndex(thumb => thumb.classList.contains("active")));
    const next = thumbs[(current + 1) % thumbs.length];
    if (next) next.click();
  }
});

productGrid.addEventListener("keydown", event => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  const photo = target && target.closest(".catalog-photo");
  if (!photo || photo.hidden) return;
  event.preventDefault();
  openPhotoLightbox(photo.closest(".product-card"), photo.currentSrc || photo.src);
});

productGrid.addEventListener("click", event => {
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  if (!target) return;

  const previewPhoto = target.closest("[data-preview-photo]");
  if (previewPhoto) {
    event.preventDefault();
    const card = previewPhoto.closest(".product-card");
    const cover = card && card.querySelector(".catalog-cover-image");
    if (cover) cover.src = previewPhoto.dataset.src;
    card?.querySelectorAll("[data-preview-photo]").forEach(button => button.classList.toggle("active", button === previewPhoto));
    return;
  }

  const viewCatalogButton = target.closest("[data-view-catalog]");
  if (viewCatalogButton) {
    event.preventDefault();
    openCatalogDetail(viewCatalogButton.dataset.viewCatalog);
    return;
  }
  const closeCatalogButton = target.closest("[data-close-catalog]");
  if (closeCatalogButton) {
    event.preventDefault();
    closeCatalogDetail();
    return;
  }

  const colorButton = target.closest("[data-color-swatch]");
  if (colorButton) {
    const product = products.find(item => item.id === Number(colorButton.dataset.productId));
    if (!product) return;
    product.selectedColor = colorButton.dataset.colorValue;
    product.colorName = product.selectedColor;
    if (!getAvailableSizes(product, product.selectedColor).includes(product.selectedSize)) product.selectedSize = "";
    renderProducts();
    const restoredCard = productGrid.querySelector(`[data-product-id="${product.id}"]`);
    const restoredButton = restoredCard && [...restoredCard.querySelectorAll("[data-color-swatch]")].find(button => button.dataset.colorValue === product.selectedColor);
    if (restoredButton) restoredButton.focus({preventScroll:true});
    return;
  }

  const sizeButton = target.closest("[data-product-size]");
  if (sizeButton) {
    const product = products.find(item => item.id === Number(sizeButton.dataset.productSize));
    if (!product) return;
    product.selectedSize = sizeButton.dataset.sizeValue;
    renderProducts();
    const restoredCard = productGrid.querySelector(`[data-product-id="${product.id}"]`);
    const restoredButton = restoredCard && [...restoredCard.querySelectorAll("[data-product-size]")].find(button => button.dataset.sizeValue === product.selectedSize);
    if (restoredButton) restoredButton.focus({preventScroll:true});
    return;
  }

  const sizeGuide = target.closest("[data-size-guide]");
  if (sizeGuide) {
    const card = sizeGuide.closest(".product-card");
    const note = card && card.querySelector(`[data-size-guide-note="${sizeGuide.dataset.sizeGuide}"]`);
    if (note) {
      note.hidden = !note.hidden;
      sizeGuide.setAttribute("aria-expanded", String(!note.hidden));
    }
    return;
  }

  const wishlistButton = target.closest("[data-wishlist]");
  if (wishlistButton) {
    const id = Number(wishlistButton.dataset.wishlist);
    const product = products.find(item => item.id === id);
    if (!product) return;
    const isSaved = wishlistIds.has(id);
    if (isSaved) wishlistIds.delete(id); else wishlistIds.add(id);
    try { localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify([...wishlistIds])); } catch (error) { /* Wishlist still works for this page session. */ }
    wishlistButton.classList.toggle("is-wishlisted", !isSaved);
    wishlistButton.setAttribute("aria-pressed", String(!isSaved));
    wishlistButton.innerHTML = `<span aria-hidden="true">${isSaved ? "♡" : "♥"}</span> ${isSaved ? "WISHLIST" : "WISHLISTED"}`;
    showToast(isSaved ? "Removed from your wishlist." : "Saved to your wishlist on this device.");
    return;
  }

  const addButton = target.closest("[data-add]");
  const buyButton = target.closest("[data-buy]");
  if (addButton) {
    event.preventDefault();
    const product = products.find(item => item.id === Number(addButton.dataset.add));
    addToCart(Number(addButton.dataset.add), product?.selectedSize || "", product?.selectedColor || "");
    return;
  }
  if (buyButton) {
    event.preventDefault();
    const product = products.find(item => item.id === Number(buyButton.dataset.buy));
    buyNow(Number(buyButton.dataset.buy), product?.selectedSize || "", product?.selectedColor || "");
  }
});
function closePhotoLightbox(options = {}) {
  const photoLightbox = $("#photoLightbox");
  const wasOpen = photoLightbox && !photoLightbox.hidden;
  if (photoLightbox) photoLightbox.hidden = true;
  stopLightboxVideo();
  const lightboxImage = $("#photoLightboxImage");
  if (lightboxImage) lightboxImage.hidden = false;
  lightboxItems = [];
  lightboxIndex = 0;
  lightboxCard = null;
  document.body.classList.remove("photo-viewer-open");
  if (wasOpen && !options.fromPopstate && history.state && history.state.kailuUI === "photo") {
    history.back();
  }
}
$("#closePhotoLightbox").addEventListener("click", () => closePhotoLightbox());
$("#photoLightbox").addEventListener("click", event => {
  if (event.target.id === "photoLightbox") closePhotoLightbox();
});
$("#photoLightboxPrev").addEventListener("click", () => moveLightboxPhoto(-1));
$("#photoLightboxNext").addEventListener("click", () => moveLightboxPhoto(1));
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !$("#photoLightbox").hidden) {
    closePhotoLightbox();
    return;
  }
  if (event.key === "Escape" && openCatalogId !== null) {
    closeCatalogDetail();
    return;
  }
  if (!$("#photoLightbox").hidden && event.key === "ArrowRight") moveLightboxPhoto(1);
  if (!$("#photoLightbox").hidden && event.key === "ArrowLeft") moveLightboxPhoto(-1);
});

document.querySelectorAll(".customer-input").forEach(field => {
  field.addEventListener("input", () => field.classList.remove("field-invalid"));
});

const pincodeInput = $("#pincode");
if (pincodeInput) {
  pincodeInput.addEventListener("input", () => {
    // Accept digits only and stop at six characters, including paste/autofill.
    pincodeInput.value = pincodeInput.value.replace(/\D/g, "").slice(0, 6);
    if (pincodeInput.value.length === 6) {
      validatePincode();
      return;
    }
    pincodeInput.classList.remove("field-invalid");
    pincodeInput.setAttribute("aria-invalid", "false");
    clearAutoLocationFields();
    if (pincodeInput.value.length > 0) {
      const remaining = 6 - pincodeInput.value.length;
      setPincodeFeedback(`Enter ${remaining} more digit${remaining === 1 ? "" : "s"} to look up City and State.`, "info");
    } else {
      setPincodeFeedback("Enter a 6-digit PIN code to fill City and State automatically.", "info");
    }
  });
  pincodeInput.addEventListener("blur", () => {
    if (pincodeInput.value.trim() && pincodeInput.value.length !== 6) {
      validatePincode({ showIncomplete: true });
    } else if (pincodeInput.value.length === 6) {
      validatePincode();
    }
  });
}

const continueToDetails = $("#continueToDetails");
if (continueToDetails) {
  continueToDetails.addEventListener("click", () => {
    clearValidationHighlights();
    const missingSize = getCartUnits().find(unit => !unit.size);
    if (missingSize) {
      showToast(`Please select a size for every item. Missing size: ${missingSize.product.name}.`);
      const row = cartItems.querySelector(`[data-cart-product-id="${missingSize.product.id}"][data-cart-unit-index="${missingSize.unitIndex}"]`);
      const sizePicker = row && row.querySelector(".cart-size-picker");
      if (sizePicker) {
        sizePicker.classList.add("size-invalid");
        sizePicker.scrollIntoView({behavior:"smooth", block:"center"});
      } else if (row) {
        row.scrollIntoView({behavior:"smooth", block:"center"});
      }
      return;
    }
    $("#deliveryFields").hidden = false;
    $("#deliveryFields").scrollIntoView({behavior:"smooth", block:"start"});
    const firstField = $("#customerName");
    if (firstField) firstField.focus({preventScroll:true});
  });
}

cartItems.addEventListener("change", event => {
  const select = event.target instanceof Element ? event.target.closest("[data-unit-color]") : null;
  if (!select) return;
  const id = Number(select.dataset.unitColor);
  const unitIndex = Number(select.dataset.unitIndex);
  const product = products.find(item => item.id === id);
  if (!product) return;
  if (!Array.isArray(cartUnitColors[id])) cartUnitColors[id] = [];
  if (!Array.isArray(cartUnitSizes[id])) cartUnitSizes[id] = [];
  const keepScroll = cartItems.scrollTop;
  cartUnitColors[id][unitIndex] = select.value;
  const currentSize = cartUnitSizes[id][unitIndex] || "";
  if (currentSize && !getAvailableSizes(product, select.value).includes(currentSize)) cartUnitSizes[id][unitIndex] = "";
  renderCart();
  cartItems.scrollTop = keepScroll;
});

cartItems.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.unitSize && button.dataset.productId !== undefined && button.dataset.unitIndex !== undefined) {
    const productId = Number(button.dataset.productId);
    const unitIndex = Number(button.dataset.unitIndex);
    const product = products.find(item => item.id === productId);
    if (!Array.isArray(cartUnitSizes[productId])) cartUnitSizes[productId] = [];
    if (!Array.isArray(cartUnitColors[productId])) cartUnitColors[productId] = [];
    const chosenColor = cartUnitColors[productId][unitIndex] || product?.selectedColor || product?.colors?.[0] || "Default";
    const chosenSize = button.dataset.unitSize;
    cartUnitColors[productId][unitIndex] = chosenColor;
    cartUnitSizes[productId][unitIndex] = chosenSize;
    const keepScroll = cartItems.scrollTop;
    renderCart();
    cartItems.scrollTop = keepScroll;
    const selectedRow = cartItems.querySelector(`[data-cart-product-id="${productId}"][data-cart-unit-index="${unitIndex}"]`);
    if (selectedRow) selectedRow.querySelector(".cart-size-picker")?.classList.remove("size-invalid");
    return;
  }
  if (button.dataset.addUnit) addCartUnit(Number(button.dataset.addUnit));
  if (button.dataset.removeUnit !== undefined) removeCartUnit(Number(button.dataset.removeUnit), Number(button.dataset.unitIndex));
});
searchInput.addEventListener("input", renderProducts);
categoryFilter.addEventListener("change", renderProducts);
sortSelect.addEventListener("change", renderProducts);
$("#cartShortcut").addEventListener("click", () => {
  renderCart();
  openCart();
});
const proceedCheckout = $("#proceedCheckout");
if (proceedCheckout) {
  proceedCheckout.addEventListener("click", () => {
    const checkoutFields = $("#checkoutFields");
    checkoutFields.hidden = false;
    checkoutFields.dataset.opened = "true";
    proceedCheckout.hidden = true;
    checkoutFields.scrollIntoView({behavior: "smooth", block: "start"});
  });
}
$("#closeCart").addEventListener("click", closeCart);
const continueShoppingEmpty = $("#continueShoppingEmpty");
if (continueShoppingEmpty) continueShoppingEmpty.addEventListener("click", closeCart);
overlay.addEventListener("click", closeCart);
$("#whatsappOrder").addEventListener("click", sendWhatsAppOrder);
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !cartDrawer.hidden) closeCart();
});

// Android/mobile browser Back: close the active UI and return to catalog instead of exiting.
window.addEventListener("popstate", () => {
  const photoLightbox = $("#photoLightbox");
  if (photoLightbox && !photoLightbox.hidden) {
    closePhotoLightbox({ fromPopstate: true });
    return;
  }

  const successModal = $("#orderSuccessModal");
  if (successModal && !successModal.hidden) {
    successModal.hidden = true;
    document.body.classList.remove("success-modal-open");
    closeCart({ skipHistory: true, fromPopstate: true });
    scrollToCatalogList();
    return;
  }

  if (!cartDrawer.hidden) {
    closeCart({ skipHistory: true, fromPopstate: true });
    scrollToCatalogList();
  }
});

renderCategories();
renderProducts();
renderCart();
loadCatalogFromGoogleSheet();
