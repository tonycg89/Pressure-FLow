function createRecordRoutes({
  cancelStoredInvoiceIfPossible,
  deleteCustomerMeasurementArea,
  didPricingChange,
  findSavedMeasurements,
  normalizeCustomer,
  normalizeExpense,
  normalizeJob,
  readCustomers,
  readExpenses,
  readJobs,
  readRequestBody,
  resetJobForPricingChange,
  sendError,
  sendJson,
  statuses,
  syncJobMeasurementToCustomerFile,
  updateJob,
  validateCustomer,
  validateExpense,
  validateJob,
  writeCustomers,
  writeExpenses,
  writeJobs
}) {
  async function handleRecordRoutes(request, response, url) {
    if (request.method === "GET" && url.pathname === "/api/jobs") {
      sendJson(response, 200, { jobs: await readJobs(), statuses });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/customers") {
      sendJson(response, 200, { customers: await readCustomers() });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/expenses") {
      sendJson(response, 200, { expenses: await readExpenses() });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/property-measurements") {
      const address = url.searchParams.get("address") || "";
      sendJson(response, 200, { measurements: await findSavedMeasurements(address) });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/jobs") {
      const job = normalizeJob(await readRequestBody(request));
      const validationError = validateJob(job);

      if (validationError) {
        sendError(response, 400, validationError);
        return true;
      }

      const jobs = await readJobs();
      jobs.unshift(job);
      await syncJobMeasurementToCustomerFile(job);
      await writeJobs(jobs);
      sendJson(response, 201, { job });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/customers") {
      const customer = normalizeCustomer(await readRequestBody(request));
      const validationError = validateCustomer(customer);

      if (validationError) {
        sendError(response, 400, validationError);
        return true;
      }

      const customers = await readCustomers();
      customers.unshift(customer);
      await writeCustomers(customers);
      sendJson(response, 201, { customer });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/expenses") {
      const expense = normalizeExpense(await readRequestBody(request));
      const validationError = validateExpense(expense);

      if (validationError) {
        sendError(response, 400, validationError);
        return true;
      }

      const expenses = await readExpenses();
      expenses.unshift(expense);
      await writeExpenses(expenses);
      sendJson(response, 201, { expense });
      return true;
    }

    const updateMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
    const customerUpdateMatch = url.pathname.match(/^\/api\/customers\/([^/]+)$/);
    const expenseUpdateMatch = url.pathname.match(/^\/api\/expenses\/([^/]+)$/);
    const customerMeasurementDeleteMatch = url.pathname.match(/^\/api\/customers\/([^/]+)\/measurements\/([^/]+)$/);

    if (request.method === "DELETE" && customerMeasurementDeleteMatch) {
      const [, customerId, measurementId] = customerMeasurementDeleteMatch;
      const body = await readRequestBody(request);
      const customers = await readCustomers();
      const customer = customers.find((item) => item.id === customerId);

      if (!customer) {
        sendError(response, 404, "Customer not found.");
        return true;
      }

      const removed = deleteCustomerMeasurementArea(customer, measurementId, body.areaKey || "");
      if (!removed) {
        sendError(response, 404, "Saved service area not found.");
        return true;
      }

      customer.updatedAt = new Date().toISOString();
      await writeCustomers(customers);
      sendJson(response, 200, { customer });
      return true;
    }

    if (request.method === "PATCH" && customerUpdateMatch) {
      const [, customerId] = customerUpdateMatch;
      const customers = await readCustomers();
      const customer = customers.find((item) => item.id === customerId);

      if (!customer) {
        sendError(response, 404, "Customer not found.");
        return true;
      }

      const updatedCustomer = normalizeCustomer(await readRequestBody(request), customer);
      const validationError = validateCustomer(updatedCustomer);
      if (validationError) {
        sendError(response, 400, validationError);
        return true;
      }

      Object.assign(customer, updatedCustomer);
      await writeCustomers(customers);
      sendJson(response, 200, { customer });
      return true;
    }

    if (request.method === "DELETE" && customerUpdateMatch) {
      const [, customerId] = customerUpdateMatch;
      const customers = await readCustomers();
      const remainingCustomers = customers.filter((item) => item.id !== customerId);

      if (remainingCustomers.length === customers.length) {
        sendError(response, 404, "Customer not found.");
        return true;
      }

      await writeCustomers(remainingCustomers);
      sendJson(response, 200, { ok: true });
      return true;
    }

    if (request.method === "PATCH" && expenseUpdateMatch) {
      const [, expenseId] = expenseUpdateMatch;
      const expenses = await readExpenses();
      const expense = expenses.find((item) => item.id === expenseId);

      if (!expense) {
        sendError(response, 404, "Expense not found.");
        return true;
      }

      const updatedExpense = normalizeExpense(await readRequestBody(request), expense);
      const validationError = validateExpense(updatedExpense);
      if (validationError) {
        sendError(response, 400, validationError);
        return true;
      }

      Object.assign(expense, updatedExpense);
      await writeExpenses(expenses);
      sendJson(response, 200, { expense });
      return true;
    }

    if (request.method === "DELETE" && expenseUpdateMatch) {
      const [, expenseId] = expenseUpdateMatch;
      const expenses = await readExpenses();
      const remainingExpenses = expenses.filter((item) => item.id !== expenseId);

      if (remainingExpenses.length === expenses.length) {
        sendError(response, 404, "Expense not found.");
        return true;
      }

      await writeExpenses(remainingExpenses);
      sendJson(response, 200, { ok: true });
      return true;
    }

    if (request.method === "DELETE" && updateMatch) {
      const [, jobId] = updateMatch;
      const jobs = await readJobs();
      const remainingJobs = jobs.filter((item) => item.id !== jobId);

      if (remainingJobs.length === jobs.length) {
        sendError(response, 404, "Job not found.");
        return true;
      }

      await writeJobs(remainingJobs);
      sendJson(response, 200, { ok: true });
      return true;
    }

    if (request.method === "PATCH" && updateMatch) {
      const [, jobId] = updateMatch;
      const jobs = await readJobs();
      const job = jobs.find((item) => item.id === jobId);

      if (!job) {
        sendError(response, 404, "Job not found.");
        return true;
      }

      const input = await readRequestBody(request);
      const pricingChanged = didPricingChange(job, input);
      updateJob(job, input);
      const validationError = validateJob(job);
      if (validationError) {
        sendError(response, 400, validationError);
        return true;
      }

      if (pricingChanged) {
        await resetJobForPricingChange(job, cancelStoredInvoiceIfPossible);
      }

      await syncJobMeasurementToCustomerFile(job);
      job.updatedAt = new Date().toISOString();
      await writeJobs(jobs);
      sendJson(response, 200, { job });
      return true;
    }

    return false;
  }

  return { handleRecordRoutes };
}

module.exports = {
  createRecordRoutes
};
