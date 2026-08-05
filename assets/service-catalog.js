(function () {
  const builtInServiceCatalog = [
    { name: "Fence Cleaning", unit: "LNF", price: 2.5 },
    { name: "Holiday Light Installation", unit: "LNF", price: 5 },
    { name: "House Washing", unit: "SqFt", price: 0.25 },
    { name: "Oil Stain Cleanup", unit: "Qty", price: 75 },
    { name: "Paver Cleaning", unit: "SqFt", price: 0.3 },
    { name: "Pressure Washing", unit: "SqFt", price: 0.2 },
    { name: "Roof Blow Off (Debris Only)", unit: "Qty", price: 100 },
    { name: "Roof Wash", unit: "SqFt", price: 0.4 },
    { name: "Gutter Cleaning", unit: "LNF", price: 1 },
    { name: "Solar Panel Cleaning", unit: "Qty", price: 10 },
    { name: "Trash Can Cleaning", unit: "Qty", price: 15 }
  ];

  const onboardingServiceLibrary = [
    { category: "Pressure Washing", name: "Pressure Washing", unit: "SqFt", price: 0.2 },
    { category: "Pressure Washing", name: "Driveway Cleaning", unit: "SqFt", price: 0.22 },
    { category: "Pressure Washing", name: "Sidewalk Cleaning", unit: "SqFt", price: 0.18 },
    { category: "Pressure Washing", name: "Patio Cleaning", unit: "SqFt", price: 0.25 },
    { category: "Pressure Washing", name: "Paver Cleaning", unit: "SqFt", price: 0.3 },
    { category: "Pressure Washing", name: "House Washing", unit: "SqFt", price: 0.25 },
    { category: "Pressure Washing", name: "Soft Washing", unit: "SqFt", price: 0.28 },
    { category: "Pressure Washing", name: "Roof Wash", unit: "SqFt", price: 0.4 },
    { category: "Pressure Washing", name: "Roof Blow Off (Debris Only)", unit: "Qty", price: 100 },
    { category: "Pressure Washing", name: "Gutter Cleaning", unit: "LNF", price: 1 },
    { category: "Pressure Washing", name: "Gutter Brightening", unit: "LNF", price: 1.5 },
    { category: "Pressure Washing", name: "Oil Stain Cleanup", unit: "Qty", price: 75 },
    { category: "Pressure Washing", name: "Rust Removal", unit: "Qty", price: 85 },
    { category: "Pressure Washing", name: "Graffiti Removal", unit: "SqFt", price: 1.75 },
    { category: "Pressure Washing", name: "Commercial Exterior Cleaning", unit: "SqFt", price: 0.18 },
    { category: "Pressure Washing", name: "Restaurant Pad Cleaning", unit: "SqFt", price: 0.35 },
    { category: "Pressure Washing Add-ons", name: "Junk Haul Away", unit: "Each", price: 175 },
    { category: "Pressure Washing Add-ons", name: "Trash Can Cleaning", unit: "Qty", price: 15 },
    { category: "Pressure Washing Add-ons", name: "Solar Panel Cleaning", unit: "Qty", price: 10 },
    { category: "Pressure Washing Add-ons", name: "Window Cleaning", unit: "Each", price: 8 },
    { category: "Pressure Washing Add-ons", name: "Fleet Washing", unit: "Each", price: 45 },
    { category: "Pressure Washing Add-ons", name: "Heavy Equipment Washing", unit: "Each", price: 125 },
    { category: "Pressure Washing Add-ons", name: "Dumpster Pad Cleaning", unit: "Each", price: 95 },
    { category: "Pressure Washing Add-ons", name: "Holiday Light Installation", unit: "LNF", price: 5 },
    { category: "Pressure Washing Add-ons", name: "Christmas Light Removal", unit: "LNF", price: 1.5 }
  ];

  const onboardingServiceCategories = ["Pressure Washing", "Pressure Washing Add-ons"];

  const builtInServiceTypes = [
    "Driveway cleaning",
    "House wash",
    "Roof wash",
    "Commercial exterior",
    "Bundle",
    "Other"
  ];

  window.PressureFlowServiceCatalog = {
    builtInServiceCatalog,
    builtInServiceTypes,
    onboardingServiceCategories,
    onboardingServiceLibrary
  };
})();
