/* ============================================================
   ADMIN FINANCE SERVICE - SPRING BOOT BACKEND (via http.js)
   ============================================================
   Powers the admin Finance tab: platform commission totals,
   the commission ledger, withdrawal management (approve / complete
   / reject) and the final payout flow against the Java / Spring
   Boot settlement backend through the shared HTTP client (http.js).

   Security:
   - The authenticated Supabase access token is sent as
     `Authorization: Bearer ...` by http.js and validated by the
     backend's Supabase JWT bridge.
   - Backend Spring Security (@PreAuthorize("hasRole('ADMIN')"))
     is authoritative for every operation here. The frontend only
     gates the UI on the signed-in ADMIN session and never sends a
     trusted id or role from an unauthorized client.

   Withdrawal workflow (aligned with the backend):
   - A seller's request is PENDING (available funds held). An admin
     approves it to PROCESSING, then completes the payout to
     COMPLETED (records the PAYOUT + totalWithdrawn). Rejecting
     returns the held funds to the seller.
   - Valid admin transitions: PENDING -> PROCESSING | REJECTED,
     PROCESSING -> COMPLETED | REJECTED. Illegal transitions throw.

   Backend contract (verified against AdminFinanceController):
   - GET /api/v1/admin/finance/summary (ADMIN)
     -> ApiResponse<AdminFinanceSummaryResponse>
   - GET /api/v1/admin/finance/commissions (ADMIN, paged, newest first)
     -> ApiResponse<PagedResponse<SellerCommissionResponse>>
   - GET /api/v1/admin/finance/withdrawals (ADMIN, paged, newest first)
     -> ApiResponse<PagedResponse<WithdrawalResponse>>
   - PUT /api/v1/admin/finance/withdrawals/{withdrawalId}/status (ADMIN)
     REQUEST:  WithdrawalStatusRequest { status, note? }
     RESPONSE: ApiResponse<WithdrawalResponse>

   AdminFinanceSummaryResponse: { totalCommissionEarned,
     totalCommissionReleased, totalWithdrawn, pendingWithdrawals,
     pendingWithdrawalCount, completedWithdrawalCount }

   The shared wallet models (WITHDRAWAL_STATUS, COMMISSION_STATUS and
   the label helpers) live in sellerWalletService.js; this module
   re-exports them so admin pages import one service. There is no
   local cache: every Finance view reads live.
   ============================================================ */

import { ApiError, http } from "../utils/http.js";
import { API_ENDPOINTS, endpointPath, USER_ROLES } from "../config.js";
import { getCurrentUser } from "./authService.js";
import {
  COMMISSION_STATUS,
  getCommissionStatusLabel,
  getWithdrawalStatusLabel,
  WALLET_TRANSACTION_TYPE,
  WITHDRAWAL_STATUS,
} from "./sellerWalletService.js";

/** Guard every ADMIN finance operation behind an ADMIN session. */
function requireAdmin() {
  if (!getCurrentUser()) {
    throw new ApiError(401, "Please sign in to manage the platform.");
  }
  if (getCurrentUser()?.role !== USER_ROLES.ADMIN) {
    throw new ApiError(403, "Administrator access is required.");
  }
}

/* ------------------------------------------------------------
   Response mapping (backend -> frontend shape)
   ------------------------------------------------------------ */

function mapSummary(data = {}) {
  return {
    totalCommissionEarned: Number(data.totalCommissionEarned) || 0,
    totalCommissionReleased: Number(data.totalCommissionReleased) || 0,
    totalWithdrawn: Number(data.totalWithdrawn) || 0,
    pendingWithdrawals: Number(data.pendingWithdrawals) || 0,
    pendingWithdrawalCount: Number(data.pendingWithdrawalCount) || 0,
    completedWithdrawalCount: Number(data.completedWithdrawalCount) || 0,
  };
}

function mapCommission(item = {}) {
  return {
    id: item.id,
    sellerId: item.sellerId ?? null,
    sellerName: item.sellerName || "",
    orderId: item.orderId ?? null,
    orderNumber: item.orderNumber || "",
    saleAmount: Number(item.saleAmount) || 0,
    commissionAmount: Number(item.commissionAmount) || 0,
    netAmount: Number(item.netAmount) || 0,
    rate: Number(item.rate) || 0,
    currency: item.currency || "",
    status: item.status,
    releasedAt: item.releasedAt || null,
    createdAt: item.createdAt || null,
  };
}

function mapWithdrawal(item = {}) {
  return {
    id: item.id,
    sellerId: item.sellerId ?? null,
    sellerName: item.sellerName || "",
    reference: item.reference || "",
    amount: Number(item.amount) || 0,
    currency: item.currency || "",
    status: item.status,
    bankAccountId: item.bankAccountId ?? null,
    bankName: item.bankName || "",
    accountHolderName: item.accountHolderName || "",
    accountNumber: item.accountNumber || "",
    note: item.note || "",
    processedAt: item.processedAt || null,
    createdAt: item.createdAt || null,
  };
}

/** Pull the page content out of a PagedResponse envelope. */
function pagedContent(envelope) {
  return Array.isArray(envelope?.data?.content) ? envelope.data.content : [];
}

/* ------------------------------------------------------------
   Platform finance reads
   ------------------------------------------------------------ */

/**
 * Platform finance summary. Backend: GET /api/v1/admin/finance/summary.
 * Resolves mapped { totalCommissionEarned, totalCommissionReleased,
 * totalWithdrawn, pendingWithdrawals, pendingWithdrawalCount,
 * completedWithdrawalCount }.
 */
export async function getFinanceSummary() {
  requireAdmin();
  const envelope = await http.get(API_ENDPOINTS.finance.summary);
  return mapSummary(envelope?.data);
}

/** Commission ledger across all sellers. Backend:
 *  GET /api/v1/admin/finance/commissions (paged, newest first). */
export async function getAllCommissions({ page = 0, size = 20 } = {}) {
  requireAdmin();
  const envelope = await http.get(API_ENDPOINTS.finance.commissions, {
    params: { page, size },
  });
  return pagedContent(envelope).map(mapCommission);
}

/** Withdrawal requests across all sellers. Backend:
 *  GET /api/v1/admin/finance/withdrawals (paged, newest first). */
export async function getWithdrawals({ page = 0, size = 20 } = {}) {
  requireAdmin();
  const envelope = await http.get(API_ENDPOINTS.finance.withdrawals, {
    params: { page, size },
  });
  return pagedContent(envelope).map(mapWithdrawal);
}

/* ------------------------------------------------------------
   Withdrawal management
   ------------------------------------------------------------ */

/**
 * Advance a withdrawal through the admin workflow. Backend:
 * PUT /api/v1/admin/finance/withdrawals/{withdrawalId}/status with
 * { status, note? }. Valid targets are PROCESSING | COMPLETED |
 * REJECTED (the backend rejects illegal transitions). Resolves the
 * mapped backend withdrawal; invalid status values are refused
 * locally without a request.
 */
export async function updateWithdrawalStatus(withdrawalId, status, note = "") {
  if (
    status !== WITHDRAWAL_STATUS.PROCESSING &&
    status !== WITHDRAWAL_STATUS.COMPLETED &&
    status !== WITHDRAWAL_STATUS.REJECTED
  ) {
    return null;
  }
  requireAdmin();
  const envelope = await http.put(
    endpointPath(API_ENDPOINTS.finance.updateWithdrawalStatus, { withdrawalId }),
    { status, note: String(note || "").trim() || null }
  );
  return mapWithdrawal(envelope?.data);
}

export {
  COMMISSION_STATUS,
  WITHDRAWAL_STATUS,
  WALLET_TRANSACTION_TYPE,
  getCommissionStatusLabel,
  getWithdrawalStatusLabel,
};
