const crypto = require("node:crypto");
const {
  formatAlertCustomer,
  formatAlertMoney,
  getDepositCents,
  getPressureFlowInvoiceNumber
} = require("./billing");
const { buildContractMailto } = require("./email-content");
const { getBaseUrlFromLink } = require("./rendering");

function buildEstimateApprovalUrl(baseUrl, job) {
  const root = String(baseUrl || process.env.APP_BASE_URL || "").replace(/\/$/, "");
  return `${root}/estimate/${encodeURIComponent(job.id)}?token=${encodeURIComponent(job.estimateApprovalToken)}`;
}

function buildContractApprovalUrl(baseUrl, job) {
  const root = String(baseUrl || process.env.APP_BASE_URL || "").replace(/\/$/, "");
  return `${root}/contract/${encodeURIComponent(job.id)}?token=${encodeURIComponent(job.contractApprovalToken)}`;
}

function buildCompletionProofUrl(baseUrl, job) {
  const root = String(baseUrl || process.env.APP_BASE_URL || "").replace(/\/$/, "");
  return `${root}/proof/${encodeURIComponent(job.id)}?token=${encodeURIComponent(job.completionProofToken)}`;
}

function buildInvoiceUrl(baseUrl, job, invoiceType, token) {
  const root = String(baseUrl || process.env.APP_BASE_URL || "").replace(/\/$/, "");
  return `${root}/invoice/${encodeURIComponent(job.id)}?type=${encodeURIComponent(invoiceType)}&token=${encodeURIComponent(token)}`;
}

function buildExecutedContractUrl(baseUrl, job) {
  const root = String(baseUrl || process.env.APP_BASE_URL || "").replace(/\/$/, "");
  return `${root}/contract/${encodeURIComponent(job.id)}/executed?token=${encodeURIComponent(job.contractApprovalToken)}`;
}

function normalizeEstimateRejectionReason(reason) {
  const allowed = new Set([
    "price-too-high",
    "timing-not-right",
    "went-with-another-company",
    "scope-changed",
    "just-researching",
    "other"
  ]);
  const value = String(reason || "").trim();
  return allowed.has(value) ? value : "";
}

function formatEstimateRejectionReason(reason) {
  return {
    "price-too-high": "Price was too high",
    "timing-not-right": "Timing was not right",
    "went-with-another-company": "Went with another company",
    "scope-changed": "Scope changed",
    "just-researching": "Just researching",
    "other": "Other"
  }[reason] || "";
}

function createPublicWorkflowHandlers({
  createPressureFlowInvoice,
  readJobs,
  readSettingsForJob,
  sendAdminTextAlertSafe,
  sendContractEmail,
  writeJobs
}) {
  const workflowLocks = new Map();

  async function findPublicEstimate(jobId, token) {
    const jobs = await readJobs();
    const job = jobs.find((item) => item.id === jobId);
    if (!job || !job.estimateApprovalToken || job.estimateApprovalToken !== token) {
      return null;
    }
    return job;
  }

  async function approvePublicEstimate(jobId, token) {
    return withWorkflowLock(`estimate:${jobId}`, async () => {
      const jobs = await readJobs();
      const job = jobs.find((item) => item.id === jobId);
      if (!job || !job.estimateApprovalToken || job.estimateApprovalToken !== token) {
        return null;
      }

      const settings = await readSettingsForJob(job);
      if (job.contractSentAt && job.contractApprovalToken && job.contractApprovalUrl) {
        return job;
      }

      job.status = "Contract Sent";
      job.estimateApprovedAt = new Date().toISOString();
      job.estimateRejectedAt = "";
      job.estimateRejectionReason = "";
      job.estimateRejectionNote = "";
      job.contractApprovalToken = job.contractApprovalToken || crypto.randomBytes(24).toString("hex");
      job.contractApprovalUrl = buildContractApprovalUrl(getBaseUrlFromLink(job.estimateApprovalUrl), job);
      job.contractMailto = buildContractMailto(job, settings);
      await sendContractEmail(job, settings);
      job.contractSentAt = new Date().toISOString();
      job.squareContractId = job.squareContractId || `pressureflow-contract-${Date.now()}`;
      job.squareContractUrl = job.contractApprovalUrl;
      job.updatedAt = new Date().toISOString();
      await writeJobs(jobs);
      await sendAdminTextAlertSafe(`PressureFlow: Estimate accepted by ${formatAlertCustomer(job)} for ${formatAlertMoney(job.estimate)}. Contract sent automatically.`);
      return job;
    });
  }

  async function rejectPublicEstimate(jobId, token, reason, note) {
    const jobs = await readJobs();
    const job = jobs.find((item) => item.id === jobId);
    if (!job || !job.estimateApprovalToken || job.estimateApprovalToken !== token) {
      return null;
    }

    job.status = "Lead";
    job.estimateRejectedAt = new Date().toISOString();
    job.estimateRejectionReason = normalizeEstimateRejectionReason(reason);
    job.estimateRejectionNote = String(note || "").trim().slice(0, 500);
    job.updatedAt = new Date().toISOString();
    await writeJobs(jobs);
    const reasonText = job.estimateRejectionReason ? formatEstimateRejectionReason(job.estimateRejectionReason) : "No reason given";
    await sendAdminTextAlertSafe(`PressureFlow: Estimate rejected by ${formatAlertCustomer(job)}. Reason: ${reasonText}.`);
    return job;
  }

  async function findPublicContract(jobId, token) {
    const jobs = await readJobs();
    const job = jobs.find((item) => item.id === jobId);
    if (!job || !job.contractApprovalToken || job.contractApprovalToken !== token) {
      return null;
    }
    return job;
  }

  async function findPublicCompletionProof(jobId, token) {
    const jobs = await readJobs();
    const job = jobs.find((item) => item.id === jobId);
    if (!job || !job.completionProofToken || job.completionProofToken !== token) {
      return null;
    }
    return job;
  }

  async function findPublicInvoice(jobId, invoiceType, token) {
    const jobs = await readJobs();
    const job = jobs.find((item) => item.id === jobId);
    const expectedToken = invoiceType === "deposit" ? job?.squareDepositInvoiceId : job?.squareFinalInvoiceId;
    if (!job || !expectedToken || expectedToken !== token) {
      return null;
    }
    return job;
  }

  async function signPublicContract(jobId, token, signerName, signedDate) {
    return withWorkflowLock(`contract:${jobId}`, async () => {
      const jobs = await readJobs();
      const job = jobs.find((item) => item.id === jobId);
      if (!job || !job.contractApprovalToken || job.contractApprovalToken !== token) {
        return null;
      }

      if (job.contractSignedAt && job.squareDepositInvoiceId && job.squareDepositInvoiceUrl) {
        return job;
      }

      const settings = await readSettingsForJob(job);
      job.status = "Contract Signed";
      job.contractSignerName = String(signerName || "").trim();
      job.contractSignedAt = new Date().toISOString();
      job.contractSignedDate = String(signedDate || "").trim();
      job.squareContractUrl = buildExecutedContractUrl(getBaseUrlFromLink(job.contractApprovalUrl), job);

      const invoice = await createPressureFlowInvoice(job, settings, "deposit", getBaseUrlFromLink(job.contractApprovalUrl));
      job.status = "Deposit Sent";
      job.squareDepositInvoiceId = invoice.invoiceId;
      job.squareDepositInvoiceUrl = invoice.publicUrl;
      job.updatedAt = new Date().toISOString();
      await writeJobs(jobs);
      await sendAdminTextAlertSafe(`PressureFlow: Contract signed by ${formatAlertCustomer(job)}. Deposit invoice ${getPressureFlowInvoiceNumber(job, "deposit")} sent for ${formatAlertMoney(getDepositCents(job) / 100)}.`);
      return job;
    });
  }

  async function withWorkflowLock(key, task) {
    const previous = workflowLocks.get(key) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current, () => current);
    workflowLocks.set(key, queued);

    await previous.catch(() => null);
    try {
      return await task();
    } finally {
      release();
      if (workflowLocks.get(key) === queued) {
        workflowLocks.delete(key);
      }
    }
  }

  return {
    approvePublicEstimate,
    findPublicCompletionProof,
    findPublicContract,
    findPublicEstimate,
    findPublicInvoice,
    rejectPublicEstimate,
    signPublicContract
  };
}

module.exports = {
  buildCompletionProofUrl,
  buildContractApprovalUrl,
  buildEstimateApprovalUrl,
  buildExecutedContractUrl,
  buildInvoiceUrl,
  createPublicWorkflowHandlers,
  formatEstimateRejectionReason,
  normalizeEstimateRejectionReason
};
