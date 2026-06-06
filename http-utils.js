const { readFile } = require("node:fs/promises");
const path = require("node:path");

const MAX_REQUEST_BODY_BYTES = 25 * 1024 * 1024;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
};

const staticFileAllowlist = new Set([
  "index.html",
  "styles.css",
  "app.js",
  "favicon.ico"
]);

const loginPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>PressureFlow Login</title>
    <style>
      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        background: #f7f8fb;
        color: #202124;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(420px, calc(100vw - 32px));
        padding: 28px;
        border: 1px solid #d8dee8;
        border-radius: 8px;
        background: white;
        box-shadow: 0 12px 28px rgba(16, 24, 40, 0.08);
      }
      h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: 0; }
      p { margin: 0 0 20px; color: #667085; line-height: 1.45; }
      label { display: grid; gap: 6px; margin-bottom: 12px; color: #667085; font-size: 13px; font-weight: 700; }
      input { min-height: 42px; padding: 0 10px; border: 1px solid #d8dee8; border-radius: 8px; font: inherit; }
      button { width: 100%; min-height: 42px; border: 0; border-radius: 8px; background: #1c7c54; color: white; font: inherit; font-weight: 800; cursor: pointer; }
      .error { color: #b42318; min-height: 20px; margin-bottom: 12px; }
    </style>
  </head>
  <body>
    <main>
      <h1>PressureFlow</h1>
      <p>Sign in to manage your pressure washing jobs.</p>
      <form method="post" action="/auth/login">
        <label>
          Email
          <input name="email" type="email" autocomplete="username" required>
        </label>
        <label>
          Password
          <input name="password" type="password" autocomplete="current-password" required>
        </label>
        <div class="error">%ERROR%</div>
        <button type="submit">Sign In</button>
      </form>
    </main>
  </body>
</html>`;

async function readRequestBody(request) {
  const raw = await readRawRequestBody(request);
  if (!raw) {
    return {};
  }

  return parseJsonRequestText(raw);
}

async function readRawRequestBody(request, maxBytes = MAX_REQUEST_BODY_BYTES) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      throw httpError(413, "Request body is too large.");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readFormOrJsonBody(request) {
  const raw = await readRawRequestBody(request);
  const contentType = request.headers["content-type"] || "";

  if (contentType.includes("application/json")) {
    return parseJsonRequestText(raw);
  }

  return Object.fromEntries(new URLSearchParams(raw));
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseJsonRequestText(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw httpError(400, "Invalid JSON request body.");
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

function sanitizeDownloadFileName(fileName) {
  return String(fileName || "template.docx").replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || "template.docx";
}

function getAppBaseUrl(request) {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL;
  }

  const proto = request.headers["x-forwarded-proto"] || "http";
  const host = request.headers["x-forwarded-host"] || request.headers.host;
  return `${proto}://${host}`;
}

function getStaticFilePath(root, pathname) {
  let requestedPath;

  try {
    requestedPath = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  } catch {
    return null;
  }

  const normalizedPath = path.normalize(requestedPath);
  const isAllowedRootFile = staticFileAllowlist.has(normalizedPath);
  const isAllowedAsset = normalizedPath.startsWith(`assets${path.sep}`) && !normalizedPath.includes(`..${path.sep}`);

  if (!isAllowedRootFile && !isAllowedAsset) {
    return null;
  }

  const filePath = path.resolve(root, normalizedPath);
  const rootPath = path.resolve(root);

  if (filePath !== rootPath && !filePath.startsWith(`${rootPath}${path.sep}`)) {
    return null;
  }

  return filePath;
}

async function serveStatic(response, url, root) {
  const filePath = getStaticFilePath(root, url.pathname);

  if (!filePath) {
    sendError(response, 404, "File not found.");
    return;
  }

  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypes[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(file);
  } catch {
    sendError(response, 404, "File not found.");
  }
}

module.exports = {
  contentTypes,
  getAppBaseUrl,
  getStaticFilePath,
  httpError,
  loginPage,
  parseJsonRequestText,
  readFormOrJsonBody,
  readRawRequestBody,
  readRequestBody,
  sanitizeDownloadFileName,
  sendError,
  sendHtml,
  sendJson,
  serveStatic
};
