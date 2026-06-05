const crypto = require("node:crypto");

const inlineStorageProvider = "inline";

function createInlineFileRecord(input = {}) {
  const dataUrl = String(input.dataUrl || "").trim();
  const byteLength = Buffer.byteLength(dataUrl, "utf8");
  const contentHash = crypto.createHash("sha256").update(dataUrl).digest("hex");

  return {
    id: input.id || crypto.randomUUID(),
    provider: inlineStorageProvider,
    accountId: String(input.accountId || "owner"),
    ownerType: String(input.ownerType || ""),
    ownerId: String(input.ownerId || ""),
    purpose: String(input.purpose || ""),
    name: String(input.name || "File").trim(),
    mimeType: String(input.mimeType || "").trim(),
    byteLength,
    contentHash,
    dataUrl,
    createdAt: input.createdAt || new Date().toISOString()
  };
}

function publicFileRecord(file = {}) {
  return {
    id: file.id || "",
    provider: file.provider || inlineStorageProvider,
    accountId: file.accountId || "",
    ownerType: file.ownerType || "",
    ownerId: file.ownerId || "",
    purpose: file.purpose || "",
    name: file.name || "",
    mimeType: file.mimeType || "",
    byteLength: Number(file.byteLength || 0),
    contentHash: file.contentHash || "",
    createdAt: file.createdAt || ""
  };
}

module.exports = {
  createInlineFileRecord,
  publicFileRecord
};
