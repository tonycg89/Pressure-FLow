const net = require("node:net");
const tls = require("node:tls");
const { buildMimeEmailString } = require("./email");

async function sendSmtpEmail(settings, message) {
  requireSmtpSettings(settings);
  const from = settings.smtpFromEmail || settings.businessEmail || settings.smtpUsername;
  const mime = buildMimeEmailString({
    from,
    to: message.to,
    subject: message.subject,
    textBody: message.textBody,
    htmlBody: message.htmlBody,
    attachments: message.attachments || []
  });
  const recipients = parseEmailRecipients(message.to);
  if (!recipients.length) {
    throw new Error("No recipient email address was provided.");
  }

  const client = await createSmtpClient(settings);
  try {
    await client.command(`EHLO ${smtpClientName()}`, [250]);
    if (settings.smtpSecurity === "starttls") {
      await client.command("STARTTLS", [220]);
      await client.upgradeToTls();
      await client.command(`EHLO ${smtpClientName()}`, [250]);
    }
    if (settings.smtpUsername || settings.smtpPassword) {
      await client.command("AUTH LOGIN", [334]);
      await client.command(Buffer.from(settings.smtpUsername || "").toString("base64"), [334]);
      await client.command(Buffer.from(settings.smtpPassword || "").toString("base64"), [235]);
    }
    await client.command(`MAIL FROM:<${from}>`, [250]);
    for (const recipient of recipients) {
      await client.command(`RCPT TO:<${recipient}>`, [250, 251]);
    }
    await client.command("DATA", [354]);
    await client.command(`${mime.replace(/^\./gm, "..")}\r\n.`, [250]);
    await client.command("QUIT", [221]).catch(() => null);
  } finally {
    client.close();
  }

  return { id: `smtp-${Date.now()}` };
}

function createSmtpClient(settings) {
  return new Promise((resolve, reject) => {
    const options = {
      host: settings.smtpHost,
      port: Number(settings.smtpPort || 587),
      servername: settings.smtpHost
    };
    const socket = settings.smtpSecurity === "ssl"
      ? tls.connect(options)
      : net.connect(options);
    const client = makeSmtpClient(socket, settings);
    socket.once("error", reject);
    client.readResponse()
      .then(() => {
        socket.off("error", reject);
        resolve(client);
      })
      .catch(reject);
  });
}

function makeSmtpClient(socket, settings) {
  let buffer = "";
  const pending = [];

  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffer += chunk;
    flushSmtpResponses();
  });
  socket.on("error", (error) => {
    while (pending.length) {
      pending.shift().reject(error);
    }
  });

  function flushSmtpResponses() {
    while (pending.length) {
      const response = extractSmtpResponse();
      if (!response) return;
      pending.shift().resolve(response);
    }
  }

  function extractSmtpResponse() {
    const lines = buffer.split(/\r?\n/);
    let consumed = 0;
    const responseLines = [];
    for (const line of lines) {
      if (!line) break;
      consumed += line.length + (buffer.includes("\r\n") ? 2 : 1);
      responseLines.push(line);
      if (/^\d{3} /.test(line)) {
        buffer = buffer.slice(consumed);
        return responseLines.join("\n");
      }
    }
    return null;
  }

  return {
    readResponse() {
      return new Promise((resolve, reject) => {
        pending.push({ resolve, reject });
        flushSmtpResponses();
      });
    },
    async command(command, expectedCodes) {
      socket.write(`${command}\r\n`);
      const response = await this.readResponse();
      const code = Number(response.slice(0, 3));
      if (!expectedCodes.includes(code)) {
        throw new Error(`SMTP command failed (${code}): ${response.replace(/\s+/g, " ")}`);
      }
      return response;
    },
    async upgradeToTls() {
      const secureSocket = tls.connect({
        socket,
        servername: settings.smtpHost
      });
      await new Promise((resolve, reject) => {
        secureSocket.once("secureConnect", resolve);
        secureSocket.once("error", reject);
      });
      socket = secureSocket;
      socket.setEncoding("utf8");
      socket.on("data", (chunk) => {
        buffer += chunk;
        flushSmtpResponses();
      });
    },
    close() {
      socket.end();
    }
  };
}

function parseEmailRecipients(value) {
  return String(value || "")
    .split(/[;,]/)
    .map((item) => item.trim().match(/<?([^<>\s]+@[^<>\s]+)>?$/)?.[1] || "")
    .filter(Boolean);
}

function requireSmtpSettings(settings) {
  if (!settings.smtpHost) {
    throw new Error("SMTP host is missing. Open Settings and enter your email provider SMTP host.");
  }
  if (!settings.smtpPort) {
    throw new Error("SMTP port is missing.");
  }
  if (!settings.smtpUsername) {
    throw new Error("SMTP username is missing.");
  }
  if (!settings.smtpPassword) {
    throw new Error("SMTP password is missing. For iCloud, Outlook, Yahoo, or similar providers, use an app password when required.");
  }
}

function smtpClientName() {
  return "pressureflow.local";
}

module.exports = {
  sendSmtpEmail
};
