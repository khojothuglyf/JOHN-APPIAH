/* ============================================================
   SELLER WALLET SERVICE - SPRING BOOT BACKEND (via http.js)
   ============================================================
   Powers the seller Finance tab: the wallet ledger (available /
   pending / lifetime earnings), per-order commissions, bank
   accounts and withdrawal requests against the Java / Spring Boot
   settlement backend through the shared HTTP client (http.js).

   Security:
   - The authenticated Supabase access token is sent as
     `Authorization: Bearer ...` by http.js and validated by the
     backend's Supabase JWT bridge - there is no second auth system.
   - The backend derives the seller from the token principal and
     enforces SELLER/ADMIN roles server-side; the browser never
     sends a sellerId or walletId, so ownership cannot be spoofed.

   Money model (aligned with the backend settlement engine):
   - When a payment COMPLETES, the seller's net earnings
     (saleAmount - 10% commission) are credited to the PENDING
     balance. On delivery the commission is RELEASED and the
     earnings move to AVAILABLE.
   - Requesting a withdrawal debits AVAILABLE into a hold. An
     admin approving then completing the withdrawal records the
     final PAYOUT; a rejected/cancelled withdrawal releases the
     held funds back to AVAILABLE. All amounts are storefront-free:
     every balance and transaction is displayed in the wallet's own
     currency as reported by the backend.

   Backend contract (verified against SellerWalletController):
   - GET    /api/v1/wallet                        (SELLER/ADMIN)
     -> ApiResponse<WalletResponse>
   - GET    /api/v1/wallet/transactions           (paged, newest first)
     -> ApiResponse<PagedResponse<WalletTransactionResponse>>
   - GET    /api/v1/wallet/commissions            (paged, newest first)
     -> ApiResponse<PagedResponse<SellerCommissionResponse>>
   - GET    /api/v1/wallet/bank-accounts          -> ApiResponse<List<BankAccountResponse>>
   - POST   /api/v1/wallet/bank-accounts          (201) BankAccountRequest
   - PUT    /api/v1/wallet/bank-accounts/{bankAccountId}  BankAccountRequest
   - DELETE /api/v1/wallet/bank-accounts/{bankAccountId}
   - POST   /api/v1/wallet/withdrawals            (201)
     REQUEST:  WithdrawalRequest { amount, bankAccountId? }
     RESPONSE: ApiResponse<WithdrawalResponse>
   - GET    /api/v1/wallet/withdrawals            (paged, newest first)
   - POST   /api/v1/wallet/withdrawals/{withdrawalId}/cancel

   WalletResponse: { id, availableBalance, pendingBalance, totalEarned,
     totalWithdrawn, currency, updatedAt }
   WalletTransactionResponse: { id, reference, type, amount,
     balanceAfter, description, orderId, commissionId, withdrawalId,
     createdAt }
   SellerCommissionResponse: { id, orderId, orderNumber, saleAmount,
     commissionAmount, netAmount, rate, currency, status, releasedAt,
     createdAt }
   BankAccountResponse: { id, bankName, accountHolderName, accountNumber,
     swiftCode, country, isDefault, createdAt }
   WithdrawalResponse: { id, reference, amount, currency, status,
     bankAccountId, bankName, accountHolderName, accountNumber, note,
     processedAt, createdAt }

   The enum values (WithdrawalStatus, CommissionStatus,
   WalletTransactionType) match the backend exactly. There is no local
   cache: every Finance view reads live so the ledger is never stale.
   ============================================================ */

import { ApiError, http } from "../utils/http.js";
import { API_ENDPOINTS, endpointPath } from "../config.js";
import { getCurrentUser } from "./authService.js";

/** Platform commission rate applied to a seller's sale (backend
 *  default app.settlement.commission-rate = 0.10). Shown in the UI
 *  for transparency; the backend remains authoritative. */
export const COMMISSION_RATE = 0.1;

/** Smallest amount a seller may request in one withdrawal (backend
 *  default app.settlement.min-withdrawal-amount = 10). */
export const MIN_WITHDRAWAL_AMOUNT = 10;

/** Withdrawal lifecycle (aligned with the backend WithdrawalStatus). */
export const WITHDRAWAL_STATUS = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
};

/** Commission lifecycle (aligned with the backend CommissionStatus). */
export const COMMISSION_STATUS = {
  PENDING: "PENDING",
  RELEASED: "RELEASED",
  REVERSED: "REVERSED",
};

/** Ledger entry types (aligned with the backend WalletTransactionType). */
export const WALLET_TRANSACTION_TYPE = {
  COMMISSION_CREDIT: "COMMISSION_CREDIT",
  COMMISSION_RELEASE: "COMMISSION_RELEASE",
  COMMISSION_REVERSAL: "COMMISSION_REVERSAL",
  WITHDRAWAL_HOLD: "WITHDRAWAL_HOLD",
  WITHDRAWAL_RELEASE: "WITHDRAWAL_RELEASE",
  PAYOUT: "PAYOUT",
};

/** Human-readable label for a withdrawal status. */
export function getWithdrawalStatusLabel(status) {
  const labels = {
    [WITHDRAWAL_STATUS.PENDING]: "Pending",
    [WITHDRAWAL_STATUS.PROCESSING]: "Processing",
    [WITHDRAWAL_STATUS.COMPLETED]: "Paid out",
    [WITHDRAWAL_STATUS.REJECTED]: "Rejected",
    [WITHDRAWAL_STATUS.CANCELLED]: "Cancelled",
  };
  return labels[status] || status || "Unknown";
}

/** Human-readable label for a commission status. */
export function getCommissionStatusLabel(status) {
  const labels = {
    [COMMISSION_STATUS.PENDING]: "Pending",
    [COMMISSION_STATUS.RELEASED]: "Released",
    [COMMISSION_STATUS.REVERSED]: "Reversed",
  };
  return labels[status] || status || "Unknown";
}

/** Human-readable label for a wallet transaction type. */
export function getTransactionTypeLabel(type) {
  const labels = {
    [WALLET_TRANSACTION_TYPE.COMMISSION_CREDIT]: "Commission earned",
    [WALLET_TRANSACTION_TYPE.COMMISSION_RELEASE]: "Released to available",
    [WALLET_TRANSACTION_TYPE.COMMISSION_REVERSAL]: "Commission reversed",
    [WALLET_TRANSACTION_TYPE.WITHDRAWAL_HOLD]: "Withdrawal requested",
    [WALLET_TRANSACTION_TYPE.WITHDRAWAL_RELEASE]: "Funds returned",
    [WALLET_TRANSACTION_TYPE.PAYOUT]: "Payout",
  };
  return labels[type] || type || "Transaction";
}

/** Sign of a ledger amount for display: credits are positive, debits
 *  negative. The backend stores positive magnitudes and the type
 *  encodes the direction. */
export function transactionAmountSigned(type, amount) {
  const debitTypes = [
    WALLET_TRANSACTION_TYPE.COMMISSION_REVERSAL,
    WALLET_TRANSACTION_TYPE.WITHDRAWAL_HOLD,
    WALLET_TRANSACTION_TYPE.PAYOUT,
  ];
  const value = Number(amount) || 0;
  return debitTypes.includes(type) ? -value : value;
}

/** True when a signed-in session exists (even a token-less preview). */
function isSignedIn() {
  return Boolean(getCurrentUser());
}

/** Guard every wallet operation behind a signed-in session. */
function requireSignedIn() {
  if (!isSignedIn()) {
    throw new ApiError(401, "Please sign in to manage your wallet.");
  }
}

/* ------------------------------------------------------------
   Response mapping (backend -> frontend shape)
   ------------------------------------------------------------ */

function mapWallet(data = {}) {
  return {
    id: data.id ?? null,
    availableBalance: Number(data.availableBalance) || 0,
    pendingBalance: Number(data.pendingBalance) || 0,
    totalEarned: Number(data.totalEarned) || 0,
    totalWithdrawn: Number(data.totalWithdrawn) || 0,
    currency: data.currency || "",
    updatedAt: data.updatedAt || null,
  };
}

function mapTransaction(item = {}) {
  return {
    id: item.id,
    reference: item.reference || "",
    type: item.type,
    amount: Number(item.amount) || 0,
    balanceAfter: Number(item.balanceAfter) || 0,
    description: item.description || "",
    orderId: item.orderId ?? null,
    commissionId: item.commissionId ?? null,
    withdrawalId: item.withdrawalId ?? null,
    createdAt: item.createdAt || null,
  };
}

function mapCommission(item = {}) {
  return {
    id: item.id,
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

function mapBankAccount(item = {}) {
  return {
    id: item.id,
    bankName: item.bankName || "",
    accountHolderName: item.accountHolderName || "",
    accountNumber: item.accountNumber || "",
    swiftCode: item.swiftCode || "",
    country: item.country || "",
    isDefault: Boolean(item.isDefault),
    createdAt: item.createdAt || null,
  };
}

function mapWithdrawal(item = {}) {
  return {
    id: item.id,
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
   Wallet & ledger
   ------------------------------------------------------------ */

/** The seller's wallet. Backend: GET /api/v1/wallet. A brand-new
 *  seller gets a zeroed wallet from the backend. */
export async function getWallet() {
  requireSignedIn();
  const envelope = await http.get(API_ENDPOINTS.wallet.get);
  return mapWallet(envelope?.data);
}

/** Latest wallet transactions. Backend: GET /api/v1/wallet/transactions. */
export async function getWalletTransactions({ page = 0, size = 20 } = {}) {
  requireSignedIn();
  const envelope = await http.get(API_ENDPOINTS.wallet.transactions, {
    params: { page, size },
  });
  return pagedContent(envelope).map(mapTransaction);
}

/** Per-order commissions. Backend: GET /api/v1/wallet/commissions. */
export async function getCommissions({ page = 0, size = 20 } = {}) {
  requireSignedIn();
  const envelope = await http.get(API_ENDPOINTS.wallet.commissions, {
    params: { page, size },
  });
  return pagedContent(envelope).map(mapCommission);
}

/* ------------------------------------------------------------
   Bank accounts
   ------------------------------------------------------------ */

/** The seller's saved bank accounts (default first where flagged). */
export async function getBankAccounts() {
  requireSignedIn();
  const envelope = await http.get(API_ENDPOINTS.wallet.bankAccounts);
  return (Array.isArray(envelope?.data) ? envelope.data : []).map(mapBankAccount);
}

/**
 * Save a bank account. Backend: POST /api/v1/wallet/bank-accounts.
 * The first saved account becomes the default automatically; the
 * backend clears the previous default when isDefault is true.
 */
export async function addBankAccount(data = {}) {
  requireSignedIn();
  const envelope = await http.post(
    API_ENDPOINTS.wallet.addBankAccount,
    toBankAccountRequest(data)
  );
  return mapBankAccount(envelope?.data);
}

/**
 * Update a bank account. Backend:
 * PUT /api/v1/wallet/bank-accounts/{bankAccountId}.
 */
export async function updateBankAccount(bankAccountId, data = {}) {
  requireSignedIn();
  const envelope = await http.put(
    endpointPath(API_ENDPOINTS.wallet.updateBankAccount, { bankAccountId }),
    toBankAccountRequest(data)
  );
  return mapBankAccount(envelope?.data);
}

/** Delete a saved bank account. Backend: DELETE /api/v1/wallet/bank-accounts/{id}. */
export async function deleteBankAccount(bankAccountId) {
  requireSignedIn();
  await http.delete(
    endpointPath(API_ENDPOINTS.wallet.deleteBankAccount, { bankAccountId })
  );
  return true;
}

/** Page payload -> BankAccountRequest. */
function toBankAccountRequest(data = {}) {
  return {
    bankName: String(data.bankName || "").trim(),
    accountHolderName: String(data.accountHolderName || "").trim(),
    accountNumber: String(data.accountNumber || "").trim(),
    swiftCode: String(data.swiftCode || "").trim() || null,
    country: String(data.country || "").trim() || null,
    isDefault: Boolean(data.isDefault),
  };
}

/* ------------------------------------------------------------
   Withdrawals
   ------------------------------------------------------------ */

/**
 * Request a withdrawal of AVAILABLE funds. Backend:
 * POST /api/v1/wallet/withdrawals with { amount, bankAccountId? }.
 * When bankAccountId is omitted the backend uses the default bank
 * account. Backend rejections (below the minimum, over the available
 * balance, unknown bank account) throw.
 */
export async function requestWithdrawal({ amount, bankAccountId = null } = {}) {
  requireSignedIn();
  const envelope = await http.post(API_ENDPOINTS.wallet.requestWithdrawal, {
    amount: Number(amount),
    bankAccountId: bankAccountId != null ? Number(bankAccountId) : null,
  });
  return mapWithdrawal(envelope?.data);
}

/** The seller's withdrawal history. Backend: GET /api/v1/wallet/withdrawals. */
export async function getWithdrawals({ page = 0, size = 20 } = {}) {
  requireSignedIn();
  const envelope = await http.get(API_ENDPOINTS.wallet.withdrawals, {
    params: { page, size },
  });
  return pagedContent(envelope).map(mapWithdrawal);
}

/**
 * Cancel a PENDING withdrawal, returning its held funds to the wallet.
 * Backend: POST /api/v1/wallet/withdrawals/{withdrawalId}/cancel.
 */
export async function cancelWithdrawal(withdrawalId) {
  requireSignedIn();
  const envelope = await http.post(
    endpointPath(API_ENDPOINTS.wallet.cancelWithdrawal, { withdrawalId })
  );
  return mapWithdrawal(envelope?.data);
}
