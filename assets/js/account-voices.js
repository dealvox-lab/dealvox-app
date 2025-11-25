// /assets/js/account-voices.js
// ------------------------------------------
// VOICES VIEW (Voices tab)
// ------------------------------------------

// Static catalog from your CSV
const VOICES_CATALOG = [
  {
    voice_id: "11labs-Billy",
    voice_name: "Billy",
    accent: "American",
    gender: "male",
    age: "Young",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/billy.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/billy.mp3",
  },
  {
    voice_id: "11labs-Lily",
    voice_name: "Lily",
    accent: "American",
    gender: "female",
    age: "Young",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/lily.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/lily.mp3",
  },
  {
    voice_id: "11labs-Jenny",
    voice_name: "Jenny",
    accent: "American",
    gender: "female",
    age: "Middle Aged",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/Jenny.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/Jenny.mp3",
  },
  {
    voice_id: "11labs-George",
    voice_name: "George",
    accent: "American",
    gender: "male",
    age: "Middle Aged",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/george.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/george.mp3",
  },
  {
    voice_id: "11labs-Andrew",
    voice_name: "Andrew",
    accent: "British",
    gender: "male",
    age: "Middle Aged",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/andrew.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/andrew.mp3",
  },
  {
    voice_id: "11labs-Callum",
    voice_name: "Callum",
    accent: "British",
    gender: "male",
    age: "Young",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/callum.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/callum.mp3",
  },
  {
    voice_id: "11labs-Ana",
    voice_name: "Ana",
    accent: "American",
    gender: "female",
    age: "Young",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/ana.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/ana.mp3",
  },
  {
    voice_id: "11labs-Antoni",
    voice_name: "Antoni",
    accent: "American",
    gender: "male",
    age: "Middle Aged",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/antoni.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/antoni.mp3",
  },
  {
    voice_id: "11labs-Gigi",
    voice_name: "Gigi",
    accent: "American",
    gender: "female",
    age: "Young",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/gigi.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/gigi.mp3",
  },
  {
    voice_id: "11labs-Sarah",
    voice_name: "Sarah",
    accent: "American",
    gender: "female",
    age: "Middle Aged",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/sarah.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/sarah.mp3",
  },
  {
    voice_id: "11labs-Laura",
    voice_name: "Laura",
    accent: "American",
    gender: "female",
    age: "Young",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/laura.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/laura.mp3",
  },
  {
    voice_id: "11labs-Adam",
    voice_name: "Adam",
    accent: "American",
    gender: "male",
    age: "Middle Aged",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/adam.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/adam.mp3",
  },
  {
    voice_id: "11labs-Nicole",
    voice_name: "Nicole",
    accent: "American",
    gender: "female",
    age: "Middle Aged",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/nicole.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/nicole.mp3",
  },
  {
    voice_id: "11labs-Kim",
    voice_name: "Kim",
    accent: "American",
    gender: "female",
    age: "Middle Aged",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/kim.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/kim.mp3",
  },
  {
    voice_id: "11labs-James",
    voice_name: "James",
    accent: "American",
    gender: "male",
    age: "Middle Aged",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/james.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/james.mp3",
  },
  {
    voice_id: "11labs-Rachel",
    voice_name: "Rachel",
    accent: "American",
    gender: "female",
    age: "Middle Aged",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/rachel.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/rachel.mp3",
  },
  {
    voice_id: "11labs-Thomas",
    voice_name: "Thomas",
    accent: "American",
    gender: "male",
    age: "Young",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/thomas.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/thomas.mp3",
  },
  {
    voice_id: "11labs-Domi",
    voice_name: "Domi",
    accent: "American",
    gender: "female",
    age: "Young",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/domi.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/domi.mp3",
  },
  {
    voice_id: "11labs-Elli",
    voice_name: "Elli",
    accent: "American",
    gender: "female",
    age: "Young",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/elli.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/elli.mp3",
  },
  {
    voice_id: "11labs-Charlotte",
    voice_name: "Charlotte",
    accent: "American",
    gender: "female",
    age: "Young",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/charlotte.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/charlotte.mp3",
  },
  {
    voice_id: "11labs-Patrick",
    voice_name: "Patrick",
    accent: "American",
    gender: "male",
    age: "Young",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/patrick.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/patrick.mp3",
  },
  {
    voice_id: "11labs-Michael",
    voice_name: "Michael",
    accent: "American",
    gender: "male",
    age: "Middle Aged",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/michael.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/michael.mp3",
  },
  {
    voice_id: "11labs-Eric",
    voice_name: "Eric",
    accent: "American",
    gender: "male",
    age: "Middle Aged",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/eric.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/eric.mp3",
  },
  {
    voice_id: "11labs-Ethan",
    voice_name: "Ethan",
    accent: "American",
    gender: "male",
    age: "Young",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/ethan.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/ethan.mp3",
  },
  {
    voice_id: "11labs-Chris",
    voice_name: "Chris",
    accent: "American",
    gender: "male",
    age: "Middle Aged",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/chris.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/chris.mp3",
  },
  {
    voice_id: "11labs-Jessica",
    voice_name: "Jessica",
    accent: "American",
    gender: "female",
    age: "Middle Aged",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/jessica.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/jessica.mp3",
  },
  {
    voice_id: "11labs-Matthew",
    voice_name: "Matthew",
    accent: "American",
    gender: "male",
    age: "Middle Aged",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/matthew.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/matthew.mp3",
  },
  {
    voice_id: "11labs-Josh",
    voice_name: "Josh",
    accent: "American",
    gender: "male",
    age: "Young",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/josh.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/josh.mp3",
  },
  {
    voice_id: "11labs-Sam",
    voice_name: "Sam",
    accent: "American",
    gender: "male",
    age: "Young",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/sam.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/sam.mp3",
  },
  {
    voice_id: "11labs-Aria",
    voice_name: "Aria",
    accent: "American",
    gender: "female",
    age: "Young",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/aria.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/aria.mp3",
  },
  {
    voice_id: "11labs-Ryan",
    voice_name: "Ryan",
    accent: "American",
    gender: "male",
    age: "Young",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/ryan.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/ryan.mp3",
  },
  {
    voice_id: "11labs-Mia",
    voice_name: "Mia",
    accent: "American",
    gender: "female",
    age: "Middle Aged",
    avatar_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/mia.png",
    preview_audio_url: "https://retell-utils-public.s3.us-west-2.amazonaws.com/Mia.mp3",
  },
];

// Uses helpers from account.js: getAuthInfo, supabaseHeaders, handleJwt401
async function initAccountVoicesView() {
  const grid     = document.getElementById("voicesGrid");
  const statusEl = document.getElementById("voicesStatus");
  const audioEl  = document.getElementById("voicePreviewAudio");

  if (!grid) return;
  if (grid.dataset.bound === "1") return;
  grid.dataset.bound = "1";

  let auth;
  try {
    auth = await getAuthInfo();
  } catch (e) {
    console.error("getAuthInfo failed (voices):", e);
    if (statusEl) statusEl.textContent = "Unable to load voices.";
    return;
  }

  if (!auth.user || !auth.accessToken) {
    if (statusEl) statusEl.textContent = "Session expired. Please log in.";
    return;
  }

  const userId        = auth.user.id;
  const assistantsUrl = `${window.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/assistants`;

  function setStatus(msg, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("error", !!isError);
  }

  function renderVoices(selectedVoiceId) {
    grid.innerHTML = VOICES_CATALOG.map((v) => {
      const selected = v.voice_id === selectedVoiceId;
      const gender   = v.gender
        ? v.gender.charAt(0).toUpperCase() + v.gender.slice(1)
        : "";
      return `
        <div class="voice-card${selected ? " selected" : ""}" data-voice-id="${v.voice_id}">
          <div class="voice-avatar-wrapper">
            <img src="${v.avatar_url}" alt="${v.voice_name} avatar" class="voice-avatar">
          </div>
          <div class="voice-body">
            <h3 class="voice-name">${v.voice_name}</h3>
            <p class="voice-meta">${v.accent} • ${gender} • ${v.age}</p>
            <div class="voice-actions">
              <button type="button"
                      class="btn-secondary small voice-preview-btn"
                      data-audio="${v.preview_audio_url}">
                Preview
              </button>
              <button type="button"
                      class="btn-primary small voice-select-btn">
                ${selected ? "Selected" : "Select this voice"}
              </button>
              <span class="voice-selected-pill"${
                selected ? "" : ' style="display:none"'
              }>Selected</span>
            </div>
          </div>
        </div>`;
    }).join("");
  }

  // Load current assistant voice from Supabase
  async function loadCurrentVoice() {
    const params = new URLSearchParams();
    params.set("select", "agent_voice");
    params.set("user_id", `eq.${userId}`);
    params.set("limit", "1");

    async function run(currentAuth) {
      return fetch(`${assistantsUrl}?${params.toString()}`, {
        headers: supabaseHeaders(currentAuth.accessToken),
      });
    }

    let res = await run(auth);
    if (res.status === 401) {
      const newAuth = await handleJwt401(res, "load assistant voice");
      if (!newAuth) return null;
      auth = newAuth;
      res  = await run(auth);
    }

    if (!res.ok) {
      console.warn("loadCurrentVoice HTTP error", res.status, await res.text());
      return null;
    }

    const rows = await res.json();
    const data = rows && rows[0];
    return data && data.agent_voice ? data.agent_voice : null;
  }

  async function saveVoice(voiceId) {
    setStatus("Saving voice…");

    const payload = {
      user_id: userId,
      agent_voice: voiceId,
    };

    async function run(currentAuth) {
      return fetch(assistantsUrl, {
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
      const newAuth = await handleJwt401(res, "save assistant voice");
      if (!newAuth) {
        setStatus("Session expired. Please log in.", true);
        return false;
      }
      auth = newAuth;
      res  = await run(auth);
    }

    if (!res.ok) {
      console.error("saveVoice HTTP error", res.status, await res.text());
      setStatus("Could not save voice. Try again.", true);
      return false;
    }

    setStatus("Voice saved.");
    setTimeout(() => setStatus(""), 1500);
    return true;
  }

  // Event delegation for preview + select
  let currentPreviewBtn = null;

  grid.addEventListener("click", async (e) => {
    const previewBtn = e.target.closest(".voice-preview-btn");
    const selectBtn  = e.target.closest(".voice-select-btn");

    if (previewBtn) {
      const audioUrl = previewBtn.getAttribute("data-audio");
      if (!audioUrl || !audioEl) return;

      try {
        if (currentPreviewBtn && currentPreviewBtn !== previewBtn) {
          currentPreviewBtn.classList.remove("playing");
        }
        currentPreviewBtn = previewBtn;

        previewBtn.classList.add("playing");
        audioEl.src = audioUrl;
        await audioEl.play();
      } catch (err) {
        console.error("Preview play error", err);
        setStatus("Could not play preview.", true);
      }
      return;
    }

    if (selectBtn) {
      const card = selectBtn.closest(".voice-card");
      if (!card) return;
      const voiceId = card.getAttribute("data-voice-id");
      if (!voiceId) return;

      const ok = await saveVoice(voiceId);
      if (!ok) return;

      // Update UI selection
      grid.querySelectorAll(".voice-card").forEach((c) => {
        const pill = c.querySelector(".voice-selected-pill");
        const btn  = c.querySelector(".voice-select-btn");
        const isSelected = c === card;

        c.classList.toggle("selected", isSelected);
        if (pill) pill.style.display = isSelected ? "inline-flex" : "none";
        if (btn)  btn.textContent   = isSelected ? "Selected" : "Select this voice";
      });
    }
  });

  if (audioEl) {
    audioEl.addEventListener("ended", () => {
      if (currentPreviewBtn) {
        currentPreviewBtn.classList.remove("playing");
        currentPreviewBtn = null;
      }
    });
  }

  const currentVoiceId = await loadCurrentVoice();
  renderVoices(currentVoiceId);
}
