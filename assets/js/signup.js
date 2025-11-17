// /assets/js/signup.js

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signupForm");
  const emailEl = document.getElementById("signupEmail");
  const passEl = document.getElementById("signupPassword");
  const statusEl = document.getElementById("signupStatus");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailEl.value.trim();
    const password = passEl.value.trim();

    if (!email || !password) {
      statusEl.textContent = "Please enter email and password.";
      return;
    }

    statusEl.textContent = "Creating your account…";

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));
      console.log("Signup response:", res.status, data);

      if (!res.ok || data.error) {
        statusEl.textContent =
          data.error || "Could not create account. Try again.";
        return;
      }

      // If Supabase requires email confirmation
      if (data.needsConfirmation) {
        statusEl.textContent =
          "Check your inbox to confirm your email. Then you can sign in.";
        // No redirect here because user isn't fully logged in yet.
        return;
      }

      // Otherwise, we have tokens + cookies and can go straight to account
      statusEl.textContent = "Account created! Redirecting…";
      window.location.href = "/account";
    } catch (err) {
      console.error("Signup error:", err);
      statusEl.textContent = "Something went wrong. Please try again.";
    }
  });
});
