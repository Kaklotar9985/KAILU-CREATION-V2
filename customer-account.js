/* KAILU CREATION V2 — Google-only customer account module. */
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut, setPersistence, browserLocalPersistence, updateProfile
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, addDoc, updateDoc,
  deleteDoc, getDocs, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const CONFIG = window.KAILU_FIREBASE_CONFIG || {};
const requiredConfigFields = ["apiKey", "authDomain", "projectId", "appId"];
const firebaseConfigured = requiredConfigFields.every(key => {
  const value = String(CONFIG[key] || "");
  return value.length > 8 && !value.includes("PASTE_FROM_FIREBASE_CONSOLE");
});
const accountButton = document.getElementById("accountShortcut");
const h = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));
const money = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));
const normalizePhone = value => String(value || "").replace(/\D/g, "");
const localPinData = window.KAILU_PINCODE_DATA || Object.create(null);
let app = null, auth = null, db = null, currentUser = null;
let authReady = false, activeTab = "profile", currentAddresses = [], currentWishlist = [], currentOrders = [];
let statusMessage = "", statusType = "info", addressBeingEdited = null, loginBusy = false;
let authInitialStateTimer = null;
let accountRenderVersion = 0;

// Keep account UI responsive if Firebase/Firestore network requests never settle.
function withTimeout(promise, milliseconds, message) {
  let timer = null;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), milliseconds);
    })
  ]).finally(() => { if (timer !== null) window.clearTimeout(timer); });
}

function buildModal() {
  if (document.getElementById("kailuAccountModal")) return;
  const modal = document.createElement("div");
  modal.id = "kailuAccountModal";
  modal.className = "kailu-account-modal";
  modal.hidden = true;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "kaDialogTitle");
  modal.innerHTML = `
    <section class="ka-account-panel">
      <header class="ka-account-header">
        <div class="ka-brand-mini"><img src="images/kailu-logo-mark-tm.webp" alt=""><div><strong id="kaDialogTitle">KAILU CREATION<sup class="brand-trademark">™</sup></strong><small>MY ACCOUNT</small></div></div>
        <button class="ka-close" type="button" data-ka-close aria-label="Close account">×</button>
      </header>
      <div id="kaAccountBody" class="ka-account-body"><div class="ka-loading"><span class="ka-spinner"></span><p>Checking your customer account…</p></div></div>
    </section>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", event => {
    if (event.target === modal || event.target.closest("[data-ka-close]")) closeAccount();
  });
  modal.addEventListener("click", handleModalClick);
  modal.addEventListener("submit", handleModalSubmit);
  modal.addEventListener("input", handleModalInput);
  modal.addEventListener("change", handleModalChange);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !modal.hidden) closeAccount();
  });
}

function setStatus(message, type = "info") {
  statusMessage = message || "";
  statusType = type;
  const target = document.getElementById("kaStatus");
  if (target) {
    target.textContent = statusMessage;
    target.className = `ka-status ${statusType}`;
    target.hidden = !statusMessage;
  }
}

function statusMarkup() {
  return `<p id="kaStatus" class="ka-status ${h(statusType)}" role="status" aria-live="polite" ${statusMessage ? "" : "hidden"}>${h(statusMessage)}</p>`;
}

function openAccount(tab = "profile") {
  buildModal();
  activeTab = tab;
  const modal = document.getElementById("kailuAccountModal");
  modal.hidden = false;
  document.body.classList.add("kailu-account-open");
  renderAccountUI();
}

function closeAccount() {
  const modal = document.getElementById("kailuAccountModal");
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("kailu-account-open");
}

function renderLogin() {
  const body = document.getElementById("kaAccountBody");
  if (!body) return;
  body.innerHTML = `
    <div class="ka-login-layout">
      <div class="ka-login-art"><span class="ka-login-star">✦</span><h2>Your Style,<br><em>Our Creation.</em></h2><p>Your catalog, addresses and order history — in one place.</p><img src="images/catalog-1-1.webp" alt="KAILU CREATION collection" loading="lazy"></div>
      <div class="ka-login-content"><span class="ka-eyebrow">CUSTOMER ACCOUNT</span><h2>Welcome to<br>KAILU CREATION<sup class="brand-trademark">™</sup></h2><p>Continue with your Google Account. First sign-in automatically creates your customer account.</p>
        <button type="button" id="kaGoogleSignIn" class="ka-google-button" ${loginBusy ? "disabled" : ""}><span class="ka-google-g">G</span><span>${loginBusy ? "Opening Google…" : "Continue with Google"}</span><span class="ka-spinner ka-button-spinner" ${loginBusy ? "" : "hidden"}></span></button>
        <button type="button" id="kaCreateAccount" class="ka-create-account" ${loginBusy ? "disabled" : ""}>New customer? Create an account with Google</button>
        <p class="ka-login-note">No separate KAILU CREATION™ password is created or stored.</p>
        <a class="ka-recovery-link" href="https://accounts.google.com/signin/recovery" target="_blank" rel="noopener noreferrer">Forgot your Google password?</a>
        ${!firebaseConfigured ? `<div class="ka-setup-warning"><strong>Firebase setup required</strong><span>Paste your existing Firebase Web App config into <code>firebase-config.js</code>, then reload this page.</span></div>` : ""}
        ${statusMarkup()}
      </div>
    </div>`;
  const signIn = document.getElementById("kaGoogleSignIn");
  signIn?.addEventListener("click", signInWithGoogle);
  document.getElementById("kaCreateAccount")?.addEventListener("click", signInWithGoogle);
}

function renderAccountUI() {
  buildModal();
  const body = document.getElementById("kaAccountBody");
  if (!authReady) {
    body.innerHTML = `<div class="ka-loading"><span class="ka-spinner"></span><p>Checking your customer account…</p></div>`;
    return;
  }
  if (!currentUser) {
    renderLogin();
    return;
  }
  const avatar = currentUser.photoURL
    ? `<img class="ka-avatar" src="${h(currentUser.photoURL)}" alt="Customer profile photo" referrerpolicy="no-referrer">`
    : `<span class="ka-avatar ka-avatar-initial">${h((currentUser.displayName || currentUser.email || "C").trim().charAt(0).toUpperCase())}</span>`;
  body.innerHTML = `
    <div class="ka-user-strip">${avatar}<div class="ka-user-text"><strong>${h(currentUser.displayName || "KAILU CREATION Customer")}</strong><small>${h(currentUser.email || "")}</small></div><button type="button" class="ka-signout" data-ka-signout>Log out</button></div>
    <nav class="ka-tabs" aria-label="My Account sections">
      ${[["profile","Profile"],["addresses","Address Book"],["orders","Order History"],["wishlist","Wishlist"]].map(([key,label]) => `<button type="button" data-ka-tab="${key}" class="ka-tab ${activeTab === key ? "active" : ""}" aria-pressed="${activeTab === key}">${label}</button>`).join("")}
    </nav>
    <div class="ka-account-content" id="kaTabContent">${renderTabLoading(activeTab)}</div>
    ${statusMarkup()}`;
  const renderVersion = ++accountRenderVersion;
  withTimeout(
    renderCurrentTab(),
    12000,
    "Your account is signed in, but saved information is taking too long to load. Check Firestore access and your internet connection, then use Retry."
  ).catch(error => {
    console.error("KAILU Account tab error:", error);
    if (renderVersion !== accountRenderVersion) return;
    const target = document.getElementById("kaTabContent");
    if (target) {
      target.innerHTML = `<section class="ka-tab-pane"><div class="ka-pane-heading"><h2>Account data could not be loaded</h2></div><div class="ka-warning-card"><p>${h(readableError(error))}</p><button type="button" class="ka-primary-button" data-ka-retry-tab>Retry</button></div></section>`;
    }
    setStatus(readableError(error), "error");
  });
}

function renderTabLoading(tab) {
  return `<section class="ka-tab-pane"><div class="ka-pane-heading"><h2>${h(({profile:"Customer Profile",addresses:"Address Book",orders:"Order History",wishlist:"My Wishlist"})[tab] || "My Account")}</h2></div><div class="ka-loading compact"><span class="ka-spinner"></span><p>Loading saved information…</p></div></section>`;
}

async function renderCurrentTab() {
  if (!db || !currentUser) return;
  const target = document.getElementById("kaTabContent");
  if (!target) return;
  target.innerHTML = renderTabLoading(activeTab);
  if (activeTab === "profile") await renderProfile(target);
  else if (activeTab === "addresses") await renderAddressBook(target);
  else if (activeTab === "orders") await renderOrderHistory(target);
  else if (activeTab === "wishlist") await renderWishlist(target);
}

async function ensureCustomerProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      displayName: user.displayName || "",
      email: user.email || "",
      photoURL: user.photoURL || "",
      phoneNumber: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } else {
    const saved = snap.data();
    const refresh = {};
    // Email remains a Google Authentication identity field; don't rewrite it from form data.
    if (saved.photoURL !== (user.photoURL || "")) refresh.photoURL = user.photoURL || "";
    if (!saved.displayName && user.displayName) refresh.displayName = user.displayName;
    if (Object.keys(refresh).length) {
      refresh.updatedAt = serverTimestamp();
      await updateDoc(ref, refresh);
    }
  }
}

async function signInWithGoogle() {
  if (!firebaseConfigured || !auth) {
    setStatus("Firebase configuration is missing. Open firebase-config.js and paste the existing KAILU CREATION Web App config.", "error");
    return;
  }
  if (loginBusy) return;
  loginBusy = true;
  statusMessage = "";
  renderLogin();
  const button = document.getElementById("kaGoogleSignIn");
  if (button) { button.disabled = true; button.innerHTML = `<span class="ka-google-g">G</span><span>Opening Google…</span><span class="ka-spinner ka-button-spinner"></span>`; }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithPopup(auth, provider);
    // onAuthStateChanged creates/loads the profile; no password registration exists.
    statusMessage = "";
  } catch (error) {
    console.warn("KAILU Google sign-in:", error?.code || error);
    if (["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(error?.code)) {
      setStatus("Google sign-in was cancelled. No changes were made.", "info");
    } else if (error?.code === "auth/popup-blocked") {
      // Some mobile browsers block popups. Fall back to Google's full-page redirect.
      try {
        setStatus("This browser blocked the sign-in popup. Redirecting to Google…", "info");
        await signInWithRedirect(auth, provider);
        return;
      } catch (redirectError) {
        console.warn("KAILU Google redirect sign-in:", redirectError?.code || redirectError);
        setStatus("Google sign-in was blocked. Allow redirects/pop-ups for this website and try again.", "error");
      }
    } else if (error?.code === "auth/unauthorized-domain") {
      setStatus("This website domain is not authorized in Firebase Authentication. Add the domain in Firebase Console → Authentication → Settings → Authorized domains.", "error");
    } else {
      setStatus(readableError(error), "error");
    }
  } finally {
    loginBusy = false;
    if (!currentUser) renderLogin();
  }
}

function readableError(error) {
  const code = String(error?.code || "");
  if (code.includes("permission-denied")) return "Firebase denied access. Check the Firestore Security Rules and make sure they match firestore.rules in this package.";
  if (code.includes("unavailable") || code.includes("network")) return "Network connection issue. Check the internet connection and retry.";
  if (code.includes("unauthenticated")) return "Your sign-in session expired. Sign in with Google again.";
  return error?.message ? `Unable to complete this request: ${error.message}` : "Something went wrong. Please try again.";
}

function currentProfileDoc() { return doc(db, "users", currentUser.uid); }

function profileReadHelp(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  if (code.includes("permission-denied") || /missing or insufficient permissions/i.test(message)) {
    return "Firestore denied access. In Firebase Console → Firestore Database → Rules, publish owner-only rules that allow the signed-in user's UID to read /users/{uid}. Do not open the database publicly.";
  }
  if (code.includes("failed-precondition") || code.includes("not-found") || /database.*does not exist/i.test(message)) {
    return "Check that Cloud Firestore Database has actually been created in this same Firebase project, and that firebase-config.js uses the project ID shown in Firebase Console.";
  }
  if (code.includes("unavailable") || code.includes("network") || /did not respond|taking too long/i.test(message)) {
    return "The Google account is signed in, but Firestore did not answer. Check internet/VPN or browser extensions, confirm Firestore Database exists in this same project, and inspect F12 → Console for the underlying Firebase error. Then choose Retry.";
  }
  return readableError(error) + " If this continues, check F12 → Console and Firestore Rules in Firebase Console.";
}

async function renderProfile(target) {
  let profile = {};
  let profileReadError = null;
  try {
    const snap = await withTimeout(
      getDoc(currentProfileDoc()),
      8000,
      "Firestore did not respond while loading the customer profile."
    );
    profile = snap.exists() ? snap.data() : {};
  } catch (error) {
    // Google Authentication can succeed even while Firestore is unavailable.
    // Keep the profile form usable with Google-provided details and show a clear warning.
    profileReadError = error;
    console.warn("KAILU CREATION profile read failed:", error?.code || error);
  }
  const createdAt = profile.createdAt?.toDate?.() || (currentUser.metadata?.creationTime ? new Date(currentUser.metadata.creationTime) : null);
  const createdLabel = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toLocaleDateString("en-IN", {day:"2-digit",month:"short",year:"numeric"}) : "Not available";
  const profileWarning = profileReadError ? `<div class="ka-warning-card" role="status"><strong>Google sign-in succeeded, but saved profile data could not be read.</strong><p>${h(profileReadHelp(profileReadError))}</p><button type="button" class="ka-outline-button" data-ka-retry-tab>Retry loading profile</button></div>` : "";
  target.innerHTML = `
    <section class="ka-tab-pane"><div class="ka-pane-heading"><div><h2>Customer Profile</h2><p>Google supplies the email and profile photo. Add your mobile number separately.</p></div></div>
      ${profileWarning}
      <form id="kaProfileForm" class="ka-form-grid">
        <label class="ka-field full">Full Name<input name="displayName" type="text" maxlength="120" required value="${h(profile.displayName ?? currentUser.displayName ?? "")}" autocomplete="name"></label>
        <label class="ka-field full">Email Address<input type="email" value="${h(currentUser.email || "")}" readonly aria-readonly="true"></label>
        <small class="ka-field-note full">Email is managed by your Google Account and cannot be changed from this page.</small>
        <label class="ka-field full">Mobile Number<input name="phoneNumber" type="tel" inputmode="numeric" maxlength="10" pattern="[6-9][0-9]{9}" required value="${h(profile.phoneNumber || "")}" placeholder="10-digit Indian mobile number" autocomplete="tel-national"></label>
        <label class="ka-field full">Account Creation Date<input type="text" value="${h(createdLabel)}" readonly></label>
        <div class="ka-profile-photo-row full">${currentUser.photoURL ? `<img src="${h(currentUser.photoURL)}" alt="Google profile photo" referrerpolicy="no-referrer">` : `<span class="ka-avatar ka-avatar-initial">${h((currentUser.displayName || "C").charAt(0).toUpperCase())}</span>`}<span>Profile photo ${currentUser.photoURL ? "provided by Google" : "not available from Google"}</span></div>
        <div class="ka-form-actions full"><button class="ka-primary-button" type="submit">Save Profile</button></div>
      </form>
    </section>`;
  const form = document.getElementById("kaProfileForm");
  form?.addEventListener("submit", async event => {
    event.preventDefault();
    const name = String(new FormData(form).get("displayName") || "").trim();
    const phone = normalizePhone(new FormData(form).get("phoneNumber"));
    if (name.length < 2) { setStatus("Please enter your full name.", "error"); return; }
    if (!/^[6-9]\d{9}$/.test(phone)) { setStatus("Enter a valid 10-digit Indian mobile number.", "error"); return; }
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true; submit.textContent = "Saving…";
    try {
      const profileRef = currentProfileDoc();
      const existingProfile = await withTimeout(
        getDoc(profileRef),
        8000,
        "Firestore did not respond while checking your saved profile. Please retry."
      );
      if (name !== (currentUser.displayName || "")) await updateProfile(currentUser, { displayName: name });
      const profileUpdate = {
        uid: currentUser.uid,
        displayName: name,
        email: currentUser.email || "",
        photoURL: currentUser.photoURL || "",
        phoneNumber: phone,
        updatedAt: serverTimestamp()
      };
      // Create documents need createdAt under the supplied Firestore rules;
      // preserve the original createdAt for existing customer documents.
      if (!existingProfile.exists()) profileUpdate.createdAt = serverTimestamp();
      await setDoc(profileRef, profileUpdate, { merge: true });
      setStatus("Profile updated successfully.", "success");
      await fillCheckoutAddress(null, {displayName:name, phoneNumber:phone});
      renderAccountUI();
    } catch (error) {
      submit.disabled = false; submit.textContent = "Save Profile";
      setStatus(readableError(error), "error");
    }
  });
}

async function renderAddressBook(target) {
  const snap = await getDocs(collection(db, "users", currentUser.uid, "addresses"));
  currentAddresses = snap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a,b) => Number(b.isDefault) - Number(a.isDefault));
  target.innerHTML = `
    <section class="ka-tab-pane"><div class="ka-pane-heading"><div><h2>Address Book</h2><p>Manage multiple delivery addresses. PIN data uses the existing website serviceability list.</p></div><button type="button" class="ka-primary-button" data-ka-address-new>＋ Add Address</button></div>
      <div id="kaAddressList" class="ka-address-list">${currentAddresses.length ? currentAddresses.map(addressCardMarkup).join("") : `<div class="ka-empty"><span>⌂</span><strong>No saved addresses yet</strong><p>Add a delivery address to speed up checkout.</p></div>`}</div>
      <div id="kaAddressEditor"></div>
    </section>`;
  await fillCheckoutAddress(currentAddresses.find(item => item.isDefault) || currentAddresses[0] || null);
}

function addressCardMarkup(address) {
  const addressText = [address.houseBuilding, address.landmark, address.roadArea, `${address.city}, ${address.state} ${address.pincode}`].filter(Boolean).join(", ");
  const pin = localPinData[String(address.pincode || "")];
  const cod = pin && pin.cod === false ? `<span class="ka-cod-warning">COD not listed for this PIN</span>` : "";
  return `<article class="ka-address-card ${address.isDefault ? "is-default" : ""}"><div class="ka-address-card-top"><strong>${h(address.fullName || "Delivery Address")}</strong>${address.isDefault ? `<span class="ka-default-label">DEFAULT</span>` : ""}</div><p>${h(address.mobileNumber || "")}</p><p>${h(addressText)}</p>${cod}<div class="ka-address-actions"><button type="button" data-ka-address-edit="${h(address.id)}">Edit</button><button type="button" data-ka-address-delete="${h(address.id)}">Delete</button>${address.isDefault ? "" : `<button type="button" data-ka-address-default="${h(address.id)}">Set as Default</button>`}</div></article>`;
}

function addressEditorMarkup(address = {}) {
  const isEdit = Boolean(address.id);
  return `<form id="kaAddressForm" class="ka-address-form" data-address-id="${h(address.id || "")}">
    <div class="ka-pane-heading"><div><h3>${isEdit ? "Edit Delivery Address" : "Add Delivery Address"}</h3><p>Fields marked * are required.</p></div><button type="button" class="ka-text-button" data-ka-address-cancel>Cancel</button></div>
    <div class="ka-form-grid">
      <label class="ka-field">Full Name *<input name="fullName" required maxlength="120" autocomplete="name" value="${h(address.fullName || "")}"></label>
      <label class="ka-field">Mobile Number *<input name="mobileNumber" required inputmode="numeric" type="tel" pattern="[6-9][0-9]{9}" maxlength="10" autocomplete="tel-national" value="${h(address.mobileNumber || "")}"></label>
      <label class="ka-field full">House No. / Building *<input name="houseBuilding" required maxlength="180" autocomplete="address-line1" value="${h(address.houseBuilding || "")}"></label>
      <label class="ka-field full">Landmark<input name="landmark" maxlength="180" value="${h(address.landmark || "")}"></label>
      <label class="ka-field full">Road Name / Area / Colony *<input name="roadArea" required maxlength="180" autocomplete="address-line2" value="${h(address.roadArea || "")}"></label>
      <label class="ka-field">Pincode *<input name="pincode" id="kaAddressPincode" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="postal-code" value="${h(address.pincode || "")}"></label>
      <label class="ka-field">City / District *<input name="city" id="kaAddressCity" required maxlength="100" value="${h(address.city || "")}"></label>
      <label class="ka-field">State *<input name="state" id="kaAddressState" required maxlength="100" value="${h(address.state || "")}"></label>
      <p id="kaAddressPinStatus" class="ka-pin-status full" aria-live="polite">PIN code fills City and State when available in the local serviceability list.</p>
      <label class="ka-check-field full"><input name="isDefault" type="checkbox" ${address.isDefault || (!isEdit && currentAddresses.length === 0) ? "checked" : ""}> Set as default delivery address</label>
      <div class="ka-form-actions full"><button class="ka-primary-button" type="submit">${isEdit ? "Save Changes" : "Save Address"}</button></div>
    </div>
  </form>`;
}

function openAddressEditor(address = null) {
  addressBeingEdited = address;
  const editor = document.getElementById("kaAddressEditor");
  if (!editor) return;
  editor.innerHTML = addressEditorMarkup(address || {});
  editor.querySelector("form")?.scrollIntoView({behavior:"smooth",block:"nearest"});
  const pin = document.getElementById("kaAddressPincode");
  if (pin?.value) autofillAddressPin(pin.value, false);
}

function autofillAddressPin(rawValue, clearStale = true) {
  const pin = String(rawValue || "").trim();
  const city = document.getElementById("kaAddressCity"), state = document.getElementById("kaAddressState"), status = document.getElementById("kaAddressPinStatus");
  if (!city || !state || !status) return;
  if (!/^\d{6}$/.test(pin)) {
    if (clearStale) { city.value = ""; state.value = ""; }
    status.textContent = pin ? "Enter a valid 6-digit PIN code." : "PIN code fills City and State when available in the local serviceability list.";
    status.className = "ka-pin-status full error";
    return;
  }
  const record = localPinData[pin];
  if (record) {
    city.value = record.district || "";
    state.value = record.state || "";
    status.textContent = record.cod === false
      ? `PIN listed for ${record.district || "this district"}, ${record.state || ""}; COD is not available according to the current serviceability data.`
      : `✓ ${record.district || "City"}, ${record.state || "State"} filled from the existing PIN data.`;
    status.className = `ka-pin-status full ${record.cod === false ? "warning" : "success"}`;
  } else {
    if (clearStale) { city.value = ""; state.value = ""; }
    status.textContent = "This PIN is not in the website's local lookup list. Enter City and State manually; delivery/COD will be confirmed by the store.";
    status.className = "ka-pin-status full warning";
  }
}

async function saveAddress(form) {
  const data = new FormData(form);
  const address = {
    fullName: String(data.get("fullName") || "").trim(),
    mobileNumber: normalizePhone(data.get("mobileNumber")),
    houseBuilding: String(data.get("houseBuilding") || "").trim(),
    landmark: String(data.get("landmark") || "").trim(),
    roadArea: String(data.get("roadArea") || "").trim(),
    pincode: String(data.get("pincode") || "").trim(),
    city: String(data.get("city") || "").trim(),
    state: String(data.get("state") || "").trim(),
    isDefault: data.get("isDefault") === "on"
  };
  if (address.fullName.length < 2) throw new Error("Enter the full name for this address.");
  if (!/^[6-9]\d{9}$/.test(address.mobileNumber)) throw new Error("Enter a valid 10-digit Indian mobile number.");
  if (!/^[0-9]{6}$/.test(address.pincode)) throw new Error("Enter a valid 6-digit PIN code.");
  if (!address.houseBuilding || !address.roadArea || !address.city || !address.state) throw new Error("Complete House/Building, Road/Area, City and State.");
  const record = localPinData[address.pincode];
  if (record?.cod === false) {
    const ok = window.confirm(`The saved PIN ${address.pincode} is marked as COD unavailable in the current serviceability data. Save the address anyway?`);
    if (!ok) return;
  }
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true; submit.textContent = "Saving…";
  try {
    const addressRef = addressBeingEdited?.id
      ? doc(db, "users", currentUser.uid, "addresses", addressBeingEdited.id)
      : null;
    const existingAddress = addressBeingEdited || null;
    const nowFields = {...address, updatedAt: serverTimestamp()};
    if (!addressRef) {
      nowFields.createdAt = serverTimestamp();
      nowFields.isDefault = address.isDefault || currentAddresses.length === 0 || !currentAddresses.some(item => item.isDefault);
      const added = await addDoc(collection(db, "users", currentUser.uid, "addresses"), nowFields);
      if (nowFields.isDefault) await setDefaultAddress(added.id, false);
    } else {
      // Keep one default where possible. Unchecking the current default promotes another
      // saved address; the only address remains default so checkout never has an invalid state.
      const otherAddresses = currentAddresses.filter(item => item.id !== addressRef.id);
      nowFields.isDefault = address.isDefault || (existingAddress.isDefault && otherAddresses.length === 0) || (!otherAddresses.some(item => item.isDefault) && !address.isDefault && !existingAddress.isDefault);
      nowFields.createdAt = existingAddress.createdAt;
      await setDoc(addressRef, nowFields, {merge:false});
      if (nowFields.isDefault) await setDefaultAddress(addressRef.id, false);
      else if (existingAddress.isDefault && otherAddresses.length) await setDefaultAddress(otherAddresses[0].id, false);
    }
    addressBeingEdited = null;
    setStatus("Delivery address saved.", "success");
    await renderCurrentTab();
  } catch (error) {
    submit.disabled = false; submit.textContent = addressBeingEdited?.id ? "Save Changes" : "Save Address";
    throw error;
  }
}

async function setDefaultAddress(addressId, rerender = true) {
  const refs = await getDocs(collection(db, "users", currentUser.uid, "addresses"));
  const batch = writeBatch(db);
  refs.docs.forEach(item => batch.update(item.ref, {isDefault:item.id === addressId, updatedAt:serverTimestamp()}));
  await batch.commit();
  if (rerender) {
    setStatus("Default delivery address updated.", "success");
    await renderCurrentTab();
  }
}

async function deleteAddress(addressId) {
  const address = currentAddresses.find(item => item.id === addressId);
  if (!address || !window.confirm("Delete this delivery address? This cannot be undone.")) return;
  await deleteDoc(doc(db, "users", currentUser.uid, "addresses", addressId));
  const remaining = currentAddresses.filter(item => item.id !== addressId);
  if (address.isDefault && remaining.length) await setDefaultAddress(remaining[0].id, false);
  setStatus("Address deleted.", "success");
  await renderCurrentTab();
}

async function fillCheckoutAddress(address, profile = null) {
  const profileValues = profile || (db && currentUser ? (await getDoc(currentProfileDoc())).data() || {} : {});
  const values = {
    customerName: address?.fullName || profileValues.displayName || currentUser?.displayName || "",
    mobileNumber: address?.mobileNumber || profileValues.phoneNumber || "",
    houseBuilding: address?.houseBuilding || "",
    landmark: address?.landmark || "",
    roadArea: address?.roadArea || "",
    pincode: address?.pincode || "",
    city: address?.city || "",
    state: address?.state || ""
  };
  Object.entries(values).forEach(([id,value]) => {
    const field = document.getElementById(id);
    if (field && !String(field.value || "").trim() && value) {
      field.value = value;
      if (id === "pincode" && address?.pincode) field.dispatchEvent(new Event("input", {bubbles:true}));
    }
  });
}

async function addProductToWishlist(productId) {
  if (!currentUser) {
    openAccount("profile");
    setStatus("Sign in with Google to save products to your Wishlist.", "info");
    return;
  }
  const products = window.KAILU_PRODUCT_CATALOG || [];
  const product = products.find(item => String(item.id) === String(productId));
  if (!product) { setStatus("This product is not available in the current catalog.", "error"); return; }
  const image = (product.images || []).find(item => item?.url || item?.fallback) || {};
  const variant = (product.variants || []).find(item => Number(item.inventory) > 0) || (product.variants || [])[0] || {};
  const safeDocId = encodeURIComponent(String(product.id)).replace(/\./g, "%2E");
  const ref = doc(db, "users", currentUser.uid, "wishlist", safeDocId);
  const exists = await getDoc(ref);
  if (exists.exists()) {
    await deleteDoc(ref);
    setStatus("Removed from Wishlist.", "success");
  } else {
    await setDoc(ref, {
      productId:String(product.id), name:String(product.name || "Product"), category:String(product.category || ""),
      sku:String(variant.sku || ""), imageUrl:String(image.url || ""), imageFallback:String(image.fallback || ""),
      price:Number(variant.price || 0), createdAt:serverTimestamp(), updatedAt:serverTimestamp()
    });
    setStatus("Added to Wishlist.", "success");
  }
  decorateProductCards();
  if (activeTab === "wishlist" && !document.getElementById("kailuAccountModal").hidden) await renderCurrentTab();
}

function decorateProductCards() {
  document.querySelectorAll(".catalog-card").forEach(card => {
    const actions = card.querySelector(".catalog-card-actions");
    if (!actions || actions.querySelector("[data-ka-wishlist-product]")) return;
    const productId = card.dataset.productId;
    if (!productId) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ka-wishlist-card";
    button.dataset.kaWishlistProduct = productId;
    button.title = "Add to Wishlist";
    button.setAttribute("aria-label", "Add to Wishlist");
    button.innerHTML = "♡";
    actions.insertBefore(button, actions.firstChild);
  });
}

async function renderWishlist(target) {
  const snap = await getDocs(collection(db, "users", currentUser.uid, "wishlist"));
  currentWishlist = snap.docs.map(item => ({id:item.id, ...item.data()}));
  const currentProducts = window.KAILU_PRODUCT_CATALOG || [];
  target.innerHTML = `<section class="ka-tab-pane"><div class="ka-pane-heading"><div><h2>My Wishlist</h2><p>Products saved to your Google-linked customer account.</p></div></div>
    ${currentWishlist.length ? `<div class="ka-wishlist-grid">${currentWishlist.map(item => {
      const product = currentProducts.find(p => String(p.id) === String(item.productId));
      const available = Boolean(product);
      const image = product ? ((product.images || []).find(x => x?.url || x?.fallback) || {}) : {url:item.imageUrl,fallback:item.imageFallback};
      const liveVariant = product ? ((product.variants || []).find(v => v.sku === item.sku) || (product.variants || [])[0]) : null;
      const priceText = liveVariant?.price != null ? money(liveVariant.price) : (available ? "Price unavailable" : "Product unavailable");
      return `<article class="ka-wishlist-card-item"><div class="ka-wishlist-image" data-ka-wishlist-image="${h(item.productId)}"></div><div class="ka-wishlist-info"><strong>${h(product?.name || item.name || "Product")}</strong><small>${h(product?.category || item.category || "")}</small><b>${h(priceText)}</b>${available ? `<span class="ka-stock-label">${liveVariant && Number(liveVariant.inventory) > 0 ? "Available in catalog" : "Check current availability"}</span>` : `<span class="ka-unavailable-label">No longer in current catalog</span>`}<div class="ka-wishlist-actions">${available ? `<button type="button" data-ka-view-wishlist="${h(item.productId)}">View Catalog</button>` : ""}<button type="button" data-ka-remove-wishlist="${h(item.id)}">Remove</button></div></div></article>`;
    }).join("")}</div>` : `<div class="ka-empty"><span>♡</span><strong>Your Wishlist is empty</strong><p>Use the heart on a catalog card to save a product here.</p><button type="button" class="ka-primary-button" data-ka-shop-now>Shop Catalogs</button></div>`}
    </section>`;
  currentWishlist.forEach(item => {
    const image = item.imageUrl || item.imageFallback;
    const wrap = target.querySelector(`[data-ka-wishlist-image="${CSS.escape(String(item.productId))}"]`);
    if (!wrap) return;
    if (image && /^(https?:|\/|\.\/)/i.test(image)) {
      const img = document.createElement("img"); img.loading = "lazy"; img.alt = item.name || "Wishlist product"; img.src = image;
      if (item.imageFallback && item.imageFallback !== image) img.onerror = () => { img.onerror = null; img.src = item.imageFallback; };
      wrap.appendChild(img);
    } else { wrap.textContent = "♡"; }
  });
}

async function renderOrderHistory(target) {
  target.innerHTML = `<section class="ka-tab-pane"><div class="ka-pane-heading"><div><h2>Order History</h2><p>Only orders whose Firebase UID was verified by the order backend appear here.</p></div><button type="button" class="ka-outline-button" data-ka-refresh-orders>Refresh</button></div><div class="ka-loading compact"><span class="ka-spinner"></span><p>Verifying your account and loading orders…</p></div></section>`;
  try {
    const idToken = await currentUser.getIdToken();
    const response = await requestCustomerOrders(idToken);
    if (!response?.ok) throw new Error(response?.message || "The order server could not verify this account.");
    currentOrders = Array.isArray(response.orders) ? response.orders : [];
    const pane = document.getElementById("kaTabContent");
    if (!pane) return;
    pane.innerHTML = `<section class="ka-tab-pane"><div class="ka-pane-heading"><div><h2>Order History</h2><p>Orders are matched by verified Firebase UID, not just by email address.</p></div><button type="button" class="ka-outline-button" data-ka-refresh-orders>Refresh</button></div>
      ${currentOrders.length ? `<div class="ka-orders-list">${currentOrders.map(orderCardMarkup).join("")}</div>` : `<div class="ka-empty"><span>▤</span><strong>No linked orders found</strong><p>New orders placed while signed in with Google will appear when the updated Google Apps Script backend is deployed. Older orders without a verified UID are not automatically assigned to an account.</p><button type="button" class="ka-primary-button" data-ka-shop-now>Shop Catalogs</button></div>`}
      </section>`;
    pane.querySelectorAll(".ka-order-line").forEach(line => {
      const sku = line.dataset.kaOrderSku || "";
      const product = (window.KAILU_PRODUCT_CATALOG || []).find(p => (p.variants || []).some(v => String(v.sku) === String(sku)));
      const image = product ? ((product.images || []).find(x => x?.url || x?.fallback) || {}) : {};
      const wrap = line.querySelector(".ka-order-photo");
      const candidates = [image.url, image.fallback].filter((value, index, all) => value && all.indexOf(value) === index && /^(https?:|\/|\.\/)/i.test(value));
      if (!wrap || !candidates.length) return;
      const img = document.createElement("img"); img.alt = product?.name || "Ordered product"; img.loading = "lazy"; img.src = candidates[0];
      if (candidates[1]) img.onerror = () => { img.onerror = null; img.src = candidates[1]; };
      wrap.appendChild(img);
    });
  } catch (error) {
    console.error("KAILU Order History:", error);
    target.innerHTML = `<section class="ka-tab-pane"><div class="ka-pane-heading"><div><h2>Order History</h2><p>Your order data was not returned because the server verification did not complete.</p></div><button type="button" class="ka-outline-button" data-ka-refresh-orders>Retry</button></div><div class="ka-warning-card"><strong>Order History setup or connection issue</strong><p>${h(readableError(error))}</p><p>Update and redeploy the existing Google Apps Script, then add the Firebase Web API Key to Script Properties as <code>FIREBASE_WEB_API_KEY</code>.</p></div></section>`;
  }
}

function orderCardMarkup(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const status = String(order.orderStatus || "New");
  const paymentText = String(order.paymentStatus || (/cod|cash on delivery/i.test(order.paymentMethod || "") ? "Payment Pending" : "Payment status not confirmed"));
  return `<article class="ka-order-card" data-ka-order="${h(order.orderId)}"><div class="ka-order-top"><div><small>ORDER ID</small><strong>${h(order.orderId || "Not available")}</strong><span>${h(order.orderDate || "Date unavailable")}</span></div><div class="ka-order-status"><span>${h(status)}</span><small>Payment: ${h(paymentText)}</small></div></div>
    <div class="ka-order-items">${items.length ? items.map(item => orderItemMarkup(item)).join("") : `<p class="ka-order-no-items">${h(order.itemsSummary || "Product details unavailable for this older order.")}</p>`}</div>
    <div class="ka-order-total"><span>${h(order.paymentMethod || "Payment method unavailable")}</span><strong>${money(order.total)}</strong></div>
    <div class="ka-order-actions"><button type="button" data-ka-track-order="${h(order.orderId)}">Track Order / View Status</button><button type="button" data-ka-reorder="${h(order.orderId)}" ${items.length ? "" : "disabled"}>Reorder</button><button type="button" data-ka-order-help="${h(order.orderId)}">Cancel / Return Help</button></div>
  </article>`;
}

function orderItemMarkup(item) {
  const product = (window.KAILU_PRODUCT_CATALOG || []).find(p => (p.variants || []).some(v => String(v.sku) === String(item.sku))) || null;
  const image = product ? ((product.images || []).find(x => x?.url || x?.fallback) || {}) : {};
  const photo = image.url || image.fallback || "";
  return `<div class="ka-order-line" data-ka-order-sku="${h(item.sku || "")}"><div class="ka-order-photo" data-ka-order-photo="${h(item.sku || "")}"></div><div class="ka-order-line-info"><strong>${h(item.productName || item.name || product?.name || "Product")}</strong><small>SKU: ${h(item.sku || "—")} · Size: ${h(item.size || "—")} · Qty: ${h(item.quantity ?? item.qty ?? "—")}</small><small>Unit: ${money(item.unitPrice)} · Line: ${money(item.lineTotal ?? Number(item.unitPrice || 0) * Number(item.quantity || item.qty || 0))}</small></div></div>`;
}

function requestCustomerOrders(idToken) {
  return new Promise((resolve, reject) => {
    const nonce = `kailuOrders_${window.crypto?.randomUUID ? window.crypto.randomUUID().replace(/-/g, "") : `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
    const frameName = `ka_customer_orders_${nonce}`;
    const frame = document.createElement("iframe");
    frame.name = frameName; frame.title = "Secure customer order history response";
    frame.style.cssText = "position:absolute;width:1px;height:1px;left:-9999px;border:0;";
    const form = document.createElement("form");
    form.method = "POST";
    form.action = window.KAILU_GOOGLE_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbw2zrWdILyGqxzopd3LHeiU6crc1JmPeM22xk7JBHpzRpLzy6ET4NTyJbFzmEOX-2b4Tg/exec";
    form.target = frameName; form.style.display = "none";
    [["action","customerOrders"],["nonce",nonce],["idToken",idToken],["origin",window.location.origin]].forEach(([name,value]) => {
      const input = document.createElement("input"); input.type = "hidden"; input.name = name; input.value = value; form.appendChild(input);
    });
    let settled = false;
    const cleanup = () => { window.removeEventListener("message", onMessage); clearTimeout(timer); form.remove(); frame.remove(); };
    const finish = (error, value) => { if (settled) return; settled = true; cleanup(); error ? reject(error) : resolve(value); };
    const onMessage = event => {
      const trustedGoogleOrigin = event.origin === "https://script.google.com" || /^https:\/\/([a-z0-9-]+\.)*googleusercontent\.com$/i.test(event.origin || "");
      if (!trustedGoogleOrigin || event.source !== frame.contentWindow || !event.data || event.data.type !== "KAILU_CUSTOMER_ORDERS_RESULT" || event.data.nonce !== nonce) return;
      finish(null, event.data.result);
    };
    const timer = setTimeout(() => finish(new Error("Order History request timed out. Check that the updated Google Apps Script was deployed as a web app.")), 25000);
    window.addEventListener("message", onMessage);
    document.body.append(frame, form);
    try { form.submit(); } catch (error) { finish(error); }
  });
}

async function handleModalClick(event) {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.matches("[data-ka-tab]")) {
    activeTab = button.dataset.kaTab;
    statusMessage = "";
    renderAccountUI();
    return;
  }
  if (button.matches("[data-ka-signout]")) {
    button.disabled = true; button.textContent = "Logging out…";
    try { await signOut(auth); activeTab = "profile"; setStatus("You have logged out.", "success"); }
    catch (error) { setStatus(readableError(error), "error"); }
    return;
  }
  if (button.matches("[data-ka-address-new]")) { openAddressEditor(null); return; }
  if (button.matches("[data-ka-address-cancel]")) { addressBeingEdited = null; document.getElementById("kaAddressEditor").replaceChildren(); return; }
  if (button.matches("[data-ka-address-edit]")) {
    const address = currentAddresses.find(item => item.id === button.dataset.kaAddressEdit);
    if (address) openAddressEditor(address);
    return;
  }
  if (button.matches("[data-ka-address-delete]")) {
    try { await deleteAddress(button.dataset.kaAddressDelete); }
    catch (error) { setStatus(readableError(error), "error"); }
    return;
  }
  if (button.matches("[data-ka-address-default]")) {
    try { await setDefaultAddress(button.dataset.kaAddressDefault); }
    catch (error) { setStatus(readableError(error), "error"); }
    return;
  }
  if (button.matches("[data-ka-retry-tab]")) { renderAccountUI(); return; }
  if (button.matches("[data-ka-refresh-orders]")) { await renderCurrentTab(); return; }
  if (button.matches("[data-ka-remove-wishlist]")) {
    try {
      await deleteDoc(doc(db, "users", currentUser.uid, "wishlist", button.dataset.kaRemoveWishlist));
      setStatus("Removed from Wishlist.", "success"); await renderCurrentTab(); decorateProductCards();
    } catch (error) { setStatus(readableError(error), "error"); }
    return;
  }
  if (button.matches("[data-ka-view-wishlist]")) {
    const id = button.dataset.kaViewWishlist;
    closeAccount();
    if (typeof window.KAILU_OPEN_CATALOG === "function") window.KAILU_OPEN_CATALOG(id);
    else document.querySelector(`[data-open-product="${CSS.escape(id)}"]`)?.click();
    return;
  }
  if (button.matches("[data-ka-shop-now]")) { closeAccount(); document.getElementById("products")?.scrollIntoView({behavior:"smooth"}); return; }
  if (button.matches("[data-ka-track-order]")) {
    const order = currentOrders.find(item => String(item.orderId) === String(button.dataset.kaTrackOrder));
    if (order) setStatus(`Order ${order.orderId}: ${order.orderStatus || "New"}. Payment: ${order.paymentStatus || "Payment Pending"}. Live courier tracking is not connected to this sheet yet.`, "info");
    return;
  }
  if (button.matches("[data-ka-reorder]")) {
    const order = currentOrders.find(item => String(item.orderId) === String(button.dataset.kaReorder));
    if (!order || !Array.isArray(order.items) || typeof window.KAILU_REORDER_ITEMS !== "function") {
      setStatus("Reorder could not be started because the current catalog items could not be matched.", "error"); return;
    }
    closeAccount();
    const result = window.KAILU_REORDER_ITEMS(order.items);
    if (result) { if (typeof window.KAILU_SHOW_TOAST === "function") window.KAILU_SHOW_TOAST("Matched items added to cart using current catalog stock and prices."); }
    else if (typeof window.KAILU_SHOW_TOAST === "function") window.KAILU_SHOW_TOAST("None of the ordered items is currently available in the catalog.");
    return;
  }
  if (button.matches("[data-ka-order-help]")) {
    const order = currentOrders.find(item => String(item.orderId) === String(button.dataset.kaOrderHelp));
    const message = encodeURIComponent(`Hello KAILU CREATION, I need help with order ${order?.orderId || button.dataset.kaOrderHelp}. Please confirm whether cancellation/return/exchange is available.`);
    window.open(`https://wa.me/919227115179?text=${message}`, "_blank", "noopener,noreferrer");
  }
}

async function handleModalSubmit(event) {
  if (event.target?.id !== "kaAddressForm") return;
  event.preventDefault();
  try { await saveAddress(event.target); }
  catch (error) { setStatus(readableError(error), "error"); }
}

function handleModalInput(event) {
  if (event.target?.id === "kaAddressPincode") {
    const pin = event.target.value.replace(/\D/g, "").slice(0, 6);
    if (event.target.value !== pin) event.target.value = pin;
    autofillAddressPin(pin);
  }
}

function handleModalChange(event) {
  if (event.target?.name === "isDefault" && event.target.type === "checkbox") {
    // No extra state; the chosen value is captured when the address is saved.
  }
}

function subscribeToProductGrid() {
  decorateProductCards();
  const grid = document.getElementById("productGrid");
  if (!grid || typeof MutationObserver === "undefined") return;
  const observer = new MutationObserver(() => decorateProductCards());
  observer.observe(grid, {childList:true,subtree:true});
}

function installWishlistClickHandler() {
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-ka-wishlist-product]");
    if (!button) return;
    event.preventDefault(); event.stopPropagation();
    addProductToWishlist(button.dataset.kaWishlistProduct).catch(error => setStatus(readableError(error), "error"));
  }, true);
}

function updateHeaderButton() {
  if (!accountButton) return;
  accountButton.title = currentUser ? `My Account — ${currentUser.email || "Signed in"}` : "Sign in with Google";
  accountButton.setAttribute("aria-label", currentUser ? "Open My Account" : "Sign in with Google");
  const label = accountButton.querySelector(".ka-account-button-label");
  if (label) label.textContent = currentUser ? "My Account" : "Sign in";
  accountButton.classList.toggle("is-signed-in", Boolean(currentUser));
}

async function initializeSignedInCustomer(user) {
  try {
    await withTimeout(
      ensureCustomerProfile(user),
      10000,
      "Google sign-in succeeded, but Firestore did not respond in time. Check Firestore Security Rules and network access."
    );
  } catch (error) {
    console.error("KAILU Customer profile initialization:", error);
    if (auth?.currentUser?.uid === user.uid) {
      setStatus(readableError(error), "error");
    }
    // Do not block Login/My Account because profile storage is unavailable.
    return;
  }

  try {
    if (activeTab === "addresses") {
      const addresses = await withTimeout(
        getDocs(collection(db, "users", user.uid, "addresses")),
        8000,
        "Saved addresses took too long to load."
      );
      const defaults = addresses.docs.map(d => d.data()).find(a => a.isDefault) || addresses.docs[0]?.data() || null;
      if (defaults) await fillCheckoutAddress(defaults);
    } else {
      const profile = await withTimeout(
        getDoc(doc(db, "users", user.uid)),
        8000,
        "Customer profile took too long to load."
      );
      if (profile.exists()) await fillCheckoutAddress(null, profile.data());
    }
  } catch (error) {
    console.warn("KAILU checkout address prefill skipped:", error);
    // This is optional checkout prefill; it must not lock Customer Account UI.
  }
}

if (firebaseConfigured) {
  try {
    app = getApps().find(item => item.name === "kailuCustomerAccount") || initializeApp(CONFIG, "kailuCustomerAccount");
    auth = getAuth(app);
    db = getFirestore(app);
    setPersistence(auth, browserLocalPersistence).catch(error => console.warn("Could not set local Firebase Auth persistence:", error));
    getRedirectResult(auth).catch(error => {
      console.warn("KAILU Google redirect result:", error?.code || error);
      statusMessage = error?.code === "auth/unauthorized-domain"
        ? "This website domain is not authorized in Firebase Authentication. Add it in Authorized domains."
        : readableError(error);
      statusType = "error";
      if (!document.getElementById("kailuAccountModal")?.hidden) renderAccountUI();
    });
    // A slow Firestore profile read must never block the whole account panel.
    // The watchdog also prevents an infinite first-load spinner if Firebase Auth
    // cannot finish restoring the browser session (offline/network/browser issue).
    authInitialStateTimer = window.setTimeout(() => {
      if (authReady) return;
      currentUser = auth?.currentUser || null;
      authReady = true;
      statusMessage = currentUser
        ? "Your Google session was found, but Firebase is taking longer than usual. Account data may need a retry."
        : "Firebase could not confirm your session yet. Check your internet connection and try again.";
      statusType = "error";
      updateHeaderButton();
      if (!document.getElementById("kailuAccountModal")?.hidden) renderAccountUI();
    }, 10000);

    onAuthStateChanged(auth, user => {
      if (authInitialStateTimer !== null) {
        window.clearTimeout(authInitialStateTimer);
        authInitialStateTimer = null;
      }
      currentUser = user;
      // Mark auth as ready immediately; profile and checkout prefill run separately.
      authReady = true;
      updateHeaderButton();
      if (!document.getElementById("kailuAccountModal")?.hidden) renderAccountUI();
      if (user) initializeSignedInCustomer(user);
    });
  } catch (error) {
    console.error("KAILU Firebase initialization failed:", error);
    authReady = true;
    statusMessage = "Firebase could not initialize. Check firebase-config.js and the existing Firebase project setup.";
    statusType = "error";
  }
} else {
  authReady = true;
  statusMessage = "Firebase Web App Configuration needs to be added before Google Login can work.";
  statusType = "error";
}

buildModal();
accountButton?.addEventListener("click", () => openAccount());
installWishlistClickHandler();
subscribeToProductGrid();

// A small bridge lets the existing classic storefront submit orders with the signed-in identity.
window.KAILU_CUSTOMER_ACCOUNT = {
  getSession: () => ({ user: currentUser, ready: authReady, configured: firebaseConfigured }),
  open: openAccount,
  toggleWishlist: addProductToWishlist
};
window.__KAILU_CUSTOMER_ACCOUNT_MODULE_READY = true;
