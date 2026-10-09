export type PaymentProvider = "MERCADOPAGO" | "MODO";

export type ProviderQrIntent = {
  provider: PaymentProvider;
  providerPaymentId: string;
  qrData: string;
};

export class ProviderNotConfiguredError extends Error {
  constructor() {
    super("PROVIDER_NOT_CONFIGURED");
    this.name = "ProviderNotConfiguredError";
  }
}

export class ProviderRequestError extends Error {
  constructor() {
    super("PROVIDER_REQUEST_FAILED");
    this.name = "ProviderRequestError";
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new ProviderNotConfiguredError();
  return value;
}

async function providerFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ProviderRequestError();
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) throw new ProviderRequestError();
  const payload: unknown = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ProviderRequestError();
  }
  return payload as Record<string, unknown>;
}

export function isProviderConfigured(provider: PaymentProvider): boolean {
  if (provider === "MERCADOPAGO") {
    return Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() && process.env.MERCADOPAGO_POS_ID?.trim());
  }
  return Boolean(
    process.env.MODO_ACCESS_TOKEN?.trim() &&
    process.env.MODO_MERCHANT_USER_AGENT?.trim() &&
    process.env.MODO_CC_CODE?.trim() &&
    process.env.MODO_PROCESSOR_CODE?.trim() &&
    process.env.MODO_BASE_URL?.trim() &&
    process.env.MODO_WEBHOOK_PUBLIC_KEY?.trim(),
  );
}

export async function createProviderQrIntent(input: {
  provider: PaymentProvider;
  reference: string;
  amount: string;
}): Promise<ProviderQrIntent> {
  if (!isProviderConfigured(input.provider)) throw new ProviderNotConfiguredError();

  if (input.provider === "MERCADOPAGO") {
    const token = requiredEnv("MERCADOPAGO_ACCESS_TOKEN");
    const posId = requiredEnv("MERCADOPAGO_POS_ID");
    const response = await providerFetch("https://api.mercadopago.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        "X-Idempotency-Key": input.reference,
      },
      body: JSON.stringify({
        type: "qr",
        total_amount: input.amount,
        description: "Compra en kiosco",
        external_reference: input.reference,
        expiration_time: "PT15M",
        config: { qr: { external_pos_id: posId, mode: "dynamic" } },
        transactions: { payments: [{ amount: input.amount }] },
      }),
      signal: AbortSignal.timeout(10000),
    });
    const payload = await readJson(response);
    if (typeof payload.id !== "string" || typeof payload.qr_data !== "string" || !payload.qr_data) {
      throw new ProviderRequestError();
    }
    return { provider: input.provider, providerPaymentId: payload.id, qrData: payload.qr_data };
  }

  const token = requiredEnv("MODO_ACCESS_TOKEN");
  const userAgent = requiredEnv("MODO_MERCHANT_USER_AGENT");
  const ccCode = requiredEnv("MODO_CC_CODE");
  const processorCode = requiredEnv("MODO_PROCESSOR_CODE");
  const baseUrl = requiredEnv("MODO_BASE_URL").replace(/\/$/, "");
  if (!/^https:\/\/merchants\.(preprod\.)?playdigital\.com\.ar$/.test(baseUrl)) {
    throw new ProviderNotConfiguredError();
  }

  const response = await providerFetch(baseUrl + "/v2/payment-requests/", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      "User-Agent": userAgent,
    },
    body: JSON.stringify({
      description: "Compra en kiosco",
      amount: Number(input.amount),
      currency: "ARS",
      cc_code: ccCode,
      processor_code: processorCode,
      external_intention_id: input.reference,
      expiration_date: new Date(Date.now() + 10 * 60 * 1000).toISOString().slice(0, 19),
    }),
    signal: AbortSignal.timeout(10000),
  });
  const payload = await readJson(response);
  if (typeof payload.id !== "string" || typeof payload.qr !== "string" || !payload.qr) {
    throw new ProviderRequestError();
  }
  return { provider: input.provider, providerPaymentId: payload.id, qrData: payload.qr };
}


export async function getMercadoPagoOrder(orderId: string): Promise<Record<string, unknown>> {
  if (!isProviderConfigured("MERCADOPAGO")) throw new ProviderNotConfiguredError();
  if (!/^ORD[A-Za-z0-9]{26}$/.test(orderId)) throw new ProviderRequestError();
  const token = requiredEnv("MERCADOPAGO_ACCESS_TOKEN");
  const response = await providerFetch("https://api.mercadopago.com/v1/orders/" + encodeURIComponent(orderId), {
    method: "GET",
    headers: { Authorization: "Bearer " + token, Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  const payload = await readJson(response);
  if (payload.id !== orderId || typeof payload.status !== "string") throw new ProviderRequestError();
  return payload;
}
