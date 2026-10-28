KAILU CREATION Website — Updated Package
========================================

આ ZIP માં website files, original Excel catalog, existing product images/videos, PIN-code data અને updated Google Apps Script source સામેલ છે.

મુખ્ય ફેરફારો
-------------
1. Products Excel પરથી load થાય છે: 34 SKU variants અને 6 અલગ Catalog Cards.
2. Catalog Card grouping: Group Code + product/color મુજબ અલગ cards; detail viewમાં તે જ Group Codeના color options.
3. Excelના Product Name, Category, SKU, Size, Color, Inventory, MRP, Sell Price, Rating, Reviews, Fabric અને Description જ વપરાય છે.
4. Discount formula: ((MRP - Sell Price) / MRP) × 100; display માટે પૂર્ણ ટકામાં round થાય છે.
5. Main image અને thumbnails માટે Excel URLs પ્રથમ. URL ન ચાલે તો packageમાં હાજર local asset fallback થાય છે; બંને ન ચાલે તો thumbnail છુપાય છે.
6. Detail galleryમાં available images/video, next/previous navigation, muted video controls અને full-screen image viewer.
7. દરેક Catalog માટે Share / Copy Link; linkમાં catalog ID હોવાથી refresh પછી એ જ catalog ખુલે છે.
8. Add to Cart અલગ છે; Buy Now selected SKU/size સાથે checkout ખોલે છે. Stock પ્રમાણે size/quantity મર્યાદિત છે.
9. Indian mobile અને PIN-code validation; હાજર PIN data પરથી City/State auto-fill, unknown PIN માટે manual entry.
10. Order payload એક Order ID હેઠળ એક rowમાં રહે છે; અનેક products માટે SKU, Item, Size અને Qty summary જળવાય છે. Google Sheetના મૂળ A:Q, 17 columns એ જ ક્રમમાં રહે છે; Customer UID, verified email, Payment Status અને Items JSON માટે R:U columns ઉમેરાય છે.
11. Order submit પછી JSONP verificationથી server-side saved-order confirmation આવે ત્યારે જ Success Popup દેખાય છે. Duplicate request ID પર duplicate row ઉમેરાતી અટકે છે.

અત્યંત મહત્વનું — Live Order System ચાલુ કરવા પહેલાં
---------------------------------------------------
ZIP માં Code.gs સુધારેલ છે, પરંતુ આ ZIP બનાવવાથી તમારી Google Apps Script deployment આપમેળે બદલાતી નથી.

1. Google Apps Script project ખોલો જે નીચેના Web App URL સાથે જોડાયેલ છે:
   https://script.google.com/macros/s/AKfycbw2zrWdILyGqxzopd3LHeiU6crc1JmPeM22xk7JBHpzRpLzy6ET4NTyJbFzmEOX-2b4Tg/exec
2. Projectમાં source file `data/Kailu Creation Orders Detail_Apps Script_Code.gs` નો code મૂકો અને Save કરો.
3. `setupOrdersSheet()` function એક વાર Run કરો અને permissions માંગે તો મંજૂરી આપો. તે existing tabને 21 headers સાથે તૈયાર/મૅપ કરે છે; જૂના records header names પરથી જાળવવાનો પ્રયત્ન કરે છે.
4. Deploy → Manage deployments → Edit → New version → Deploy કરો. ખાતરી કરો કે Web App access તમારી websiteના ગ્રાહકો માટે ઉપલબ્ધ હોય અને URL `script.js` માં રહેલા URL સાથે મેળ ખાય.
5. પહેલાં એક મંજૂર test order વડે Google Sheetમાં row ચકાસો. પછી invalid mobile/pincode અથવા backend error વડે failure case ચકાસો. Success popup ફક્ત saved-order verification સફળ થાય ત્યારે આવવો જોઈએ.

મહત્વપૂર્ણ મર્યાદા / Test સ્થિતિ
--------------------------------
- JavaScript syntax checks અને catalog-to-Excel static mapping checks કરવામાં આવ્યા.
- Code.gs ને mocked Spreadsheet/Cache environmentમાં test કર્યું: 17 headers, multi-product summary, success verification, invalid mobile error અને same request ID retry પર duplicate row ન બનવી — PASS.
- આ environmentમાં Chromium browser access Administrator restrictionથી block થયું; તેથી visual desktop/mobile browser test ચલાવી શકાયો નથી.
- Live Google Sheet પર વાસ્તવિક order submit કરવામાં આવ્યો નથી. Apps Script redeploy કર્યા પછી live confirmation જરૂર ચકાસો.

Local preview
-------------
1. ZIP extract કરો.
2. `KAILU-CREATION-V2-main` folderમાં Command Prompt ખોલો.
3. ચલાવો: `python -m http.server 8000`
4. Browserમાં `http://localhost:8000` ખોલો.

નોંધ: Catalog URLs Excelમાંથી જ લેવાય છે. GitHub remote URL ઉપલબ્ધ ન હોય તો packageમાં રહેલી matching local photo/video fallback વપરાય છે; કોઈ ઉપલબ્ધ source ન હોય તો ખોટી image/video દર્શાવવાને બદલે તે item છુપાય છે.


============================================================
AUTOMATIC EXCEL CATALOG SYNC (ADDED)
============================================================

Catalog Data હવે Website ખૂલતી વખતે deployed file "Kailu Creation Catalog List.xlsx" માંથી load કરવાનો પ્રયાસ કરે છે. SheetJS parser official CDN પરથી version 0.20.3 load થાય છે; જો CDN ઉપલબ્ધ ન હોય તો loader છેલ્લી સાચવેલી catalog અથવા bundled backup પર પાછો ફરે છે. Excel rowsમાંથી 20 columns map થાય છે અને Group Code + common SKU base પ્રમાણે size variants બનાવાય છે. Products/variants JavaScriptમાં હાથેથી update કરવાની જરૂર નથી.

EXCEL UPDATE કરવાની પ્રક્રિયા:
1. તમારી updated "Kailu Creation Catalog List.xlsx" ફાઇલ Website repositoryની root folderમાં, હાલની Excel ફાઇલના એ જ નામથી upload/replace કરો.
2. GitHubમાં Commit/Push કરો (અથવા તમારી hostingની publishing પ્રક્રિયા પૂરી થવા દો).
3. Website ફરી ખોલો અથવા Refresh કરો. Loader Excelને cache-busting URLથી અને cache:no-store સાથે fetch કરે છે. Catalog Summaryમાં "Synced from Excel" દેખાય તો નવી Excel load થઈ છે.
4. Sync નિષ્ફળ થાય અથવા workbook empty/invalid હોય તો ખાલી catalog apply થતો નથી: છેલ્લે સફળતાપૂર્વક synced browser cache, અથવા bundled backup snapshot ઉપયોગમાં લેવાય છે. Catalog Summaryમાં warning અને hover/titleમાં વિગત દેખાશે.

મહત્વપૂર્ણ મર્યાદા: Static GitHub Pages તમારા કમ્પ્યુટરની local Excel ફાઇલ વાંચી શકતું નથી અને local file save થતાં Website પર આપમેળે upload પણ કરી શકતું નથી. Updated Excelને repository/hosting પર upload અને publish કરવી જરૂરી છે. ત્યાર પછી Website નવી Excelને પોતાની રીતે વાંચે છે; products-data.js અથવા script.jsમાં Product Data હાથેથી બદલવાની જરૂર નથી.

Excel Data Rules:
- મુખ્ય Sheet: "Kailu Creation Catalog List" (ન મળે તો workbookની પહેલી sheet).
- તમામ 20 જરૂરી headers હાજર હોવા જોઈએ. SKU duplicate હોય, size rowsમાં product details conflict થાય અથવા workbook empty હોય તો નવી data reject થાય છે જેથી અગાઉની working catalog ખોટી રીતે delete ન થાય.
- Product-level name/category/color/tag/fabric/description દરેક size rowમાં એકસરખાં રાખો. Image/Video links બદલતા હોય તો તે groupની rowsમાં consistent રાખો.
- Excelની image/video link પહેલા વપરાય છે; ખાલી link હોય તો images/Product_Photos/<base-SKU>-N.webp અને videos/Product_Videos/<base-SKU>.mp4 fallback શોધાય છે. Missing media UIમાંથી hide થાય છે.
- products-data.js હવે live source નથી; તે માત્ર first-load/sync-failure backup snapshot તરીકે રહે છે.

============================================================
IMPORTANT — V1 LIVE DOMAIN SAFETY (2026-10-28)
============================================================
kailucreation.in હાલ V1ની live website છે અને આ package KAILU-CREATION-V2 preview માટે છે. તેથી આ V2 packageમાં `CNAME` file ઇરાદાપૂર્વક સામેલ નથી. આ ZIPને `KAILU-CREATION-V2` repositoryમાં publish કરો અને preview માટે `https://kaklotar9985.github.io/KAILU-CREATION-V2/` જ વાપરો.

આ ZIPને V1ની domain-owning `KAILU-CREATION` repository પર publish ન કરો. `kailucreation.in` માટેનું CNAME V1 repositoryમાં જાળવો. આ packageથી live domain અથવા Firebase Console આપમેળે બદલાતાં નથી.

LOCAL PC TEST — READ THIS FIRST (FIXED)
======================================
તમારા screenshotમાં Browser address `C:/.../index.html?...`થી શરૂ થાય છે. તેનો અર્થ Website `file://` modeમાં ખુલી છે. Chrome આ modeમાં `fetch()` વડે Excel ફાઇલ વાંચવા દેતું નથી; તેથી `catalog-sync.js` sync નિષ્ફળ થઈ `products-data.js`ના જૂના Backup values (જેમ કે Inventory 99) બતાવતો હતો.

આ packageમાં Excel Workbook પણ સામેલ છે અને direct `index.html` ખોલો ત્યારે હવે Local Excel Picker દેખાશે.
1. Excelમાં ફેરફાર કરો અને Save કરો.
2. Browserમાં `Ctrl + F5` દબાવો.
3. `Kailu Creation Catalog List.xlsx` પસંદ કરો — તમારા તાજેતરમાં Save કરેલા workbookને પસંદ કરો.
4. Product Summaryમાં `Synced from Excel` આવ્યા પછી જ નવી values લાગુ પડી હોવાનું માનવું. જો `Sync Failed` દેખાય, તો backup data છે; તે સફળ sync નથી.
5. Excelમાં ફરી ફેરફાર કરો તો Save → `Ctrl + F5` → એ જ updated workbook ફરી પસંદ કરો. Browserની સુરક્ષા કારણે `file://` page નવી local file શાંતિથી વાંચી શકતું નથી.

વૈકલ્પિક રીતે `START-LOCAL-TEST.bat` પર double-click કરો. તે Python HTTP server શરૂ કરી `http://127.0.0.1:8765/` ખોલે છે. આ server modeમાં Excel આ જ folderમાં હોવી જોઈએ અને Save પછી માત્ર `Ctrl + F5` કરવું પૂરતું છે. Browser address `file://` ન હોવું જોઈએ.

**તમારી screenshotની diagnosis:** Excelમાં Inventory 1 દેખાય છે, જ્યારે Website 99 બતાવે છે. Website Excel parse કરી રહી નથી અને Backup Data બતાવી રહી છે. Excel file save કરવું એકલું પૂરતું નથી; pageએ Excel file fetch/read કરવી પણ જરૂરી છે.


============================================================
PERFORMANCE OPTIMIZATION UPDATE (2026-10-26)
============================================================
મુખ્ય ફેરફારો:
1. `script.js` હવે Excel/CDN responseની રાહ જોયા વિના `products-data.js`ની last-known-good catalog તરત render કરે છે. `catalog-sync.js` Excel સફળતાપૂર્વક validate થયા પછી `KAILU_APPLY_CATALOG()` દ્વારા catalog, category list, detail view અને cart indexes update કરે છે.
2. Excel/SheetJS request હવે timeout સાથે છે. CDN લોડ ન થાય, workbook 404/HTML આપે, request timeout થાય અથવા workbook invalid હોય તો grid ખાલી રાખવાને બદલે Backup/Last Synced Data તથા સ્પષ્ટ Sync Warning રહે છે.
3. SheetJS CDN માટે browser cacheનો ઉપયોગ રહે તે માટે દરેક page load પર versioned library URLમાં અકારણ timestamp ઉમેરાતો નથી. Excel workbook જ cache-busting/no-storeથી fetch થાય છે.
4. Gridની પહેલી ત્રણ Main Images eager load થાય છે; ફક્ત પહેલી card imageને high fetch priority મળે છે. નીચેનાં cardsની Main Images અને off-screen thumbnails lazy load થાય છે.
5. `images/Product_Thumbnails/`માં 26 lightweight WebP thumbnails ઉમેર્યાં. Full-resolution original Product Photos બદલ્યાં નથી. Thumbnail derivative set 4,139,794 bytesથી 580,760 bytes થયું (લગભગ 86% ઓછું).
6. Hero image JPGના બદલે high-quality WebP variants વપરાય છે; 3 hero images માટેનું aggregate file size લગભગ 998 KBથી 565 KB થયું. Original JPG files packageમાં જાળવેલી છે.
7. Brand mark, footer logo, shopping bag અને clothing-tag art માટે નાના WebP display variants ઉમેર્યાં. Original assets packageમાં જાળવ્યાં છે.
8. Local image URL fail થાય તો matching SKU photo માટે raw-GitHub fallback પણ અજમાય છે; ખોટો product fallback વપરાતો નથી.
9. Google Fonts માટે preconnect અને non-blocking stylesheet pattern ઉમેરાયો; CSSમાંથી waterfall-રૂપ `@import` દૂર કર્યો.
10. Product detail video element `preload="none"` વાપરે છે. Video metadata probe ફક્ત product detail ખોલ્યા પછી થાય છે; initial catalog page video download કરતું નથી.

Test સ્થિતિ:
- `node --check` દ્વારા `script.js`, `catalog-sync.js`, `products-data.js`, અને `pincode-serviceability.js` syntax — PASS.
- HTML script order: backup snapshot → storefront app → background Excel sync — static check PASS.
- Workbookમાં 34 SKU rows/6 catalog groupsનું mapping static રીતે verify કર્યું.
- 26 source product photos માટે thumbnail derivatives બનાવ્યા; દરેક generated derivative file હાજર છે.
- Asset file-size checks વડે thumbnail setમાં લગભગ 86% અને 3 hero imagesમાં લગભગ 43% કુલ size ઘટાડો ચકાસ્યો.
- Chromium browser navigation `ERR_BLOCKED_BY_ADMINISTRATOR`થી રોકાયું; તેથી real browser LCP, time-to-first-catalog, image-network waterfall, mobile/desktop rendering અને live Cart/Order end-to-end performance measurement નથી થઈ શક્યાં. ZIPમાં કોઈ measured live page-load timeનો દાવો નથી.

Deployment નોંધ:
આ ફેરફારો live website પર લાગુ કરવા ZIPની files યોગ્ય GitHub Pages repositoryના rootમાં publish કરવી જરૂરી છે. ZIPમાં જૂના JPG/logo assetsને delete કર્યા નથી; page માત્ર નવા optimized variants reference કરે છે.

Additional local static-server checks (2026-10-26):
- Local HTTP server returned 200 for `/`, `style.css`, `script.js`, `catalog-sync.js`, `products-data.js`, the Excel workbook, one original product photo, its optimized thumbnail, the optimized hero image and the optimized logo.
- These are local static-file request results (roughly 1–4 ms per request in this test environment); they are not a measure of public GitHub Pages load time or user-network performance.


============================================================
CUSTOMER ACCOUNT — FIREBASE GOOGLE LOGIN (ADDED 2026-10-28)
============================================================

Customer Account માટે `FIREBASE-CUSTOMER-ACCOUNT-SETUP-GUJARATI.txt` અને static validation માટે `CUSTOMER-ACCOUNT-TEST-REPORT-GUJARATI.txt` વાંચો. `firebase-config.js`માં હાલ placeholder values છે; Firebase Console માંથી હાલની KAILU CREATION Web App config paste કર્યા વિના Google Login કામ નહીં કરે. `firestore.rules` ને હાલના live rules સાથે merge/publish કરવું અને આ જ Apps Script endpoint પર updated Code.gs deploy કરવું જરૂરી છે. ZIP પોતે Firebase Console, Google Sheets અથવા live website deploy કરતું નથી.
