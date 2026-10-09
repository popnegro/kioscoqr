const form = document.querySelector("#payment-form");
const amount = document.querySelector("#amount");
const content = document.querySelector("#app");
const storeName = document.querySelector("#store-name");
const stationBadge = document.querySelector(".station");

function formatAmount(value) {
  const normalized = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function renderMessage({ eyebrow, heading, message, status }) {
  content.replaceChildren();

  const section = document.createElement("section");
  section.className = "intro";

  const label = document.createElement("p");
  label.className = "eyebrow";
  label.textContent = eyebrow;

  const title = document.createElement("h2");
  title.textContent = heading;

  const description = document.createElement("p");
  description.className = "muted";
  description.textContent = message;

  section.append(label, title, description);
  content.append(section);

  if (status) {
    const note = document.createElement("div");
    note.className = "trust";
    const statusText = document.createElement("span");
    statusText.textContent = status;
    note.append(statusText);
    content.append(note);
  }
}

function showStationError(message) {
  renderMessage({
    eyebrow: "QR no validado",
    heading: "No se pudo identificar el puesto",
    message,
    status: "No ingreses datos ni intentes realizar un pago.",
  });
  form.remove();
}

async function showOperation(reference, publicCode) {
  try {
    const response = await fetch(
      "/api/public/operations/" + encodeURIComponent(reference) + "?station=" + encodeURIComponent(publicCode),
      { headers: { Accept: "application/json" } }
    );
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok || !payload.operation) {
      renderMessage({
        eyebrow: "Operación no validada",
        heading: response.status === 404 ? "No encontramos esta operación" : "No se pudo consultar la operación",
        message: response.status === 404
          ? "La referencia no corresponde a este puesto o la operación no está disponible. Verificá la referencia con el cajero."
          : "El servicio no pudo validar la referencia. Volvé a intentarlo más tarde.",
        status: "No se realizó ningún cobro. No ingreses datos de pago.",
      });
      form.remove();
      return;
    }

    const operation = payload.operation;
    const numericAmount = Number(operation.amount);
    const amountLabel = Number.isFinite(numericAmount)
      ? numericAmount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "No disponible";

    renderMessage({
      eyebrow: "Operación identificada",
      heading: "$" + amountLabel,
      message: "Referencia: " + operation.reference + ". Estado: " + operation.status + ".",
      status: operation.paymentEnabled === false
        ? "Pago digital no habilitado. Esta operación no inició ni confirmó ningún cobro; seguí las indicaciones del cajero."
        : "Consultá el estado con el cajero antes de continuar.",
    });
    form.remove();
  } catch {
    renderMessage({
      eyebrow: "Servicio no disponible",
      heading: "No pudimos consultar la operación",
      message: "Verificá tu conexión e intentá nuevamente.",
      status: "No se realizó ningún cobro. No ingreses datos de pago.",
    });
    form.remove();
  }
}

async function resolvePrintedQrStation() {
  const params = new URLSearchParams(window.location.search);
  const publicCode = params.get("station");

  // The unparameterized homepage remains an explicitly labeled visual demo.
  if (!publicCode) return;

  const submitButton = form.querySelector("button[type='submit']");
  if (submitButton) submitButton.disabled = true;

  try {
    const response = await fetch("/api/public/stations/" + encodeURIComponent(publicCode), {
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok || !payload.station || !payload.tenant) {
      showStationError(
        response.status === 404
          ? "El QR no corresponde a un puesto activo. Contactá al comercio."
          : "No pudimos validar el QR. Volvé a intentarlo más tarde."
      );
      return;
    }

    storeName.textContent = payload.tenant.name;
    stationBadge.textContent = payload.station.name;
    document.title = "Cobro en " + payload.tenant.name + " · KioscoQR";

    const reference = params.get("reference");
    if (reference) {
      await showOperation(reference, publicCode);
      return;
    }

    // A printed station QR identifies the checkout only. It must not let a
    // customer choose the amount or simulate a payment confirmation.
    renderMessage({
      eyebrow: "Comercio identificado",
      heading: "Solicitá la operación al cajero",
      message: "Este QR identifica el puesto de cobro. El pago digital todavía no está habilitado; el cajero debe generar una operación antes de que puedas continuar.",
      status: "No se realizó ningún cobro. No ingreses datos de pago.",
    });
    form.remove();
  } catch {
    showStationError("No pudimos conectar con el servicio. Verificá tu conexión e intentá nuevamente.");
  } finally {
    if (submitButton && submitButton.isConnected) submitButton.disabled = false;
  }
}

resolvePrintedQrStation();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = formatAmount(amount.value);

  if (value <= 0) {
    amount.setAttribute("aria-invalid", "true");
    amount.focus();
    return;
  }

  amount.removeAttribute("aria-invalid");
  content.innerHTML = `
    <section class="intro">
      <p class="eyebrow">Demo visual</p>
      <h2>$${value.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</h2>
      <p class="muted">${storeName.textContent} · ${stationBadge.textContent}</p>
    </section>
    <div class="trust"><span>Esta es una demostración. No se crea ni se confirma ningún pago.</span></div>
    <button class="primary" id="back" type="button">Volver</button>
  `;

  document.querySelector("#back").addEventListener("click", () => window.location.reload());
});
