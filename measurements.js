const crypto = require("node:crypto");
const {
  normalizeCustomer,
  normalizeMeasurement,
  normalizePropertyMeasurements
} = require("./records");

function createMeasurementHandlers({ readCustomers, readJobs, writeCustomers }) {
  async function findSavedMeasurements({ customerId = "", jobId = "" } = {}) {
    const customers = await readCustomers();
    const ownerCustomerId = customerId || await getCustomerIdForJob(jobId);
    if (!ownerCustomerId) {
      return [];
    }

    const seen = new Set();
    const customerMeasurements = customers
      .filter((customer) => customer.id === ownerCustomerId)
      .flatMap((customer) => (customer.propertyMeasurements || []).flatMap((item) =>
        expandSavedMeasurementAreas({
          id: item.id,
          customerId: customer.id,
          customerName: customer.customerName,
          label: item.label || "",
          address: item.address || customer.address,
          updatedAt: item.updatedAt || customer.updatedAt || "",
          measurement: item.measurement || item
        })
      ));

    return customerMeasurements
      .filter((item) => {
        const key = JSON.stringify(item.measurement.geojson);
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .slice(0, 24);
  }

  async function getCustomerIdForJob(jobId) {
    if (!jobId) {
      return "";
    }

    const job = (await readJobs()).find((item) => item.id === jobId);
    return job?.customerId || "";
  }

  async function syncJobMeasurementToCustomerFile(job) {
    if (!job.measurement?.geojson || !job.measurement?.squareFeet) {
      return;
    }

    const customers = await readCustomers();
    let customer = customers.find((item) => item.id === job.customerId);

    if (!customer) {
      customer = normalizeCustomer({
        customerName: job.customerName,
        email: job.email,
        phone: job.phone,
        address: job.address,
        leadSource: job.leadSource,
        notes: `Created from measured job on ${new Date().toLocaleDateString("en-US")}.`,
        serviceAreaPhotos: [],
        propertyMeasurements: []
      });
      customers.unshift(customer);
      job.customerId = customer.id;
    }

    const propertyMeasurements = normalizePropertyMeasurements(customer.propertyMeasurements || []);
    const savedMeasurements = buildPerAreaPropertyMeasurements(job);
    const savedKeys = new Set(savedMeasurements.flatMap((item) => getMeasurementAreaKeys(item.measurement)));
    const retainedMeasurements = propertyMeasurements.filter((item) =>
      !getMeasurementAreaKeys(item.measurement).some((key) => savedKeys.has(key))
    );

    customer.propertyMeasurements = [...savedMeasurements, ...retainedMeasurements].slice(0, 24);
    customer.updatedAt = new Date().toISOString();
    await writeCustomers(customers);
  }

  return {
    findSavedMeasurements,
    syncJobMeasurementToCustomerFile
  };
}

function expandSavedMeasurementAreas(item) {
  const measurement = normalizeMeasurement(item.measurement);
  const areas = Array.isArray(measurement.areas) && measurement.areas.length
    ? measurement.areas
    : measurement.geojson && measurement.squareFeet
      ? [{
        id: crypto.randomUUID(),
        name: item.label || "Saved measurement",
        squareFeet: measurement.squareFeet,
        perimeterFeet: measurement.perimeterFeet,
        geojson: measurement.geojson,
        capturedAt: measurement.capturedAt
      }]
      : [];

  return areas.map((area) => ({
    ...item,
    label: area.name || item.label || "Saved measurement",
    measurement: {
      address: measurement.address || item.address || "",
      squareFeet: Number(area.squareFeet || 0),
      perimeterFeet: Number(area.perimeterFeet || 0),
      geojson: area.geojson,
      areas: [{
        id: String(area.id || crypto.randomUUID()),
        name: area.name || item.label || "Saved measurement",
        squareFeet: Number(area.squareFeet || 0),
        perimeterFeet: Number(area.perimeterFeet || 0),
        geojson: area.geojson,
        capturedAt: area.capturedAt || measurement.capturedAt || new Date().toISOString()
      }],
      center: measurement.center || [],
      zoom: measurement.zoom || 18,
      staticImageUrl: measurement.staticImageUrl || "",
      capturedAt: area.capturedAt || measurement.capturedAt || new Date().toISOString()
    }
  }));
}

function buildPerAreaPropertyMeasurements(job) {
  const measurement = normalizeMeasurement(job.measurement);
  const areas = Array.isArray(measurement.areas) && measurement.areas.length
    ? measurement.areas
    : measurement.geojson && measurement.squareFeet
      ? [{
        id: crypto.randomUUID(),
        name: `${job.serviceType || "Service area"} measurement`,
        squareFeet: measurement.squareFeet,
        perimeterFeet: measurement.perimeterFeet,
        geojson: measurement.geojson,
        capturedAt: measurement.capturedAt
      }]
      : [];

  return areas.map((area) => ({
    id: crypto.randomUUID(),
    label: area.name || "Service area",
    address: measurement.address || job.address,
    sourceJobId: job.id,
    updatedAt: new Date().toISOString(),
    measurement: {
      address: measurement.address || job.address,
      squareFeet: Number(area.squareFeet || 0),
      perimeterFeet: Number(area.perimeterFeet || 0),
      geojson: area.geojson,
      areas: [{
        id: String(area.id || crypto.randomUUID()),
        name: area.name || "Service area",
        squareFeet: Number(area.squareFeet || 0),
        perimeterFeet: Number(area.perimeterFeet || 0),
        geojson: area.geojson,
        capturedAt: area.capturedAt || measurement.capturedAt || new Date().toISOString()
      }],
      center: measurement.center || [],
      zoom: measurement.zoom || 18,
      staticImageUrl: "",
      capturedAt: area.capturedAt || measurement.capturedAt || new Date().toISOString()
    }
  })).filter((item) => item.measurement.geojson && item.measurement.squareFeet > 0);
}

function normalizeAddressKey(address) {
  return String(address || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deleteCustomerMeasurementArea(customer, measurementId, areaKey) {
  const propertyMeasurements = normalizePropertyMeasurements(customer.propertyMeasurements || []);
  let removed = false;
  const nextMeasurements = [];

  propertyMeasurements.forEach((item) => {
    if (item.id !== measurementId) {
      nextMeasurements.push(item);
      return;
    }

    const measurement = normalizeMeasurement(item.measurement);
    const areas = Array.isArray(measurement.areas) ? measurement.areas : [];
    if (!areaKey) {
      removed = true;
      return;
    }

    const remainingAreas = areas.filter((area) => JSON.stringify(area.geojson || {}) !== areaKey);
    if (remainingAreas.length === areas.length) {
      nextMeasurements.push(item);
      return;
    }

    removed = true;
    if (!remainingAreas.length) {
      return;
    }

    const updatedMeasurement = normalizeMeasurement({
      ...measurement,
      areas: remainingAreas,
      staticImageUrl: ""
    });
    nextMeasurements.push({
      ...item,
      label: remainingAreas.map((area) => area.name).filter(Boolean).join(" + ") || item.label,
      updatedAt: new Date().toISOString(),
      measurement: updatedMeasurement
    });
  });

  customer.propertyMeasurements = nextMeasurements;
  return removed;
}

function getMeasurementAreaKeys(value) {
  const measurement = normalizeMeasurement(value);
  if (Array.isArray(measurement.areas) && measurement.areas.length) {
    return measurement.areas
      .map((area) => area.geojson ? JSON.stringify(area.geojson) : "")
      .filter(Boolean);
  }

  return measurement.geojson ? [JSON.stringify(measurement.geojson)] : [];
}

module.exports = {
  buildPerAreaPropertyMeasurements,
  createMeasurementHandlers,
  deleteCustomerMeasurementArea,
  expandSavedMeasurementAreas,
  normalizeAddressKey
};
