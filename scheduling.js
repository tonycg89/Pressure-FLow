const crypto = require("node:crypto");

function buildScheduleInviteAttachment(job, settings) {
  return {
    fileName: `pressureflow-${slugifyAttachmentName(job.customerName || job.serviceType || "service")}.ics`,
    contentType: "text/calendar; charset=UTF-8; method=PUBLISH",
    content: buildScheduleInviteIcs(job, settings)
  };
}

function buildScheduleInviteIcs(job, settings) {
  const businessName = getBusinessName(settings);
  const startValue = job.scheduledAt?.slice(0, 16) || "";
  const endValue = startValue ? addMinutesToLocalDateTime(startValue, Number(job.jobDurationMinutes || 180)) : "";
  const nowStamp = formatIcsUtcDate(new Date());
  const startStamp = formatIcsPacificDateTime(startValue);
  const endStamp = formatIcsPacificDateTime(endValue);
  const description = [
    `${businessName} service appointment.`,
    `Service: ${job.serviceType}`,
    `Address: ${job.address}`,
    "",
    "Day-of-service instructions:",
    ...getDayOfServiceInstructions(settings).map((item) => `- ${item}`)
  ].join("\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PressureFlow//Schedule Confirmation//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(job.id || crypto.randomUUID())}@pressureflow`,
    `DTSTAMP:${nowStamp}`,
    `DTSTART:${startStamp}`,
    `DTEND:${endStamp}`,
    `SUMMARY:${escapeIcsText(`${businessName} - ${job.serviceType}`)}`,
    `LOCATION:${escapeIcsText(job.address)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `ORGANIZER;CN=${escapeIcsText(businessName)}:MAILTO:${sanitizeIcsEmail(settings.businessEmail || settings.googleCalendarId || "")}`,
    job.email ? `ATTENDEE;CN=${escapeIcsText(job.customerName || "Customer")};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:MAILTO:${sanitizeIcsEmail(job.email)}` : "",
    "END:VEVENT",
    "END:VCALENDAR"
  ].filter(Boolean).join("\r\n");
}

function formatScheduledWindow(job) {
  if (!job.scheduledAt) {
    return "To be scheduled";
  }

  const start = parseLocalDateTimeParts(job.scheduledAt);
  if (!start) {
    return job.scheduledAt;
  }

  const endValue = addMinutesToLocalDateTime(job.scheduledAt.slice(0, 16), Number(job.jobDurationMinutes || 180));
  const end = parseLocalDateTimeParts(endValue);
  const zone = isPacificDaylightTime(job.scheduledAt.slice(0, 16)) ? "PDT" : "PST";
  return `${formatLocalScheduleDate(start)}, ${formatLocalTime(start)} - ${formatLocalTime(end)} ${zone}`;
}

function getDayOfServiceInstructions(settings = {}) {
  const customInstructions = String(settings.dayOfServiceInstructions || "")
    .split(/\r?\n/)
    .map((item) => item.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 12);
  if (customInstructions.length) {
    return customInstructions;
  }

  const shared = [
    "Make sure someone is available by phone during the scheduled service window.",
    "Unlock gates, doors, or access points needed for the scheduled work.",
    "Move vehicles, personal items, and fragile belongings away from the work area.",
    "Point out any known sensitive areas, existing damage, or special instructions before work begins."
  ];
  const industryInstructions = {
    "Pressure Washing": [
      "Close all windows and doors before service begins.",
      "Keep pets and children away from areas that may receive water runoff or overspray.",
      "Confirm exterior water access is available if water is required for the service."
    ],
    Landscaping: [
      "Clear toys, hoses, pet waste, and loose items from lawn or landscape areas.",
      "Mark sprinkler heads, shallow lines, or delicate plants that need extra care.",
      "Secure pets indoors or away from gates and work areas."
    ],
    Handyman: [
      "Clear furniture or belongings from the work area before arrival.",
      "Have replacement parts, fixtures, paint, or approved materials ready if the job depends on them.",
      "Confirm access to electrical panels, shutoffs, or rooms needed for the repair."
    ],
    Construction: [
      "Clear the work area and nearby pathways before the crew arrives.",
      "Keep children, pets, and bystanders away from active work areas.",
      "Confirm parking, material drop-off, and access instructions before arrival."
    ],
    Misc: [
      "Clear a safe path to the service area before arrival.",
      "Separate or label any items that should not be moved, cleaned, hauled, or serviced.",
      "Confirm parking, entry, or loading instructions before the scheduled window."
    ]
  };

  return [...shared, ...(industryInstructions[settings.serviceIndustry] || industryInstructions.Misc)];
}

function addMinutesToLocalDateTime(value, minutes) {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const date = new Date(year, month - 1, day, hour, minute + Number(minutes || 0), 0, 0);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  const nextHour = String(date.getHours()).padStart(2, "0");
  const nextMinute = String(date.getMinutes()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}T${nextHour}:${nextMinute}`;
}

function withPacificOffset(localDateTime) {
  const offset = isPacificDaylightTime(localDateTime) ? "-07:00" : "-08:00";
  return `${localDateTime}:00${offset}`;
}

function isPacificDaylightTime(localDateTime) {
  const [datePart] = localDateTime.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const dstStartDay = nthSundayOfMonth(year, 3, 2);
  const dstEndDay = nthSundayOfMonth(year, 11, 1);
  const dateKey = month * 100 + day;
  const startKey = 3 * 100 + dstStartDay;
  const endKey = 11 * 100 + dstEndDay;
  return dateKey >= startKey && dateKey < endKey;
}

function nthSundayOfMonth(year, month, nth) {
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const firstSunday = 1 + ((7 - firstDay.getUTCDay()) % 7);
  return firstSunday + (nth - 1) * 7;
}

function formatIcsPacificDateTime(value) {
  if (!value) {
    return formatIcsUtcDate(new Date());
  }

  return formatIcsUtcDate(new Date(withPacificOffset(value)));
}

function formatIcsUtcDate(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function sanitizeIcsEmail(value) {
  return String(value || "no-reply@pressureflow.local").replace(/[\r\n<>]/g, "").trim() || "no-reply@pressureflow.local";
}

function slugifyAttachmentName(value) {
  return String(value || "service")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "service";
}

function parseLocalDateTimeParts(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  return { year, month, day, hour, minute };
}

function formatLocalScheduleDate(parts) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function formatLocalTime(parts) {
  if (!parts) return "";
  const suffix = parts.hour >= 12 ? "PM" : "AM";
  const hour = parts.hour % 12 || 12;
  return `${hour}:${String(parts.minute).padStart(2, "0")} ${suffix}`;
}

function getBusinessName(settings = {}) {
  return settings.businessName || "Your Company";
}

module.exports = {
  addMinutesToLocalDateTime,
  buildScheduleInviteAttachment,
  formatScheduledWindow,
  getDayOfServiceInstructions,
  withPacificOffset
};
