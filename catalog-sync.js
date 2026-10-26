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
  // Prefer the official SheetJS CDN, then try common mirrors if that host is blocked.
  const SHEETJS_URLS = [
    "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js",
    "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
    "https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js"
  ];
  const APP_SCRIPT_NAME = "script.js";
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

  async function ensureExcelReader() {
    if (window.XLSX) return;
    const failures = [];
    for (const source of SHEETJS_URLS) {
      const url = new URL(source);
      url.searchParams.set("_catalog_reader", String(Date.now()));
      try {
        await loadScript(url.href, 15000);
        if (window.XLSX) return;
        failures.push(`${source}: loaded without XLSX global`);
      } catch (error) {
        failures.push(`${source}: ${error && error.message ? error.message : String(error)}`);
      }
    }
    throw new Error("Excel reader library could not be loaded from any CDN. Check internet/CDN access. " + failures.join(" | "));
  }

  function workbookUrlForThisSite() {
    // Resolve from the current site's directory so both a custom-domain root and
    // a GitHub Pages repository path work. Never resolve against a product URL's query.
    const siteDirectory = new URL("./", window.location.href);
    const workbookUrl = new URL(WORKBOOK_NAME, siteDirectory);
    workbookUrl.searchParams.set("_catalog_sync", String(Date.now()));
    return workbookUrl;
  }

  function parseWorkbookCatalogBuffer(buffer, sourceLabel) {
    if (!buffer || buffer.byteLength < 100) throw new Error("Excel file appears empty or incomplete.");
    const workbook = window.XLSX.read(buffer, { type: "array", cellDates: false });
    const sheet = workbook.Sheets[SHEET_NAME] || workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("The Excel workbook has no readable catalog sheet.");
    const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true, blankrows: false });
    const catalog = buildCatalogFromRows(rows);
    return {
      catalog,
      workbookUrl: sourceLabel,
      worksheet: workbook.SheetNames.find(name => name === SHEET_NAME) || workbook.SheetNames[0],
      rowCount: rows.length
    };
  }

  async function loadWorkbookCatalog() {
    if (window.location.protocol === "file:") {
      throw new Error("This page is opened as file://. The browser cannot fetch an Excel file automatically in this mode. Select the saved Excel workbook in the Local PC Test panel, or open START-LOCAL-TEST.bat.");
    }
    await ensureExcelReader();
    const workbookUrl = workbookUrlForThisSite();
    const response = await fetch(workbookUrl.href, { cache: "no-store", credentials: "same-origin", redirect: "follow" });
    if (!response.ok) throw new Error(`Excel download failed (HTTP ${response.status}).`);
    const buffer = await response.arrayBuffer();
    return parseWorkbookCatalogBuffer(buffer, workbookUrl.href);
  }

  function chooseLocalWorkbookFile() {
    return new Promise(resolve => {
      let completed = false;
      const finish = value => {
        if (completed) return;
        completed = true;
        panel.remove();
        resolve(value);
      };
      const panel = document.createElement("section");
      panel.id = "kailuLocalExcelPicker";
      panel.setAttribute("role", "region");
      panel.setAttribute("aria-label", "Local Excel testing");
      panel.style.cssText = "position:fixed;z-index:2147483647;top:12px;left:12px;right:12px;max-width:760px;margin:0 auto;padding:18px 20px;background:#fffdf7;color:#173e32;border:2px solid #d8a03a;border-radius:14px;box-shadow:0 12px 36px rgba(0,0,0,.28);font:14px/1.5 Arial,sans-serif";
      panel.innerHTML = `
        <strong style="display:block;font-size:18px;margin-bottom:6px">KAILU CREATION — Local PC Excel Test</strong>
        <p style="margin:0 0 10px">આ પેજ <code>file://</code>થી ખૂલ્યું છે. આ મોડમાં Chrome Excel ફાઇલને આપમેળે fetch કરી શકતું નથી. તમે Save કરેલી Excel ફાઇલ પસંદ કરો.</p>
        <label style="display:block;font-weight:700;margin:8px 0">Kailu Creation Catalog List.xlsx પસંદ કરો
          <input id="kailuLocalExcelInput" type="file" accept=".xlsx,.xlsm,.xls" style="display:block;width:100%;margin-top:8px;padding:9px;border:1px solid #cfc8b8;border-radius:8px;background:#fff;color:#173e32">
        </label>
        <div id="kailuLocalExcelStatus" role="status" aria-live="polite" style="margin:8px 0;color:#76551d">Excel ફાઇલ પસંદ કરતાં પહેલાં અથવા પછી જરૂરી હોય તો error અહીં દેખાશે.</div>
        <button id="kailuLocalExcelBackup" type="button" style="padding:9px 14px;border:1px solid #b8b1a4;border-radius:8px;background:#f6f1e8;color:#173e32;cursor:pointer">Use Backup Data (test only)</button>
      `;
      const input = panel.querySelector("#kailuLocalExcelInput");
      const status = panel.querySelector("#kailuLocalExcelStatus");
      panel.querySelector("#kailuLocalExcelBackup").addEventListener("click", () => finish(null));
      input.addEventListener("change", async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        status.textContent = `Reading ${file.name}...`;
        try {
          await ensureExcelReader();
          const buffer = await file.arrayBuffer();
          const result = parseWorkbookCatalogBuffer(buffer, `Local Excel file: ${file.name}`);
          if (!validCatalog(result.catalog)) throw new Error("Excel validation did not produce a complete catalog.");
          status.textContent = `Loaded ${result.rowCount} Excel rows into ${result.catalog.length} catalogs.`;
          finish(result);
        } catch (error) {
          status.textContent = `Excel sync failed: ${error && error.message ? error.message : String(error)}. Select the correct workbook and try again.`;
          input.value = "";
        }
      });
      document.body.prepend(panel);
    });
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
        mode: "cache", ok: false, message: "Sync Failed — Showing Last Synced Data",
        detail: error && error.message ? error.message : String(error || "Unknown sync error")
      };
      console.warn("[KAILU Catalog Sync] Excel sync failed; showing the last successfully synced catalog.", window.KAILU_CATALOG_SYNC_STATUS.detail);
      return;
    }
    if (!validCatalog(window.KAILU_PRODUCT_CATALOG)) {
      window.KAILU_PRODUCT_CATALOG = [];
    }
    window.KAILU_CATALOG_SYNC_STATUS = {
      mode: "snapshot", ok: false, message: "Sync Failed — Showing Backup Data",
      detail: error && error.message ? error.message : String(error || "Unknown sync error")
    };
    console.warn("[KAILU Catalog Sync] Excel sync failed; showing bundled backup data.", window.KAILU_CATALOG_SYNC_STATUS.detail);
  }

  async function start() {
    try {
      let result;
      if (window.location.protocol === "file:") {
        result = await chooseLocalWorkbookFile();
        if (!result) throw new Error("Local Excel workbook was not selected; using backup data for this test only.");
      } else {
        result = await loadWorkbookCatalog();
      }
      const catalog = result.catalog;
      // Only accept a fully validated, non-empty catalog. Failed/empty syncs do not
      // overwrite the last-known-good browser cache.
      if (!validCatalog(catalog)) throw new Error("Excel validation did not produce a complete catalog.");
      window.KAILU_PRODUCT_CATALOG = catalog;
      const syncedAt = new Date().toISOString();
      window.KAILU_CATALOG_SYNC_STATUS = {
        mode: "excel", ok: true, syncedAt, workbookUrl: result.workbookUrl,
        worksheet: result.worksheet, rows: result.rowCount, catalogs: catalog.length,
        message: "Synced from Excel"
      };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ catalog, syncedAt, workbookUrl: result.workbookUrl, worksheet: result.worksheet, rows: result.rowCount })); } catch (_) { /* Cache is optional. */ }
      console.info(`[KAILU Catalog Sync] Synced ${result.rowCount} Excel rows into ${catalog.length} catalogs from ${result.workbookUrl} (sheet: ${result.worksheet}).`);
    } catch (error) {
      chooseFallback(error);
    }
    try {
      const appUrl = new URL(APP_SCRIPT_NAME, new URL("./", window.location.href));
      appUrl.searchParams.set("_app", String(Date.now()));
      await loadScript(appUrl.href);
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
