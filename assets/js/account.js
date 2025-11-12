// Simple client-side router that loads partials into #accountContent
document.addEventListener("DOMContentLoaded", () => {
  const content = document.getElementById("accountContent");
  const links = document.querySelectorAll(".sidebar-nav .nav-link");
  const toggleBtn = document.getElementById("sidebarToggle");

  // Map views -> partial paths
  const PARTIALS = {
    account:   "assets/partials/account-profile.html",
    prompt:    "assets/partials/account-prompt.html",
    api:       "assets/partials/account-api.html",
    reports:   "assets/partials/account-reports.html",
    spendings: "assets/partials/account-spendings.html",
    billing:   "assets/partials/account-billing.html",
    help:      "assets/partials/account-help.html"
  };

  function setActive(view){
    links.forEach(a => a.classList.toggle("active", a.dataset.view === view));
  }

  async function loadView(view){
    const url = PARTIALS[view] || PARTIALS.account;
    content.setAttribute("aria-busy","true");
    content.innerHTML = `
      <div class="loading"><div class="spinner"></div><div>Loading…</div></div>
    `;

    try{
      const res = await fetch(url, { cache: "no-store" });
      if(!res.ok) throw new Error(res.statusText);
      const html = await res.text();
      content.innerHTML = html;
      setActive(view);
      // focus main for accessibility
      content.focus({ preventScroll:true });
    }catch(err){
      content.innerHTML = `<div class="empty">Couldn’t load this section. Please try again.</div>`;
      console.error("Load error:", err);
    }finally{
      content.setAttribute("aria-busy","false");
    }
  }

  // Handle clicks
  links.forEach(a => {
    a.addEventListener("click", e => {
      e.preventDefault();
      const view = a.dataset.view;
      history.pushState({ view }, "", `#${view}`);
      loadView(view);
    });
  });

  // Back/forward support
  window.addEventListener("popstate", () => {
    const view = (location.hash.replace("#","") || "account");
    loadView(view);
  });

  // Mobile toggle (optional: collapse nav)
  if(toggleBtn){
    toggleBtn.addEventListener("click", () => {
      const expanded = toggleBtn.getAttribute("aria-expanded") === "true";
      toggleBtn.setAttribute("aria-expanded", String(!expanded));
      document.querySelector(".sidebar-nav").classList.toggle("open");
    });
  }

  // Initial
  const initial = (location.hash.replace("#","") || "account");
  loadView(initial);
});
