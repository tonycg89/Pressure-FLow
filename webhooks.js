const {
  formatAlertCustomer,
  formatAlertMoney,
  getDepositCents,
  getFinalBalanceCents,
  getPressureFlowInvoiceNumber
} = require("./billing");
const { getBaseUrlFromLink } = require("./rendering");
const { extractSquareInvoice, parseSquareWebhookInvoiceId } = require("./integrations/square");
const { parseStripeWebhookMetadata } = require("./integrations/stripe");

function createWebhookHandlers({
  cancelPendingFollowUp = async () => {},
  readAllJobs,
  readJobs,
  readSettings,
  readSettingsForJob,
  readWebhookEvents,
  sendAdminTextAlertSafe,
  sendCompletionCertificateEmailSafe,
  writeAllJobs,
  writeJobs,
  writeWebhookEvents
}) {
  async function recordWebhookEvent(event) {
    const events = await readWebhookEvents();
    events.push({
      ...event,
      receivedAt: new Date().toISOString()
    });
    await writeWebhookEvents(events);
  }

  async function getSquareWebhookSettings(rawBody) {
    const invoiceId = parseSquareWebhookInvoiceId(rawBody);
    if (invoiceId) {
      const job = await findJobBySquareInvoiceId(invoiceId);
      if (job) {
        return readSettingsForJob(job);
      }
    }

    return readSettings();
  }

  async function findJobBySquareInvoiceId(invoiceId, options = {}) {
    if (!invoiceId) {
      return null;
    }

    const jobs = options.jobs || await readAllJobs();
    return jobs.find((item) =>
      item.squareDepositInvoiceId === invoiceId ||
      item.squareFinalInvoiceId === invoiceId
    ) || null;
  }

  async function handleSquareWebhook(event) {
    const invoice = extractSquareInvoice(event);
    if (!invoice?.id) {
      return { action: "ignored", reason: "no invoice id found" };
    }

    const jobs = await readJobs();
    const job = await findJobBySquareInvoiceId(invoice.id, { jobs });

    if (!job) {
      return { action: "ignored", reason: "invoice not matched", invoiceId: invoice.id };
    }

    const invoiceType = getInvoiceTypeForInvoice(job, invoice.id);
    if (!invoiceType) {
      return { action: "ignored", reason: "invoice mismatch", invoiceId: invoice.id };
    }

    const amountValidation = validateInvoiceAmount(job, invoiceType, getSquareInvoicePaidCents(invoice));
    if (!amountValidation.ok) {
      return { action: "ignored", reason: amountValidation.reason, invoiceId: invoice.id };
    }

    const paid = isSquareInvoicePaid(invoice);
    if (!paid) {
      setInvoiceStatus(job, invoice);
      await writeJobs(jobs);
      return { action: "status_recorded", invoiceId: invoice.id, status: invoice.status || "" };
    }

    if (isInvoiceAlreadyPaid(job, invoiceType)) {
      return { action: "ignored", reason: "already paid", jobId: job.id, invoiceId: invoice.id, invoiceType };
    }

    if (invoiceType === "deposit") {
      job.status = "Deposit Paid";
      job.squareDepositInvoiceStatus = invoice.status || "PAID";
      job.squareDepositPaidAt = new Date().toISOString();
      await cancelPendingFollowUp(job.id, "paid", job.accountId || "owner", "deposit_followup");
      recordPayment(job, "deposit", "Square", getDepositCents(job) / 100);
      await sendAdminTextAlertSafe(`PressureFlow: Square deposit paid for ${formatAlertCustomer(job)}. ${getPressureFlowInvoiceNumber(job, "deposit")} ${formatAlertMoney(getDepositCents(job) / 100)}.`);
    }

    if (invoiceType === "final") {
      job.status = "Paid";
      job.squareFinalInvoiceStatus = invoice.status || "PAID";
      job.squareFinalPaidAt = new Date().toISOString();
      await cancelPendingFollowUp(job.id, "paid", job.accountId || "owner", "invoice_followup");
      recordPayment(job, "final", "Square", getFinalBalanceCents(job) / 100);
      await sendCompletionCertificateEmailSafe(job, await readSettingsForJob(job), getBaseUrlFromLink(job.squareFinalInvoiceUrl || job.completionProofUrl || ""));
      await sendAdminTextAlertSafe(`PressureFlow: Square final invoice paid for ${formatAlertCustomer(job)}. ${getPressureFlowInvoiceNumber(job, "final")} ${formatAlertMoney(getFinalBalanceCents(job) / 100)}.`);
    }

    job.updatedAt = new Date().toISOString();
    await writeJobs(jobs);
    return { action: "job_updated", jobId: job.id, invoiceId: invoice.id, invoiceType, status: job.status };
  }

  async function getStripeWebhookSecret(rawBody) {
    const metadata = parseStripeWebhookMetadata(rawBody);
    if (metadata.jobId) {
      const jobs = metadata.accountId
        ? await readAllJobs({ accountId: metadata.accountId })
        : await readAllJobs();
      const job = jobs.find((item) => item.id === metadata.jobId);
      if (job) {
        const settings = await readSettingsForJob(job);
        if (settings.stripeWebhookSecret) {
          return settings.stripeWebhookSecret;
        }
      }
    }

    return process.env.STRIPE_WEBHOOK_SECRET || "";
  }

  async function handleStripeWebhook(event) {
    if (event.type !== "checkout.session.completed") {
      return { action: "ignored", type: event.type || "" };
    }

    const session = event.data?.object || {};
    if (session.payment_status && session.payment_status !== "paid") {
      return { action: "ignored", reason: "checkout not paid" };
    }

    const jobId = session.metadata?.jobId || "";
    const accountId = String(session.metadata?.accountId || "");
    const invoiceType = session.metadata?.invoiceType === "deposit" ? "deposit" : "final";
    const invoiceId = String(session.metadata?.invoiceId || "");
    const jobs = accountId && process.env.DATABASE_URL
      ? await readAllJobs({ accountId })
      : await readJobs();
    const job = jobs.find((item) => item.id === jobId);
    if (!job) {
      return { action: "ignored", reason: "job not found", jobId };
    }
    if ((job.accountId || "owner") !== accountId) {
      return { action: "ignored", reason: "account mismatch", jobId };
    }
    if (!invoiceId || getStoredInvoiceId(job, invoiceType) !== invoiceId) {
      return { action: "ignored", reason: "invoice mismatch", jobId, invoiceType };
    }

    const amountValidation = validateInvoiceAmount(job, invoiceType, getStripeSessionPaidCents(session));
    if (!amountValidation.ok) {
      return { action: "ignored", reason: amountValidation.reason, jobId, invoiceType };
    }

    if (isInvoiceAlreadyPaid(job, invoiceType)) {
      return { action: "ignored", reason: "already paid", jobId, invoiceType };
    }

    if (invoiceType === "deposit") {
      job.status = "Deposit Paid";
      job.squareDepositInvoiceStatus = "PAID";
      job.squareDepositPaidAt = new Date().toISOString();
      await cancelPendingFollowUp(job.id, "paid", job.accountId || "owner", "deposit_followup");
      recordPayment(job, "deposit", "Stripe", getDepositCents(job) / 100);
      await sendAdminTextAlertSafe(`PressureFlow: Card deposit paid for ${formatAlertCustomer(job)}. ${getPressureFlowInvoiceNumber(job, "deposit")} ${formatAlertMoney(getDepositCents(job) / 100)}.`);
    } else {
      job.status = "Paid";
      job.squareFinalInvoiceStatus = "PAID";
      job.squareFinalPaidAt = new Date().toISOString();
      await cancelPendingFollowUp(job.id, "paid", job.accountId || "owner", "invoice_followup");
      recordPayment(job, "final", "Stripe", getFinalBalanceCents(job) / 100);
      await sendCompletionCertificateEmailSafe(job, await readSettingsForJob(job), getBaseUrlFromLink(job.squareFinalInvoiceUrl || job.completionProofUrl || ""));
      await sendAdminTextAlertSafe(`PressureFlow: Card final invoice paid for ${formatAlertCustomer(job)}. ${getPressureFlowInvoiceNumber(job, "final")} ${formatAlertMoney(getFinalBalanceCents(job) / 100)}.`);
    }

    job.updatedAt = new Date().toISOString();
    if (accountId && process.env.DATABASE_URL) {
      await writeAllJobs(jobs, { accountId });
    } else {
      await writeJobs(jobs);
    }
    return { action: "job_updated", jobId: job.id, invoiceType, status: job.status };
  }

  return {
    findJobBySquareInvoiceId,
    getSquareWebhookSettings,
    getStripeWebhookSecret,
    handleSquareWebhook,
    handleStripeWebhook,
    recordWebhookEvent
  };
}

function recordPayment(job, invoiceType, method, amount) {
  const records = Array.isArray(job.paymentRecords) ? job.paymentRecords : [];
  const existingIndex = records.findIndex((item) => item.invoiceType === invoiceType);
  const record = {
    id: `${invoiceType}-${Date.now()}`,
    invoiceType,
    source: "auto",
    method,
    reference: "",
    amount: Number(amount || 0),
    paidAt: new Date().toISOString(),
    quickBooksSyncStatus: "pending"
  };

  job.paymentRecords = existingIndex >= 0
    ? records.map((item, index) => index === existingIndex ? record : item)
    : [...records, record];
}

function setInvoiceStatus(job, invoice) {
  if (job.squareDepositInvoiceId === invoice.id) {
    job.squareDepositInvoiceStatus = invoice.status || "";
  }
  if (job.squareFinalInvoiceId === invoice.id) {
    job.squareFinalInvoiceStatus = invoice.status || "";
  }
  job.updatedAt = new Date().toISOString();
}

function getInvoiceTypeForInvoice(job, invoiceId) {
  if (job.squareDepositInvoiceId === invoiceId) {
    return "deposit";
  }
  if (job.squareFinalInvoiceId === invoiceId) {
    return "final";
  }
  return "";
}

function getStoredInvoiceId(job, invoiceType) {
  return invoiceType === "deposit" ? job.squareDepositInvoiceId : job.squareFinalInvoiceId;
}

function isInvoiceAlreadyPaid(job, invoiceType) {
  return invoiceType === "deposit"
    ? job.squareDepositInvoiceStatus === "PAID" || Boolean(job.squareDepositPaidAt)
    : job.squareFinalInvoiceStatus === "PAID" || Boolean(job.squareFinalPaidAt);
}

function validateInvoiceAmount(job, invoiceType, paidCents) {
  if (paidCents === null) {
    return { ok: true };
  }
  const expectedCents = invoiceType === "deposit" ? getDepositCents(job) : getFinalBalanceCents(job);
  return paidCents === expectedCents
    ? { ok: true }
    : { ok: false, reason: "amount mismatch" };
}

function getStripeSessionPaidCents(session) {
  if (session.amount_total === undefined || session.amount_total === null || session.amount_total === "") {
    return null;
  }
  const amount = Number(session.amount_total);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : null;
}

function getSquareInvoicePaidCents(invoice) {
  const requests = invoice.payment_requests || [];
  if (!requests.length) {
    return null;
  }
  const completed = requests.reduce((sum, request) => {
    const amount = Number(request.total_completed_amount_money?.amount || 0);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  return completed > 0 ? completed : null;
}

function isSquareInvoicePaid(invoice) {
  if (invoice.status === "PAID") {
    return true;
  }

  const requests = invoice.payment_requests || [];
  return requests.length > 0 && requests.every((request) => {
    const total = request.computed_amount_money?.amount || 0;
    const completed = request.total_completed_amount_money?.amount || 0;
    return total > 0 && completed >= total;
  });
}

module.exports = {
  createWebhookHandlers,
  getSquareInvoicePaidCents,
  getStripeSessionPaidCents,
  isSquareInvoicePaid,
  setInvoiceStatus
};
