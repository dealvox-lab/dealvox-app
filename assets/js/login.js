// /assets/js/login.js

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const emailEl = document.getElementById("loginEmail");
  const passEl = document.getElementById("loginPassword");
  const statusEl = document.getElementById("loginStatus");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailEl.value.trim();
    const password = passEl.value.trim();

    if (!email || !password) {
      statusEl.textContent = "Please enter email and password.";
      return;
    }

    statusEl.textContent = "Signing in…";

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));
      console.log("Login response:", res.status, data);

      if (!res.ok || data.error) {
        statusEl.textContent =
          data.error || "Login failed. Check your email and password.";
        return;
      }

      statusEl.textContent = "Signed in. Redirecting…";
      window.location.href = "/account";
    } catch (err) {
      console.error("Login error:", err);
      statusEl.textContent = "Something went wrong. Please try again.";
    }
  });
});
