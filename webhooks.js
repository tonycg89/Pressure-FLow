const {
  formatAlertCustomer,
  formatAlertMoney,
  getDepositCents,
  getFinalBalanceCents,
  getPressureFlowInvoiceNumber
} = require("./billing");
const { extractSquareInvoice, parseSquareWebhookInvoiceId } = require("./integrations/square");
const { parseStripeWebhookMetadata } = require("./integrations/stripe");
const { createOperationalLogger } = require("./operational-logger");

function createWebhookHandlers({
  cancelPendingFollowUp = async () => {},
  readAllJobs,
  readJobs,
  readSettings,
  readSettingsForJob,
  readWebhookEvents,
  sendAdminTextAlertSafe,
  writeAllJobs,
  writeJobs,
  writeWebhookEvents,
  logger = createOperationalLogger()
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
      return logWebhookResult("square", { action: "ignored", reason: "no invoice id found" }, event);
    }

    const jobs = await readJobs();
    const job = await findJobBySquareInvoiceId(invoice.id, { jobs });

    if (!job) {
      return logWebhookResult("square", { action: "ignored", reason: "invoice not matched", invoiceId: invoice.id }, event);
    }

    const invoiceType = getInvoiceTypeForInvoice(job, invoice.id);
    if (!invoiceType) {
      return logWebhookResult("square", { action: "ignored", reason: "invoice mismatch", invoiceId: invoice.id }, event);
    }

    const amountValidation = validateInvoiceAmount(job, invoiceType, getSquareInvoicePaidCents(invoice));
    if (!amountValidation.ok) {
      return logWebhookResult("square", { action: "ignored", reason: amountValidation.reason, invoiceId: invoice.id, jobId: job.id, invoiceType }, event);
    }

    const paid = isSquareInvoicePaid(invoice);
    if (!paid) {
      setInvoiceStatus(job, invoice);
      await writeJobs(jobs);
      return logWebhookResult("square", { action: "status_recorded", invoiceId: invoice.id, jobId: job.id, invoiceType, status: invoice.status || "" }, event);
    }

    if (isInvoiceAlreadyPaid(job, invoiceType)) {
      return logWebhookResult("square", { action: "ignored", reason: "already paid", jobId: job.id, invoiceId: invoice.id, invoiceType }, event);
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
      await sendAdminTextAlertSafe(`PressureFlow: Square final invoice paid for ${formatAlertCustomer(job)}. ${getPressureFlowInvoiceNumber(job, "final")} ${formatAlertMoney(getFinalBalanceCents(job) / 100)}.`);
    }

    job.updatedAt = new Date().toISOString();
    await writeJobs(jobs);
    return logWebhookResult("square", { action: "job_updated", jobId: job.id, invoiceId: invoice.id, invoiceType, status: job.status }, event);
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
      return logWebhookResult("stripe", { action: "ignored", reason: "unsupported event type", type: event.type || "" }, event);
    }

    const session = event.data?.object || {};
    if (session.payment_status && session.payment_status !== "paid") {
      return logWebhookResult("stripe", { action: "ignored", reason: "checkout not paid", eventId: event.id || "" }, event);
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
      return logWebhookResult("stripe", { action: "ignored", reason: "job not found", jobId, accountId }, event);
    }
    if ((job.accountId || "owner") !== accountId) {
      return logWebhookResult("stripe", { action: "ignored", reason: "account mismatch", jobId, accountId });
    }
    if (!invoiceId || getStoredInvoiceId(job, invoiceType) !== invoiceId) {
      return logWebhookResult("stripe", { action: "ignored", reason: "invoice mismatch", jobId, accountId, invoiceType, invoiceId }, event);
    }

    const amountValidation = validateInvoiceAmount(job, invoiceType, getStripeSessionPaidCents(session));
    if (!amountValidation.ok) {
      return logWebhookResult("stripe", { action: "ignored", reason: amountValidation.reason, jobId, accountId, invoiceType, invoiceId }, event);
    }

    if (isInvoiceAlreadyPaid(job, invoiceType)) {
      return logWebhookResult("stripe", { action: "ignored", reason: "already paid", jobId, accountId, invoiceType, invoiceId }, event);
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
      await sendAdminTextAlertSafe(`PressureFlow: Card final invoice paid for ${formatAlertCustomer(job)}. ${getPressureFlowInvoiceNumber(job, "final")} ${formatAlertMoney(getFinalBalanceCents(job) / 100)}.`);
    }

    job.updatedAt = new Date().toISOString();
    if (accountId && process.env.DATABASE_URL) {
      await writeAllJobs(jobs, { accountId });
    } else {
      await writeJobs(jobs);
    }
    return logWebhookResult("stripe", { action: "job_updated", jobId: job.id, accountId, invoiceType, invoiceId, status: job.status }, event);
  }

  function logWebhookResult(provider, result, event = {}) {
    const context = {
      provider,
      action: result.action,
      reason: result.reason || "",
      eventId: result.eventId || event.id || event.event_id || "",
      jobId: result.jobId || "",
      accountId: result.accountId || "",
      invoiceId: result.invoiceId || "",
      invoiceType: result.invoiceType || "",
      type: result.type || event.type || "",
      status: result.status || ""
    };
    if (result.action === "ignored") {
      const isExpectedDuplicate = result.reason === "already paid";
      logger[isExpectedDuplicate ? "info" : "warn"]("webhook_event_ignored", context);
    } else {
      logger.info("webhook_event_processed", context);
    }
    return result;
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
