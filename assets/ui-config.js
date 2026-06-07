(function () {
  const leadSources = [
    { value: "referral", label: "Referral", color: "#1c7c54" },
    { value: "door-hanger", label: "Door hanger", color: "#2563eb" },
    { value: "door-to-door", label: "Door to door", color: "#b7791f" },
    { value: "meta-ad", label: "Meta ad", color: "#b42318" },
    { value: "nextdoor-ad", label: "Nextdoor ad", color: "#0f766e" }
  ];

  const defaultBeforePhotoSections = [
    "Main driveway",
    "Back patio",
    "Fence",
    "House #1",
    "House #2",
    "House #3",
    "House #4",
    "Roof",
    "Gutters",
    "Trash cans"
  ];

  const dashboardBreakdownColors = [
    "#1c7c54",
    "#2563eb",
    "#b7791f",
    "#b42318",
    "#0f766e",
    "#6941c6",
    "#c11574",
    "#475467"
  ];

  const estimateRejectionLabels = {
    "price-too-high": "Price too high",
    "timing-not-right": "Timing not right",
    "went-with-another-company": "Went with another company",
    "scope-changed": "Scope changed",
    "just-researching": "Just researching",
    other: "Other"
  };

  const builtInTemplates = [
    {
      id: "service-agreement",
      type: "Contract",
      name: "Pressure Washing Service Agreement",
      description: "Used when you click Send Contract. Customer reviews and signs this agreement online.",
      url: "/api/templates/service-agreement.docx",
      removable: false
    },
    {
      id: "estimate-approval",
      type: "Estimate",
      name: "PressureFlow Estimate Approval",
      description: "Used when you click Send Estimate. Customer reviews itemized services and approves online.",
      url: "/api/templates/estimate-approval.doc",
      removable: false
    }
  ];

  window.PressureFlowUiConfig = {
    builtInTemplates,
    dashboardBreakdownColors,
    defaultBeforePhotoSections,
    estimateRejectionLabels,
    leadSources
  };
})();
