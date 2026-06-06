function createWorkspaceAccess({
  getContextStore,
  readAccounts,
  readAllCustomers,
  readAllExpenses,
  readAllJobs,
  readUserSettings,
  writeAllCustomers,
  writeAllExpenses,
  writeAllJobs,
  writeUserSettings
}) {
  function readSettings() {
    return readUserSettings(getContextStore()?.session?.userId || "");
  }

  function writeSettings(settings) {
    return writeUserSettings(getContextStore()?.session?.userId || "", settings);
  }

  async function readCurrentAccount() {
    const accountId = getWorkspaceId();
    if (!accountId) {
      return null;
    }

    const accounts = await readAccounts();
    return accounts.find((account) => account.id === accountId) || {
      id: accountId,
      name: accountId === "owner" ? "Owner Account" : "Account",
      plan: accountId === "owner" ? "owner" : "tester",
      status: "active"
    };
  }

  function readSettingsForJob(job) {
    return readUserSettings(itemWorkspaceId(job) === "owner" ? "env-admin" : itemWorkspaceId(job));
  }

  function getWorkspaceId() {
    const context = getContextStore();
    if (context?.authDisabled || context?.session?.userId === "env-admin") {
      return "owner";
    }
    return context?.session?.accountId || context?.session?.userId || "";
  }

  function itemWorkspaceId(item) {
    return item.accountId || "owner";
  }

  async function readWorkspaceItems(readAll) {
    const workspaceId = getWorkspaceId();
    if (process.env.DATABASE_URL && workspaceId) {
      return readAll({ accountId: workspaceId });
    }

    const items = await readAll();
    return workspaceId ? items.filter((item) => itemWorkspaceId(item) === workspaceId) : items;
  }

  async function writeWorkspaceItems(readAll, writeAll, items) {
    const workspaceId = getWorkspaceId();
    if (!workspaceId) {
      return writeAll(items);
    }

    const scopedItems = items.map((item) => ({ ...item, accountId: workspaceId }));
    if (process.env.DATABASE_URL) {
      return writeAll(scopedItems, { accountId: workspaceId });
    }

    const allItems = await readAll();
    const otherWorkspaceItems = allItems.filter((item) => itemWorkspaceId(item) !== workspaceId);
    return writeAll([...scopedItems, ...otherWorkspaceItems]);
  }

  function readJobs() {
    return readWorkspaceItems(readAllJobs);
  }

  function writeJobs(items) {
    return writeWorkspaceItems(readAllJobs, writeAllJobs, items);
  }

  function readCustomers() {
    return readWorkspaceItems(readAllCustomers);
  }

  function writeCustomers(items) {
    return writeWorkspaceItems(readAllCustomers, writeAllCustomers, items);
  }

  function readExpenses() {
    return readWorkspaceItems(readAllExpenses);
  }

  function writeExpenses(items) {
    return writeWorkspaceItems(readAllExpenses, writeAllExpenses, items);
  }

  return {
    getWorkspaceId,
    itemWorkspaceId,
    readCurrentAccount,
    readCustomers,
    readExpenses,
    readJobs,
    readSettings,
    readSettingsForJob,
    readWorkspaceItems,
    writeCustomers,
    writeExpenses,
    writeJobs,
    writeSettings,
    writeWorkspaceItems
  };
}

module.exports = {
  createWorkspaceAccess
};
