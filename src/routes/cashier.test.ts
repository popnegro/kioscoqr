import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import { app } from "../app.js";

let server: Server;
let baseUrl = "";

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port");
  baseUrl = "http://127.0.0.1:" + address.port;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("cashier session fails closed when station credentials are not configured", async () => {
  const previous = process.env.CASHIER_STATION_TOKENS;
  delete process.env.CASHIER_STATION_TOKENS;
  try {
    const response = await fetch(baseUrl + "/api/cashier/session");
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: "CASHIER_AUTH_NOT_CONFIGURED" });
  } finally {
    if (previous === undefined) delete process.env.CASHIER_STATION_TOKENS;
    else process.env.CASHIER_STATION_TOKENS = previous;
  }
});

test("cashier login rejects cross-origin requests", async () => {
  const previous = process.env.CASHIER_STATION_TOKENS;
  process.env.CASHIER_STATION_TOKENS = JSON.stringify({ "KSM-CAJA-01": "x".repeat(48) });
  try {
    const response = await fetch(baseUrl + "/api/cashier/session", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.example" },
      body: JSON.stringify({ stationCode: "KSM-CAJA-01", token: "x".repeat(48) }),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { ok: false, error: "ORIGIN_NOT_ALLOWED" });
  } finally {
    if (previous === undefined) delete process.env.CASHIER_STATION_TOKENS;
    else process.env.CASHIER_STATION_TOKENS = previous;
  }
});

test("cashier login rejects invalid station credentials before accessing the database", async () => {
  const previous = process.env.CASHIER_STATION_TOKENS;
  process.env.CASHIER_STATION_TOKENS = JSON.stringify({ "KSM-CAJA-01": "x".repeat(48) });
  try {
    const response = await fetch(baseUrl + "/api/cashier/session", {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl },
      body: JSON.stringify({ stationCode: "KSM-CAJA-01", token: "wrong-token" }),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: "UNAUTHORIZED" });
  } finally {
    if (previous === undefined) delete process.env.CASHIER_STATION_TOKENS;
    else process.env.CASHIER_STATION_TOKENS = previous;
  }
});

test("cashier login rejects stations without an explicitly configured secret", async () => {
  const previous = process.env.CASHIER_STATION_TOKENS;
  process.env.CASHIER_STATION_TOKENS = JSON.stringify({ "KSM-CAJA-01": "x".repeat(48) });
  try {
    const response = await fetch(baseUrl + "/api/cashier/session", {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl },
      body: JSON.stringify({ stationCode: "KSM-CAJA-02", token: "x".repeat(48) }),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { ok: false, error: "STATION_AUTH_NOT_CONFIGURED" });
  } finally {
    if (previous === undefined) delete process.env.CASHIER_STATION_TOKENS;
    else process.env.CASHIER_STATION_TOKENS = previous;
  }
});


test("cashier payment status endpoint fails closed without an authenticated session", async () => {
  const previous = process.env.CASHIER_STATION_TOKENS;
  delete process.env.CASHIER_STATION_TOKENS;
  try {
    const response = await fetch(baseUrl + "/api/cashier/operations/f48a6e9e-6cc5-4d0b-9a40-b1b1c2f9f6f0/status");
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: "CASHIER_AUTH_NOT_CONFIGURED" });
  } finally {
    if (previous === undefined) delete process.env.CASHIER_STATION_TOKENS;
    else process.env.CASHIER_STATION_TOKENS = previous;
  }
});
