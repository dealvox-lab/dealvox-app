// /assets/js/account.js
// Handles: navigation, partial loading, authentication refresh, profile + assistant CRUD

document.addEventListener("DOMContentLoaded", () => {
  const contentEl = document.getElementById("accountContent");
  const viewEl = document.getElementById("accountView");
  const links = document.querySelectorAll(".sidebar-nav .nav-link");
  const emailEl = document.getElementById("sidebarEmail");

  // -----------------------------
  //     VIEW → PARTIAL FILE MAP
  // -----------------------------
  const VIEW_FILES = {
    account:   "/assets/partials/account-profile.html",
    assistant: "/assets/partials/account-assistant.html",
    api:       "/assets/partials/account-api.html",
    reports:   "/assets/partials/account-reports.html",
    spendings: "/assets/partials/account-spendings.html",
    billing:   "/assets/partials/account-billing.html",
    help:      "/assets/partials/account-help.html",
  };

  // -----------------------------
  //     AUTH HELPERS
  // -----------------------------

  // Reads token + user info from debug-auth
  async function getAuthInfo() {
    const res = await fetch("/debug-auth", { credentials: "include" });
    const data = await res.json();
    return {
      accessToken: data.accessToken || null,
      user: data.userSummary || null
    };
  }

  // Calls /refresh and logs results
  async function refreshToken() {
    try {
      const res = await fetch("/refresh", {
        method: "POST",
        credentials: "include"
      });

      const body = await res.text();
      console.log("Refresh response:", res.status, body);

      if (!res.ok) return false;
      return true;
    } catch (err) {
      console.error("Refresh error:", err);
      return false;
    }
  }

  // Handles ANY 401 from Supabase REST
  async function handleJwt401(res, label) {
    const body = await res.text();
    console.warn(`401 from Supabase (${label}):`, body);

    const ok = await refreshToken();
    if (!ok) {
      console.warn("Token refresh FAILED");
      return null;
    }

    const auth = await getAuthInfo();
    if (!auth.accessToken) {
      console.warn("Refresh succeeded but no accessToken returned");
      return null;
    }

    console.log("Token refreshed — new access token detected.");
    return auth;
  }

  // -----------------------------
  //     PARTIAL LOADER
  // -----------------------------
  function setActiveLink(view) {
    links.forEach(a =>
      a.classList.toggle("active", a.dataset.view === view)
    );
  }

  async function loadView(view) {
    const file = VIEW_FILES[view];

    if (!file) {
      viewEl.innerHTML = `<div class="empty">Unknown section: <strong>${view}</strong></div>`;
      return;
    }

    try {
      contentEl.setAttribute("aria-busy", "true");
      viewEl.innerHTML = `
        <div class="loading">
          <div class="spinner"></div>
          <div>Loading…</div>
        </div>`;

      const res = await fetch(file, { cache: "no-cache" });
      const html = await res.text();

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      viewEl.innerHTML = html;

      setActiveLink(view);
      history.replaceState(null, "", "#" + view);
      contentEl.focus();

      if (view === "account")   initAccountProfileView();
      if (view === "assistant") initAccountAssistantView();

    } catch (err) {
      console.error("Failed to load view", err);
      viewEl.innerHTML = `<div class="empty">Could not load this section. Please try again.</div>`;
    } finally {
      contentEl.setAttribute("aria-busy", "false");
    }
  }

  function viewFromHash() {
    const hash = location.hash.replace("#", "");
    return VIEW_FILES[hash] ? hash : "account";
  }

  links.forEach(a =>
    a.addEventListener("click", e => {
      e.preventDefault();
      loadView(a.dataset.view);
    })
  );

  window.addEventListener("hashchange", () => loadView(viewFromHash()));

  // -----------------------------
  //   LOAD EMAIL IN SIDEBAR
  // -----------------------------
  if (emailEl) {
    (async () => {
      const auth = await getAuthInfo();
      if (auth.user?.email) emailEl.textContent = auth.user.email;
    })();
  }

  // ---------------------------------------------
  //          PROFILE VIEW LOGIC
  // ---------------------------------------------
  async function initAccountProfileView() {
    const firstInput = document.getElementById("profFirstName");
    const lastInput  = document.getElementById("profLastName");
    const titleInput = document.getElementById("profJobTitle");
    const compInput  = document.getElementById("profCompany");
    const emailInput = document.getElementById("profEmail");
    const saveBtn    = document.getElementById("profSaveBtn");
    const statusEl   = document.getElementById("profStatus");

    // Load auth → user.id
    const auth = await getAuthInfo();
    if (!auth.user) {
      statusEl.textContent = "Session expired. Please log in again.";
      return;
    }

    const userId = auth.user.id;
    emailInput.value = auth.user.email;

    // ---------- LOAD PROFILE ----------
    async function loadProfile() {
      const headers = { apikey: window.SUPABASE_ANON_KEY, Authorization: `Bearer ${auth.accessToken}` };

      const res = await fetch(
        `${window.SUPABASE_URL}/rest/v1/profiles?select=first_name,last_name,job_title,company_name&id=eq.${userId}`,
        { headers }
      );

      if (res.status === 401) {
        const refreshed = await handleJwt401(res, "load profile");
        if (!refreshed) return (statusEl.textContent = "Session expired. Please log in.");
        return loadProfile();
      }

      if (!res.ok) {
        statusEl.textContent = "Could not load profile.";
        return;
      }

      const rows = await res.json();
      const profile = rows[0];
      if (profile) {
        firstInput.value = profile.first_name || "";
        lastInput.value  = profile.last_name || "";
        titleInput.value = profile.job_title || "";
        compInput.value  = profile.company_name || "";
      }
    }

    // ---------- SAVE PROFILE ----------
    async function saveProfile() {
      statusEl.textContent = "Saving…";

      const body = {
        id: userId,
        first_name: firstInput.value.trim(),
        last_name: lastInput.value.trim(),
        job_title: titleInput.value.trim(),
        company_name: compInput.value.trim()
      };

      const headers = {
        apikey: window.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json"
      };

      const res = await fetch(
        `${window.SUPABASE_URL}/rest/v1/profiles`,
        { method: "POST", headers, body: JSON.stringify(body) }
      );

      if (res.status === 401) {
        const refreshed = await handleJwt401(res, "save profile");
        if (!refreshed) return (statusEl.textContent = "Session expired. Please log in.");
        return saveProfile();
      }

      if (!res.ok) {
        statusEl.textContent = "Save failed.";
        console.error("Profile save error:", await res.text());
        return;
      }

      statusEl.textContent = "Saved!";
      setTimeout(() => (statusEl.textContent = ""), 1500);
    }

    saveBtn.addEventListener("click", e => {
      e.preventDefault();
      saveProfile();
    });

    loadProfile();
  }

  // ---------------------------------------------
  //          ASSISTANT VIEW LOGIC
  // ---------------------------------------------
  async function initAccountAssistantView() {
    const form      = document.getElementById("assistantForm");
    const saveBtn   = document.getElementById("asstSaveBtn");
    const statusEl  = document.getElementById("asstStatus");

    const agentId     = document.getElementById("asstAgentId");
    const agentName   = document.getElementById("asstAgentName");
    const published   = document.getElementById("asstPublished");
    const language    = document.getElementById("asstLanguage");
    const version     = document.getElementById("asstVersion");
    const llmId       = document.getElementById("asstLlmId");
    const promptLlm   = document.getElementById("asstPromptLlm");
    const prompt      = document.getElementById("asstPrompt");
    const introPrompt = document.getElementById("asstIntroPrompt");
    const webhookUrl  = document.getElementById("asstWebhookUrl");

    const auth = await getAuthInfo();
    if (!auth.user) {
      statusEl.textContent = "Session expired. Please log in.";
      return;
    }

    const userId = auth.user.id;

    // ---------- LOAD ASSISTANT ----------
    async function loadAssistant() {
      const headers = { apikey: window.SUPABASE_ANON_KEY, Authorization: `Bearer ${auth.accessToken}` };

      const res = await fetch(
        `${window.SUPABASE_URL}/rest/v1/assistants?select=* &id=eq.${userId}`,
        { headers }
      );

      if (res.status === 401) {
        const refreshed = await handleJwt401(res, "load assistant");
        if (!refreshed) return (statusEl.textContent = "Session expired. Please log in.");
        return loadAssistant();
      }

      if (!res.ok) {
        console.warn("Error loading assistant:", await res.text());
        statusEl.textContent = "Could not load assistant.";
        return;
      }

      const rows = await res.json();
      const asst = rows[0];
      if (asst) {
        agentId.value     = asst.agent_id || "";
        agentName.value   = asst.agent_name || "";
        published.value   = asst.is_published ? "true" : "false";
        language.value    = asst.language || "en-US";
        version.value     = asst.version || 1;
        llmId.value       = asst.llm_id || "";
        promptLlm.value   = asst.prompt_llm || "";
        prompt.value      = asst.prompt || "";
        introPrompt.value = asst.intro_prompt || "";
        webhookUrl.value  = asst.webhook_url || "";
      }
    }

    // ---------- SAVE ASSISTANT ----------
    async function saveAssistant() {
      statusEl.textContent = "Saving…";

      const body = {
        id: userId,
        agent_id:     agentId.value.trim(),
        agent_name:   agentName.value.trim(),
        is_published: published.value === "true",
        language:     language.value.trim(),
        version:      Number(version.value),
        llm_id:       llmId.value.trim(),
        prompt_llm:   promptLlm.value.trim(),
        prompt:       prompt.value.trim(),
        intro_prompt: introPrompt.value.trim(),
        webhook_url:  webhookUrl.value.trim()
      };

      const headers = {
        apikey: window.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${auth.accessToken}`,
        "Content-Type": "application/json"
      };

      const res = await fetch(
        `${window.SUPABASE_URL}/rest/v1/assistants`,
        { method: "POST", headers, body: JSON.stringify(body) }
      );

      if (res.status === 401) {
        const refreshed = await handleJwt401(res, "save assistant");
        if (!refreshed) return (statusEl.textContent = "Session expired. Please log in.");
        return saveAssistant();
      }

      if (!res.ok) {
        statusEl.textContent = "Save failed.";
        console.error("Assistant save error:", await res.text());
        return;
      }

      statusEl.textContent = "Saved!";
      setTimeout(() => (statusEl.textContent = ""), 1500);
    }

    saveBtn.addEventListener("click", e => {
      e.preventDefault();
      saveAssistant();
    });

    loadAssistant();
  }

  // -----------------------------
  //     INITIAL LOAD VIEW
  // -----------------------------
  loadView(viewFromHash());
});
