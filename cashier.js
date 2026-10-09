const app = document.querySelector("#cashier-app");
let currentSession = null;

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
    };
    throw new Error(messages[payload?.error] || "No se pudo completar la solicitud. Código: " + (payload?.error || response.status));
  }
  return payload;
}

function renderLogin(message = "") {
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
  const submit = element("button", "primary", "Crear operación");
  submit.type = "submit";
  form.append(label, amount, submit);
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
        body: JSON.stringify({ amount: value }),
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
  app.append(element("p", "cashier-meta", "Las operaciones se crean como intención. No se inicia ni confirma ningún pago digital."));
}

function renderOperation(operation) {
  const card = element("section", "cashier-operation");
  card.append(element("p", "eyebrow", "Operación creada · sin cobro"));
  card.append(element("h2", "", "$" + Number(operation.amount).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
  card.append(element("p", "cashier-meta", "Referencia: " + operation.reference));
  card.append(element("p", "cashier-meta", "Estado: Pendiente de pago · Pago digital deshabilitado."));
  const customerUrl = new URL("/", location.origin);
  customerUrl.searchParams.set("station", currentSession.stationCode);
  customerUrl.searchParams.set("reference", operation.reference);
  const image = element("img", "cashier-qr");
  image.alt = "QR para consultar la operación. No habilita el pago digital.";
  image.src = "/api/cashier/operations/" + encodeURIComponent(operation.reference) + "/qr";
  card.append(image);
  const actions = element("div", "cashier-actions");
  const open = element("a", "cashier-secondary", "Abrir vista cliente");
  open.href = customerUrl.toString();
  open.target = "_blank";
  open.rel = "noopener noreferrer";
  open.style.display = "grid";
  open.style.placeItems = "center";
  open.style.textDecoration = "none";
  const copy = element("button", "cashier-secondary", "Copiar enlace");
  copy.type = "button";
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(customerUrl.toString());
      copy.textContent = "Enlace copiado";
    } catch {
      showNotice("No se pudo copiar automáticamente. Abrí la vista cliente y copiá el enlace desde el navegador.");
    }
  });
  actions.append(open, copy);
  card.append(actions);
  card.append(element("p", "cashier-success", "No se inició ni confirmó ningún cobro. Indicá al cliente que consulte con el cajero."));
  app.prepend(card);
  const old = app.querySelector(".cashier-operation:not(:first-child)");
  if (old) old.remove();
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
