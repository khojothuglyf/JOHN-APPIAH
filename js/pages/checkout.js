/* ============================================================
   CHECKOUT PAGE SCRIPT
   Renders the order summary from the cart, collects delivery and
   payment details, validates them and places the order with the
   Spring Boot backend. Only supabaseProductId + quantity and the
   shipping details are sent - the backend computes all prices and
   totals. The payment is then initialized against the returned order
   via the payments API (online methods return a Paystack hosted
   checkout URL to redirect to; cash on delivery stays pending). On
   success the backend order is cached and the cart is cleared before
   leaving to complete payment or the confirmation page. If the backend
   is unavailable no local order is created.
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
import {
  createOrder,
  PAYMENT_METHODS,
  recordPaymentForOrder,
} from "../services/ordersService.js";
import {
  BACKEND_PAYMENT_METHODS,
  initializePayment,
} from "../services/paymentService.js";
import { getCurrentUser, isAuthenticated } from "../services/authService.js";
import { showToast } from "../components/toast.js";
import { createDeliveryRequests } from "../services/deliveryService.js";

const IMAGE_FALLBACK = pageUrl("images/placeholder.svg");

const page = {
  form: null,
  empty: null,
  page: null,
  paymentMethod: null,
  deliveryChoice: null,
  deliveryFields: null,
  summaryItems: null,
  summarySubtotal: null,
  summaryTotal: null,
};

document.addEventListener("DOMContentLoaded", () => {
  page.form = $("[data-checkout-page]");
  page.empty = $("[data-checkout-empty]");
  page.page = $("[data-checkout-page]");
  page.paymentMethod = $("[data-payment-method]");
  page.deliveryChoice = $("[data-delivery-choice]");
  page.deliveryFields = $("[data-delivery-request-fields]");
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
  page.form.addEventListener("submit", (event) => {
    event.preventDefault();
    placeOrder();
  });
  page.deliveryChoice?.addEventListener("change", toggleDeliveryFields);
  toggleDeliveryFields();
}

function toggleDeliveryFields() {
  const requested = page.deliveryChoice?.value === "REQUEST_DELIVERY";
  if (page.deliveryFields) page.deliveryFields.hidden = !requested;
  page.deliveryFields?.querySelectorAll("input, textarea").forEach((field) => {
    field.disabled = !requested;
  });
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
  const errors = validate(values, buildRules());

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

  try {
    // Only items (supabaseProductId + quantity) and the shipping
    // details are sent. The backend computes all prices and totals;
    // the returned order is the authoritative record.
    const order = await createOrder({ items: getCart(), shipping });

    if (values.deliveryChoice === "REQUEST_DELIVERY") {
      await createDeliveryRequests({
        orderId: order.id,
        items: getCart(),
        details: {
          recipientName: values.recipientName,
          recipientPhone: values.recipientPhone,
          deliveryArea: values.deliveryArea,
          deliveryInstructions: values.deliveryInstructions,
        },
      });
      order.deliveryRequested = true;
    }

    // Initialize the payment against the order. Online methods return
    // a Paystack hosted-checkout URL; cash on delivery stays pending.
    // initializePayment recovers idempotently when this order already
    // has a payment (a retried checkout whose earlier response was lost).
    let payment;
    try {
      payment = await initializePayment(
        order.id,
        BACKEND_PAYMENT_METHODS[values.paymentMethod]
      );
    } catch (error) {
      throw new Error(
        `Your order ${order.orderNumber || order.id} was created, but the ` +
          `payment could not be initialized (${error?.message || "please try again"}). ` +
          `Your cart has been kept so you can retry.`
      );
    }

    recordPaymentForOrder(order.id, payment);

    // The order and its payment are both recorded on the backend - only
    // now is the cart cleared. A failure above (or a backend rejection)
    // keeps the cart intact and never fabricates a local order.
    clearCart();

    // Online payments are settled on Paystack's hosted checkout: send
    // the browser there to complete payment. When Paystack returns
    // (with ?reference=..&trxref=..) the confirmation page verifies it.
    if (payment.authorizationUrl) {
      window.location.assign(payment.authorizationUrl);
      return;
    }

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

/** Validation rules for the delivery details and the payment method. */
function buildRules() {
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
  if (page.deliveryChoice?.value === "REQUEST_DELIVERY") {
    rules.recipientName = [validators.required];
    rules.recipientPhone = [validators.required];
    rules.deliveryArea = [validators.required];
    rules.deliveryInstructions = [validators.required];
  }
  return rules;
}
