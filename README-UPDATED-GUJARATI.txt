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
10. Order payload એક Order ID હેઠળ એક rowમાં રહે છે; અનેક products માટે SKU, Item, Size અને Qty summary જળવાય છે. Google Sheetના હાલના A:Q, 17 headersમાં Order Status છેલ્લે રહે છે.
11. Order submit પછી JSONP verificationથી server-side saved-order confirmation આવે ત્યારે જ Success Popup દેખાય છે. Duplicate request ID પર duplicate row ઉમેરાતી અટકે છે.

અત્યંત મહત્વનું — Live Order System ચાલુ કરવા પહેલાં
---------------------------------------------------
ZIP માં Code.gs સુધારેલ છે, પરંતુ આ ZIP બનાવવાથી તમારી Google Apps Script deployment આપમેળે બદલાતી નથી.

1. Google Apps Script project ખોલો જે નીચેના Web App URL સાથે જોડાયેલ છે:
   https://script.google.com/macros/s/AKfycbzoDLyc2YwBgl_KnTio5LVKdZQ-GsLTvKQWMi1Uhg4zodfSt2sWtSn0a2SzO8RjCcbyHw/exec
2. Projectમાં source file `data/Kailu Creation Orders Detail_Apps Script_Code.gs` નો code મૂકો અને Save કરો.
3. `setupOrdersSheet()` function એક વાર Run કરો અને permissions માંગે તો મંજૂરી આપો. તે existing tabને 17 headers સાથે તૈયાર/મૅપ કરે છે; જૂના records header names પરથી જાળવવાનો પ્રયત્ન કરે છે.
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
