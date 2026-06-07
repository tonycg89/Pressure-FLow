const { readFile } = require("node:fs/promises");
const path = require("node:path");

function createExportTemplateRoutes({
  contentTypes,
  createInlineFileRecord,
  dateStamp,
  getTemplateMetadata,
  getWorkspaceId,
  isOwnerSession,
  jobsToCsv,
  MAX_CUSTOM_TEMPLATES,
  MAX_TEMPLATE_DATA_URL_BYTES,
  normalizeCustomTemplates,
  publicSettings,
  readJobs,
  readRequestBody,
  readSettings,
  renderEstimateApprovalWordTemplate,
  root,
  sanitizeDownloadFileName,
  sendError,
  sendJson,
  statuses,
  writeSettings,
  randomId
}) {
  async function handleExportTemplateRoutes(request, response, url) {
    if (request.method === "GET" && url.pathname === "/api/export/jobs.csv") {
      const csv = jobsToCsv(await readJobs());
      response.writeHead(200, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="pressureflow-jobs-${dateStamp()}.csv"`
      });
      response.end(csv);
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/export/backup.json") {
      if (!isOwnerSession()) {
        sendError(response, 403, "Owner access required.");
        return true;
      }

      const backup = {
        exportedAt: new Date().toISOString(),
        app: "PressureFlow",
        version: 1,
        statuses,
        settings: publicSettings(await readSettings()),
        jobs: await readJobs()
      };
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="pressureflow-backup-${dateStamp()}.json"`
      });
      response.end(JSON.stringify(backup, null, 2));
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/templates/service-agreement.docx") {
      const file = await readFile(path.join(root, "Pressure Washing Service Agreement.docx"));
      response.writeHead(200, {
        "content-type": contentTypes[".docx"],
        "content-disposition": 'attachment; filename="Pressure Washing Service Agreement.docx"'
      });
      response.end(file);
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/templates/estimate-approval.doc") {
      const settings = await readSettings();
      const doc = renderEstimateApprovalWordTemplate(settings);
      response.writeHead(200, {
        "content-type": `${contentTypes[".doc"]}; charset=utf-8`,
        "content-disposition": 'attachment; filename="PressureFlow Estimate Approval Template.doc"'
      });
      response.end(doc);
      return true;
    }

    const customTemplateMatch = url.pathname.match(/^\/api\/templates\/custom\/([^/]+)$/);
    if (request.method === "GET" && customTemplateMatch) {
      const [, templateId] = customTemplateMatch;
      const settings = await readSettings();
      const template = normalizeCustomTemplates(settings.customTemplates).find((item) => item.id === templateId);
      if (!template) {
        sendError(response, 404, "Template not found.");
        return true;
      }

      const [, base64Data = ""] = template.dataUrl.split(",");
      const file = Buffer.from(base64Data, "base64");
      response.writeHead(200, {
        "content-type": template.mimeType,
        "content-disposition": `attachment; filename="${sanitizeDownloadFileName(template.fileName)}"`
      });
      response.end(file);
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/templates/custom") {
      const input = await readRequestBody(request);
      const settings = await readSettings();
      const templates = normalizeCustomTemplates(settings.customTemplates);
      if (Buffer.byteLength(String(input.dataUrl || ""), "utf8") > MAX_TEMPLATE_DATA_URL_BYTES) {
        sendError(response, 400, "Template is too large. Please upload a smaller Word document.");
        return true;
      }

      const template = normalizeCustomTemplates([{
        id: randomId(),
        name: input.name,
        description: input.description,
        fileName: input.fileName,
        mimeType: input.mimeType,
        dataUrl: input.dataUrl,
        uploadedAt: new Date().toISOString()
      }])[0];

      if (!template) {
        sendError(response, 400, "Upload a valid Word document.");
        return true;
      }

      if (!/\.docx?$/i.test(template.fileName)) {
        sendError(response, 400, "Only .doc and .docx templates are supported.");
        return true;
      }

      template.file = createInlineFileRecord({
        ...template.file,
        accountId: getWorkspaceId() || "owner",
        ownerType: "settings",
        ownerId: "customTemplates",
        purpose: "custom-template",
        name: template.fileName,
        mimeType: template.mimeType,
        dataUrl: template.dataUrl,
        createdAt: template.uploadedAt
      });

      settings.customTemplates = [template, ...templates].slice(0, MAX_CUSTOM_TEMPLATES);
      await writeSettings(settings);
      sendJson(response, 200, { templates: getTemplateMetadata(settings.customTemplates) });
      return true;
    }

    if (request.method === "DELETE" && customTemplateMatch) {
      const [, templateId] = customTemplateMatch;
      const settings = await readSettings();
      settings.customTemplates = normalizeCustomTemplates(settings.customTemplates).filter((template) => template.id !== templateId);
      await writeSettings(settings);
      sendJson(response, 200, { templates: getTemplateMetadata(settings.customTemplates) });
      return true;
    }

    return false;
  }

  return { handleExportTemplateRoutes };
}

module.exports = {
  createExportTemplateRoutes
};
