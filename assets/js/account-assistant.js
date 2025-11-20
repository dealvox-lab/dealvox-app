document.addEventListener("DOMContentLoaded", () => {
  const deployForm   = document.getElementById("assistantDeployForm");
  const mainForm     = document.getElementById("assistantForm");
  const statusEl     = document.getElementById("asstStatus");

  const asstDeployName      = document.getElementById("asstDeployName");
  const asstDeployType      = document.getElementById("asstDeployType");
  const asstDeployPhoneArea = document.getElementById("asstDeployPhoneArea");
  const asstDeployVoice     = document.getElementById("asstDeployVoice");
  const asstDeployIntro     = document.getElementById("asstDeployIntro");

  const asstAgentId      = document.getElementById("asstAgentId");
  const asstAgentName    = document.getElementById("asstAgentName");
  const asstType         = document.getElementById("asstType");
  const asstPhoneNumber  = document.getElementById("asstPhoneNumber");
  const asstVoice        = document.getElementById("asstVoice");
  const asstPublished    = document.getElementById("asstPublished");
  const asstPrompt       = document.getElementById("asstPrompt");
  const asstIntroPrompt  = document.getElementById("asstIntroPrompt");
  const asstKbFile       = document.getElementById("asstKbFile");
  const asstWebhookUrl   = document.getElementById("asstWebhookUrl");

  function showDeploy() {
    deployForm.style.display = "block";
    mainForm.style.display = "none";
  }

  function showMain() {
    deployForm.style.display = "none";
    mainForm.style.display = "block";
  }

  async function loadAssistant() {
    try {
      const res = await fetch("/api/assistant", { credentials: "include" });
      if (!res.ok) throw new Error("No assistant yet");
      const data = await res.json();
      if (!data || !data.agent_id) throw new Error("No assistant yet");

      // Prefill fields (adjust keys to match your Supabase schema)
      asstAgentId.value     = data.agent_id;
      asstAgentName.value   = data.name || "";
      asstType.value        = data.type || "";
      asstPhoneNumber.value = data.phone_number || "";
      asstVoice.value       = data.voice || "";
      asstPublished.value   = String(data.is_published ?? false);
      asstPrompt.value      = data.prompt || "";
      asstIntroPrompt.value = data.intro || "";
      asstWebhookUrl.value  = data.webhook_url || "";

      showMain();
    } catch (err) {
      showDeploy();
    }
  }

  // STEP 1 submit: deploy new agent
  deployForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusEl.textContent = "Deploying agent…";

    const payload = {
      name: asstDeployName.value.trim(),
      type: asstDeployType.value,
      phone_area: asstDeployPhoneArea.value,
      voice: asstDeployVoice.value,
      intro: asstDeployIntro.value.trim()
    };

    try {
      const res = await fetch("/api/assistant/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Failed to deploy agent");
      const data = await res.json();

      statusEl.textContent = "Agent deployed. Loading details…";

      // Optionally pre-fill from deploy response
      asstAgentId.value     = data.agent_id || "";
      asstAgentName.value   = data.name || payload.name;
      asstType.value        = data.type || payload.type;
      asstPhoneNumber.value = data.phone_number || "";
      asstVoice.value       = data.voice || payload.voice;
      asstPublished.value   = String(data.is_published ?? false);
      asstIntroPrompt.value = data.intro || payload.intro;

      showMain();
    } catch (err) {
      console.error(err);
      statusEl.textContent = "Error deploying agent.";
    }
  });

  // STEP 2 submit: save assistant config (including KB + webhook)
  mainForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusEl.textContent = "Saving…";

    const formData = new FormData();
    formData.append("agent_id", asstAgentId.value.trim());
    formData.append("name", asstAgentName.value.trim());
    formData.append("type", asstType.value);
    formData.append("phone_number", asstPhoneNumber.value.trim());
    formData.append("voice", asstVoice.value);
    formData.append("is_published", asstPublished.value);
    formData.append("prompt", asstPrompt.value.trim());
    formData.append("intro", asstIntroPrompt.value.trim());
    formData.append("webhook_url", asstWebhookUrl.value.trim());

    if (asstKbFile.files[0]) {
      formData.append("knowledge_base", asstKbFile.files[0]);
    }

    try {
      const res = await fetch("/api/assistant", {
        method: "PUT",
        credentials: "include",
        body: formData
      });

      if (!res.ok) throw new Error("Save failed");
      statusEl.textContent = "Saved ✅";
    } catch (err) {
      console.error(err);
      statusEl.textContent = "Error saving assistant.";
    }
  });

  // initial load: decide which step to show
  loadAssistant();
});
