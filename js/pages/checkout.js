/* ============================================================
   CHECKOUT PAGE SCRIPT
   Renders the order summary from the cart, collects delivery and
   payment details, validates them and places the order with the
   Spring Boot backend. Only supabaseProductId + quantity and the
   shipping details are sent - the backend computes all prices and
   totals. On success the backend order is cached and the cart is
   cleared before redirecting to the confirmation page. If the
   backend is unavailable no local order is created.
   ============================================================ */

import { $, escapeHtml, pageUrl, redirect } from "../utils/dom.js";
import { formatCurrency } from "../utils/format.js";
import { validators, validate } from "../utils/validators.js";
import {
  readFormData,
  clearFieldErrors,
  showFieldErrors,
  setSubmitState,
} from "../utils/form.js";
import { getCart, getCartSubtotal, clearCart } from "../services/cartService.js";
import { createOrder, PAYMENT_METHODS } from "../services/ordersService.js";
import { getCurrentUser, isAuthenticated } from "../services/authService.js";
import { showToast } from "../components/toast.js";

const IMAGE_FALLBACK = pageUrl("images/placeholder.svg");

const page = {
  form: null,
  empty: null,
  page: null,
  paymentMethod: null,
  cardFields: null,
  summaryItems: null,
  summarySubtotal: null,
  summaryTotal: null,
};

document.addEventListener("DOMContentLoaded", () => {
  page.form = $("[data-checkout-page]");
  page.empty = $("[data-checkout-empty]");
  page.page = $("[data-checkout-page]");
  page.paymentMethod = $("[data-payment-method]");
  page.cardFields = $("[data-card-fields]");
  page.summaryItems = $("[data-summary-items]");
  page.summarySubtotal = $("[data-summary-subtotal]");
  page.summaryTotal = $("[data-summary-total]");

  if (!page.page || !page.form) return;

  if (getCart().length === 0) {
    page.empty.hidden = false;
    page.page.hidden = true;
    return;
  }

  prefillEmail();
  bindEvents();
  renderSummary();
});

function bindEvents() {
  page.paymentMethod?.addEventListener("change", updatePaymentMethod);
  updatePaymentMethod();

  const cardNumber = $("[data-card-number]", page.form);
  const expiry = $("[data-card-expiry]", page.form);
  const cvc = $("[data-card-cvc]", page.form);

  cardNumber?.addEventListener("input", () => {
    const digits = cardNumber.value.replace(/\D/g, "").slice(0, 16);
    cardNumber.value = digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
  });

  expiry?.addEventListener("input", () => {
    let digits = expiry.value.replace(/\D/g, "").slice(0, 4);
    if (digits.length > 2) digits = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    expiry.value = digits;
  });

  cvc?.addEventListener("input", () => {
    cvc.value = cvc.value.replace(/\D/g, "").slice(0, 4);
  });

  page.form.addEventListener("submit", (event) => {
    event.preventDefault();
    placeOrder();
  });
}

/** Show/hide card fields when the payment method changes. */
function updatePaymentMethod() {
  const isCard = page.paymentMethod?.value === PAYMENT_METHODS.CARD;
  if (page.cardFields) page.cardFields.hidden = !isCard;
}

/** Prefill the email from the signed-in user, if any. */
function prefillEmail() {
  const user = getCurrentUser();
  const emailInput = $("[name='email']", page.form);
  if (user?.email && emailInput) emailInput.value = user.email;
}

function renderSummary() {
  const items = getCart();
  page.summaryItems.innerHTML = items
    .map((item) => {
      const image = item.imageUrl || IMAGE_FALLBACK;
      return `
        <div class="checkout-summary__item">
          <span class="checkout-summary__thumb">
            <img src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async"
              onerror="this.onerror=null;this.src='${IMAGE_FALLBACK}'" />
          </span>
          <span class="checkout-summary__name">
            ${escapeHtml(item.name || "Product")}
            <span class="checkout-summary__qty">× ${Number(item.quantity) || 1}</span>
          </span>
          <strong class="checkout-summary__line-total">
            ${formatCurrency((Number(item.price) || 0) * (Number(item.quantity) || 1))}
          </strong>
        </div>
      `;
    })
    .join("");

  const subtotal = getCartSubtotal();
  page.summarySubtotal.textContent = formatCurrency(subtotal);
  page.summaryTotal.textContent = formatCurrency(subtotal);
}

async function placeOrder() {
  clearFieldErrors(page.form);

  const values = readFormData(page.form);
  const errors = validate(values, buildRules(values.paymentMethod));

  if (Object.keys(errors).length) {
    showFieldErrors(page.form, errors);
    return;
  }

  // Orders are created against the authenticated backend, so a
  // signed-in session is required. The cart survives in localStorage,
  // so checkout resumes after sign-in.
  if (!isAuthenticated()) {
    redirect("pages/login.html", { redirect: "pages/checkout.html" });
    return;
  }

  setSubmitState(page.form, true);

  const shipping = {
    email: values.email.trim(),
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    address: values.address.trim(),
    city: values.city.trim(),
    state: values.state.trim(),
    zip: values.zip.trim(),
    country: values.country,
  };

  const isCard = values.paymentMethod === PAYMENT_METHODS.CARD;

  try {
    // Only items (supabaseProductId + quantity) and the shipping
    // details are sent. The backend computes all prices and totals;
    // the returned order is the authoritative record.
    const order = await createOrder({
      items: getCart(),
      shipping,
      payment: {
        method: values.paymentMethod,
        last4: isCard ? values.cardNumber.replace(/\D/g, "").slice(-4) : null,
      },
    });

    clearCart();
    redirect("pages/order-confirmation.html", { id: order.id });
  } catch (error) {
    setSubmitState(page.form, false);
    showToast({
      title: "Order not placed",
      message:
        error?.message ||
        "The order could not be placed right now. Please try again.",
      type: "error",
    });
  }
}

/** Validation rules; card fields only apply when paying by card. */
function buildRules(paymentMethod) {
  const rules = {
    email: [validators.required, validators.email],
    firstName: [validators.required],
    lastName: [validators.required],
    address: [validators.required],
    city: [validators.required],
    zip: [validators.required],
    country: [validators.required],
    paymentMethod: [validators.required],
  };

  if (paymentMethod === PAYMENT_METHODS.CARD) {
    rules.cardName = [validators.required];
    rules.cardNumber = [validators.required, validators.cardNumber];
    rules.cardExpiry = [validators.required, validators.cardExpiry];
    rules.cardCvc = [validators.required, validators.cardCvc];
  }

  return rules;
}
