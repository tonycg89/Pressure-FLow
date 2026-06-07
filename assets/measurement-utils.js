(function () {
  function createMeasurementUtils({ buildStaticMapUrl, getTurf, randomId }) {
    function buildMeasurementFeatureCollection(areas) {
      const features = (areas || []).map((area) => area.geojson).filter(Boolean);
      if (!features.length) return null;
      return { type: "FeatureCollection", features };
    }

    function recalculateMeasurementTotals(measurement) {
      const areas = Array.isArray(measurement.areas) ? measurement.areas : [];
      const squareFeet = areas.reduce((sum, area) => sum + Number(area.squareFeet || 0), 0);
      const perimeterFeet = areas.reduce((sum, area) => sum + Number(area.perimeterFeet || 0), 0);
      const firstArea = areas[0] || {};
      const updated = {
        ...measurement,
        squareFeet,
        perimeterFeet,
        geojson: buildMeasurementFeatureCollection(areas),
        center: measurement.center || [],
        zoom: Number(measurement.zoom || 18),
        capturedAt: new Date().toISOString()
      };
      if (!updated.center?.length && firstArea.center?.length) {
        updated.center = firstArea.center;
      }
      updated.staticImageUrl = buildStaticMapUrl(updated);
      return updated;
    }

    function normalizeMeasurementForEditing(measurement = {}) {
      const areas = Array.isArray(measurement.areas)
        ? measurement.areas
        : measurement.geojson && measurement.squareFeet
          ? [{
            id: randomId(),
            name: "Service area 1",
            squareFeet: Number(measurement.squareFeet || 0),
            perimeterFeet: Number(measurement.perimeterFeet || 0),
            geojson: measurement.geojson,
            capturedAt: measurement.capturedAt || new Date().toISOString()
          }]
          : [];

      const normalized = {
        ...measurement,
        areas: areas.map((area, index) => ({
          id: String(area.id || randomId()),
          name: String(area.name || area.label || `Service area ${index + 1}`).trim(),
          squareFeet: Number(area.squareFeet || 0),
          perimeterFeet: Number(area.perimeterFeet || 0),
          geojson: area.geojson,
          capturedAt: String(area.capturedAt || new Date().toISOString())
        })).filter((area) => area.geojson && area.squareFeet > 0)
      };

      return recalculateMeasurementTotals(normalized);
    }

    function calculatePerimeterFeet(feature) {
      const outerRing = feature?.geometry?.coordinates?.[0];
      if (!Array.isArray(outerRing) || outerRing.length < 2) {
        return 0;
      }

      const turf = getTurf();
      const line = turf.lineString(outerRing);
      return Math.round(turf.length(line, { units: "feet" }));
    }

    function measurementGeojsonKey(geojson) {
      return JSON.stringify(geojson || {});
    }

    return {
      buildMeasurementFeatureCollection,
      calculatePerimeterFeet,
      measurementGeojsonKey,
      normalizeMeasurementForEditing,
      recalculateMeasurementTotals
    };
  }

  window.PressureFlowMeasurementUtils = {
    createMeasurementUtils
  };
})();
