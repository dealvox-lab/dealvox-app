// /assets/js/account.js

// ----------------------------------------------------
// AUTH + SUPABASE HELPERS
// ----------------------------------------------------

async function getAuthInfo() {
  const res = await fetch("/debug-auth", { credentials: "include" });
  if (!res.ok) throw new Error(`debug-auth HTTP ${res.status}`);
  const data = await res.json();
  return {
    accessToken: data.accessToken || null,
    user: data.userSummary || null,
  };
}

async function refreshToken() {
  try {
    const res = await fetch("/refresh", {
      method: "POST",
      credentials: "include",
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

async function handleJwt401(res, label) {
  const body = await res.text();
  console.warn(`401 from Supabase (${label}):`, body);

  const ok = await refreshToken();
  if (!ok) {
    console.warn("Token refresh FAILED");
    return null;
  }

  try {
    const auth = await getAuthInfo();
    if (!auth.accessToken) {
      console.warn("Refresh succeeded but no accessToken returned");
      return null;
    }
    console.log("Token refreshed, new access token via debug-auth.");
    return auth;
  } catch (e) {
    console.error("Failed to reload auth after refresh:", e);
    return null;
  }
}

function supabaseHeaders(accessToken) {
  const url = window.SUPABASE_URL;
  const anon = window.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("SUPABASE_URL or SUPABASE_ANON_KEY missing on window");
  }
  if (!accessToken) {
    throw new Error("accessToken required for Supabase REST");
  }
  return {
    apikey: anon,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

// ----------------------------------------------------
// PROFILE VIEW (Account tab)
// ----------------------------------------------------

async function initAccountProfileView() {
  const form         = document.getElementById("profileForm");
  const statusEl     = document.getElementById("profileStatus");
  const saveBtn      = document.getElementById("profileSaveBtn");
  const emailEl      = document.getElementById("profileEmail");
  const firstNameEl  = document.getElementById("profileFirstName");
  const lastNameEl   = document.getElementById("profileLastName");
  const jobTitleEl   = document.getElementById("profileJobTitle");
  const companyEl    = document.getElementById("profileCompanyName");

  if (!form) {
    console.warn("profileForm not found; skipping profile init");
    return;
  }
  if (form.dataset.bound === "1") return;
  form.dataset.bound = "1";

  let auth;
  try {
    auth = await getAuthInfo();
  } catch (e) {
    console.error("getAuthInfo failed:", e);
    if (statusEl) statusEl.textContent = "Unable to load profile.";
    return;
  }

  if (!auth.user || !auth.accessToken) {
    if (statusEl) statusEl.textContent = "Session expired. Please log in.";
    return;
  }

  const userId = auth.user.id;
  if (emailEl && auth.user.email) {
    emailEl.value = auth.user.email;
  }

  const baseUrl = `${window.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/profiles`;

  // ---- LOAD PROFILE ----
  async function loadProfile() {
    if (statusEl) statusEl.textContent = "Loading…";

    const params = new URLSearchParams();
    params.set("select", "first_name,last_name,job_title,company_name,email");
    params.set("id", `eq.${userId}`);

    async function run(currentAuth) {
      return fetch(`${baseUrl}?${params.toString()}`, {
        headers: supabaseHeaders(currentAuth.accessToken),
      });
    }

    let res = await run(auth);
    if (res.status === 401) {
      const newAuth = await handleJwt401(res, "load profile");
      if (!newAuth) {
        if (statusEl) statusEl.textContent = "Session expired. Please log in.";
        return;
      }
      auth = newAuth;
      res = await run(auth);
    }

    if (!res.ok) {
      console.error("Profile load HTTP error:", res.status, await res.text());
      if (statusEl) statusEl.textContent = "Could not load profile.";
      return;
    }

    const rows = await res.json();
    const data = rows[0];
    if (data) {
      if (firstNameEl) firstNameEl.value = data.first_name || "";
      if (lastNameEl)  lastNameEl.value  = data.last_name || "";
      if (jobTitleEl)  jobTitleEl.value  = data.job_title || "";
      if (companyEl)   companyEl.value   = data.company_name || "";
      if (emailEl && !emailEl.value && data.email) {
        emailEl.value = data.email;
      }
    }

    if (statusEl) statusEl.textContent = "";
  }

  // ---- SAVE PROFILE ----
  async function saveProfile() {
    if (!saveBtn) return;
    saveBtn.disabled = true;
    if (statusEl) statusEl.textContent = "Saving…";

    const payload = {
      id: auth.user.id,
      email: auth.user.email,
      first_name:  firstNameEl ? firstNameEl.value.trim()  || null : null,
      last_name:   lastNameEl  ? lastNameEl.value.trim()   || null : null,
      job_title:   jobTitleEl  ? jobTitleEl.value.trim()   || null : null,
      company_name: companyEl  ? companyEl.value.trim()    || null : null,
    };

    async function run(currentAuth) {
      return fetch(baseUrl, {
        method: "POST",
        headers: {
          ...supabaseHeaders(currentAuth.accessToken),
          Prefer: "return=minimal, resolution=merge-duplicates",
        },
        body: JSON.stringify(payload),
      });
    }

    try {
      let res = await run(auth);
      if (res.status === 401) {
        const newAuth = await handleJwt401(res, "save profile");
        if (!newAuth) {
          if (statusEl) statusEl.textContent = "Session expired. Please log in.";
          saveBtn.disabled = false;
          return;
        }
        auth = newAuth;
        res = await run(auth);
      }

      if (!res.ok) {
        console.error("Profile save HTTP error:", res.status, await res.text());
        if (statusEl) statusEl.textContent = "Save failed. Try again.";
      } else {
        if (statusEl) statusEl.textContent = "Saved.";
        setTimeout(() => statusEl && (statusEl.textContent = ""), 1500);
      }
    } catch (e) {
      console.error("Profile save error:", e);
      if (statusEl) statusEl.textContent = "Save failed. Try again.";
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    saveProfile();
  });

  loadProfile();
}

// ----------------------------------------------------
// ASSISTANT VIEW (Assistant tab) - TWO-STEP FLOW
// ----------------------------------------------------

async function initAccountAssistantView() {
  const deploySection = document.getElementById("assistantInitial");
  const manageSection = document.getElementById("assistantManage");

  const deployForm   = document.getElementById("assistantDeployForm");
  const deployStatus = document.getElementById("asstDeployStatus");

  const form      = document.getElementById("assistantForm");
  const saveStatusEl  = document.getElementById("asstStatus");
  const saveBtn   = document.getElementById("asstSaveBtn");

  if (!deploySection || !manageSection) {
    console.warn("Assistant sections not found; skipping assistant init");
    return;
  }

  // Prevent double-binding on reloads
  if (form && form.dataset.bound === "1") return;
  if (form) form.dataset.bound = "1";

  let auth;
  try {
    auth = await getAuthInfo();
  } catch (e) {
    console.error("getAuthInfo failed:", e);
    if (saveStatusEl) saveStatusEl.textContent = "Unable to load assistant.";
    return;
  }

  if (!auth.user || !auth.accessToken) {
    if (saveStatusEl) saveStatusEl.textContent = "Session expired. Please log in.";
    return;
  }

  const userId = auth.user.id;
  const baseUrl = `${window.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/assistants`;

  // ---- helper setters ----
  function setIfExists(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? "";
  }

  // ---- LOAD ASSISTANT (detect existing vs new) ----
  async function loadAssistant() {
    if (saveStatusEl) saveStatusEl.textContent = "Loading…";

    const params = new URLSearchParams();
    params.set("select", "*");
    params.set("user_id", `eq.${userId}`);
    params.set("limit", "1");

    async function run(currentAuth) {
      return fetch(`${baseUrl}?${params.toString()}`, {
        headers: supabaseHeaders(currentAuth.accessToken),
      });
    }

    let res = await run(auth);
    if (res.status === 401) {
      const newAuth = await handleJwt401(res, "load assistant");
      if (!newAuth) {
        if (saveStatusEl) saveStatusEl.textContent = "Session expired. Please log in.";
        return;
      }
      auth = newAuth;
      res = await run(auth);
    }

    if (!res.ok) {
      console.error("Assistant load HTTP error:", res.status, await res.text());
      if (saveStatusEl) saveStatusEl.textContent = "Could not load assistant.";
      return;
    }

    const rows = await res.json();
    const data = rows[0];

    if (data) {
      // We have an assistant: show manage section
      deploySection.hidden = true;
      manageSection.hidden = false;

      setIfExists("asstAgentId", data.agent_id);
      setIfExists("asstAgentName", data.agent_name);
      setIfExists("asstAgentType", data.agent_type);
      setIfExists("asstPhoneArea", data.phone_area);
      setIfExists("asstPhoneNumber", data.phone_number);
      setIfExists("asstAgentVoice", data.agent_voice);
      setIfExists("asstPublished", data.is_published ? "true" : "false");
      setIfExists("asstPrompt", data.prompt);
      setIfExists("asstIntroPrompt", data.intro_prompt);
      setIfExists("asstWebhookUrl", data.webhook_url);
      // knowledge_key can be used later to show last uploaded file name
    } else {
      // No assistant yet → initial deploy flow
      deploySection.hidden = false;
      manageSection.hidden = true;
    }

    if (saveStatusEl) saveStatusEl.textContent = "";
  }

  // ---- DEPLOY ASSISTANT (STEP 1) ----
async function deployAssistant() {
  if (!deployForm) return;
  if (deployStatus) deployStatus.textContent = "Deploying…";

  const newNameEl      = document.getElementById("asstNewName");
  const newTypeEl      = document.getElementById("asstNewType");
  const newPhoneAreaEl = document.getElementById("asstNewPhoneArea");
  const newVoiceEl     = document.getElementById("asstNewVoice");
  const newIntroEl     = document.getElementById("asstNewIntro");

  const agentName  = newNameEl ? newNameEl.value.trim() : "";
  const agentType  = newTypeEl ? newTypeEl.value : "sales";
  const phoneArea  = newPhoneAreaEl ? newPhoneAreaEl.value : "custom";
  const agentVoice = newVoiceEl ? newVoiceEl.value : "female_friendly";
  const intro      = newIntroEl ? newIntroEl.value.trim() : "";

  // Generate a simple agent ID
  let agentId;
  if (crypto && typeof crypto.randomUUID === "function") {
    agentId = crypto.randomUUID().replace(/-/g, "").slice(0, 28);
  } else {
    agentId = "agent_" + Math.random().toString(36).slice(2, 18);
  }

  const payload = {
    user_id:      userId,
    agent_id:     agentId,
    agent_name:   agentName || null,
    agent_type:   agentType || null,
    phone_area:   phoneArea || null,
    agent_voice:  agentVoice || null,
    intro_prompt: intro || null,
    is_published: false,
    language:     "en-US",
    version:      1,
  };

  async function run(currentAuth) {
    return fetch(baseUrl, {
      method: "POST",
      headers: {
        ...supabaseHeaders(currentAuth.accessToken),
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    });
  }

  try {
    let res = await run(auth);
    if (res.status === 401) {
      const newAuth = await handleJwt401(res, "deploy assistant");
      if (!newAuth) {
        if (deployStatus) deployStatus.textContent = "Session expired. Please log in.";
        return;
      }
      auth = newAuth;
      res  = await run(auth);
    }

    if (!res.ok) {
      console.error("Assistant deploy HTTP error:", res.status, await res.text());
      if (deployStatus) deployStatus.textContent = "Failed to deploy. Try again.";
      return;
    }

    // ✅ SUCCESS: update UI text with agent ID
    if (deployStatus) {
      deployStatus.textContent = `The agent ID ${agentId} is deployed successfully.`;
    }

  // ✅ OPTIONAL WEBHOOK → n8n (fire-and-forget)
try {
  fetch("https://dealvox-840984531750.us-east4.run.app/webhook/05020ee1-4a28-4ca7-9603-783e6430934e", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      agentName,
      agentType,
      agentVoice,
      intro,   // 👈 NEW FIELD
    }),
  });
} catch (hookErr) {
  console.warn("Deploy webhook failed (non-blocking):", hookErr);
}


    // Reload assistant data into manage view
    await loadAssistant();
  } catch (e) {
    console.error("Assistant deploy error:", e);
    if (deployStatus) deployStatus.textContent = "Failed to deploy. Try again.";
  }
}

  // ---- SAVE ASSISTANT (STEP 2) ----
  async function saveAssistant() {
    if (!form || !saveBtn) return;
    saveBtn.disabled = true;
    if (saveStatusEl) saveStatusEl.textContent = "Saving…";

    const agentIdEl       = document.getElementById("asstAgentId");
    const agentNameEl     = document.getElementById("asstAgentName");
    const agentTypeEl     = document.getElementById("asstAgentType");
    const phoneAreaEl     = document.getElementById("asstPhoneArea");
    const phoneNumberEl   = document.getElementById("asstPhoneNumber");
    const agentVoiceEl    = document.getElementById("asstAgentVoice");
    const publishedEl     = document.getElementById("asstPublished");
    const promptEl        = document.getElementById("asstPrompt");
    const introPromptEl   = document.getElementById("asstIntroPrompt");
    const webhookUrlEl    = document.getElementById("asstWebhookUrl");
    const kbFileEl        = document.getElementById("asstKnowledgeFile");

    const agentId = agentIdEl ? agentIdEl.value.trim() : null;

    const kbFile = kbFileEl && kbFileEl.files && kbFileEl.files[0]
      ? kbFileEl.files[0]
      : null;

    // For now we just store the filename/key – upload flow can be added later
    const knowledgeKey = kbFile ? kbFile.name : null;

    const rawPublished = publishedEl ? publishedEl.value : "false";
    const isPublished  = rawPublished === "true";

    const payload = {
      user_id:       userId,
      agent_id:      agentId || null,
      agent_name:    agentNameEl   ? agentNameEl.value.trim()     || null : null,
      agent_type:    agentTypeEl   ? agentTypeEl.value            || null : null,
      phone_area:    phoneAreaEl   ? phoneAreaEl.value            || null : null,
      phone_number:  phoneNumberEl ? phoneNumberEl.value.trim()   || null : null,
      agent_voice:   agentVoiceEl  ? agentVoiceEl.value           || null : null,
      is_published:  isPublished,
      prompt:        promptEl      ? promptEl.value.trim()        || null : null,
      intro_prompt:  introPromptEl ? introPromptEl.value.trim()   || null : null,
      webhook_url:   webhookUrlEl  ? webhookUrlEl.value.trim()    || null : null,
      knowledge_key: knowledgeKey,
    };

    async function run(currentAuth) {
      return fetch(baseUrl, {
        method: "POST",
        headers: {
          ...supabaseHeaders(currentAuth.accessToken),
          Prefer: "return=minimal, resolution=merge-duplicates",
        },
        body: JSON.stringify(payload),
      });
    }

    try {
      let res = await run(auth);
      if (res.status === 401) {
        const newAuth = await handleJwt401(res, "save assistant");
        if (!newAuth) {
          if (saveStatusEl) saveStatusEl.textContent = "Session expired. Please log in.";
          saveBtn.disabled = false;
          return;
        }
        auth = newAuth;
        res = await run(auth);
      }

      if (!res.ok) {
        console.error("Assistant save HTTP error:", res.status, await res.text());
        if (saveStatusEl) saveStatusEl.textContent = "Save failed. Try again.";
      } else {
        if (saveStatusEl) saveStatusEl.textContent = "Saved.";
        setTimeout(() => saveStatusEl && (saveStatusEl.textContent = ""), 1500);
      }
    } catch (e) {
      console.error("Assistant save error:", e);
      if (saveStatusEl) saveStatusEl.textContent = "Save failed. Try again.";
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  // Bind listeners
  if (deployForm && !deployForm.dataset.bound) {
    deployForm.dataset.bound = "1";
    deployForm.addEventListener("submit", (e) => {
      e.preventDefault();
      deployAssistant();
    });
  }

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      saveAssistant();
    });
  }

  // Initial load
  loadAssistant();
}

// ----------------------------------------------------
// API KEY SECTION (API tab)
// ----------------------------------------------------

let currentApiKeyPlain = null; // full key only held in memory

async function initApiKeySection() {
  const card       = document.getElementById("apiKeyCard");
  const copyHintEl = document.getElementById("apiKeyCopyHint");
  if (!card) return; // partial not on this page

  // We need both user and accessToken
  let auth;
  try {
    auth = await getAuthInfo();
  } catch (e) {
    console.error("getAuthInfo failed (api key):", e);
    card.classList.add("hidden");
    return;
  }

  if (!auth.user || !auth.accessToken) {
    card.classList.add("hidden");
    return;
  }

  const user = auth.user;

  // --- DOM refs for key block ---
  const emptyEl       = document.getElementById("apiKeyEmpty");
  const detailsEl     = document.getElementById("apiKeyDetails");
  const maskedEl      = document.getElementById("apiKeyMasked");
  const lastUpdatedEl = document.getElementById("apiKeyLastUpdated");
  const statusEl      = document.getElementById("apiKeyStatus");

  const generateBtn   = document.getElementById("apiKeyGenerateBtn");
  const copyBtn       = document.getElementById("apiKeyCopyBtn");
  const regenBtn      = document.getElementById("apiKeyRegenerateBtn");

  // --- Webhook / docs elements ---
  const endpointEl        = document.getElementById("apiWebhookEndpoint");
  const endpointCopyBtn   = document.getElementById("apiWebhookEndpointCopy");
  const endpointStatusEl  = document.getElementById("apiWebhookEndpointStatus");

  const headersExampleEl  = document.getElementById("apiHeadersExample");
  const headersCopyBtn    = document.getElementById("apiHeadersCopy");
  const headersStatusEl   = document.getElementById("apiHeadersCopyStatus");
  const apiKeyHintEl      = document.getElementById("apiApiKeyHint");

  const bodyEl            = document.getElementById("apiWebhookBody");
  const bodyCopyBtn       = document.getElementById("apiWebhookBodyCopy");
  const bodyStatusEl      = document.getElementById("apiWebhookBodyCopyStatus");

  const fromNumberHintEl  = document.getElementById("apiFromNumberHint");

  const baseUrl = `${window.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/api_clients`;
  const rpcUrl  = `${window.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/rpc/create_user_api_key`;

  let assistantPhone = null; // from assistants.phone_number

  // ---------------- helpers ----------------

  function setStatus(msg, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("error", !!isError);
  }

  function maskFromParts(prefix, suffix) {
    if (!prefix || !suffix) return "••••••";
    return `${prefix}•••${suffix}`;
  }

  function flashCopyStatus(el) {
    if (!el) return;
    el.classList.add("visible");
    setTimeout(() => el.classList.remove("visible"), 1800);
  }

  function refreshHeaderExample() {
    if (!headersExampleEl) return;

    const value = currentApiKeyPlain || "INSERT_YOUR_API_KEY_HERE";

    headersExampleEl.textContent = JSON.stringify(
      {
        "Content-Type": "application/json",
        "X-Api-Key": value,
      },
      null,
      2
    );

    if (apiKeyHintEl) {
      apiKeyHintEl.style.display = currentApiKeyPlain ? "none" : "inline";
    }
  }

  function showEmpty() {
    if (emptyEl) {
      emptyEl.classList.remove("hidden");
      emptyEl.style.display = "block";
    }
    if (detailsEl) {
      detailsEl.classList.add("hidden");
      detailsEl.style.display = "none";
    }

    currentApiKeyPlain = null;

    if (maskedEl)      maskedEl.textContent = "••••••";
    if (lastUpdatedEl) lastUpdatedEl.textContent = "";

    if (copyBtn) {
      copyBtn.disabled = true;
      copyBtn.style.display = "none";
    }
    if (copyHintEl) {
      copyHintEl.style.display = "none";
    }

    refreshHeaderExample();
  }

  function showDetails(row, plainKeyMaybe) {
    if (emptyEl) {
      emptyEl.classList.add("hidden");
      emptyEl.style.display = "none";
    }
    if (detailsEl) {
      detailsEl.classList.remove("hidden");
      detailsEl.style.display = "block";
    }

    const prefix = row.key_prefix;
    const suffix = row.key_suffix;

    if (maskedEl) {
      maskedEl.textContent =
        prefix && suffix ? `${prefix}•••${suffix}` : "••••••";
    }

    currentApiKeyPlain = plainKeyMaybe || null;

    if (copyBtn) {
      if (currentApiKeyPlain) {
        copyBtn.style.display = "inline-flex";
        copyBtn.disabled = false;
        if (copyHintEl) copyHintEl.style.display = "block";
      } else {
        copyBtn.style.display = "none";
        copyBtn.disabled = true;
        if (copyHintEl) copyHintEl.style.display = "none";
      }
    }

    if (row.created_at && lastUpdatedEl) {
      const d = new Date(row.created_at);
      lastUpdatedEl.textContent = "Last generated: " + d.toLocaleString();
    }

    refreshHeaderExample();
  }

  function renderWebhookBody() {
    if (!bodyEl) return;

    const from = assistantPhone || "YOUR_ASSISTANT_NUMBER";

    const examplePayload = {
      from_number: from,
      to_number: "+12137774445",
      retell_llm_dynamic_variables: {
        firstName: "John",
        lastName: "Doe",
        company: "Acme Inc.",
        industry: "Finance",
      },
    };

    bodyEl.textContent = JSON.stringify(examplePayload, null, 2);
  }

  // ---------------- Supabase helpers ----------------

  // Load assistant phone_number (for from_number)
  async function loadAssistantPhone() {
    if (!auth.accessToken || !user) return;

    const assistantsUrl = `${window.SUPABASE_URL.replace(
      /\/+$/,
      ""
    )}/rest/v1/assistants`;
    const params = new URLSearchParams();
    params.set("select", "phone_number");
    params.set("user_id", `eq.${user.id}`);
    params.set("limit", "1");

    try {
      const res = await fetch(`${assistantsUrl}?${params.toString()}`, {
        headers: supabaseHeaders(auth.accessToken),
      });

      if (!res.ok) {
        console.warn(
          "assistants phone load error:",
          res.status,
          await res.text()
        );
        assistantPhone = null;
      } else {
        const rows = await res.json();
        const data = rows && rows[0];
        assistantPhone = data && data.phone_number ? data.phone_number : null;
      }
    } catch (err) {
      console.error("assistants phone load error:", err);
      assistantPhone = null;
    }

    if (fromNumberHintEl) {
      fromNumberHintEl.style.display = assistantPhone ? "none" : "block";
    }
    renderWebhookBody();
  }

  // Load existing API key
  async function loadExistingKey() {
    setStatus("Loading API key...");

    const params = new URLSearchParams();
    params.set("select", "id,user_id,key_prefix,key_suffix,created_at,active");
    params.set("user_id", `eq.${user.id}`);
    params.set("active", "eq.true");
    params.set("order", "created_at.desc");
    params.set("limit", "1");

    try {
      const res = await fetch(`${baseUrl}?${params.toString()}`, {
        headers: supabaseHeaders(auth.accessToken),
      });

      if (res.status === 401) {
        setStatus("Session expired. Please log in.", true);
        showEmpty();
        return;
      }

      if (!res.ok) {
        console.error(
          "loadExistingKey HTTP error",
          res.status,
          await res.text()
        );
        setStatus("Could not load API key.", true);
        showEmpty();
        return;
      }

      const rows = await res.json();
      const data = rows && rows[0];

      if (!data) {
        setStatus("");
        showEmpty();
        return;
      }

      // no plaintext on reload
      showDetails(data, null);
      setStatus("");
    } catch (err) {
      console.error("loadExistingKey error", err);
      setStatus("Could not load API key.", true);
      showEmpty();
    }
  }

  // Generate / refresh API key via RPC
  async function generateOrRefreshKey() {
    setStatus("Generating new API key...");
    if (generateBtn) generateBtn.disabled = true;
    if (regenBtn) regenBtn.disabled = true;

    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: supabaseHeaders(auth.accessToken),
        body: JSON.stringify({}), // no args
      });

      if (res.status === 401) {
        setStatus("Session expired. Please log in.", true);
        return;
      }

      if (!res.ok) {
        console.error(
          "create_user_api_key HTTP error",
          res.status,
          await res.text()
        );
        setStatus("Could not generate API key.", true);
        return;
      }

      const data = await res.json();
      const row = {
        id:         data.id,
        user_id:    user.id,
        key_prefix: data.key_prefix,
        key_suffix: data.key_suffix,
        created_at: data.created_at,
        active:     true,
      };

      currentApiKeyPlain = data.api_key || null;
      showDetails(row, currentApiKeyPlain);
      setStatus("New API key generated. Save it in a secure place.");
    } catch (err) {
      console.error("generateOrRefreshKey error", err);
      setStatus("Could not generate API key.", true);
    } finally {
      if (generateBtn) generateBtn.disabled = false;
      if (regenBtn)    regenBtn.disabled = false;
    }
  }

  // Copy full key
  async function copyKey() {
    if (!currentApiKeyPlain) {
      setStatus(
        "For security, the full key is only shown right after generation. " +
          "Click “Refresh key” to create a new one if you’ve lost it.",
        true
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(currentApiKeyPlain);
      setStatus("API key copied to clipboard.");
    } catch (err) {
      console.error("copyKey error", err);
      setStatus("Could not copy to clipboard.", true);
    }
  }

  // ---------------- Wire up buttons ----------------

  generateBtn?.addEventListener("click", () => {
    generateOrRefreshKey();
  });

  regenBtn?.addEventListener("click", () => {
    const ok = window.confirm(
      "Refresh key? Your existing key will stop working."
    );
    if (!ok) return;
    generateOrRefreshKey();
  });

  copyBtn?.addEventListener("click", () => {
    copyKey();
  });

  // Webhook copy: endpoint
  endpointCopyBtn?.addEventListener("click", async () => {
    if (!endpointEl) return;
    try {
      await navigator.clipboard.writeText(endpointEl.textContent.trim());
      flashCopyStatus(endpointStatusEl);
    } catch (err) {
      console.error("Endpoint copy failed", err);
    }
  });

  // Webhook copy: headers JSON
  headersCopyBtn?.addEventListener("click", async () => {
    if (!headersExampleEl) return;
    try {
      await navigator.clipboard.writeText(headersExampleEl.textContent.trim());
      flashCopyStatus(headersStatusEl);
    } catch (err) {
      console.error("Headers copy failed", err);
    }
  });

  // Webhook copy: body JSON
  bodyCopyBtn?.addEventListener("click", async () => {
    if (!bodyEl) return;
    try {
      await navigator.clipboard.writeText(bodyEl.textContent.trim());
      flashCopyStatus(bodyStatusEl);
    } catch (err) {
      console.error("Payload copy failed", err);
    }
  });

  // ---------------- Init ----------------

  refreshHeaderExample();     // initial headers block (placeholder key)
  await loadExistingKey();    // try to load real API key
  await loadAssistantPhone(); // will call renderWebhookBody()
  if (!assistantPhone) renderWebhookBody(); // fallback payload if phone missing
}

// ----------------------------------------------------
// SPA NAV + PARTIAL LOADING
// ----------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  const contentEl = document.getElementById("accountContent");
  const viewEl    = document.getElementById("accountView");
  const links     = document.querySelectorAll(".sidebar-nav .nav-link");
  const emailEl   = document.getElementById("sidebarEmail");

  const VIEW_FILES = {
    account:   "/assets/partials/account-profile.html",
    assistant: "/assets/partials/account-assistant.html",
    voices:    "/assets/partials/account-voices.html",
    api:       "/assets/partials/account-api.html",
    reports:   "/assets/partials/account-reports.html",
    spendings: "/assets/partials/account-spendings.html",
    billing:   "/assets/partials/account-billing.html",
    help:      "/assets/partials/account-help.html",
  };

  const viewInitializers = {
    account:   initAccountProfileView,
    assistant: initAccountAssistantView,
    api:       initApiKeySection,
    voices:    () => window.initVoicesView && window.initVoicesView(),
  };

  function setActiveLink(view) {
    links.forEach(a => a.classList.toggle("active", a.dataset.view === view));
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

      const res  = await fetch(file, { cache: "no-cache" });
      const text = await res.text();
      console.log("Loaded view:", view, "from", res.url, "status", res.status);
      console.log("First 120 chars:", text.slice(0, 120));

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      viewEl.innerHTML = text;
      setActiveLink(view);

      if (viewInitializers[view]) viewInitializers[view]();

      if (location.hash !== "#" + view) {
        history.replaceState(null, "", "#" + view);
      }
      contentEl.focus();
    } catch (err) {
      console.error("Failed to load view", view, err);
      viewEl.innerHTML = `<div class="empty">Could not load this section. Please try again.</div>`;
    } finally {
      contentEl.setAttribute("aria-busy", "false");
    }
  }

  function viewFromHash() {
    const hash = (location.hash || "").replace("#", "");
    return hash && VIEW_FILES[hash] ? hash : "account";
  }

  links.forEach(a =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      loadView(a.dataset.view);
    })
  );

  window.addEventListener("hashchange", () => loadView(viewFromHash()));

  // Sidebar email under logo
  if (emailEl) {
    (async () => {
      try {
        const auth = await getAuthInfo();
        if (auth.user && auth.user.email) {
          emailEl.textContent = auth.user.email;
        } else {
          emailEl.textContent = "";
        }
      } catch (e) {
        console.error("Email load failed:", e);
        emailEl.textContent = "";
      }
    })();
  }

  // Initial view
  loadView(viewFromHash());
});
