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

function getBusinessContact(settings = {}) {
  return [settings.businessEmail, settings.businessPhone].filter(Boolean).join(" | ");
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
    *, *::before, *::after { box-sizing: border-box; }
    :root {
      --doc-bg: #f5f7f6;
      --doc-card: #ffffff;
      --doc-surface: #fbfcfb;
      --doc-surface-strong: #eef8f4;
      --doc-ink: #17211d;
      --doc-muted: #66746d;
      --doc-soft: #eef2ef;
      --doc-line: #d9e1dd;
      --doc-line-strong: #b9dcd0;
      --doc-primary: #1c7c54;
      --doc-primary-dark: #135b3d;
      --doc-warning-bg: #fff4df;
      --doc-warning-text: #8a5a00;
      --doc-danger-bg: #fee8e5;
      --doc-danger-text: #b42318;
      --doc-radius: 12px;
      --doc-radius-lg: 16px;
      --doc-shadow: 0 18px 44px rgba(16, 24, 40, 0.10);
    }
    body { margin: 0; min-width: 320px; min-height: 100vh; overflow-wrap: anywhere; background: radial-gradient(circle at top left, #edf6f1 0, var(--doc-bg) 340px); color: var(--doc-ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 15px; line-height: 1.5; }
    main,
    .doc { width: min(780px, calc(100vw - 32px)); max-width: 100%; margin: 32px auto; padding: 24px; border: 1px solid var(--doc-line); border-radius: var(--doc-radius-lg); background: var(--doc-card); box-shadow: var(--doc-shadow); }
    .doc__brand { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--doc-line); }
    .doc__logo { display: block; width: 100%; height: auto; margin: 0; }
    .doc__brand-meta { display: grid; gap: 4px; min-width: 0; text-align: right; }
    .doc__biz { color: var(--doc-ink); font-size: 16px; font-weight: 850; line-height: 1.3; }
    .doc__contact { color: var(--doc-muted); font-size: 13px; line-height: 1.45; }
    .doc__type { margin: 0 0 8px; color: var(--doc-primary-dark); font-size: 12px; font-weight: 850; letter-spacing: 0.06em; text-transform: uppercase; }
    .doc__intro { margin-bottom: 24px; }
    .doc__intro p { margin-bottom: 0; }
    .doc__meta { display: grid; gap: 6px; min-width: 0; margin: 16px 0 20px; color: var(--doc-muted); font-size: 14px; line-height: 1.45; }
    .doc__content { display: grid; gap: 24px; min-width: 0; }
    .doc__content > section { min-width: 0; margin: 0; }
    .doc__footer { display: grid; gap: 6px; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--doc-line); color: var(--doc-muted); font-size: 12px; line-height: 1.5; }
    .doc__footer strong { color: var(--doc-ink); font-size: 13px; }
    .doc__trust-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .doc__trust-pill { display: inline-flex; align-items: center; min-height: 32px; padding: 6px 12px; border: 1px solid var(--doc-line); border-radius: 999px; background: var(--doc-surface); color: #415049; font-size: 12px; font-weight: 850; }
    .doc__totals { display: grid; gap: 8px; min-width: 0; margin: 0; padding: 16px; border: 1px solid var(--doc-line); border-radius: var(--doc-radius); background: var(--doc-surface); }
    .doc__total-row { display: flex; justify-content: space-between; gap: 16px; padding: 8px 0; border-bottom: 1px solid var(--doc-line); }
    .doc__total-row:last-child { border-bottom: 0; }
    .doc__total-row span { color: var(--doc-muted); }
    .doc__actions { display: grid; gap: 12px; min-width: 0; margin-top: 24px; padding: 16px; border: 1px solid var(--doc-line); border-radius: var(--doc-radius); background: var(--doc-surface); }
    .doc__actions-note { margin: 0; color: var(--doc-muted); font-size: 13px; line-height: 1.5; }
    .table { width: 100%; min-width: 0; table-layout: fixed; border-collapse: separate; border-spacing: 0; overflow: hidden; border: 1px solid var(--doc-line); border-radius: var(--doc-radius); margin: 12px 0 0; background: var(--doc-card); }
    .table th { background: var(--doc-surface); color: var(--doc-muted); font-size: 12px; font-weight: 850; letter-spacing: 0.03em; text-transform: uppercase; }
    .table th,
    .table td { min-width: 0; padding: 12px; overflow-wrap: anywhere; border-bottom: 1px solid var(--doc-line); text-align: left; vertical-align: top; }
    .table tr:last-child td { border-bottom: 0; }
    .num,
    .tabular-nums { font-variant-numeric: tabular-nums; }
    .table .num { text-align: right; white-space: nowrap; }
    .doc-table-scroll { width: 100%; max-width: 100%; min-width: 0; overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .doc-table-scroll .table { margin: 12px 0 0; }
    .doc-line-list { display: grid; gap: 12px; width: 100%; max-width: 100%; margin: 12px 0 0; }
    .doc-line-card { display: grid; gap: 12px; width: 100%; max-width: 100%; min-width: 0; padding: 16px; border: 1px solid var(--doc-line); border-radius: var(--doc-radius); background: var(--doc-card); overflow: hidden; box-shadow: 0 1px 0 rgba(16, 24, 40, 0.03); }
    .doc-line-card__title { min-width: 0; color: var(--doc-ink); font-weight: 850; line-height: 1.35; overflow-wrap: anywhere; }
    .doc-line-card__details { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 0; }
    .doc-line-card__details--contract { grid-template-columns: minmax(0, 1.4fr) minmax(0, 0.8fr); }
    .doc-line-card__details div { display: grid; gap: 4px; min-width: 0; }
    .doc-line-card__details dt { color: var(--doc-muted); font-size: 11px; font-weight: 850; letter-spacing: 0.03em; text-transform: uppercase; }
    .doc-line-card__details dd { min-width: 0; margin: 0; color: var(--doc-ink); font-weight: 750; overflow-wrap: anywhere; }
    .doc-line-items,
    .doc-contract-scope { table-layout: auto; }
    .doc-line-items .doc-col-service { width: 38%; }
    .doc-line-items .doc-col-amount { width: 19%; }
    .doc-line-items .doc-col-rate { width: 21%; }
    .doc-line-items .doc-col-total { width: 22%; }
    .doc-contract-scope .doc-col-service { width: 52%; }
    .doc-contract-scope .doc-col-amount { width: 22%; }
    .doc-contract-scope .doc-col-total { width: 26%; }
    .doc-line-items th:nth-child(2),
    .doc-line-items td:nth-child(2),
    .doc-contract-scope th:nth-child(2),
    .doc-contract-scope td:nth-child(2) { overflow-wrap: normal; word-break: normal; }
    .doc-line-items th:last-child,
    .doc-line-items td:last-child,
    .doc-contract-scope th:last-child,
    .doc-contract-scope td:last-child { min-width: 112px; overflow-wrap: normal; word-break: normal; white-space: nowrap; }
    .status { display: inline-flex; align-items: center; min-height: 28px; padding: 5px 10px; border-radius: 999px; background: var(--doc-soft); color: #56635d; font-size: 12px; font-weight: 850; line-height: 1; }
    .status--success { background: #e5f4ec; color: #176a43; }
    .status--warning { background: var(--doc-warning-bg); color: var(--doc-warning-text); }
    .btn,
    button { display: inline-flex; align-items: center; justify-content: center; width: 100%; min-height: 46px; border: 0; border-radius: 10px; background: var(--doc-primary); color: white; font: inherit; font-weight: 850; text-align: center; text-decoration: none; cursor: pointer; box-shadow: 0 8px 18px rgba(28, 124, 84, 0.18); }
    .btn:hover,
    button:hover { background: var(--doc-primary-dark); }
    .btn:disabled,
    button:disabled { opacity: 0.78; cursor: wait; }
    .btn--secondary { border: 1px solid var(--doc-line); background: var(--doc-card); color: var(--doc-ink); box-shadow: none; }
    .btn--secondary:hover { background: var(--doc-surface); color: var(--doc-ink); }
    .btn--danger,
    button.secondary-action { background: var(--doc-danger-bg); color: var(--doc-danger-text); box-shadow: none; }
    .btn--danger:hover,
    button.secondary-action:hover { background: #fdd3cf; color: var(--doc-danger-text); }
    .doc__callout { padding: 16px; border: 1px solid var(--doc-line-strong); border-radius: var(--doc-radius); background: var(--doc-surface-strong); }
    .doc__callout p { margin: 6px 0 0; }
    .doc__amount-due { display: grid; gap: 8px; margin: 0; padding: 24px; border: 1px solid var(--doc-line-strong); border-radius: var(--doc-radius-lg); background: var(--doc-surface-strong); }
    .doc__amount-due span { color: var(--doc-muted); font-size: 12px; font-weight: 850; letter-spacing: 0.04em; text-transform: uppercase; }
    .doc__amount-due strong { display: block; color: var(--doc-ink); font-size: 36px; line-height: 1.08; }
    .doc__pay { display: grid; gap: 12px; margin-top: 12px; }
    .doc__pay-methods { display: grid; gap: 0; margin: 12px 0; border: 1px solid var(--doc-line); border-radius: var(--doc-radius); overflow: hidden; background: var(--doc-card); }
    .doc__pay-method { display: flex; justify-content: space-between; gap: 12px; min-width: 0; padding: 12px 16px; border-bottom: 1px solid var(--doc-line); }
    .doc__pay-method:last-child { border-bottom: 0; }
    .doc__pay-method span { color: var(--doc-muted); font-weight: 850; }
    .doc__summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 16px 0 0; }
    .doc__summary-item { display: grid; gap: 4px; padding: 16px; border: 1px solid var(--doc-line); border-radius: var(--doc-radius); background: var(--doc-surface); }
    .doc__summary-item span { color: var(--doc-muted); font-size: 12px; font-weight: 850; letter-spacing: 0.03em; text-transform: uppercase; }
    .doc__summary-item strong { color: var(--doc-ink); overflow-wrap: anywhere; }
    .doc__gallery { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 12px 0 0; }
    .doc__gallery figure { margin: 0; border: 1px solid var(--doc-line); border-radius: var(--doc-radius); overflow: hidden; background: var(--doc-surface); }
    .doc__gallery img { display: block; width: 100%; height: 150px; object-fit: cover; }
    .contract-section { display: grid; gap: 16px; }
    .contract-terms { display: grid; gap: 12px; }
    .contract-clause { padding: 16px; border: 1px solid var(--doc-line); border-radius: var(--doc-radius); background: var(--doc-surface); break-inside: avoid; }
    .contract-clause h3 { margin: 0 0 8px; color: var(--doc-ink); font-size: 15px; font-weight: 850; line-height: 1.35; }
    .contract-clause p { margin: 0; color: #415049; }
    .contract-clause p + p { margin-top: 10px; }
    .contract-signature { padding: 16px; border: 1px solid var(--doc-line); border-radius: var(--doc-radius); background: var(--doc-surface); break-inside: avoid; }
    .contract-sign-form { display: grid; gap: 12px; }
    .initials-field { max-width: 180px; }
    .initials-input { text-align: center; font-weight: 850; cursor: pointer; }
    .executed-initials { display: inline-grid; gap: 4px; min-width: 120px; margin-top: 12px; padding: 10px 12px; border: 1px solid var(--doc-line-strong); border-radius: 10px; background: var(--doc-surface-strong); }
    .executed-initials span { color: var(--doc-muted); font-size: 12px; font-weight: 850; text-transform: uppercase; }
    .executed-initials strong { color: var(--doc-primary); font-size: 18px; }
    h1 { margin: 0 0 8px; color: var(--doc-ink); font-size: 30px; line-height: 1.15; letter-spacing: 0; }
    p { margin: 0 0 16px; color: var(--doc-muted); line-height: 1.5; }
    h2 { margin: 0 0 8px; color: var(--doc-ink); font-size: 20px; line-height: 1.25; }
    h3 { margin: 0 0 4px; color: var(--doc-ink); font-size: 15px; line-height: 1.35; }
    .eyebrow { margin: 0 0 8px; color: var(--doc-primary-dark); font-size: 12px; font-weight: 850; letter-spacing: 0.06em; text-transform: uppercase; }
    label { display: grid; gap: 6px; margin: 16px 0; color: var(--doc-muted); font-size: 13px; font-weight: 750; }
    input, select, textarea { width: 100%; border: 1px solid var(--doc-line); border-radius: 10px; font: inherit; }
    input, select { min-height: 42px; padding: 0 10px; }
    textarea { padding: 10px; resize: vertical; }
    .measurement-preview-wrap { position: relative; overflow: hidden; border: 1px solid var(--doc-line); border-radius: var(--doc-radius); background: #101828; }
    .measurement-preview { display: block; width: 100%; }
    .measurement-badge { position: absolute; left: 50%; padding: 0; border: 0; background: transparent; color: #ff1f1f; font-size: 13px; font-weight: 900; line-height: 1.15; text-align: center; text-shadow: 0 1px 2px rgba(255,255,255,0.95), 0 -1px 2px rgba(255,255,255,0.95), 1px 0 2px rgba(255,255,255,0.95), -1px 0 2px rgba(255,255,255,0.95); transform: translate(-50%, -50%); pointer-events: none; }
    .measurement-badge-area { top: 50%; }
    table { width: 100%; min-width: 0; table-layout: fixed; border-collapse: collapse; margin: 18px 0; }
    th, td { min-width: 0; padding: 12px 8px; overflow-wrap: anywhere; border-bottom: 1px solid var(--doc-line); text-align: left; }
    th { color: var(--doc-muted); font-size: 13px; }
    td:last-child, th:last-child { text-align: right; }
    .totals { display: grid; gap: 8px; margin: 18px 0; }
    .totals div { display: flex; justify-content: space-between; gap: 16px; padding: 8px 0; border-bottom: 1px solid var(--doc-line); }
    .totals span { color: var(--doc-muted); }
    .term { padding: 12px 0; border-bottom: 1px solid var(--doc-line); }
    .term.contract-clause { padding: 16px; border: 1px solid var(--doc-line); }
    .term p { margin: 0; }
    .term p + p { margin-top: 10px; }
    .notice { padding: 16px; border: 1px solid var(--doc-line-strong); border-radius: var(--doc-radius); background: var(--doc-surface-strong); }
    .proof-link a { display: inline-flex; align-items: center; min-height: 44px; overflow-wrap: anywhere; }
    .reject-estimate { margin-top: 16px; padding: 16px; border: 1px solid var(--doc-line); border-radius: var(--doc-radius); background: var(--doc-surface); }
    .reject-estimate summary { color: var(--doc-muted); font-weight: 850; cursor: pointer; }
    @media (max-width: 640px) {
      main,
      .doc { width: min(100vw - 20px, 760px); margin: 10px auto; padding: 18px; border-radius: var(--doc-radius); }
      .doc__brand { display: grid; gap: 12px; }
      .doc__brand-meta { text-align: left; }
      .doc__logo { max-width: 150px !important; }
      .doc__trust-row { gap: 6px; }
      .doc__trust-pill { min-height: 32px; white-space: normal; }
      h1 { font-size: 24px; line-height: 1.2; }
      label { font-size: 14px; }
      input,
      select,
      textarea { font-size: 16px; }
      input,
      select { min-height: 44px; }
      textarea { min-height: 104px; }
      .doc-line-card { padding: 12px; }
      .doc-line-card__details,
      .doc-line-card__details--contract { grid-template-columns: 1fr; gap: 8px; }
      .doc-line-card__details div { grid-template-columns: minmax(78px, 30%) minmax(0, 1fr); gap: 8px; align-items: start; }
      .doc-line-card__details dt { font-size: 10px; }
      .doc-line-card__details dd { text-align: left; }
      .table,
      table { max-width: 100%; white-space: normal; }
      .doc-table-scroll { overflow: visible; }
      .doc-line-items,
      .doc-contract-scope { display: block; width: 100%; max-width: 100%; border-collapse: separate; border-spacing: 0; overflow: hidden; table-layout: auto; }
      .doc-line-items colgroup,
      .doc-contract-scope colgroup,
      .doc-line-items thead,
      .doc-contract-scope thead { display: none; }
      .doc-line-items tbody,
      .doc-contract-scope tbody,
      .doc-line-items tr,
      .doc-contract-scope tr,
      .doc-line-items td,
      .doc-contract-scope td { display: block; width: 100%; max-width: 100%; }
      .doc-line-items tr,
      .doc-contract-scope tr { padding: 10px 0; border-bottom: 1px solid var(--doc-line); }
      .doc-line-items tr:last-child,
      .doc-contract-scope tr:last-child { border-bottom: 0; }
      .doc-line-items td,
      .doc-contract-scope td { display: grid; grid-template-columns: minmax(82px, 34%) minmax(0, 1fr); gap: 8px; padding: 6px 10px; border-bottom: 0; text-align: left; white-space: normal; overflow-wrap: anywhere; }
      .doc-line-items td::before,
      .doc-contract-scope td::before { color: var(--doc-muted); font-size: 11px; font-weight: 850; text-transform: uppercase; }
      .doc-line-items td:nth-child(1)::before,
      .doc-contract-scope td:nth-child(1)::before { content: "Service"; }
      .doc-line-items td:nth-child(2)::before,
      .doc-contract-scope td:nth-child(2)::before { content: "Amount"; }
      .doc-line-items td:nth-child(3)::before { content: "Rate"; }
      .doc-line-items td:nth-child(4)::before,
      .doc-contract-scope td:nth-child(3)::before { content: "Total"; }
      .doc-line-items .num,
      .doc-contract-scope .num,
      .doc-line-items td:last-child,
      .doc-contract-scope td:last-child { min-width: 0; text-align: left; white-space: normal; }
      th, td { padding: 8px 5px; white-space: normal; font-size: 12px; line-height: 1.3; }
      .doc__amount-due strong { font-size: 30px; }
      .doc__gallery { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .doc__gallery img { height: 128px; }
      .doc__pay-method { display: grid; gap: 4px; }
      .doc__summary-grid { grid-template-columns: 1fr; }
      .contract-clause,
      .contract-signature,
      .doc__summary-item,
      .doc__amount-due,
      .doc__actions { padding: 14px; }
    }
    @media print {
      body { background: white; }
      main,
      .doc { width: 100%; max-width: none; margin: 0; padding: 0; border: 0; border-radius: 0; box-shadow: none; }
      .doc__brand,
      .doc__intro,
      .doc__totals,
      .doc__callout,
      .doc__amount-due,
      .contract-signature,
      .contract-clause { break-inside: avoid; page-break-inside: avoid; }
      .doc__actions { break-inside: avoid; }
      .doc__actions button,
      .doc__actions .btn { min-height: 38px; }
      a { color: inherit; text-decoration: underline; }
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
  getBusinessContact,
  getBusinessName,
  getEstimateValidUntil,
  renderLogoHtml
};
