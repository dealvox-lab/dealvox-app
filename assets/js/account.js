// /assets/js/account.js

// ------- View-specific initializer: Account / Profile -------

async function initAccountProfileView() {
  const form = document.getElementById("profileForm");
  if (!form) return;

  // Prevent double-initialization when switching tabs
  if (form.dataset.bound === "1") return;
  form.dataset.bound = "1";

  const statusEl     = document.getElementById("profileStatus");
  const saveBtn      = document.getElementById("profileSaveBtn");
  const emailEl      = document.getElementById("profileEmail");
  const firstNameEl  = document.getElementById("profileFirstName");
  const lastNameEl   = document.getElementById("profileLastName");
  const jobTitleEl   = document.getElementById("profileJobTitle");
  const companyEl    = document.getElementById("profileCompanyName");

  // 1) Get auth info (id + email + access token) from debug-auth
  let userId = null;
  let userEmail = null;
  let accessToken = null;

  try {
    const res = await fetch("/debug-auth", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      userId = data.userSummary?.id || null;
      userEmail = data.userSummary?.email || data.email || null;
      accessToken = data.accessToken || null;
    }
  } catch (e) {
    console.error("Failed to get user info", e);
  }

  if (!userId || !accessToken) {
    if (statusEl) statusEl.textContent = "Unable to load profile.";
    return;
  }

  if (emailEl && userEmail) {
    emailEl.value = userEmail;
  }

  const supabaseUrl  = window.SUPABASE_URL;
  const supabaseAnon = window.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnon) {
    console.warn("SUPABASE_URL or SUPABASE_ANON_KEY not set on window");
    if (statusEl) statusEl.textContent = "Profile service not configured.";
    return;
  }

  const baseRestUrl = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/profiles`;

  const commonHeaders = {
    apikey: supabaseAnon,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  // 2) Load existing profile (if any)
  try {
    if (statusEl) statusEl.textContent = "Loading…";

    const params = new URLSearchParams();
    params.set(
      "select",
      "first_name,last_name,job_title,company_name,email"
    );
    params.set("id", `eq.${userId}`);

    const res = await fetch(`${baseRestUrl}?${params.toString()}`, {
      headers: commonHeaders,
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("Profile load HTTP error:", res.status, txt);
      if (statusEl) statusEl.textContent = "Could not load profile.";
    } else {
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
    }
  } catch (e) {
    console.error("Profile load failed:", e);
    if (statusEl) statusEl.textContent = "Could not load profile.";
  }

  // 3) Save handler – upsert (create if first time, update later)
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!saveBtn) return;

    saveBtn.disabled = true;
    if (statusEl) statusEl.textContent = "Saving…";

    const payload = {
      id: userId,
      email: userEmail,
      first_name:  firstNameEl ? (firstNameEl.value.trim() || null) : null,
      last_name:   lastNameEl  ? (lastNameEl.value.trim()  || null) : null,
      job_title:   jobTitleEl  ? (jobTitleEl.value.trim()  || null) : null,
      company_name: companyEl  ? (companyEl.value.trim()   || null) : null,
    };

    try {
      const res = await fetch(baseRestUrl, {
        method: "POST",
        headers: {
          ...commonHeaders,
          // Upsert behaviour
          Prefer: "return=minimal, resolution=merge-duplicates",
        },
        body: JSON.stringify(payload),
      });

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

// ------- Main SPA loader / sidebar logic -------

document.addEventListener("DOMContentLoaded", () => {
  const contentEl = document.getElementById("accountContent");
  const viewEl    = document.getElementById("accountView");
  const links     = document.querySelectorAll(".sidebar-nav .nav-link");

  // Sidebar email element
  const emailEl   = document.getElementById("sidebarEmail");

  // Map logical view -> partial file
  const VIEW_FILES = {
    account:   "/assets/partials/account-profile.html",
    prompt:    "/assets/partials/account-prompt.html",
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
