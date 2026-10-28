const STORE_EMAIL = "kaklotar.brothers@gmail.com";
const SHEET_ID = "1VAvTtSempaIT6DzJ54KADBzdRiJj-vbtiyFfzqc94xg";
// This is the TAB name at the bottom of the spreadsheet, not the spreadsheet file name.
const SHEET_NAME = "Kailu Creation Orders Detail";
const REQUEST_LEDGER_SHEET_NAME = "_KAILU_Order_Request_Log";

// Order layout: A:U (21 columns), retaining legacy columns and adding verified customer/account fields.
const HEADERS = [
  "Timestamp", "Order ID", "Customer Name", "Mobile Number", "SKU", "Items", "Size", "Qty",
  "House No. / Building", "Landmark", "Road / Area / Colony", "Pincode", "City", "State",
  "Payment Method", "Total (INR)", "Order Status",
  "Firebase UID", "Customer Email", "Payment Status", "Items JSON"
];

function doGet(e) {
  const p = (e && e.parameter) ? e.parameter : {};
  const action = String(p.action || "");
  const clientRequestId = String(p.clientRequestId || "").trim();

  // Both transports are read-only. JSONP is the primary path; verifyFrame is a
  // compatibility path for older mobile browsers that report script.onerror on
  // the Apps Script redirect.
  if ((action === "verify" || action === "verifyFrame") && clientRequestId) {
    const response = getOrderVerificationResult_(clientRequestId);

    if (action === "verifyFrame") {
      const nonce = String(p.nonce || "");
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(nonce)) {
        return HtmlService.createHtmlOutput("Invalid verification nonce.");
      }

      const message = {
        type: "KAILU_ORDER_VERIFY_RESULT",
        requestId: clientRequestId,
        nonce: nonce,
        result: response
      };
      // Escape HTML-sensitive characters before embedding JSON into an inline
      // script; response strings must never be able to close this script element.
      const messageJson = JSON.stringify(message)
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/&/g, "\\u0026")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
      const html = '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
        '<script>(function(){var m=' + messageJson +
        ';try{if(window.parent&&window.parent!==window){window.parent.postMessage(m,"*");}}catch(e){}})();<\/script>' +
        '</body></html>';
      return HtmlService.createHtmlOutput(html)
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    const callback = String(p.callback || "");
    if (!/^kailuOrderVerify_[A-Za-z0-9_]+$/.test(callback)) {
      return ContentService.createTextOutput("Invalid verification callback.");
    }
    return ContentService.createTextOutput(callback + "(" + JSON.stringify(response) + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService.createTextOutput("KAILU CREATION order endpoint is running.");
}

function getOrderVerificationResult_(clientRequestId) {
  let response = {
    ok: false,
    pending: true,
    code: "ORDER_PENDING",
    message: "Order save is not confirmed yet."
  };
  try {
    const cachedResult = CacheService.getScriptCache().get(requestCacheKey_(clientRequestId));
    if (cachedResult) {
      try { response = JSON.parse(cachedResult); }
      catch (_) { response = { ok: true, orderId: cachedResult }; }
    }

    // CacheService can evict entries. The persistent ledger makes confirmation
    // and duplicate protection survive cache expiry and page reloads.
    if (!response || response.ok !== true) {
      const ledgerResult = findRequestLedger_(clientRequestId);
      if (ledgerResult && ledgerResult.ok === true) response = ledgerResult;
    }
  } catch (verifyError) {
    console.error("Order verification failed:", verifyError);
    response = {
      ok: false,
      pending: true,
      code: "VERIFY_SERVER_ERROR",
      message: "Order verification temporarily failed on the Apps Script server. The order may already be saved; do not submit it again yet."
    };
  }
  return response;
}

// Run this once manually after updating the script to migrate/prepare the existing tab.
// Existing order rows are mapped by their header names and retained.
function setupOrdersSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    const oldNamedTab = ss.getSheetByName("Orders");
    if (oldNamedTab) {
      sheet = oldNamedTab;
      sheet.setName(SHEET_NAME);
    } else {
      sheet = ss.insertSheet(SHEET_NAME);
    }
  }
  ensureOrderSchema_(sheet);
  ensureRequestLedgerSheet_(ss);
  return "Orders tab is ready with columns A:U, customer UID/payment status fields, and request verification ledger.";
}

function doPost(e) {
  // Authenticated, read-only customer history uses a separate postMessage response.
  // The Firebase ID token is verified server-side before a UID is trusted.
  const incoming = (e && e.parameter) ? e.parameter : {};
  if (String(incoming.action || "") === "customerOrders") {
    return customerOrdersResponsePage_(incoming);
  }

  const lock = LockService.getScriptLock();
  let lockAcquired = false;
  let requestIdForVerification = "";
  try {
    lock.waitLock(15000);
    lockAcquired = true;
    const p = (e && e.parameter) ? e.parameter : {};
    const clientRequestId = String(p.clientRequestId || "").trim();
    requestIdForVerification = clientRequestId;
    const cache = CacheService.getScriptCache();
    const cacheKey = clientRequestId ? requestCacheKey_(clientRequestId) : "";
    const required = ["customerName", "mobileNumber", "size", "houseBuilding", "roadArea", "pincode", "city", "state", "total", "items"];
    const missing = required.filter(k => !String(p[k] || "").trim());
    if (missing.length) return rejectOrder_(clientRequestId, "Missing fields: " + missing.join(", ") + ".");
    if (!/^\d{6}$/.test(String(p.pincode).trim())) return rejectOrder_(clientRequestId, "Invalid pincode. Please enter a 6-digit PIN code.");
    if (!/^[6-9]\d{9}$/.test(String(p.mobileNumber).trim())) return rejectOrder_(clientRequestId, "Invalid mobile number. Please enter a valid 10-digit Indian mobile number.");
    const total = Number(p.total);
    if (!Number.isFinite(total) || total < 0) return rejectOrder_(clientRequestId, "Invalid order total.");

    let items;
    try { items = JSON.parse(p.items); }
    catch (_) { return rejectOrder_(clientRequestId, "Order items could not be read. Please refresh and try again."); }
    if (!Array.isArray(items) || !items.length) return rejectOrder_(clientRequestId, "No order items were provided.");

    // Never trust a customer UID or email submitted by the browser. If a Firebase
    // ID token is present, verify it against the existing Firebase project and use
    // the server-returned UID/email. Guest orders remain valid but are not linked.
    let verifiedCustomer = null;
    const firebaseIdToken = String(p.idToken || "").trim();
    if (firebaseIdToken) {
      verifiedCustomer = verifyFirebaseIdToken_(firebaseIdToken);
      if (!verifiedCustomer.ok) {
        return rejectOrder_(clientRequestId, verifiedCustomer.message || "Google customer verification failed. Please sign in again.");
      }
      const claimedUid = String(p.customerUid || "").trim();
      if (claimedUid && claimedUid !== verifiedCustomer.uid) {
        return rejectOrder_(clientRequestId, "Customer account verification did not match. Please sign in again and retry.");
      }
    }

    // A retry with the same clientRequestId returns the original confirmed order,
    // preventing duplicate rows when the browser loses a response after saving.
    if (cacheKey) {
      const priorResultText = cache.get(cacheKey);
      if (priorResultText) {
        let priorResult = null;
        try { priorResult = JSON.parse(priorResultText); } catch (_) { priorResult = { ok: true, orderId: priorResultText }; }
        if (priorResult && priorResult.ok === true && priorResult.orderId) {
          return output_({ ok: true, orderId: priorResult.orderId, duplicate: true });
        }
        // A cached failure is not a saved order; permit the customer to retry the same request ID.
        cache.remove(cacheKey);
      }
      const ledgerPrior = findRequestLedger_(clientRequestId);
      if (ledgerPrior && ledgerPrior.ok === true && ledgerPrior.orderId) {
        try { cache.put(cacheKey, JSON.stringify(ledgerPrior), 21600); } catch (_) {}
        return output_({ ok: true, orderId: ledgerPrior.orderId, duplicate: true });
      }
    }

    const now = new Date();
    const orderId = "KC-" + Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMdd-HHmmss") + "-" + Utilities.getUuid().slice(0, 6).toUpperCase();
    const itemSummary = items.map(item => {
      const name = item.productName || item.name || "Product";
      const sku = getItemSku_(item) || "SKU not provided";
      const size = item.size || "-";
      const color = String(item.color || "").trim();
      const quantity = getItemQty_(item);
      const unitPrice = Number(item.unitPrice);
      const lineTotal = (item.lineTotal !== undefined && item.lineTotal !== null)
        ? Number(item.lineTotal)
        : (Number.isFinite(unitPrice) ? unitPrice * quantity : "-");
      return `${name} | SKU ${sku} | Color ${color || "-"} | Size ${size} | Qty ${quantity || "-"} | Unit ₹${Number.isFinite(unitPrice) ? unitPrice : "-"} | Line Total ₹${Number.isFinite(lineTotal) ? lineTotal : "-"}`;
    }).join("\n");

    // Keep one row per order. The original 17 columns retain their positions;
    // verified customer identity, payment status, and structured item data are appended.
    const skuSummary = Array.from(new Set(items.map(getItemSku_).filter(Boolean))).join(", ");
    const itemQtyTotal = items.reduce((sum, item) => sum + getItemQty_(item), 0);
    const qtyValue = itemQtyTotal || Number(p.qty || p.quantity || 0) || "";
    const sizeSummary = String(p.size || Array.from(new Set(items.map(item => String(item.size || "").trim()).filter(Boolean))).join(", "));
    const paymentMethod = String(p.paymentMethod || p.payment_method || "Cash on Delivery (COD)").trim() || "Cash on Delivery (COD)";

    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      const allSheets = ss.getSheets();
      if (allSheets.length === 1 && allSheets[0].getLastRow() === 0) {
        sheet = allSheets[0];
        sheet.setName(SHEET_NAME);
      } else {
        sheet = ss.insertSheet(SHEET_NAME);
      }
    }
    ensureOrderSchema_(sheet);

    const row = [
      now,
      orderId,
      safeCell_(p.customerName),
      String(p.mobileNumber).trim(),
      safeCell_(skuSummary),
      safeCell_(itemSummary),
      safeCell_(sizeSummary),
      qtyValue,
      safeCell_(p.houseBuilding),
      safeCell_(p.landmark || ""),
      safeCell_(p.roadArea),
      String(p.pincode).trim(),
      safeCell_(p.city),
      safeCell_(p.state),
      safeCell_(paymentMethod),
      total,
      "New",
      verifiedCustomer ? verifiedCustomer.uid : "",
      verifiedCustomer ? verifiedCustomer.email : "",
      "Payment Pending",
      safeCell_(JSON.stringify(items))
    ];

    sheet.appendRow(row);
    const savedRow = sheet.getLastRow();
    // Formatting is helpful, but must not turn a successfully appended order into a false failure.
    try {
      sheet.getRange(savedRow, 1).setNumberFormat("dd/MM/yyyy HH:mm:ss");
      sheet.getRange(savedRow, 4).setNumberFormat("@");
      sheet.getRange(savedRow, 12).setNumberFormat("@");
    } catch (formatError) {
      console.error("Order row saved, but number formatting failed:", formatError);
    }

    // Cache idempotency only after appendRow completed, so verification means the row was saved.
    if (cacheKey) {
      const confirmed = { ok: true, orderId: orderId };
      try { cache.put(cacheKey, JSON.stringify(confirmed), 21600); }
      catch (cacheWriteError) { console.error("Order row saved, but its verification cache could not be written:", cacheWriteError); }
      try { recordRequestLedger_(ss, clientRequestId, orderId, now); }
      catch (ledgerError) {
        // Cache confirmation is already written; report this degradation in logs.
        console.error("Order row saved, but the persistent request ledger could not be updated:", ledgerError);
      }
    }

    const body = [
      "New order received for KAILU CREATION", "",
      "Order ID: " + orderId,
      "Customer: " + p.customerName,
      "Mobile Number: " + p.mobileNumber,
      "SKU: " + (skuSummary || "Not provided by website"),
      "Items:", itemSummary, "",
      "Total Quantity: " + (qtyValue || "Not provided"),
      "Size: " + (sizeSummary || "Not provided"),
      "House No. / Building Name: " + p.houseBuilding,
      "Landmark: " + (String(p.landmark || "").trim() || "Not provided"),
      "Road Name / Area / Colony: " + p.roadArea,
      "Pincode: " + p.pincode,
      "City: " + p.city,
      "State: " + p.state,
      "Payment: " + paymentMethod,
      "Total: ₹" + total, "",
      "Please confirm stock, delivery and COD availability."
    ].join("\n");

    // Email is a notification only. A MailApp error must not make a saved order appear failed.
    if (STORE_EMAIL && STORE_EMAIL.indexOf("@") > 0 && STORE_EMAIL !== "YOUR_EMAIL@example.com") {
      try { MailApp.sendEmail(STORE_EMAIL, `New KAILU CREATION order ${orderId} — ₹${total}`, body); }
      catch (mailError) { console.error("Order row saved, but notification email failed:", mailError); }
    }
    return output_({ ok: true, orderId: orderId });
  } catch (err) {
    console.error(err);
    const errorMessage = String(err && err.message ? err.message : err);
    rememberRequestFailure_(requestIdForVerification, errorMessage);
    return output_({ ok: false, message: errorMessage });
  } finally {
    if (lockAcquired) {
      try { lock.releaseLock(); } catch (_) { /* lock is already released */ }
    }
  }
}

/**
 * Verify a Firebase client ID token using the Firebase Authentication account lookup
 * endpoint. The API key is loaded from Apps Script Script Properties; it is not a
 * service-account secret. A returned UID is trusted only when the token is accepted
 * by the existing Firebase project and the account has a Google provider.
 */
function verifyFirebaseIdToken_(idToken) {
  const apiKey = String(PropertiesService.getScriptProperties().getProperty("FIREBASE_WEB_API_KEY") || "").trim();
  if (!apiKey) {
    return { ok: false, message: "Firebase Web API Key is not configured in the order backend. Please contact the store administrator." };
  }
  if (!idToken || idToken.length > 10000) {
    return { ok: false, message: "Your Google sign-in session is invalid. Please sign in again." };
  }
  try {
    const response = UrlFetchApp.fetch(
      "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(apiKey),
      {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify({ idToken: idToken }),
        muteHttpExceptions: true
      }
    );
    if (response.getResponseCode() !== 200) {
      console.warn("Firebase token lookup rejected a customer token. HTTP", response.getResponseCode());
      return { ok: false, message: "Google sign-in verification failed or expired. Sign in again and retry." };
    }
    const data = JSON.parse(response.getContentText() || "{}");
    const account = Array.isArray(data.users) ? data.users[0] : null;
    if (!account || !account.localId || account.disabled === true) {
      return { ok: false, message: "The customer Firebase account could not be verified." };
    }
    const providers = Array.isArray(account.providerUserInfo) ? account.providerUserInfo : [];
    if (!providers.some(provider => provider && provider.providerId === "google.com")) {
      return { ok: false, message: "KAILU customer accounts must use Google Sign-In." };
    }
    if (account.emailVerified !== true) {
      return { ok: false, message: "The Google account email is not verified. Verify the Google account and sign in again." };
    }
    return { ok: true, uid: String(account.localId), email: String(account.email || "").trim().toLowerCase() };
  } catch (error) {
    console.error("Firebase ID token verification error:", error);
    return { ok: false, message: "The order server could not verify Google sign-in because of a temporary connection or configuration issue." };
  }
}

/** Return the signed-in customer's own orders as a sandboxed iframe postMessage. */
function customerOrdersResponsePage_(p) {
  const nonce = String(p.nonce || "");
  const requestedOrigin = String(p.origin || "").trim();
  const allowedOrigins = [
    "https://kaklotar9985.github.io",
    "https://kailucreation.in",
    "https://www.kailucreation.in"
  ];
  if (!/^[A-Za-z0-9_-]{16,120}$/.test(nonce) || allowedOrigins.indexOf(requestedOrigin) < 0) {
    return HtmlService.createHtmlOutput("Invalid or unauthorized customer history request.");
  }
  let result;
  try {
    const identity = verifyFirebaseIdToken_(String(p.idToken || "").trim());
    if (!identity.ok) {
      result = { ok: false, message: identity.message || "Google sign-in verification failed." };
    } else {
      result = { ok: true, orders: getCustomerOrdersByUid_(identity.uid) };
    }
  } catch (error) {
    console.error("Customer order history error:", error);
    result = { ok: false, message: "Customer order history is temporarily unavailable. Please retry." };
  }
  const message = { type: "KAILU_CUSTOMER_ORDERS_RESULT", nonce: nonce, result: result };
  const messageJson = JSON.stringify(message)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  const targetOriginJson = JSON.stringify(requestedOrigin);
  const html = '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
    '<script>(function(){var m=' + messageJson + ',targetOrigin=' + targetOriginJson +
    ';try{if(window.parent&&window.parent!==window){window.parent.postMessage(m,targetOrigin);}}catch(e){}})();<\/script>' +
    '</body></html>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Only rows containing the verified Firebase UID are returned. Orders before this
 * UID column was introduced remain unlinked; email/name/mobile matching is avoided.
 */
function getCustomerOrdersByUid_(uid) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) return [];
    ensureOrderSchema_(sheet);
    const lastRow = sheet.getLastRow();
    const lastCol = Math.max(sheet.getLastColumn(), HEADERS.length);
    const headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const headerIndexes = {};
    headers.forEach((header, index) => { headerIndexes[normalizeHeader_(header)] = index; });
    const uidIndex = headerIndexes[normalizeHeader_("Firebase UID")];
    if (uidIndex === undefined) return [];
    const rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    const indexOf = name => headerIndexes[normalizeHeader_(name)];
    const at = (row, name) => { const i = indexOf(name); return i === undefined ? "" : row[i]; };
    const dateLabel = value => {
      if (value instanceof Date && !isNaN(value.getTime())) {
        return Utilities.formatDate(value, Session.getScriptTimeZone(), "dd MMM yyyy, hh:mm a");
      }
      return String(value || "Date unavailable");
    };
    return rows.filter(row => String(row[uidIndex] || "").trim() === uid)
      .sort((a, b) => {
        const aDate = at(a, "Timestamp") instanceof Date ? at(a, "Timestamp").getTime() : new Date(at(a, "Timestamp") || 0).getTime();
        const bDate = at(b, "Timestamp") instanceof Date ? at(b, "Timestamp").getTime() : new Date(at(b, "Timestamp") || 0).getTime();
        return bDate - aDate;
      }).map(row => {
      let items = [];
      const itemsJson = String(at(row, "Items JSON") || "").trim().replace(/^'/, "");
      if (itemsJson) {
        try { const parsed = JSON.parse(itemsJson); if (Array.isArray(parsed)) items = parsed; } catch (_) {}
      }
      const paymentMethod = String(at(row, "Payment Method") || "Cash on Delivery (COD)");
      const storedPaymentStatus = String(at(row, "Payment Status") || "").trim();
      // Never infer payment receipt from order placement. COD defaults to pending.
      const paymentStatus = storedPaymentStatus || (/cod|cash on delivery/i.test(paymentMethod) ? "Payment Pending" : "Payment status not confirmed");
      return {
        orderId: String(at(row, "Order ID") || ""),
        orderDate: dateLabel(at(row, "Timestamp")),
        customerName: String(at(row, "Customer Name") || ""),
        sku: String(at(row, "SKU") || ""),
        itemsSummary: String(at(row, "Items") || ""),
        items: items,
        size: String(at(row, "Size") || ""),
        quantity: String(at(row, "Qty") || ""),
        total: Number(at(row, "Total (INR)") || 0),
        paymentMethod: paymentMethod,
        orderStatus: String(at(row, "Order Status") || "New"),
        paymentStatus: paymentStatus
      };
    });
  } finally {
    lock.releaseLock();
  }
}

// Migrates rows by matching header names, so adding/reordering columns does not
// shift old values into the wrong fields. Existing order history is retained.
function ensureOrderSchema_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = Math.max(sheet.getLastColumn(), HEADERS.length);
  if (lastRow === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    return;
  }

  const oldHeaders = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const isCurrent = HEADERS.every((h, i) => normalizeHeader_(oldHeaders[i]) === normalizeHeader_(h));
  if (!isCurrent) {
    const oldData = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
    const indexes = {};
    oldHeaders.forEach((h, i) => {
      const key = normalizeHeader_(h);
      if (key) indexes[key] = i;
    });
    const aliases = {
      "mobile number": ["mobile number", "customer mobile", "phone", "phone number"],
      "sku": ["sku", "product sku", "sku code", "item sku", "sku new column", "sku new colun"],
      "items": ["items", "item", "product", "products", "order items"],
      "size": ["size", "sizes", "product size"],
      "qty": ["qty", "quantity", "total quantity", "order quantity", "qty new column", "qty new colun"],
      "house no building": ["house no. / building", "house no. / building name", "house / building", "house building"],
      "road area colony": ["road / area / colony", "road name / area / colony", "road area", "address"],
      "pincode": ["pincode", "pin code", "postal code", "zip code"],
      "payment method": ["payment method", "payment", "mode of payment"],
      "total inr": ["total (inr)", "total", "total amount"],
      "order status": ["order status", "status"]
    };

    const migrated = oldData.map(oldRow => HEADERS.map(header => {
      const key = normalizeHeader_(header);
      let idx = indexes[key];
      if (idx === undefined && aliases[key]) {
        for (const alias of aliases[key]) {
          const aliasIdx = indexes[normalizeHeader_(alias)];
          if (aliasIdx !== undefined) {
            idx = aliasIdx;
            break;
          }
        }
      }
      return idx === undefined ? "" : oldRow[idx];
    }));

    // Clear the old layout before writing the normalized header and migrated records.
    sheet.getRange(1, 1, lastRow, lastCol).clearContent();
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    if (migrated.length) sheet.getRange(2, 1, migrated.length, HEADERS.length).setValues(migrated);
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
}

// A separate hidden sheet stores idempotency keys. This survives CacheService eviction
// and lost responses without adding any more columns to the customer-facing order tab.
function ensureRequestLedgerSheet_(ss) {
  let ledger = ss.getSheetByName(REQUEST_LEDGER_SHEET_NAME);
  if (!ledger) {
    ledger = ss.insertSheet(REQUEST_LEDGER_SHEET_NAME);
    ledger.getRange(1, 1, 1, 3).setValues([["Client Request ID", "Order ID", "Saved At"]]);
    ledger.setFrozenRows(1);
    ledger.hideSheet();
  } else if (ledger.getLastRow() === 0) {
    ledger.getRange(1, 1, 1, 3).setValues([["Client Request ID", "Order ID", "Saved At"]]);
    ledger.setFrozenRows(1);
    try { ledger.hideSheet(); } catch (_) {}
  }
  return ledger;
}

function findRequestLedger_(clientRequestId) {
  const id = String(clientRequestId || "").trim();
  if (!id) return null;
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const ledger = ss.getSheetByName(REQUEST_LEDGER_SHEET_NAME);
  if (!ledger || ledger.getLastRow() < 2) return null;
  const match = ledger.getRange(2, 1, ledger.getLastRow() - 1, 1)
    .createTextFinder(id).matchEntireCell(true).findNext();
  if (!match) return null;
  const orderId = String(ledger.getRange(match.getRow(), 2).getDisplayValue() || "").trim();
  return orderId ? { ok: true, orderId: orderId, duplicate: true } : null;
}

function recordRequestLedger_(ss, clientRequestId, orderId, savedAt) {
  const id = String(clientRequestId || "").trim();
  if (!id || !orderId) return;
  const ledger = ensureRequestLedgerSheet_(ss);
  const match = ledger.getLastRow() > 1
    ? ledger.getRange(2, 1, ledger.getLastRow() - 1, 1).createTextFinder(id).matchEntireCell(true).findNext()
    : null;
  if (match) return; // Idempotent ledger write.
  ledger.appendRow([id, orderId, savedAt || new Date()]);
}

function rejectOrder_(clientRequestId, message) {
  rememberRequestFailure_(clientRequestId, message);
  return output_({ ok: false, message: message });
}

function rememberRequestFailure_(clientRequestId, message) {
  const id = String(clientRequestId || "").trim();
  if (!id) return;
  try {
    CacheService.getScriptCache().put(requestCacheKey_(id), JSON.stringify({ ok: false, message: String(message || "Order could not be saved.") }), 600);
  } catch (cacheError) {
    console.error("Could not cache the order failure for verification:", cacheError);
  }
}

function requestCacheKey_(clientRequestId) {
  return "KC_REQ_" + Utilities.base64EncodeWebSafe(String(clientRequestId || "").trim()).replace(/=+$/g, "").slice(0, 180);
}

function getItemSku_(item) {
  const candidates = [item.sku, item.SKU, item.productSKU, item.productSku, item.skuCode, item.productCode, item.itemSKU];
  for (const candidate of candidates) {
    const value = String(candidate === undefined || candidate === null ? "" : candidate).trim();
    if (value) return value;
  }
  return "";
}

function getItemQty_(item) {
  const value = Number(item.quantity !== undefined ? item.quantity : (item.qty !== undefined ? item.qty : item.Qty));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizeHeader_(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function safeCell_(value) {
  const s = String(value || "");
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function output_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
