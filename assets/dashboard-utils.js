(function () {
  function createDashboardUtils({ colors, normalizeKey, roundMoney }) {
    function createBreakdownRow(label, index) {
      return {
        value: normalizeKey(label),
        label,
        color: colors[index % colors.length],
        jobs: 0,
        estimatesSent: 0,
        accepted: 0,
        revenue: 0
      };
    }

    function isRevenueJob(job) {
      return job.status === "Paid" || job.squareFinalPaidAt;
    }

    function getAddressCity(item) {
      if (item.city) return item.city;
      const parts = String(item.address || "").split(",").map((part) => part.trim()).filter(Boolean);
      return parts.length >= 3 ? parts.at(-2) : "";
    }

    function buildServiceRevenueRows(scopedJobs) {
      const rows = new Map();
      scopedJobs.filter(isRevenueJob).forEach((job) => {
        const lineItems = job.lineItems?.length
          ? job.lineItems
          : [{ name: job.serviceType || "Service", total: Number(job.estimate || 0) }];
        const lineSubtotal = lineItems.reduce((sum, item) => sum + Number(item.total || 0), 0) || Number(job.estimate || 0) || 1;
        lineItems.forEach((item) => {
          const label = item.name || "Service";
          const current = rows.get(label) || createBreakdownRow(label, rows.size);
          current.jobs += 1;
          current.revenue += Number(job.estimate || 0) * (Number(item.total || 0) / lineSubtotal);
          rows.set(label, current);
        });
      });
      return [...rows.values()].map((row) => ({ ...row, revenue: roundMoney(row.revenue) }));
    }

    function buildCityRevenueRows(scopedJobs) {
      const rows = new Map();
      scopedJobs.filter(isRevenueJob).forEach((job) => {
        const label = getAddressCity(job) || "Unknown city";
        const current = rows.get(label) || createBreakdownRow(label, rows.size);
        current.jobs += 1;
        current.revenue += Number(job.estimate || 0);
        rows.set(label, current);
      });
      return [...rows.values()].map((row) => ({ ...row, revenue: roundMoney(row.revenue) }));
    }

    return {
      buildCityRevenueRows,
      buildServiceRevenueRows,
      createBreakdownRow,
      getAddressCity,
      isRevenueJob
    };
  }

  window.PressureFlowDashboardUtils = {
    createDashboardUtils
  };
})();
