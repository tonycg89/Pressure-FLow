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
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.quantity)} ${escapeHtml(item.unit)}</td>
      <td>$${Number(item.price || 0).toFixed(2)}</td>
      <td>$${Number(item.total || 0).toFixed(2)}</td>
    </tr>
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
    <main>
      ${renderLogoHtml(settings, getBaseUrlFromLink(job.estimateApprovalUrl), 190)}
      <p class="eyebrow">Estimate Only, not an actual Invoice.</p>
      <h1>${escapeHtml(job.serviceType)} for ${escapeHtml(job.customerName)}</h1>
      <p>${escapeHtml(job.address)}</p>
      <section>
        <table>
          <thead><tr><th>Service</th><th>Amount</th><th>Rate</th><th>Total</th></tr></thead>
          <tbody>${lineRows}</tbody>
        </table>
      </section>
      <section class="totals">
        <div><span>Subtotal</span><strong>$${subtotal.toFixed(2)}</strong></div>
        ${discountAmount > 0 ? `<div><span>Discount</span><strong>-$${discountAmount.toFixed(2)}</strong></div>` : ""}
        <div><span>Total</span><strong>$${Number(job.estimate || 0).toFixed(2)}</strong></div>
      </section>
      <section class="notice">
        <strong>Estimate valid for 30 days</strong>
        <p>This estimate is valid through ${escapeHtml(formatPublicDate(validUntil))}.</p>
      </section>
      ${renderMeasurementPreview(job)}
      <form method="post" action="/api/public/estimates/${encodeURIComponent(job.id)}/approve">
        <input type="hidden" name="token" value="${escapeHtml(job.estimateApprovalToken)}">
        <button type="submit">Approve Estimate</button>
      </form>
      <details class="reject-estimate">
        <summary>Decline estimate</summary>
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
          <button type="submit" class="secondary-action">Decline Estimate</button>
        </form>
      </details>
      <script>
        const rejectReason = document.querySelector("#estimateRejectReason");
        const otherWrap = document.querySelector("#estimateRejectOtherWrap");
        rejectReason?.addEventListener("change", () => {
          otherWrap.hidden = rejectReason.value !== "other";
        });
      </script>
    </main>
  </body>
</html>`;
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

function renderMeasurementPreview(job) {
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
    <h2>Measured Surface</h2>
    <p>${escapeHtml(job.measurement.address || job.address)} | ${area} SqFt</p>
    ${areaRows}
    <div class="measurement-preview-wrap">
      <img class="measurement-preview" src="${escapeHtml(job.measurement.staticImageUrl)}" alt="Satellite measurement with traced polygon">
      <div class="measurement-badge measurement-badge-area">${area} SqFt</div>
    </div>
  </section>`;
}

function renderEstimateMessagePage(title, message) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    ${estimatePageStyles()}
  </head>
  <body>
    <main>
      ${renderLogoHtml({}, "", 190)}
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
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
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Completion Proof - ${escapeHtml(job.customerName)}</title>
    ${estimatePageStyles()}
    <style>
      .proof-meta { display: grid; gap: 6px; margin: 16px 0 22px; color: #667085; }
      .proof-details { width: 100%; margin: 18px 0 24px; border-collapse: collapse; }
      .proof-details th, .proof-details td { padding: 10px; border: 1px solid #d8dee8; text-align: left; vertical-align: top; }
      .proof-details th { width: 34%; background: #f7f8fb; color: #667085; }
      .proof-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 12px 0 24px; }
      .proof-grid figure { margin: 0; border: 1px solid #d8dee8; border-radius: 8px; overflow: hidden; background: #f7f8fb; }
      .proof-grid img { display: block; width: 100%; height: 150px; object-fit: cover; }
      .print-actions { margin-top: 20px; }
      @media (max-width: 640px) { .proof-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .proof-grid img { height: 128px; } }
      @media print { body { background: white; } main { box-shadow: none; margin: 0; width: 100%; border: 0; } .print-actions { display: none; } }
    </style>
  </head>
  <body>
    <main>
      ${renderLogoHtml(settings, getBaseUrlFromLink(job.completionProofUrl), 190)}
      <p class="eyebrow">Completion Proof</p>
      <h1>${escapeHtml(job.serviceType)} Completed</h1>
      <div class="proof-meta">
        <span>${escapeHtml(job.customerName)}</span>
        <span>${escapeHtml(job.address)}</span>
        <span>${escapeHtml(new Date(job.completionNoticeSentAt || Date.now()).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))}</span>
      </div>
      <h2>Completion and Invoice Details</h2>
      <table class="proof-details">
        <tbody>
          <tr><th>Service</th><td>${escapeHtml(job.serviceType || "Pressure washing")}</td></tr>
          <tr><th>Invoice</th><td>${escapeHtml(invoiceNumber)}</td></tr>
          <tr><th>Estimate total</th><td>${escapeHtml(formatAlertMoney(total))}</td></tr>
          <tr><th>Deposit</th><td>${escapeHtml(formatAlertMoney(deposit))}</td></tr>
          <tr><th>Final balance</th><td>${escapeHtml(formatAlertMoney(finalBalance))}</td></tr>
          <tr><th>Status</th><td>${escapeHtml(job.squareFinalInvoiceStatus === "PAID" || job.squareFinalPaidAt ? "Paid" : "Final invoice sent")}</td></tr>
        </tbody>
      </table>
      ${renderCompletionServiceAreas(job)}
      <h2>Before Photos</h2>
      ${renderProofPhotoGrid(before)}
      <h2>Completed Work Photos</h2>
      ${renderProofPhotoGrid(after)}
      <div class="print-actions">
        <button type="button" onclick="window.print()">Print or Save as PDF</button>
      </div>
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
  return `<h2>Service Area</h2><p>Total serviced area: ${total} SqFt</p>${areas}`;
}

function renderProofPhotoGrid(photos) {
  if (!photos.length) {
    return "<p>No photos provided.</p>";
  }

  return `<div class="proof-grid">
    ${photos.map((photo) => `
      <figure>
        <img src="${escapeHtml(photo.dataUrl)}" alt="${escapeHtml(photo.name)}">
      </figure>
    `).join("")}
  </div>`;
}

function renderPressureFlowInvoicePage(job, settings, invoiceType) {
  const isDeposit = invoiceType === "deposit";
  const amount = isDeposit ? getDepositCents(job) / 100 : getFinalBalanceCents(job) / 100;
  const title = isDeposit ? "Deposit Invoice" : "Final Invoice";
  const businessName = getBusinessName(settings);
  const invoiceNumber = getPressureFlowInvoiceNumber(job, invoiceType);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title} - ${escapeHtml(job.customerName)}</title>
    ${estimatePageStyles()}
    <style>
      .invoice-total { margin: 18px 0; padding: 18px; border: 1px solid #b8e3dc; border-radius: 8px; background: #eef9f7; }
      .invoice-total span { display: block; color: #667085; font-weight: 800; }
      .invoice-total strong { display: block; margin-top: 4px; font-size: 32px; }
      .payment-methods { display: grid; gap: 10px; margin: 18px 0; }
      .payment-methods div { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid #d8dee8; }
      .proof-link { margin: 18px 0; padding: 14px; border: 1px solid #d8dee8; border-radius: 8px; background: #f7f8fb; }
      .proof-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .proof-grid img { height: 150px; }
      @media (max-width: 640px) { .proof-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .proof-grid img { height: 128px; } }
      @media print { body { background: white; } main { box-shadow: none; margin: 0; width: 100%; border: 0; } button { display: none; } }
    </style>
  </head>
  <body>
    <main>
      ${renderLogoHtml(settings, getBaseUrlFromLink(job.squareDepositInvoiceUrl || job.squareFinalInvoiceUrl), 190)}
      <p class="eyebrow">${isDeposit ? "Deposit Invoice" : "Final Invoice"}</p>
      <h1>${title}</h1>
      <p>${escapeHtml(invoiceNumber)} | ${escapeHtml(businessName)} for ${escapeHtml(job.customerName)} | ${escapeHtml(job.address)}</p>
      <section class="invoice-total">
        <span>Amount Due</span>
        <strong>$${amount.toFixed(2)}</strong>
      </section>
      <h2>Service</h2>
      <table>
        <tbody>
          ${(job.lineItems || []).map((item) => `
            <tr>
              <td>${escapeHtml(item.name)} (${Number(item.quantity || 0)} ${escapeHtml(item.unit || "")})</td>
              <td>$${Number(item.total || 0).toFixed(2)}</td>
            </tr>
          `).join("")}
          <tr><td>${isDeposit ? `Deposit (${Number(job.depositPercent || 25)}%)` : "Final balance after deposit"}</td><td>$${amount.toFixed(2)}</td></tr>
        </tbody>
      </table>
      <h2>Payment Options</h2>
      ${renderPaymentMethods(settings)}
      ${settings.paymentInstructions ? `<p>${escapeHtml(settings.paymentInstructions)}</p>` : ""}
      ${renderCardPaymentForm(job, settings, invoiceType)}
      ${!isDeposit && job.completionProofUrl ? `<section class="proof-link"><strong>Completion photos:</strong><br><a href="${escapeHtml(job.completionProofUrl)}">View completion proof and photos</a></section>` : ""}
      ${!isDeposit ? `<h2>Before Photos</h2>${renderProofPhotoGrid(job.jobPhotos?.before || [])}<h2>Completed Work Photos</h2>${renderProofPhotoGrid(job.jobPhotos?.after || [])}` : ""}
      <button type="button" onclick="window.print()">Print or Save as PDF</button>
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
    <form method="post" action="/api/public/invoices/${encodeURIComponent(job.id)}/pay-card" style="margin:18px 0">
      <input type="hidden" name="type" value="${escapeHtml(invoiceType)}">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <button type="submit">Pay by Credit Card</button>
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
    return "<p>Payment instructions will be provided by the business.</p>";
  }

  return `<div class="payment-methods">
    ${methods.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
  </div>`;
}

function renderContractSigningPage(job, options = {}) {
  const lineRows = (job.lineItems || []).map((item) => `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.quantity)} ${escapeHtml(item.unit)}</td>
      <td>$${Number(item.total || 0).toFixed(2)}</td>
    </tr>
  `).join("");
  const depositAmount = Number(job.estimate || 0) * (Number(job.depositPercent || 25) / 100);
  const finalAmount = Math.max(Number(job.estimate || 0) - depositAmount, 0);
  const alreadySigned = Boolean(job.contractSignedAt);
  const initials = getCustomerInitials(job.customerName);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Service Agreement</title>
    ${estimatePageStyles()}
  </head>
  <body>
    <main>
      ${renderLogoHtml(options.settings || {}, getBaseUrlFromLink(job.contractApprovalUrl), 190)}
      <p class="eyebrow">Service Agreement</p>
      <h1>${escapeHtml(serviceAgreementTemplate.title)}</h1>
      <p>${escapeHtml(job.customerName)} | ${escapeHtml(job.address)}</p>

      ${renderContractProjectDetails(job, depositAmount, options.settings || {})}

      <section>
        <h2>Scope of Work</h2>
        <table>
          <thead><tr><th>Service</th><th>Amount</th><th>Total</th></tr></thead>
          <tbody>${lineRows}</tbody>
        </table>
      </section>

      <section class="totals">
        <div><span>Estimate Total</span><strong>$${Number(job.estimate || 0).toFixed(2)}</strong></div>
        <div><span>Deposit Due Before Scheduling</span><strong>$${depositAmount.toFixed(2)}</strong></div>
        <div><span>Final Balance After Completion</span><strong>$${finalAmount.toFixed(2)}</strong></div>
      </section>

      ${renderContractTerms(job, { executed: alreadySigned || options.executedOnly, initials })}

      ${alreadySigned ? `
        <section class="notice">
          <strong>Signed</strong>
          <p>This service agreement was signed by ${escapeHtml(job.contractSignerName || job.customerName)} on ${escapeHtml(new Date(job.contractSignedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))}.</p>
        </section>
        <section>
          <h2>Signature</h2>
          <table>
            <tbody>
              <tr><th>Signer</th><td>${escapeHtml(job.contractSignerName || job.customerName)}</td></tr>
              <tr><th>Date signed</th><td>${escapeHtml(job.contractSignedDate || new Date(job.contractSignedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))}</td></tr>
            </tbody>
          </table>
        </section>
      ` : `
        <form id="contractSignForm" method="post" action="/api/public/contracts/${encodeURIComponent(job.id)}/sign">
          <input type="hidden" name="token" value="${escapeHtml(job.contractApprovalToken)}">
          <input type="hidden" id="expectedInitials" value="${escapeHtml(initials)}">
          <label>
            Signature date and time
            <input id="signedDateInput" name="signedDate" required readonly placeholder="Click to add current date and time">
          </label>
          <label>
            Type your full name to sign
            <input id="signatureInput" name="signerName" required autocomplete="name" placeholder="Type your full legal name">
          </label>
          <button type="submit">Sign Agreement</button>
        </form>
        ${contractSigningScript()}
      `}
    </main>
  </body>
</html>`;
}

function renderContractTerms(job, options = {}) {
  return `<section>
    <h2>Terms and Conditions</h2>
    ${serviceAgreementTemplate.sections.map((section, index) => `
      <article class="term">
        <h3>${index + 1}. ${escapeHtml(section.title)}</h3>
        ${escapeHtml(section.body).split("\n\n").map((paragraph) => `<p>${paragraph}</p>`).join("")}
        ${section.initialsRequired && options.executed ? `
          <div class="executed-initials">
            <span>Client initials</span>
            <strong>${escapeHtml(options.initials || getCustomerInitials(job.customerName))}</strong>
          </div>
        ` : section.initialsRequired ? `
          <label class="initials-field">
            Initials
            <input name="initials_${index}" class="initials-input" form="contractSignForm" required placeholder="Click to initial" autocomplete="off">
          </label>
        ` : ""}
      </article>
    `).join("")}
  </section>`;
}

function renderContractProjectDetails(job, depositAmount, settings = {}) {
  const businessName = getBusinessName(settings);
  const details = [
    ["Business", businessName],
    ["Client", job.customerName],
    ["Service Address", job.address],
    ["Approved Estimate", "PressureFlow estimate approved online"],
    ["Estimated Price", `$${Number(job.estimate || 0).toFixed(2)}`],
    ["Deposit", `$${depositAmount.toFixed(2)} (${Number(job.depositPercent || 25)}%)`],
    ["Scheduled Date", job.scheduledAt || "To be scheduled after deposit payment"]
  ];

  return `<section>
    <h2>Project Details</h2>
    <table>
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

function getCustomerInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0]?.[0] || "";
  const last = (parts.length > 1 ? parts.at(-1)?.[0] : "") || "";
  return `${first}${last}`.toUpperCase();
}

function contractSigningScript() {
  return `<script>
    const expectedInitials = document.querySelector("#expectedInitials")?.value || "";
    const signedDateInput = document.querySelector("#signedDateInput");
    document.querySelectorAll(".initials-input").forEach((input) => {
      input.addEventListener("click", () => {
        input.value = expectedInitials;
      });
      input.addEventListener("focus", () => {
        if (!input.value) input.value = expectedInitials;
      });
    });

    if (signedDateInput) {
      const fillSignedDate = () => {
        signedDateInput.value = new Date().toLocaleString("en-US", {
          timeZone: "America/Los_Angeles",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "numeric",
          minute: "2-digit"
        });
      };
      signedDateInput.addEventListener("click", fillSignedDate);
      signedDateInput.addEventListener("focus", fillSignedDate);
    }

    document.querySelector("#contractSignForm")?.addEventListener("submit", (event) => {
      const missingInitials = Array.from(document.querySelectorAll(".initials-input")).some((input) => !input.value.trim());
      if (missingInitials) {
        event.preventDefault();
        alert("Please click each initials box before signing.");
        return;
      }

      if (!signedDateInput?.value.trim()) {
        event.preventDefault();
        alert("Please click the signature date and time box before signing.");
      }
    });
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
