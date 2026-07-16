const {
  formatAlertMoney,
  getDepositCents,
  getFinalBalanceCents,
  getPressureFlowInvoiceNumber
} = require("./billing");
const {
  escapeHtml,
  estimatePageStyles,
  formatPublicDate,
  getBaseUrlFromLink,
  getBusinessContact,
  getBusinessName,
  getEstimateValidUntil,
  renderLogoHtml
} = require("./rendering");
const serviceAgreementTemplate = require("./templates/pressure-washing-service-agreement.json");

function renderEstimateApprovalPage(job, settings = {}) {
  const validUntil = getEstimateValidUntil(job);
  const subtotal = (job.lineItems || []).reduce((sum, item) => sum + Number(item.total || 0), 0);
  const discountPercent = Number(job.discountPercent || 0);
  const discountAmount = subtotal * (discountPercent / 100);
  const lineRows = (job.lineItems || []).map((item) => `
    <article class="doc-line-card">
      <div class="doc-line-card__title">${escapeHtml(item.name)}</div>
      <dl class="doc-line-card__details">
        <div><dt>Amount</dt><dd>${formatQuantityDisplay(item)}</dd></div>
        <div><dt>Rate</dt><dd>${formatRateDisplay(item)}</dd></div>
        <div><dt>Total</dt><dd>$${Number(item.total || 0).toFixed(2)}</dd></div>
      </dl>
    </article>
  `).join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Estimate Approval</title>
    ${estimatePageStyles()}
  </head>
  <body>
    <main class="doc">
      ${renderDocumentBrand(settings, getBaseUrlFromLink(job.estimateApprovalUrl))}
      <header class="doc__intro">
        <p class="eyebrow doc__type">Estimate Only, not an actual Invoice.</p>
        <h1>${escapeHtml(job.serviceType)} for ${escapeHtml(job.customerName)}</h1>
        <div class="doc__meta">
          <span>${escapeHtml(job.customerName)}</span>
          <span>${escapeHtml(job.address)}</span>
        </div>
        ${renderTrustPills(["Prepared for your review", "No payment collected on this page"])}
      </header>
      <div class="doc__content">
        <section class="doc__summary-grid" aria-label="Estimate summary">
          <div class="doc__summary-item"><span>Customer</span><strong>${escapeHtml(job.customerName)}</strong></div>
          <div class="doc__summary-item"><span>Service address</span><strong>${escapeHtml(job.address)}</strong></div>
          <div class="doc__summary-item"><span>Estimate total</span><strong>$${Number(job.estimate || 0).toFixed(2)}</strong></div>
          <div class="doc__summary-item"><span>Valid through</span><strong>${escapeHtml(formatPublicDate(validUntil))}</strong></div>
        </section>
        <section>
          <h2>Services included</h2>
          <div class="doc-line-list" aria-label="Services included">${lineRows}</div>
        </section>
        <section class="totals doc__totals">
          <div class="doc__total-row"><span>Subtotal</span><strong>$${subtotal.toFixed(2)}</strong></div>
          ${discountAmount > 0 ? `<div class="doc__total-row"><span>Discount</span><strong>-$${discountAmount.toFixed(2)}</strong></div>` : ""}
          <div class="doc__total-row"><span>Total</span><strong>$${Number(job.estimate || 0).toFixed(2)}</strong></div>
        </section>
        ${renderMeasurementPreview(job)}
      </div>
      <div class="doc__actions">
        <p class="doc__actions-note">Approve this estimate to let ${escapeHtml(getBusinessName(settings))} prepare your service agreement. You will review and sign the agreement before any deposit invoice is due.</p>
        <form id="estimateApproveForm" method="post" action="/api/public/estimates/${encodeURIComponent(job.id)}/approve">
          <input type="hidden" name="token" value="${escapeHtml(job.estimateApprovalToken)}">
          <button class="btn" type="submit" data-submitting-text="Approving estimate...">Approve Estimate</button>
        </form>
        <details class="reject-estimate">
          <summary>Decline Estimate</summary>
          <form method="post" action="/api/public/estimates/${encodeURIComponent(job.id)}/reject">
            <input type="hidden" name="token" value="${escapeHtml(job.estimateApprovalToken)}">
            <label>
              Reason for declining
              <select name="reason" id="estimateRejectReason">
                <option value="">Prefer not to say</option>
                <option value="price-too-high">Price was too high</option>
                <option value="timing-not-right">Timing is not right</option>
                <option value="went-with-another-company">Went with another company</option>
                <option value="scope-changed">Scope changed</option>
                <option value="just-researching">Just researching</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label id="estimateRejectOtherWrap" hidden>
              Other reason
              <textarea name="otherReason" rows="3" placeholder="Optional"></textarea>
            </label>
            <button type="submit" class="secondary-action btn btn--danger">Decline Estimate</button>
          </form>
        </details>
      </div>
      ${renderDocumentFooter(settings)}
      ${publicSubmitFeedbackScript()}
      <script>
        const rejectReason = document.querySelector("#estimateRejectReason");
        const otherWrap = document.querySelector("#estimateRejectOtherWrap");
        rejectReason?.addEventListener("change", () => {
          otherWrap.hidden = rejectReason.value !== "other";
        });
        attachPublicSubmitFeedback("#estimateApproveForm");
      </script>
    </main>
  </body>
</html>`;
}

function renderDocumentBrand(settings = {}, baseUrl = "") {
  const businessName = getBusinessName(settings);
  const contact = getBusinessContact(settings);
  return `<div class="doc__brand">
    ${renderLogoHtml(settings, baseUrl, 190)}
    <div class="doc__brand-meta">
      <div class="doc__biz">${escapeHtml(businessName)}</div>
      ${contact ? `<div class="doc__contact">${escapeHtml(contact)}</div>` : ""}
    </div>
  </div>`;
}

function renderDocumentFooter(settings = {}) {
  const businessName = getBusinessName(settings);
  const contact = getBusinessContact(settings);
  return `<footer class="doc__footer">
    <strong>${escapeHtml(businessName)}</strong>
    ${contact ? `<span>${escapeHtml(contact)}</span>` : ""}
    <span>This secure customer page is generated by PressureFlow for ${escapeHtml(businessName)}.</span>
  </footer>`;
}

function renderTrustPills(items) {
  return `<div class="doc__trust-row">
    ${items.map((item) => `<span class="doc__trust-pill">${escapeHtml(item)}</span>`).join("")}
  </div>`;
}

function renderStatusBadge(label, tone = "neutral") {
  const toneClass = tone === "success" ? " status--success" : tone === "warning" ? " status--warning" : "";
  return `<span class="status${toneClass}">${escapeHtml(label)}</span>`;
}

function normalizeUnitLabel(unit = "") {
  const value = String(unit || "Qty").trim();
  const lower = value.toLowerCase();
  if (lower === "per hour" || lower === "hours") return "Hours";
  if (lower === "qty") return "Qty";
  return value;
}

function normalizeRateUnit(unit = "") {
  const value = String(unit || "").trim().toLowerCase();
  if (value === "per hour" || value === "hours") return "hour";
  const label = normalizeUnitLabel(unit);
  return label.toLowerCase() === "flat rate" ? "flat rate" : label;
}

function formatQuantityDisplay(item = {}) {
  return `${escapeHtml(item.quantity)} ${escapeHtml(normalizeUnitLabel(item.unit))}`;
}

function formatRateDisplay(item = {}) {
  const rate = `$${Number(item.price || 0).toFixed(2)}`;
  const unit = normalizeRateUnit(item.unit);
  return unit === "flat rate" ? rate : `${rate} / ${escapeHtml(unit)}`;
}

function renderEstimateApprovalWordTemplate(settings) {
  const businessName = settings.businessName || "Your Company";
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>PressureFlow Estimate Approval Template</title>
    <style>
      body { font-family: Arial, sans-serif; color: #202124; line-height: 1.45; }
      h1 { font-size: 24pt; margin: 0 0 6pt; }
      h2 { font-size: 14pt; margin: 18pt 0 8pt; }
      p { margin: 0 0 8pt; }
      table { width: 100%; border-collapse: collapse; margin: 8pt 0 14pt; }
      th, td { border: 1px solid #808080; padding: 7pt; text-align: left; vertical-align: top; }
      th { background: #f2f2f2; }
      .muted { color: #666666; }
      .signature { height: 36pt; }
    </style>
  </head>
  <body>
    <h1>Estimate Approval</h1>
    <p><strong>Business:</strong> ${escapeHtml(businessName)}</p>
    <p><strong>Customer:</strong> [Customer Name]</p>
    <p><strong>Property Address:</strong> [Service Address]</p>
    <p><strong>Email:</strong> [Customer Email]</p>
    <p><strong>Phone:</strong> [Customer Phone]</p>

    <h2>Scope and Pricing</h2>
    <table>
      <thead>
        <tr>
          <th>Service</th>
          <th>Area / Quantity</th>
          <th>Rate</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>[Service Name]</td>
          <td>[SqFt, LNF, or Qty]</td>
          <td>[$ Rate]</td>
          <td>[$ Total]</td>
        </tr>
        <tr>
          <td>[Additional Service]</td>
          <td>[SqFt, LNF, or Qty]</td>
          <td>[$ Rate]</td>
          <td>[$ Total]</td>
        </tr>
      </tbody>
    </table>

    <table>
      <tbody>
        <tr><td><strong>Subtotal</strong></td><td>[$ Subtotal]</td></tr>
        <tr><td><strong>Discount</strong></td><td>[$ Discount, if any]</td></tr>
        <tr><td><strong>Total Estimate</strong></td><td>[$ Total]</td></tr>
        <tr><td><strong>Deposit Required</strong></td><td>[Deposit % and $ Amount]</td></tr>
      </tbody>
    </table>

    <h2>Customer Approval</h2>
    <p>The Customer acknowledges that this estimate identifies the services, pricing, and scope of work for the project. By approving or signing this estimate, the Customer authorizes the Business to proceed with the services described, subject to the service agreement and any written changes approved by both parties.</p>
    <p class="muted">Services, areas, conditions, or work not listed in this estimate are excluded unless approved in writing and may require additional charges.</p>

    <table>
      <tbody>
        <tr>
          <td><strong>Customer Signature</strong><br><br><div class="signature">[Signature]</div></td>
          <td><strong>Date</strong><br><br>[Date]</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`;
}

function renderMeasurementPreview(job, heading = "Measured Surface") {
  if (!job.measurement?.staticImageUrl) {
    return "";
  }

  const area = Math.round(Number(job.measurement.squareFeet || 0)).toLocaleString("en-US");
  const areaRows = Array.isArray(job.measurement.areas) && job.measurement.areas.length
    ? `<ul>
      ${job.measurement.areas.map((item) => `
        <li>${escapeHtml(item.name || "Service area")}: ${Math.round(Number(item.squareFeet || 0)).toLocaleString("en-US")} SqFt</li>
      `).join("")}
    </ul>`
    : "";
  return `<section>
    <h2>${escapeHtml(heading)}</h2>
    <p>${escapeHtml(job.measurement.address || job.address)} | ${area} SqFt</p>
    ${areaRows}
    <div class="measurement-preview-wrap">
      <img class="measurement-preview" src="${escapeHtml(job.measurement.staticImageUrl)}" alt="Satellite measurement with traced polygon">
      <div class="measurement-badge measurement-badge-area">${area} SqFt</div>
    </div>
  </section>`;
}

function renderEstimateMessagePage(title, message, options = {}) {
  const actions = Array.isArray(options.actions) ? options.actions : [];
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    ${estimatePageStyles()}
  </head>
  <body>
    <main class="doc">
      ${renderDocumentBrand(options.settings || {}, options.baseUrl || "")}
      <header class="doc__intro">
        <p class="eyebrow doc__type">${escapeHtml(options.type || "PressureFlow")}</p>
        <h1>${escapeHtml(title)}</h1>
      </header>
      <div class="doc__content">
        <section class="notice doc__callout">
          <p>${escapeHtml(message)}</p>
        </section>
      </div>
      ${actions.length ? `
        <div class="doc__actions">
          ${actions.map((action) => `<a class="${escapeHtml(action.className || "btn")}" href="${escapeHtml(action.href || "#")}">${escapeHtml(action.label || "Continue")}</a>`).join("")}
        </div>
      ` : ""}
      ${renderDocumentFooter(options.settings || {})}
    </main>
  </body>
</html>`;
}

function renderCompletionProofPage(job, settings = {}) {
  const before = job.jobPhotos?.before || [];
  const after = job.jobPhotos?.after || [];
  const invoiceNumber = getPressureFlowInvoiceNumber(job, "final");
  const finalBalance = getFinalBalanceCents(job) / 100;
  const deposit = getDepositCents(job) / 100;
  const total = Number(job.estimate || 0);
  const hasPhotos = before.length || after.length;
  const isPaid = job.squareFinalInvoiceStatus === "PAID" || job.squareFinalPaidAt;
  const proofPills = ["Service completed", hasPhotos ? "Photos included" : "", "Customer copy"].filter(Boolean);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Completion Proof - ${escapeHtml(job.customerName)}</title>
    ${estimatePageStyles()}
    <style>
      .proof-meta { display: grid; gap: 6px; color: #667085; }
      .proof-details th { width: 34%; }
      .print-actions { margin-top: 20px; }
      @media print { body { background: white; } main { box-shadow: none; margin: 0; width: 100%; border: 0; } .print-actions { display: none; } }
    </style>
  </head>
  <body>
    <main class="doc">
      ${renderDocumentBrand(settings, getBaseUrlFromLink(job.completionProofUrl))}
      <header class="doc__intro">
        <p class="eyebrow doc__type">Completion Proof</p>
        <h1>${escapeHtml(job.serviceType)} Completed</h1>
        <div class="proof-meta doc__meta">
          <span>${escapeHtml(job.customerName)}</span>
          <span>${escapeHtml(job.address)}</span>
          <span>${escapeHtml(new Date(job.completionNoticeSentAt || Date.now()).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))}</span>
        </div>
        ${renderTrustPills(proofPills)}
      </header>
      <div class="doc__content">
        <section>
          <h2>Service and Payment Details</h2>
          <table class="proof-details table">
            <tbody>
              <tr><th>Service</th><td>${escapeHtml(job.serviceType || "Pressure washing")}</td></tr>
              <tr><th>Invoice</th><td>${escapeHtml(invoiceNumber)}</td></tr>
              <tr><th>Estimate total</th><td class="num">${escapeHtml(formatAlertMoney(total))}</td></tr>
              <tr><th>Deposit</th><td class="num">${escapeHtml(formatAlertMoney(deposit))}</td></tr>
              <tr><th>Final balance</th><td class="num">${escapeHtml(formatAlertMoney(finalBalance))}</td></tr>
              <tr><th>Payment status</th><td>${renderStatusBadge(isPaid ? "Payment complete" : "Payment pending", isPaid ? "success" : "warning")}</td></tr>
            </tbody>
          </table>
        </section>
        ${renderCompletionServiceAreas(job)}
        ${renderMeasurementPreview(job, "Service Area Photo")}
        ${before.length ? `<section>
          <h2>Before Photos</h2>
          ${renderProofPhotoGrid(before)}
        </section>` : ""}
        ${after.length ? `<section>
          <h2>Completed Work Photos</h2>
          ${renderProofPhotoGrid(after)}
        </section>` : ""}
      </div>
      <div class="print-actions doc__actions">
        <p class="doc__actions-note">Keep this completion proof for your records. Contact ${escapeHtml(getBusinessName(settings))} if anything needs review.</p>
        <button class="btn btn--secondary" type="button" onclick="window.print()">Print or Save as PDF</button>
      </div>
      ${renderDocumentFooter(settings)}
    </main>
  </body>
</html>`;
}

function renderCompletionServiceAreas(job) {
  if (!job.measurement?.squareFeet) {
    return "";
  }

  const total = Math.round(Number(job.measurement.squareFeet || 0)).toLocaleString("en-US");
  const areas = Array.isArray(job.measurement.areas) && job.measurement.areas.length
    ? `<ul>
      ${job.measurement.areas.map((area) => `
        <li>${escapeHtml(area.name || "Service area")}: ${Math.round(Number(area.squareFeet || 0)).toLocaleString("en-US")} SqFt</li>
      `).join("")}
    </ul>`
    : "";
  return `<section><h2>Service Area</h2><p>Total serviced area: ${total} SqFt</p>${areas}</section>`;
}

function renderProofPhotoGrid(photos) {
  if (!photos.length) {
    return "";
  }

  return `<div class="proof-grid doc__gallery">
    ${photos.map((photo) => `
      <figure>
        <img src="${escapeHtml(photo.dataUrl)}" alt="${escapeHtml(photo.name)}">
      </figure>
    `).join("")}
  </div>`;
}

function renderPressureFlowInvoicePage(job, settings, invoiceType) {
  const isDeposit = invoiceType === "deposit";
  const hasCompletionPhotos = Boolean((job.jobPhotos?.before || []).length || (job.jobPhotos?.after || []).length);
  const amount = isDeposit ? getDepositCents(job) / 100 : getFinalBalanceCents(job) / 100;
  const depositPercent = getDepositPercent(job);
  const title = isDeposit ? "Deposit Invoice" : "Final Invoice";
  const businessName = getBusinessName(settings);
  const invoiceNumber = getPressureFlowInvoiceNumber(job, invoiceType);
  const documentTypeLabel = isDeposit ? "Deposit Invoice" : invoiceNumber;
  const invoicePaid = isDeposit
    ? job.squareDepositInvoiceStatus === "PAID" || job.squareDepositPaidAt
    : job.squareFinalInvoiceStatus === "PAID" || job.squareFinalPaidAt;
  const trustPills = [
    invoicePaid ? "Paid" : "",
    isDeposit ? "Deposit invoice" : "Final invoice",
    "Customer copy"
  ].filter(Boolean);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title} - ${escapeHtml(job.customerName)}</title>
    ${estimatePageStyles()}
    <style>
      .invoice-total { margin: 0; }
      .invoice-status-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
      .payment-methods { margin: 12px 0; }
      .proof-link { margin: 18px 0; padding: 14px; border: 1px solid #d8dee8; border-radius: 8px; background: #f7f8fb; }
      @media print { body { background: white; } main { box-shadow: none; margin: 0; width: 100%; border: 0; } button { display: none; } }
    </style>
  </head>
  <body>
    <main class="doc">
      ${renderDocumentBrand(settings, getBaseUrlFromLink(job.squareDepositInvoiceUrl || job.squareFinalInvoiceUrl))}
      <header class="doc__intro">
        <p class="eyebrow doc__type">${escapeHtml(documentTypeLabel)}</p>
        <h1>${title}</h1>
        <div class="doc__meta">
          ${isDeposit ? `<span>${escapeHtml(invoiceNumber)}</span>` : ""}
          <span>${escapeHtml(job.serviceType || "Service")}</span>
          <span>${escapeHtml(businessName)} for ${escapeHtml(job.customerName)}</span>
          <span>${escapeHtml(job.address)}</span>
        </div>
        ${renderTrustPills(trustPills)}
      </header>
      <div class="doc__content">
        <section class="invoice-total doc__amount-due">
          <div class="invoice-status-row">
            <span>Amount Due</span>
            ${renderStatusBadge(invoicePaid ? "Paid" : "Payment due", invoicePaid ? "success" : "warning")}
          </div>
          <strong class="num">$${amount.toFixed(2)}</strong>
        </section>
        <section>
          <h2>Service</h2>
          <p><strong>${escapeHtml(job.serviceType || "Service")}</strong></p>
          <table class="table">
            <tbody>
              ${(job.lineItems || []).map((item) => `
                <tr>
                  <td>${escapeHtml(item.name)} (${formatQuantityDisplay(item)} at ${formatRateDisplay(item)})</td>
                  <td class="num">$${Number(item.total || 0).toFixed(2)}</td>
                </tr>
              `).join("")}
              <tr><td>${isDeposit ? `Deposit (${depositPercent}%)` : "Final balance after deposit"}</td><td class="num">$${amount.toFixed(2)}</td></tr>
            </tbody>
          </table>
        </section>
        <section class="doc__pay">
          <h2>Payment Options</h2>
          ${invoicePaid ? `<div class="doc__callout"><strong>Payment received</strong><p>${isDeposit ? "Check your inbox for schedule confirmation and pre-service instructions." : "This invoice is marked paid. No further payment is due for this invoice."}</p></div>` : `
            ${renderPaymentMethods(settings)}
            ${settings.paymentInstructions ? `<p>${escapeHtml(settings.paymentInstructions)}</p>` : ""}
            ${renderCardPaymentForm(job, settings, invoiceType)}
          `}
        </section>
        ${!isDeposit && job.completionProofUrl && hasCompletionPhotos ? `<section class="proof-link"><strong>Completion photo record:</strong><br><a href="${escapeHtml(job.completionProofUrl)}">View before and after photos</a></section>` : ""}
      </div>
      <div class="doc__actions">
        <button class="btn btn--secondary" type="button" onclick="window.print()">Print or Save as PDF</button>
      </div>
      ${renderDocumentFooter(settings)}
    </main>
  </body>
</html>`;
}

function renderCardPaymentForm(job, settings, invoiceType) {
  if (!settings.stripeSecretKey) {
    return "";
  }

  const token = invoiceType === "deposit" ? job.squareDepositInvoiceId : job.squareFinalInvoiceId;
  return `
    <form class="doc__pay" method="post" action="/api/public/invoices/${encodeURIComponent(job.id)}/pay-card" style="margin:18px 0">
      <input type="hidden" name="type" value="${escapeHtml(invoiceType)}">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <button class="btn" type="submit">Pay by Credit Card</button>
    </form>
  `;
}

function renderPaymentMethods(settings) {
  const methods = [
    ["Zelle", settings.zellePayment],
    ["Cash App", settings.cashAppPayment],
    ["Venmo", settings.venmoPayment]
  ].filter(([, value]) => value);

  if (!methods.length) {
    if (settings.stripeSecretKey || settings.paymentInstructions) {
      return "";
    }

    const businessName = getBusinessName(settings);
    const contactOptions = [settings.businessEmail, settings.businessPhone].filter(Boolean).join(" or ");
    const contactCopy = contactOptions ? ` at ${contactOptions}` : "";
    return `<div class="doc__callout">
      <p>Payment options have not been configured yet. Please contact ${escapeHtml(businessName)}${escapeHtml(contactCopy)} for payment instructions.</p>
    </div>`;
  }

  return `<div class="payment-methods doc__pay-methods">
    ${methods.map(([label, value]) => `<div class="doc__pay-method"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
  </div>`;
}

function renderContractSigningPage(job, options = {}) {
  const lineRows = (job.lineItems || []).map((item) => `
    <article class="doc-line-card">
      <div class="doc-line-card__title">${escapeHtml(item.name)}</div>
      <dl class="doc-line-card__details doc-line-card__details--contract">
        <div><dt>Amount</dt><dd>${formatQuantityDisplay(item)} at ${formatRateDisplay(item)}</dd></div>
        <div><dt>Total</dt><dd>$${Number(item.total || 0).toFixed(2)}</dd></div>
      </dl>
    </article>
  `).join("");
  const depositAmount = getDepositCents(job) / 100;
  const finalAmount = getFinalBalanceCents(job) / 100;
  const alreadySigned = Boolean(job.contractSignedAt);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Service Agreement</title>
    ${estimatePageStyles()}
  </head>
  <body>
    <main class="doc">
      ${renderDocumentBrand(options.settings || {}, getBaseUrlFromLink(job.contractApprovalUrl))}
      <header class="doc__intro">
        <p class="eyebrow doc__type">Service Agreement</p>
        <h1>${escapeHtml(serviceAgreementTemplate.title)}</h1>
        <div class="doc__meta">
          <span>${escapeHtml(job.customerName)}</span>
          <span>${escapeHtml(job.address)}</span>
        </div>
      </header>

      <div class="doc__content">
        ${renderContractProjectDetails(job, depositAmount, options.settings || {})}

        <section class="contract-section">
          <h2>Scope of Work</h2>
          <div class="doc-line-list" aria-label="Scope of Work">${lineRows}</div>
        </section>

        <section class="totals doc__totals">
          <div class="doc__total-row"><span>Estimate Total</span><strong>$${Number(job.estimate || 0).toFixed(2)}</strong></div>
          <div class="doc__total-row"><span>Deposit Due Before Scheduling</span><strong>$${depositAmount.toFixed(2)}</strong></div>
          <div class="doc__total-row"><span>Final Balance After Completion</span><strong>$${finalAmount.toFixed(2)}</strong></div>
        </section>

        ${renderContractTerms(job)}

        ${alreadySigned ? `
          <section class="notice doc__callout contract-signature">
            <strong>Signed</strong>
            <p>This service agreement was signed by ${escapeHtml(job.contractSignerName || job.customerName)} on ${escapeHtml(new Date(job.contractSignedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))}.</p>
          </section>
          <section class="contract-signature">
            <h2>Signature</h2>
            <table class="table">
              <tbody>
                <tr><th>Signer</th><td>${escapeHtml(job.contractSignerName || job.customerName)}</td></tr>
                <tr><th>Date signed</th><td>${escapeHtml(job.contractSignedDate || new Date(job.contractSignedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))}</td></tr>
              </tbody>
            </table>
          </section>
        ` : ""}
      </div>

      ${alreadySigned ? "" : `
        <div class="doc__actions">
          <p class="doc__actions-note">Type your full legal name and use the date field below to sign this service agreement.</p>
          <form id="contractSignForm" class="contract-sign-form contract-signature" method="post" action="/api/public/contracts/${encodeURIComponent(job.id)}/sign">
            <input type="hidden" name="token" value="${escapeHtml(job.contractApprovalToken)}">
            <label>
              Signature date
              <input id="signedDateInput" name="signedDate" required readonly placeholder="Click to add today's date">
            </label>
            <label>
              Type your full name to sign
              <input id="signatureInput" name="signerName" required autocomplete="name" placeholder="Type your full legal name">
            </label>
            <button class="btn" type="submit" data-submitting-text="Signing agreement...">Sign Agreement</button>
          </form>
        </div>
        ${contractSigningScript()}
      `}
      ${renderDocumentFooter(options.settings || {})}
    </main>
  </body>
</html>`;
}

function renderContractTerms(job, options = {}) {
  return `<section class="contract-section">
    <h2>Terms and Conditions</h2>
    <div class="contract-terms">
      ${serviceAgreementTemplate.sections.map((section, index) => `
      <article class="term contract-clause">
        <h3>${index + 1}. ${escapeHtml(section.title)}</h3>
        ${escapeHtml(section.body).split("\n\n").map((paragraph) => `<p>${paragraph}</p>`).join("")}
      </article>
      `).join("")}
    </div>
  </section>`;
}

function renderContractProjectDetails(job, depositAmount, settings = {}) {
  const businessName = getBusinessName(settings);
  const depositPercent = getDepositPercent(job);
  const details = [
    ["Business", businessName],
    ["Client", job.customerName],
    ["Job Title", job.serviceType || "Service"],
    ["Service Address", job.address],
    ["Approved Estimate", `${businessName} estimate approved online`],
    ["Estimated Price", `$${Number(job.estimate || 0).toFixed(2)}`],
    ["Deposit", `$${depositAmount.toFixed(2)} (${depositPercent}%)`],
    ["Scheduled Date", job.scheduledAt || "To be scheduled after deposit payment"]
  ];

  return `<section class="contract-section">
    <h2>Project Details</h2>
    <table class="table">
      <tbody>
        ${details.map(([label, value]) => `
          <tr>
            <th>${escapeHtml(label)}</th>
            <td>${escapeHtml(value)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  </section>`;
}

function getDepositPercent(job) {
  const percent = Number(job.depositPercent ?? 25);
  return Number.isFinite(percent) ? percent : 25;
}

function contractSigningScript() {
  return `${publicSubmitFeedbackScript()}
  <script>
    const signedDateInput = document.querySelector("#signedDateInput");

    if (signedDateInput) {
      const fillSignedDate = () => {
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Los_Angeles",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }).formatToParts(new Date()).reduce((values, part) => {
          if (part.type !== "literal") values[part.type] = part.value;
          return values;
        }, {});
        signedDateInput.value = [parts.year, parts.month, parts.day].join("-");
      };
      signedDateInput.addEventListener("click", fillSignedDate);
      signedDateInput.addEventListener("focus", fillSignedDate);
    }

    document.querySelector("#contractSignForm")?.addEventListener("submit", (event) => {
      if (!signedDateInput?.value.trim()) {
        event.preventDefault();
        alert("Please click the signature date box before signing.");
        return;
      }
      setSubmittingState(event.currentTarget);
    });
    attachPublicSubmitFeedback("#contractSignForm");
  </script>`;
}

function publicSubmitFeedbackScript() {
  return `<script>
    function setSubmittingState(form) {
      if (!form || form.dataset.submitting === "true") return;
      form.dataset.submitting = "true";
      const button = form.querySelector("button[type='submit']");
      if (!button) return;
      button.dataset.originalText = button.textContent.trim();
      button.textContent = button.dataset.submittingText || "Working...";
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }

    function attachPublicSubmitFeedback(selector) {
      const form = document.querySelector(selector);
      if (!form || form.dataset.feedbackAttached === "true") return;
      form.dataset.feedbackAttached = "true";
      form.addEventListener("submit", () => setSubmittingState(form));
    }
  </script>`;
}

module.exports = {
  renderCompletionProofPage,
  renderContractSigningPage,
  renderEstimateApprovalPage,
  renderEstimateApprovalWordTemplate,
  renderEstimateMessagePage,
  renderPressureFlowInvoicePage
};
