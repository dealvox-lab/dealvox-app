// assets/js/account-pricing.js
// ---------------------------------------------
// Dealvox Pricing logic – ACCOUNT page
// - Minutes sliders (discrete positions)
// - Monthly / Yearly toggle
// - Dynamic Stripe links for each tier
// - Adds ?prefilled_email=[user_email] to Stripe links
// ---------------------------------------------

(function () {
  "use strict";

  // Stripe links & prices by plan / billing period / minutes
  const PRICING_CONFIG = {
    starter: {
      monthly: {
        200: {
          price: 239,
          link: "https://buy.stripe.com/test_5kQ3cvc1M6HD5K62sAfYY00"
        },
        300: {
          price: 339,
          link: "https://buy.stripe.com/test_fZu6oHe9Ugidc8ud7efYY02"
        },
        400: {
          price: 439,
          link: "https://buy.stripe.com/test_bJe9AT5Do0jf2xU3wEfYY03"
        }
      },
      yearly: {
        200: {
          price: 2629,
          link: "https://buy.stripe.com/test_7sY4gz7Lw8PLfkG1owfYY04"
        },
        300: {
          price: 3729,
          link: "https://buy.stripe.com/test_4gM14n5Dofe9fkG9V2fYY05"
        },
        400: {
          price: 4829,
          link: "https://buy.stripe.com/test_dRm28r0j4gida0mc3afYY06"
        }
      }
    },
    growth: {
      monthly: {
        500: {
          price: 499,
          link: "https://buy.stripe.com/test_28E3cv2rcfe9a0maZ6fYY01"
        },
        1000: {
          price: 899,
          link: "https://buy.stripe.com/test_8x2eVd8PA7LHdcy5EMfYY07"
        },
        1500: {
          price: 1199,
          link: "https://buy.stripe.com/test_9B64gze9Ud61egCffmfYY08"
        },
        2000: {
          price: 1599,
          link: "https://buy.stripe.com/test_28E00jd5Qc1Xdcy8QYfYY09"
        },
        3000: {
          price: 2149,
          link: "https://buy.stripe.com/test_bJeaEX8PA8PLdcy8QYfYY0a"
        },
        5000: {
          price: 3699,
          link: "https://buy.stripe.com/test_7sYeVd7Lwgid1tQd7efYY0b"
        }
      },
      yearly: {
        500: {
          price: 4990,
          link: "https://buy.stripe.com/test_7sYcN59TE1njgoKebifYY0c"
        },
        1000: {
          price: 8990,
          link: "https://buy.stripe.com/test_3cIbJ13vg6HD0pM7MUfYY0d"
        },
        1500: {
          price: 11990,
          link: "https://buy.stripe.com/test_dRmaEX9TEea51tQ7MUfYY0e"
        },
        2000: {
          price: 15990,
          link: "https://buy.stripe.com/test_14A8wP0j41nj6Oa7MUfYY0f"
        },
        3000: {
          price: 21490,
          link: "https://buy.stripe.com/test_28E6oH4zkfe9a0m6IQfYY0g"
        },
        5000: {
          price: 36990,
          link: "https://buy.stripe.com/test_6oU4gzc1M2rn3BY7MUfYY0h"
        }
      }
    }
    // Enterprise is handled via "Contact Sales" – no direct Stripe links here
  };

  // ----- helpers for prefilled_email -----

  async function getUserEmailForPricing() {
    // 1) Try Supabase auth helper
    if (typeof getAuthInfo === "function") {
      try {
        const auth = await getAuthInfo();
        if (auth?.user?.email) return auth.user.email;
      } catch (e) {
        console.warn("[AccountPricing] getAuthInfo failed:", e);
      }
    }

    // 2) Fallback: read from profile email input
    const el = document.getElementById("profileEmail");
    if (el && el.value) return el.value;

    return "";
  }

  function appendPrefilledEmail(baseLink, email) {
    if (!email) return baseLink;
    const encoded = encodeURIComponent(email);

    if (baseLink.includes("?")) {
      return `${baseLink}&prefilled_email=${encoded}`;
    }
    return `${baseLink}?prefilled_email=${encoded}`;
  }

  // ----- core pricing logic -----

  function getTiersForCard(card, slider) {
    // If data-tiers is present, use it (Growth)
    const tiersAttr = slider.dataset.tiers;
    if (tiersAttr) {
      return tiersAttr.split(",").map((t) => parseInt(t.trim(), 10));
    }

    // Otherwise derive tiers from min/max/step (Starter)
    const min = Number(slider.min || 0);
    const max = Number(slider.max || 0);
    const step = Number(slider.step || 1);
    const arr = [];
    for (let v = min; v <= max; v += step) {
      arr.push(v);
    }
    return arr;
  }

  function updateMinutesMarks(card, minutes) {
    const marks = card.querySelectorAll(".minutes-marks span[data-value]");
    marks.forEach((mark) => {
      const value = parseInt(mark.dataset.value, 10);
      if (value === minutes) {
        mark.classList.add("active");
      } else {
        mark.classList.remove("active");
      }
    });
  }

  function getBillingMode(billingToggle) {
    return billingToggle && billingToggle.checked ? "yearly" : "monthly";
  }

  function attachSliderLogic(card, billingToggle) {
    const slider = card.querySelector(".minutes-slider");
    if (!slider) return;

    const tiers = getTiersForCard(card, slider);
    slider._tiers = tiers;

    slider.min = 0;
    slider.max = tiers.length - 1;
    slider.step = 1;

    // Initial value: index 0 (first tier)
    if (slider.value === "" || slider.value === undefined) {
      slider.value = 0;
    } else {
      let idx = parseInt(slider.value, 10);
      if (isNaN(idx) || idx < 0) idx = 0;
      if (idx > tiers.length - 1) idx = tiers.length - 1;
      slider.value = idx;
    }

    const onChange = () => updateCardPricing(card, billingToggle);

    slider.addEventListener("input", onChange);
    slider.addEventListener("change", onChange);

    // Initial sync
    updateCardPricing(card, billingToggle);
  }

  async function handleStripeClick(tier) {
    const email = await getUserEmailForPricing();
    const finalLink = appendPrefilledEmail(tier.link, email);
    window.open(finalLink, "_blank");
  }

  function updateCardPricing(card, billingToggle) {
    const plan = card.dataset.plan;
    if (!PRICING_CONFIG[plan]) return; // skip enterprise

    const slider = card.querySelector(".minutes-slider");
    const minutesDisplayEl = card.querySelector(".minutes-display");
    const priceTagEl = card.querySelector(".price-tag");
    const buttonEl = card.querySelector(".pricing-btn");

    if (!slider || !priceTagEl || !buttonEl) return;

    const tiers = slider._tiers;
    if (!tiers || !tiers.length) return;

    const index = parseInt(slider.value, 10);
    const minutes = tiers[index];
    const mode = getBillingMode(billingToggle);
    const planConfig = PRICING_CONFIG[plan][mode];
    if (!planConfig) return;

    const tier = planConfig[minutes];
    if (!tier) return;

    // Update minutes text
    if (minutesDisplayEl) {
      minutesDisplayEl.textContent = `${minutes} minutes`;
    }

    // Update price
    const periodLabel = mode === "monthly" ? "mo" : "yr";
    const formattedPrice = tier.price.toLocaleString("en-US", {
      maximumFractionDigits: 0
    });
    priceTagEl.innerHTML = `$${formattedPrice}<span>/${periodLabel}</span>`;

    // Update button click → Stripe link with prefilled_email
    buttonEl.onclick = function () {
      handleStripeClick(tier);
    };

    updateMinutesMarks(card, minutes);
  }

  // ----- public init for Account page -----

  function initAccountPricingSection() {
    const pricingCard = document.getElementById("pricingCard");
    if (!pricingCard) {
      console.log("[AccountPricing] pricingCard not found; skipping.");
      return;
    }

    // Prevent double-binding if SPA reloads the view
    if (pricingCard.dataset.bound === "1") {
      console.log("[AccountPricing] already initialized; skipping.");
      return;
    }
    pricingCard.dataset.bound = "1";

    const billingToggle = document.getElementById("billingToggle");
    const cards = document.querySelectorAll(".pricing-card[data-plan]");

    if (!cards.length) {
      console.log("[AccountPricing] No pricing cards found; skipping.");
      return;
    }

    // Initialize all cards
    cards.forEach((card) => {
      attachSliderLogic(card, billingToggle);
    });

    // Billing toggle (Monthly / Yearly)
    if (billingToggle) {
      billingToggle.addEventListener("change", () => {
        cards.forEach((card) => updateCardPricing(card, billingToggle));
      });
    }

    // OPTIONAL: Pay-as-you-go button link (also with prefilled_email if needed)
    const paygBtn = document.querySelector(".payg-btn");
    if (paygBtn) {
      paygBtn.onclick = async () => {
        const baseLink = "https://your-payg-stripe-link-here";
        const email = await getUserEmailForPricing();
        const finalLink = appendPrefilledEmail(baseLink, email);
        window.open(finalLink, "_blank");
      };
    }

    console.log("[AccountPricing] initialized.");
  }

  // Expose for account.js
  window.initAccountPricingSection = initAccountPricingSection;
})();
