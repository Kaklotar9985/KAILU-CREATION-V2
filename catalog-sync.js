/*
 * KAILU CREATION Excel-first catalog sync.
 * The deployed workbook is the primary product source. products-data.js is only
 * a last-known-good fallback if the workbook or spreadsheet parser is unavailable.
 */
(function () {
  "use strict";

  const CACHE_KEY = "kailu_catalog_excel_cache_v1";
  const WORKBOOK_NAME = "Kailu Creation Catalog List.xlsx";
  const SHEET_NAME = "Kailu Creation Catalog List";
  const SHEETJS_URL = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
  const APP_SCRIPT_URL = "script.js?v=excel-catalog-sync-20261026";
  const EXPECTED_COLUMNS = [
    "Group Code", "Category", "Product Name", "Sku", "Size", "Color", "Inventory",
    "MRP Price", "Sell Price", "Rating", "Reviews", "tag", "Fabric",
    "Image-1(Front) Link", "Image-2 Link", "Image-3 Link", "Image-4 Link",
    "Image-5 Link", "Video Link", "Description"
  ];
  const IMAGE_COLUMNS = [
    "Image-1(Front) Link", "Image-2 Link", "Image-3 Link", "Image-4 Link", "Image-5 Link"
  ];
  const SIZE_SUFFIX = /_(3XL|XXL|XL|L|M|S)$/i;

  function clean(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function normalizeHeader(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function parseNumber(value) {
    if (value === null || value === undefined || clean(value) === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const parsed = Number(clean(value).replace(/[₹,\s%]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function safeUrl(value) {
    const url = clean(value);
    if (!url) return "";
    if (/^javascript:/i.test(url) || /^data:/i.test(url)) return "";
    if (/^(https?:)?\/\//i.test(url) || /^(\.\.\/|\.\/|\/)?[\w%./ -]+\.(webp|png|jpe?g|gif|mp4|webm)(\?.*)?$/i.test(url)) return url;
    return "";
  }

  function rowIsBlank(row) {
    return !row || Object.values(row).every(value => clean(value) === "");
  }

  function buildCatalogFromRows(rawRows) {
    if (!Array.isArray(rawRows) || !rawRows.length) {
      throw new Error("The Excel catalog sheet has no product rows.");
    }
    const firstRow = rawRows.find(row => !rowIsBlank(row));
    if (!firstRow) throw new Error("The Excel catalog sheet is empty.");
    const headerByNormalized = new Map(Object.keys(firstRow).map(header => [normalizeHeader(header), header]));
    const missingHeaders = EXPECTED_COLUMNS.filter(header => !headerByNormalized.has(normalizeHeader(header)));
    if (missingHeaders.length) throw new Error("Missing Excel columns: " + missingHeaders.join(", "));

    const field = (row, name) => row[headerByNormalized.get(normalizeHeader(name))];
    const records = [];
    const seenSku = new Map();

    rawRows.forEach((row, rowIndex) => {
      if (rowIsBlank(row)) return;
      const record = {};
      EXPECTED_COLUMNS.forEach(name => { record[name] = field(row, name); });
      const groupCode = clean(record["Group Code"]);
      const category = clean(record.Category);
      const name = clean(record["Product Name"]);
      const sku = clean(record.Sku);
      const size = clean(record.Size);
      const color = clean(record.Color);
      if (!groupCode || !category || !name || !sku || !size || !color) {
        throw new Error(`Excel row ${rowIndex + 2} is missing Group Code, Category, Product Name, Sku, Size, or Color.`);
      }
      if (seenSku.has(sku)) {
        throw new Error(`Duplicate SKU "${sku}" found in Excel rows ${seenSku.get(sku)} and ${rowIndex + 2}.`);
      }
      seenSku.set(sku, rowIndex + 2);
      record.__groupCode = groupCode;
      record.__name = name;
      record.__category = category;
      record.__sku = sku;
      record.__size = size;
      record.__color = color;
      record.__baseSku = sku.replace(SIZE_SUFFIX, "");
      record.__key = `${groupCode}::${record.__baseSku}`;
      record.__row = rowIndex + 2;
      records.push(record);
    });

    if (!records.length) throw new Error("No valid catalog product rows were found.");

    const groups = new Map();
    const commonFields = ["Category", "Product Name", "Color", "tag", "Fabric", "Description"];
    const urlFields = [...IMAGE_COLUMNS, "Video Link"];
    records.forEach(record => {
      if (!groups.has(record.__key)) groups.set(record.__key, []);
      groups.get(record.__key).push(record);
    });

    const catalog = [];
    groups.forEach((variants, key) => {
      const first = variants[0];
      // Group-level product details must agree across size rows. Reject inconsistent
      // workbook data instead of silently mixing a product's name/details.
      commonFields.forEach(fieldName => {
        const values = [...new Set(variants.map(item => clean(item[fieldName])).filter(Boolean))];
        if (values.length > 1) {
          throw new Error(`Inconsistent "${fieldName}" in size variants for SKU group "${first.__baseSku}". Update all rows of the same catalog consistently.`);
        }
      });

      const chosenUrls = {};
      urlFields.forEach(fieldName => {
        const urls = [...new Set(variants.map(item => safeUrl(item[fieldName])).filter(Boolean))];
        if (urls.length > 1) {
          throw new Error(`Conflicting "${fieldName}" links in size variants for SKU group "${first.__baseSku}".`);
        }
        chosenUrls[fieldName] = urls[0] || "";
      });

      const baseSku = first.__baseSku;
      const groupCode = first.__groupCode;
      const images = IMAGE_COLUMNS.map((column, index) => ({
        url: chosenUrls[column] || "",
        fallback: `images/Product_Photos/${baseSku}-${index + 1}.webp`
      }));
      const uniqueVariants = variants.map(item => ({
        sku: item.__sku,
        size: item.__size,
        inventory: parseNumber(item.Inventory),
        mrp: parseNumber(item["MRP Price"]),
        price: parseNumber(item["Sell Price"]),
        rating: parseNumber(item.Rating),
        reviews: parseNumber(item.Reviews),
        tag: clean(item.tag)
      })).sort((a, b) => {
        const sizes = ["S", "M", "L", "XL", "XXL", "3XL"];
        const aIndex = sizes.indexOf(a.size), bIndex = sizes.indexOf(b.size);
        return (aIndex < 0 ? 999 : aIndex) - (bIndex < 0 ? 999 : bIndex);
      });
      if (uniqueVariants.some(variant => !variant.sku || !variant.size)) {
        throw new Error(`Invalid SKU or Size in group "${baseSku}".`);
      }

      catalog.push({
        id: `g${groupCode}-${baseSku}`,
        groupCode,
        category: clean(first.Category),
        name: clean(first["Product Name"]),
        baseSku,
        color: clean(first.Color),
        fabric: clean(first.Fabric),
        description: clean(first.Description),
        tag: clean(first.tag),
        images,
        videoUrl: chosenUrls["Video Link"],
        localVideo: `videos/Product_Videos/${baseSku}.mp4`,
        variants: uniqueVariants
      });
    });

    const productIds = new Set();
    const allSkus = new Set();
    catalog.forEach(product => {
      if (productIds.has(product.id)) throw new Error(`Duplicate catalog key "${product.id}".`);
      productIds.add(product.id);
      product.variants.forEach(variant => {
        if (allSkus.has(variant.sku)) throw new Error(`Duplicate SKU "${variant.sku}" across catalog groups.`);
        allSkus.add(variant.sku);
      });
    });
    if (!catalog.length || !allSkus.size) throw new Error("Excel validation returned an empty catalog.");
    return catalog;
  }

  function validCatalog(data) {
    return Array.isArray(data) && data.length > 0 && data.every(product =>
      product && typeof product.id === "string" && product.id &&
      Array.isArray(product.variants) && product.variants.length > 0 &&
      product.variants.every(variant => variant && variant.sku && variant.size)
    );
  }

  function loadScript(src, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      let settled = false;
      const timer = setTimeout(() => finish(new Error(`Timed out loading ${src}`)), timeoutMs);
      function finish(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        script.onload = null;
        script.onerror = null;
        if (error) {
          if (script.parentNode) script.parentNode.removeChild(script);
          reject(error);
        } else resolve();
      }
      script.src = src;
      script.onload = () => finish();
      script.onerror = () => finish(new Error(`Could not load ${src}`));
      document.head.appendChild(script);
    });
  }

  async function loadWorkbookCatalog() {
    if (!window.XLSX) await loadScript(SHEETJS_URL);
    if (!window.XLSX) throw new Error("The Excel reader library could not be loaded.");
    const workbookUrl = new URL(WORKBOOK_NAME, document.baseURI);
    workbookUrl.searchParams.set("_catalog_sync", String(Date.now()));
    const response = await fetch(workbookUrl.href, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error(`Excel download failed (HTTP ${response.status}).`);
    const buffer = await response.arrayBuffer();
    if (!buffer || buffer.byteLength < 100) throw new Error("Excel file appears empty or incomplete.");
    const workbook = window.XLSX.read(buffer, { type: "array", cellDates: false });
    const sheet = workbook.Sheets[SHEET_NAME] || workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("The Excel workbook has no readable catalog sheet.");
    const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true, blankrows: false });
    return buildCatalogFromRows(rows);
  }

  function chooseFallback(error) {
    let cached = null;
    try {
      const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (saved && validCatalog(saved.catalog)) cached = saved.catalog;
    } catch (_) { /* localStorage may be disabled or unavailable. */ }
    if (cached) {
      window.KAILU_PRODUCT_CATALOG = cached;
      window.KAILU_CATALOG_SYNC_STATUS = {
        mode: "cache", ok: false, message: "Excel sync failed. Showing the last successfully synced catalog.",
        detail: error && error.message ? error.message : String(error || "Unknown sync error")
      };
      return;
    }
    if (!validCatalog(window.KAILU_PRODUCT_CATALOG)) {
      window.KAILU_PRODUCT_CATALOG = [];
    }
    window.KAILU_CATALOG_SYNC_STATUS = {
      mode: "snapshot", ok: false, message: "Excel sync failed. Showing the bundled backup catalog.",
      detail: error && error.message ? error.message : String(error || "Unknown sync error")
    };
  }

  async function start() {
    try {
      const catalog = await loadWorkbookCatalog();
      // Only accept a fully validated, non-empty catalog. Failed/empty syncs do not
      // overwrite the last-known-good browser cache.
      if (!validCatalog(catalog)) throw new Error("Excel validation did not produce a complete catalog.");
      window.KAILU_PRODUCT_CATALOG = catalog;
      const syncedAt = new Date().toISOString();
      window.KAILU_CATALOG_SYNC_STATUS = { mode: "excel", ok: true, syncedAt, message: "Catalog synced from Excel." };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ catalog, syncedAt })); } catch (_) { /* Cache is optional. */ }
    } catch (error) {
      chooseFallback(error);
    }
    try {
      await loadScript(APP_SCRIPT_URL);
    } catch (error) {
      const status = window.KAILU_CATALOG_SYNC_STATUS || {};
      status.appLoadError = error.message || String(error);
      window.KAILU_CATALOG_SYNC_STATUS = status;
      const summary = document.getElementById("productSummary");
      if (summary) summary.textContent = "Unable to load the storefront scripts. Refresh the page or contact the site owner.";
    }
  }

  start();
})();
