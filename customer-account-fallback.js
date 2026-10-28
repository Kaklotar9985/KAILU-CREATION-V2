/* Friendly diagnostic for the case where Firebase's ES module does not load. */
(function () {
  "use strict";
  const button = document.getElementById("accountShortcut");
  if (!button) return;
  let shown = false;

  function showFallback() {
    if (shown || window.KAILU_CUSTOMER_ACCOUNT) return;
    shown = true;
    let modal = document.getElementById("kailuAccountLoadHelp");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "kailuAccountLoadHelp";
      modal.className = "kailu-account-modal";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "kaLoadHelpTitle");
      const localFile = window.location.protocol === "file:";
      const title = localFile ? "Open the website through a local server" : "Customer Login did not load";
      const explanation = localFile
        ? "This page was opened directly as a file (file://). Firebase uses JavaScript modules and Google sign-in must be tested through an http:// or https:// website."
        : "The Customer Account module did not finish loading. Check your internet connection and the browser Console for a Firebase module-loading error.";
      modal.innerHTML = `
        <section class="ka-account-panel" style="height:auto;min-height:0;max-width:560px">
          <header class="ka-account-header">
            <div class="ka-brand-mini"><img src="images/kailu-logo-mark-tm.webp" alt=""><div><strong id="kaLoadHelpTitle">KAILU CREATION</strong><small>CUSTOMER LOGIN HELP</small></div></div>
            <button class="ka-close" type="button" data-ka-help-close aria-label="Close help">×</button>
          </header>
          <div class="ka-account-body" style="padding:25px">
            <h2 style="margin:0 0 12px;color:#173f33;font-family:'Playfair Display',Georgia,serif">${title}</h2>
            <p style="line-height:1.7;color:#536257">${explanation}</p>
            <ol style="padding-left:22px;line-height:1.8;color:#536257">
              <li>Close this browser tab.</li>
              <li>Open the extracted <strong>KAILU-CREATION-V2-main</strong> folder.</li>
              <li>Double-click <strong>START-LOCAL-TEST.bat</strong> (do not double-click index.html).</li>
              <li>Use the page opened at <strong>http://127.0.0.1:8765/</strong>.</li>
            </ol>
            <p style="line-height:1.7;color:#815d26;background:#fbf3e5;padding:12px;border-radius:8px">Google Login still needs the real Firebase Web App values in <strong>firebase-config.js</strong>. If Firebase reports <em>unauthorized-domain</em>, add <strong>127.0.0.1</strong> under Authentication → Settings → Authorized domains for local testing.</p>
            <div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="ka-primary-button" type="button" data-ka-help-close>Close</button></div>
          </div>
        </section>`;
      document.body.appendChild(modal);
      modal.addEventListener("click", function (event) {
        if (event.target === modal || event.target.closest("[data-ka-help-close]")) {
          modal.remove();
          document.body.classList.remove("kailu-account-open");
          shown = false;
        }
      });
      document.addEventListener("keydown", function onKey(event) {
        if (event.key === "Escape" && document.getElementById("kailuAccountLoadHelp")) {
          document.getElementById("kailuAccountLoadHelp")?.remove();
          document.body.classList.remove("kailu-account-open");
          shown = false;
          document.removeEventListener("keydown", onKey);
        }
      });
    }
    modal.hidden = false;
    document.body.classList.add("kailu-account-open");
  }

  button.addEventListener("click", function () {
    if (window.KAILU_CUSTOMER_ACCOUNT) return;
    const delay = window.location.protocol === "file:" ? 0 : 2500;
    window.setTimeout(function () {
      if (!window.KAILU_CUSTOMER_ACCOUNT) showFallback();
    }, delay);
  });
})();
