let statuses = [];
let jobs = [];
let customers = [];
let expenses = [];
let followUpTasks = [];
let selectedJobId = null;
let selectedCustomerId = null;
let selectedExpenseId = null;
let selectedExpenseJobId = "";
let activeView = "dashboard";
let settings = {};
let currentUser = null;
let csrfToken = "";
let dismissedNotificationIds = new Set(loadDismissedNotificationIds());

const {
  builtInServiceCatalog,
  builtInServiceTypes,
  onboardingServiceCategories,
  onboardingServiceLibrary
} = window.PressureFlowServiceCatalog;

let serviceCatalog = [...builtInServiceCatalog];
let defaultEstimateService = serviceCatalog.find((service) => service.name === "Pressure Washing") || serviceCatalog[0];
let serviceTypes = [...builtInServiceTypes];
const BUSINESS_LOGO_ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const BUSINESS_LOGO_MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const BUSINESS_LOGO_MAX_DATA_URL_BYTES = 1500000;
const BUSINESS_LOGO_MAX_DIMENSION = 900;
const JOB_FORM_DRAFT_KEY = "pressureflow.jobFormDraft.v1";

const {
  buildFullAddress,
  currency,
  escapeHtml,
  getDeposit,
  getFinalBalance,
  getPressureFlowInvoiceNumber,
  normalizeKey,
  roundMoney
} = window.PressureFlowUtils;

const {
  builtInTemplates,
  dashboardBreakdownColors,
  defaultBeforePhotoSections,
  estimateRejectionLabels,
  leadSources
} = window.PressureFlowUiConfig;

const {
  buildCityRevenueRows,
  buildServiceRevenueRows,
  createBreakdownRow,
  getAddressCity,
  isRevenueJob
} = window.PressureFlowDashboardUtils.createDashboardUtils({
  colors: dashboardBreakdownColors,
  normalizeKey,
  roundMoney
});

const {
  fileToPhoto,
  readFileAsDataUrl
} = window.PressureFlowPhotoUtils;

const {
  renderBeforePhotoPreview,
  renderBeforePhotoSections,
  renderEditablePhotoGrid,
  renderPhotoGrid
} = window.PressureFlowPhotoRendering.createPhotoRendering({
  escapeHtml
});

const {
  calculatePerimeterFeet,
  measurementGeojsonKey,
  normalizeMeasurementForEditing,
  recalculateMeasurementTotals
} = window.PressureFlowMeasurementUtils.createMeasurementUtils({
  buildStaticMapUrl,
  getTurf: () => window.turf,
  randomId: () => crypto.randomUUID()
});

const {
  renderSavedMeasurements: renderSavedMeasurementsList,
  syncSavedMeasurementChecks
} = window.PressureFlowMeasurementRendering.createMeasurementRendering({
  escapeHtml
});

const {
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
} = window.PressureFlowDetailRendering.createDetailRendering({
  currency,
  escapeHtml,
  estimateRejectionLabels,
  getBeforePhotoSections: () => beforePhotoSections,
  getPressureFlowInvoiceNumber,
  renderBeforePhotoSections,
  renderPhotoGrid
});

const jobList = document.querySelector("#jobList");
const jobDetail = document.querySelector("#jobDetail");
const customerList = document.querySelector("#customerList");
const customerDetail = document.querySelector("#customerDetail");
const expenseList = document.querySelector("#expenseList");
const expenseDetail = document.querySelector("#expenseDetail");
const pendingPaymentsPanel = document.querySelector("#pendingPaymentsPanel");
const pendingPaymentsList = document.querySelector("#pendingPaymentsList");
const statusFilter = document.querySelector("#statusFilter");
const dashboardTimeframe = document.querySelector("#dashboardTimeframe");
const dashboardBreakdown = document.querySelector("#dashboardBreakdown");
const dashboardChartTitle = document.querySelector("#dashboardChartTitle");
const dashboardBreakdownEyebrow = document.querySelector("#dashboardBreakdownEyebrow");
const dashboardBreakdownTitle = document.querySelector("#dashboardBreakdownTitle");
const dashboardFirstRunPanel = document.querySelector("#dashboardFirstRunPanel");
const dashboardFirstRunTitle = document.querySelector("#dashboardFirstRunTitle");
const dashboardFirstRunHint = document.querySelector("#dashboardFirstRunHint");
const dashboardPaymentSetupPanel = document.querySelector("#dashboardPaymentSetupPanel");
const sidebarBusinessName = document.querySelector("#sidebarBusinessName");
const notificationToggle = document.querySelector("#notificationToggle");
const notificationDropdown = document.querySelector("#notificationDropdown");
const notificationCount = document.querySelector("#notificationCount");
const notificationClearAll = document.querySelector("#notificationClearAll");
let toastContainer = null;

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
const newJobButton = document.querySelector("#newJobButton");
const editJobButton = document.querySelector("#editJobButton");
const newCustomerButton = document.querySelector("#newCustomerButton");
const editCustomerButton = document.querySelector("#editCustomerButton");
const newExpenseButton = document.querySelector("#newExpenseButton");
const expenseJobFilter = document.querySelector("#expenseJobFilter");
const settingsButton = document.querySelector("#settingsButton");
const templatesButton = document.querySelector("#templatesButton");
const navItems = document.querySelectorAll("[data-view]");
const viewPanels = document.querySelectorAll("[data-view-panel]");
const jobDialog = document.querySelector("#jobDialog");
const jobForm = document.querySelector("#jobForm");
const jobCustomerSelect = document.querySelector("#jobCustomerSelect");
const customerDialog = document.querySelector("#customerDialog");
const customerForm = document.querySelector("#customerForm");
const expenseDialog = document.querySelector("#expenseDialog");
const expenseForm = document.querySelector("#expenseForm");
const onboardingDialog = document.querySelector("#onboardingDialog");
const onboardingForm = document.querySelector("#onboardingForm");
const onboardingWizardServiceList = document.querySelector("#onboardingWizardServiceList");
const onboardingWizardStatus = document.querySelector("#onboardingWizardStatus");
const skipOnboardingButton = document.querySelector("#skipOnboardingButton");
const onboardingStepButtons = document.querySelectorAll("[data-onboarding-step]");
const onboardingStepPanels = document.querySelectorAll("[data-onboarding-panel]");
const onboardingBackButton = document.querySelector("#onboardingBackButton");
const onboardingNextButton = document.querySelector("#onboardingNextButton");
const onboardingSaveButton = document.querySelector("#onboardingSaveButton");
const onboardingDepositPercentField = document.querySelector("#onboardingDepositPercentField");
const settingsDialog = document.querySelector("#settingsDialog");
const settingsForm = document.querySelector("#settingsForm");
const settingsStatus = document.querySelector("#settingsStatus");
const onboardingServiceList = document.querySelector("#onboardingServiceList");
const saveOnboardingServicesButton = document.querySelector("#saveOnboardingServicesButton");
const restartOnboardingButton = document.querySelector("#restartOnboardingButton");
const onboardingStatus = document.querySelector("#onboardingStatus");
const emailIntegrationStatus = document.querySelector("#emailIntegrationStatus");
const squareIntegrationStatus = document.querySelector("#squareIntegrationStatus");
const stripeIntegrationStatus = document.querySelector("#stripeIntegrationStatus");
const quickBooksIntegrationStatus = document.querySelector("#quickBooksIntegrationStatus");
const onboardingLogoInput = document.querySelector("#onboardingLogoInput");
const onboardingLogoPreview = document.querySelector("#onboardingLogoPreview");
const clearOnboardingLogoButton = document.querySelector("#clearOnboardingLogoButton");
const businessLogoInput = document.querySelector("#businessLogoInput");
const businessLogoPreview = document.querySelector("#businessLogoPreview");
const clearBusinessLogoButton = document.querySelector("#clearBusinessLogoButton");
const googleClientIdField = document.querySelector("#googleClientIdField");
const googleClientSecretField = document.querySelector("#googleClientSecretField");
const googleRedirectUriField = document.querySelector("#googleRedirectUriField");
const mapboxTokenField = document.querySelector("#mapboxTokenField");
const backupExportLink = document.querySelector("#backupExportLink");
const userNameInput = document.querySelector("#userNameInput");
const userEmailInput = document.querySelector("#userEmailInput");
const userRoleInput = document.querySelector("#userRoleInput");
const userPasswordInput = document.querySelector("#userPasswordInput");
const addUserButton = document.querySelector("#addUserButton");
const settingsUserList = document.querySelector("#settingsUserList");
const settingsUserStatus = document.querySelector("#settingsUserStatus");
const templateList = document.querySelector("#templateList");
const templateUploadForm = document.querySelector("#templateUploadForm");
const templateFileInput = document.querySelector("#templateFileInput");
const templateUploadStatus = document.querySelector("#templateUploadStatus");
const jobDialogTitle = jobDialog.querySelector(".dialog-header h2");
const customerDialogTitle = customerDialog.querySelector(".dialog-header h2");
const expenseDialogTitle = expenseDialog.querySelector(".dialog-header h2");
const addServiceTypeButton = document.querySelector("#addServiceTypeButton");
const scheduleDialog = document.querySelector("#scheduleDialog");
const scheduleForm = document.querySelector("#scheduleForm");
const completionDialog = document.querySelector("#completionDialog");
const completionForm = document.querySelector("#completionForm");
const paymentDialog = document.querySelector("#paymentDialog");
const paymentForm = document.querySelector("#paymentForm");
const paymentDialogTitle = document.querySelector("#paymentDialogTitle");
const paymentDialogSummary = document.querySelector("#paymentDialogSummary");
const followUpDialog = document.querySelector("#followUpDialog");
const followUpForm = document.querySelector("#followUpForm");
const followUpPreviewSubject = document.querySelector("#followUpPreviewSubject");
const followUpPreviewBody = document.querySelector("#followUpPreviewBody");
const addLineItemButton = document.querySelector("#addLineItemButton");
const customServiceButton = document.querySelector("#customServiceButton");
const customServiceDialog = document.querySelector("#customServiceDialog");
const customServiceForm = document.querySelector("#customServiceForm");
const customServiceStatus = document.querySelector("#customServiceStatus");
const teamAccessSection = document.querySelector("#teamAccessSection");
const lineItemsContainer = document.querySelector("#lineItems");
const discountSelect = document.querySelector("#discountSelect");
const estimateSubtotal = document.querySelector("#estimateSubtotal");
const estimateDiscount = document.querySelector("#estimateDiscount");
const estimateDiscountRow = document.querySelector("#estimateDiscountRow");
const estimateTotal = document.querySelector("#estimateTotal");
const measurementDialog = document.querySelector("#measurementDialog");
const measurementAddress = document.querySelector("#measurementAddress");
const measurementMapElement = document.querySelector("#measurementMap");
const geocodeAddressButton = document.querySelector("#geocodeAddressButton");
const measuredArea = document.querySelector("#measuredArea");
const measurementStatus = document.querySelector("#measurementStatus");
const savedMeasurementsPanel = document.querySelector("#savedMeasurementsPanel");
const savedMeasurementsList = document.querySelector("#savedMeasurementsList");
const measurementAreaList = document.querySelector("#measurementAreaList");
const saveMeasurementAreaButton = document.querySelector("#saveMeasurementAreaButton");
const clearMeasurementButton = document.querySelector("#clearMeasurementButton");
const useMeasurementButton = document.querySelector("#useMeasurementButton");
const serviceAreaPhotoInputs = document.querySelectorAll("[data-service-area-photo-input]");
const serviceAreaPhotoPreview = document.querySelector("#serviceAreaPhotoPreview");
const beforePhotoRows = document.querySelector("#beforePhotoRows");
const addBeforePhotoButton = document.querySelector("#addBeforePhotoButton");
const beforePhotoPreview = document.querySelector("#beforePhotoPreview");
const completionBeforePhotoInputs = document.querySelectorAll("[data-completion-before-photo-input]");
const completionAfterPhotoInputs = document.querySelectorAll("[data-completion-after-photo-input]");
const completionBeforePhotoPreview = document.querySelector("#completionBeforePhotoPreview");
const completionAfterPhotoPreview = document.querySelector("#completionAfterPhotoPreview");
const photoViewerDialog = document.querySelector("#photoViewerDialog");
const photoViewerTitle = document.querySelector("#photoViewerTitle");
const photoViewerImage = document.querySelector("#photoViewerImage");
const receiptPhotoInput = document.querySelector("#receiptPhotoInput");
const receiptPhotoPreview = document.querySelector("#receiptPhotoPreview");
let pendingScheduleResolve = null;
let pendingCompletionResolve = null;
let pendingPaymentResolve = null;
let pendingFollowUpJobId = "";
let currentMeasurement = {};
let activeMeasurementAreaId = "";
let currentServiceAreaPhotos = [];
let currentJobPhotos = { before: [], after: [] };
let currentCompletionPhotos = { before: [], after: [] };
let currentReceiptPhotos = [];
let mapboxMap = null;
let mapboxDraw = null;
let activeMeasurementLineItem = null;
let completedJobsExpanded = false;
let syncingMeasurementDraw = false;
const MEASUREMENT_CLOSE_VERTEX_PIXEL_TOLERANCE = 6;
let beforePhotoRowCounter = 0;
let beforePhotoSections = [...defaultBeforePhotoSections];
let onboardingCurrentStep = 0;
let showPostOnboardingGuidance = false;
let restoringJobDraft = false;
let pendingWorkflowAction = "";
let workflowActionMessage = null;
const onboardingStepHelperText = [
  "Add the business basics that appear on estimates, invoices, and customer messages.",
  "Choose the services and starter rates this account should use for new estimates.",
  "Customers need at least one payment option before invoices are sent. Add options from Settings when setup is complete."
];

async function init() {
  navItems.forEach((item) => item.addEventListener("click", switchView));
  window.addEventListener("hashchange", handleWorkspaceHashChange);
  restoreWorkspaceStateFromHash();
  statusFilter.addEventListener("change", render);
  dashboardTimeframe.addEventListener("change", renderDashboard);
  dashboardBreakdown?.addEventListener("change", renderDashboard);
  notificationToggle?.addEventListener("click", toggleNotificationDropdown);
  notificationClearAll?.addEventListener("click", clearAllDashboardNotifications);
  document.addEventListener("click", closeNotificationDropdownFromOutside);
  document.addEventListener("click", handleSettingsPaymentClick);
  document.addEventListener("click", handleFirstCustomerClick);
  newJobButton.addEventListener("click", openNewJob);
  editJobButton.addEventListener("click", openEditJob);
  jobCustomerSelect?.addEventListener("change", selectJobCustomer);
  newCustomerButton.addEventListener("click", openNewCustomer);
  editCustomerButton.addEventListener("click", openEditCustomer);
  newExpenseButton.addEventListener("click", openNewExpense);
  expenseJobFilter?.addEventListener("change", () => {
    selectedExpenseJobId = expenseJobFilter.value;
    selectedExpenseId = null;
    renderExpenses();
    saveWorkspaceStateToHash();
  });
  settingsButton.addEventListener("click", openSettings);
  settingsDialog?.addEventListener("close", () => {
    settingsButton?.classList.remove("is-pressed");
    settingsButton?.setAttribute("aria-expanded", "false");
    settingsButton?.setAttribute("aria-pressed", "false");
  });
  templateUploadForm?.addEventListener("submit", uploadTemplate);
  jobForm.addEventListener("submit", createJob);
  jobForm.addEventListener("input", saveJobDraft);
  jobForm.addEventListener("change", saveJobDraft);
  customerForm.addEventListener("submit", saveCustomer);
  expenseForm.addEventListener("submit", saveExpense);
  expenseForm.elements.amount?.addEventListener("input", formatExpenseAmountInput);
  serviceAreaPhotoInputs.forEach((input) => {
    input.addEventListener("change", (event) => addPhotosFromInput(event, currentServiceAreaPhotos, renderServiceAreaPhotos));
  });
  addBeforePhotoButton?.addEventListener("click", () => addBeforePhotoRow());
  receiptPhotoInput.addEventListener("change", (event) => addPhotosFromInput(event, currentReceiptPhotos, renderReceiptPhotos));
  addLineItemButton.addEventListener("click", () => addLineItemRow());
  customServiceButton?.addEventListener("click", openCustomServiceDialog);
  customServiceForm?.addEventListener("submit", addCustomService);
  onboardingForm?.addEventListener("submit", saveOnboardingSetup);
  skipOnboardingButton?.addEventListener("click", finishOnboardingLater);
  onboardingForm?.elements.serviceIndustry?.addEventListener("change", () => renderOnboardingWizardServices());
  onboardingForm?.elements.customerSegment?.addEventListener("change", () => renderOnboardingWizardServices());
  onboardingForm?.elements.onboardingServiceScope?.addEventListener("change", () => renderOnboardingWizardServices());
  onboardingForm?.elements.defaultDepositEnabled?.addEventListener("change", syncOnboardingDepositVisibility);
  onboardingStepButtons.forEach((button) => {
    button.addEventListener("click", () => requestOnboardingStep(Number(button.dataset.onboardingStep)));
  });
  onboardingBackButton?.addEventListener("click", () => setOnboardingStep(onboardingCurrentStep - 1));
  onboardingNextButton?.addEventListener("click", goToNextOnboardingStep);
  restartOnboardingButton?.addEventListener("click", openOnboardingWizardFromSettings);
  saveOnboardingServicesButton?.addEventListener("click", saveOnboardingServices);
  addServiceTypeButton?.addEventListener("click", addServiceType);
  geocodeAddressButton.addEventListener("click", geocodeMeasurementAddress);
  savedMeasurementsPanel?.addEventListener("toggle", () => {
    savedMeasurementsPanel.dataset.userToggled = "true";
  });
  saveMeasurementAreaButton?.addEventListener("click", saveMeasurementArea);
  clearMeasurementButton.addEventListener("click", clearMeasurementPolygon);
  useMeasurementButton.addEventListener("click", useMeasurement);
  discountSelect.addEventListener("change", updateEstimateTotals);
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", closeDialogFromButton);
  });
  settingsForm.addEventListener("submit", saveSettings);
  onboardingLogoInput?.addEventListener("change", (event) => updateBusinessLogoFromInput(event, onboardingWizardStatus));
  clearOnboardingLogoButton?.addEventListener("click", () => clearBusinessLogo(onboardingLogoInput));
  businessLogoInput?.addEventListener("change", updateBusinessLogoFromInput);
  clearBusinessLogoButton?.addEventListener("click", () => clearBusinessLogo(businessLogoInput));
  addUserButton?.addEventListener("click", addSettingsUser);
  scheduleForm.addEventListener("submit", submitScheduleDialog);
  completionForm.addEventListener("submit", submitCompletionDialog);
  completionBeforePhotoInputs.forEach((input) => {
    input.addEventListener("change", (event) => addPhotosFromInput(event, currentCompletionPhotos.before, renderCompletionPhotoPreviews));
  });
  completionAfterPhotoInputs.forEach((input) => {
    input.addEventListener("change", (event) => addPhotosFromInput(event, currentCompletionPhotos.after, renderCompletionPhotoPreviews));
  });
  scheduleForm.querySelectorAll("[data-duration-step]").forEach((button) => {
    button.addEventListener("click", adjustScheduleDuration);
  });
  scheduleDialog.addEventListener("cancel", () => resolveScheduleDialog(null));
  completionDialog.addEventListener("cancel", () => resolveCompletionDialog(null));
  paymentDialog?.addEventListener("cancel", () => resolvePaymentDialog(null));
  paymentForm?.addEventListener("submit", submitPaymentDialog);
  followUpForm?.addEventListener("submit", submitFollowUpDialog);
  await loadSession();
  await loadSettings();
  await Promise.all([
    loadCustomers(),
    loadExpenses(),
    loadFollowUpTasks(),
    loadJobs()
  ]);
}

async function loadSession() {
  try {
    const response = await fetch("/api/session");
    if (!response.ok) return;
    const data = await readJsonResponse(response, "Unable to load session.");
    currentUser = data.user;
    csrfToken = data.csrfToken || "";
  } catch {
    currentUser = null;
    csrfToken = "";
  }
  applyAccountVisibility();
}

function switchView(event) {
  const view = event.currentTarget.dataset.view;
  setActiveView(view);
  saveWorkspaceStateToHash();
}

function setActiveView(view) {
  const validView = Array.from(viewPanels).some((panel) => panel.dataset.viewPanel === view)
    ? view
    : "dashboard";
  activeView = validView;
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === validView));
  viewPanels.forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== validView;
  });
  closeNotificationDropdown();
}

function restoreWorkspaceStateFromHash() {
  const state = readWorkspaceStateFromHash();
  selectedJobId = state.job || selectedJobId;
  selectedCustomerId = state.customer || selectedCustomerId;
  selectedExpenseId = state.expense || selectedExpenseId;
  selectedExpenseJobId = state.expenseJob || selectedExpenseJobId;
  setActiveView(state.view || activeView || "dashboard");
}

function handleWorkspaceHashChange() {
  restoreWorkspaceStateFromHash();
  render();
}

function readWorkspaceStateFromHash() {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const params = new URLSearchParams(hash);
  return {
    view: params.get("view") || "",
    job: params.get("job") || "",
    customer: params.get("customer") || "",
    expense: params.get("expense") || "",
    expenseJob: params.get("expenseJob") || ""
  };
}

function saveWorkspaceStateToHash() {
  const params = new URLSearchParams();
  params.set("view", activeView || "dashboard");
  if (selectedJobId) params.set("job", selectedJobId);
  if (selectedCustomerId) params.set("customer", selectedCustomerId);
  if (selectedExpenseId) params.set("expense", selectedExpenseId);
  if (selectedExpenseJobId) params.set("expenseJob", selectedExpenseJobId);
  const nextHash = `#${params.toString()}`;
  if (window.location.hash !== nextHash) {
    history.replaceState(null, "", nextHash);
  }
}

async function loadSettings() {
  try {
    const response = await fetch("/api/settings");
    const data = await readJsonResponse(response, "Unable to load settings.");
    settings = data.settings;
    syncServiceCatalog();
    applySettingsDefaults();
    renderTemplates();
    maybeOpenOnboarding();
  } catch (error) {
    settingsStatus.textContent = error.message;
  }
}

function maybeOpenOnboarding() {
  if (!onboardingDialog || currentUser?.isOwner || settings.onboardingCompleted) {
    return;
  }

  fillOnboardingForm();
  renderOnboardingWizardServices();
  setOnboardingStep(0);
  onboardingDialog.showModal();
}

function applySettingsDefaults() {
  const depositInput = jobForm.elements.depositPercent;
  if (depositInput) {
    depositInput.value = getDefaultDepositPercent();
  }
  if (sidebarBusinessName) {
    sidebarBusinessName.textContent = settings.businessName || "PressureFlow";
    sidebarBusinessName.classList.remove("loading-name");
  }
}

function getDefaultDepositPercent() {
  return settings.defaultDepositEnabled === false ? 0 : settings.defaultDepositPercent || 25;
}

function syncServiceCatalog() {
  const customServices = Array.isArray(settings.customServices) ? settings.customServices : [];
  serviceCatalog = [...new Map([...builtInServiceCatalog, ...customServices]
    .map((service) => [String(service.name || "").toLowerCase(), service])).values()];
  defaultEstimateService = getDefaultEstimateService(customServices);
  serviceTypes = [...builtInServiceTypes, ...(settings.customServiceTypes || [])]
    .filter((name, index, all) => all.findIndex((item) => item.toLowerCase() === String(name || "").toLowerCase()) === index);
  beforePhotoSections = [...beforePhotoSections, ...(settings.customPhotoSections || [])]
    .filter((name, index, all) => all.findIndex((item) => item.toLowerCase() === String(name || "").toLowerCase()) === index);
  renderServiceTypeOptions();
  renderBeforePhotoSectionOptions();
  renderOnboardingServices();
}

function getDefaultEstimateService(customServices = []) {
  const industryServices = customServices.filter((service) => service.source === "onboarding");
  if (settings.serviceIndustry && settings.serviceIndustry !== "Pressure Washing" && industryServices.length) {
    return industryServices[0];
  }

  return serviceCatalog.find((service) => service.name === "Pressure Washing") || industryServices[0] || serviceCatalog[0];
}

function formatUnitLabel(unit = "") {
  const value = String(unit || "Qty").trim();
  if (!value) return "unit";
  if (value.toLowerCase() === "per hour" || value.toLowerCase() === "hours") return "Hours";
  if (value.toLowerCase() === "qty") return "Qty";
  return value;
}

function formatRateUnit(unit = "") {
  const raw = String(unit || "").trim().toLowerCase();
  if (raw === "per hour" || raw === "hours") return "per hour";
  const label = formatUnitLabel(unit);
  if (label.toLowerCase() === "flat rate") return "flat rate";
  return `per ${label}`;
}

function renderServiceTypeOptions(selectedValue = jobForm?.elements.serviceType?.value || "") {
  const field = jobForm?.elements.serviceType;
  if (!field) return;

  if (field.tagName !== "SELECT") {
    if (selectedValue) {
      field.value = selectedValue;
    }
    return;
  }

  const currentValue = selectedValue || field.value || serviceTypes[0] || "";
  field.innerHTML = serviceTypes.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  field.value = serviceTypes.includes(currentValue) ? currentValue : serviceTypes[0] || "";
}

function renderBeforePhotoSectionOptions(selectedValue = "") {
  if (!beforePhotoRows) return;

  beforePhotoRows.querySelectorAll("[data-before-photo-section-select]").forEach((select) => {
    const currentValue = select.value && select.value !== "__new_area__"
      ? select.value
      : selectedValue || beforePhotoSections[0] || "";
    select.innerHTML = getBeforePhotoAreaOptions(currentValue);
    select.value = beforePhotoSections.includes(currentValue) ? currentValue : beforePhotoSections[0] || "";
  });
}

function getBeforePhotoAreaOptions(selectedValue = "") {
  const options = beforePhotoSections.map((name) => `
    <option value="${escapeHtml(name)}"${name === selectedValue ? " selected" : ""}>${escapeHtml(name)}</option>
  `);
  options.push('<option value="__new_area__">Add new Area</option>');
  return options.join("");
}

function renderOnboardingServices() {
  if (!onboardingServiceList) return;

  renderServicePicker(onboardingServiceList);
  updateOnboardingStatus();
}

function renderOnboardingWizardServices() {
  if (!onboardingWizardServiceList) return;

  renderServicePicker(onboardingWizardServiceList, onboardingForm?.elements.serviceIndustry?.value || settings.serviceIndustry || "", {
    customerSegment: onboardingForm?.elements.customerSegment?.value || settings.customerSegment || "residential",
    seedServices: !settings.onboardingCompleted,
    serviceScope: onboardingForm?.elements.onboardingServiceScope?.value || settings.onboardingServiceScope || "recommended"
  });
}

function renderServicePicker(container, preferredCategory = "", options = {}) {
  const savedServices = Array.isArray(settings.customServices) ? settings.customServices : [];
  const savedByName = new Map(savedServices.map((service) => [String(service.name || "").toLowerCase(), service]));
  const seededServiceNames = options.seedServices
    ? getSeededOnboardingServiceNames(preferredCategory, options.serviceScope, options.customerSegment)
    : new Set();
  const orderedCategories = preferredCategory
    ? [
        preferredCategory,
        ...onboardingServiceCategories.filter((category) => category !== preferredCategory)
      ]
    : onboardingServiceCategories;
  container.innerHTML = orderedCategories.map((category) => {
    const services = onboardingServiceLibrary.filter((service) => service.category === category);
    const selectedCount = services.filter((service) => savedByName.has(service.name.toLowerCase()) || seededServiceNames.has(service.name)).length;
    const shouldOpen = selectedCount || category === preferredCategory;
    return `
      <details class="service-category" ${shouldOpen ? "open" : ""}>
        <summary>
          <span>${escapeHtml(category)}</span>
          <small>${selectedCount}/${services.length} saved</small>
        </summary>
        <div class="service-category-actions">
          <button class="secondary-small-button" type="button" data-select-category="${escapeHtml(category)}">Select All</button>
          <button class="secondary-small-button" type="button" data-unselect-category="${escapeHtml(category)}">Unselect All</button>
        </div>
        <div class="service-category-list">
          ${services.map((service) => renderOnboardingServiceRow(service, savedByName, seededServiceNames)).join("")}
        </div>
      </details>
    `;
  }).join("");

  container.querySelectorAll("[data-onboarding-service-toggle]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const row = checkbox.closest("[data-onboarding-service]");
      row.classList.toggle("selected", checkbox.checked);
      row.querySelector("[data-onboarding-service-rate]").disabled = !checkbox.checked;
      updateServiceCategoryCount(row.closest(".service-category"));
    });
  });

  container.querySelectorAll(".service-category").forEach(updateServiceCategoryCount);
  container.querySelectorAll("[data-select-category]").forEach((button) => {
    button.addEventListener("click", () => selectAllServicesInCategory(button.closest(".service-category")));
  });
  container.querySelectorAll("[data-unselect-category]").forEach((button) => {
    button.addEventListener("click", () => unselectAllServicesInCategory(button.closest(".service-category")));
  });
}

function getSeededOnboardingServiceNames(preferredCategory, serviceScope = "recommended", customerSegment = "residential") {
  if (!preferredCategory || serviceScope === "custom") {
    return new Set();
  }

  const categoryServices = onboardingServiceLibrary.filter((service) => service.category === preferredCategory);
  const seedCount = {
    starter: 3,
    recommended: 6,
    full: categoryServices.length
  }[serviceScope] || 6;
  const seededServices = categoryServices.slice(0, seedCount);
  if ((customerSegment === "commercial" || customerSegment === "both") && preferredCategory === "Pressure Washing") {
    ["Commercial Exterior Cleaning", "Restaurant Pad Cleaning"].forEach((serviceName) => {
      const service = categoryServices.find((item) => item.name === serviceName);
      if (service && !seededServices.some((item) => item.name === service.name)) {
        seededServices.push(service);
      }
    });
  }

  return new Set(seededServices.map((service) => service.name));
}

function selectAllServicesInCategory(categoryElement) {
  if (!categoryElement) return;

  categoryElement.querySelectorAll("[data-onboarding-service]").forEach((row) => {
    const checkbox = row.querySelector("[data-onboarding-service-toggle]");
    const rate = row.querySelector("[data-onboarding-service-rate]");
    checkbox.checked = true;
    row.classList.add("selected");
    if (rate) {
      rate.disabled = false;
    }
  });
  updateServiceCategoryCount(categoryElement);
}

function unselectAllServicesInCategory(categoryElement) {
  if (!categoryElement) return;

  categoryElement.querySelectorAll("[data-onboarding-service]").forEach((row) => {
    const checkbox = row.querySelector("[data-onboarding-service-toggle]");
    const rate = row.querySelector("[data-onboarding-service-rate]");
    checkbox.checked = false;
    row.classList.remove("selected");
    if (rate) {
      rate.disabled = true;
    }
  });
  updateServiceCategoryCount(categoryElement);
}

function updateOnboardingStatus() {
  if (onboardingStatus) {
    const savedServices = Array.isArray(settings.customServices) ? settings.customServices : [];
    const selectedCount = savedServices.filter((service) => service.source === "onboarding").length;
    onboardingStatus.textContent = settings.onboardingCompleted
      ? `${selectedCount || savedServices.length} default services saved for this account.`
      : "Select services and save rates to finish account setup.";
  }
}

function renderOnboardingServiceRow(service, savedByName, seededServiceNames = new Set()) {
    const saved = savedByName.get(service.name.toLowerCase());
    const checked = Boolean(saved) || seededServiceNames.has(service.name);
    const rate = Number(saved?.price ?? service.price ?? 0);
    const unit = saved?.unit || service.unit;
    return `
      <div class="onboarding-service-row${checked ? " selected" : ""}" data-onboarding-service="${escapeHtml(service.name)}">
        <label class="checkbox-field">
          <input type="checkbox" data-onboarding-service-toggle ${checked ? "checked" : ""}>
          <span>${escapeHtml(service.name)}</span>
        </label>
        <span class="service-unit">${escapeHtml(formatUnitLabel(unit))}</span>
        <label>
          Rate (${escapeHtml(formatRateUnit(unit))})
          <input data-onboarding-service-rate type="number" min="0" step="0.01" value="${rate}" ${checked ? "" : "disabled"}>
        </label>
      </div>
    `;
}

function updateServiceCategoryCount(categoryElement) {
  if (!categoryElement) return;
  const total = categoryElement.querySelectorAll("[data-onboarding-service]").length;
  const selected = categoryElement.querySelectorAll("[data-onboarding-service-toggle]:checked").length;
  const count = categoryElement.querySelector("summary small");
  if (count) {
    count.textContent = `${selected}/${total} saved`;
  }
}

async function saveOnboardingServices() {
  if (!onboardingServiceList) return;

  const selectedServices = getSelectedOnboardingServices(onboardingServiceList);

  if (!selectedServices.length) {
    onboardingStatus.textContent = "Choose at least one service.";
    return;
  }

  const preservedServices = (settings.customServices || []).filter((service) => service.source !== "onboarding");
  const customServices = [...preservedServices, ...selectedServices];

  try {
    onboardingStatus.textContent = "Saving service defaults...";
    const data = await apiRequest("/api/settings", { ...settings, customServices, onboardingCompleted: true });
    settings = data.settings;
    syncServiceCatalog();
    renderLineItems(getEstimateLineItems().length ? getEstimateLineItems() : [{ ...defaultEstimateService, quantity: 0 }]);
    onboardingStatus.textContent = `${selectedServices.length} default services saved for this account.`;
  } catch (error) {
    onboardingStatus.textContent = error.message;
  }
}

function getSelectedOnboardingServices(container) {
  return Array.from(container.querySelectorAll("[data-onboarding-service]"))
    .filter((row) => row.querySelector("[data-onboarding-service-toggle]").checked)
    .map((row) => {
      const libraryService = onboardingServiceLibrary.find((service) => service.name === row.dataset.onboardingService);
      if (!libraryService) return null;
      return {
        id: `onboarding-${slugifyServiceName(libraryService.name)}`,
        source: "onboarding",
        name: libraryService.name,
        unit: libraryService.unit,
        price: Number(row.querySelector("[data-onboarding-service-rate]").value || libraryService.price || 0)
      };
    })
    .filter(Boolean);
}

function slugifyServiceName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || crypto.randomUUID();
}

async function loadJobs() {
  try {
    const response = await fetch("/api/jobs");
    const data = await readJsonResponse(response, "Unable to load jobs.");
    jobs = data.jobs;
    statuses = data.statuses;
    selectedJobId = selectedJobId ?? jobs[0]?.id ?? null;
    renderStatusOptions();
    render();
  } catch (error) {
    jobList.innerHTML = renderEmptyState("Unable to load jobs", "Start the local server with node server.js, then open http://localhost:3000.");
    jobDetail.innerHTML = renderEmptyState("Unable to load job details", error.message);
  }
}

async function loadCustomers() {
  try {
    const response = await fetch("/api/customers");
    const data = await readJsonResponse(response, "Unable to load customers.");
    customers = data.customers || [];
    selectedCustomerId = selectedCustomerId ?? customers[0]?.id ?? null;
    renderJobCustomerOptions();
    renderCustomers();
  } catch (error) {
    customerList.innerHTML = renderEmptyState("Unable to load customers", error.message);
    customerDetail.innerHTML = renderEmptyState("Unable to load customer details", error.message);
  }
}

function renderJobCustomerOptions() {
  if (!jobCustomerSelect) return;

  const selectedValue = jobForm.elements.customerId.value || "";
  jobCustomerSelect.innerHTML = `
    <option value="">Select an existing customer</option>
    ${customers.map((customer) => `
      <option value="${escapeHtml(customer.id)}">${escapeHtml(formatCustomerSearchValue(customer))}</option>
    `).join("")}
  `;
  if (customers.some((customer) => customer.id === selectedValue)) {
    jobCustomerSelect.value = selectedValue;
  }
}

function selectJobCustomer(event) {
  const value = event.target.value;
  const customer = customers.find((item) => item.id === value);
  if (!customer) {
    jobForm.elements.customerId.value = "";
    return;
  }

  fillJobCustomerFields(customer);
}

function formatCustomerSearchValue(customer) {
  return `${customer.customerName || "Unnamed customer"}${customer.address ? ` - ${customer.address}` : ""}`;
}

function fillJobCustomerFields(customer) {
  jobForm.elements.customerId.value = customer.id || "";
  jobForm.elements.customerName.value = customer.customerName || "";
  jobForm.elements.email.value = customer.email || "";
  jobForm.elements.phone.value = customer.phone || "";
  fillAddressFields(jobForm, customer);
  jobForm.elements.leadSource.value = customer.leadSource || "referral";
  if (jobCustomerSelect) {
    jobCustomerSelect.value = customer.id || "";
  }
}

async function loadExpenses() {
  try {
    const response = await fetch("/api/expenses");
    const data = await readJsonResponse(response, "Unable to load expenses.");
    expenses = data.expenses || [];
    selectedExpenseId = selectedExpenseId ?? expenses[0]?.id ?? null;
    renderExpenses();
  } catch (error) {
    expenseList.innerHTML = renderEmptyState("Unable to load expenses", error.message);
    expenseDetail.innerHTML = renderEmptyState("Unable to load expense details", error.message);
  }
}

async function loadFollowUpTasks() {
  try {
    const response = await fetch("/api/follow-up-tasks");
    const data = await readJsonResponse(response, "Unable to load follow-up tasks.");
    followUpTasks = data.tasks || [];
  } catch {
    followUpTasks = [];
  }
}

function renderStatusOptions() {
  const currentValue = statusFilter.value || "all";
  statusFilter.innerHTML = '<option value="all">All statuses</option>';

  statuses.forEach((status) => {
    const option = document.createElement("option");
    option.value = status;
    option.textContent = status;
    statusFilter.append(option);
  });

  statusFilter.value = statuses.includes(currentValue) ? currentValue : "all";
}

function openSettings(options = {}) {
  fillSettingsForm();
  applyAccountVisibility();
  if (currentUser?.isOwner) {
    loadSettingsUsers();
  }
  settingsButton?.classList.add("is-pressed");
  settingsButton?.setAttribute("aria-expanded", "true");
  settingsButton?.setAttribute("aria-pressed", "true");
  if (!settingsDialog.open) {
    settingsDialog.showModal();
  }
  if (options.section === "payment") {
    const paymentTarget = settingsDialog.querySelector("#settingsPaymentSection");
    paymentTarget?.scrollIntoView({ block: "center" });
    paymentTarget?.querySelector("input, select, textarea, button")?.focus();
    return;
  }
  settingsDialog.querySelector(".modal__close, input, select, textarea, button")?.focus();
}

function handleSettingsPaymentClick(event) {
  const trigger = event.target.closest("[data-open-settings-payment]");
  if (!trigger) return;

  event.preventDefault();
  openSettings({ section: "payment" });
}

function handleFirstCustomerClick(event) {
  const trigger = event.target.closest("[data-open-first-customer]");
  if (!trigger) return;

  event.preventDefault();
  openFirstCustomerFlow();
}

function openFirstCustomerFlow() {
  setActiveView("customers");
  renderCustomers();
  saveWorkspaceStateToHash();
  openNewCustomer();
}

function viewJobInPipeline(jobId) {
  selectedJobId = jobId || selectedJobId;
  setActiveView("pipeline");
  render();
}

function openNewJobForCustomerId(customerId) {
  const customer = customers.find((item) => item.id === customerId);
  if (customer) {
    openNewJobForCustomer(customer);
  }
}

function openOnboardingWizardFromSettings() {
  if (!onboardingDialog) return;

  if (settingsDialog?.open) {
    settingsDialog.close();
  }
  fillOnboardingForm();
  renderOnboardingWizardServices();
  onboardingDialog.showModal();
}

function fillOnboardingForm() {
  if (!onboardingForm) return;

  onboardingForm.elements.businessName.value = settings.businessName || "";
  onboardingForm.elements.serviceIndustry.value = settings.serviceIndustry || "";
  onboardingForm.elements.customerSegment.value = settings.customerSegment || "residential";
  onboardingForm.elements.onboardingServiceScope.value = settings.onboardingServiceScope || "recommended";
  onboardingForm.elements.businessEmail.value = settings.businessEmail || "";
  onboardingForm.elements.businessPhone.value = settings.businessPhone || "";
  onboardingForm.elements.defaultDepositEnabled.value = settings.defaultDepositEnabled === false ? "false" : "true";
  onboardingForm.elements.defaultDepositPercent.value = settings.defaultDepositPercent || 25;
  onboardingForm.elements.emailSendProvider.value = settings.emailSendProvider || "google";
  syncOnboardingDepositVisibility();
  renderBusinessLogoPreview();
  setOnboardingStep(0);
}

function setOnboardingStep(stepIndex) {
  if (!onboardingStepPanels.length) return;

  const maxStep = onboardingStepPanels.length - 1;
  onboardingCurrentStep = Math.min(Math.max(Number(stepIndex) || 0, 0), maxStep);
  onboardingStepPanels.forEach((panel, index) => {
    panel.hidden = index !== onboardingCurrentStep;
  });
  onboardingStepButtons.forEach((button, index) => {
    const active = index === onboardingCurrentStep;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "step" : "false");
  });
  if (onboardingBackButton) {
    onboardingBackButton.hidden = onboardingCurrentStep === 0;
  }
  if (onboardingNextButton) {
    onboardingNextButton.hidden = onboardingCurrentStep === maxStep;
  }
  if (onboardingSaveButton) {
    onboardingSaveButton.hidden = onboardingCurrentStep !== maxStep;
  }
  updateOnboardingHelperText();
}

function updateOnboardingHelperText() {
  if (!onboardingWizardStatus) return;

  onboardingWizardStatus.textContent = onboardingStepHelperText[onboardingCurrentStep] || onboardingStepHelperText[0];
}

function requestOnboardingStep(stepIndex) {
  if (stepIndex > onboardingCurrentStep && !validateOnboardingStep()) {
    return;
  }

  setOnboardingStep(stepIndex);
}

function goToNextOnboardingStep() {
  if (!validateOnboardingStep()) {
    return;
  }

  setOnboardingStep(onboardingCurrentStep + 1);
}

function validateOnboardingStep() {
  const currentPanel = onboardingStepPanels[onboardingCurrentStep];
  const invalidField = currentPanel?.querySelector("input:invalid, select:invalid, textarea:invalid");
  if (invalidField) {
    invalidField.reportValidity();
    return false;
  }

  return true;
}

function syncOnboardingDepositVisibility() {
  if (!onboardingForm || !onboardingDepositPercentField) return;

  const enabled = onboardingForm.elements.defaultDepositEnabled.value !== "false";
  onboardingDepositPercentField.hidden = !enabled;
  onboardingForm.elements.defaultDepositPercent.disabled = !enabled;
}

async function saveOnboardingSetup(event) {
  event.preventDefault();
  if (!onboardingForm || !onboardingWizardServiceList) return;
  if (onboardingCurrentStep < onboardingStepPanels.length - 1) {
    goToNextOnboardingStep();
    return;
  }

  const payload = {
    ...settings,
    ...Object.fromEntries(new FormData(onboardingForm).entries())
  };
  payload.defaultDepositEnabled = payload.defaultDepositEnabled !== "false";
  payload.defaultDepositPercent = Number(payload.defaultDepositPercent);
  if (!payload.defaultDepositEnabled) {
    payload.defaultDepositPercent = 0;
  }
  payload.defaultJobDurationMinutes = Number(settings.defaultJobDurationMinutes || 180);
  payload.businessLogoDataUrl = settings.businessLogoDataUrl || "";

  const selectedServices = getSelectedOnboardingServices(onboardingWizardServiceList);
  if (!selectedServices.length) {
    onboardingWizardStatus.textContent = "Choose at least one saved service.";
    return;
  }

  const preservedServices = (settings.customServices || []).filter((service) => service.source !== "onboarding");
  payload.customServices = [...preservedServices, ...selectedServices];
  payload.onboardingCompleted = true;

  try {
    onboardingWizardStatus.textContent = "Saving account setup...";
    const data = await apiRequest("/api/settings", payload);
    settings = data.settings;
    syncServiceCatalog();
    applySettingsDefaults();
    fillSettingsForm();
    onboardingDialog.close();
    showPostOnboardingGuidance = true;
    setActiveView("dashboard");
    renderDashboard();
    saveWorkspaceStateToHash();
    showToast("Workspace setup complete.", "success", {
      label: "Create your first customer",
      onClick: openFirstCustomerFlow
    });
  } catch (error) {
    onboardingWizardStatus.textContent = error.message;
  }
}

async function finishOnboardingLater() {
  if (!onboardingDialog) return;

  try {
    const data = await apiRequest("/api/settings", { ...settings, onboardingCompleted: true });
    settings = data.settings;
    syncServiceCatalog();
    applySettingsDefaults();
    onboardingDialog.close();
    showPostOnboardingGuidance = true;
    setActiveView("dashboard");
    renderDashboard();
    saveWorkspaceStateToHash();
    showToast("Workspace setup saved.", "success", {
      label: "Create your first customer",
      onClick: openFirstCustomerFlow
    });
  } catch (error) {
    onboardingWizardStatus.textContent = error.message;
  }
}

function applyAccountVisibility() {
  const isOwner = Boolean(currentUser?.isOwner);
  [teamAccessSection, mapboxTokenField, backupExportLink, googleClientIdField, googleClientSecretField, googleRedirectUriField].forEach((element) => {
    if (!element) return;
    element.hidden = !isOwner;
    element.style.display = isOwner ? "" : "none";
  });
}

function fillSettingsForm() {
  settingsForm.elements.businessName.value = settings.businessName || "";
  settingsForm.elements.businessEmail.value = settings.businessEmail || "";
  settingsForm.elements.businessPhone.value = settings.businessPhone || "";
  settingsForm.elements.serviceIndustry.value = settings.serviceIndustry || "";
  settingsForm.elements.defaultDepositPercent.value = settings.defaultDepositPercent || 25;
  settingsForm.elements.defaultJobDurationMinutes.value = settings.defaultJobDurationMinutes || 180;
  settingsForm.elements.zellePayment.value = settings.zellePayment || "";
  settingsForm.elements.cashAppPayment.value = settings.cashAppPayment || "";
  settingsForm.elements.venmoPayment.value = settings.venmoPayment || "";
  settingsForm.elements.paymentInstructions.value = settings.paymentInstructions || "";
  settingsForm.elements.paymentFollowUpHours.value = String(settings.paymentFollowUpHours ?? 48);
  settingsForm.elements.estimateFollowUpEnabled.value = String(settings.estimateFollowUpEnabled !== false);
  settingsForm.elements.estimateFollowUpDelayHours.value = String(settings.estimateFollowUpDelayHours ?? 24);
  settingsForm.elements.estimateFollowUpSubject.value = settings.estimateFollowUpSubject || "Following up on your estimate - {jobTitle} at {address}";
  settingsForm.elements.estimateFollowUpBody.value = settings.estimateFollowUpBody || getDefaultEstimateFollowUpBody();
  const reviewRequestToggle = settingsForm.querySelector('input[type="checkbox"][name="reviewRequestEnabled"]');
  if (reviewRequestToggle) {
    reviewRequestToggle.checked = settings.reviewRequestEnabled !== false;
  }
  settingsForm.elements.reviewRequestDelayHours.value = String(settings.reviewRequestDelayHours ?? 24);
  settingsForm.elements.reviewRequestSubject.value = settings.reviewRequestSubject || "Would you leave {businessName} a quick review?";
  settingsForm.elements.reviewRequestBody.value = settings.reviewRequestBody || getDefaultReviewRequestBody();
  settingsForm.elements.googleReviewUrl.value = settings.googleReviewUrl || "";
  settingsForm.elements.yelpReviewUrl.value = settings.yelpReviewUrl || "";
  settingsForm.elements.facebookReviewUrl.value = settings.facebookReviewUrl || "";
  settingsForm.elements.otherReviewUrl.value = settings.otherReviewUrl || "";
  settingsForm.elements.dayOfServiceInstructions.value = settings.dayOfServiceInstructions || "";
  settingsForm.elements.googleCalendarId.value = settings.googleCalendarId || "";
  settingsForm.elements.googleClientId.value = settings.googleClientId || "";
  settingsForm.elements.googleClientSecret.value = "";
  settingsForm.elements.googleClientSecret.placeholder = settings.hasGoogleClientSecret ? "Leave blank to keep saved secret" : "Enter Google client secret";
  settingsForm.elements.googleRedirectUri.value = settings.googleRedirectUri || "";
  settingsForm.elements.mapboxPublicToken.value = currentUser?.isOwner ? settings.mapboxPublicToken || "" : "";
  settingsForm.elements.emailSendProvider.value = settings.emailSendProvider || "google";
  settingsForm.elements.smtpHost.value = settings.smtpHost || "";
  settingsForm.elements.smtpPort.value = settings.smtpPort || 587;
  settingsForm.elements.smtpSecurity.value = settings.smtpSecurity || "starttls";
  settingsForm.elements.smtpUsername.value = settings.smtpUsername || "";
  settingsForm.elements.smtpPassword.value = "";
  settingsForm.elements.smtpPassword.placeholder = settings.hasSmtpPassword ? "Leave blank to keep saved SMTP password" : "Enter SMTP/app password";
  settingsForm.elements.smtpFromEmail.value = settings.smtpFromEmail || "";
  settingsForm.elements.squareEnvironment.value = settings.squareEnvironment || "sandbox";
  settingsForm.elements.squareLocationId.value = settings.squareLocationId || "";
  settingsForm.elements.squareAccessToken.value = "";
  settingsForm.elements.squareAccessToken.placeholder = settings.hasSquareAccessToken ? "Leave blank to keep saved token" : "Enter Square access token";
  settingsForm.elements.squareWebhookSignatureKey.value = "";
  settingsForm.elements.squareWebhookSignatureKey.placeholder = settings.hasSquareWebhookSignatureKey ? "Leave blank to keep saved webhook key" : "Enter Square webhook key";
  settingsForm.elements.stripeSecretKey.value = "";
  settingsForm.elements.stripeSecretKey.placeholder = settings.hasStripeSecretKey ? "Leave blank to keep saved Stripe key" : "Enter Stripe secret key";
  settingsForm.elements.stripeWebhookSecret.value = "";
  settingsForm.elements.stripeWebhookSecret.placeholder = settings.hasStripeWebhookSecret ? "Leave blank to keep saved webhook secret" : "Enter Stripe webhook secret";
  settingsForm.elements.quickBooksCompanyId.value = settings.quickBooksCompanyId || "";
  settingsForm.elements.quickBooksClientId.value = settings.quickBooksClientId || "";
  settingsForm.elements.quickBooksClientSecret.value = "";
  settingsForm.elements.quickBooksClientSecret.placeholder = settings.hasQuickBooksClientSecret ? "Leave blank to keep saved secret" : "Enter QuickBooks client secret";
  settingsForm.elements.quickBooksRedirectUri.value = settings.quickBooksRedirectUri || "";
  renderIntegrationStatuses();
  if (businessLogoInput) {
    businessLogoInput.value = "";
  }
  renderBusinessLogoPreview();

  const googleText = settings.hasGoogleRefreshToken ? " Google Calendar connected." : settings.hasGoogleClientSecret ? " Google secret saved. Connect Calendar next." : "";
  settingsStatus.textContent = googleText || "PressureFlow invoices will use the payment methods saved above.";
}

function renderIntegrationStatuses() {
  if (emailIntegrationStatus) {
    emailIntegrationStatus.textContent = settings.emailSendProvider === "smtp"
      ? settings.hasSmtpPassword
        ? "SMTP sending is saved for this account."
        : "SMTP selected. Save an SMTP/app password before sending email."
      : settings.hasGoogleRefreshToken
        ? "Google/Gmail sending is connected."
        : "Google/Gmail selected. Connect Google Calendar to send automated emails.";
  }
  if (squareIntegrationStatus) {
    squareIntegrationStatus.textContent = settings.hasSquareAccessToken
      ? `Square token saved${settings.squareLocationId ? ` for ${settings.squareLocationId}` : ""}.`
      : "Square is not connected yet.";
  }
  if (stripeIntegrationStatus) {
    stripeIntegrationStatus.textContent = settings.hasStripeSecretKey
      ? "Stripe secret key saved for this account."
      : "Stripe is not connected yet.";
  }
  if (quickBooksIntegrationStatus) {
    quickBooksIntegrationStatus.textContent = settings.quickBooksCompanyId || settings.hasQuickBooksClientSecret
      ? "QuickBooks profile saved for this account."
      : "QuickBooks is not connected yet.";
  }
}

function getDefaultEstimateFollowUpBody() {
  return [
    "Hi {firstName},",
    "",
    "Just wanted to follow up on the estimate we sent for {jobTitle} at {address}.",
    "",
    "Your estimate of {estimateTotal} is still available for review. Let us know if you have any questions - we're happy to walk you through it.",
    "",
    "Thank you,",
    "{businessName}"
  ].join("\n");
}

function getDefaultReviewRequestBody() {
  return [
    "Hi {firstName},",
    "",
    "Thank you again for choosing {businessName} for {jobTitle} at {address}.",
    "",
    "If you are satisfied with the work, it would mean the world to receive a 5-star review.",
    "",
    "{reviewLinks}",
    "",
    "Thank you,",
    "{businessName}"
  ].join("\n");
}

async function saveSettings(event) {
  if (event.submitter?.value === "cancel") {
    return;
  }

  event.preventDefault();
  const payload = Object.fromEntries(new FormData(settingsForm).entries());
  payload.defaultDepositPercent = Number(payload.defaultDepositPercent);
  payload.defaultJobDurationMinutes = Number(payload.defaultJobDurationMinutes);
  payload.businessLogoDataUrl = settings.businessLogoDataUrl || "";
  if (!currentUser?.isOwner) {
    delete payload.mapboxPublicToken;
    delete payload.googleClientId;
    delete payload.googleClientSecret;
    delete payload.googleRedirectUri;
  }

  try {
    const data = await apiRequest("/api/settings", payload);
    settings = data.settings;
    settingsDialog.close();
    applySettingsDefaults();
    settingsStatus.textContent = "Settings saved.";
    showToast("Settings saved.", "success");
  } catch (error) {
    settingsStatus.textContent = error.message;
  }
}

async function loadSettingsUsers() {
  if (!settingsUserList) return;

  try {
    const response = await fetch("/api/users");
    const data = await readJsonResponse(response, "Unable to load users.");
    renderSettingsUsers(data.users || []);
    settingsUserStatus.textContent = "Team logins are for invited testers only.";
  } catch (error) {
    settingsUserList.innerHTML = renderEmptyState("Unable to load team users");
    settingsUserStatus.textContent = error.message;
  }
}

function renderSettingsUsers(users) {
  if (!settingsUserList) return;

  if (!users.length) {
    settingsUserList.innerHTML = renderEmptyState("No invited users yet", "Added users will show up here.");
    return;
  }

  settingsUserList.innerHTML = users.map((user) => `
    <div class="settings-user-row">
      <span>
        <strong>${escapeHtml(user.name || user.email)}</strong>
        <small>${escapeHtml(user.email)} | ${escapeHtml(formatUserRole(user.role))}${user.lastLoginAt ? ` | Last login ${escapeHtml(formatShortDate(user.lastLoginAt))}` : ""}</small>
      </span>
      <button class="icon-button" type="button" title="Remove user" data-delete-user="${escapeHtml(user.id)}">X</button>
    </div>
  `).join("");

  settingsUserList.querySelectorAll("[data-delete-user]").forEach((button) => {
    button.addEventListener("click", () => deleteSettingsUser(button.dataset.deleteUser));
  });
}

async function addSettingsUser() {
  const payload = {
    name: userNameInput.value,
    email: userEmailInput.value,
    role: userRoleInput.value,
    password: userPasswordInput.value
  };

  try {
    settingsUserStatus.textContent = "Adding user...";
    const data = await apiRequest("/api/users", payload);
    renderSettingsUsers(data.users || []);
    userNameInput.value = "";
    userEmailInput.value = "";
    userRoleInput.value = "tester";
    userPasswordInput.value = "";
    settingsUserStatus.textContent = "User added. Give them the email and temporary password directly.";
  } catch (error) {
    settingsUserStatus.textContent = error.message;
  }
}

async function deleteSettingsUser(userId) {
  if (!userId || !confirm("Remove this user's PressureFlow login?")) return;

  try {
    const data = await apiRequest(`/api/users/${encodeURIComponent(userId)}`, {}, "DELETE");
    renderSettingsUsers(data.users || []);
    settingsUserStatus.textContent = "User removed.";
  } catch (error) {
    settingsUserStatus.textContent = error.message;
  }
}

function formatUserRole(role) {
  return {
    owner: "Owner",
    admin: "Admin",
    tester: "Tester",
    technician: "Technician"
  }[role] || "Tester";
}

async function updateBusinessLogoFromInput(event, statusElement = settingsStatus) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!BUSINESS_LOGO_ALLOWED_TYPES.has(file.type)) {
    if (statusElement) {
      statusElement.textContent = "Choose a PNG, JPG, or WebP logo image.";
    }
    event.target.value = "";
    return;
  }
  if (file.size > BUSINESS_LOGO_MAX_SOURCE_BYTES) {
    if (statusElement) {
      statusElement.textContent = "Choose a smaller logo image under 8 MB.";
    }
    event.target.value = "";
    return;
  }

  try {
    if (statusElement) {
      statusElement.textContent = "Preparing logo...";
    }
    settings.businessLogoDataUrl = await prepareBusinessLogoDataUrl(file);
    renderBusinessLogoPreview();
    if (statusElement) {
      statusElement.textContent = "Logo ready. Save settings to publish it.";
    }
    showToast("Logo ready. Save settings to publish it.", "info");
  } catch (error) {
    console.error("Unable to prepare business logo", error);
    if (statusElement) {
      statusElement.textContent = "Logo could not be prepared. Try a PNG, JPG, or WebP image.";
    }
    event.target.value = "";
  }
}

async function prepareBusinessLogoDataUrl(file) {
  const directDataUrl = await readFileAsDataUrl(file);
  if (getTextBytes(directDataUrl) <= BUSINESS_LOGO_MAX_DATA_URL_BYTES) {
    return directDataUrl;
  }

  const image = await loadImageFromFile(file);
  const canvas = document.createElement("canvas");
  const scale = Math.min(
    1,
    BUSINESS_LOGO_MAX_DIMENSION / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height)
  );
  canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const mimeTypes = file.type === "image/png" ? ["image/png", "image/webp", "image/jpeg"] : [file.type, "image/webp", "image/jpeg"];
  const qualities = [0.86, 0.76, 0.66, 0.56];
  for (const mimeType of mimeTypes) {
    for (const quality of qualities) {
      const dataUrl = canvas.toDataURL(mimeType, quality);
      if (getTextBytes(dataUrl) <= BUSINESS_LOGO_MAX_DATA_URL_BYTES) {
        return dataUrl;
      }
    }
  }

  throw new Error("Prepared logo is still too large.");
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Logo image could not be loaded."));
    };
    image.src = objectUrl;
  });
}

function getTextBytes(value) {
  return new Blob([String(value || "")]).size;
}

function clearBusinessLogo(inputToClear = businessLogoInput) {
  settings.businessLogoDataUrl = "";
  if (inputToClear) {
    inputToClear.value = "";
  }
  renderBusinessLogoPreview();
  const statusElement = inputToClear === onboardingLogoInput ? onboardingWizardStatus : settingsStatus;
  if (statusElement) {
    statusElement.textContent = "Logo removed. Save settings to publish it.";
  }
  showToast("Logo removed. Save settings to publish it.", "info");
}

function renderBusinessLogoPreview() {
  [businessLogoPreview, onboardingLogoPreview].forEach((preview) => {
    if (!preview) return;

    preview.src = settings.businessLogoDataUrl || "";
    preview.hidden = !settings.businessLogoDataUrl;
  });
}

function renderTemplates() {
  if (!templateList) return;

  const uploadedTemplates = (settings.customTemplates || []).map((template) => ({
    ...template,
    type: "Uploaded",
    url: `/api/templates/custom/${encodeURIComponent(template.id)}`,
    removable: true
  }));
  const templates = [...builtInTemplates, ...uploadedTemplates];

  templateList.innerHTML = templates.map((template) => `
    <article class="template-card">
      <p class="eyebrow">${escapeHtml(template.type)}</p>
      <h3>${escapeHtml(template.name)}</h3>
      <p>${escapeHtml(template.description || template.fileName || "Saved template document.")}</p>
      <div class="template-card-actions">
        <a class="secondary-link-button" href="${escapeHtml(template.url)}">Download Word Doc</a>
        ${template.removable ? `<button class="action-button danger" type="button" data-delete-template="${escapeHtml(template.id)}">Delete</button>` : ""}
      </div>
    </article>
  `).join("");

  templateList.querySelectorAll("[data-delete-template]").forEach((button) => {
    button.addEventListener("click", () => deleteTemplate(button.dataset.deleteTemplate));
  });
}

async function uploadTemplate(event) {
  event.preventDefault();
  const file = templateFileInput.files?.[0];
  if (!file) {
    templateUploadStatus.textContent = "Choose a Word document first.";
    return;
  }

  try {
    templateUploadStatus.textContent = "Uploading template...";
    const payload = Object.fromEntries(new FormData(templateUploadForm).entries());
    payload.fileName = file.name;
    payload.mimeType = file.type || inferTemplateMimeType(file.name);
    payload.dataUrl = await readFileAsDataUrl(file);
    const data = await apiRequest("/api/templates/custom", payload);
    settings.customTemplates = data.templates || [];
    templateUploadForm.reset();
    templateUploadStatus.textContent = "Template uploaded.";
    showToast("Template uploaded.", "success");
    renderTemplates();
  } catch (error) {
    templateUploadStatus.textContent = error.message;
  }
}

async function deleteTemplate(templateId) {
  if (!templateId) return;
  if (!confirm("Delete this uploaded template?")) return;

  try {
    const data = await apiRequest(`/api/templates/custom/${encodeURIComponent(templateId)}`, {}, "DELETE");
    settings.customTemplates = data.templates || [];
    renderTemplates();
    templateUploadStatus.textContent = "Template deleted.";
    showToast("Template deleted.", "success");
  } catch (error) {
    templateUploadStatus.textContent = error.message;
  }
}

function inferTemplateMimeType(fileName) {
  return String(fileName || "").toLowerCase().endsWith(".doc")
    ? "application/msword"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function syncAddressFields(form) {
  if (!form?.elements?.address) return;
  const formData = Object.fromEntries(new FormData(form).entries());
  form.elements.address.value = buildFullAddress(formData) || form.elements.address.value || "";
}

function fillAddressFields(form, source = {}) {
  const fallback = parseAddressFallback(source.address || "");
  form.elements.streetAddress.value = source.streetAddress || fallback.streetAddress || "";
  form.elements.addressUnit.value = source.addressUnit || fallback.addressUnit || "";
  form.elements.city.value = source.city || fallback.city || "";
  form.elements.state.value = source.state || fallback.state || "";
  form.elements.zip.value = source.zip || fallback.zip || "";
  if (form.elements.address) {
    form.elements.address.value = source.address || buildFullAddress(source) || "";
  }
}

function parseAddressFallback(address) {
  const parts = String(address || "").split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) {
    return { streetAddress: address };
  }

  const stateZip = parts.at(-1).match(/\b([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)\b/);
  const cityFromLast = parts.at(-1).replace(/\b[A-Za-z]{2}\s+\d{5}(?:-\d{4})?\b/, "").trim();
  return {
    streetAddress: parts[0] || "",
    city: parts.length >= 3 ? parts.at(-2) : cityFromLast,
    state: stateZip?.[1]?.toUpperCase() || "",
    zip: stateZip?.[2] || ""
  };
}

async function createJob(event) {
  if (event.submitter?.value === "cancel") {
    clearJobDraft();
    resetJobDialog();
    return;
  }

  event.preventDefault();
  syncAddressFields(jobForm);
  const formData = new FormData(jobForm);
  const job = Object.fromEntries(formData.entries());
  job.lineItems = getEstimateLineItems();
  job.measurement = job.lineItems.some((item) => item.name === "Pressure Washing") ? currentMeasurement : {};
  job.jobPhotos = currentJobPhotos;
  job.estimate = Number(job.estimate);
  job.depositPercent = Number(job.depositPercent);
  const editingId = jobForm.dataset.editingId;

  try {
    const saved = editingId
      ? await apiRequest(`/api/jobs/${editingId}`, job, "PATCH")
      : await apiRequest("/api/jobs", job);
    selectedJobId = saved.job.id;
    clearJobDraft();
    jobForm.reset();
    resetJobDialog();
    jobDialog.close();
    await loadJobs();
    await loadCustomers();
    if (editingId && saved.job.status === "Lead") {
      showToast("Pricing changed, so the previous estimate/contract/invoice links were reset. Send the updated estimate again.", "info");
    } else if (!editingId) {
      showToast("Job created successfully.", "success", {
        label: "View in Pipeline",
        onClick: () => viewJobInPipeline(saved.job.id)
      });
    }
  } catch (error) {
    showToast(error.message || "Job was not saved. Check the estimate and try again.", "error");
  }
}

function openNewJob({ restoreDraft = true } = {}) {
  jobForm.reset();
  resetJobDialog();
  renderJobCustomerOptions();
  if (restoreDraft) {
    restoreJobDraft();
  }
  jobDialog.showModal();
}

function openNewJobForCustomer(customer) {
  clearJobDraft();
  openNewJob({ restoreDraft: false });
  fillJobCustomerFields(customer);
}

function openNewCustomer() {
  customerForm.reset();
  resetCustomerDialog();
  customerDialog.showModal();
}

function openEditCustomer() {
  const customer = customers.find((item) => item.id === selectedCustomerId);
  if (!customer) return;

  customerForm.dataset.editingId = customer.id;
  customerDialogTitle.textContent = "Edit customer";
  customerForm.elements.customerName.value = customer.customerName || "";
  customerForm.elements.email.value = customer.email || "";
  customerForm.elements.phone.value = customer.phone || "";
  fillAddressFields(customerForm, customer);
  customerForm.elements.leadSource.value = customer.leadSource || "referral";
  customerForm.elements.notes.value = customer.notes || "";
  currentServiceAreaPhotos = [...(customer.serviceAreaPhotos || [])];
  renderServiceAreaPhotos();
  customerDialog.showModal();
}

function resetCustomerDialog() {
  customerForm.dataset.editingId = "";
  customerDialogTitle.textContent = "New customer";
  currentServiceAreaPhotos = [];
  serviceAreaPhotoInputs.forEach((input) => {
    input.value = "";
  });
  renderServiceAreaPhotos();
}

async function saveCustomer(event) {
  if (event.submitter?.value === "cancel") {
    resetCustomerDialog();
    return;
  }

  event.preventDefault();
  syncAddressFields(customerForm);
  const payload = Object.fromEntries(new FormData(customerForm).entries());
  payload.serviceAreaPhotos = currentServiceAreaPhotos;
  const editingId = customerForm.dataset.editingId;

  try {
    const saved = editingId
      ? await apiRequest(`/api/customers/${editingId}`, payload, "PATCH")
      : await apiRequest("/api/customers", payload);
    selectedCustomerId = saved.customer.id;
    customerForm.reset();
    resetCustomerDialog();
    customerDialog.close();
    await loadCustomers();
    renderDashboard();
    if (!editingId) {
      showToast("Customer created successfully.", "success", {
        label: "Create a job for this customer",
        onClick: () => openNewJobForCustomerId(saved.customer.id)
      });
    }
  } catch (error) {
    alert(error.message);
  }
}

function openNewExpense() {
  expenseForm.dataset.editingId = "";
  expenseDialogTitle.textContent = "Add expense";
  expenseForm.reset();
  currentReceiptPhotos = [];
  receiptPhotoInput.value = "";
  expenseForm.elements.expenseDate.value = new Date().toISOString().slice(0, 10);
  expenseForm.elements.jobId.value = "";
  renderExpenseJobOptions();
  renderReceiptPhotos();
  expenseDialog.showModal();
}

async function saveExpense(event) {
  if (event.submitter?.value === "cancel") {
    resetExpenseDialog();
    return;
  }

  event.preventDefault();
  const payload = Object.fromEntries(new FormData(expenseForm).entries());
  payload.amount = Number(payload.amount || 0);
  payload.receiptPhotos = currentReceiptPhotos;
  const editingId = expenseForm.dataset.editingId;

  try {
    const saved = editingId
      ? await apiRequest(`/api/expenses/${encodeURIComponent(editingId)}`, payload, "PATCH")
      : await apiRequest("/api/expenses", payload);
    selectedExpenseId = saved.expense.id;
    resetExpenseDialog();
    expenseDialog.close();
    await loadExpenses();
    renderDashboard();
  } catch (error) {
    alert(error.message);
  }
}

function openEditExpense() {
  const expense = expenses.find((item) => item.id === selectedExpenseId);
  if (!expense) return;

  expenseForm.dataset.editingId = expense.id;
  expenseDialogTitle.textContent = "Edit expense";
  expenseForm.elements.vendor.value = expense.vendor || "";
  expenseForm.elements.amount.value = Number(expense.amount || 0).toFixed(2);
  expenseForm.elements.expenseDate.value = expense.expenseDate || new Date().toISOString().slice(0, 10);
  expenseForm.elements.category.value = expense.category || "";
  renderExpenseJobOptions(expense.jobId || "");
  expenseForm.elements.jobId.value = expense.jobId || "";
  expenseForm.elements.notes.value = expense.notes || "";
  currentReceiptPhotos = [...(expense.receiptPhotos || [])];
  receiptPhotoInput.value = "";
  renderReceiptPhotos();
  expenseDialog.showModal();
}

function resetExpenseDialog() {
  expenseForm.dataset.editingId = "";
  expenseDialogTitle.textContent = "Add expense";
  expenseForm.reset();
  currentReceiptPhotos = [];
  receiptPhotoInput.value = "";
  expenseForm.elements.jobId.value = "";
  renderReceiptPhotos();
}

function formatExpenseAmountInput(event) {
  const digits = event.target.value.replace(/\D/g, "");
  if (!digits) {
    event.target.value = "";
    return;
  }
  event.target.value = (Number(digits || 0) / 100).toFixed(2);
}

function openEditJob() {
  const job = jobs.find((item) => item.id === selectedJobId);
  if (!job) return;

  jobForm.dataset.editingId = job.id;
  jobDialogTitle.textContent = "Edit job";
  jobForm.elements.customerId.value = job.customerId || "";
  jobForm.elements.customerName.value = job.customerName || "";
  jobForm.elements.email.value = job.email || "";
  jobForm.elements.phone.value = job.phone || "";
  if (jobCustomerSelect) {
    jobCustomerSelect.value = job.customerId || "";
  }
  fillAddressFields(jobForm, job);
  jobForm.elements.leadSource.value = job.leadSource || "referral";
  renderServiceTypeOptions(job.serviceType || "");
  jobForm.elements.estimate.value = job.estimate || 0;
  jobForm.elements.depositPercent.value = job.depositPercent ?? getDefaultDepositPercent();
  renderLineItems(job.lineItems?.length ? job.lineItems : [{ ...defaultEstimateService, quantity: 0 }]);
  currentMeasurement = job.measurement || {};
  currentJobPhotos = {
    before: [...(job.jobPhotos?.before || [])],
    after: [...(job.jobPhotos?.after || [])]
  };
  resetBeforePhotoRows();
  renderJobPhotoPreviews();
  discountSelect.value = String(job.discountPercent || 0);
  updateEstimateTotals();
  jobForm.elements.notes.value = job.notes || "";
  jobForm.elements.accessNotes.value = job.accessNotes || "";
  jobForm.elements.sensitiveAreas.value = job.sensitiveAreas || "";
  renderJobCustomerOptions();
  jobDialog.showModal();
}

function resetJobDialog() {
  jobForm.dataset.editingId = "";
  jobDialogTitle.textContent = "New job";
  if (jobCustomerSelect) {
    jobCustomerSelect.value = "";
  }
  renderLineItems([{ ...defaultEstimateService, quantity: 0 }]);
  currentMeasurement = {};
  activeMeasurementAreaId = "";
  currentJobPhotos = { before: [], after: [] };
  renderServiceTypeOptions("");
  resetBeforePhotoRows();
  renderBeforePhotoSectionOptions();
  renderJobPhotoPreviews();
  discountSelect.value = "0";
  jobForm.elements.depositPercent.value = getDefaultDepositPercent();
  updateEstimateTotals();
}

function saveJobDraft() {
  if (restoringJobDraft || jobForm.dataset.editingId) return;

  const fields = Object.fromEntries(new FormData(jobForm).entries());
  const draft = {
    savedAt: new Date().toISOString(),
    fields,
    lineItems: getEstimateLineItems(),
    discountPercent: discountSelect.value || "0",
    measurement: currentMeasurement || {},
    jobPhotos: currentJobPhotos || { before: [], after: [] }
  };

  try {
    localStorage.setItem(JOB_FORM_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Local draft recovery is best effort; saving the job still works without it.
  }
}

function restoreJobDraft() {
  let draft;
  try {
    draft = JSON.parse(localStorage.getItem(JOB_FORM_DRAFT_KEY) || "null");
  } catch {
    return;
  }

  if (!draft?.fields) return;

  restoringJobDraft = true;
  Object.entries(draft.fields).forEach(([name, value]) => {
    const field = jobForm.elements[name];
    if (!field || field.type === "file") return;
    field.value = value;
  });
  renderLineItems(Array.isArray(draft.lineItems) && draft.lineItems.length
    ? draft.lineItems
    : [{ ...defaultEstimateService, quantity: 0 }]);
  currentMeasurement = draft.measurement || {};
  currentJobPhotos = {
    before: [...(draft.jobPhotos?.before || [])],
    after: [...(draft.jobPhotos?.after || [])]
  };
  discountSelect.value = String(draft.discountPercent || "0");
  renderJobPhotoPreviews();
  updateEstimateTotals();
  restoringJobDraft = false;
}

function clearJobDraft() {
  try {
    localStorage.removeItem(JOB_FORM_DRAFT_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}

async function addPhotosFromInput(event, target, renderCallback, metadata = {}) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  const photos = await Promise.all(files.map((file) => fileToPhoto(file, metadata)));
  target.push(...photos);
  event.target.value = "";
  renderCallback();
}

function renderServiceAreaPhotos() {
  renderEditablePhotoGrid(serviceAreaPhotoPreview, currentServiceAreaPhotos, () => renderServiceAreaPhotos());
}

function renderReceiptPhotos() {
  renderEditablePhotoGrid(receiptPhotoPreview, currentReceiptPhotos, () => renderReceiptPhotos());
}

function renderJobPhotoPreviews() {
  if (!beforePhotoPreview) return;

  const photos = currentJobPhotos.before || [];
  renderBeforePhotoPreview(beforePhotoPreview, photos);

  beforePhotoPreview.querySelectorAll("[data-remove-before-photo]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = currentJobPhotos.before.findIndex((photo) => photo.id === button.dataset.removeBeforePhoto);
      if (index >= 0) {
        currentJobPhotos.before.splice(index, 1);
      }
      renderJobPhotoPreviews();
    });
  });
}

async function addServiceType() {
  const name = prompt("New service type name");
  const cleanName = String(name || "").trim();
  if (!cleanName) return;

  if (!serviceTypes.some((item) => item.toLowerCase() === cleanName.toLowerCase())) {
    const customServiceTypes = [...(settings.customServiceTypes || []), cleanName];
    try {
      const data = await apiRequest("/api/settings", { ...settings, customServiceTypes });
      settings = data.settings;
      syncServiceCatalog();
    } catch (error) {
      alert(error.message);
      return;
    }
  }
  renderServiceTypeOptions(cleanName);
}

function resetBeforePhotoRows() {
  if (!beforePhotoRows) return;
  beforePhotoRows.innerHTML = "";
  beforePhotoRowCounter = 0;
  addBeforePhotoRow(beforePhotoSections[0] || "");
}

function addBeforePhotoRow(selectedArea = beforePhotoSections[0] || "") {
  if (!beforePhotoRows) return;

  beforePhotoRowCounter += 1;
  const rowId = `before-photo-row-${beforePhotoRowCounter}`;
  const row = document.createElement("div");
  row.className = "before-photo-row";
  row.dataset.beforePhotoRow = rowId;
  row.innerHTML = `
    <div class="before-photo-row-main">
      <label class="field">
        Service area
        <select class="select" data-before-photo-section-select aria-label="Service area">
          ${getBeforePhotoAreaOptions(selectedArea)}
        </select>
      </label>
      <div class="photo-actions">
        <label class="photo-action-button primary">Upload
          <input data-before-photo-upload type="file" accept="image/*" multiple>
        </label>
        <label class="photo-action-button">Take Picture
          <input data-before-photo-camera type="file" accept="image/*" capture="environment">
        </label>
      </div>
    </div>
    <div class="new-before-area" data-new-before-area hidden>
      <label class="field">
        New service area
        <input class="input" data-new-before-area-name autocomplete="off" placeholder="Bathroom">
      </label>
      <button class="secondary-small-button" type="button" data-save-before-area>Add new Area</button>
    </div>
  `;

  const select = row.querySelector("[data-before-photo-section-select]");
  const uploadInput = row.querySelector("[data-before-photo-upload]");
  const cameraInput = row.querySelector("[data-before-photo-camera]");
  select.value = beforePhotoSections.includes(selectedArea) ? selectedArea : beforePhotoSections[0] || "";
  select.addEventListener("change", () => handleBeforePhotoAreaChange(row));
  uploadInput.addEventListener("change", (event) => addBeforePhotosFromRow(event, row));
  cameraInput.addEventListener("change", (event) => addBeforePhotosFromRow(event, row));
  row.querySelector("[data-save-before-area]").addEventListener("click", () => saveBeforePhotoArea(row));
  beforePhotoRows.append(row);
}

function handleBeforePhotoAreaChange(row) {
  const select = row.querySelector("[data-before-photo-section-select]");
  const newAreaPanel = row.querySelector("[data-new-before-area]");
  const input = row.querySelector("[data-new-before-area-name]");
  const isAdding = select.value === "__new_area__";
  newAreaPanel.hidden = !isAdding;
  if (isAdding) {
    input.value = "";
    input.focus();
  }
}

async function addBeforePhotosFromRow(event, row) {
  const select = row.querySelector("[data-before-photo-section-select]");
  if (select.value === "__new_area__") {
    event.target.value = "";
    handleBeforePhotoAreaChange(row);
    return;
  }

  const section = select.value || "Before";
  await addPhotosFromInput(event, currentJobPhotos.before, renderJobPhotoPreviews, { section });
  addBeforePhotoRow(section);
}

async function saveBeforePhotoArea(row) {
  const input = row.querySelector("[data-new-before-area-name]");
  const select = row.querySelector("[data-before-photo-section-select]");
  const cleanName = String(input.value || "").trim();
  if (!cleanName) return;

  if (!beforePhotoSections.some((item) => item.toLowerCase() === cleanName.toLowerCase())) {
    const customPhotoSections = [...(settings.customPhotoSections || []), cleanName];
    try {
      const data = await apiRequest("/api/settings", { ...settings, customPhotoSections });
      settings = data.settings;
      syncServiceCatalog();
    } catch (error) {
      alert(error.message);
      return;
    }
  }

  row.querySelector("[data-new-before-area]").hidden = true;
  renderBeforePhotoSectionOptions(cleanName);
  select.value = cleanName;
}

function renderCompletionPhotoPreviews() {
  renderEditablePhotoGrid(completionBeforePhotoPreview, currentCompletionPhotos.before, () => renderCompletionPhotoPreviews());
  renderEditablePhotoGrid(completionAfterPhotoPreview, currentCompletionPhotos.after, () => renderCompletionPhotoPreviews());
}

function closeDialogFromButton(event) {
  const dialog = event.currentTarget.closest("dialog");
  if (!dialog) return;

  if (dialog === jobDialog) {
    clearJobDraft();
    jobForm.reset();
    resetJobDialog();
  }

  if (dialog === customerDialog) {
    resetCustomerDialog();
  }

  if (dialog === expenseDialog) {
    resetExpenseDialog();
  }

  if (dialog === scheduleDialog) {
    resolveScheduleDialog(null);
  }

  if (dialog === completionDialog) {
    resolveCompletionDialog(null);
  }

  if (dialog === paymentDialog) {
    resolvePaymentDialog(null);
  }

  dialog.close();
}

function renderLineItems(items) {
  lineItemsContainer.innerHTML = "";
  const normalizedItems = items.length ? items : [{ ...defaultEstimateService, quantity: 0 }];
  normalizedItems.forEach((item) => addLineItemRow(item));
  updateEstimateTotals();
}

function addLineItemRow(item = serviceCatalog[0]) {
  const catalogItem = serviceCatalog.find((service) => service.name === item.name) || {
    name: item.name || "Custom service",
    unit: item.unit || "QTY",
    price: Number(item.price || 0)
  };
  if (!serviceCatalog.some((service) => service.name === catalogItem.name)) {
    serviceCatalog.push(catalogItem);
  }
  const rowCatalog = serviceCatalog.some((service) => service.name === catalogItem.name)
    ? serviceCatalog
    : [...serviceCatalog, catalogItem];
  const row = document.createElement("div");
  row.className = "line-item-row";
  row.innerHTML = `
    <div class="line-item-heading">
      <span class="line-item-index">Service</span>
    </div>
    <label class="field">
      Service
      <select class="line-service select">
        ${rowCatalog.map((service) => `
          <option value="${escapeHtml(service.name)}" ${service.name === catalogItem.name ? "selected" : ""}>
            ${escapeHtml(service.name)}
          </option>
        `).join("")}
      </select>
    </label>
    <label class="field">
      <span class="line-quantity-label">${escapeHtml(formatUnitLabel(catalogItem.unit))}</span>
      <input class="line-quantity input" type="number" min="0" step="1" value="${Number(item.quantity ?? 0)}">
    </label>
    <label class="field">
      <span class="line-rate-label">Rate (${escapeHtml(formatRateUnit(catalogItem.unit))})</span>
      <input class="line-rate input" type="number" min="0" step="0.01" value="${Number(item.price ?? catalogItem.price)}">
    </label>
    <div class="line-item-total">
      <span>Line total</span>
      <strong>$0</strong>
    </div>
    <button class="secondary-small-button line-measure" type="button" title="Measure service area" hidden>
      <span aria-hidden="true">&#127760;</span>
      Measure from Map
    </button>
    <button class="icon-button line-remove" type="button" title="Remove service" aria-label="Remove service">
      <svg class="button-icon" aria-hidden="true" viewBox="0 0 24 24">
        <path d="M18 6 6 18M6 6l12 12"></path>
      </svg>
    </button>
  `;

  row.querySelector(".line-service").addEventListener("change", (event) => {
    const selected = serviceCatalog.find((service) => service.name === event.target.value);
    if (!selected) return;
    row.querySelector(".line-rate").value = selected.price;
    row.querySelector(".line-quantity-label").textContent = formatUnitLabel(selected.unit);
    row.querySelector(".line-rate-label").textContent = `Rate (${formatRateUnit(selected.unit)})`;
    updateMeasurementButtonVisibility();
    updateEstimateTotals();
  });
  row.querySelector(".line-quantity").addEventListener("input", updateEstimateTotals);
  row.querySelector(".line-rate").addEventListener("input", updateEstimateTotals);
  row.querySelector(".line-measure").addEventListener("click", () => openMeasurementDialog(row));
  row.querySelector(".line-remove").addEventListener("click", () => {
    row.remove();
    if (!lineItemsContainer.children.length) {
      addLineItemRow();
    }
    updateLineItemLabels();
    updateMeasurementButtonVisibility();
    updateEstimateTotals();
  });

  lineItemsContainer.append(row);
  updateLineItemLabels();
  updateMeasurementButtonVisibility();
  updateEstimateTotals();
}

function updateLineItemLabels() {
  lineItemsContainer.querySelectorAll(".line-item-row").forEach((row, index) => {
    const label = row.querySelector(".line-item-index");
    if (label) {
      label.textContent = `Service ${index + 1}`;
    }
  });
}

function openCustomServiceDialog() {
  customServiceForm.reset();
  customServiceForm.elements.price.value = "0";
  customServiceStatus.textContent = "";
  customServiceDialog.showModal();
}

async function addCustomService(event) {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();

  const formData = new FormData(customServiceForm);
  const service = {
    id: crypto.randomUUID(),
    name: String(formData.get("name") || "").trim(),
    unit: String(formData.get("unit") || "QTY"),
    price: Math.max(Number(formData.get("price") || 0), 0)
  };
  if (!service.name) {
    customServiceStatus.textContent = "Enter a service name.";
    return;
  }

  const existingIndex = serviceCatalog.findIndex((item) => item.name.toLowerCase() === service.name.toLowerCase());
  if (existingIndex >= 0) {
    serviceCatalog[existingIndex] = service;
  } else {
    serviceCatalog.push(service);
  }
  addLineItemRow({ ...service, quantity: 1 });

  if (formData.get("saveForFuture") === "on") {
    const customServices = [...(settings.customServices || [])];
    const savedIndex = customServices.findIndex((item) => item.name.toLowerCase() === service.name.toLowerCase());
    if (savedIndex >= 0) {
      customServices[savedIndex] = service;
    } else {
      customServices.push(service);
    }
    try {
      const data = await apiRequest("/api/settings", { ...settings, customServices });
      settings = data.settings;
      syncServiceCatalog();
    } catch (error) {
      customServiceStatus.textContent = `Service added to this job, but could not be saved: ${error.message}`;
      return;
    }
  }

  customServiceDialog.close();
}

function updateMeasurementButtonVisibility() {
  lineItemsContainer.querySelectorAll(".line-item-row").forEach((row) => {
    const isPressureWashing = row.querySelector(".line-service")?.value === "Pressure Washing";
    const measureButton = row.querySelector(".line-measure");
    if (measureButton) {
      measureButton.hidden = !isPressureWashing;
    }
  });
}

function getEstimateLineItems() {
  return Array.from(lineItemsContainer.querySelectorAll(".line-item-row")).map((row) => {
    const service = serviceCatalog.find((item) => item.name === row.querySelector(".line-service").value) || serviceCatalog[0];
    const quantity = Number(row.querySelector(".line-quantity").value || 0);
    const price = Number(row.querySelector(".line-rate").value || 0);
    return {
      name: service.name,
      unit: service.unit,
      quantity,
      price,
      total: roundMoney(quantity * price)
    };
  }).filter((item) => item.quantity > 0 && item.price >= 0);
}

function updateEstimateTotals() {
  const lineItems = getEstimateLineItems();
  const subtotal = roundMoney(lineItems.reduce((sum, item) => sum + item.total, 0));
  const discountPercent = Number(discountSelect.value || 0);
  const discountAmount = roundMoney(subtotal * (discountPercent / 100));
  const total = roundMoney(subtotal - discountAmount);

  lineItemsContainer.querySelectorAll(".line-item-row").forEach((row) => {
    const quantity = Number(row.querySelector(".line-quantity").value || 0);
    const price = Number(row.querySelector(".line-rate").value || 0);
    row.querySelector(".line-item-total strong").textContent = currency.format(roundMoney(quantity * price));
  });

  estimateSubtotal.textContent = currency.format(subtotal);
  estimateDiscountRow.hidden = discountAmount <= 0;
  estimateDiscount.textContent = `-${currency.format(discountAmount)}`;
  estimateTotal.textContent = currency.format(total);

  if (lineItems.length) {
    jobForm.elements.estimate.value = total.toFixed(2);
  }
}

function openMeasurementDialog(row) {
  if (!settings.mapboxPublicToken) {
    alert("Add your Mapbox public token in Settings before using map measurement.");
    return;
  }

  activeMeasurementLineItem = row || findPressureWashingLineItem();
  if (!activeMeasurementLineItem) {
    return;
  }

  currentMeasurement = normalizeMeasurementForEditing(currentMeasurement);
  activeMeasurementAreaId = currentMeasurement.areas[0]?.id || "";
  syncAddressFields(jobForm);
  measurementAddress.value = jobForm.elements.address.value || currentMeasurement.address || "";
  updateMeasurementTotal();
  renderMeasurementAreas();
  measurementStatus.textContent = "Draw or edit a polygon around the surface.";
  delete savedMeasurementsPanel.dataset.userToggled;
  renderSavedMeasurements([]);
  measurementDialog.showModal();
  setTimeout(() => {
    initializeMeasurementMap();
    if (measurementAddress.value) {
      loadSavedMeasurementsForAddress(measurementAddress.value);
    }
  }, 50);
}

function initializeMeasurementMap() {
  if (!window.mapboxgl || !window.MapboxDraw || !window.turf) {
    measurementStatus.textContent = "Map tools are still loading. Try again in a moment.";
    return;
  }

  mapboxgl.accessToken = settings.mapboxPublicToken;
  if (!mapboxMap) {
    mapboxMap = new mapboxgl.Map({
      container: measurementMapElement,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: currentMeasurement.center?.length ? currentMeasurement.center : [-117.3755, 33.9806],
      zoom: currentMeasurement.zoom || 18
    });
    mapboxMap.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
    mapboxDraw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
      defaultMode: "draw_polygon",
      modes: createPressureFlowDrawModes()
    });
    mapboxMap.addControl(mapboxDraw, "top-left");
    mapboxMap.on("draw.create", updateMeasurementFromDraw);
    mapboxMap.on("draw.update", updateMeasurementFromDraw);
    mapboxMap.on("draw.delete", updateMeasurementFromDraw);
    mapboxMap.on("style.load", () => {
      setTimeout(updateMeasurementOverlay, 0);
    });
  } else {
    mapboxMap.resize();
  }

  loadActiveMeasurementAreaIntoDraw();
}

function createPressureFlowDrawModes() {
  if (!window.MapboxDraw?.modes?.draw_polygon) {
    return undefined;
  }

  const drawPolygonMode = window.MapboxDraw.modes.draw_polygon;
  const defaultClickOnVertex = drawPolygonMode.clickOnVertex;
  const defaultClickAnywhere = drawPolygonMode.clickAnywhere;
  return {
    ...window.MapboxDraw.modes,
    draw_polygon: {
      ...drawPolygonMode,
      clickOnVertex(state, event) {
        if (!isIntentionalPolygonClose(this, state, event)) {
          return typeof defaultClickAnywhere === "function"
            ? defaultClickAnywhere.call(this, state, event)
            : undefined;
        }

        return typeof defaultClickOnVertex === "function"
          ? defaultClickOnVertex.call(this, state, event)
          : undefined;
      }
    }
  };
}

function isIntentionalPolygonClose(modeContext, state, event) {
  const coordPath = String(event?.featureTarget?.properties?.coord_path || "");
  if (coordPath && coordPath !== "0.0") {
    return false;
  }

  const point = event?.point;
  const firstCoordinate = getFirstDrawPolygonCoordinate(state);
  if (!point || !firstCoordinate || typeof modeContext?.map?.project !== "function") {
    return true;
  }

  const firstPoint = modeContext.map.project(firstCoordinate);
  if (!firstPoint) {
    return true;
  }

  const distance = Math.hypot(Number(point.x) - Number(firstPoint.x), Number(point.y) - Number(firstPoint.y));
  return distance <= MEASUREMENT_CLOSE_VERTEX_PIXEL_TOLERANCE;
}

function getFirstDrawPolygonCoordinate(state) {
  const coordinates = typeof state?.polygon?.getCoordinates === "function"
    ? state.polygon.getCoordinates()
    : state?.polygon?.coordinates;
  return coordinates?.[0]?.[0] || null;
}

async function geocodeMeasurementAddress() {
  const address = measurementAddress.value.trim();
  if (!address || !settings.mapboxPublicToken) return;

  measurementStatus.textContent = "Finding address...";
  const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?limit=1&access_token=${encodeURIComponent(settings.mapboxPublicToken)}`;
  const response = await fetch(endpoint);
  const data = await response.json().catch(() => ({}));
  const feature = data.features?.[0];
  if (!feature) {
    measurementStatus.textContent = "Address not found.";
    return;
  }

  const center = feature.center;
  currentMeasurement.address = feature.place_name || address;
  currentMeasurement.center = center;
  currentMeasurement.zoom = 19;
  measurementAddress.value = currentMeasurement.address;
  initializeMeasurementMap();
  mapboxMap?.flyTo({ center, zoom: 19, essential: true });
  measurementStatus.textContent = "Draw a polygon around the surface.";
}

async function loadSavedMeasurementsForAddress(address) {
  const normalizedAddress = String(address || "").trim();
  if (!normalizedAddress) {
    renderSavedMeasurements([]);
    return;
  }

  try {
    const response = await fetch(`/api/property-measurements?address=${encodeURIComponent(normalizedAddress)}`);
    const data = await readJsonResponse(response, "Unable to load saved measurements.");
    renderSavedMeasurements(data.measurements || []);
  } catch {
    renderSavedMeasurements([]);
  }
}

function renderSavedMeasurements(measurements) {
  renderSavedMeasurementsList({
    isSelected: isSavedMeasurementSelected,
    list: savedMeasurementsList,
    measurements,
    measurementGeojsonKey,
    onDelete: deleteSavedMeasurementFromMap,
    onToggle: toggleSavedMeasurement,
    panel: savedMeasurementsPanel
  });
}

function isSavedMeasurementSelected(item) {
  const savedMeasurement = normalizeMeasurementForEditing(item.measurement || item);
  const savedArea = savedMeasurement.areas[0];
  if (!savedArea?.geojson) return false;

  const savedKey = measurementGeojsonKey(savedArea.geojson);
  return (currentMeasurement.areas || []).some((area) => measurementGeojsonKey(area.geojson) === savedKey);
}

function toggleSavedMeasurement(item, shouldInclude) {
  if (shouldInclude) {
    addSavedMeasurement(item);
  } else {
    removeSavedMeasurement(item);
  }
}

function addSavedMeasurement(item) {
  const savedMeasurement = normalizeMeasurementForEditing({
    ...(item.measurement || item),
    capturedAt: new Date().toISOString()
  });
  const savedArea = savedMeasurement.areas[0];
  if (!savedArea) return;

  const nextArea = {
    ...savedArea,
    id: crypto.randomUUID(),
    name: item.label || savedArea.name || getNextMeasurementAreaName(),
    capturedAt: new Date().toISOString()
  };
  currentMeasurement = normalizeMeasurementForEditing(currentMeasurement);
  const existingIndex = currentMeasurement.areas.findIndex((area) => JSON.stringify(area.geojson) === JSON.stringify(savedArea.geojson));
  if (existingIndex >= 0) {
    currentMeasurement.areas.splice(existingIndex, 1, nextArea);
  } else {
    currentMeasurement.areas.push(nextArea);
  }
  currentMeasurement = recalculateMeasurementTotals({
    ...currentMeasurement,
    address: savedMeasurement.address || item.address || measurementAddress.value.trim(),
    center: savedMeasurement.center?.length ? savedMeasurement.center : currentMeasurement.center,
    zoom: savedMeasurement.zoom || currentMeasurement.zoom || 18
  });
  activeMeasurementAreaId = "";
  measurementAddress.value = currentMeasurement.address || measurementAddress.value;
  updateMeasurementTotal();
  renderMeasurementAreas();
  refreshMeasurementMapDisplay();
  measurementStatus.textContent = `${nextArea.name} added to this job.`;
  renderSavedMeasurementsFromCurrentPanel();
}

function removeSavedMeasurement(item) {
  const savedMeasurement = normalizeMeasurementForEditing(item.measurement || item);
  const savedArea = savedMeasurement.areas[0];
  if (!savedArea?.geojson) return;

  const savedKey = measurementGeojsonKey(savedArea.geojson);
  currentMeasurement.areas = (currentMeasurement.areas || []).filter((area) => measurementGeojsonKey(area.geojson) !== savedKey);
  if (activeMeasurementAreaId && !currentMeasurement.areas.some((area) => area.id === activeMeasurementAreaId)) {
    activeMeasurementAreaId = "";
  }
  currentMeasurement = recalculateMeasurementTotals(currentMeasurement);
  updateMeasurementTotal();
  renderMeasurementAreas();
  refreshMeasurementMapDisplay();
  measurementStatus.textContent = `${item.label || "Saved area"} removed from this job.`;
  renderSavedMeasurementsFromCurrentPanel();
}

async function deleteSavedMeasurementFromMap(customerId, measurementId, areaKey) {
  const confirmed = confirm("Delete this saved service area measurement?");
  if (!confirmed) return;

  try {
    const data = await apiRequest(`/api/customers/${customerId}/measurements/${encodeURIComponent(measurementId)}`, { areaKey }, "DELETE");
    const customerIndex = customers.findIndex((item) => item.id === customerId);
    if (customerIndex >= 0) {
      customers[customerIndex] = data.customer;
    }
    currentMeasurement.areas = (currentMeasurement.areas || []).filter((area) => measurementGeojsonKey(area.geojson) !== areaKey);
    if (activeMeasurementAreaId && !currentMeasurement.areas.some((area) => area.id === activeMeasurementAreaId)) {
      activeMeasurementAreaId = "";
    }
    currentMeasurement = recalculateMeasurementTotals(currentMeasurement);
    updateMeasurementTotal();
    renderMeasurementAreas();
    refreshMeasurementMapDisplay();
    await loadSavedMeasurementsForAddress(measurementAddress.value);
    measurementStatus.textContent = "Saved service area deleted.";
  } catch (error) {
    alert(error.message);
  }
}

function renderSavedMeasurementsFromCurrentPanel() {
  syncSavedMeasurementChecks(savedMeasurementsList, currentMeasurement.areas || [], measurementGeojsonKey);
}

function updateMeasurementFromDraw() {
  if (syncingMeasurementDraw) return;

  const feature = getEditableMeasurementFeature() || mapboxDraw?.getAll().features?.[0];
  if (!feature) {
    measurementStatus.textContent = currentMeasurement.areas?.length
      ? "Draw the next service area or edit an area from the list."
      : "Draw a polygon around the surface.";
    return;
  }

  const squareFeet = Math.round(turf.area(feature) * 10.7639);
  const perimeterFeet = calculatePerimeterFeet(feature);
  const center = mapboxMap.getCenter();
  currentMeasurement = {
    ...currentMeasurement,
    address: measurementAddress.value.trim(),
    center: [center.lng, center.lat],
    zoom: mapboxMap.getZoom(),
    capturedAt: new Date().toISOString()
  };
  measurementStatus.textContent = `${squareFeet.toLocaleString("en-US")} SqFt drawn. Add or update the named area.`;
}

function clearMeasurementPolygon() {
  mapboxDraw?.deleteAll();
  activeMeasurementAreaId = "";
  updateMeasurementTotal();
  updateMeasurementFromDraw();
}

function saveMeasurementArea() {
  const feature = getEditableMeasurementFeature();
  if (!feature) {
    alert("Draw a polygon before adding the service area.");
    return;
  }

  const wasEditingArea = Boolean(activeMeasurementAreaId);
  const squareFeet = Math.round(turf.area(feature) * 10.7639);
  const perimeterFeet = calculatePerimeterFeet(feature);
  const center = mapboxMap.getCenter();
  const name = activeMeasurementAreaId
    ? currentMeasurement.areas.find((item) => item.id === activeMeasurementAreaId)?.name || getNextMeasurementAreaName()
    : getNextMeasurementAreaName();
  const area = {
    id: activeMeasurementAreaId || crypto.randomUUID(),
    name,
    squareFeet,
    perimeterFeet,
    geojson: feature,
    capturedAt: new Date().toISOString()
  };
  const existingIndex = currentMeasurement.areas.findIndex((item) => item.id === area.id);
  if (existingIndex >= 0) {
    currentMeasurement.areas.splice(existingIndex, 1, area);
  } else {
    currentMeasurement.areas.push(area);
  }
  currentMeasurement = recalculateMeasurementTotals({
    ...currentMeasurement,
    address: measurementAddress.value.trim(),
    center: [center.lng, center.lat],
    zoom: mapboxMap.getZoom()
  });
  activeMeasurementAreaId = "";
  updateMeasurementTotal();
  renderMeasurementAreas();
  refreshMeasurementMapDisplay();
  resetMeasurementDrawForNextArea();
  measurementStatus.textContent = wasEditingArea
    ? `${name} updated. Draw another area if needed.`
    : `${name} saved. Draw another area if needed.`;
}

function renderMeasurementAreas() {
  if (!measurementAreaList) return;

  const areas = currentMeasurement.areas || [];
  if (!areas.length) {
    measurementAreaList.innerHTML = renderEmptyState("No service areas added yet", "Draw and save an area to add it here.");
    return;
  }

  measurementAreaList.innerHTML = areas.map((area) => `
    <article class="measurement-area-card">
      <div>
        <input class="measurement-area-name" value="${escapeHtml(area.name)}" aria-label="Service area name">
        <span>${Math.round(area.squareFeet || 0).toLocaleString("en-US")} SqFt</span>
      </div>
      <button class="secondary-small-button" type="button" data-edit-area="${escapeHtml(area.id)}">Edit Shape</button>
      <button class="icon-button" type="button" title="Remove service area" aria-label="Remove service area" data-delete-area="${escapeHtml(area.id)}">
        <svg class="button-icon" aria-hidden="true" viewBox="0 0 24 24">
          <path d="M18 6 6 18M6 6l12 12"></path>
        </svg>
      </button>
    </article>
  `).join("");

  measurementAreaList.querySelectorAll(".measurement-area-card").forEach((card, index) => {
    card.querySelector(".measurement-area-name").addEventListener("input", (event) => {
      renameMeasurementArea(areas[index].id, event.target.value);
    });
  });
  measurementAreaList.querySelectorAll("[data-edit-area]").forEach((button) => {
    button.addEventListener("click", () => editMeasurementArea(button.dataset.editArea));
  });
  measurementAreaList.querySelectorAll("[data-delete-area]").forEach((button) => {
    button.addEventListener("click", () => deleteMeasurementArea(button.dataset.deleteArea));
  });
}

function editMeasurementArea(areaId) {
  const area = currentMeasurement.areas.find((item) => item.id === areaId);
  if (!area) return;

  activeMeasurementAreaId = area.id;
  updateMeasurementTotal();
  loadMeasurementAreasIntoDraw();
  measurementStatus.textContent = `Editing ${area.name}. Adjust the polygon, then update the area.`;
}

function renameMeasurementArea(areaId, name) {
  const area = currentMeasurement.areas.find((item) => item.id === areaId);
  if (!area) return;

  area.name = String(name || "").trim() || "Service area";
  currentMeasurement = recalculateMeasurementTotals(currentMeasurement);
}

function deleteMeasurementArea(areaId) {
  currentMeasurement.areas = currentMeasurement.areas.filter((area) => area.id !== areaId);
  if (activeMeasurementAreaId === areaId) {
    activeMeasurementAreaId = "";
  }
  currentMeasurement = recalculateMeasurementTotals(currentMeasurement);
  updateMeasurementTotal();
  renderMeasurementAreas();
  refreshMeasurementMapDisplay();
}

function loadActiveMeasurementAreaIntoDraw() {
  refreshMeasurementMapDisplay();
}

function loadMeasurementAreasIntoDraw() {
  refreshMeasurementMapDisplay();
}

function refreshMeasurementMapDisplay() {
  updateMeasurementOverlay();
  loadEditableMeasurementAreaIntoDraw();
}

function updateMeasurementOverlay() {
  if (!mapboxMap) return;

  const sourceData = buildMeasurementOverlayFeatureCollection();
  const applyOverlay = () => {
    try {
      if (!mapboxMap.getSource("selected-service-areas")) {
        mapboxMap.addSource("selected-service-areas", { type: "geojson", data: sourceData });
      } else {
        mapboxMap.getSource("selected-service-areas").setData(sourceData);
      }
      if (!mapboxMap.getLayer("selected-service-areas-fill")) {
        mapboxMap.addLayer({
          id: "selected-service-areas-fill",
          type: "fill",
          source: "selected-service-areas",
          paint: {
            "fill-color": "#1c7c54",
            "fill-opacity": 0.28
          }
        });
      }
      if (!mapboxMap.getLayer("selected-service-areas-line")) {
        mapboxMap.addLayer({
          id: "selected-service-areas-line",
          type: "line",
          source: "selected-service-areas",
          paint: {
            "line-color": "#0f5132",
            "line-width": 4
          }
        });
      }
    } catch {
      mapboxMap.once("idle", updateMeasurementOverlay);
    }
  };

  if (mapboxMap.loaded()) {
    applyOverlay();
  } else {
    mapboxMap.once("load", applyOverlay);
  }
}

function buildMeasurementOverlayFeatureCollection() {
  return {
    type: "FeatureCollection",
    features: (currentMeasurement.areas || [])
      .map((area) => area.geojson)
      .filter(Boolean)
  };
}

function loadEditableMeasurementAreaIntoDraw() {
  if (!mapboxDraw) return;

  syncingMeasurementDraw = true;
  mapboxDraw.deleteAll();
  (currentMeasurement.areas || []).forEach((area) => {
    mapboxDraw.add(buildDrawFeatureForArea(area));
  });
  if (activeMeasurementAreaId) {
    mapboxDraw.changeMode("simple_select", { featureIds: [activeMeasurementAreaId] });
  } else {
    mapboxDraw.changeMode("simple_select");
  }
  setTimeout(() => {
    syncingMeasurementDraw = false;
  }, 0);
}

function resetMeasurementDrawForNextArea() {
  if (!mapboxDraw) return;

  window.setTimeout(() => {
    try {
      mapboxDraw.changeMode("draw_polygon");
    } catch {
      try {
        mapboxDraw.changeMode("simple_select");
      } catch {
        // Mapbox Draw may ignore mode changes while the style is reloading.
      }
    }
  }, 0);
}

function buildDrawFeatureForArea(area) {
  return {
    ...area.geojson,
    id: area.id,
    properties: {
      ...(area.geojson?.properties || {}),
      serviceAreaName: area.name || "Service area"
    }
  };
}

function getEditableMeasurementFeature() {
  const features = mapboxDraw?.getAll().features || [];
  if (!features.length) return null;

  if (activeMeasurementAreaId) {
    return features.find((feature) => String(feature.id) === String(activeMeasurementAreaId)) || null;
  }

  const savedIds = new Set((currentMeasurement.areas || []).map((area) => String(area.id)));
  return features.find((feature) => !savedIds.has(String(feature.id))) || null;
}

function updateMeasurementTotal() {
  currentMeasurement = recalculateMeasurementTotals(currentMeasurement);
  measuredArea.textContent = `${Math.round(currentMeasurement.squareFeet || 0).toLocaleString("en-US")} SqFt`;
  if (saveMeasurementAreaButton) {
    saveMeasurementAreaButton.textContent = activeMeasurementAreaId ? "Update Shape" : "Add Drawn Area";
  }
}

function getNextMeasurementAreaName() {
  return `Service area ${(currentMeasurement.areas?.length || 0) + 1}`;
}

function useMeasurement() {
  updateMeasurementFromDraw();
  const editableFeature = getEditableMeasurementFeature();
  if (editableFeature) {
    saveMeasurementArea();
  }
  if (!currentMeasurement.squareFeet) {
    alert("Add at least one service area before using the measurement.");
    return;
  }

  const row = activeMeasurementLineItem || findPressureWashingLineItem();
  if (!row) return;
  row.querySelector(".line-quantity").value = Math.round(currentMeasurement.squareFeet);
  updateEstimateTotals();
  measurementDialog.close();
}

function findPressureWashingLineItem() {
  return Array.from(lineItemsContainer.querySelectorAll(".line-item-row"))
    .find((row) => row.querySelector(".line-service").value === "Pressure Washing");
}

function addMeasuredPressureWashingRow() {
  const service = serviceCatalog.find((item) => item.name === "Pressure Washing");
  addLineItemRow({ ...service, quantity: 1 });
  return Array.from(lineItemsContainer.querySelectorAll(".line-item-row")).at(-1);
}

function buildStaticMapUrl(measurement) {
  if (!measurement.geojson || !settings.mapboxPublicToken) return "";
  const features = measurement.geojson.type === "FeatureCollection"
    ? measurement.geojson.features
    : [measurement.geojson];
  const overlay = encodeURIComponent(JSON.stringify({
    type: "FeatureCollection",
    features: features.map((feature) => ({
      ...feature,
      properties: {
        stroke: "#1c7c54",
        "stroke-width": 4,
        "stroke-opacity": 1,
        fill: "#1c7c54",
        "fill-opacity": 0.25
      }
    }))
  }));
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/geojson(${overlay})/auto/700x420@2x?access_token=${encodeURIComponent(settings.mapboxPublicToken)}`;
}

function render() {
  renderDashboard();
  renderMetrics();
  renderPendingPayments();
  renderJobList();
  renderJobDetail();
  renderCustomers();
  renderExpenses();
  saveWorkspaceStateToHash();
}

function renderDashboard() {
  if (!document.querySelector("#dashEstimatesSent")) return;
  const scopedJobs = filterByTimeframe(jobs, "createdAt");
  const scopedExpenses = filterByTimeframe(expenses, "expenseDate");
  const estimatesSent = scopedJobs.filter((job) => statuses.indexOf(job.status) >= statuses.indexOf("Estimate Sent")).length;
  const estimatesAccepted = scopedJobs.filter((job) => statuses.indexOf(job.status) >= statuses.indexOf("Estimate Signed")).length;
  const revenue = scopedJobs
    .filter((job) => job.status === "Paid" || job.squareFinalPaidAt)
    .reduce((sum, job) => sum + Number(job.estimate || 0), 0);
  const expenseTotal = scopedExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  document.querySelector("#dashEstimatesSent").textContent = estimatesSent;
  document.querySelector("#dashEstimatesAccepted").textContent = estimatesAccepted;
  document.querySelector("#dashRevenue").textContent = currency.format(revenue);
  document.querySelector("#dashExpenses").textContent = currency.format(expenseTotal);
  renderTopSourceMetric(scopedJobs);

  const breakdownRows = buildDashboardBreakdownRows(scopedJobs, dashboardBreakdown?.value || "lead");
  renderDashboardChart(breakdownRows);
  renderDashboardBreakdown(breakdownRows);
  renderDashboardNotifications(scopedJobs);
  renderDashboardFirstRunPanel();
  renderDashboardPaymentSetupPanel();
}

function renderDashboardFirstRunPanel() {
  if (!dashboardFirstRunPanel) return;

  const hasCustomerOrJobData = jobs.length > 0 || customers.length > 0;
  dashboardFirstRunPanel.hidden = hasCustomerOrJobData;
  if (dashboardFirstRunTitle) {
    dashboardFirstRunTitle.textContent = showPostOnboardingGuidance
      ? "Workspace setup complete"
      : "Ready for the first workflow";
  }
  if (dashboardFirstRunHint) {
    dashboardFirstRunHint.textContent = "Start by adding a customer, then create a job and send your first estimate.";
  }
}

function renderDashboardPaymentSetupPanel() {
  if (!dashboardPaymentSetupPanel) return;

  dashboardPaymentSetupPanel.hidden = hasConfiguredInvoicePaymentMethod();
}

function filterByTimeframe(items, dateField) {
  const timeframe = dashboardTimeframe?.value || "30";
  if (timeframe === "all") return items;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Number(timeframe || 30));
  return items.filter((item) => {
    const date = new Date(item[dateField] || item.createdAt || 0);
    return !Number.isNaN(date.getTime()) && date >= cutoff;
  });
}

function buildDashboardBreakdownRows(scopedJobs, mode) {
  if (dashboardChartTitle) {
    dashboardChartTitle.textContent = {
      lead: "Income by lead type",
      service: "Income by service",
      city: "Income by city"
    }[mode] || "Income by lead type";
  }
  if (dashboardBreakdownEyebrow && dashboardBreakdownTitle) {
    dashboardBreakdownEyebrow.textContent = {
      lead: "Lead Sources",
      service: "Services",
      city: "Locations"
    }[mode] || "Lead Sources";
    dashboardBreakdownTitle.textContent = {
      lead: "Pipeline breakdown",
      service: "Paid service mix",
      city: "Paid city mix"
    }[mode] || "Pipeline breakdown";
  }

  if (mode === "service") {
    return buildServiceRevenueRows(scopedJobs);
  }

  if (mode === "city") {
    return buildCityRevenueRows(scopedJobs);
  }

  return leadSources.map((source) => {
    const sourceJobs = scopedJobs.filter((job) => job.leadSource === source.value);
    const estimatesSent = sourceJobs.filter((job) => statuses.indexOf(job.status) >= statuses.indexOf("Estimate Sent")).length;
    const accepted = sourceJobs.filter((job) => statuses.indexOf(job.status) >= statuses.indexOf("Estimate Signed")).length;
    return {
      ...source,
      jobs: sourceJobs.length,
      estimatesSent,
      accepted,
      conversionRate: estimatesSent ? accepted / estimatesSent : null,
      revenue: sourceJobs
        .filter(isRevenueJob)
        .reduce((sum, job) => sum + Number(job.estimate || 0), 0)
    };
  });
}

function renderTopSourceMetric(scopedJobs) {
  const topSource = leadSources
    .map((source) => {
      const sourceJobs = scopedJobs.filter((job) => job.leadSource === source.value);
      const estimatesSent = sourceJobs.filter((job) => statuses.indexOf(job.status) >= statuses.indexOf("Estimate Sent")).length;
      const accepted = sourceJobs.filter((job) => statuses.indexOf(job.status) >= statuses.indexOf("Estimate Signed")).length;
      return {
        ...source,
        jobs: sourceJobs.length,
        estimatesSent,
        accepted,
        conversionRate: estimatesSent ? accepted / estimatesSent : null
      };
    })
    .filter((source) => source.estimatesSent >= 3)
    .sort((a, b) => b.conversionRate - a.conversionRate || b.accepted - a.accepted || b.jobs - a.jobs)[0];

  const value = document.querySelector("#dashTopSource");
  const meta = document.querySelector("#dashTopSourceMeta");
  if (!value || !meta) return;

  if (!topSource) {
    value.textContent = "-";
    meta.textContent = "Not enough data yet";
    return;
  }

  value.textContent = topSource.label;
  meta.textContent = `${Math.round(topSource.conversionRate * 100)}% conversion · ${topSource.jobs} job${topSource.jobs === 1 ? "" : "s"}`;
}

function renderDashboardChart(rows) {
  const chart = document.querySelector("#leadSourceChart");
  const legend = document.querySelector("#leadSourceLegend");
  const revenueRows = rows.filter((row) => row.revenue > 0);
  const total = revenueRows.reduce((sum, row) => sum + row.revenue, 0);
  if (!total) {
    chart.style.background = "var(--muted)";
    chart.innerHTML = renderEmptyState("Revenue will chart here", "Paid jobs will populate this breakdown automatically.");
    legend.innerHTML = "";
    return;
  }

  let cursor = 0;
  const stops = revenueRows.map((row) => {
    const start = cursor;
    cursor += (row.revenue / total) * 100;
    return `${row.color} ${start}% ${cursor}%`;
  });
  chart.style.background = `conic-gradient(${stops.join(", ")})`;
  chart.innerHTML = "";
  legend.innerHTML = revenueRows.map((row) => `
    <div class="legend-row">
      <span class="source-dot" style="background:${row.color}"></span>
      <span class="cell--muted">${row.label}</span>
      <strong class="num cell--strong cell--nowrap">${currency.format(row.revenue)}</strong>
    </div>
  `).join("");
}

function renderDashboardBreakdown(rows) {
  const container = document.querySelector("#leadSourceBreakdown");
  if (!container) return;

  const hasActivity = rows.some((row) => row.jobs || row.estimatesSent || row.revenue);
  if (!hasActivity) {
    container.innerHTML = renderEmptyState("No source activity yet", "New leads and estimates will build this comparison.");
    return;
  }

  container.innerHTML = rows.map((row) => `
    <div class="breakdown-row">
      <div class="breakdown-row-main">
        <span class="source-dot" style="background:${row.color}"></span>
        <strong class="cell--strong">${row.label}</strong>
      </div>
      <strong class="num cell--strong cell--nowrap">${currency.format(row.revenue)}</strong>
      <div class="breakdown-stat-row">${formatBreakdownMeta(row)}</div>
    </div>
  `).join("");
}

function formatBreakdownMeta(row) {
  const parts = [`<span class="breakdown-stat num">${row.jobs} job${row.jobs === 1 ? "" : "s"}</span>`];
  if (row.estimatesSent) {
    parts.push(`<span class="breakdown-stat num">${row.accepted || 0}/${row.estimatesSent} accepted</span>`);
  }
  if (row.conversionRate !== null && row.conversionRate !== undefined) {
    const percent = Math.round(row.conversionRate * 100);
    const badgeClass = percent >= 70 ? "success" : percent >= 40 ? "warning" : "muted";
    parts.push(`<span class="conversion-badge ${badgeClass} num">${percent}% converted</span>`);
  }
  return parts.join("");
}

function renderDashboardNotifications(scopedJobs) {
  const container = document.querySelector("#dashboardNotifications");
  if (!container) return;

  const allNotifications = scopedJobs
    .flatMap(buildJobNotifications)
    .sort((a, b) => new Date(b.receivedAt || b.at) - new Date(a.receivedAt || a.at));
  const notifications = allNotifications.filter((item) => !dismissedNotificationIds.has(item.id));

  if (notificationCount) {
    notificationCount.textContent = String(notifications.length);
    notificationCount.hidden = notifications.length === 0;
  }

  if (!notifications.length) {
    container.innerHTML = renderEmptyState("No unread notifications", "Customer actions and payment updates will appear here.");
    return;
  }

  container.innerHTML = notifications.slice(0, 12).map((item) => `
    <button class="notification-item" type="button" data-job-id="${escapeHtml(item.jobId)}" data-notification-id="${escapeHtml(item.id)}">
      <span class="notification-icon ${escapeHtml(item.level)}" data-kind="${escapeHtml(item.kind)}" aria-hidden="true"></span>
      <span>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.customer)} | ${escapeHtml(item.detail)} | ${formatNotificationDate(item.receivedAt || item.at)}</small>
      </span>
    </button>
  `).join("");

  container.querySelectorAll("[data-job-id]").forEach((button) => {
    button.addEventListener("click", () => {
      dismissNotification(button.dataset.notificationId);
      selectedJobId = button.dataset.jobId;
      setActiveView("pipeline");
      closeNotificationDropdown();
      render();
    });
  });
}

function toggleNotificationDropdown(event) {
  event?.stopPropagation();
  if (!notificationDropdown || !notificationToggle) return;

  const isOpen = !notificationDropdown.hidden;
  notificationDropdown.hidden = isOpen;
  notificationToggle.setAttribute("aria-expanded", String(!isOpen));
}

function closeNotificationDropdown() {
  if (!notificationDropdown || !notificationToggle) return;
  notificationDropdown.hidden = true;
  notificationToggle.setAttribute("aria-expanded", "false");
}

function closeNotificationDropdownFromOutside(event) {
  if (!notificationDropdown || notificationDropdown.hidden) return;
  if (event.target.closest(".notification-menu")) return;
  closeNotificationDropdown();
}

function clearAllDashboardNotifications(event) {
  event?.stopPropagation();
  jobs.flatMap(buildJobNotifications).forEach((item) => dismissedNotificationIds.add(item.id));
  saveDismissedNotificationIds();
  renderDashboard();
}

function dismissNotification(id) {
  if (!id) return;
  dismissedNotificationIds.add(id);
  saveDismissedNotificationIds();
}

function loadDismissedNotificationIds() {
  try {
    const stored = JSON.parse(localStorage.getItem("pressureflow.dismissedNotifications") || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function saveDismissedNotificationIds() {
  localStorage.setItem("pressureflow.dismissedNotifications", JSON.stringify([...dismissedNotificationIds].slice(-300)));
}

function buildJobNotifications(job) {
  return [
    job.estimateApprovedAt ? {
      id: `estimate-approved-${job.id}-${job.estimateApprovedAt}`,
      jobId: job.id,
      at: job.estimateApprovedAt,
      level: "success",
      kind: "check",
      title: "Estimate accepted",
      customer: job.customerName,
      detail: currency.format(job.estimate)
    } : null,
    job.estimateRejectedAt ? {
      id: `estimate-rejected-${job.id}-${job.estimateRejectedAt}`,
      jobId: job.id,
      at: job.estimateRejectedAt,
      level: "warning",
      kind: "reject",
      title: "Estimate rejected",
      customer: job.customerName,
      detail: job.estimateRejectionReason ? formatEstimateRejectionReason(job.estimateRejectionReason) : "Follow up"
    } : null,
    job.contractSignedAt ? {
      id: `contract-signed-${job.id}-${job.contractSignedAt}`,
      jobId: job.id,
      at: job.contractSignedAt,
      level: "success",
      kind: "check",
      title: "Contract signed",
      customer: job.customerName,
      detail: "Ready for deposit"
    } : null,
    job.squareDepositPaidAt ? {
      id: `deposit-paid-${job.id}-${job.squareDepositPaidAt}`,
      jobId: job.id,
      at: job.squareDepositPaidAt,
      level: "success",
      kind: "money",
      title: "Deposit paid",
      customer: job.customerName,
      detail: currency.format(getDeposit(job))
    } : null,
    job.scheduledAt ? {
      id: `job-scheduled-${job.id}-${job.scheduledEventAt || job.scheduledAt}`,
      jobId: job.id,
      at: job.scheduledAt,
      receivedAt: job.scheduledEventAt || job.updatedAt || job.scheduledAt,
      level: "info",
      kind: "calendar",
      title: "Job scheduled",
      customer: job.customerName,
      detail: `Scheduled for ${formatDisplayDateTime(job.scheduledAt)}`
    } : null,
    job.squareFinalPaidAt ? {
      id: `final-paid-${job.id}-${job.squareFinalPaidAt}`,
      jobId: job.id,
      at: job.squareFinalPaidAt,
      level: "success",
      kind: "money",
      title: "Final invoice paid",
      customer: job.customerName,
      detail: currency.format(getFinalBalance(job))
    } : null
  ].filter(Boolean);
}

function formatNotificationDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value || "");
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatDisplayDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value || "");
  }

  const datePart = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
  const timePart = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
  return `${datePart}, ${timePart}`;
}

function renderMetrics() {
  const openJobs = jobs.filter((job) => job.status !== "Paid" && !job.squareFinalPaidAt).length;
  const awaitingDeposit = jobs
    .filter((job) => job.status === "Deposit Sent")
    .reduce((sum, job) => sum + getDeposit(job), 0);
  const readyToSchedule = jobs.filter((job) => job.status === "Deposit Paid").length;
  const unpaidBalance = jobs
    .filter((job) => job.status === "Final Invoice Sent")
    .reduce((sum, job) => sum + getFinalBalance(job), 0);

  document.querySelector("#openJobs").textContent = openJobs;
  document.querySelector("#awaitingDeposit").textContent = currency.format(awaitingDeposit);
  document.querySelector("#readyToSchedule").textContent = readyToSchedule;
  document.querySelector("#unpaidBalance").textContent = currency.format(unpaidBalance);
}

function renderPendingPayments() {
  if (!pendingPaymentsList) return;

  const pendingPayments = jobs
    .flatMap(getPendingPaymentRows)
    .sort((a, b) => new Date(a.sentAt || 0) - new Date(b.sentAt || 0));

  if (!pendingPayments.length) {
    if (pendingPaymentsPanel) {
      pendingPaymentsPanel.hidden = true;
    }
    pendingPaymentsList.innerHTML = "";
    return;
  }

  if (pendingPaymentsPanel) {
    pendingPaymentsPanel.hidden = false;
  }

  pendingPaymentsList.innerHTML = pendingPayments.map((payment) => `
    <article class="pending-payment-row ${payment.isOverdue ? "overdue" : ""}">
      <div>
        <strong>${escapeHtml(payment.job.customerName)}</strong>
        <p>${escapeHtml(payment.label)} ${escapeHtml(payment.invoiceNumber)} | <span class="num cell--nowrap">${currency.format(payment.amount)}</span> | <span class="num cell--nowrap">${payment.daysSinceSent} day${payment.daysSinceSent === 1 ? "" : "s"}</span></p>
      </div>
      ${payment.isOverdue ? '<span class="status-pill overdue-pill">Overdue</span>' : ""}
      <button class="secondary-small-button" type="button" data-open-payment-confirmation="${escapeHtml(payment.job.id)}" data-invoice-type="${escapeHtml(payment.invoiceType)}">Mark as paid</button>
    </article>
  `).join("");

  pendingPaymentsList.querySelectorAll("[data-open-payment-confirmation]").forEach((button) => {
    button.addEventListener("click", async () => {
      await handleManualPayment(button.dataset.openPaymentConfirmation, button.dataset.invoiceType);
    });
  });
}

function getPendingPaymentRows(job) {
  const rows = [];
  if (job.status === "Deposit Sent") {
    rows.push(buildPendingPaymentRow(job, "deposit"));
  }
  if (job.status === "Final Invoice Sent") {
    rows.push(buildPendingPaymentRow(job, "final"));
  }
  return rows.filter(Boolean);
}

function buildPendingPaymentRow(job, invoiceType) {
  const isDeposit = invoiceType === "deposit";
  const sentAt = isDeposit
    ? job.squareDepositInvoiceSentAt || job.updatedAt || job.createdAt
    : job.squareFinalInvoiceSentAt || job.completionNoticeSentAt || job.updatedAt || job.createdAt;
  const followUpHours = Number(settings.paymentFollowUpHours ?? 48);
  return {
    job,
    invoiceType,
    sentAt,
    daysSinceSent: getElapsedDays(sentAt),
    isOverdue: followUpHours > 0 && getElapsedHours(sentAt) >= followUpHours,
    label: isDeposit ? "Deposit" : "Final",
    amount: isDeposit ? getDeposit(job) : getFinalBalance(job),
    invoiceNumber: getPressureFlowInvoiceNumber(job, invoiceType)
  };
}

function getElapsedHours(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 36e5));
}

function getElapsedDays(value) {
  return Math.floor(getElapsedHours(value) / 24);
}

async function handleManualPayment(jobId, invoiceType) {
  const payment = await openPaymentDialog(jobs.find((item) => item.id === jobId), invoiceType);
  if (!payment) return;

  const action = invoiceType === "deposit" ? "mark-deposit-paid" : "mark-paid";
  await runAction(jobId, action, {
    paymentMethod: payment.paymentMethod,
    paymentReference: payment.paymentReference
  });
}

function renderJobList() {
  const selectedStatus = statusFilter.value;
  jobList.innerHTML = "";

  if (selectedStatus === "all") {
    const activeJobs = jobs.filter((job) => job.status !== "Paid");
    const completedJobs = jobs.filter((job) => job.status === "Paid");

    if (!activeJobs.length && !completedJobs.length) {
      jobList.innerHTML = renderEmptyState("No jobs match this filter", "Try a different status or add a new job.");
      return;
    }

    if (activeJobs.length) {
      activeJobs.forEach((job) => appendJobCard(jobList, job));
    } else {
      jobList.innerHTML = renderEmptyState("No in-progress jobs right now", "Active jobs will show here.");
    }

    if (completedJobs.length) {
      const completedSection = document.createElement("details");
      completedSection.className = "completed-jobs";
      completedSection.open = completedJobsExpanded;
      completedSection.addEventListener("toggle", () => {
        completedJobsExpanded = completedSection.open;
      });
      completedSection.innerHTML = `
        <summary>Completed jobs <span>${completedJobs.length}</span></summary>
        <div class="completed-job-list"></div>
      `;
      const completedList = completedSection.querySelector(".completed-job-list");
      completedJobs.forEach((job) => appendJobCard(completedList, job));
      jobList.append(completedSection);
    }
    return;
  }

  const visibleJobs = jobs.filter((job) => job.status === selectedStatus);
  if (visibleJobs.length === 0) {
    jobList.innerHTML = renderEmptyState("No jobs match this filter", "Try a different status or add a new job.");
    return;
  }

  visibleJobs.forEach((job) => {
    appendJobCard(jobList, job);
  });
}

function appendJobCard(container, job) {
  const card = document.createElement("button");
  card.className = `job-card ${job.id === selectedJobId ? "selected" : ""}`;
  card.type = "button";
  card.addEventListener("click", () => {
    selectedJobId = job.id;
    render();
  });

  card.innerHTML = `
    <div>
      <h4>${escapeHtml(job.customerName)}</h4>
      <p>${escapeHtml(job.serviceType)} at ${escapeHtml(job.address)}</p>
      <p>${currency.format(job.estimate)} estimate, ${job.depositPercent}% deposit | ${formatLeadSource(job.leadSource)}</p>
    </div>
    <span class="status-pill ${getStatusClass(job.status)}">${job.status}</span>
  `;

  container.append(card);
}

function renderJobDetail() {
  const job = jobs.find((item) => item.id === selectedJobId) ?? jobs.find((item) => item.status !== "Paid") ?? jobs[0];

  if (!job) {
    jobDetail.innerHTML = renderEmptyState("Create your first job", "The workflow details will appear here.");
    return;
  }

  selectedJobId = job.id;
  const nextAction = getNextAction(job);
  const fallbackAction = getFallbackAction(job);
  const hasPendingWorkflowAction = pendingWorkflowAction.startsWith(`${job.id}:`);
  const workflowMessage = workflowActionMessage?.jobId === job.id ? workflowActionMessage : null;

  jobDetail.innerHTML = `
    <section class="detail-section">
      <h4>${escapeHtml(job.customerName)}</h4>
      <p>${escapeHtml(job.email)} | ${escapeHtml(job.phone)}</p>
      <p>${escapeHtml(job.address)}</p>
    </section>

    <section class="detail-section">
      <div class="detail-row"><span>Status</span><strong>${job.status}</strong></div>
      <div class="detail-row"><span>Lead source</span><strong>${formatLeadSource(job.leadSource)}</strong></div>
      ${job.estimateRejectedAt ? `<div class="detail-row"><span>Estimate rejected</span><strong>${formatShortDate(job.estimateRejectedAt)}${job.estimateRejectionReason ? ` - ${formatEstimateRejectionReason(job.estimateRejectionReason)}` : ""}</strong></div>` : ""}
      ${job.estimateRejectionNote ? `<div class="detail-row"><span>Rejection note</span><strong>${escapeHtml(job.estimateRejectionNote)}</strong></div>` : ""}
      <div class="detail-row"><span>Estimate</span><strong>${currency.format(job.estimate)}</strong></div>
      ${renderEstimateItems(job)}
      <div class="detail-row"><span>Deposit</span><strong>${currency.format(getDeposit(job))}</strong></div>
      <div class="detail-row"><span>Final balance</span><strong>${currency.format(getFinalBalance(job))}</strong></div>
      ${renderMeasurementDetail(job)}
      <div class="detail-row"><span>Scheduled</span><strong>${escapeHtml(job.scheduledAt ? formatDisplayDateTime(job.scheduledAt) : "Not scheduled")}</strong></div>
      <div class="detail-row"><span>Completion notice</span><strong>${renderCompletionNotice(job)}</strong></div>
    </section>

    ${renderJobPhotos(job)}

    <section class="detail-section">
      <h4>Links</h4>
      <div class="detail-row"><span>PressureFlow estimate</span><strong>${renderLinkedValue("View customer estimate", job.estimateApprovalUrl || job.squareEstimateUrl)}</strong></div>
      <div class="detail-row"><span>Deposit invoice</span><strong>${renderInvoiceValue(job, "deposit")}</strong></div>
      <div class="detail-row"><span>Final invoice</span><strong>${renderInvoiceValue(job, "final")}</strong></div>
      <div class="detail-row"><span>PressureFlow contract</span><strong>${renderContractLink(job)}</strong></div>
    </section>

    ${renderPaymentHistory(job)}

    <section class="detail-section">
      <h4>Workflow</h4>
      <div class="timeline">
        ${statuses.map((status) => renderTimelineStep(job, status)).join("")}
      </div>
    </section>

    <section class="detail-section">
      <h4>Automation</h4>
      <div class="action-list">
        ${hasPendingWorkflowAction ? `<p class="workflow-action-status" role="status">Sending update...</p>` : ""}
        ${workflowMessage ? `<p class="workflow-action-status ${workflowMessage.type === "error" ? "error" : "success"}" role="${workflowMessage.type === "error" ? "alert" : "status"}">${escapeHtml(workflowMessage.message)}</p>` : ""}
        ${renderInvoicePaymentWarning(nextAction)}
        ${nextAction ? `<button class="action-button" type="button" data-action="${nextAction.action}" ${hasPendingWorkflowAction ? "disabled" : ""}>${hasPendingWorkflowAction && pendingWorkflowAction === `${job.id}:${nextAction.action}` ? "Sending..." : nextAction.label}</button>` : ""}
        ${fallbackAction ? `<button class="action-button secondary" type="button" data-action="${fallbackAction.action}" ${hasPendingWorkflowAction ? "disabled" : ""}>${fallbackAction.label}</button>` : ""}
        ${renderEstimateFollowUpControls(job)}
        <button class="action-button danger" type="button" data-action="delete-job" ${hasPendingWorkflowAction ? "disabled" : ""}>Delete Job</button>
      </div>
    </section>

    <section class="detail-section">
      <h4>Notes</h4>
      <p>${escapeHtml(job.notes || "No notes yet.")}</p>
      <p><strong>Access:</strong> ${escapeHtml(job.accessNotes || "No access notes.")}</p>
      <p><strong>Sensitive areas:</strong> ${escapeHtml(job.sensitiveAreas || "No sensitive areas noted.")}</p>
    </section>

    ${renderJobCosts(job)}
  `;

  jobDetail.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => runAction(job.id, button.dataset.action, readActionPayload(button)));
  });
  jobDetail.querySelector("[data-preview-follow-up]")?.addEventListener("click", () => openFollowUpDialog(job));
  jobDetail.querySelector("[data-suppress-follow-up]")?.addEventListener("change", (event) => {
    runAction(job.id, "suppress-estimate-follow-up", { suppressed: event.target.checked });
  });
  attachPhotoViewerHandlers(jobDetail);
  jobDetail.querySelector("[data-view-job-expenses]")?.addEventListener("click", () => viewExpensesForJob(job.id));
}

function renderJobCosts(job) {
  if (statuses.indexOf(job.status) < statuses.indexOf("Completed")) {
    return "";
  }

  const linkedExpenses = expenses.filter((expense) => expense.jobId === job.id);
  if (!linkedExpenses.length) {
    return "";
  }

  const linkedTotal = linkedExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const invoiceTotal = Number(job.estimate || 0);
  const profit = invoiceTotal - linkedTotal;
  const margin = invoiceTotal > 0 ? Math.round((profit / invoiceTotal) * 100) : 0;
  const paid = job.status === "Paid" || job.squareFinalPaidAt;

  return `
    <section class="detail-section job-costs">
      <h4>Job costs</h4>
      <div class="detail-row">
        <span>Linked expenses</span>
        <strong>${currency.format(linkedTotal)} <button class="text-link-button" type="button" data-view-job-expenses>View ${linkedExpenses.length} expense${linkedExpenses.length === 1 ? "" : "s"}</button></strong>
      </div>
      <div class="detail-row"><span>Invoice total</span><strong>${currency.format(invoiceTotal)}</strong></div>
      <div class="detail-row profit-row ${paid ? "paid" : "estimated"}">
        <span>${paid ? "Profit" : "Estimated profit"}</span>
        <strong>${currency.format(profit)} (${margin}% margin)</strong>
      </div>
    </section>
  `;
}

function viewExpensesForJob(jobId) {
  selectedExpenseJobId = jobId;
  selectedExpenseId = null;
  setActiveView("expenses");
  renderExpenses();
  saveWorkspaceStateToHash();
}

function renderEstimateFollowUpControls(job) {
  const followUpType = getActiveFollowUpType(job);
  if (!followUpType && !getLatestFollowUpTask(job.id)) {
    return "";
  }

  const task = getLatestFollowUpTask(job.id, followUpType);
  const suppressed = Boolean(job.suppressEstimateFollowUp);
  return `
    <div class="follow-up-control">
      <label class="follow-up-toggle-row" title="Suppress follow-up email">
        <span>Suppress follow-up email</span>
        <input class="toggle-input" type="checkbox" data-suppress-follow-up ${suppressed ? "checked" : ""}>
        <span class="toggle-switch" aria-hidden="true"></span>
      </label>
      <button class="action-button secondary" type="button" data-preview-follow-up title="${suppressed ? "Follow-up suppressed for this job." : "Send follow-up email"}" ${suppressed || !followUpType ? "disabled" : ""}>Send follow-up email</button>
      <p class="field__help">${escapeHtml(formatFollowUpStatus(task, suppressed))}</p>
      ${followUpType && task?.status === "pending" && !suppressed ? `<button class="link-button" type="button" data-action="cancel-estimate-follow-up">Cancel scheduled follow-up</button>` : ""}
    </div>
  `;
}

function getLatestFollowUpTask(jobId, preferredType = "") {
  const jobTasks = followUpTasks.filter((task) => task.jobId === jobId && isFollowUpTaskType(task.type));
  const typedTasks = preferredType ? jobTasks.filter((task) => task.type === preferredType) : jobTasks;
  const sourceTasks = typedTasks.length ? typedTasks : jobTasks;
  return sourceTasks
    .sort((a, b) => new Date(b.sentAt || b.updatedAt || b.scheduledFor || 0) - new Date(a.sentAt || a.updatedAt || a.scheduledFor || 0))[0] || null;
}

function isFollowUpTaskType(type) {
  return ["estimate_followup", "contract_followup", "deposit_followup", "invoice_followup", "review_request"].includes(type);
}

function getActiveFollowUpType(job) {
  if (job?.status === "Estimate Sent" && job.estimateApprovalUrl && !job.estimateApprovedAt && !job.estimateRejectedAt) return "estimate_followup";
  if (job?.status === "Contract Sent" && job.contractApprovalUrl && !job.contractSignedAt) return "contract_followup";
  if (job?.status === "Deposit Sent" && job.squareDepositInvoiceUrl && !job.squareDepositPaidAt) return "deposit_followup";
  if (job?.status === "Final Invoice Sent" && job.squareFinalInvoiceUrl && !job.squareFinalPaidAt) return "invoice_followup";
  return "";
}

function getFollowUpTypeLabel(type) {
  return {
    estimate_followup: "estimate",
    contract_followup: "contract",
    deposit_followup: "deposit invoice",
    invoice_followup: "final invoice",
    review_request: "review request"
  }[type] || "estimate";
}

function formatFollowUpStatus(task, suppressed) {
  if (suppressed) return "Follow-up suppressed for this job.";
  if (!task) return "No follow-up sent yet.";
  if (task.status === "pending") return `Auto follow-up scheduled for ${formatNotificationDate(task.scheduledFor)} - ${getFollowUpTypeLabel(task.type)}.`;
  if (task.status === "sent") return `Follow-up sent ${formatNotificationDate(task.sentAt)} · ${task.source === "manual" ? "manual" : "auto"}.`;
  if (task.status === "cancelled") return `Follow-up cancelled - ${task.cancelledReason || "cancelled"}.`;
  return "No follow-up sent yet.";
}

function readActionPayload(button) {
  if (button.dataset.action !== "cancel-estimate-follow-up") {
    return {};
  }
  return {};
}

function openFollowUpDialog(job) {
  pendingFollowUpJobId = job.id;
  const subject = renderFollowUpTemplate(settings.estimateFollowUpSubject || "Following up on your estimate - {jobTitle} at {address}", job);
  const body = renderFollowUpTemplate(settings.estimateFollowUpBody || getDefaultEstimateFollowUpBody(), job);
  followUpPreviewSubject.textContent = subject;
  followUpPreviewBody.innerHTML = body.split("\n\n").map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
  followUpDialog.showModal();
}

async function submitFollowUpDialog(event) {
  if (event.submitter?.value === "cancel") {
    pendingFollowUpJobId = "";
    return;
  }

  event.preventDefault();
  if (!pendingFollowUpJobId) return;

  await runAction(pendingFollowUpJobId, "send-estimate-follow-up");
  pendingFollowUpJobId = "";
  followUpDialog.close();
}

function renderFollowUpTemplate(template, job) {
  const nameParts = String(job.customerName || "").trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || job.customerName || "there";
  const lastName = nameParts.length > 1 ? nameParts.at(-1) : "";
  const values = {
    firstName,
    lastName,
    jobTitle: job.serviceType || "your service",
    address: job.address || "",
    estimateTotal: currency.format(job.estimate || 0),
    businessName: settings.businessName || "Your Company",
    approvalLink: job.estimateApprovalUrl || ""
  };
  return String(template || "").replace(/\{(firstName|lastName|jobTitle|address|estimateTotal|businessName|approvalLink)\}/g, (_, key) => values[key] || "");
}

function renderPaymentHistory(job) {
  const records = Array.isArray(job.paymentRecords) ? job.paymentRecords : [];
  if (!records.length) return "";

  return `
    <section class="detail-section">
      <h4>Payment history</h4>
      ${records.map((record) => `
        <div class="detail-row">
          <span>${escapeHtml(record.invoiceType === "deposit" ? "Deposit" : "Final invoice")}</span>
          <strong>${escapeHtml(formatPaymentRecord(record))}</strong>
        </div>
      `).join("")}
    </section>
  `;
}

function formatPaymentRecord(record) {
  const source = record.source === "manual" ? "marked paid" : "paid";
  const method = record.method ? ` - ${record.method}` : "";
  const amount = ` - ${currency.format(record.amount || 0)}`;
  const reference = record.reference ? ` - ref: ${record.reference}` : "";
  return `${source}${method}${amount}${reference}`;
}

function renderCustomers() {
  customerList.innerHTML = "";

  if (customers.length === 0) {
    customerList.innerHTML = renderEmptyState("No customer files yet", "Add a customer before creating a job.");
    customerDetail.innerHTML = renderEmptyState("Create your first customer file", "Contact info, photos, and measurements will appear here.");
    return;
  }

  if (!customers.some((customer) => customer.id === selectedCustomerId)) {
    selectedCustomerId = customers[0].id;
  }

  customers.forEach((customer) => {
    const relatedJobs = getCustomerJobs(customer);
    const photoCount = getCustomerServiceAreaPhotos(customer).length;
    const card = document.createElement("button");
    card.className = `job-card ${customer.id === selectedCustomerId ? "selected" : ""}`;
    card.type = "button";
    card.addEventListener("click", () => {
      selectedCustomerId = customer.id;
      renderCustomers();
      saveWorkspaceStateToHash();
    });
    card.innerHTML = `
      <div>
        <h4>${escapeHtml(customer.customerName)}</h4>
        <p>${escapeHtml(customer.email || "No email")} | ${escapeHtml(customer.phone || "No phone")}</p>
        <p>${escapeHtml(customer.address || "No address")} | ${formatLeadSource(customer.leadSource)} | ${relatedJobs.length} job${relatedJobs.length === 1 ? "" : "s"}</p>
      </div>
      <span class="status-pill">${photoCount} photos</span>
    `;
    customerList.append(card);
  });

  renderCustomerDetail();
}

function renderCustomerDetail() {
  const customer = customers.find((item) => item.id === selectedCustomerId);
  if (!customer) {
    customerDetail.innerHTML = renderEmptyState("Select a customer", "Customer details will appear here.");
    return;
  }

  const relatedJobs = getCustomerJobs(customer);
  customerDetail.innerHTML = `
    <section class="detail-section">
      <h4>${escapeHtml(customer.customerName)}</h4>
      <p>${escapeHtml(customer.email || "No email")} | ${escapeHtml(customer.phone || "No phone")}</p>
      <p>${escapeHtml(customer.address || "No address")}</p>
      <p>${formatLeadSource(customer.leadSource)}</p>
    </section>

    <section class="detail-section">
      <h4>Service Area Photos</h4>
      ${renderPhotoGrid(getCustomerServiceAreaPhotos(customer))}
    </section>

    <section class="detail-section">
      <h4>Saved Map Measurements</h4>
      ${renderCustomerMeasurements(customer.propertyMeasurements || [])}
    </section>

    <section class="detail-section">
      <h4>Notes</h4>
      <p>${escapeHtml(customer.notes || "No notes yet.")}</p>
    </section>

    <section class="detail-section">
      <h4>Jobs</h4>
      ${relatedJobs.length ? relatedJobs.map((job) => `
        <button class="related-job-button" type="button" data-job-id="${escapeHtml(job.id)}">
          <span>${escapeHtml(job.serviceType)} | ${escapeHtml(job.status)}<br><small>${escapeHtml(renderCustomerJobMilestonesText(job))}</small></span>
          <strong>${currency.format(job.estimate)}</strong>
        </button>
      `).join("") : renderEmptyState("No jobs yet", "Jobs created for this customer will appear here.")}
    </section>

    <section class="detail-section">
      <button class="action-button" type="button" data-create-job-from-customer="${escapeHtml(customer.id)}">Create Job From Customer</button>
      <button class="action-button danger" type="button" data-delete-customer="${escapeHtml(customer.id)}">Delete Customer</button>
    </section>
  `;

  customerDetail.querySelectorAll("[data-job-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedJobId = button.dataset.jobId;
      setActiveView("pipeline");
      render();
    });
  });
  customerDetail.querySelector("[data-create-job-from-customer]")?.addEventListener("click", () => openNewJobForCustomer(customer));
  customerDetail.querySelector("[data-delete-customer]")?.addEventListener("click", () => deleteCustomer(customer.id));
  customerDetail.querySelectorAll("[data-delete-measurement]").forEach((button) => {
    button.addEventListener("click", () => deleteCustomerMeasurement(customer.id, button.dataset.deleteMeasurement, button.dataset.areaKey));
  });
  attachPhotoViewerHandlers(customerDetail);
}

async function deleteCustomerMeasurement(customerId, measurementId, areaKey) {
  const confirmed = confirm("Delete this saved service area measurement?");
  if (!confirmed) return;

  try {
    const data = await apiRequest(`/api/customers/${customerId}/measurements/${encodeURIComponent(measurementId)}`, { areaKey }, "DELETE");
    const index = customers.findIndex((item) => item.id === customerId);
    if (index >= 0) {
      customers[index] = data.customer;
    }
    renderCustomers();
  } catch (error) {
    alert(error.message);
  }
}

async function deleteCustomer(customerId) {
  const customer = customers.find((item) => item.id === customerId);
  if (!customer) return;

  const confirmed = confirm(`Delete ${customer.customerName}'s customer file? Existing jobs will stay in PressureFlow.`);
  if (!confirmed) return;

  try {
    await apiRequest(`/api/customers/${customerId}`, {}, "DELETE");
    customers = customers.filter((item) => item.id !== customerId);
    selectedCustomerId = customers[0]?.id ?? null;
    await loadCustomers();
    renderDashboard();
  } catch (error) {
    alert(error.message);
  }
}

function renderExpenses() {
  if (!expenseList || !expenseDetail) return;
  expenseList.innerHTML = "";
  renderExpenseJobFilter();
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthTotal = expenses
    .filter((expense) => String(expense.expenseDate || "").startsWith(monthKey))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const receiptCount = expenses.reduce((sum, expense) => sum + (expense.receiptPhotos?.length || 0), 0);

  document.querySelector("#expenseTotal").textContent = currency.format(total);
  document.querySelector("#expenseReceiptCount").textContent = receiptCount;
  document.querySelector("#expenseMonthTotal").textContent = currency.format(monthTotal);
  document.querySelector("#expenseCount").textContent = expenses.length;

  const visibleExpenses = getVisibleExpenses();

  if (!expenses.length) {
    expenseList.innerHTML = renderEmptyState("No expenses yet", "Add your first receipt to track job costs.");
    expenseDetail.innerHTML = renderEmptyState("Select an expense", "Receipt photos and notes will appear here.");
    return;
  }

  if (!visibleExpenses.length) {
    expenseList.innerHTML = renderEmptyState("No expenses match this job filter", "Choose another job or clear the filter.");
    expenseDetail.innerHTML = renderEmptyState("No expense selected", "Choose another job or clear the filter.");
    return;
  }

  if (!visibleExpenses.some((expense) => expense.id === selectedExpenseId)) {
    selectedExpenseId = visibleExpenses[0].id;
  }

  visibleExpenses.forEach((expense) => {
    const linkedJob = getExpenseJob(expense);
    const card = document.createElement("button");
    card.className = `expense-card ${expense.id === selectedExpenseId ? "selected" : ""}`;
    card.type = "button";
    card.addEventListener("click", () => {
      selectedExpenseId = expense.id;
      renderExpenses();
      saveWorkspaceStateToHash();
    });
    card.innerHTML = `
      <div>
        <h4>${escapeHtml(expense.vendor)}</h4>
        <p>${escapeHtml(expense.category || "Uncategorized")} | ${escapeHtml(expense.expenseDate || "")}</p>
        ${linkedJob ? `<p>${escapeHtml(formatJobSummaryLabel(linkedJob))}</p>` : ""}
        <p>${expense.receiptPhotos?.length || 0} receipt photo${expense.receiptPhotos?.length === 1 ? "" : "s"}</p>
      </div>
      <span class="status-pill num">${currency.format(expense.amount || 0)}</span>
    `;
    expenseList.append(card);
  });

  renderExpenseDetail();
}

function renderExpenseDetail() {
  const expense = expenses.find((item) => item.id === selectedExpenseId);
  if (!expense) return;
  const linkedJob = getExpenseJob(expense);
  expenseDetail.innerHTML = `
    <section class="detail-section">
      <h4>${escapeHtml(expense.vendor)}</h4>
      <p>${escapeHtml(expense.category || "Uncategorized")} | ${escapeHtml(expense.expenseDate || "")}</p>
      <div class="detail-row"><span>Amount</span><strong>${currency.format(expense.amount || 0)}</strong></div>
      <div class="detail-row"><span>Linked job</span><strong>${linkedJob ? escapeHtml(formatJobSummaryLabel(linkedJob, { includeStatus: true })) : "None"}</strong></div>
      <div class="action-list">
        <button class="action-button" type="button" data-edit-expense="${escapeHtml(expense.id)}">Edit Expense</button>
        <button class="action-button danger" type="button" data-delete-expense="${escapeHtml(expense.id)}">Delete Expense</button>
      </div>
    </section>
    <section class="detail-section">
      <h4>Receipts</h4>
      ${renderPhotoGrid(expense.receiptPhotos || [])}
    </section>
    <section class="detail-section">
      <h4>Notes</h4>
      <p>${escapeHtml(expense.notes || "No notes.")}</p>
    </section>
  `;
  attachPhotoViewerHandlers(expenseDetail);
  expenseDetail.querySelector("[data-edit-expense]")?.addEventListener("click", openEditExpense);
  expenseDetail.querySelector("[data-delete-expense]")?.addEventListener("click", () => deleteExpense(expense.id));
}

function getVisibleExpenses() {
  if (!selectedExpenseJobId) return expenses;
  return expenses.filter((expense) => expense.jobId === selectedExpenseJobId);
}

function renderExpenseJobFilter() {
  if (!expenseJobFilter) return;
  const linkedJobIds = new Set(expenses.map((expense) => expense.jobId).filter(Boolean));
  const filterJobs = jobs.filter((job) => linkedJobIds.has(job.id));
  expenseJobFilter.innerHTML = `
    <option value="">All expenses</option>
    ${filterJobs.map((job) => `<option value="${escapeHtml(job.id)}">${escapeHtml(formatJobSummaryLabel(job, { includeStatus: true }))}</option>`).join("")}
  `;
  if (selectedExpenseJobId && !linkedJobIds.has(selectedExpenseJobId)) {
    selectedExpenseJobId = "";
  }
  expenseJobFilter.value = selectedExpenseJobId;
}

function renderExpenseJobOptions(selectedId = "") {
  const select = expenseForm?.elements.jobId;
  if (!select) return;
  const optionJobs = getExpenseLinkableJobs(selectedId);
  select.innerHTML = `
    <option value="">No linked job</option>
    ${optionJobs.map((job) => `<option value="${escapeHtml(job.id)}">${escapeHtml(formatJobDropdownLabel(job))}</option>`).join("")}
  `;
  select.value = selectedId;
}

function getExpenseLinkableJobs(selectedId = "") {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  return jobs
    .filter((job) => {
      if (job.id === selectedId) return true;
      if (statuses.indexOf(job.status) < statuses.indexOf("Paid")) return true;
      return getJobSortDate(job) >= cutoff;
    })
    .sort((a, b) => {
      const aCompleted = statuses.indexOf(a.status) >= statuses.indexOf("Completed");
      const bCompleted = statuses.indexOf(b.status) >= statuses.indexOf("Completed");
      if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;
      return aCompleted ? getJobSortDate(b) - getJobSortDate(a) : getJobSortDate(a) - getJobSortDate(b);
    });
}

function getExpenseJob(expense) {
  return jobs.find((job) => job.id === expense.jobId);
}

function formatJobSummaryLabel(job, options = {}) {
  const label = `${job.customerName || "Unnamed customer"} - ${getJobTitle(job)}`;
  return options.includeStatus ? `${label} (${job.status || "Lead"})` : label;
}

function formatJobDropdownLabel(job) {
  return `${job.customerName || "Unnamed customer"} — ${getJobTitle(job)} · ${job.status || "Lead"} · ${formatJobDropdownDate(job)}`;
}

function getJobTitle(job) {
  return job.serviceType || job.streetAddress || String(job.address || "Job").split(",")[0] || "Job";
}

function getJobSortDate(job) {
  const date = new Date(job.scheduledAt || job.createdAt || job.updatedAt || 0).getTime();
  return Number.isFinite(date) ? date : 0;
}

function formatJobDropdownDate(job) {
  const date = new Date(job.scheduledAt || job.createdAt || job.updatedAt || 0);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

async function deleteExpense(expenseId) {
  const expense = expenses.find((item) => item.id === expenseId);
  if (!expense) return;

  const confirmed = confirm(`Delete expense from ${expense.vendor} for ${currency.format(expense.amount || 0)}?`);
  if (!confirmed) return;

  try {
    await apiRequest(`/api/expenses/${encodeURIComponent(expenseId)}`, {}, "DELETE");
    expenses = expenses.filter((item) => item.id !== expenseId);
    selectedExpenseId = expenses[0]?.id ?? null;
    await loadExpenses();
    renderDashboard();
  } catch (error) {
    alert(error.message);
  }
}

function getCustomerJobPhotos(relatedJobs, type) {
  return relatedJobs.flatMap((job) => (job.jobPhotos?.[type] || []).map((photo) => ({
    ...photo,
    name: `${job.serviceType} - ${photo.name || type}`
  })));
}

function getCustomerServiceAreaPhotos(customer) {
  return (customer.serviceAreaPhotos || []).filter((photo) => !["before", "after"].includes(photo.category));
}

function formatLeadSource(value) {
  return leadSources.find((source) => source.value === value)?.label || "Referral";
}

function getCustomerJobs(customer) {
  const addressKey = normalizeKey(customer.address);
  return jobs.filter((job) => (
    job.customerId === customer.id ||
    (customer.email && job.email === customer.email) ||
    (addressKey && normalizeKey(job.address) === addressKey)
  ));
}

function attachPhotoViewerHandlers(container) {
  container.querySelectorAll(".photo-open").forEach((button) => {
    button.addEventListener("click", () => {
      photoViewerTitle.textContent = button.dataset.photoName || "Photo";
      photoViewerImage.src = button.dataset.photoSrc || "";
      photoViewerDialog.showModal();
    });
  });
}

function renderTimelineStep(job, status) {
  const isComplete = statuses.indexOf(status) <= statuses.indexOf(job.status);
  return `
    <div class="timeline-step ${isComplete ? "complete" : ""}">
      <span class="timeline-dot"></span>
      <span>${status}</span>
    </div>
  `;
}

function getNextAction(job) {
  const actions = {
    "Lead": { label: "Send Estimate", action: "send-square-estimate" },
    "Estimate Sent": { label: "Mark Estimate Signed", action: "mark-estimate-signed" },
    "Estimate Signed": { label: "Send Contract", action: "send-contract" },
    "Contract Sent": { label: "Mark Contract Signed", action: "mark-contract-signed" },
    "Contract Signed": getDeposit(job) > 0
      ? { label: "Send Deposit Invoice", action: "send-deposit-invoice" }
      : { label: "Schedule Job", action: "schedule" },
    "Deposit Sent": { label: "Mark Deposit Paid", action: "mark-deposit-paid" },
    "Deposit Paid": { label: "Schedule Job", action: "schedule" },
    "Scheduled": { label: "Complete Job + Send Final Invoice", action: "complete" },
    "Completed": { label: "Send Final Invoice", action: "send-final-invoice" },
    "Final Invoice Sent": { label: "Mark Paid", action: "mark-paid" }
  };

  return actions[job.status] ?? null;
}

function getFallbackAction(job) {
  const actions = {
    "Deposit Sent": { label: "Open Deposit Invoice", action: "open-deposit-invoice" },
    "Final Invoice Sent": { label: "Open Final Invoice", action: "open-final-invoice" }
  };

  return actions[job.status] ?? null;
}

function renderInvoicePaymentWarning(nextAction) {
  const invoiceActions = new Set(["send-deposit-invoice", "send-final-invoice", "complete"]);
  if (!nextAction || !invoiceActions.has(nextAction.action) || hasConfiguredInvoicePaymentMethod()) {
    return "";
  }

  return `<div class="payment-warning status-warning" role="status">
    <p><strong>Payment options are not configured yet.</strong> Customers will not have a clear way to pay this invoice.</p>
    <button class="secondary-small-button" type="button" data-open-settings-payment>Configure payment options</button>
  </div>`;
}

function hasConfiguredInvoicePaymentMethod() {
  return Boolean(
    settings.hasConfiguredInvoicePaymentMethod ||
    (settings.hasSquareAccessToken && settings.squareLocationId) ||
    settings.hasStripeSecretKey ||
    settings.zellePayment ||
    settings.cashAppPayment ||
    settings.venmoPayment ||
    settings.paymentInstructions
  );
}

async function runAction(jobId, action, actionPayload = {}) {
  if (action === "delete-job") {
    await deleteJob(jobId);
    return;
  }

  if (action === "reminder") {
    const job = jobs.find((item) => item.id === jobId);
    showToast(buildReminderMessage(job), "info");
    return;
  }

  if (action === "open-deposit-invoice" || action === "open-final-invoice") {
    const job = jobs.find((item) => item.id === jobId);
    const url = action === "open-deposit-invoice" ? job?.squareDepositInvoiceUrl : job?.squareFinalInvoiceUrl;
    if (url) {
      window.open(url, "_blank", "noopener");
    }
    return;
  }

  const payload = { ...actionPayload };

  if ((action === "mark-deposit-paid" || action === "mark-paid") && !payload.paymentMethod) {
    const invoiceType = action === "mark-deposit-paid" ? "deposit" : "final";
    const payment = await openPaymentDialog(jobs.find((item) => item.id === jobId), invoiceType);
    if (!payment) return;

    payload.paymentMethod = payment.paymentMethod;
    payload.paymentReference = payment.paymentReference;
  }

  if (action === "schedule") {
    const schedule = await openScheduleDialog();
    if (!schedule) return;

    payload.scheduledAt = schedule.scheduledAt;
    payload.jobDurationMinutes = schedule.jobDurationMinutes;
  }

  if (action === "complete") {
    const completion = await openCompletionDialog(jobs.find((item) => item.id === jobId));
    if (!completion) return;

    payload.jobPhotos = completion.jobPhotos;
  }

  const actionKey = `${jobId}:${action}`;
  if (pendingWorkflowAction) return;
  pendingWorkflowAction = actionKey;
  workflowActionMessage = null;
  renderJobDetail();

  try {
    const updated = await apiRequest(`/api/jobs/${jobId}/${action}`, payload);
    selectedJobId = updated.job.id;
    if (action === "send-square-estimate") {
      const followUpText = settings.estimateFollowUpEnabled === false ? "" : " Automatic follow-up scheduled.";
      showToast(`Estimate sent to ${updated.job.email}.${followUpText}`);
    }
    if (action === "send-contract") {
      showToast(`Contract sent to ${updated.job.email}.`);
    }
    if (action === "send-deposit-invoice") {
      showToast(`Deposit invoice sent to ${updated.job.email}.`);
    }
    if (action === "send-final-invoice") {
      showToast(`Final invoice sent to ${updated.job.email}.`);
    }
    if (action === "complete") {
      showToast(`Final invoice sent to ${updated.job.email}. Completion photos were saved.`);
    }
    await loadFollowUpTasks();
    await loadJobs();
    await loadCustomers();
  } catch (error) {
    workflowActionMessage = {
      jobId,
      type: "error",
      message: error.message || "Unable to complete this action. Try again."
    };
    showToast(workflowActionMessage.message, "error");
  } finally {
    pendingWorkflowAction = "";
    renderJobDetail();
  }
}

async function deleteJob(jobId) {
  const job = jobs.find((item) => item.id === jobId);
  if (!job) return;

  const confirmed = confirm(`Delete ${job.customerName}'s job? This removes it from PressureFlow.`);
  if (!confirmed) return;

  try {
    await apiRequest(`/api/jobs/${jobId}`, {}, "DELETE");
    jobs = jobs.filter((item) => item.id !== jobId);
    selectedJobId = jobs[0]?.id ?? null;
    await loadJobs();
  } catch (error) {
    alert(error.message);
  }
}

function showToast(message, tone = "success", action = null) {
  if (!message) return;

  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.className = "toast-stack";
    toastContainer.setAttribute("aria-live", "polite");
    toastContainer.setAttribute("aria-atomic", "true");
    document.body.append(toastContainer);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast--${tone}`;
  const text = document.createElement("span");
  text.textContent = message;
  toast.append(text);
  if (action?.label && typeof action.onClick === "function") {
    const button = document.createElement("button");
    button.className = "toast__action";
    button.type = "button";
    button.textContent = action.label;
    button.addEventListener("click", () => {
      action.onClick();
      toast.remove();
    });
    toast.append(button);
  }
  toastContainer.append(toast);

  window.setTimeout(() => {
    toast.remove();
    if (toastContainer && !toastContainer.children.length) {
      toastContainer.remove();
      toastContainer = null;
    }
  }, 4500);
}

async function apiRequest(url, payload, method = "POST") {
  const headers = { "content-type": "application/json" };
  if (csrfToken) {
    headers["x-csrf-token"] = csrfToken;
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(payload)
    });
  } catch (error) {
    throw new Error("The server could not be reached. Check your connection and try again.");
  }

  return readJsonResponse(response, "Request failed.");
}

async function readJsonResponse(response, fallbackMessage = "Request failed.") {
  const rawText = await response.text();
  const statusText = response.status ? ` HTTP ${response.status}` : "";
  if (!rawText.trim()) {
    throw new Error(`The server returned an empty response${statusText}. Please try again.`);
  }

  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`The server returned an unreadable response${statusText}. Please try again.`);
  }

  if (!response.ok) {
    throw new Error(data.error || `${fallbackMessage}${statusText}`);
  }

  return data;
}

function buildReminderMessage(job) {
  if (!job) {
    return "No job selected.";
  }

  if (job.status === "Deposit Sent") {
    return `Reminder queued for ${job.customerName}: deposit invoice for ${currency.format(getDeposit(job))}.`;
  }

  if (job.status === "Final Invoice Sent") {
    return `Reminder queued for ${job.customerName}: final balance of ${currency.format(getFinalBalance(job))}.`;
  }

  return `Follow-up queued for ${job.customerName} about ${job.status.toLowerCase()}.`;
}

function getDefaultScheduleValue() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function openScheduleDialog() {
  const defaultValue = getDefaultScheduleValue();
  const [date, time] = defaultValue.split("T");
  const durationHours = Math.max(Number(settings.defaultJobDurationMinutes || 180) / 60, 0.25);

  scheduleForm.elements.durationHours.value = formatDurationHours(durationHours);
  scheduleForm.elements.scheduleDate.value = date;
  scheduleForm.elements.scheduleTime.value = time;
  scheduleDialog.showModal();

  return new Promise((resolve) => {
    pendingScheduleResolve = resolve;
  });
}

function submitScheduleDialog(event) {
  event.preventDefault();

  if (event.submitter?.value === "cancel") {
    scheduleDialog.close();
    resolveScheduleDialog(null);
    return;
  }

  const durationHours = normalizeDurationHours(scheduleForm.elements.durationHours.value);
  const scheduleDate = scheduleForm.elements.scheduleDate.value;
  const scheduleTime = scheduleForm.elements.scheduleTime.value;

  if (!scheduleDate || !scheduleTime) {
    return;
  }

  scheduleDialog.close();
  resolveScheduleDialog({
    scheduledAt: `${scheduleDate}T${scheduleTime}`,
    jobDurationMinutes: Math.round(durationHours * 60)
  });
}

function adjustScheduleDuration(event) {
  const input = scheduleForm.elements.durationHours;
  const step = Number(event.currentTarget.dataset.durationStep || 0);
  input.value = formatDurationHours(normalizeDurationHours(input.value) + step);
}

function normalizeDurationHours(value) {
  const numeric = Number(value || 0);
  const rounded = Math.round(numeric * 4) / 4;
  return Math.min(Math.max(rounded || 0.25, 0.25), 12);
}

function formatDurationHours(value) {
  return normalizeDurationHours(value).toFixed(2).replace(/\.00$/, "").replace(/0$/, "");
}

function resolveScheduleDialog(value) {
  if (!pendingScheduleResolve) return;
  pendingScheduleResolve(value);
  pendingScheduleResolve = null;
}

function openPaymentDialog(job, invoiceType) {
  if (!paymentDialog || !paymentForm) {
    return Promise.resolve({ paymentMethod: "Other", paymentReference: "" });
  }

  const isDeposit = invoiceType === "deposit";
  const amount = isDeposit ? getDeposit(job || {}) : getFinalBalance(job || {});
  paymentForm.reset();
  paymentForm.elements.paymentMethod.value = "Venmo";
  if (paymentDialogTitle) {
    paymentDialogTitle.textContent = isDeposit ? "Record deposit payment" : "Record final payment";
  }
  if (paymentDialogSummary) {
    const customerName = job?.customerName || "this job";
    paymentDialogSummary.textContent = `${customerName} | ${currency.format(amount)} | ${isDeposit ? "Deposit invoice" : "Final invoice"}`;
  }
  paymentDialog.showModal();

  return new Promise((resolve) => {
    pendingPaymentResolve = resolve;
  });
}

function submitPaymentDialog(event) {
  event.preventDefault();

  if (event.submitter?.value === "cancel") {
    paymentDialog.close();
    resolvePaymentDialog(null);
    return;
  }

  const payload = Object.fromEntries(new FormData(paymentForm).entries());
  paymentDialog.close();
  resolvePaymentDialog({
    paymentMethod: payload.paymentMethod || "Other",
    paymentReference: String(payload.paymentReference || "").trim()
  });
}

function resolvePaymentDialog(value) {
  if (!pendingPaymentResolve) return;
  pendingPaymentResolve(value);
  pendingPaymentResolve = null;
}

function openCompletionDialog(job) {
  currentCompletionPhotos = {
    before: [...(job?.jobPhotos?.before || [])],
    after: [...(job?.jobPhotos?.after || [])]
  };
  completionBeforePhotoInputs.forEach((input) => {
    input.value = "";
  });
  completionAfterPhotoInputs.forEach((input) => {
    input.value = "";
  });
  renderCompletionPhotoPreviews();
  completionDialog.showModal();

  return new Promise((resolve) => {
    pendingCompletionResolve = resolve;
  });
}

function submitCompletionDialog(event) {
  event.preventDefault();

  if (event.submitter?.value === "cancel") {
    completionDialog.close();
    resolveCompletionDialog(null);
    return;
  }

  completionDialog.close();
  resolveCompletionDialog({
    jobPhotos: currentCompletionPhotos
  });
}

function resolveCompletionDialog(value) {
  if (!pendingCompletionResolve) return;
  pendingCompletionResolve(value);
  pendingCompletionResolve = null;
}

function getStatusClass(status) {
  if (status === "Paid") return "done";
  if (status === "Deposit Sent" || status === "Final Invoice Sent") return "blocked";
  return "";
}

init();
