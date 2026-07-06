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
    { category: "Landscaping", name: "Lawn Mowing", unit: "SqFt", price: 0.04 },
    { category: "Landscaping", name: "Edging", unit: "LNF", price: 0.75 },
    { category: "Landscaping", name: "Hedge Trimming", unit: "Hours", price: 65 },
    { category: "Landscaping", name: "Mulch Installation", unit: "SqFt", price: 1.2 },
    { category: "Landscaping", name: "Weed Removal", unit: "Hours", price: 55 },
    { category: "Landscaping", name: "Leaf Cleanup", unit: "Hours", price: 60 },
    { category: "Landscaping", name: "Sprinkler Repair", unit: "Each", price: 95 },
    { category: "Handyman", name: "General Handyman Labor", unit: "Hours", price: 75 },
    { category: "Handyman", name: "Drywall Patch", unit: "Each", price: 125 },
    { category: "Handyman", name: "Fixture Replacement", unit: "Each", price: 85 },
    { category: "Handyman", name: "Door Repair", unit: "Each", price: 120 },
    { category: "Handyman", name: "Furniture Assembly", unit: "Hours", price: 65 },
    { category: "Handyman", name: "Fence Repair", unit: "LNF", price: 18 },
    { category: "Construction", name: "Paver Sealing", unit: "SqFt", price: 1.35 },
    { category: "Construction", name: "Fence Cleaning", unit: "LNF", price: 2.5 },
    { category: "Construction", name: "Deck Cleaning", unit: "SqFt", price: 0.35 },
    { category: "Construction", name: "Deck Staining", unit: "SqFt", price: 2.25 },
    { category: "Construction", name: "Concrete Sealing", unit: "SqFt", price: 0.85 },
    { category: "Construction", name: "Concrete Demo", unit: "SqFt", price: 4.5 },
    { category: "Construction", name: "Small Concrete Pour", unit: "SqFt", price: 12 },
    { category: "Construction", name: "Framing Repair", unit: "Hours", price: 95 },
    { category: "Misc", name: "Junk Haul Away", unit: "Each", price: 175 },
    { category: "Misc", name: "Trash Can Cleaning", unit: "Qty", price: 15 },
    { category: "Misc", name: "Solar Panel Cleaning", unit: "Qty", price: 10 },
    { category: "Misc", name: "Window Cleaning", unit: "Each", price: 8 },
    { category: "Misc", name: "Fleet Washing", unit: "Each", price: 45 },
    { category: "Misc", name: "Heavy Equipment Washing", unit: "Each", price: 125 },
    { category: "Misc", name: "Dumpster Pad Cleaning", unit: "Each", price: 95 },
    { category: "Misc", name: "Holiday Light Installation", unit: "LNF", price: 5 },
    { category: "Misc", name: "Christmas Light Removal", unit: "LNF", price: 1.5 }
  ];

  const onboardingServiceCategories = ["Pressure Washing", "Landscaping", "Handyman", "Construction", "Misc"];

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
