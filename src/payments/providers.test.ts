import assert from "node:assert/strict";
import { test } from "node:test";
import { createProviderQrIntent, isProviderConfigured, ProviderNotConfiguredError } from "./providers.js";

const providerEnvNames = [
  "MERCADOPAGO_ACCESS_TOKEN",
  "MERCADOPAGO_POS_ID",
  "MODO_ACCESS_TOKEN",
  "MODO_MERCHANT_USER_AGENT",
  "MODO_CC_CODE",
  "MODO_PROCESSOR_CODE",
  "MODO_BASE_URL",
  "MODO_WEBHOOK_PUBLIC_KEY",
] as const;

async function withEnv<T>(values: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const name of providerEnvNames) {
    previous.set(name, process.env[name]);
    const value = values[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return await run();
  } finally {
    for (const name of providerEnvNames) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("both providers remain unavailable without server credentials", async () => {
  await withEnv({}, async () => {
    assert.equal(isProviderConfigured("MERCADOPAGO"), false);
    assert.equal(isProviderConfigured("MODO"), false);
  });
});

test("provider QR creation fails closed when Mercado Pago credentials are missing", async () => {
  await withEnv({}, async () => {
    await assert.rejects(
      createProviderQrIntent({ provider: "MERCADOPAGO", reference: "a4fdb647-98aa-4c80-9a5c-57bcbf5c09bb", amount: "100.00" }),
      ProviderNotConfiguredError,
    );
  });
});

test("provider QR creation fails closed when MODO credentials are missing", async () => {
  await withEnv({}, async () => {
    await assert.rejects(
      createProviderQrIntent({ provider: "MODO", reference: "a4fdb647-98aa-4c80-9a5c-57bcbf5c09bb", amount: "100.00" }),
      ProviderNotConfiguredError,
    );
  });
});

test("Mercado Pago adapter requests one dynamic QR with an idempotency key", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  await withEnv({
    MERCADOPAGO_ACCESS_TOKEN: "test-token",
    MERCADOPAGO_POS_ID: "TESTPOS001",
  }, async () => {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response(JSON.stringify({ id: "order-test-1", qr_data: "fake-provider-qr" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    try {
      const intent = await createProviderQrIntent({
        provider: "MERCADOPAGO",
        reference: "a4fdb647-98aa-4c80-9a5c-57bcbf5c09bb",
        amount: "100.00",
      });
      assert.deepEqual(intent, {
        provider: "MERCADOPAGO",
        providerPaymentId: "order-test-1",
        qrData: "fake-provider-qr",
      });
      assert.equal(requestUrl, "https://api.mercadopago.com/v1/orders");
      assert.equal(new Headers(requestInit?.headers).get("X-Idempotency-Key"), "a4fdb647-98aa-4c80-9a5c-57bcbf5c09bb");
      const body = JSON.parse(String(requestInit?.body));
      assert.equal(body.config.qr.mode, "dynamic");
      assert.equal(body.config.qr.external_pos_id, "TESTPOS001");
      assert.equal(body.external_reference, "a4fdb647-98aa-4c80-9a5c-57bcbf5c09bb");
      assert.equal(body.transactions.payments[0].amount, "100.00");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("MODO adapter uses preproduction and a unique external intention ID", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  await withEnv({
    MODO_BASE_URL: "https://merchants.preprod.playdigital.com.ar",
    MODO_ACCESS_TOKEN: "test-token",
    MODO_MERCHANT_USER_AGENT: "KioscoQR QA",
    MODO_CC_CODE: "test-cc",
    MODO_PROCESSOR_CODE: "test-processor",
    MODO_WEBHOOK_PUBLIC_KEY: "test-public-key",
  }, async () => {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response(JSON.stringify({ id: "modo-intent-test-1", qr: "fake-modo-qr" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    try {
      const intent = await createProviderQrIntent({
        provider: "MODO",
        reference: "a4fdb647-98aa-4c80-9a5c-57bcbf5c09bb",
        amount: "100.00",
      });
      assert.deepEqual(intent, {
        provider: "MODO",
        providerPaymentId: "modo-intent-test-1",
        qrData: "fake-modo-qr",
      });
      assert.equal(requestUrl, "https://merchants.preprod.playdigital.com.ar/v2/payment-requests/");
      assert.equal(new Headers(requestInit?.headers).get("User-Agent"), "KioscoQR QA");
      const body = JSON.parse(String(requestInit?.body));
      assert.equal(body.currency, "ARS");
      assert.equal(body.amount, 100);
      assert.equal(body.external_intention_id, "a4fdb647-98aa-4c80-9a5c-57bcbf5c09bb");
      assert.equal(body.cc_code, "test-cc");
      assert.equal(body.processor_code, "test-processor");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
