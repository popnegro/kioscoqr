import { verify as verifySignature } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { payments } from "../db/schema.js";
import { getMercadoPagoOrder, ProviderNotConfiguredError, ProviderRequestError } from "./providers.js";

type PaymentRecord = {
  id: string;
  providerPaymentId: string | null;
  externalReference: string;
  amount: string;
  currency: string;
  status: string;
};

export class WebhookNotConfiguredError extends Error {
  constructor() {
    super("WEBHOOK_VERIFICATION_NOT_CONFIGURED");
    this.name = "WebhookNotConfiguredError";
  }
}

function amountMatches(remote: unknown, local: string): boolean {
  if (typeof remote !== "string" && typeof remote !== "number") return false;
  const value = Number(remote);
  return Number.isFinite(value) && value.toFixed(2) === Number(local).toFixed(2);
}

export async function reconcileMercadoPagoPayment(payment: PaymentRecord): Promise<string> {
  if (!db) throw new ProviderNotConfiguredError();
  if (!payment.providerPaymentId) throw new ProviderRequestError();

  const order = await getMercadoPagoOrder(payment.providerPaymentId);
  if (
    order.id !== payment.providerPaymentId ||
    order.external_reference !== payment.externalReference ||
    order.currency !== payment.currency ||
    !amountMatches(order.total_amount, payment.amount)
  ) {
    throw new ProviderRequestError();
  }

  let nextStatus: "PAID" | "EXPIRED" | "CANCELLED" | null = null;
  if (order.status === "processed") nextStatus = "PAID";
  else if (order.status === "expired") nextStatus = "EXPIRED";
  else if (order.status === "canceled") nextStatus = "CANCELLED";

  if (!nextStatus || payment.status !== "PENDING") return payment.status;
  await db.update(payments).set({
    status: nextStatus,
    ...(nextStatus === "PAID" ? { paidAt: new Date() } : {}),
  }).where(and(eq(payments.id, payment.id), eq(payments.status, "PENDING")));
  return nextStatus;
}

export type VerifiedModoEvent = {
  id: string;
  status: string;
  external_intention_id: string;
  amount: number;
  currency?: string;
};

export function verifyModoWebhook(body: unknown): VerifiedModoEvent {
  const publicKeyValue = process.env.MODO_WEBHOOK_PUBLIC_KEY?.trim();
  if (!publicKeyValue) throw new WebhookNotConfiguredError();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ProviderRequestError();

  const wrapper = body as Record<string, unknown>;
  const signature = wrapper.signature;
  if (!signature || typeof signature !== "object" || Array.isArray(signature)) throw new ProviderRequestError();
  const signed = signature as Record<string, unknown>;
  if (
    typeof signed.payload !== "string" ||
    typeof signed.protected !== "string" ||
    typeof signed.signature !== "string"
  ) throw new ProviderRequestError();

  let protectedHeader: Record<string, unknown>;
  let event: unknown;
  try {
    protectedHeader = JSON.parse(Buffer.from(signed.protected, "base64url").toString("utf8"));
    event = JSON.parse(Buffer.from(signed.payload, "base64url").toString("utf8"));
  } catch {
    throw new ProviderRequestError();
  }

  const algorithm = protectedHeader.alg;
  if (algorithm !== "RS256" && algorithm !== "ES256") throw new ProviderRequestError();

  const publicKey = publicKeyValue.replace(/\\n/g, "\n");
  const signingInput = Buffer.from(signed.protected + "." + signed.payload);
  const signatureBytes = Buffer.from(signed.signature, "base64url");
  let valid = false;
  try {
    valid = algorithm === "ES256"
      ? verifySignature("sha256", signingInput, { key: publicKey, dsaEncoding: "ieee-p1363" }, signatureBytes)
      : verifySignature("sha256", signingInput, publicKey, signatureBytes);
  } catch {
    throw new ProviderRequestError();
  }
  if (!valid || !event || typeof event !== "object" || Array.isArray(event)) throw new ProviderRequestError();

  const data = event as Record<string, unknown>;
  if (
    typeof data.id !== "string" ||
    typeof data.status !== "string" ||
    typeof data.external_intention_id !== "string" ||
    (typeof data.amount !== "string" && typeof data.amount !== "number") ||
    !Number.isFinite(Number(data.amount))
  ) throw new ProviderRequestError();

  return {
    id: data.id,
    status: data.status,
    external_intention_id: data.external_intention_id,
    amount: Number(data.amount),
    ...(typeof data.currency === "string" ? { currency: data.currency } : {}),
  };
}

export async function applyVerifiedModoEvent(event: VerifiedModoEvent): Promise<string> {
  if (!db) throw new ProviderNotConfiguredError();
  const rows = await db.select({
    id: payments.id,
    providerPaymentId: payments.providerPaymentId,
    externalReference: payments.externalReference,
    amount: payments.amount,
    currency: payments.currency,
    status: payments.status,
  }).from(payments).where(and(
    eq(payments.provider, "MODO"),
    eq(payments.externalReference, event.external_intention_id),
  )).limit(1);

  const payment = rows[0];
  if (!payment) throw new ProviderRequestError();
  if (
    payment.providerPaymentId !== event.id ||
    !amountMatches(event.amount, payment.amount) ||
    (event.currency !== undefined && event.currency !== payment.currency)
  ) throw new ProviderRequestError();

  // Only a cryptographically verified ACCEPTED event may mark a MODO payment paid.
  if (event.status !== "ACCEPTED" || payment.status !== "PENDING") return payment.status;
  await db.update(payments).set({ status: "PAID", paidAt: new Date() })
    .where(and(eq(payments.id, payment.id), eq(payments.status, "PENDING")));
  return "PAID";
}
