const SECRET_VALUE = "[redacted]";

const SENSITIVE_KEY_PATTERN = /(secret|token|signature|password|authorization|refresh|access|clientSecret|apiKey|credential)/i;
const EMAIL_PATTERN = /^[^@\s]+@([^@\s]+\.[^@\s]+)$/;

function createOperationalLogger(consoleLike = console) {
  return {
    info(action, context = {}) {
      write(consoleLike.info || consoleLike.log, "info", action, context);
    },
    warn(action, context = {}) {
      write(consoleLike.warn || consoleLike.log, "warn", action, context);
    },
    error(action, context = {}) {
      write(consoleLike.error || consoleLike.log, "error", action, context);
    }
  };
}

function write(writer, level, action, context) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    ...redactLogContext(context),
    action
  };
  writer.call(console, `PressureFlow ${level}: ${JSON.stringify(entry)}`);
}

function redactLogContext(value, key = "") {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      code: value.code || "",
      statusCode: value.statusCode || ""
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactLogContext(item, key));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redactLogContext(childValue, childKey)
      ])
    );
  }

  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return value ? SECRET_VALUE : value;
  }

  if (typeof value === "string") {
    return redactString(value);
  }

  return value;
}

function redactString(value) {
  return String(value || "")
    .replace(/(token|signature|secret|password|access_token|refresh_token|client_secret)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
}

function maskEmail(value) {
  const email = String(value || "").trim();
  const match = email.match(EMAIL_PATTERN);
  if (!match) {
    return "";
  }
  const [localPart] = email.split("@");
  const prefix = localPart.slice(0, 2) || "*";
  return `${prefix}${localPart.length > 2 ? "***" : "*"}@${match[1]}`;
}

function recipientDomain(value) {
  const email = String(value || "").trim();
  return email.match(EMAIL_PATTERN)?.[1] || "";
}

module.exports = {
  createOperationalLogger,
  maskEmail,
  recipientDomain,
  redactLogContext
};
