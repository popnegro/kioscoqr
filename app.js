const form = document.querySelector("#payment-form");
const amount = document.querySelector("#amount");
const content = document.querySelector("#app");

function formatAmount(value) {
  const normalized = value.replace(/\\s/g, "").replace(/\\./g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

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
      <p class="muted">Kiosco Maipú · Puesto 01</p>
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
