const crypto = require("node:crypto");

const SESSION_COOKIE = "pressureflow_session";
const CSRF_HEADER = "x-csrf-token";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 8;

function createAuthHelpers({
  readUsers,
  writeUsers,
  readAccounts,
  writeAccounts,
  safeCompare,
  getContextStore
}) {
  const loginAttempts = new Map();

  async function isAuthEnabled() {
    if (process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD_SHA256) {
      return true;
    }

    return (await readUsers()).some((user) => !user.disabled);
  }

  async function validateStartupSecurity() {
    if (process.env.NODE_ENV !== "production" || process.env.ALLOW_AUTH_DISABLED === "true") {
      if (!(await isAuthEnabled())) {
        console.warn("PressureFlow authentication is disabled. Set ADMIN_PASSWORD or create an active user before deploying.");
      }
      return;
    }

    if (!process.env.SESSION_SECRET) {
      throw new Error("SESSION_SECRET is required when NODE_ENV=production.");
    }

    if (!(await isAuthEnabled())) {
      throw new Error("Authentication is disabled. Set ADMIN_PASSWORD, ADMIN_PASSWORD_SHA256, or create an active user before starting production.");
    }
  }

  function isPublicPath(pathname) {
    return pathname === "/login" ||
      pathname === "/auth/login" ||
      pathname === "/auth/logout" ||
      pathname === "/health" ||
      pathname === "/webhooks/square" ||
      pathname.startsWith("/estimate/") ||
      pathname.startsWith("/contract/") ||
      pathname.startsWith("/proof/") ||
      pathname.startsWith("/invoice/") ||
      pathname.startsWith("/assets/") ||
      pathname.startsWith("/api/public/") ||
      pathname === "/webhooks/stripe" ||
      pathname === "/favicon.ico";
  }

  async function authenticateLogin(email, password) {
    const adminLogin = isValidAdminLogin(email, password);
    if (adminLogin) {
      return adminLogin;
    }

    const users = await readUsers();
    const user = users.find((item) => item.email.toLowerCase() === String(email || "").trim().toLowerCase());
    if (!user || user.disabled || !verifyPassword(password, user.passwordHash)) {
      return null;
    }

    user.lastLoginAt = new Date().toISOString();
    user.updatedAt = new Date().toISOString();
    await writeUsers(users);
    return {
      userId: user.id,
      accountId: user.accountId || user.id,
      email: user.email,
      role: user.role || "tester"
    };
  }

  function isValidAdminLogin(email, password) {
    const expectedEmail = process.env.ADMIN_EMAIL || "";
    if (expectedEmail && String(email || "").toLowerCase() !== expectedEmail.toLowerCase()) {
      return null;
    }

    if (process.env.ADMIN_PASSWORD_SHA256) {
      const matches = safeCompare(
        crypto.createHash("sha256").update(String(password || "")).digest("hex"),
        process.env.ADMIN_PASSWORD_SHA256
      );
      return matches ? { userId: "env-admin", accountId: "owner", email: expectedEmail || "admin", role: "owner" } : null;
    }

    const matches = safeCompare(String(password || ""), process.env.ADMIN_PASSWORD || "");
    return matches ? { userId: "env-admin", accountId: "owner", email: expectedEmail || "admin", role: "owner" } : null;
  }

  function buildSessionCookie(user = {}) {
    const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
    const payload = base64UrlEncode(JSON.stringify({
      expiresAt,
      userId: user.userId || "",
      accountId: user.accountId || user.userId || "",
      email: user.email || "",
      role: user.role || "tester"
    }));
    const signature = signSessionPayload(payload);
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return `${SESSION_COOKIE}=${payload}.${signature}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`;
  }

  function publicUsers(users) {
    return users.map(publicUser);
  }

  function publicUser(user) {
    return {
      id: user.id,
      accountId: user.accountId || user.id,
      name: user.name || "",
      email: user.email || "",
      role: user.role || "tester",
      disabled: Boolean(user.disabled),
      lastLoginAt: user.lastLoginAt || "",
      createdAt: user.createdAt || ""
    };
  }

  function publicAccount(account) {
    if (!account?.id) return null;
    return {
      id: account.id,
      name: account.name || "",
      plan: account.plan || "tester",
      status: account.status || "active"
    };
  }

  function publicSessionUser(session) {
    if (!session?.userId) return null;
    return {
      id: session.userId,
      accountId: session.accountId || session.userId,
      email: session.email || "",
      role: session.role || "tester",
      isOwner: session.role === "owner"
    };
  }

  function isOwnerSession() {
    const context = getContextStore();
    return context?.authDisabled || context?.session?.role === "owner";
  }

  function getLoginRateLimitKey(request, email) {
    const forwardedFor = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const ip = forwardedFor || request.socket.remoteAddress || "unknown";
    return `${ip}|${String(email || "").trim().toLowerCase()}`;
  }

  function getLoginRateLimitRecord(key) {
    const now = Date.now();
    const record = loginAttempts.get(key);

    if (!record || record.resetAt <= now) {
      const nextRecord = { count: 0, resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS };
      loginAttempts.set(key, nextRecord);
      return nextRecord;
    }

    return record;
  }

  function isLoginRateLimited(key) {
    return getLoginRateLimitRecord(key).count >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS;
  }

  function recordFailedLoginAttempt(key) {
    const record = getLoginRateLimitRecord(key);
    record.count += 1;
  }

  function clearLoginAttempts(key) {
    loginAttempts.delete(key);
  }

  async function createAppUser(input) {
    const user = normalizeAppUser(input);
    const users = await readUsers();
    const existingIndex = users.findIndex((item) => item.email.toLowerCase() === user.email.toLowerCase());

    if (existingIndex >= 0) {
      const existingUser = users[existingIndex];
      if (!existingUser.disabled) {
        throw new Error("A user with that email already exists.");
      }

      const reactivatedUser = {
        ...existingUser,
        name: user.name,
        passwordHash: user.passwordHash,
        role: user.role,
        disabled: false,
        updatedAt: new Date().toISOString()
      };
      users[existingIndex] = reactivatedUser;
      await writeUsers(users);
      await ensureAccountForUser(reactivatedUser);
      return { user: reactivatedUser, users };
    }

    users.push(user);
    await writeUsers(users);
    await ensureAccountForUser(user);
    return { user, users };
  }

  async function ensureAccountForUser(user) {
    const accountId = user.accountId || user.id;
    const accounts = await readAccounts();
    const existingIndex = accounts.findIndex((account) => account.id === accountId);
    if (existingIndex >= 0) {
      accounts[existingIndex] = {
        ...accounts[existingIndex],
        name: accounts[existingIndex].name || user.name || user.email || "Tester Account",
        status: user.disabled ? "disabled" : "active",
        updatedAt: new Date().toISOString()
      };
      await writeAccounts(accounts);
      return;
    }

    accounts.push({
      id: accountId,
      name: user.name || user.email || "Tester Account",
      plan: user.role === "owner" ? "owner" : "tester",
      status: user.disabled ? "disabled" : "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    await writeAccounts(accounts);
  }

  async function deleteAppUser(userId) {
    const users = await readUsers();
    const remainingUsers = users.filter((user) => user.id !== userId);

    if (remainingUsers.length === users.length) {
      throw new Error("User not found.");
    }

    if (!process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD_SHA256 && !remainingUsers.some((user) => !user.disabled)) {
      throw new Error("Add another active user before deleting the last login.");
    }

    await writeUsers(remainingUsers);
    return { users: remainingUsers };
  }

  function normalizeAppUser(input) {
    const id = crypto.randomUUID();
    const name = String(input.name || "").trim();
    const email = String(input.email || "").trim().toLowerCase();
    const password = String(input.password || "");
    const role = ["owner", "admin", "tester", "technician"].includes(input.role) ? input.role : "tester";
    const accountId = String(input.accountId || id).trim();

    if (!name) {
      throw new Error("Enter a user name.");
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error("Enter a valid user email.");
    }
    if (password.length < 8) {
      throw new Error("Use a temporary password with at least 8 characters.");
    }

    return {
      id,
      accountId,
      name,
      email,
      passwordHash: hashPassword(password),
      role,
      disabled: false,
      settings: {},
      lastLoginAt: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function hashPassword(password) {
    const iterations = 120000;
    const salt = crypto.randomBytes(16).toString("base64url");
    const hash = crypto.pbkdf2Sync(String(password || ""), salt, iterations, 32, "sha256").toString("base64url");
    return `pbkdf2-sha256$${iterations}$${salt}$${hash}`;
  }

  function verifyPassword(password, storedHash) {
    const [scheme, iterationsText, salt, expectedHash] = String(storedHash || "").split("$");
    if (scheme !== "pbkdf2-sha256" || !iterationsText || !salt || !expectedHash) {
      return false;
    }

    const iterations = Number(iterationsText);
    if (!Number.isFinite(iterations) || iterations < 10000) {
      return false;
    }

    const actualHash = crypto.pbkdf2Sync(String(password || ""), salt, iterations, 32, "sha256").toString("base64url");
    return safeCompare(actualHash, expectedHash);
  }

  function getValidSession(request) {
    const cookie = parseCookies(request.headers.cookie || "")[SESSION_COOKIE];
    if (!cookie) return null;

    const [payload, signature] = cookie.split(".");
    if (!payload || !signature || !safeCompare(signature, signSessionPayload(payload))) {
      return null;
    }

    try {
      const session = JSON.parse(base64UrlDecode(payload));
      return Number(session.expiresAt) > Date.now() ? session : null;
    } catch {
      return null;
    }
  }

  function requiresCsrfToken(request, url) {
    if (!["POST", "PATCH", "DELETE"].includes(request.method)) {
      return false;
    }

    return !isCsrfExemptPath(url.pathname);
  }

  function isCsrfExemptPath(pathname) {
    return pathname === "/auth/login" ||
      pathname === "/auth/logout" ||
      pathname.startsWith("/api/public/") ||
      pathname === "/webhooks/square" ||
      pathname === "/webhooks/stripe";
  }

  function buildCsrfToken(request) {
    const cookie = parseCookies(request.headers.cookie || "")[SESSION_COOKIE] || "";
    const [payload, signature] = cookie.split(".");
    const sessionKey = payload && signature && safeCompare(signature, signSessionPayload(payload))
      ? payload
      : "local-auth-disabled";

    return crypto
      .createHmac("sha256", process.env.SESSION_SECRET || "local-development-session-secret")
      .update(`csrf:${sessionKey}`)
      .digest("base64url");
  }

  function hasValidCsrfToken(request) {
    const token = String(request.headers[CSRF_HEADER] || "");
    return Boolean(token) && safeCompare(token, buildCsrfToken(request));
  }

  function signSessionPayload(payload) {
    return crypto
      .createHmac("sha256", process.env.SESSION_SECRET || "local-development-session-secret")
      .update(payload)
      .digest("base64url");
  }

  return {
    authenticateLogin,
    buildCsrfToken,
    buildSessionCookie,
    clearLoginAttempts,
    createAppUser,
    deleteAppUser,
    getLoginRateLimitKey,
    getValidSession,
    hasValidCsrfToken,
    isAuthEnabled,
    isLoginRateLimited,
    isOwnerSession,
    isPublicPath,
    publicAccount,
    publicSessionUser,
    publicUser,
    publicUsers,
    recordFailedLoginAttempt,
    requiresCsrfToken,
    validateStartupSecurity
  };
}

function parseCookies(header) {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

module.exports = {
  CSRF_HEADER,
  SESSION_COOKIE,
  createAuthHelpers
};
