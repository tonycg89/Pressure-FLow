let statuses = [];
let jobs = [];
let customers = [];
let expenses = [];
let selectedJobId = null;
let selectedCustomerId = null;
let selectedExpenseId = null;
let settings = {};
let dismissedNotificationIds = new Set(loadDismissedNotificationIds());

const serviceCatalog = [
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

const defaultEstimateService = serviceCatalog.find((service) => service.name === "Pressure Washing") || serviceCatalog[0];

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});

const leadSources = [
  { value: "referral", label: "Referral", color: "#1c7c54" },
  { value: "door-hanger", label: "Door hanger", color: "#2563eb" },
  { value: "door-to-door", label: "Door to door", color: "#b7791f" },
  { value: "meta-ad", label: "Meta ad", color: "#b42318" },
  { value: "nextdoor-ad", label: "Nextdoor ad", color: "#0f766e" }
];

const jobList = document.querySelector("#jobList");
const jobDetail = document.querySelector("#jobDetail");
const customerList = document.querySelector("#customerList");
const customerDetail = document.querySelector("#customerDetail");
const expenseList = document.querySelector("#expenseList");
const expenseDetail = document.querySelector("#expenseDetail");
const statusFilter = document.querySelector("#statusFilter");
const dashboardTimeframe = document.querySelector("#dashboardTimeframe");
const dashboardBreakdown = document.querySelector("#dashboardBreakdown");
const dashboardChartTitle = document.querySelector("#dashboardChartTitle");
const dashboardBreakdownEyebrow = document.querySelector("#dashboardBreakdownEyebrow");
const dashboardBreakdownTitle = document.querySelector("#dashboardBreakdownTitle");
const sidebarBusinessName = document.querySelector("#sidebarBusinessName");
const notificationToggle = document.querySelector("#notificationToggle");
const notificationDropdown = document.querySelector("#notificationDropdown");
const notificationCount = document.querySelector("#notificationCount");
const notificationClearAll = document.querySelector("#notificationClearAll");
const newJobButton = document.querySelector("#newJobButton");
const editJobButton = document.querySelector("#editJobButton");
const newCustomerButton = document.querySelector("#newCustomerButton");
const editCustomerButton = document.querySelector("#editCustomerButton");
const newExpenseButton = document.querySelector("#newExpenseButton");
const settingsButton = document.querySelector("#settingsButton");
const templatesButton = document.querySelector("#templatesButton");
const navItems = document.querySelectorAll("[data-view]");
const viewPanels = document.querySelectorAll("[data-view-panel]");
const jobDialog = document.querySelector("#jobDialog");
const jobForm = document.querySelector("#jobForm");
const customerDialog = document.querySelector("#customerDialog");
const customerForm = document.querySelector("#customerForm");
const expenseDialog = document.querySelector("#expenseDialog");
const expenseForm = document.querySelector("#expenseForm");
const settingsDialog = document.querySelector("#settingsDialog");
const settingsForm = document.querySelector("#settingsForm");
const settingsStatus = document.querySelector("#settingsStatus");
const templateList = document.querySelector("#templateList");
const templateUploadForm = document.querySelector("#templateUploadForm");
const templateFileInput = document.querySelector("#templateFileInput");
const templateUploadStatus = document.querySelector("#templateUploadStatus");
const jobDialogTitle = jobDialog.querySelector(".dialog-header h2");
const customerDialogTitle = customerDialog.querySelector(".dialog-header h2");
const scheduleDialog = document.querySelector("#scheduleDialog");
const scheduleForm = document.querySelector("#scheduleForm");
const completionDialog = document.querySelector("#completionDialog");
const completionForm = document.querySelector("#completionForm");
const addLineItemButton = document.querySelector("#addLineItemButton");
const lineItemsContainer = document.querySelector("#lineItems");
const discountSelect = document.querySelector("#discountSelect");
const estimateSubtotal = document.querySelector("#estimateSubtotal");
const estimateDiscount = document.querySelector("#estimateDiscount");
const estimateDiscountRow = document.querySelector("#estimateDiscountRow");
const estimateTotal = document.querySelector("#estimateTotal");
const measureFromMapButton = document.querySelector("#measureFromMapButton");
const measurementDialog = document.querySelector("#measurementDialog");
const measurementAddress = document.querySelector("#measurementAddress");
const measurementMapElement = document.querySelector("#measurementMap");
const geocodeAddressButton = document.querySelector("#geocodeAddressButton");
const measuredArea = document.querySelector("#measuredArea");
const measurementStatus = document.querySelector("#measurementStatus");
const savedMeasurementsPanel = document.querySelector("#savedMeasurementsPanel");
const savedMeasurementsList = document.querySelector("#savedMeasurementsList");
const clearMeasurementButton = document.querySelector("#clearMeasurementButton");
const useMeasurementButton = document.querySelector("#useMeasurementButton");
const serviceAreaPhotoInputs = document.querySelectorAll("[data-service-area-photo-input]");
const serviceAreaPhotoPreview = document.querySelector("#serviceAreaPhotoPreview");
const beforePhotoInputs = document.querySelectorAll("[data-before-photo-input]");
const beforePhotoPreviews = document.querySelectorAll("[data-before-photo-preview]");
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
let currentMeasurement = {};
let currentServiceAreaPhotos = [];
let currentJobPhotos = { before: [], after: [] };
let currentCompletionPhotos = { before: [], after: [] };
let currentReceiptPhotos = [];
let mapboxMap = null;
let mapboxDraw = null;
let activeMeasurementLineItem = null;
const beforePhotoSections = [
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

async function init() {
  navItems.forEach((item) => item.addEventListener("click", switchView));
  statusFilter.addEventListener("change", render);
  dashboardTimeframe.addEventListener("change", renderDashboard);
  dashboardBreakdown?.addEventListener("change", renderDashboard);
  notificationToggle?.addEventListener("click", toggleNotificationDropdown);
  notificationClearAll?.addEventListener("click", clearAllDashboardNotifications);
  document.addEventListener("click", closeNotificationDropdownFromOutside);
  newJobButton.addEventListener("click", openNewJob);
  editJobButton.addEventListener("click", openEditJob);
  newCustomerButton.addEventListener("click", openNewCustomer);
  editCustomerButton.addEventListener("click", openEditCustomer);
  newExpenseButton.addEventListener("click", openNewExpense);
  settingsButton.addEventListener("click", openSettings);
  templateUploadForm?.addEventListener("submit", uploadTemplate);
  jobForm.addEventListener("submit", createJob);
  customerForm.addEventListener("submit", saveCustomer);
  expenseForm.addEventListener("submit", saveExpense);
  serviceAreaPhotoInputs.forEach((input) => {
    input.addEventListener("change", (event) => addPhotosFromInput(event, currentServiceAreaPhotos, renderServiceAreaPhotos));
  });
  beforePhotoInputs.forEach((input) => {
    input.addEventListener("change", (event) => addPhotosFromInput(
      event,
      currentJobPhotos.before,
      renderJobPhotoPreviews,
      { section: input.dataset.sectionLabel || "Before" }
    ));
  });
  receiptPhotoInput.addEventListener("change", (event) => addPhotosFromInput(event, currentReceiptPhotos, renderReceiptPhotos));
  addLineItemButton.addEventListener("click", () => addLineItemRow());
  measureFromMapButton.addEventListener("click", openMeasurementDialog);
  geocodeAddressButton.addEventListener("click", geocodeMeasurementAddress);
  clearMeasurementButton.addEventListener("click", clearMeasurementPolygon);
  useMeasurementButton.addEventListener("click", useMeasurement);
  discountSelect.addEventListener("change", updateEstimateTotals);
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", closeDialogFromButton);
  });
  settingsForm.addEventListener("submit", saveSettings);
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
  await loadSettings();
  await loadCustomers();
  await loadExpenses();
  await loadJobs();
}

function switchView(event) {
  const view = event.currentTarget.dataset.view;
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  viewPanels.forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== view;
  });
}

async function loadSettings() {
  try {
    const response = await fetch("/api/settings");
    if (!response.ok) {
      throw new Error("Unable to load settings.");
    }

    const data = await response.json();
    settings = data.settings;
    applySettingsDefaults();
    renderTemplates();
  } catch (error) {
    settingsStatus.textContent = error.message;
  }
}

function applySettingsDefaults() {
  const depositInput = jobForm.elements.depositPercent;
  if (depositInput && settings.defaultDepositPercent) {
    depositInput.value = settings.defaultDepositPercent;
  }
  if (sidebarBusinessName) {
    sidebarBusinessName.textContent = settings.businessName || "Job Command Center";
  }
}

async function loadJobs() {
  try {
    const response = await fetch("/api/jobs");
    if (!response.ok) {
      throw new Error("Unable to load jobs.");
    }

    const data = await response.json();
    jobs = data.jobs;
    statuses = data.statuses;
    selectedJobId = selectedJobId ?? jobs[0]?.id ?? null;
    renderStatusOptions();
    render();
  } catch (error) {
    jobList.innerHTML = `
      <p class="empty-state">
        Start the local server with <strong>node server.js</strong>, then open http://localhost:3000.
      </p>
    `;
    jobDetail.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
}

async function loadCustomers() {
  try {
    const response = await fetch("/api/customers");
    if (!response.ok) {
      throw new Error("Unable to load customers.");
    }

    const data = await response.json();
    customers = data.customers || [];
    selectedCustomerId = selectedCustomerId ?? customers[0]?.id ?? null;
    renderCustomers();
  } catch (error) {
    customerList.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
    customerDetail.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
}

async function loadExpenses() {
  try {
    const response = await fetch("/api/expenses");
    if (!response.ok) {
      throw new Error("Unable to load expenses.");
    }

    const data = await response.json();
    expenses = data.expenses || [];
    selectedExpenseId = selectedExpenseId ?? expenses[0]?.id ?? null;
    renderExpenses();
  } catch (error) {
    expenseList.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
    expenseDetail.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
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

function openSettings() {
  fillSettingsForm();
  settingsDialog.showModal();
}

function fillSettingsForm() {
  settingsForm.elements.businessName.value = settings.businessName || "";
  settingsForm.elements.businessEmail.value = settings.businessEmail || "";
  settingsForm.elements.businessPhone.value = settings.businessPhone || "";
  settingsForm.elements.defaultDepositPercent.value = settings.defaultDepositPercent || 25;
  settingsForm.elements.defaultJobDurationMinutes.value = settings.defaultJobDurationMinutes || 180;
  settingsForm.elements.zellePayment.value = settings.zellePayment || "";
  settingsForm.elements.cashAppPayment.value = settings.cashAppPayment || "";
  settingsForm.elements.venmoPayment.value = settings.venmoPayment || "";
  settingsForm.elements.paymentInstructions.value = settings.paymentInstructions || "";
  settingsForm.elements.googleCalendarId.value = settings.googleCalendarId || "";
  settingsForm.elements.googleClientId.value = settings.googleClientId || "";
  settingsForm.elements.googleClientSecret.value = "";
  settingsForm.elements.googleRedirectUri.value = settings.googleRedirectUri || "http://localhost:3000/auth/google/callback";
  settingsForm.elements.mapboxPublicToken.value = settings.mapboxPublicToken || "";

  const googleText = settings.hasGoogleRefreshToken ? " Google Calendar connected." : settings.hasGoogleClientSecret ? " Google secret saved. Connect Calendar next." : "";
  settingsStatus.textContent = googleText || "PressureFlow invoices will use the payment methods saved above.";
}

async function saveSettings(event) {
  if (event.submitter?.value === "cancel") {
    return;
  }

  event.preventDefault();
  const payload = Object.fromEntries(new FormData(settingsForm).entries());
  payload.defaultDepositPercent = Number(payload.defaultDepositPercent);
  payload.defaultJobDurationMinutes = Number(payload.defaultJobDurationMinutes);

  try {
    const data = await apiRequest("/api/settings", payload);
    settings = data.settings;
    settingsDialog.close();
    applySettingsDefaults();
  } catch (error) {
    settingsStatus.textContent = error.message;
  }
}

function renderTemplates() {
  if (!templateList) return;

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
  } catch (error) {
    templateUploadStatus.textContent = error.message;
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error("Unable to read file.")));
    reader.readAsDataURL(file);
  });
}

function inferTemplateMimeType(fileName) {
  return String(fileName || "").toLowerCase().endsWith(".doc")
    ? "application/msword"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function buildFullAddress(data = {}) {
  const street = String(data.streetAddress || "").trim();
  const unit = String(data.addressUnit || "").trim();
  const city = String(data.city || "").trim();
  const state = String(data.state || "").trim().toUpperCase();
  const zip = String(data.zip || "").trim();
  const streetLine = [street, unit].filter(Boolean).join(" ");
  const cityLine = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [streetLine, cityLine].filter(Boolean).join(", ");
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
    resetJobDialog();
    return;
  }

  event.preventDefault();
  syncAddressFields(jobForm);
  const formData = new FormData(jobForm);
  const job = Object.fromEntries(formData.entries());
  job.lineItems = getEstimateLineItems();
  job.measurement = currentMeasurement;
  job.jobPhotos = currentJobPhotos;
  job.estimate = Number(job.estimate);
  job.depositPercent = Number(job.depositPercent);
  const editingId = jobForm.dataset.editingId;

  try {
    const saved = editingId
      ? await apiRequest(`/api/jobs/${editingId}`, job, "PATCH")
      : await apiRequest("/api/jobs", job);
    selectedJobId = saved.job.id;
    jobForm.reset();
    resetJobDialog();
    jobDialog.close();
    await loadJobs();
    await loadCustomers();
    if (editingId && saved.job.status === "Lead") {
      alert("Pricing changed, so the previous estimate/contract/invoice links were reset. Send the updated estimate again.");
    }
  } catch (error) {
    alert(error.message);
  }
}

function openNewJob() {
  jobForm.reset();
  resetJobDialog();
  jobDialog.showModal();
}

function openNewJobForCustomer(customer) {
  openNewJob();
  jobForm.elements.customerId.value = customer.id;
  jobForm.elements.customerName.value = customer.customerName || "";
  jobForm.elements.email.value = customer.email || "";
  jobForm.elements.phone.value = customer.phone || "";
  fillAddressFields(jobForm, customer);
  jobForm.elements.leadSource.value = customer.leadSource || "referral";
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
  } catch (error) {
    alert(error.message);
  }
}

function openNewExpense() {
  expenseForm.reset();
  currentReceiptPhotos = [];
  receiptPhotoInput.value = "";
  expenseForm.elements.expenseDate.value = new Date().toISOString().slice(0, 10);
  renderReceiptPhotos();
  expenseDialog.showModal();
}

async function saveExpense(event) {
  if (event.submitter?.value === "cancel") {
    return;
  }

  event.preventDefault();
  const payload = Object.fromEntries(new FormData(expenseForm).entries());
  payload.amount = Number(payload.amount || 0);
  payload.receiptPhotos = currentReceiptPhotos;

  try {
    const saved = await apiRequest("/api/expenses", payload);
    selectedExpenseId = saved.expense.id;
    expenseForm.reset();
    currentReceiptPhotos = [];
    expenseDialog.close();
    await loadExpenses();
    renderDashboard();
  } catch (error) {
    alert(error.message);
  }
}

function openEditJob() {
  const job = jobs.find((item) => item.id === selectedJobId);
  if (!job) return;

  jobForm.dataset.editingId = job.id;
  jobDialogTitle.textContent = "Edit pressure washing job";
  jobForm.elements.customerId.value = job.customerId || "";
  jobForm.elements.customerName.value = job.customerName || "";
  jobForm.elements.email.value = job.email || "";
  jobForm.elements.phone.value = job.phone || "";
  fillAddressFields(jobForm, job);
  jobForm.elements.leadSource.value = job.leadSource || "referral";
  jobForm.elements.squareContractId.value = job.squareContractId || "";
  jobForm.elements.squareContractUrl.value = job.squareContractUrl || "";
  jobForm.elements.serviceType.value = job.serviceType || "Driveway cleaning";
  jobForm.elements.estimate.value = job.estimate || 0;
  jobForm.elements.depositPercent.value = job.depositPercent || settings.defaultDepositPercent || 25;
  renderLineItems(job.lineItems?.length ? job.lineItems : [{ ...defaultEstimateService, quantity: 1 }]);
  currentMeasurement = job.measurement || {};
  currentJobPhotos = {
    before: [...(job.jobPhotos?.before || [])],
    after: [...(job.jobPhotos?.after || [])]
  };
  renderJobPhotoPreviews();
  discountSelect.value = String(job.discountPercent || 0);
  updateEstimateTotals();
  jobForm.elements.notes.value = job.notes || "";
  jobForm.elements.accessNotes.value = job.accessNotes || "";
  jobForm.elements.sensitiveAreas.value = job.sensitiveAreas || "";
  jobDialog.showModal();
}

function resetJobDialog() {
  jobForm.dataset.editingId = "";
  jobDialogTitle.textContent = "New pressure washing job";
  renderLineItems([{ ...defaultEstimateService, quantity: 1 }]);
  currentMeasurement = {};
  currentJobPhotos = { before: [], after: [] };
  beforePhotoInputs.forEach((input) => {
    input.value = "";
  });
  renderJobPhotoPreviews();
  discountSelect.value = "0";
  updateEstimateTotals();
}

async function addPhotosFromInput(event, target, renderCallback, metadata = {}) {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  const photos = await Promise.all(files.map((file) => fileToPhoto(file, metadata)));
  target.push(...photos);
  event.target.value = "";
  renderCallback();
}

function fileToPhoto(file, metadata = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const image = new Image();
      image.addEventListener("load", () => {
        const maxSide = 1100;
        const scale = Math.min(maxSide / Math.max(image.width, image.height), 1);
        const width = Math.max(Math.round(image.width * scale), 1);
        const height = Math.max(Math.round(image.height * scale), 1);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, width, height);

        resolve({
          id: crypto.randomUUID(),
          name: file.name.replace(/\.[^.]+$/, ".jpg"),
          dataUrl: canvas.toDataURL("image/jpeg", 0.72),
          capturedAt: new Date().toISOString(),
          ...metadata
        });
      });
      image.addEventListener("error", () => {
        resolve({
          id: crypto.randomUUID(),
          name: file.name,
          dataUrl: reader.result,
          capturedAt: new Date().toISOString(),
          ...metadata
        });
      });
      image.src = reader.result;
    });
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function renderServiceAreaPhotos() {
  renderEditablePhotoGrid(serviceAreaPhotoPreview, currentServiceAreaPhotos, () => renderServiceAreaPhotos());
}

function renderReceiptPhotos() {
  renderEditablePhotoGrid(receiptPhotoPreview, currentReceiptPhotos, () => renderReceiptPhotos());
}

function renderJobPhotoPreviews() {
  beforePhotoPreviews.forEach((preview) => {
    const section = preview.dataset.beforePhotoPreview;
    const photos = (currentJobPhotos.before || []).filter((photo) => (photo.section || "Main driveway") === section);
    renderEditablePhotoGrid(preview, photos, () => renderJobPhotoPreviews(), (photo) => {
      const index = currentJobPhotos.before.findIndex((item) => item.id === photo.id);
      if (index >= 0) {
        currentJobPhotos.before.splice(index, 1);
      }
    });
  });
}

function renderCompletionPhotoPreviews() {
  renderEditablePhotoGrid(completionBeforePhotoPreview, currentCompletionPhotos.before, () => renderCompletionPhotoPreviews());
  renderEditablePhotoGrid(completionAfterPhotoPreview, currentCompletionPhotos.after, () => renderCompletionPhotoPreviews());
}

function renderEditablePhotoGrid(container, photos, rerender, removePhoto) {
  container.innerHTML = "";
  if (!photos.length) {
    container.innerHTML = '<p class="photo-empty">No photos yet.</p>';
    return;
  }

  photos.forEach((photo) => {
    const figure = document.createElement("figure");
    figure.innerHTML = `
      <img src="${escapeHtml(photo.dataUrl)}" alt="${escapeHtml(photo.name)}">
      <button class="photo-remove" type="button" title="Remove photo">X</button>
    `;
    figure.querySelector("button").addEventListener("click", () => {
      if (removePhoto) {
        removePhoto(photo);
      } else {
        const index = photos.findIndex((item) => item.id === photo.id);
        if (index >= 0) {
          photos.splice(index, 1);
        }
      }
      rerender();
    });
    container.append(figure);
  });
}

function closeDialogFromButton(event) {
  const dialog = event.currentTarget.closest("dialog");
  if (!dialog) return;

  if (dialog === jobDialog) {
    jobForm.reset();
    resetJobDialog();
  }

  if (dialog === customerDialog) {
    resetCustomerDialog();
  }

  if (dialog === scheduleDialog) {
    resolveScheduleDialog(null);
  }

  if (dialog === completionDialog) {
    resolveCompletionDialog(null);
  }

  dialog.close();
}

function renderLineItems(items) {
  lineItemsContainer.innerHTML = "";
  const normalizedItems = items.length ? items : [{ ...defaultEstimateService, quantity: 1 }];
  normalizedItems.forEach((item) => addLineItemRow(item));
  updateEstimateTotals();
}

function addLineItemRow(item = serviceCatalog[0]) {
  const catalogItem = serviceCatalog.find((service) => service.name === item.name) || serviceCatalog[0];
  const row = document.createElement("div");
  row.className = "line-item-row";
  row.innerHTML = `
    <label>
      Service
      <select class="line-service">
        ${serviceCatalog.map((service) => `
          <option value="${escapeHtml(service.name)}" ${service.name === catalogItem.name ? "selected" : ""}>
            ${escapeHtml(service.name)}
          </option>
        `).join("")}
      </select>
    </label>
    <label>
      <span class="line-quantity-label">${escapeHtml(catalogItem.unit)}</span>
      <input class="line-quantity" type="number" min="0" step="1" value="${Number(item.quantity || 1)}">
    </label>
    <label>
      Rate
      <input class="line-rate" type="number" min="0" step="0.01" value="${Number(item.price ?? catalogItem.price)}">
    </label>
    <div class="line-item-total">
      <span>${escapeHtml(catalogItem.unit)}</span>
      <strong>$0</strong>
    </div>
    <button class="icon-button line-remove" type="button" title="Remove service">X</button>
  `;

  row.querySelector(".line-service").addEventListener("change", (event) => {
    const selected = serviceCatalog.find((service) => service.name === event.target.value);
    if (!selected) return;
    row.querySelector(".line-rate").value = selected.price;
    row.querySelector(".line-quantity-label").textContent = selected.unit;
    row.querySelector(".line-item-total span").textContent = selected.unit;
    updateEstimateTotals();
  });
  row.querySelector(".line-quantity").addEventListener("input", updateEstimateTotals);
  row.querySelector(".line-rate").addEventListener("input", updateEstimateTotals);
  row.querySelector(".line-remove").addEventListener("click", () => {
    row.remove();
    if (!lineItemsContainer.children.length) {
      addLineItemRow();
    }
    updateEstimateTotals();
  });

  lineItemsContainer.append(row);
  updateEstimateTotals();
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

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function openMeasurementDialog() {
  if (!settings.mapboxPublicToken) {
    alert("Add your Mapbox public token in Settings before using map measurement.");
    return;
  }

  activeMeasurementLineItem = findPressureWashingLineItem() || addMeasuredPressureWashingRow();
  syncAddressFields(jobForm);
  measurementAddress.value = jobForm.elements.address.value || currentMeasurement.address || "";
  measuredArea.textContent = currentMeasurement.squareFeet
    ? `${Math.round(currentMeasurement.squareFeet).toLocaleString("en-US")} SqFt`
    : "0 SqFt";
  measurementStatus.textContent = "Draw or edit a polygon around the surface.";
  renderSavedMeasurements([]);
  measurementDialog.showModal();
  setTimeout(() => {
    initializeMeasurementMap();
    if (measurementAddress.value) {
      geocodeMeasurementAddress();
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
      defaultMode: "draw_polygon"
    });
    mapboxMap.addControl(mapboxDraw, "top-left");
    mapboxMap.on("draw.create", updateMeasurementFromDraw);
    mapboxMap.on("draw.update", updateMeasurementFromDraw);
    mapboxMap.on("draw.delete", updateMeasurementFromDraw);
  } else {
    mapboxMap.resize();
  }

  if (currentMeasurement.geojson && mapboxDraw) {
    mapboxDraw.deleteAll();
    mapboxDraw.add(currentMeasurement.geojson);
    mapboxDraw.changeMode("simple_select");
  }
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
  await loadSavedMeasurementsForAddress(currentMeasurement.address);
}

async function loadSavedMeasurementsForAddress(address) {
  const normalizedAddress = String(address || "").trim();
  if (!normalizedAddress) {
    renderSavedMeasurements([]);
    return;
  }

  try {
    const response = await fetch(`/api/property-measurements?address=${encodeURIComponent(normalizedAddress)}`);
    if (!response.ok) {
      throw new Error("Unable to load saved measurements.");
    }
    const data = await response.json();
    renderSavedMeasurements(data.measurements || []);
  } catch {
    renderSavedMeasurements([]);
  }
}

function renderSavedMeasurements(measurements) {
  const reusable = measurements.filter((item) => item.measurement?.geojson && item.measurement?.squareFeet);
  savedMeasurementsPanel.hidden = reusable.length === 0;
  savedMeasurementsList.innerHTML = "";

  reusable.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "saved-measurement-button";
    button.innerHTML = `
      <span>
        <strong>${Math.round(item.measurement.squareFeet).toLocaleString("en-US")} SqFt</strong>
      </span>
      <span>Use saved</span>
    `;
    button.addEventListener("click", () => applySavedMeasurement(item.measurement));
    savedMeasurementsList.append(button);
  });
}

function applySavedMeasurement(measurement) {
  currentMeasurement = { ...measurement, capturedAt: new Date().toISOString() };
  measurementAddress.value = currentMeasurement.address || measurementAddress.value;
  measuredArea.textContent = `${Math.round(currentMeasurement.squareFeet || 0).toLocaleString("en-US")} SqFt`;
  initializeMeasurementMap();
  if (currentMeasurement.center?.length) {
    mapboxMap?.flyTo({ center: currentMeasurement.center, zoom: currentMeasurement.zoom || 19, essential: true });
  }
  measurementStatus.textContent = "Saved measurement loaded.";
}

function updateMeasurementFromDraw() {
  const feature = mapboxDraw?.getAll().features?.[0];
  if (!feature) {
    currentMeasurement = { ...currentMeasurement, geojson: null, squareFeet: 0, perimeterFeet: 0, staticImageUrl: "" };
    measuredArea.textContent = "0 SqFt";
    measurementStatus.textContent = "Draw a polygon around the surface.";
    return;
  }

  const squareFeet = Math.round(turf.area(feature) * 10.7639);
  const perimeterFeet = calculatePerimeterFeet(feature);
  const center = mapboxMap.getCenter();
  currentMeasurement = {
    ...currentMeasurement,
    address: measurementAddress.value.trim(),
    squareFeet,
    perimeterFeet,
    geojson: feature,
    center: [center.lng, center.lat],
    zoom: mapboxMap.getZoom(),
    capturedAt: new Date().toISOString()
  };
  currentMeasurement.staticImageUrl = buildStaticMapUrl(currentMeasurement);
  measuredArea.textContent = `${squareFeet.toLocaleString("en-US")} SqFt`;
  measurementStatus.textContent = "Measurement ready.";
}

function calculatePerimeterFeet(feature) {
  const outerRing = feature?.geometry?.coordinates?.[0];
  if (!Array.isArray(outerRing) || outerRing.length < 2) {
    return 0;
  }

  const line = turf.lineString(outerRing);
  return Math.round(turf.length(line, { units: "feet" }));
}

function clearMeasurementPolygon() {
  mapboxDraw?.deleteAll();
  updateMeasurementFromDraw();
}

function useMeasurement() {
  updateMeasurementFromDraw();
  if (!currentMeasurement.squareFeet) {
    alert("Draw a polygon before using the measurement.");
    return;
  }

  const row = activeMeasurementLineItem || findPressureWashingLineItem() || addMeasuredPressureWashingRow();
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
  const overlay = encodeURIComponent(JSON.stringify({
    type: "FeatureCollection",
    features: [{
      ...measurement.geojson,
      properties: {
        stroke: "#1c7c54",
        "stroke-width": 4,
        "stroke-opacity": 1,
        fill: "#1c7c54",
        "fill-opacity": 0.25
      }
    }]
  }));
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/geojson(${overlay})/auto/700x420@2x?access_token=${encodeURIComponent(settings.mapboxPublicToken)}`;
}

function render() {
  renderDashboard();
  renderMetrics();
  renderJobList();
  renderJobDetail();
  renderCustomers();
  renderExpenses();
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

  const breakdownRows = buildDashboardBreakdownRows(scopedJobs, dashboardBreakdown?.value || "lead");
  renderDashboardChart(breakdownRows);
  renderDashboardBreakdown(breakdownRows);
  renderDashboardNotifications(scopedJobs);
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
    const sourceJobs = scopedJobs.filter((job) => (job.leadSource || "referral") === source.value);
    return {
      ...source,
      jobs: sourceJobs.length,
      estimatesSent: sourceJobs.filter((job) => statuses.indexOf(job.status) >= statuses.indexOf("Estimate Sent")).length,
      accepted: sourceJobs.filter((job) => statuses.indexOf(job.status) >= statuses.indexOf("Estimate Signed")).length,
      revenue: sourceJobs
        .filter(isRevenueJob)
        .reduce((sum, job) => sum + Number(job.estimate || 0), 0)
    };
  });
}

function buildServiceRevenueRows(scopedJobs) {
  const rows = new Map();
  scopedJobs.filter(isRevenueJob).forEach((job) => {
    const lineItems = job.lineItems?.length ? job.lineItems : [{ name: job.serviceType || "Service", total: Number(job.estimate || 0) }];
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

function createBreakdownRow(label, index) {
  const colors = ["#1c7c54", "#2563eb", "#b7791f", "#b42318", "#0f766e", "#6941c6", "#c11574", "#475467"];
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

function renderDashboardChart(rows) {
  const chart = document.querySelector("#leadSourceChart");
  const legend = document.querySelector("#leadSourceLegend");
  const revenueRows = rows.filter((row) => row.revenue > 0);
  const total = revenueRows.reduce((sum, row) => sum + row.revenue, 0);
  if (!total) {
    chart.style.background = "#edf2f7";
    chart.innerHTML = "<span>No revenue yet</span>";
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
      <span>${row.label}</span>
      <strong>${currency.format(row.revenue)}</strong>
    </div>
  `).join("");
}

function renderDashboardBreakdown(rows) {
  document.querySelector("#leadSourceBreakdown").innerHTML = rows.map((row) => `
    <div class="breakdown-row">
      <span class="source-dot" style="background:${row.color}"></span>
      <span>${row.label}<br><small>${row.jobs} job${row.jobs === 1 ? "" : "s"}${row.estimatesSent ? ` | ${row.estimatesSent} sent` : ""}${row.accepted ? ` | ${row.accepted} accepted` : ""}</small></span>
      <strong>${currency.format(row.revenue)}</strong>
    </div>
  `).join("");
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
    container.innerHTML = '<p class="empty-state compact-empty">No unread notifications.</p>';
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
      document.querySelector('[data-view="pipeline"]').click();
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
      detail: `Scheduled for ${formatShortDate(job.scheduledAt)}`
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

function renderMetrics() {
  const openJobs = jobs.filter((job) => job.status !== "Paid").length;
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

function renderJobList() {
  const selectedStatus = statusFilter.value;
  jobList.innerHTML = "";

  if (selectedStatus === "all") {
    const activeJobs = jobs.filter((job) => job.status !== "Paid");
    const completedJobs = jobs.filter((job) => job.status === "Paid");

    if (!activeJobs.length && !completedJobs.length) {
      jobList.innerHTML = '<p class="empty-state">No jobs match this filter.</p>';
      return;
    }

    if (activeJobs.length) {
      activeJobs.forEach((job) => appendJobCard(jobList, job));
    } else {
      jobList.innerHTML = '<p class="empty-state">No in-progress jobs right now.</p>';
    }

    if (completedJobs.length) {
      const completedSection = document.createElement("details");
      completedSection.className = "completed-jobs";
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
    jobList.innerHTML = '<p class="empty-state">No jobs match this filter.</p>';
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
    jobDetail.innerHTML = '<p class="empty-state">Create your first job to start the workflow.</p>';
    return;
  }

  selectedJobId = job.id;
  const nextAction = getNextAction(job);
  const fallbackAction = getFallbackAction(job);

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
      <div class="detail-row"><span>Scheduled</span><strong>${escapeHtml(job.scheduledAt || "Not scheduled")}</strong></div>
      <div class="detail-row"><span>Calendar event</span><strong>${renderCalendarValue(job.googleCalendarEventId, job.googleCalendarEventUrl)}</strong></div>
      <div class="detail-row"><span>Completion notice</span><strong>${renderCompletionNotice(job)}</strong></div>
    </section>

    ${renderJobPhotos(job)}

    <section class="detail-section">
      <h4>Links</h4>
      <div class="detail-row"><span>PressureFlow estimate</span><strong>${renderLinkedValue("approval link", job.estimateApprovalUrl || job.squareEstimateUrl)}</strong></div>
      <div class="detail-row"><span>Deposit invoice</span><strong>${renderInvoiceValue(job, "deposit")}</strong></div>
      <div class="detail-row"><span>Final invoice</span><strong>${renderInvoiceValue(job, "final")}</strong></div>
      <div class="detail-row"><span>PressureFlow contract</span><strong>${renderContractLink(job)}</strong></div>
    </section>

    <section class="detail-section">
      <h4>Workflow</h4>
      <div class="timeline">
        ${statuses.map((status) => renderTimelineStep(job, status)).join("")}
      </div>
    </section>

    <section class="detail-section">
      <h4>Automation</h4>
      <div class="action-list">
        ${nextAction ? `<button class="action-button" type="button" data-action="${nextAction.action}">${nextAction.label}</button>` : ""}
        ${fallbackAction ? `<button class="action-button secondary" type="button" data-action="${fallbackAction.action}">${fallbackAction.label}</button>` : ""}
        <button class="action-button secondary" type="button" data-action="reminder">Send Follow-up Email</button>
        <button class="action-button danger" type="button" data-action="delete-job">Delete Job</button>
      </div>
    </section>

    <section class="detail-section">
      <h4>Notes</h4>
      <p>${escapeHtml(job.notes || "No notes yet.")}</p>
      <p><strong>Access:</strong> ${escapeHtml(job.accessNotes || "No access notes.")}</p>
      <p><strong>Sensitive areas:</strong> ${escapeHtml(job.sensitiveAreas || "No sensitive areas noted.")}</p>
    </section>
  `;

  jobDetail.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => runAction(job.id, button.dataset.action));
  });
  attachPhotoViewerHandlers(jobDetail);
}

function renderCustomers() {
  customerList.innerHTML = "";

  if (customers.length === 0) {
    customerList.innerHTML = '<p class="empty-state">No customer files yet. Add a customer before creating a job.</p>';
    customerDetail.innerHTML = '<p class="empty-state">Create your first customer file to store contact info and service-area photos.</p>';
    return;
  }

  if (!customers.some((customer) => customer.id === selectedCustomerId)) {
    selectedCustomerId = customers[0].id;
  }

  customers.forEach((customer) => {
    const relatedJobs = getCustomerJobs(customer);
    const photoCount = (customer.serviceAreaPhotos?.length || 0) +
      getCustomerJobPhotos(relatedJobs, "before").length +
      getCustomerJobPhotos(relatedJobs, "after").length;
    const card = document.createElement("button");
    card.className = `job-card ${customer.id === selectedCustomerId ? "selected" : ""}`;
    card.type = "button";
    card.addEventListener("click", () => {
      selectedCustomerId = customer.id;
      renderCustomers();
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
    customerDetail.innerHTML = '<p class="empty-state">Select a customer.</p>';
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
      ${renderPhotoGrid(customer.serviceAreaPhotos || [])}
    </section>

    <section class="detail-section">
      <h4>Saved Map Measurements</h4>
      ${renderCustomerMeasurements(customer.propertyMeasurements || [])}
    </section>

    <section class="detail-section">
      <h4>Before Photos</h4>
      ${renderPhotoGrid(getCustomerJobPhotos(relatedJobs, "before"))}
      <h4>After Photos</h4>
      ${renderPhotoGrid(getCustomerJobPhotos(relatedJobs, "after"))}
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
      `).join("") : '<p>No jobs yet.</p>'}
    </section>

    <section class="detail-section">
      <button class="action-button" type="button" data-create-job-from-customer="${escapeHtml(customer.id)}">Create Job From Customer</button>
    </section>
  `;

  customerDetail.querySelectorAll("[data-job-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedJobId = button.dataset.jobId;
      document.querySelector('[data-view="pipeline"]').click();
      render();
    });
  });
  customerDetail.querySelector("[data-create-job-from-customer]")?.addEventListener("click", () => openNewJobForCustomer(customer));
  attachPhotoViewerHandlers(customerDetail);
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
  const labels = {
    "price-too-high": "Price too high",
    "timing-not-right": "Timing not right",
    "went-with-another-company": "Went with another company",
    "scope-changed": "Scope changed",
    "just-researching": "Just researching",
    other: "Other"
  };
  return labels[value] || "No reason provided";
}

function renderCustomerMeasurements(measurements) {
  const reusable = (measurements || []).filter((item) => item.measurement?.squareFeet);
  if (!reusable.length) {
    return '<p>No saved map measurements yet.</p>';
  }

  return reusable.map((item) => `
    <div class="detail-row">
      <span>${escapeHtml(item.label || "Service area")}<br><small>${escapeHtml(item.address || "")}</small></span>
      <strong>${Math.round(item.measurement.squareFeet).toLocaleString("en-US")} SqFt</strong>
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
      ${renderBeforePhotoSections(before)}
      <p><strong>After</strong></p>
      ${renderPhotoGrid(after)}
    </section>
  `;
}

function renderBeforePhotoSections(photos) {
  if (!photos.length) {
    return '<p>No photos saved.</p>';
  }

  const sections = [...beforePhotoSections];
  photos.forEach((photo) => {
    const section = photo.section || "Main driveway";
    if (!sections.includes(section)) {
      sections.push(section);
    }
  });

  return sections
    .map((section) => {
      const sectionPhotos = photos.filter((photo) => (photo.section || "Main driveway") === section);
      if (!sectionPhotos.length) return "";
      return `
        <div class="saved-photo-section">
          <p class="photo-label">${escapeHtml(section)}</p>
          ${renderPhotoGrid(sectionPhotos)}
        </div>
      `;
    })
    .join("");
}

function renderPhotoGrid(photos) {
  if (!photos.length) {
    return '<p>No photos saved.</p>';
  }

  return `
    <div class="photo-grid saved-photo-grid">
      ${photos.map((photo) => `
        <figure>
          <button class="photo-open" type="button" data-photo-src="${escapeHtml(photo.dataUrl)}" data-photo-name="${escapeHtml(photo.name)}">
            <img src="${escapeHtml(photo.dataUrl)}" alt="${escapeHtml(photo.name)}">
          </button>
        </figure>
      `).join("")}
    </div>
  `;
}

function renderExpenses() {
  if (!expenseList || !expenseDetail) return;
  expenseList.innerHTML = "";
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

  if (!expenses.length) {
    expenseList.innerHTML = '<p class="empty-state">No expenses yet. Add your first receipt.</p>';
    expenseDetail.innerHTML = '<p class="empty-state">Select an expense to see receipt photos.</p>';
    return;
  }

  if (!expenses.some((expense) => expense.id === selectedExpenseId)) {
    selectedExpenseId = expenses[0].id;
  }

  expenses.forEach((expense) => {
    const card = document.createElement("button");
    card.className = `expense-card ${expense.id === selectedExpenseId ? "selected" : ""}`;
    card.type = "button";
    card.addEventListener("click", () => {
      selectedExpenseId = expense.id;
      renderExpenses();
    });
    card.innerHTML = `
      <div>
        <h4>${escapeHtml(expense.vendor)}</h4>
        <p>${escapeHtml(expense.category || "Uncategorized")} | ${escapeHtml(expense.expenseDate || "")}</p>
        <p>${expense.receiptPhotos?.length || 0} receipt photo${expense.receiptPhotos?.length === 1 ? "" : "s"}</p>
      </div>
      <span class="status-pill">${currency.format(expense.amount || 0)}</span>
    `;
    expenseList.append(card);
  });

  renderExpenseDetail();
}

function renderExpenseDetail() {
  const expense = expenses.find((item) => item.id === selectedExpenseId);
  if (!expense) return;
  expenseDetail.innerHTML = `
    <section class="detail-section">
      <h4>${escapeHtml(expense.vendor)}</h4>
      <p>${escapeHtml(expense.category || "Uncategorized")} | ${escapeHtml(expense.expenseDate || "")}</p>
      <div class="detail-row"><span>Amount</span><strong>${currency.format(expense.amount || 0)}</strong></div>
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
}

function getCustomerJobPhotos(relatedJobs, type) {
  return relatedJobs.flatMap((job) => (job.jobPhotos?.[type] || []).map((photo) => ({
    ...photo,
    name: `${job.serviceType} - ${photo.name || type}`
  })));
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

  return `
    <div class="detail-row">
      <span>Map measurement</span>
      <strong>${Math.round(job.measurement.squareFeet).toLocaleString("en-US")} SqFt</strong>
    </div>
  `;
}

function getNextAction(job) {
  const actions = {
    "Lead": { label: "Send Estimate", action: "send-square-estimate" },
    "Estimate Sent": { label: "Mark Estimate Signed", action: "mark-estimate-signed" },
    "Estimate Signed": { label: "Send Contract", action: "send-contract" },
    "Contract Sent": { label: "Mark Contract Signed", action: "mark-contract-signed" },
    "Contract Signed": { label: "Send Deposit Invoice", action: "send-deposit-invoice" },
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

async function runAction(jobId, action) {
  if (action === "delete-job") {
    await deleteJob(jobId);
    return;
  }

  if (action === "reminder") {
    const job = jobs.find((item) => item.id === jobId);
    alert(buildReminderMessage(job));
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

  const payload = {};

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

  try {
    const updated = await apiRequest(`/api/jobs/${jobId}/${action}`, payload);
    selectedJobId = updated.job.id;
    if (action === "send-square-estimate") {
      alert(`Estimate sent to ${updated.job.email}.`);
    }
    if (action === "send-contract") {
      alert(`Contract sent to ${updated.job.email}.`);
    }
    if (action === "complete") {
      alert(`Final invoice sent to ${updated.job.email}. Completion photos were saved.`);
    }
    await loadJobs();
    await loadCustomers();
  } catch (error) {
    alert(error.message);
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

async function apiRequest(url, payload, method = "POST") {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
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

function getDeposit(job) {
  return Math.round(job.estimate * (job.depositPercent / 100));
}

function getFinalBalance(job) {
  return Math.max(job.estimate - getDeposit(job), 0);
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

function renderContractLink(job) {
  const url = job.contractSignedAt ? getExecutedContractUrl(job) : (job.contractApprovalUrl || job.squareContractUrl);
  const label = job.contractSignedAt ? "Executed contract" : "Signing link";
  return renderLinkedValue(label, url);
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

function getPressureFlowInvoiceNumber(job, invoiceType) {
  const prefix = invoiceType === "deposit" ? "PPW-D" : "PPW-F";
  return `${prefix}-${compactHash(`${job.id}-${invoiceType}`).slice(0, 6).toUpperCase()}`;
}

function compactHash(value) {
  let hash = 0x811c9dc5;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
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

function renderCalendarValue(eventId, url) {
  if (!eventId) {
    return "Not set";
  }

  if (!url) {
    return escapeHtml(eventId);
  }

  return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(eventId)}</a>`;
}

function renderCompletionNotice(job) {
  if (!job.completionNoticeMailto) {
    return "Not sent";
  }

  return `<a href="${escapeHtml(job.completionNoticeMailto)}">Open email</a>`;
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init();
