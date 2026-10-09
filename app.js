const content = document.querySelector("#app");
const storeName = document.querySelector("#store-name");
const stationBadge = document.querySelector(".station");
const contactLink = document.querySelector("#contact-link");
const reviewLink = document.querySelector("#review-link");

function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

function renderMessage({ eyebrow, heading, message, status, steps = [], amount = false }) {
  content.replaceChildren();

  const section = node("section", "intro");
  section.append(node("p", "eyebrow", eyebrow));
  const title = node("h2", amount ? "amount-heading" : "", heading);
  title.tabIndex = -1;
  section.append(title, node("p", "muted", message));
  content.append(section);

  if (steps.length) {
    const list = node("ol", "steps");
    for (const step of steps) list.append(node("li", "", step));
    content.append(list);
  }

  if (status) {
    const note = node("div", "status-note");
    note.setAttribute("role", "status");
    note.append(node("span", "", status));
    content.append(note);
  }
}

function clearMerchantLinks() {
  for (const link of [contactLink, reviewLink]) {
    link.hidden = true;
    link.removeAttribute("href");
  }
}

function safeHttpsUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function setMerchantLinks(publicInfo) {
  clearMerchantLinks();
  const number = typeof publicInfo?.whatsappNumber === "string"
    ? publicInfo.whatsappNumber.replace(/\D/g, "")
    : "";
  if (number.length >= 8 && number.length <= 15) {
    contactLink.href = "https://wa.me/" + number;
    contactLink.hidden = false;
  }

  const reviewUrl = safeHttpsUrl(publicInfo?.googleReviewUrl);
  if (reviewUrl && /(^|\.)google\.(com|com\.ar|es|co\.uk)$/i.test(reviewUrl.hostname)) {
    reviewLink.href = reviewUrl.toString();
    reviewLink.hidden = false;
  }
}

function formatOperationStatus(status) {
  const labels = {
    CREATED: "Creada; pendiente de pago",
    PENDING: "Pendiente de verificación",
    PAID: "Pago registrado",
    FAILED: "Fallida",
    CANCELLED: "Cancelada",
    EXPIRED: "Vencida",
    COMPLETED: "Finalizada",
  };
  return labels[status] || "Estado no reconocido";
}

function showHome() {
  clearMerchantLinks();
  storeName.textContent = "KioscoQR";
  stationBadge.textContent = "Cobro presencial";
  document.title = "KioscoQR · Cobro presencial";
  renderMessage({
    eyebrow: "Información",
    heading: "Esperá el QR de tu operación",
    message: "El cajero ingresa el importe y genera un QR dinámico vinculado a esa operación. Escaneá únicamente ese QR para revisar el importe y la referencia.",
    steps: [
      "El cajero ingresa el importe y genera el QR de esa operación.",
      "Escaneá el QR dinámico que te muestra el cajero.",
      "Revisá el importe y la referencia; el cajero debe verificar el pago por un medio confiable antes de darlo por realizado.",
    ],
    status: "La integración de pagos todavía no está habilitada: esta versión no puede verificar ni confirmar pagos digitales.",
  });
}

function showStationError(message) {
  clearMerchantLinks();
  renderMessage({
    eyebrow: "QR no validado",
    heading: "No se pudo identificar el puesto",
    message,
    status: "No ingreses datos ni intentes realizar un pago. Verificá el QR con el comercio.",
  });
}

async function showOperation(reference, publicCode) {
  try {
    const response = await fetch(
      "/api/public/operations/" + encodeURIComponent(reference) + "?station=" + encodeURIComponent(publicCode),
      { headers: { Accept: "application/json" }, cache: "no-store" }
    );
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok || !payload.operation) {
      renderMessage({
        eyebrow: "Operación no validada",
        heading: response.status === 404 ? "No encontramos esta operación" : "No se pudo consultar la operación",
        message: response.status === 404
          ? "La referencia no corresponde a este puesto o ya no está disponible. Verificá los datos con el cajero."
          : "El servicio no pudo validar la referencia. Volvé a intentarlo más tarde.",
        status: "No se realizó ningún cobro. No ingreses datos de pago.",
      });
      return;
    }

    const operation = payload.operation;
    const numericAmount = Number(operation.amount);
    const amountLabel = Number.isFinite(numericAmount)
      ? numericAmount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "No disponible";
    storeName.textContent = payload.tenant?.name || "Comercio";
    stationBadge.textContent = payload.station?.name || "Puesto de cobro";
    document.title = "Operación " + operation.reference + " · KioscoQR";
    setMerchantLinks(payload.public);

    renderMessage({
      eyebrow: "Operación identificada",
      heading: "$" + amountLabel,
      amount: true,
      message: "Comercio: " + (payload.tenant?.name || "No disponible") +
        ". Puesto: " + (payload.station?.name || "No disponible") +
        ". Referencia: " + operation.reference + ". Estado registrado: " + formatOperationStatus(operation.status) + ".",
      status: "Pago digital deshabilitado. Esta pantalla solo consulta la operación: no inicia, verifica ni confirma un cobro. Seguí las indicaciones del cajero.",
      steps: ["Revisá el importe y el comercio.", "Si hay alguna diferencia, no continúes y consultá al cajero."],
    });
  } catch {
    renderMessage({
      eyebrow: "Servicio no disponible",
      heading: "No pudimos consultar la operación",
      message: "Verificá tu conexión e intentá nuevamente.",
      status: "No se realizó ningún cobro. No ingreses datos de pago.",
    });
  }
}

async function resolveRoute() {
  const params = new URLSearchParams(window.location.search);
  const publicCode = params.get("station");
  const reference = params.get("reference");

  if (!publicCode) {
    showHome();
    return;
  }

  if (!/^[A-Za-z0-9_-]{3,64}$/.test(publicCode)) {
    showStationError("El enlace contiene un código de puesto inválido.");
    return;
  }

  try {
    const response = await fetch("/api/public/stations/" + encodeURIComponent(publicCode), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok || !payload.station || !payload.tenant) {
      showStationError(response.status === 404
        ? "El QR no corresponde a un puesto activo. Contactá al comercio."
        : "No pudimos validar el QR. Volvé a intentarlo más tarde.");
      return;
    }

    storeName.textContent = payload.tenant.name;
    stationBadge.textContent = payload.station.name;
    document.title = "Cobro en " + payload.tenant.name + " · KioscoQR";
    setMerchantLinks(payload.public);

    if (reference) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reference)) {
        showStationError("La referencia de operación tiene un formato inválido.");
        return;
      }
      await showOperation(reference, publicCode);
      return;
    }

    renderMessage({
      eyebrow: "Comercio identificado",
      heading: "Pedí tu operación al cajero",
      message: "Este enlace no identifica una operación con importe. Pedile al cajero que genere y te muestre el QR dinámico asociado al cobro.",
      steps: [
        "El cajero ingresa el importe y genera el QR dinámico de la operación.",
        "Escaneá el QR dinámico específico que te muestra el cajero.",
        "Revisá el importe y la referencia; el cajero debe verificar el pago por un medio confiable antes de darlo por realizado.",
      ],
      status: "La integración de pagos todavía no está habilitada: esta versión no puede verificar ni confirmar pagos digitales.",
    });
  } catch {
    showStationError("No pudimos conectar con el servicio. Verificá tu conexión e intentá nuevamente.");
  }
}

resolveRoute();
