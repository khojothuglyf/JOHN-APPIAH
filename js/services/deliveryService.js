/* Private delivery-request records stored in Supabase. A seller arranges
   delivery directly with the buyer; this service never prices or tracks it. */

import { rest, getAuthToken } from "./supabase.js";
import { getCurrentUser } from "./authService.js";
import { ApiError } from "./api.js";

export const DELIVERY_STATUS = {
  REQUESTED: "REQUESTED",
  DELIVERY_CONFIRMED: "DELIVERY_CONFIRMED",
  READY_FOR_DELIVERY: "READY_FOR_DELIVERY",
};

const DELIVERY_SELECT = "id,order_id,buyer_id,seller_id,recipient_name,recipient_phone,delivery_area,delivery_instructions,status,created_at,updated_at";

function token() { return getAuthToken(); }

function mapRequest(row = {}) {
  return {
    id: row.id,
    orderId: row.order_id,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    recipientName: row.recipient_name || "",
    recipientPhone: row.recipient_phone || "",
    deliveryArea: row.delivery_area || "",
    deliveryInstructions: row.delivery_instructions || "",
    status: row.status || DELIVERY_STATUS.REQUESTED,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getDeliveryStatusLabel(status) {
  return {
    [DELIVERY_STATUS.REQUESTED]: "Delivery requested",
    [DELIVERY_STATUS.DELIVERY_CONFIRMED]: "Delivery confirmed",
    [DELIVERY_STATUS.READY_FOR_DELIVERY]: "Ready for delivery",
  }[status] || "Delivery requested";
}

/** Create one request per seller in the order. The unique order/seller key
 * makes checkout retries idempotent. */
export async function createDeliveryRequests({ orderId, items = [], details = {} } = {}) {
  const buyerId = getCurrentUser()?.id;
  const sellerIds = [...new Set(items.map((item) => item.sellerId).filter(Boolean))];
  if (!buyerId) throw new ApiError(401, "Please sign in to request delivery.");
  if (!orderId || sellerIds.length === 0) {
    throw new ApiError(400, "Delivery is available only when every item has a seller.");
  }
  const rows = sellerIds.map((sellerId) => ({
    order_id: String(orderId), buyer_id: buyerId, seller_id: sellerId,
    recipient_name: details.recipientName.trim(), recipient_phone: details.recipientPhone.trim(),
    delivery_area: details.deliveryArea.trim(), delivery_instructions: details.deliveryInstructions.trim(),
  }));
  const result = await rest.insert("delivery_requests", rows, {
    token: token(), upsert: true, onConflict: "order_id,seller_id",
  });
  return (Array.isArray(result) ? result : []).map(mapRequest);
}

export async function listDeliveryRequests() {
  const { data } = await rest.list("delivery_requests", {
    select: DELIVERY_SELECT, order: "created_at.desc", token: token(),
  });
  return data.map(mapRequest);
}

export async function updateDeliveryStatus(id, status) {
  if (![DELIVERY_STATUS.DELIVERY_CONFIRMED, DELIVERY_STATUS.READY_FOR_DELIVERY].includes(status)) {
    return null;
  }
  const rows = await rest.update("delivery_requests", { id: `eq.${id}` }, { status }, { token: token() });
  return mapRequest(rows?.[0]);
}
