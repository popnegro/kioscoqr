const app = document.querySelector("#cashier-app");
let currentSession = null;
let statusPollTimer = null;

function stopStatusPolling() {
  if (statusPollTimer !== null) clearTimeout(statusPollTimer);
  statusPollTimer = null;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showNotice(message, type = "error") {
  const notice = element("p", type === "success" ? "cashier-success" : "cashier-error", message);
  app.prepend(notice);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: { Accept: "application/json", ...(options.headers || {}) },
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const messages = {
      CASHIER_AUTH_NOT_CONFIGURED: "El acceso de caja todavía no está configurado en el servidor.",
      STATION_AUTH_NOT_CONFIGURED: "Este puesto todavía no tiene credenciales configuradas en el servidor.",
      UNAUTHORIZED: "Token de caja incorrecto.",
      SESSION_REQUIRED: "La sesión venció. Iniciá sesión nuevamente.",
      STATION_NOT_FOUND: "El código no corresponde a un puesto activo.",
      STATION_NOT_ACTIVE: "El puesto está deshabilitado. Contactá al administrador.",
      INVALID_AMOUNT: "Ingresá un importe mayor que cero con hasta dos decimales.",
      NO_ACTIVE_CASHIER: "No hay un cajero activo asociado al comercio.",
      INVALID_PROVIDER: "Seleccioná Mercado Pago o MODO.",
      PROVIDER_NOT_CONFIGURED: "El proveedor seleccionado todavía no tiene todas las credenciales y parámetros comerciales configurados. No se creó ningún QR.",
      PROVIDER_REQUEST_FAILED: "El proveedor rechazó o no pudo completar la solicitud. No se mostró ningún QR; verificá el panel del proveedor antes de reintentar.",
      PROVIDER_STATUS_UNAVAILABLE: "No se pudo verificar el estado con el proveedor. No confirmes el pago; el sistema volverá a consultar.",
      OPERATION_STATUS_UNAVAILABLE: "No se pudo consultar el estado de la operación.",
      MODO_NOTIFICATION_INVALID: "La notificación de pago de MODO no superó la verificación de seguridad."
    };
    throw new Error(messages[payload?.error] || "No se pudo completar la solicitud. Código: " + (payload?.error || response.status));
  }
  return payload;
}

function renderLogin(message = "") {
  stopStatusPolling();
  currentSession = null;
  app.replaceChildren();
  app.append(element("p", "eyebrow", "Acceso restringido"));
  app.append(element("h2", "", "Ingresar a caja"));
  app.append(element("p", "muted", "La sesión queda en una cookie HttpOnly de corta duración. El token no se guarda en el navegador."));
  const form = element("form", "cashier-form");
  const stationLabel = element("label", "", "Código público del puesto");
  stationLabel.htmlFor = "station-code";
  const station = element("input");
  station.id = "station-code";
  station.name = "stationCode";
  station.autocomplete = "off";
  station.required = true;
  station.minLength = 3;
  station.maxLength = 64;
  station.value = new URLSearchParams(location.search).get("station") || "";
  const tokenLabel = element("label", "", "Token de caja");
  tokenLabel.htmlFor = "cashier-token";
  const token = element("input");
  token.id = "cashier-token";
  token.name = "token";
  token.type = "password";
  token.autocomplete = "current-password";
  token.required = true;
  token.minLength = 20;
  const submit = element("button", "primary", "Iniciar sesión");
  submit.type = "submit";
  form.append(stationLabel, station, tokenLabel, token, submit);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      await request("/api/cashier/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stationCode: station.value.trim(), token: token.value }),
      });
      token.value = "";
      await loadSession();
    } catch (error) {
      showNotice(error.message);
      token.value = "";
      token.focus();
    } finally {
      submit.disabled = false;
    }
  });
  app.append(form);
  if (message) showNotice(message);
}

function renderPanel(session) {
  stopStatusPolling();
  currentSession = session;
  app.replaceChildren();
  app.append(element("p", "eyebrow", "Sesión de caja activa"));
  app.append(element("h2", "", session.tenantName));
  app.append(element("p", "muted", session.stationName + " · " + session.stationCode));
  const logout = element("button", "cashier-secondary", "Cerrar sesión");
  logout.type = "button";
  logout.addEventListener("click", async () => {
    try {
      await request("/api/cashier/session/logout", { method: "POST" });
    } finally {
      renderLogin("Sesión cerrada.");
    }
  });
  const form = element("form", "cashier-form");
  const providerLabel = element("label", "", "Proveedor de pago");
  providerLabel.htmlFor = "payment-provider";
  const provider = element("select");
  provider.id = "payment-provider";
  provider.name = "provider";
  provider.required = true;
  const providerPlaceholder = element("option", "", "Seleccionar proveedor");
  providerPlaceholder.value = "";
  providerPlaceholder.disabled = true;
  providerPlaceholder.selected = true;
  provider.append(providerPlaceholder);
  for (const [value, labelText] of [["MERCADOPAGO", "Mercado Pago · requiere credenciales y POS"], ["MODO", "MODO · requiere credenciales y configuración comercial"]]) {
    const option = element("option", "", labelText);
    option.value = value;
    option.disabled = true;
    provider.append(option);
  }
  const label = element("label", "", "Importe a cobrar (ARS)");
  label.htmlFor = "operation-amount";
  const amount = element("input");
  amount.id = "operation-amount";
  amount.name = "amount";
  amount.type = "number";
  amount.inputMode = "decimal";
  amount.min = "0.01";
  amount.max = "9999999999.99";
  amount.step = "0.01";
  amount.placeholder = "0,00";
  amount.required = true;
  const submit = element("button", "primary", "Generar QR dinámico");
  submit.type = "submit";
  form.append(providerLabel, provider, label, amount, submit);
  form.append(element("p", "cashier-meta", "Cada operación utiliza un solo proveedor y su QR propio. No cambies de proveedor para una misma operación."));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = Number(amount.value);
    if (!Number.isFinite(value) || value <= 0 || Math.round(value * 100) / 100 !== value) {
      showNotice("Ingresá un importe válido con hasta dos decimales.");
      return;
    }
    submit.disabled = true;
    try {
      const result = await request("/api/cashier/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value, provider: provider.value }),
      });
      renderOperation(result.operation);
    } catch (error) {
      showNotice(error.message);
      if (error.message.includes("sesión")) renderLogin(error.message);
    } finally {
      submit.disabled = false;
    }
  });
  app.append(form, logout);
  void loadProviderAvailability(provider);
  app.append(element("p", "cashier-meta", "El QR se emite por el proveedor seleccionado. La verificación del estado todavía debe completarse antes de confirmar un pago."));
}

async function loadProviderAvailability(select) {
  try {
    const payload = await request("/api/cashier/providers");
    for (const item of payload.providers || []) {
      const option = Array.from(select.options).find((candidate) => candidate.value === item.id);
      if (!option) continue;
      option.disabled = !item.configured;
      option.textContent = item.configured
        ? item.label
        : item.label + " · no configurado";
    }
    if (!(payload.providers || []).some((item) => item.configured)) {
      showNotice("Mercado Pago y MODO todavía requieren configuración en el servidor. No se pueden generar QR hasta completar las credenciales.");
    }
  } catch (error) {
    showNotice(error.message);
  }
}

function renderOperation(operation) {
  stopStatusPolling();
  const card = element("section", "cashier-operation");
  const providerName = operation.provider === "MERCADOPAGO" ? "Mercado Pago" : "MODO";
  card.append(element("p", "eyebrow", "QR dinámico de " + providerName));
  card.append(element("h2", "", "$" + Number(operation.amount).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
  card.append(element("p", "cashier-meta", "Referencia: " + operation.reference));
  const status = element("p", "cashier-status", "Estado: PENDIENTE · verificando con el servidor");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  card.append(status);
  const image = element("img", "cashier-qr");
  image.alt = "QR de pago emitido por " + providerName + " para la operación " + operation.reference;
  image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(operation.qrSvg);
  card.append(image);
  card.append(element("p", "cashier-meta", operation.provider === "MERCADOPAGO"
    ? "El estado se consulta directamente a Mercado Pago desde el servidor."
    : "El estado se actualiza cuando llega una notificación firmada y verificada de MODO."));
  card.append(element("p", "cashier-error", "No confirmes un pago por el escaneo o una captura. Solo el estado verificado por el servidor confirma la acreditación."));
  const previous = app.querySelector(".cashier-operation");
  if (previous) previous.remove();
  app.prepend(card);

  let attempts = 0;
  const poll = async () => {
    attempts += 1;
    try {
      const result = await request("/api/cashier/operations/" + encodeURIComponent(operation.reference) + "/status");
      const current = result.operation.status;
      status.textContent = "Estado verificado: " + current;
      if (current === "PAID") {
        status.className = "cashier-success";
        status.textContent = "PAGO ACREDITADO · confirmado por el servidor";
        return;
      }
      if (current === "EXPIRED" || current === "CANCELLED") {
        status.className = "cashier-error";
        status.textContent = "Operación finalizada: " + current;
        return;
      }
      if (attempts >= 180) {
        status.textContent = "Estado: PENDING · se detuvo la consulta automática; verificá el panel del proveedor.";
        return;
      }
    } catch (error) {
      status.textContent = error.message;
      if (error.message.includes("sesión")) {
        renderLogin(error.message);
        return;
      }
      if (attempts >= 180) return;
    }
    statusPollTimer = setTimeout(poll, 5000);
  };
  statusPollTimer = setTimeout(poll, 1000);
}

async function loadSession() {
  try {
    const payload = await request("/api/cashier/session");
    renderPanel(payload.session);
  } catch (error) {
    renderLogin(error.message);
  }
}

loadSession();
