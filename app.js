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

function showStationError(message) {
  content.replaceChildren();
  const section = document.createElement("section");
  section.className = "intro";
  const heading = document.createElement("h2");
  heading.textContent = "No se pudo identificar el puesto";
  const description = document.createElement("p");
  description.className = "muted";
  description.textContent = message;
  section.append(heading, description);
  content.append(section);
}

async function resolvePrintedQrStation() {
  const params = new URLSearchParams(window.location.search);
  const publicCode = params.get("station");

  // Keep the unparameterized homepage available as the visual demo.
  // A printed QR must include ?station=PUBLIC_CODE to resolve a real station.
  if (!publicCode) return;

  form.querySelector("button[type='submit']").disabled = true;
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
      form.remove();
      return;
    }

    storeName.textContent = payload.tenant.name;
    stationBadge.textContent = payload.station.name;
    document.title = "Pagar en " + payload.tenant.name + " · KioscoQR";
  } catch {
    showStationError("No pudimos conectar con el servicio. Verificá tu conexión e intentá nuevamente.");
    form.remove();
    return;
  } finally {
    const submitButton = form.querySelector("button[type='submit']");
    if (submitButton) submitButton.disabled = false;
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
      <p class="eyebrow">Revisá antes de pagar</p>
      <h2>$${value.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</h2>
      <p class="muted">${storeName.textContent} · ${stationBadge.textContent}</p>
    </section>
    <div class="payment-form">
      <button class="primary" id="confirm" type="button">Confirmar pago</button>
      <button class="primary" id="back" type="button" style="margin-top:10px;background:#e2e8f0;color:#0f172a">Cambiar importe</button>
    </div>
    <div class="trust"><span>✓ Esta pantalla es una demo visual</span></div>
  `;

  document.querySelector("#back").addEventListener("click", () => window.location.reload());
  document.querySelector("#confirm").addEventListener("click", () => {
    content.innerHTML = `
      <section class="intro">
        <p class="eyebrow">Siguiente estado</p>
        <h2>Pago en proceso</h2>
        <p class="muted">La integración con el backend y el proveedor de pago se conectará en la siguiente etapa.</p>
      </section>
    `;
  });
});
