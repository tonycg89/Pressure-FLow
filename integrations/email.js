const crypto = require("node:crypto");

function buildMimeEmailBase64Url(message) {
  return Buffer.from(buildMimeEmailString(message)).toString("base64url");
}

function buildMimeEmailString({ from, to, subject, textBody, htmlBody, attachments = [] }) {
  const alternativeBoundary = `pressureflow-alt-${crypto.randomBytes(12).toString("hex")}`;
  const mixedBoundary = `pressureflow-mixed-${crypto.randomBytes(12).toString("hex")}`;
  const alternativeParts = [
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    "",
    `--${alternativeBoundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    textBody,
    "",
    `--${alternativeBoundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    htmlBody,
    "",
    `--${alternativeBoundary}--`
  ];

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    "MIME-Version: 1.0"
  ];

  if (!attachments.length) {
    return [
      ...headers,
      ...alternativeParts
    ].join("\r\n");
  }

  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    "",
    `--${mixedBoundary}`,
    ...alternativeParts,
    "",
    ...attachments.flatMap((attachment) => buildMimeAttachmentPart(mixedBoundary, attachment)),
    `--${mixedBoundary}--`
  ].join("\r\n");
}

function buildMimeAttachmentPart(boundary, attachment) {
  const fileName = sanitizeAttachmentFileName(attachment.fileName || "attachment.txt");
  const content = String(attachment.content || "");
  const contentType = attachment.contentType || "text/plain; charset=UTF-8";
  return [
    `--${boundary}`,
    `Content-Type: ${contentType}; name="${fileName}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${fileName}"`,
    "",
    Buffer.from(content, "utf8").toString("base64").replace(/.{1,76}/g, "$&\r\n").trim(),
    ""
  ];
}

function sanitizeAttachmentFileName(fileName) {
  return String(fileName || "attachment.txt").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "attachment.txt";
}

function encodeMimeHeader(value) {
  return `=?UTF-8?B?${Buffer.from(String(value)).toString("base64")}?=`;
}

module.exports = {
  buildMimeEmailBase64Url,
  buildMimeEmailString
};
