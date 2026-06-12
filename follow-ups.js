const crypto = require("node:crypto");
const { statuses } = require("./db");

const FOLLOW_UP_TYPE = "estimate_followup";

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
  warn = console.warn
}) {
  async function scheduleEstimateFollowUp(job, settings) {
    if (!job?.id || settings.estimateFollowUpEnabled === false || job.suppressEstimateFollowUp) {
      return null;
    }

    const accountId = itemWorkspaceId(job);
    const tasks = await readScopedTasks(accountId);
    const existing = tasks.find((task) => task.jobId === job.id && task.type === FOLLOW_UP_TYPE && task.status === "pending");
    const scheduledFor = new Date(new Date(job.estimateSentAt || new Date().toISOString()).getTime() + getDelayMs(settings)).toISOString();
    const now = new Date().toISOString();
    const task = existing || {
      id: crypto.randomUUID(),
      accountId,
      jobId: job.id,
      type: FOLLOW_UP_TYPE,
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
    return task;
  }

  async function cancelPendingFollowUp(jobId, reason, accountId = "") {
    const tasks = accountId ? await readScopedTasks(accountId) : await readFollowUpTasks();
    const now = new Date().toISOString();
    let changed = false;
    const updatedTasks = tasks.map((task) => {
      if (task.jobId !== jobId || task.type !== FOLLOW_UP_TYPE || task.status !== "pending") {
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
    }
    return changed;
  }

  async function sendManualEstimateFollowUp(job, settings) {
    if (!canSendFollowUp(job)) {
      throw new Error("Follow-up is not available for this job.");
    }
    if (job.suppressEstimateFollowUp) {
      throw new Error("Follow-up is suppressed for this job.");
    }

    const accountId = itemWorkspaceId(job);
    await cancelPendingFollowUp(job.id, "manual_sent", accountId);
    await sendEstimateFollowUpEmail(job, settings);
    const sentTask = createSentTask(job, accountId, "manual");
    const tasks = await readScopedTasks(accountId);
    await writeScopedTasks([...tasks, sentTask], accountId);
    return sentTask;
  }

  async function cancelManualFollowUp(job) {
    return cancelPendingFollowUp(job.id, "manual_cancelled", itemWorkspaceId(job));
  }

  async function setSuppressEstimateFollowUp(job, suppressed) {
    job.suppressEstimateFollowUp = Boolean(suppressed);
    if (job.suppressEstimateFollowUp) {
      await cancelPendingFollowUp(job.id, "suppressed", itemWorkspaceId(job));
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
      if (task.type !== FOLLOW_UP_TYPE || task.status !== "pending" || new Date(task.scheduledFor) > now) {
        continue;
      }

      const job = jobs.find((item) => item.id === task.jobId);
      const cancellationReason = getCancellationReason(job, updatedTasks);
      if (cancellationReason) {
        updatedTasks[index] = cancelTask(task, cancellationReason);
        tasksChanged = true;
        continue;
      }

      try {
        await sendEstimateFollowUpEmail(job, await readSettingsForJob(job));
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
        warn(`Unable to send estimate follow-up for job ${task.jobId}: ${error.message}`);
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
    scheduleEstimateFollowUp,
    sendManualEstimateFollowUp,
    setSuppressEstimateFollowUp
  };
}

function getDelayMs(settings) {
  const hours = [24, 48, 72, 168].includes(Number(settings.estimateFollowUpDelayHours))
    ? Number(settings.estimateFollowUpDelayHours)
    : 24;
  return hours * 60 * 60 * 1000;
}

function canSendFollowUp(job) {
  return job?.status === "Estimate Sent" && job.estimateApprovalUrl && !job.estimateApprovedAt && !job.estimateRejectedAt;
}

function getCancellationReason(job, tasks) {
  if (!job) return "job_missing";
  if (job.suppressEstimateFollowUp) return "suppressed";
  if (job.estimateRejectedAt) return "declined";
  if (job.estimateApprovedAt || statuses.indexOf(job.status) > statuses.indexOf("Estimate Sent")) return "approved";
  if (tasks.some((task) => task.jobId === job.id && task.type === FOLLOW_UP_TYPE && task.status === "sent" && task.source === "manual")) {
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

function createSentTask(job, accountId, source) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    accountId,
    jobId: job.id,
    type: FOLLOW_UP_TYPE,
    source,
    scheduledFor: now,
    status: "sent",
    cancelledReason: "",
    sentAt: now,
    createdAt: now,
    updatedAt: now
  };
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
  createFollowUpHandlers
};
