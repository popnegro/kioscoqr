import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { test } from "node:test";
import { verifyModoWebhook, WebhookNotConfiguredError, ProviderRequestError } from "./reconcile.js";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function signedBody(event: Record<string, unknown>) {
  const protectedHeader = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(event)).toString("base64url");
  const input = Buffer.from(protectedHeader + "." + payload);
  const signature = sign("sha256", input, privateKey).toString("base64url");
  return { id: event.id, status: event.status, external_intention_id: event.external_intention_id, amount: event.amount,
    signature: { protected: protectedHeader, payload, signature } };
}

test("MODO notification fails closed when verification key is missing", () => {
  const previous = process.env.MODO_WEBHOOK_PUBLIC_KEY;
  delete process.env.MODO_WEBHOOK_PUBLIC_KEY;
  try {
    assert.throws(() => verifyModoWebhook({}), WebhookNotConfiguredError);
  } finally {
    if (previous === undefined) delete process.env.MODO_WEBHOOK_PUBLIC_KEY;
    else process.env.MODO_WEBHOOK_PUBLIC_KEY = previous;
  }
});

test("MODO notification verifies signed event and exposes only signed fields", () => {
  const previous = process.env.MODO_WEBHOOK_PUBLIC_KEY;
  process.env.MODO_WEBHOOK_PUBLIC_KEY = publicKey;
  try {
    const event = {
      id: "modo-intent-1",
      status: "ACCEPTED",
      external_intention_id: "f48a6e9e-6cc5-4d0b-9a40-b1b1c2f9f6f0",
      amount: 250.5,
      currency: "ARS",
    };
    const result = verifyModoWebhook(signedBody(event));
    assert.deepEqual(result, event);
  } finally {
    if (previous === undefined) delete process.env.MODO_WEBHOOK_PUBLIC_KEY;
    else process.env.MODO_WEBHOOK_PUBLIC_KEY = previous;
  }
});

test("MODO notification rejects a payload changed after signing", () => {
  const previous = process.env.MODO_WEBHOOK_PUBLIC_KEY;
  process.env.MODO_WEBHOOK_PUBLIC_KEY = publicKey;
  try {
    const body = signedBody({
      id: "modo-intent-1",
      status: "ACCEPTED",
      external_intention_id: "f48a6e9e-6cc5-4d0b-9a40-b1b1c2f9f6f0",
      amount: 250.5,
      currency: "ARS",
    });
    body.signature.payload = Buffer.from(JSON.stringify({
      id: "modo-intent-1", status: "ACCEPTED",
      external_intention_id: "f48a6e9e-6cc5-4d0b-9a40-b1b1c2f9f6f0", amount: 1, currency: "ARS",
    })).toString("base64url");
    assert.throws(() => verifyModoWebhook(body), ProviderRequestError);
  } finally {
    if (previous === undefined) delete process.env.MODO_WEBHOOK_PUBLIC_KEY;
    else process.env.MODO_WEBHOOK_PUBLIC_KEY = previous;
  }
});
