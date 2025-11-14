// /assets/js/account.js

// ----- View-specific initializer: Account / Profile -----
async function initAccountProfileView() {
  const form = document.getElementById("profileForm");
  if (!form) return;
  if (!window.supabaseClient) {
    console.warn("Supabase client not found on window.supabaseClient");
    return;
  }

  // Prevent double-binding when switching tabs back and forth
  if (form.dataset.bound === "1") return;
  form.dataset.bound = "1";

  const sb = window.supabaseClient;
  const statusEl   = document.getElementById("profileStatus");
  const saveBtn    = document.getElementById("profileSaveBtn");

  const firstNameEl = document.getElementById("profileFirstName");
  const lastNameEl  = document.getElementById("profileLastName");
  const jobTitleEl  = document.getElementById("profileJobTitle");
  const companyEl   = document.getElementById("profileCompanyName");

  let userId = null;

  // 1) Get current user id from debug-auth
  try {
    const res = await fetch("/debug-auth", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      if (data.userSummary && data.userSummary.id) {
        userId = data.userSummary.id;
      }
    }
  } catch (e) {
    console.error("Failed to get user id", e);
  }

  if (!userId) {
    if (statusEl) statusEl.textContent = "Unable to load profile.";
    return;
  }

  // 2) Load profile data from Supabase
  try {
    if (statusEl) statusEl.textContent = "Loading…";

    const { data, error } = await sb
      .from("profiles")
      .select("first_name, last_name, job_title, company_name")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Profile load error:", error);
      if (statusEl) statusEl.textContent = "Could not load profile.";
    } else if (data) {
      if (firstNameEl) firstNameEl.value = data.first_name || "";
      if (lastNameEl)  lastNameEl.value  = data.last_name  || "";
      if (jobTitleEl)  jobTitleEl.value  = data.job_title  || "";
      if (companyEl)   companyEl.value   = data.company_name || "";
      if (statusEl) statusEl.textContent = "";
    } else {
      // No row yet – blank form
      if (statusEl) statusEl.textContent = "";
    }
  } catch (e) {
    console.error("Profile load failed:", e);
    if (statusEl) statusEl.textContent = "Could not load profile.";
  }

  // 3) Save handler
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!saveBtn) return;

    saveBtn.disabled = true;
    if (statusEl) statusEl.textContent = "Saving…";

    const payload = {
      id: userId,
      first_name:  firstNameEl ? (firstNameEl.value.trim() || null) : null,
      last_name:   lastNameEl  ? (lastNameEl.value.trim()  || null) : null,
      job_title:   jobTitleEl  ? (jobTitleEl.value.trim()  || null) : null,
      company_name: companyEl  ? (companyEl.value.trim()   || null) : null,
    };

    const { error } = await sb
      .from("profiles")
      .upsert(payload, { onConflict: "id" });

    if (error) {
      console.error("Profile save error:", error);
      if (statusEl) statusEl.textContent = "Save failed. Try again.";
    } else {
      if (statusEl) statusEl.textContent = "Saved.";
      setTimeout(() => {
        if (statusEl) statusEl.textContent = "";
      }, 2000);
    }

    saveBtn.disabled = false;
  });
}

// ----- Main SPA loader -----
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
    // etc. later…
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
      console.log("First 120 chars:", text.slice(0, 120));

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      viewEl.innerHTML = text;
      setActiveLink(view);

      // Call view-specific initializer after HTML is injected
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

  // Load sidebar email
  if (emailEl) {
    (async () => {
      try {
        const res = await fetch("/debug-auth", {
          credentials: "include"
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // prefer the top-level email if present
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
