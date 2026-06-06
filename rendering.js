function getBaseUrlFromLink(link) {
  try {
    const url = new URL(link);
    return url.origin;
  } catch {
    return process.env.APP_BASE_URL || "";
  }
}

function getBusinessName(settings = {}) {
  return settings.businessName || "Your Company";
}

function renderLogoHtml(settings = {}, baseUrl = "", width = 190) {
  const logo = String(settings.businessLogoDataUrl || "");
  if (!logo.startsWith("data:image/")) {
    return "";
  }
  return `<img src="${escapeHtml(logo)}" alt="${escapeHtml(getBusinessName(settings))}" style="display:block;max-width:${width}px;width:100%;height:auto;margin:0 0 14px">`;
}

function getEstimateValidUntil(job) {
  const sentDate = job.estimateSentAt ? new Date(job.estimateSentAt) : new Date();
  const base = Number.isNaN(sentDate.getTime()) ? new Date() : sentDate;
  return new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
}

function formatPublicDate(date) {
  return date.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function estimatePageStyles() {
  return `<style>
    body { margin: 0; min-height: 100vh; background: #f7f8fb; color: #202124; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width: min(760px, calc(100vw - 32px)); margin: 32px auto; padding: 24px; border: 1px solid #d8dee8; border-radius: 8px; background: white; box-shadow: 0 12px 28px rgba(16, 24, 40, 0.08); }
    h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: 0; }
    p { margin: 0 0 20px; color: #667085; line-height: 1.45; }
    h2 { margin: 24px 0 8px; font-size: 20px; }
    h3 { margin: 0 0 4px; font-size: 15px; }
    .eyebrow { margin: 0 0 8px; color: #667085; font-size: 12px; font-weight: 800; text-transform: uppercase; }
    label { display: grid; gap: 6px; margin: 18px 0; color: #667085; font-size: 13px; font-weight: 700; }
    input, select, textarea { width: 100%; border: 1px solid #d8dee8; border-radius: 8px; font: inherit; }
    input, select { min-height: 42px; padding: 0 10px; }
    textarea { padding: 10px; resize: vertical; }
    .initials-field { max-width: 180px; }
    .initials-input { text-align: center; font-weight: 800; cursor: pointer; }
    .executed-initials { display: inline-grid; gap: 4px; min-width: 120px; margin-top: 12px; padding: 10px 12px; border: 1px solid #d8dee8; border-radius: 8px; background: #f7f8fb; }
    .executed-initials span { color: #667085; font-size: 12px; font-weight: 800; text-transform: uppercase; }
    .executed-initials strong { font-size: 18px; }
    .measurement-preview-wrap { position: relative; overflow: hidden; border: 1px solid #d8dee8; border-radius: 8px; background: #101828; }
    .measurement-preview { display: block; width: 100%; }
    .measurement-badge { position: absolute; left: 50%; padding: 0; border: 0; background: transparent; color: #ff1f1f; font-size: 13px; font-weight: 900; line-height: 1.15; text-align: center; text-shadow: 0 1px 2px rgba(255,255,255,0.95), 0 -1px 2px rgba(255,255,255,0.95), 1px 0 2px rgba(255,255,255,0.95), -1px 0 2px rgba(255,255,255,0.95); transform: translate(-50%, -50%); pointer-events: none; }
    .measurement-badge-area { top: 50%; }
    table { width: 100%; border-collapse: collapse; margin: 18px 0; }
    th, td { padding: 12px 8px; border-bottom: 1px solid #d8dee8; text-align: left; }
    th { color: #667085; font-size: 13px; }
    td:last-child, th:last-child { text-align: right; }
    .totals { display: grid; gap: 8px; margin: 18px 0; }
    .totals div { display: flex; justify-content: space-between; gap: 16px; padding: 10px 0; border-bottom: 1px solid #d8dee8; }
    .totals span { color: #667085; }
    .term { padding: 12px 0; border-bottom: 1px solid #d8dee8; }
    .term p { margin: 0; }
    .term p + p { margin-top: 10px; }
    .notice { padding: 14px; border: 1px solid #b8e3dc; border-radius: 8px; background: #eef9f7; }
    .reject-estimate { margin-top: 18px; padding: 14px; border: 1px solid #d8dee8; border-radius: 8px; background: #fbfcfe; }
    .reject-estimate summary { color: #667085; font-weight: 800; cursor: pointer; }
    button { width: 100%; min-height: 46px; border: 0; border-radius: 8px; background: #1c7c54; color: white; font: inherit; font-weight: 800; cursor: pointer; }
    button.secondary-action { background: #fee4e2; color: #b42318; }
  </style>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

module.exports = {
  escapeHtml,
  estimatePageStyles,
  formatPublicDate,
  getBaseUrlFromLink,
  getBusinessName,
  getEstimateValidUntil,
  renderLogoHtml
};
