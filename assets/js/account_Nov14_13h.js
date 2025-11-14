// /assets/js/account.js

// ---------- Shared helpers ----------

// Read current auth info from /debug-auth
async function getAuthInfo() {
  const res = await fetch("/debug-auth", { credentials: "include" });
  if (!res.ok) throw new Error(`debug-auth HTTP ${res.status}`);
  const data = await res.json();

  return {
    userId: data.userSummary?.id || null,
    email: data.userSummary?.email || data.email || null,
    accessToken: data.accessToken || null
  };
}

// Call Cloudflare function to refresh Supabase JWT
async function refreshToken() {
  try {
    const res = await fetch("/refresh", {
      method: "POST",
      credentials: "include"
    });
    console.log("Refresh response status:", res.status);
    if (!res.ok) {
      console.error("Refresh failed:", await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("Token refresh request failed:", e);
    return false;
  }
}

// Build headers for Supabase REST call
function supabaseHeaders(accessToken) {
  const url = window.SUPABASE_URL;
  const anon = window.SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error("SUPABASE_URL or SUPABASE_ANON_KEY missing on window");
  }

  if (!accessToken) {
    throw new Error("accessToken is required for Supabase REST call");
  }

  return {
    apikey: anon,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };
}

// Handle 401 from Supabase REST, refresh if JWT expired, and return new auth or null
async function handleJwt401(res, contextLabel) {
  const bodyText = await res.text();
  console.warn(`401 from Supabase (${contextLabel}):`, bodyText);

  if (!/JWT expired/i.test(bodyText)) {
    // Some other 401 (not just expiry)
    return null;
  }

  const ok = await refreshToken();
  if (!ok) return null;

  try {
    const auth = await getAuthInfo();
    if (!auth.accessToken) return null;
    return auth; // updated auth info
  } catch (e) {
    console.error("Failed to reload auth info after refresh:", e);
    return null;
  }
}

// ---------- View-specific initializer: Account / Profile ----------

async function initAccountProfileView() {
  const form = document.getElementById("profileForm");
  if (!form) return;

  // Prevent double-init when switching tabs
  if (form.dataset.bound === "1") return;
  form.dataset.bound = "1";

  const statusEl     = document.getElementById("profileStatus");
  const saveBtn      = document.getElementById("profileSaveBtn");
  const emailEl      = document.getElementById("profileEmail");
  const firstNameEl  = document.getElementById("profileFirstName");
  const lastNameEl   = document.getElementById("profileLastName");
  const jobTitleEl   = document.getElementById("profileJobTitle");
  const companyEl    = document.getElementById("profileCompanyName");

  // 1) Get initial auth info
  let auth;
  try {
    auth = await getAuthInfo();
  } catch (e) {
    console.error("getAuthInfo failed:", e);
    if (statusEl) statusEl.textContent = "Unable to load profile.";
    return;
  }

  if (!auth.userId || !auth.accessToken) {
    if (statusEl) statusEl.textContent = "Unable to load profile.";
    return;
  }

  if (emailEl && auth.email) {
    emailEl.value = auth.email;
  }

  const supabaseUrl = (window.SUPABASE_URL || "").replace(/\/+$/, "");
  if (!supabaseUrl || !window.SUPABASE_ANON_KEY) {
    console.warn("Supabase globals not set");
    if (statusEl) statusEl.textContent = "Profile service not configured.";
    return;
  }

  const baseRestUrl = `${supabaseUrl}/rest/v1/profiles`;

  // 2) Load existing profile (if any), with JWT-refresh retry
  try {
    if (statusEl) statusEl.textContent = "Loading…";

    const params = new URLSearchParams();
    params.set(
      "select",
      "first_name,last_name,job_title,company_name,email"
    );
    params.set("id", `eq.${auth.userId}`);

    async function run(currentAuth) {
      return fetch(`${baseRestUrl}?${params.toString()}`, {
        headers: supabaseHeaders(currentAuth.accessToken)
      });
    }

    let res = await run(auth);

    if (res.status === 401) {
      const newAuth = await handleJwt401(res, "load profile");
      if (!newAuth) {
        if (statusEl) statusEl.textContent = "Session expired. Please log in again.";
        return;
      }
      auth = newAuth;
      res = await run(auth);
    }

    if (!res.ok) {
      const txt = await res.text();
      console.error("Profile load HTTP error:", res.status, txt);
      if (statusEl) statusEl.textContent = "Could not load profile.";
      return;
    }

    const rows = await res.json();
    const data = rows[0];

    if (data) {
      if (firstNameEl) firstNameEl.value = data.first_name || "";
      if (lastNameEl)  lastNameEl.value  = data.last_name  || "";
      if (jobTitleEl)  jobTitleEl.value  = data.job_title  || "";
      if (companyEl)   companyEl.value   = data.company_name || "";
      if (emailEl && data.email && !emailEl.value) emailEl.value = data.email;
    }

    if (statusEl) statusEl.textContent = "";
  } catch (e) {
    console.error("Profile load failed:", e);
    if (statusEl) statusEl.textContent = "Could not load profile.";
  }

  // 3) Save handler – upsert (create if first time, update later), with JWT-refresh retry
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!saveBtn) return;

    saveBtn.disabled = true;
    if (statusEl) statusEl.textContent = "Saving…";

    const payload = {
      id: auth.userId,
      email: auth.email,
      first_name:  firstNameEl ? (firstNameEl.value.trim() || null) : null,
      last_name:   lastNameEl  ? (lastNameEl.value.trim()  || null) : null,
      job_title:   jobTitleEl  ? (jobTitleEl.value.trim()  || null) : null,
      company_name: companyEl  ? (companyEl.value.trim()   || null) : null,
    };

    try {
      async function run(currentAuth) {
        return fetch(baseRestUrl, {
          method: "POST",
          headers: {
            ...supabaseHeaders(currentAuth.accessToken),
            // Upsert behaviour
            Prefer: "return=minimal, resolution=merge-duplicates",
          },
          body: JSON.stringify(payload),
        });
      }

      let res = await run(auth);

      if (res.status === 401) {
        const newAuth = await handleJwt401(res, "save profile");
        if (!newAuth) {
          if (statusEl) statusEl.textContent = "Session expired. Please log in again.";
          saveBtn.disabled = false;
          return;
        }
        auth = newAuth;
        res = await run(auth);
      }

      if (!res.ok) {
        const txt = await res.text();
        console.error("Profile save HTTP error:", res.status, txt);
        if (statusEl) statusEl.textContent = "Save failed. Try again.";
      } else {
        if (statusEl) statusEl.textContent = "Saved.";
        setTimeout(() => {
          if (statusEl) statusEl.textContent = "";
        }, 2000);
      }
    } catch (err) {
      console.error("Profile save error:", err);
      if (statusEl) statusEl.textContent = "Save failed. Try again.";
    } finally {
      saveBtn.disabled = false;
    }
  });
}

// ---------- Main SPA loader / sidebar logic ----------

document.addEventListener("DOMContentLoaded", () => {
  const contentEl = document.getElementById("accountContent");
  const viewEl    = document.getElementById("accountView");
  const links     = document.querySelectorAll(".sidebar-nav .nav-link");

  // Sidebar email element
  const emailEl   = document.getElementById("sidebarEmail");

  // Map logical view -> partial file
  const VIEW_FILES = {
    account:   "/assets/partials/account-profile.html",
    assistant:    "/assets/partials/account-assistant.html",
    api:       "/assets/partials/account-api.html",
    reports:   "/assets/partials/account-reports.html",
    spendings: "/assets/partials/account-spendings.html",
    billing:   "/assets/partials/account-billing.html",
    help:      "/assets/partials/account-help.html",
  };

  // Map view -> initializer
  const viewInitializers = {
    account: initAccountProfileView,
    // prompt: initPromptView,
    // api: initApiView,
    // etc…
  };

  function setActiveLink(view) {
    links.forEach(a => {
      a.classList.toggle("active", a.dataset.view === view);
    });
  }

  async function loadView(view) {
    const file = VIEW_FILES[view];

    if (!file) {
      viewEl.innerHTML = `
        <div class="empty">
          Unknown section: <strong>${view}</strong>
        </div>`;
      return;
    }

    try {
      contentEl.setAttribute("aria-busy", "true");
      viewEl.innerHTML = `
        <div class="loading">
          <div class="spinner"></div>
          <div>Loading…</div>
        </div>`;

      const res  = await fetch(file, { cache: "no-cache" });
      const text = await res.text();
      console.log("Loaded view:", view, "from", res.url, "status", res.status);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      viewEl.innerHTML = text;
      setActiveLink(view);

      // Initialize view-specific JS after HTML is injected
      if (viewInitializers[view]) {
        viewInitializers[view]();
      }

      if (location.hash !== "#" + view) {
        history.replaceState(null, "", "#" + view);
      }
      contentEl.focus();
    } catch (err) {
      console.error("Failed to load view", view, err);
      viewEl.innerHTML = `
        <div class="empty">
          Could not load this section. Please try again.
        </div>`;
    } finally {
      contentEl.setAttribute("aria-busy", "false");
    }
  }

  function viewFromHash() {
    const hash = (location.hash || "").replace("#", "");
    return hash && VIEW_FILES[hash] ? hash : "account";
  }

  links.forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const view = a.dataset.view;
      loadView(view);
    });
  });

  window.addEventListener("hashchange", () => {
    loadView(viewFromHash());
  });

  // Load sidebar email under the logo
  if (emailEl) {
    (async () => {
      try {
        const res = await fetch("/debug-auth", {
          credentials: "include"
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data.email) {
          emailEl.textContent = data.email;
        } else if (data.userSummary && data.userSummary.email) {
          emailEl.textContent = data.userSummary.email;
        } else {
          emailEl.textContent = "";
        }
      } catch (e) {
        console.error("Email load failed:", e);
        emailEl.textContent = "";
      }
    })();
  }

  // Initial load
  loadView(viewFromHash());
});
