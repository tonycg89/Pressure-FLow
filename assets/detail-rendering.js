(function () {
  function createDetailRendering({
    currency,
    escapeHtml,
    estimateRejectionLabels,
    getBeforePhotoSections,
    getPressureFlowInvoiceNumber,
    renderBeforePhotoSections,
    renderPhotoGrid
  }) {
    function renderEmptyState(title, hint = "") {
      return `
        <div class="empty-state">
          <span class="empty-state__icon-wrap" aria-hidden="true">
            <svg class="empty-state__icon" viewBox="0 0 24 24">
              <path d="M5 12h14"></path>
              <path d="M12 5v14"></path>
            </svg>
          </span>
          <p class="empty-state__title">${escapeHtml(title)}</p>
          ${hint ? `<p class="empty-state__hint">${escapeHtml(hint)}</p>` : ""}
        </div>
      `;
    }

    function formatShortDate(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return String(value || "");
      }

      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      });
    }

    function formatEstimateRejectionReason(value) {
      return estimateRejectionLabels[value] || "No reason provided";
    }

    function renderCustomerJobMilestonesText(job) {
      const milestones = [
        job.estimateSentAt ? `Estimate sent ${formatShortDate(job.estimateSentAt)}` : "",
        job.estimateApprovedAt ? `Estimate accepted ${formatShortDate(job.estimateApprovedAt)}` : "",
        job.estimateRejectedAt ? `Estimate rejected ${formatShortDate(job.estimateRejectedAt)}${job.estimateRejectionReason ? ` (${formatEstimateRejectionReason(job.estimateRejectionReason)})` : ""}` : "",
        job.contractSentAt ? `Contract sent ${formatShortDate(job.contractSentAt)}` : "",
        job.contractSignedAt ? `Contract signed ${formatShortDate(job.contractSignedAt)}` : "",
        job.squareDepositInvoiceId ? `Deposit ${getPressureFlowInvoiceNumber(job, "deposit")} sent${job.squareDepositPaidAt ? `, paid ${formatShortDate(job.squareDepositPaidAt)}` : ""}` : "",
        job.scheduledAt ? `Scheduled ${formatShortDate(job.scheduledAt)}` : "",
        job.completionNoticeSentAt ? `Completion notice ${formatShortDate(job.completionNoticeSentAt)}` : "",
        job.squareFinalInvoiceId ? `Final ${getPressureFlowInvoiceNumber(job, "final")} sent${job.squareFinalPaidAt ? `, paid ${formatShortDate(job.squareFinalPaidAt)}` : ""}` : ""
      ].filter(Boolean);

      return milestones.length ? milestones.join(" | ") : "No documents sent yet";
    }

    function expandCustomerMeasurementAreas(measurements) {
      return (measurements || []).flatMap((item) => {
        const measurement = item.measurement || {};
        const areas = Array.isArray(measurement.areas) && measurement.areas.length
          ? measurement.areas
          : measurement.squareFeet && measurement.geojson
            ? [{
              name: item.label || "Service area",
              squareFeet: measurement.squareFeet,
              perimeterFeet: measurement.perimeterFeet,
              geojson: measurement.geojson
            }]
            : [];

        return areas.map((area) => ({
          ...item,
          label: area.name || item.label || "Service area",
          areaKey: JSON.stringify(area.geojson || {}),
          measurement: {
            ...measurement,
            squareFeet: Number(area.squareFeet || 0),
            perimeterFeet: Number(area.perimeterFeet || 0),
            geojson: area.geojson,
            areas: [area]
          }
        }));
      }).filter((item) => item.measurement?.squareFeet);
    }

    function renderCustomerMeasurements(measurements) {
      const reusable = expandCustomerMeasurementAreas(measurements);
      if (!reusable.length) {
        return renderEmptyState("No saved map measurements yet", "Saved measurements will appear here.");
      }

      return reusable.map((item) => `
        <div class="detail-row saved-area-row">
          <span>${escapeHtml(item.label || "Service area")}<br><small>${escapeHtml(item.address || "")}</small></span>
          <strong>${Math.round(item.measurement.squareFeet).toLocaleString("en-US")} SqFt</strong>
          <button class="icon-button" type="button" title="Delete service area" data-delete-measurement="${escapeHtml(item.id)}" data-area-key="${escapeHtml(item.areaKey)}">X</button>
        </div>
      `).join("");
    }

    function renderJobPhotos(job) {
      const before = job.jobPhotos?.before || [];
      const after = job.jobPhotos?.after || [];
      if (!before.length && !after.length) {
        return "";
      }

      return `
        <section class="detail-section">
          <h4>Job Photos</h4>
          <p><strong>Before</strong></p>
          ${renderBeforePhotoSections(before, getBeforePhotoSections())}
          <p><strong>After</strong></p>
          ${renderPhotoGrid(after)}
        </section>
      `;
    }

    function renderEstimateItems(job) {
      if (!job.lineItems?.length) {
        return "";
      }

      const rows = job.lineItems.map((item) => `
        <div class="detail-row estimate-item">
          <span>${escapeHtml(item.name)} (${Number(item.quantity || 0)} ${escapeHtml(item.unit || "")})</span>
          <strong>${currency.format(Number(item.total || 0))}</strong>
        </div>
      `).join("");
      const discount = Number(job.discountPercent || 0);

      return `
        ${rows}
        ${discount ? `
          <div class="detail-row estimate-item">
            <span>Discount</span>
            <strong>${discount}%</strong>
          </div>
        ` : ""}
      `;
    }

    function renderMeasurementDetail(job) {
      if (!job.measurement?.squareFeet) {
        return "";
      }

      const areaRows = Array.isArray(job.measurement.areas) && job.measurement.areas.length
        ? job.measurement.areas.map((area) => `
          <div class="detail-row service-subarea">
            <span>${escapeHtml(area.name || "Service area")}</span>
            <strong>${Math.round(area.squareFeet || 0).toLocaleString("en-US")} SqFt</strong>
          </div>
        `).join("")
        : "";

      return `
        <div class="detail-row">
          <span>Service area</span>
          <strong>${Math.round(job.measurement.squareFeet).toLocaleString("en-US")} SqFt</strong>
        </div>
        ${areaRows}
      `;
    }

    function renderInvoiceValue(job, invoiceType) {
      const invoiceId = invoiceType === "deposit" ? job.squareDepositInvoiceId : job.squareFinalInvoiceId;
      const url = invoiceType === "deposit" ? job.squareDepositInvoiceUrl : job.squareFinalInvoiceUrl;
      if (!invoiceId) {
        return "Not set";
      }

      const label = `${invoiceType === "deposit" ? "Deposit" : "Final"} ${getPressureFlowInvoiceNumber(job, invoiceType)}`;
      if (!url) {
        return escapeHtml(label);
      }

      return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
    }

    function getExecutedContractUrl(job) {
      const source = job.squareContractUrl || job.contractApprovalUrl || "";
      if (source.includes("/executed")) {
        return source;
      }

      if (job.contractApprovalUrl) {
        return job.contractApprovalUrl.replace(`/contract/${encodeURIComponent(job.id)}`, `/contract/${encodeURIComponent(job.id)}/executed`);
      }

      return source;
    }

    function renderLinkedValue(id, url) {
      if (!id && !url) {
        return "Not set";
      }

      const label = id || url;
      if (!url) {
        return escapeHtml(label);
      }

      return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
    }

    function renderContractLink(job) {
      const url = job.contractSignedAt ? getExecutedContractUrl(job) : (job.contractApprovalUrl || job.squareContractUrl);
      const label = job.contractSignedAt ? "Executed contract" : "Signing link";
      return renderLinkedValue(label, url);
    }

    function renderCompletionNotice(job) {
      if (!job.completionProofUrl) {
        return "Not sent";
      }

      return `<a href="${escapeHtml(job.completionProofUrl)}" target="_blank" rel="noreferrer">Completion PDF</a>`;
    }

    return {
      expandCustomerMeasurementAreas,
      formatEstimateRejectionReason,
      formatShortDate,
      renderCompletionNotice,
      renderContractLink,
      renderCustomerJobMilestonesText,
      renderCustomerMeasurements,
      renderEstimateItems,
      renderInvoiceValue,
      renderJobPhotos,
      renderLinkedValue,
      renderMeasurementDetail
    };
  }

  window.PressureFlowDetailRendering = {
    createDetailRendering
  };
})();
