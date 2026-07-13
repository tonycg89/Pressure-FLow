const crypto = require("node:crypto");
const { statuses } = require("./db");
const { createOperationalLogger } = require("./operational-logger");

const FOLLOW_UP_TYPE = "estimate_followup";
const FOLLOW_UP_TYPES = {
  estimate: "estimate_followup",
  contract: "contract_followup",
  deposit: "deposit_followup",
  invoice: "invoice_followup",
  review: "review_request"
};

const FOLLOW_UP_CONFIG = {
  estimate_followup: {
    sentAtField: "estimateSentAt",
    statusLabel: "estimate",
    canSend: (job) => job?.status === "Estimate Sent" && job.estimateApprovalUrl && !job.estimateApprovedAt && !job.estimateRejectedAt,
    cancelReason: (job) => {
      if (job.estimateRejectedAt) return "declined";
      if (job.estimateApprovedAt || statuses.indexOf(job.status) > statuses.indexOf("Estimate Sent")) return "approved";
      return "";
    }
  },
  contract_followup: {
    sentAtField: "contractSentAt",
    statusLabel: "contract",
    canSend: (job) => job?.status === "Contract Sent" && job.contractApprovalUrl && !job.contractSignedAt,
    cancelReason: (job) => job.contractSignedAt || statuses.indexOf(job.status) > statuses.indexOf("Contract Sent") ? "signed" : ""
  },
  deposit_followup: {
    sentAtField: "",
    statusLabel: "deposit invoice",
    canSend: (job) => job?.status === "Deposit Sent" && job.squareDepositInvoiceUrl && !job.squareDepositPaidAt,
    cancelReason: (job) => job.squareDepositPaidAt || statuses.indexOf(job.status) > statuses.indexOf("Deposit Sent") ? "paid" : ""
  },
  invoice_followup: {
    sentAtField: "completionNoticeSentAt",
    statusLabel: "final invoice",
    canSend: (job) => job?.status === "Final Invoice Sent" && job.squareFinalInvoiceUrl && !job.squareFinalPaidAt,
    cancelReason: (job) => job.squareFinalPaidAt || statuses.indexOf(job.status) > statuses.indexOf("Final Invoice Sent") ? "paid" : ""
  },
  review_request: {
    sentAtField: "squareFinalPaidAt",
    sentMarkerField: "reviewRequestSentAt",
    statusLabel: "review request",
    canSend: (job, settings = {}) => isFinalInvoicePaid(job) && !job.reviewRequestSentAt && hasReviewRequestLink(settings),
    cancelReason: (job) => {
      if (!job) return "job_missing";
      if (job.reviewRequestSentAt) return "sent";
      return "";
    }
  }
};

function createFollowUpHandlers({
  itemWorkspaceId,
  readAllJobs,
  readFollowUpTasks,
  readJobs,
  readSettingsForJob,
  sendEstimateFollowUpEmail,
  writeAllJobs,
  writeFollowUpTasks,
  writeJobs,
  logger = createOperationalLogger(),
  warn = console.warn
}) {
  async function scheduleEstimateFollowUp(job, settings) {
    return scheduleFollowUp(job, settings, FOLLOW_UP_TYPES.estimate);
  }

  async function scheduleFollowUp(job, settings, type = getActiveFollowUpType(job)) {
    if (!job?.id || !isFollowUpEnabled(settings, type) || job.suppressEstimateFollowUp) {
      logger.info("follow_up_schedule_skipped", {
        accountId: job?.accountId || "owner",
        jobId: job?.id || "",
        type,
        reason: !job?.id ? "missing_job" : !isFollowUpEnabled(settings, type) ? "disabled" : "suppressed"
      });
      return null;
    }
    const config = FOLLOW_UP_CONFIG[type];
    if (!config?.canSend(job, settings)) {
      logger.info("follow_up_schedule_skipped", {
        accountId: itemWorkspaceId(job),
        jobId: job.id,
        type,
        reason: "not_sendable"
      });
      return null;
    }

    const accountId = itemWorkspaceId(job);
    const tasks = await readScopedTasks(accountId);
    const existing = tasks.find((task) => task.jobId === job.id && task.type === type && task.status === "pending");
    if (existing) {
      logger.info("follow_up_duplicate_pending_reused", {
        accountId,
        jobId: job.id,
        taskId: existing.id,
        type
      });
    }
    const now = new Date().toISOString();
    const scheduledFor = new Date(new Date(config.sentAtField ? job[config.sentAtField] || now : now).getTime() + getDelayMs(settings, type)).toISOString();
    const task = existing || {
      id: crypto.randomUUID(),
      accountId,
      jobId: job.id,
      type,
      source: "auto",
      status: "pending",
      createdAt: now
    };

    Object.assign(task, {
      scheduledFor,
      cancelledReason: "",
      sentAt: "",
      updatedAt: now
    });

    await writeScopedTasks(upsertTask(tasks, task), accountId);
    logger.info("follow_up_scheduled", {
      accountId,
      jobId: job.id,
      taskId: task.id,
      type,
      scheduledFor
    });
    return task;
  }

  async function cancelPendingFollowUp(jobId, reason, accountId = "", type = FOLLOW_UP_TYPE) {
    const tasks = accountId ? await readScopedTasks(accountId) : await readFollowUpTasks();
    const now = new Date().toISOString();
    let changed = false;
    const updatedTasks = tasks.map((task) => {
      if (task.jobId !== jobId || (type && task.type !== type) || task.status !== "pending") {
        return task;
      }
      changed = true;
      return {
        ...task,
        status: "cancelled",
        cancelledReason: reason,
        updatedAt: now
      };
    });

    if (changed) {
      await writeScopedTasks(updatedTasks, accountId);
      logger.info("follow_up_cancelled", {
        accountId: accountId || "",
        jobId,
        type,
        reason
      });
    }
    return changed;
  }

  async function sendManualEstimateFollowUp(job, settings, requestedType = "") {
    const type = requestedType || getActiveFollowUpType(job, settings);
    if (!canSendFollowUp(job, type, settings)) {
      throw new Error("Follow-up is not available for this job.");
    }
    if (job.suppressEstimateFollowUp) {
      throw new Error("Follow-up is suppressed for this job.");
    }

    const accountId = itemWorkspaceId(job);
    await sendEstimateFollowUpEmail(job, settings, type);
    await cancelPendingFollowUp(job.id, "manual_sent", accountId, type);
    const sentTask = createSentTask(job, accountId, "manual", type);
    const tasks = await readScopedTasks(accountId);
    await writeScopedTasks([...tasks, sentTask], accountId);
    return sentTask;
  }

  async function cancelManualFollowUp(job) {
    return cancelPendingFollowUp(job.id, "manual_cancelled", itemWorkspaceId(job), getActiveFollowUpType(job));
  }

  async function setSuppressEstimateFollowUp(job, suppressed) {
    job.suppressEstimateFollowUp = Boolean(suppressed);
    if (job.suppressEstimateFollowUp) {
      await cancelPendingFollowUp(job.id, "suppressed", itemWorkspaceId(job), "");
    }
  }

  async function processDueFollowUps() {
    const [jobs, tasks] = await Promise.all([
      readAllJobs(),
      readFollowUpTasks()
    ]);
    const now = new Date();
    let tasksChanged = false;
    let jobsChanged = false;
    const updatedTasks = [...tasks];

    for (let index = 0; index < updatedTasks.length; index += 1) {
      const task = updatedTasks[index];
      if (!FOLLOW_UP_CONFIG[task.type] || task.status !== "pending" || new Date(task.scheduledFor) > now) {
        continue;
      }

      const job = jobs.find((item) => item.id === task.jobId);
      const settings = job ? await readSettingsForJob(job) : {};
      const cancellationReason = getCancellationReason(job, updatedTasks, task.type, settings);
      if (cancellationReason) {
        updatedTasks[index] = cancelTask(task, cancellationReason);
        tasksChanged = true;
        logger.info("follow_up_task_skipped", {
          accountId: task.accountId || "",
          jobId: task.jobId,
          taskId: task.id,
          type: task.type,
          reason: cancellationReason
        });
        continue;
      }

      try {
        await sendEstimateFollowUpEmail(job, settings, task.type);
        const markerField = FOLLOW_UP_CONFIG[task.type]?.sentMarkerField;
        if (markerField) {
          job[markerField] = new Date().toISOString();
        }
        updatedTasks[index] = {
          ...task,
          source: "auto",
          status: "sent",
          sentAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        job.updatedAt = new Date().toISOString();
        tasksChanged = true;
        jobsChanged = true;
      } catch (error) {
        logger.error("follow_up_send_failed", {
          accountId: task.accountId || "",
          jobId: task.jobId,
          taskId: task.id,
          type: task.type,
          error
        });
        warn(`Unable to send ${task.type} for job ${task.jobId}: ${error.message}`);
      }
    }

    if (tasksChanged) {
      await writeFollowUpTasks(updatedTasks);
    }
    if (jobsChanged) {
      await writeAllJobs(jobs);
    }
  }

  function readScopedTasks(accountId) {
    return readFollowUpTasks(accountId ? { accountId } : {});
  }

  async function writeScopedTasks(tasks, accountId) {
    await writeFollowUpTasks(tasks, accountId ? { accountId } : {});
  }

  return {
    cancelManualFollowUp,
    cancelPendingFollowUp,
    processDueFollowUps,
    scheduleFollowUp,
    scheduleEstimateFollowUp,
    sendManualEstimateFollowUp,
    setSuppressEstimateFollowUp
  };
}

function getDelayMs(settings, type = FOLLOW_UP_TYPE) {
  const configured = type === FOLLOW_UP_TYPES.review
    ? settings.reviewRequestDelayHours
    : settings.estimateFollowUpDelayHours;
  const hours = [24, 48, 72, 168].includes(Number(configured))
    ? Number(configured)
    : 24;
  return hours * 60 * 60 * 1000;
}

function canSendFollowUp(job, type = getActiveFollowUpType(job), settings = {}) {
  return Boolean(FOLLOW_UP_CONFIG[type]?.canSend(job, settings));
}

function isFollowUpEnabled(settings = {}, type = FOLLOW_UP_TYPE) {
  if (type === FOLLOW_UP_TYPES.review) {
    return settings.reviewRequestEnabled !== false;
  }
  return settings.estimateFollowUpEnabled !== false;
}

function hasReviewRequestLink(settings = {}) {
  return Boolean(settings.googleReviewUrl || settings.yelpReviewUrl || settings.facebookReviewUrl || settings.otherReviewUrl);
}

function isFinalInvoicePaid(job = {}) {
  return Boolean(
    job.status === "Paid" ||
    job.squareFinalPaidAt ||
    job.squareFinalInvoiceStatus === "PAID" ||
    (Array.isArray(job.paymentRecords) && job.paymentRecords.some((payment) => payment.invoiceType === "final"))
  );
}

function getCancellationReason(job, tasks, type = FOLLOW_UP_TYPE, settings = {}) {
  if (!job) return "job_missing";
  if (job.suppressEstimateFollowUp) return "suppressed";
  if (type === FOLLOW_UP_TYPES.review && !hasReviewRequestLink(settings)) return "review_links_missing";
  const stageReason = FOLLOW_UP_CONFIG[type]?.cancelReason(job);
  if (stageReason) return stageReason;
  if (tasks.some((task) => task.jobId === job.id && task.type === type && task.status === "sent" && task.source === "manual")) {
    return "manual_sent";
  }
  return "";
}

function cancelTask(task, reason) {
  return {
    ...task,
    status: "cancelled",
    cancelledReason: reason,
    updatedAt: new Date().toISOString()
  };
}

function createSentTask(job, accountId, source, type = FOLLOW_UP_TYPE) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    accountId,
    jobId: job.id,
    type,
    source,
    scheduledFor: now,
    status: "sent",
    cancelledReason: "",
    sentAt: now,
    createdAt: now,
    updatedAt: now
  };
}

function getActiveFollowUpType(job, settings = {}) {
  if (FOLLOW_UP_CONFIG.estimate_followup.canSend(job)) return FOLLOW_UP_TYPES.estimate;
  if (FOLLOW_UP_CONFIG.contract_followup.canSend(job)) return FOLLOW_UP_TYPES.contract;
  if (FOLLOW_UP_CONFIG.deposit_followup.canSend(job)) return FOLLOW_UP_TYPES.deposit;
  if (FOLLOW_UP_CONFIG.invoice_followup.canSend(job)) return FOLLOW_UP_TYPES.invoice;
  if (FOLLOW_UP_CONFIG.review_request.canSend(job, settings)) return FOLLOW_UP_TYPES.review;
  return FOLLOW_UP_TYPE;
}

function getFollowUpTypeLabel(type) {
  return FOLLOW_UP_CONFIG[type]?.statusLabel || "estimate";
}

function upsertTask(tasks, task) {
  const index = tasks.findIndex((item) => item.id === task.id);
  if (index === -1) {
    return [...tasks, task];
  }
  return tasks.map((item, itemIndex) => itemIndex === index ? task : item);
}

module.exports = {
  FOLLOW_UP_TYPE,
  FOLLOW_UP_TYPES,
  createFollowUpHandlers
};
