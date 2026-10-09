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
] as const;

function withoutProviderCredentials<T>(run: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const name of providerEnvNames) {
    previous.set(name, process.env[name]);
    delete process.env[name];
  }
  try {
    return run();
  } finally {
    for (const name of providerEnvNames) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("both providers remain unavailable without server credentials", () => {
  withoutProviderCredentials(() => {
    assert.equal(isProviderConfigured("MERCADOPAGO"), false);
    assert.equal(isProviderConfigured("MODO"), false);
  });
});

test("provider QR creation fails closed when Mercado Pago credentials are missing", async () => {
  await withoutProviderCredentials(async () => {
    await assert.rejects(
      createProviderQrIntent({ provider: "MERCADOPAGO", reference: "a4fdb647-98aa-4c80-9a5c-57bcbf5c09bb", amount: "100.00" }),
      ProviderNotConfiguredError,
    );
  });
});

test("provider QR creation fails closed when MODO credentials are missing", async () => {
  await withoutProviderCredentials(async () => {
    await assert.rejects(
      createProviderQrIntent({ provider: "MODO", reference: "a4fdb647-98aa-4c80-9a5c-57bcbf5c09bb", amount: "100.00" }),
      ProviderNotConfiguredError,
    );
  });
});
