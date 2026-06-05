async function sendAdminTextAlertSafe(message) {
  try {
    await sendAdminTextAlert(message);
  } catch (error) {
    console.warn(`Unable to send admin text alert: ${error.message}`);
  }
}

async function sendAdminTextAlert(message) {
  if (process.env.ENABLE_TWILIO_ALERTS !== "true") {
    return null;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN || "";
  const fromPhone = process.env.TWILIO_FROM_PHONE || "";
  const toPhone = process.env.ADMIN_ALERT_PHONE || "";

  if (!accountSid || !authToken || !fromPhone || !toPhone) {
    return null;
  }

  const body = String(message || "").trim().slice(0, 1500);
  if (!body) {
    return null;
  }

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      From: fromPhone,
      To: toPhone,
      Body: body
    })
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error_message || "Twilio text send failed.");
  }

  return data;
}

module.exports = {
  sendAdminTextAlert,
  sendAdminTextAlertSafe
};
