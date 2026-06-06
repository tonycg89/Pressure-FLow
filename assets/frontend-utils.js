(function () {
  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  });

  function buildFullAddress(data = {}) {
    const street = String(data.streetAddress || "").trim();
    const unit = String(data.addressUnit || "").trim();
    const city = String(data.city || "").trim();
    const state = String(data.state || "").trim().toUpperCase();
    const zip = String(data.zip || "").trim();
    const streetLine = [street, unit].filter(Boolean).join(" ");
    const cityLine = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    return [streetLine, cityLine].filter(Boolean).join(", ");
  }

  function roundMoney(value) {
    return Math.round(Number(value || 0) * 100) / 100;
  }

  function getDeposit(job) {
    return Math.round(job.estimate * (job.depositPercent / 100));
  }

  function getFinalBalance(job) {
    return Math.max(job.estimate - getDeposit(job), 0);
  }

  function getPressureFlowInvoiceNumber(job, invoiceType) {
    const prefix = invoiceType === "deposit" ? "PPW-D" : "PPW-F";
    return `${prefix}-${compactHash(`${job.id}-${invoiceType}`).slice(0, 6).toUpperCase()}`;
  }

  function compactHash(value) {
    let hash = 0x811c9dc5;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function normalizeKey(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  window.PressureFlowUtils = {
    buildFullAddress,
    compactHash,
    currency,
    escapeHtml,
    getDeposit,
    getFinalBalance,
    getPressureFlowInvoiceNumber,
    normalizeKey,
    roundMoney
  };
})();
