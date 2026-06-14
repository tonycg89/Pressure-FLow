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
  return `<img class="doc__logo" src="${escapeHtml(logo)}" alt="${escapeHtml(getBusinessName(settings))}" style="max-width:${width}px">`;
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
    main,
    .doc { width: min(760px, calc(100vw - 32px)); margin: 32px auto; padding: 24px; border: 1px solid #d8dee8; border-radius: 12px; background: white; box-shadow: 0 12px 28px rgba(16, 24, 40, 0.08); }
    .doc__brand { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; margin-bottom: 22px; padding-bottom: 18px; border-bottom: 1px solid #d8dee8; }
    .doc__logo { display: block; width: 100%; height: auto; margin: 0; }
    .doc__brand-meta { display: grid; gap: 4px; min-width: 0; }
    .doc__biz { color: #202124; font-size: 16px; font-weight: 800; line-height: 1.3; }
    .doc__contact { color: #667085; font-size: 13px; line-height: 1.4; }
    .doc__type { margin: 0 0 8px; color: #667085; font-size: 12px; font-weight: 800; text-transform: uppercase; }
    .doc__intro { margin-bottom: 22px; }
    .doc__intro p { margin-bottom: 0; }
    .doc__meta { display: grid; gap: 6px; margin: 14px 0 22px; color: #667085; font-size: 14px; line-height: 1.4; }
    .doc__content { display: grid; gap: 18px; }
    .doc__content > section { margin: 0; }
    .doc__footer { margin-top: 24px; padding-top: 18px; border-top: 1px solid #d8dee8; color: #667085; font-size: 12px; line-height: 1.5; }
    .doc__totals { display: grid; gap: 8px; margin: 18px 0; }
    .doc__total-row { display: flex; justify-content: space-between; gap: 16px; padding: 10px 0; border-bottom: 1px solid #d8dee8; }
    .doc__total-row span { color: #667085; }
    .doc__actions { display: grid; gap: 12px; margin-top: 22px; }
    .table { width: 100%; border-collapse: separate; border-spacing: 0; overflow: hidden; border: 1px solid #d8dee8; border-radius: 10px; margin: 18px 0; background: white; }
    .table th { background: #f7f8fb; color: #667085; font-size: 12px; font-weight: 800; text-transform: uppercase; }
    .table th,
    .table td { padding: 12px; border-bottom: 1px solid #d8dee8; text-align: left; vertical-align: top; }
    .table tr:last-child td { border-bottom: 0; }
    .num,
    .tabular-nums { font-variant-numeric: tabular-nums; }
    .table .num { text-align: right; white-space: nowrap; }
    .status { display: inline-flex; align-items: center; min-height: 24px; padding: 3px 9px; border-radius: 999px; background: #eef1ef; color: #5c635e; font-size: 12px; font-weight: 800; line-height: 1; }
    .status--success { background: #e3f2e9; color: #1f7a4d; }
    .status--warning { background: #fbf1dc; color: #9a6a00; }
    .btn { display: inline-flex; align-items: center; justify-content: center; width: 100%; min-height: 46px; border: 0; border-radius: 8px; background: #1c7c54; color: white; font: inherit; font-weight: 800; text-align: center; text-decoration: none; cursor: pointer; }
    .btn--secondary { border: 1px solid #d8dee8; background: white; color: #202124; }
    .btn--danger { background: #fee4e2; color: #b42318; }
    .doc__callout { padding: 16px; border: 1px solid #b8e3dc; border-radius: 10px; background: #eef9f7; }
    .doc__callout p { margin: 6px 0 0; }
    .doc__amount-due { display: grid; gap: 8px; margin: 0; padding: 20px; border: 1px solid #b8e3dc; border-radius: 12px; background: #eef9f7; }
    .doc__amount-due span { color: #667085; font-size: 12px; font-weight: 800; text-transform: uppercase; }
    .doc__amount-due strong { display: block; color: #202124; font-size: 36px; line-height: 1.1; }
    .doc__pay { display: grid; gap: 12px; margin-top: 12px; }
    .doc__pay-methods { display: grid; gap: 8px; margin: 12px 0; border: 1px solid #d8dee8; border-radius: 10px; overflow: hidden; background: white; }
    .doc__pay-method { display: flex; justify-content: space-between; gap: 12px; padding: 12px; border-bottom: 1px solid #d8dee8; }
    .doc__pay-method:last-child { border-bottom: 0; }
    .doc__pay-method span { color: #667085; font-weight: 800; }
    .doc__gallery { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 12px 0 0; }
    .doc__gallery figure { margin: 0; border: 1px solid #d8dee8; border-radius: 10px; overflow: hidden; background: #f7f8fb; }
    .doc__gallery img { display: block; width: 100%; height: 150px; object-fit: cover; }
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
    @media (max-width: 640px) {
      main,
      .doc { width: min(100vw - 20px, 760px); margin: 10px auto; padding: 18px; border-radius: 10px; }
      .doc__brand { display: grid; gap: 12px; }
      .doc__logo { max-width: 150px !important; }
      h1 { font-size: 24px; line-height: 1.2; }
      table { display: block; overflow-x: auto; white-space: nowrap; }
      th, td { padding: 10px 8px; }
      .doc__amount-due strong { font-size: 30px; }
      .doc__gallery { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .doc__gallery img { height: 128px; }
      .doc__pay-method { display: grid; gap: 4px; }
    }
    @media print {
      body { background: white; }
      main,
      .doc { width: 100%; max-width: none; margin: 0; padding: 0; border: 0; border-radius: 0; box-shadow: none; }
      .doc__brand { break-inside: avoid; }
      .doc__actions { break-inside: avoid; }
    }
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
