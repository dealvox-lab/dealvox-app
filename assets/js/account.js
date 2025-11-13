document.addEventListener("DOMContentLoaded", () => {
  const content = document.getElementById("accountContent");
  const links = document.querySelectorAll(".sidebar-nav .nav-link");
  const toggleBtn = document.getElementById("sidebarToggle");

  // base path from Jekyll (handles baseurl on custom domains)
  const BASE = (content?.dataset.base || "").replace(/\/$/, "");

  const PARTIALS = {
    account:   `${BASE}/assets/partials/account-profile.html`,
    prompt:    `${BASE}/assets/partials/account-prompt.html`,
    api:       `${BASE}/assets/partials/account-api.html`,
    reports:   `${BASE}/assets/partials/account-reports.html`,
    spendings: `${BASE}/assets/partials/account-spendings.html`,
    billing:   `${BASE}/assets/partials/account-billing.html`,
    help:      `${BASE}/assets/partials/account-help.html`,
  };

  function setActive(view){
    links.forEach(a => a.classList.toggle("active", a.dataset.view === view));
  }

  async function fetchPartial(url){
    // Try literal file first
    let res = await fetch(url, { cache: "no-store" });

    // Safety net: if platform redirects to a path (308 → trailing slash),
    // normalize back to the .html file and retry once.
    if (res.redirected && /\.html\/$/.test(res.url)) {
      const fixed = res.url.replace(/\/$/, "");
      res = await fetch(fixed, { cache: "no-store" });
    }
    return res;
  }

  async function loadView(view){
    const url = PARTIALS[view] || PARTIALS.account;
    content.setAttribute("aria-busy","true");
    content.innerHTML = `
      <div class="loading"><div class="spinner"></div><div>Loading…</div></div>
    `;

    try{
      const res = await fetchPartial(url);
      if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const html = await res.text();
      content.innerHTML = html;
      setActive(view);
      content.focus({ preventScroll:true });
    }catch(err){
      console.error("Load error:", err);
      content.innerHTML = `<div class="empty">Couldn’t load this section. Please try again.</div>`;
    }finally{
      content.setAttribute("aria-busy","false");
    }
  }

  links.forEach(a => {
    a.addEventListener("click", e => {
      e.preventDefault();
      const view = a.dataset.view;
      history.pushState({ view }, "", `#${view}`);
      loadView(view);
    });
  });

  window.addEventListener("popstate", () => {
    const view = (location.hash.replace("#","") || "account");
    loadView(view);
  });

  if(toggleBtn){
    toggleBtn.addEventListener("click", () => {
      const expanded = toggleBtn.getAttribute("aria-expanded") === "true";
      toggleBtn.setAttribute("aria-expanded", String(!expanded));
      document.querySelector(".sidebar-nav").classList.toggle("open");
    });
  }

  // Mobile toggle (optional: collapse nav)
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const expanded = toggleBtn.getAttribute("aria-expanded") === "true";
      toggleBtn.setAttribute("aria-expanded", String(!expanded));
      document.querySelector(".sidebar-nav")?.classList.toggle("open");
    });
  }
                          
  const initial = (location.hash.replace("#","") || "account");
  loadView(initial);
});

