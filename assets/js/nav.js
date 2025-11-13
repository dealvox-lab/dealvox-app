// assets/js/nav.js

document.addEventListener("DOMContentLoaded", () => {
  const header = document.querySelector(".topline");
  const burger = document.querySelector(".menu-icon");
  const body = document.body;
  const overlay = document.querySelector(".nav-overlay");
  const links = document.querySelectorAll(".nav-links a");

  if (!header || !burger || !overlay) return;

  const toggleNav = () => {
    const isOpen = header.classList.toggle("nav-open");
    body.classList.toggle("nav-open", isOpen);
    burger.setAttribute("aria-expanded", isOpen ? "true" : "false");
  };

  burger.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleNav();
  });

  // Close on link click
  links.forEach(link => {
    link.addEventListener("click", () => {
      header.classList.remove("nav-open");
      body.classList.remove("nav-open");
      burger.setAttribute("aria-expanded", "false");
    });
  });

  // Close when clicking outside overlay
  document.addEventListener("click", (e) => {
    if (!header.classList.contains("nav-open")) return;
    const inside = e.target.closest(".nav-overlay") || e.target.closest(".menu-icon");
    if (!inside) {
      header.classList.remove("nav-open");
      body.classList.remove("nav-open");
      burger.setAttribute("aria-expanded", "false");
    }
  });
});
