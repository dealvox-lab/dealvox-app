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
      const body = await res.text();
      console.error("Refresh failed:", body);
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

// Handle 401 from Supabase REST: always try a refresh once
async function handleJwt401(res, contextLabel) {
  const bodyText = await res.text();
  console.warn(`401 from Supabase (${contextLabel}):`, bodyText);

  const ok = await refreshToken();
  if (!ok) {
    console.warn("Token refresh failed in handleJwt401");
    return null;
  }

  try {
    const auth = await getAuthInfo();
    if (!auth.accessToken) return null;
    return auth; // updated auth
  } catch (e) {
    console.error("Failed to reload auth info after refresh:", e);
    return null;
  }
}


// ---------- View-specific initializer: Account / Profile ----------

async function initAccountProfileView() {
  const form = document.getElementById("profileForm");
  if (!form) return;

  // Prevent double-init
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

  // 3) Save handler – upsert (create if first time, update later)
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

// ---------- View-specific initializer: Assistant ----------

async function initAccountAssistantView() {
  const form = document.getElementById("assistantForm");
  if (!form) return;

  // Prevent double-init
  if (form.dataset.bound === "1") return;
  form.dataset.bound = "1";

  const statusEl      = document.getElementById("asstStatus");
  const saveBtn       = document.getElementById("asstSaveBtn");

  const agentIdEl     = document.getElementById("asstAgentId");
  const agentNameEl   = document.getElementById("asstAgentName");
  const publishedEl   = document.getElementById("asstPublished");
  const languageEl    = document.getElementById("asstLanguage");
  const versionEl     = document.getElementById("asstVersion");
  const llmIdEl       = document.getElementById("asstLlmId");
  const promptLlmEl   = document.getElementById("asstPromptLlm");
  const promptEl      = document.getElementById("asstPrompt");
  const introPromptEl = document.getElementById("asstIntroPrompt");
  const webhookUrlEl  = document.getElementById("asstWebhookUrl");

  // 1) Get initial auth info
  let auth;
  try {
    auth = await getAuthInfo();
  } catch (e) {
    console.error("getAuthInfo failed:", e);
    if (statusEl) statusEl.textContent = "Unable to load assistant.";
    return;
  }

  if (!auth.userId || !auth.accessToken) {
    if (statusEl) statusEl.textContent = "Unable to load assistant.";
    return;
  }

  const supabaseUrl = (window.SUPABASE_URL || "").replace(/\/+$/, "");
  if (!supabaseUrl || !window.SUPABASE_ANON_KEY) {
    console.warn("Supabase globals not set");
    if (statusEl) statusEl.textContent = "Assistant service not configured.";
    return;
  }

  const baseRestUrl = `${supabaseUrl}/rest/v1/assistants`;

  // 2) Load existing assistant for this user (latest version), with JWT-refresh retry
  try {
    if (statusEl) statusEl.textContent = "Loading…";

    const params = new URLSearchParams();
    params.set(
      "select",
      "id,user_id,agent_id,agent_name,is_published,language,version,llm_id,prompt_llm,prompt,intro_prompt,webhook_url"
    );
    params.set("user_id", `eq.${auth.userId}`);
    // get the latest version if you have multiple
    params.set("order", "version.desc");
    params.set("limit", "1");

    async function run(currentAuth) {
      return fetch(`${baseRestUrl}?${params.toString()}`, {
        headers: supabaseHeaders(currentAuth.accessToken)
      });
    }

    let res = await run(auth);

    if (res.status === 401) {
      const newAuth = await handleJwt401(res, "load assistant");
      if (!newAuth) {
        if (statusEl) statusEl.textContent = "Session expired. Please log in again.";
        return;
      }
      auth = newAuth;
      res = await run(auth);
    }

    if (!res.ok) {
      const txt = await res.text();
      console.error("Assistant load HTTP error:", res.status, txt);
      if (statusEl) statusEl.textContent = "Could not load assistant.";
      return;
    }

    const rows = await res.json();
    const data = rows[0];

    if (data) {
      if (agentIdEl)     agentIdEl.value     = data.agent_id      || "";
      if (agentNameEl)   agentNameEl.value   = data.agent_name    || "";
      if (publishedEl)   publishedEl.value   = data.is_published ? "true" : "false";
      if (languageEl)    languageEl.value    = data.language      || "en-US";
      if (versionEl)     versionEl.value     = data.version       || 1;
      if (llmIdEl)       llmIdEl.value       = data.llm_id        || "";
      if (promptLlmEl)   promptLlmEl.value   = data.prompt_llm    || "";
      if (promptEl)      promptEl.value      = data.prompt        || "";
      if (introPromptEl) introPromptEl.value = data.intro_prompt  || "";
      if (webhookUrlEl)  webhookUrlEl.value  = data.webhook_url   || "";
    } else {
      // no row yet – sensible defaults
      if (languageEl && !languageEl.value) languageEl.value = "en-US";
      if (versionEl && !versionEl.value)   versionEl.value   = 1;
    }

    if (statusEl) statusEl.textContent = "";
  } catch (e) {
    console.error("Assistant load failed:", e);
    if (statusEl) statusEl.textContent = "Could not load assistant.";
  }

  // 3) Save handler – upsert by (user_id, agent_id, version)
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!saveBtn) return;

    saveBtn.disabled = true;
    if (statusEl) statusEl.textContent = "Saving…";

    const rawPublished = publishedEl ? publishedEl.value : "false";
    const isPublished = rawPublished === "true";

    const version =
      versionEl && versionEl.value
        ? parseInt(versionEl.value, 10) || 1
        : 1;

    const payload = {
      user_id:      auth.userId,
      agent_id:     agentIdEl     ? (agentIdEl.value.trim()     || null) : null,
      agent_name:   agentNameEl   ? (agentNameEl.value.trim()   || null) : null,
      is_published: isPublished,
      language:     languageEl    ? (languageEl.value.trim()    || null) : null,
      version:      version,
      llm_id:       llmIdEl       ? (llmIdEl.value.trim()       || null) : null,
      prompt_llm:   promptLlmEl   ? (promptLlmEl.value.trim()   || null) : null,
      prompt:       promptEl      ? (promptEl.value.trim()      || null) : null,
      intro_prompt: introPromptEl ? (introPromptEl.value.trim() || null) : null,
      webhook_url:  webhookUrlEl  ? (webhookUrlEl.value.trim()  || null) : null,
    };

    try {
      async function run(currentAuth) {
        return fetch(baseRestUrl, {
          method: "POST",
          headers: {
            ...supabaseHeaders(currentAuth.accessToken),
            // Upsert based on unique index (user_id, agent_id, version)
            Prefer: "return=minimal, resolution=merge-duplicates",
          },
          body: JSON.stringify(payload),
        });
      }

      let res = await run(auth);

      if (res.status === 401) {
        const newAuth = await handleJwt401(res, "save assistant");
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
        console.error("Assistant save HTTP error:", res.status, txt);
        if (statusEl) statusEl.textContent = "Save failed. Try again.";
      } else {
        if (statusEl) statusEl.textContent = "Saved.";
        setTimeout(() => {
          if (statusEl) statusEl.textContent = "";
        }, 2000);
      }
    } catch (err) {
      console.error("Assistant save error:", err);
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
    account:    "/assets/partials/account-profile.html",
    assistant:  "/assets/partials/account-assistant.html",
    api:        "/assets/partials/account-api.html",
    reports:    "/assets/partials/account-reports.html",
    spendings:  "/assets/partials/account-spendings.html",
    billing:    "/assets/partials/account-billing.html",
    help:       "/assets/partials/account-help.html",
  };

  // Map view -> initializer
  const viewInitializers = {
    account:   initAccountProfileView,
    assistant: initAccountAssistantView,
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
