let statuses = [];
let jobs = [];
let selectedJobId = null;
let settings = {};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});

const jobList = document.querySelector("#jobList");
const jobDetail = document.querySelector("#jobDetail");
const statusFilter = document.querySelector("#statusFilter");
const newJobButton = document.querySelector("#newJobButton");
const editJobButton = document.querySelector("#editJobButton");
const settingsButton = document.querySelector("#settingsButton");
const jobDialog = document.querySelector("#jobDialog");
const jobForm = document.querySelector("#jobForm");
const settingsDialog = document.querySelector("#settingsDialog");
const settingsForm = document.querySelector("#settingsForm");
const settingsStatus = document.querySelector("#settingsStatus");
const jobDialogTitle = jobDialog.querySelector(".dialog-header h2");

async function init() {
  statusFilter.addEventListener("change", render);
  newJobButton.addEventListener("click", openNewJob);
  editJobButton.addEventListener("click", openEditJob);
  settingsButton.addEventListener("click", openSettings);
  jobForm.addEventListener("submit", createJob);
  settingsForm.addEventListener("submit", saveSettings);
  await loadSettings();
  await loadJobs();
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
  } catch (error) {
    settingsStatus.textContent = error.message;
  }
}

function applySettingsDefaults() {
  const depositInput = jobForm.elements.depositPercent;
  if (depositInput && settings.defaultDepositPercent) {
    depositInput.value = settings.defaultDepositPercent;
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
  settingsForm.elements.squareEnvironment.value = settings.squareEnvironment || "sandbox";
  settingsForm.elements.squareLocationId.value = settings.squareLocationId || "";
  settingsForm.elements.squareAccessToken.value = "";
  settingsForm.elements.squareWebhookSignatureKey.value = "";
  settingsForm.elements.googleCalendarId.value = settings.googleCalendarId || "";
  settingsForm.elements.googleClientId.value = settings.googleClientId || "";
  settingsForm.elements.googleClientSecret.value = "";
  settingsForm.elements.googleRedirectUri.value = settings.googleRedirectUri || "http://localhost:3000/auth/google/callback";

  const tokenText = settings.hasSquareAccessToken ? "Square token saved. Leave blank to keep it." : "Square token not saved yet.";
  const webhookText = settings.hasSquareWebhookSignatureKey ? " Webhook key saved." : "";
  const googleText = settings.hasGoogleRefreshToken ? " Google Calendar connected." : settings.hasGoogleClientSecret ? " Google secret saved. Connect Calendar next." : "";
  settingsStatus.textContent = `${tokenText}${webhookText}${googleText}`;
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

async function createJob(event) {
  if (event.submitter?.value === "cancel") {
    resetJobDialog();
    return;
  }

  event.preventDefault();
  const formData = new FormData(jobForm);
  const job = Object.fromEntries(formData.entries());
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
  } catch (error) {
    alert(error.message);
  }
}

function openNewJob() {
  resetJobDialog();
  jobDialog.showModal();
}

function openEditJob() {
  const job = jobs.find((item) => item.id === selectedJobId);
  if (!job) return;

  jobForm.dataset.editingId = job.id;
  jobDialogTitle.textContent = "Edit pressure washing job";
  jobForm.elements.customerName.value = job.customerName || "";
  jobForm.elements.email.value = job.email || "";
  jobForm.elements.phone.value = job.phone || "";
  jobForm.elements.address.value = job.address || "";
  jobForm.elements.squareEstimateId.value = job.squareEstimateId || "";
  jobForm.elements.squareEstimateUrl.value = job.squareEstimateUrl || "";
  jobForm.elements.squareContractId.value = job.squareContractId || "";
  jobForm.elements.squareContractUrl.value = job.squareContractUrl || "";
  jobForm.elements.serviceType.value = job.serviceType || "Driveway cleaning";
  jobForm.elements.estimate.value = job.estimate || 0;
  jobForm.elements.depositPercent.value = job.depositPercent || settings.defaultDepositPercent || 25;
  jobForm.elements.notes.value = job.notes || "";
  jobForm.elements.accessNotes.value = job.accessNotes || "";
  jobForm.elements.sensitiveAreas.value = job.sensitiveAreas || "";
  jobDialog.showModal();
}

function resetJobDialog() {
  jobForm.dataset.editingId = "";
  jobDialogTitle.textContent = "New pressure washing job";
}

function render() {
  renderMetrics();
  renderJobList();
  renderJobDetail();
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
  const visibleJobs = selectedStatus === "all"
    ? jobs
    : jobs.filter((job) => job.status === selectedStatus);

  jobList.innerHTML = "";

  if (visibleJobs.length === 0) {
    jobList.innerHTML = '<p class="empty-state">No jobs match this filter.</p>';
    return;
  }

  visibleJobs.forEach((job) => {
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
        <p>${currency.format(job.estimate)} estimate, ${job.depositPercent}% deposit</p>
      </div>
      <span class="status-pill ${getStatusClass(job.status)}">${job.status}</span>
    `;

    jobList.append(card);
  });
}

function renderJobDetail() {
  const job = jobs.find((item) => item.id === selectedJobId) ?? jobs[0];

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
      <div class="detail-row"><span>Estimate</span><strong>${currency.format(job.estimate)}</strong></div>
      <div class="detail-row"><span>Deposit</span><strong>${currency.format(getDeposit(job))}</strong></div>
      <div class="detail-row"><span>Final balance</span><strong>${currency.format(getFinalBalance(job))}</strong></div>
      <div class="detail-row"><span>Scheduled</span><strong>${escapeHtml(job.scheduledAt || "Not scheduled")}</strong></div>
      <div class="detail-row"><span>Calendar event</span><strong>${renderCalendarValue(job.googleCalendarEventId, job.googleCalendarEventUrl)}</strong></div>
      <div class="detail-row"><span>Completion notice</span><strong>${renderCompletionNotice(job)}</strong></div>
    </section>

    <section class="detail-section">
      <h4>Provider IDs</h4>
      <div class="detail-row"><span>Square estimate</span><strong>${renderLinkedValue(job.squareEstimateId, job.squareEstimateUrl)}</strong></div>
      <div class="detail-row"><span>Deposit invoice</span><strong>${renderInvoiceValue(job.squareDepositInvoiceId, job.squareDepositInvoiceUrl)}</strong></div>
      <div class="detail-row"><span>Final invoice</span><strong>${renderInvoiceValue(job.squareFinalInvoiceId, job.squareFinalInvoiceUrl)}</strong></div>
      <div class="detail-row"><span>Square contract</span><strong>${renderLinkedValue(job.squareContractId || job.docusignEnvelopeId, job.squareContractUrl)}</strong></div>
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
    "Lead": { label: "Send Square Estimate", action: "send-square-estimate" },
    "Estimate Sent": { label: "Mark Estimate Signed", action: "mark-estimate-signed" },
    "Estimate Signed": { label: "Send Contract", action: "send-contract" },
    "Contract Sent": { label: "Mark Contract Signed", action: "mark-contract-signed" },
    "Contract Signed": { label: "Send Deposit Invoice", action: "send-deposit-invoice" },
    "Deposit Sent": { label: "Check Deposit Payment", action: "check-deposit-payment" },
    "Deposit Paid": { label: "Schedule Job", action: "schedule" },
    "Scheduled": { label: "Complete Job + Send Final Invoice", action: "complete" },
    "Completed": { label: "Send Final Invoice", action: "send-final-invoice" },
    "Final Invoice Sent": { label: "Check Final Payment", action: "check-final-payment" }
  };

  return actions[job.status] ?? null;
}

function getFallbackAction(job) {
  const actions = {
    "Deposit Sent": { label: "Manual: Mark Deposit Paid", action: "mark-deposit-paid" },
    "Final Invoice Sent": { label: "Manual: Mark Paid", action: "mark-paid" }
  };

  return actions[job.status] ?? null;
}

async function runAction(jobId, action) {
  if (action === "reminder") {
    const job = jobs.find((item) => item.id === jobId);
    alert(buildReminderMessage(job));
    return;
  }

  const payload = {};

  if (action === "schedule") {
    const scheduledAt = prompt("Enter schedule date/time, for example 2026-06-05T09:00", getDefaultScheduleValue());
    if (!scheduledAt) return;

    const duration = prompt("Job duration in minutes", String(settings.defaultJobDurationMinutes || 180));
    payload.scheduledAt = scheduledAt;
    payload.jobDurationMinutes = Number(duration || settings.defaultJobDurationMinutes || 180);
  }

  if (action === "send-square-estimate") {
    payload.squareEstimateId = prompt("Paste the Square estimate ID or short reference", "") || "";
    payload.squareEstimateUrl = prompt("Paste the Square estimate link, if you have it", "") || "";
  }

  if (action === "send-contract") {
    payload.squareContractId = prompt("Paste the Square contract ID or short reference", "") || "";
    payload.squareContractUrl = prompt("Paste the Square contract link, if you have it", "") || "";
  }

  try {
    const updated = await apiRequest(`/api/jobs/${jobId}/${action}`, payload);
    selectedJobId = updated.job.id;
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

function getStatusClass(status) {
  if (status === "Paid") return "done";
  if (status === "Deposit Sent" || status === "Final Invoice Sent") return "blocked";
  return "";
}

function renderInvoiceValue(invoiceId, url) {
  if (!invoiceId) {
    return "Not set";
  }

  if (!url) {
    return escapeHtml(invoiceId);
  }

  return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(invoiceId)}</a>`;
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init();
