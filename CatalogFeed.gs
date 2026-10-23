// Add this as a NEW file named CatalogFeed.gs in the existing KAILU order Apps Script project.
// It only exposes public storefront fields and sizes with Inventory > 0; exact stock counts stay private.
const CATALOG_SPREADSHEET_ID = "1aPmIouxSdrzfTaq16GjC2ojbO4TdMqpYYT72Fa_u9Ck";
const CATALOG_SHEET_NAME = "Sheet1";

function catalogNormalizeHeader_(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function serveCatalogFeed_(e) {
  const callback = String((e && e.parameter && e.parameter.callback) || "");
  const respond = (payload) => ContentService.createTextOutput(
    `${callback}(${JSON.stringify(payload)});`
  ).setMimeType(ContentService.MimeType.JAVASCRIPT);
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(callback)) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, message: "Invalid callback name." }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  try {
    const spreadsheet = SpreadsheetApp.openById(CATALOG_SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(CATALOG_SHEET_NAME);
    if (!sheet) return respond({ ok: false, message: `Catalog tab "${CATALOG_SHEET_NAME}" was not found.` });
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return respond({ ok: true, rows: [] });
    const headers = values[0].map(value => catalogNormalizeHeader_(value));
    const findColumn = (...names) => headers.findIndex(header => names.map(name => catalogNormalizeHeader_(name)).includes(header));
    const columns = {
      groupCode: findColumn("Group Code"), category: findColumn("Category"), productName: findColumn("Product Name"),
      sku: findColumn("Sku", "SKU"), size: findColumn("Size"), color: findColumn("Color"), inventory: findColumn("Inventory"),
      mrpPrice: findColumn("MRP Price"), sellPrice: findColumn("Sell Price"), rating: findColumn("Rating"), reviews: findColumn("Reviews"),
      tag: findColumn("tag"), fabric: findColumn("Fabric"), image1: findColumn("Image-1(Front) Link", "Image-1 Front Link"),
      image2: findColumn("Image-2 Link"), image3: findColumn("Image-3 Link"), image4: findColumn("Image-4 Link"),
      image5: findColumn("Image-5 Link"), video: findColumn("Video Link"), description: findColumn("Description")
    };
    const cell = (row, name) => columns[name] < 0 ? "" : row[columns[name]];
    const rows = [];
    for (let index = 1; index < values.length; index += 1) {
      const row = values[index];
      const inventory = Number(cell(row, "inventory")) || 0;
      const groupCode = String(cell(row, "groupCode") ?? "").trim();
      const productName = String(cell(row, "productName") ?? "").trim();
      const size = String(cell(row, "size") ?? "").trim();
      const sellingPrice = Number(cell(row, "sellPrice")) || 0;
      const hasAnyImage = ["image1", "image2", "image3", "image4", "image5"].some(name => String(cell(row, name) ?? "").trim());
      if (inventory <= 0 || !groupCode || !productName || !size || sellingPrice <= 0 || !hasAnyImage) continue;
      rows.push({
        groupCode,
        category: String(cell(row, "category") ?? "").trim(),
        productName,
        sku: String(cell(row, "sku") ?? "").trim(),
        size,
        color: String(cell(row, "color") ?? "").trim(),
        // Expose in-stock status only; never share the exact Inventory count with customers.
        inventory: 1,
        mrpPrice: cell(row, "mrpPrice"), sellPrice: cell(row, "sellPrice"),
        rating: cell(row, "rating"), reviews: cell(row, "reviews"), tag: String(cell(row, "tag") ?? "").trim(),
        fabric: String(cell(row, "fabric") ?? "").trim(),
        image1: String(cell(row, "image1") ?? "").trim(), image2: String(cell(row, "image2") ?? "").trim(),
        image3: String(cell(row, "image3") ?? "").trim(), image4: String(cell(row, "image4") ?? "").trim(),
        image5: String(cell(row, "image5") ?? "").trim(), video: String(cell(row, "video") ?? "").trim(),
        description: String(cell(row, "description") ?? "").trim()
      });
    }
    return respond({ ok: true, rows });
  } catch (error) {
    return respond({ ok: false, message: String(error && error.message ? error.message : error) });
  }
}
