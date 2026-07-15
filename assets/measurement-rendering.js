(function () {
  function createMeasurementRendering({ escapeHtml }) {
    function renderSavedMeasurements({
      isSelected,
      list,
      measurements,
      measurementGeojsonKey,
      onDelete,
      onToggle,
      panel
    }) {
      const reusable = dedupeMeasurements(measurements.filter((item) => item.measurement?.geojson && item.measurement?.squareFeet), measurementGeojsonKey);
      if (!reusable.length && list.children.length > 0) {
        return;
      }

      panel.hidden = reusable.length === 0;
      if (reusable.length && !panel.dataset.userToggled) {
        panel.open = true;
      }
      list.innerHTML = "";

      reusable.forEach((item) => {
        const row = document.createElement("div");
        const canDelete = item.customerId && item.id;
        const areaKey = measurementGeojsonKey(item.measurement?.geojson);
        row.className = "saved-measurement-button saved-measurement-choice";
        row.dataset.areaKey = areaKey;
        row.innerHTML = `
          <input type="checkbox" ${isSelected(item) ? "checked" : ""}>
          <span class="saved-measurement-copy">
            <strong>${escapeHtml(item.label || "Saved measurement")}</strong>
            <small>${Math.round(item.measurement.squareFeet).toLocaleString("en-US")} SqFt</small>
          </span>
          ${canDelete ? `<button class="icon-button saved-measurement-delete" type="button" title="Delete saved service area" data-delete-saved-measurement="${escapeHtml(item.id)}" data-customer-id="${escapeHtml(item.customerId)}" data-area-key="${escapeHtml(areaKey)}">X</button>` : ""}
        `;
        row.querySelector("input").addEventListener("change", (event) => {
          onToggle(item, event.target.checked);
        });
        row.querySelector("[data-delete-saved-measurement]")?.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          onDelete(
            event.currentTarget.dataset.customerId,
            event.currentTarget.dataset.deleteSavedMeasurement,
            event.currentTarget.dataset.areaKey
          );
        });
        list.append(row);
      });
    }

    function dedupeMeasurements(measurements = [], measurementGeojsonKey) {
      const seen = new Set();
      return (measurements || []).filter((item) => {
        const key = measurementGeojsonKey(item.measurement?.geojson) || `${item.label || ""}:${Math.round(Number(item.measurement?.squareFeet || 0))}`;
        if (!key || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
    }

    function syncSavedMeasurementChecks(list, areas, measurementGeojsonKey) {
      const selectedKeys = new Set((areas || []).map((area) => measurementGeojsonKey(area.geojson)));
      const items = Array.from(list.querySelectorAll(".saved-measurement-choice")).map((choice) => ({
        choice,
        checked: choice.querySelector("input")?.checked
      }));
      items.forEach(({ choice }) => {
        const input = choice.querySelector("input");
        if (input) {
          input.checked = selectedKeys.has(choice.dataset.areaKey || "");
        }
      });
    }

    return {
      renderSavedMeasurements,
      syncSavedMeasurementChecks
    };
  }

  window.PressureFlowMeasurementRendering = {
    createMeasurementRendering
  };
})();
