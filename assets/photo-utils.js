(function () {
  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(reader.result));
      reader.addEventListener("error", () => reject(new Error("Unable to read file.")));
      reader.readAsDataURL(file);
    });
  }

  async function blobToDataUrl(blob) {
    return readFileAsDataUrl(blob);
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => {
      if (!canvas.toBlob) {
        resolve(null);
        return;
      }
      canvas.toBlob(resolve, type, quality);
    });
  }

  async function fileToPhoto(file, metadata = {}) {
    const fallbackDataUrl = await readFileAsDataUrl(file);

    try {
      const image = await loadImageForResize(file, fallbackDataUrl);
      const maxSide = 1100;
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      const scale = Math.min(maxSide / Math.max(sourceWidth, sourceHeight), 1);
      const width = Math.max(Math.round(sourceWidth * scale), 1);
      const height = Math.max(Math.round(sourceHeight * scale), 1);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, width, height);
      if (typeof image.close === "function") {
        image.close();
      }

      const blob = await canvasToBlob(canvas, "image/jpeg", 0.72);
      const dataUrl = blob ? await blobToDataUrl(blob) : canvas.toDataURL("image/jpeg", 0.72);

      return {
        id: crypto.randomUUID(),
        name: file.name.replace(/\.[^.]+$/, ".jpg"),
        dataUrl,
        capturedAt: new Date().toISOString(),
        ...metadata
      };
    } catch {
      return {
        id: crypto.randomUUID(),
        name: file.name,
        dataUrl: fallbackDataUrl,
        capturedAt: new Date().toISOString(),
        ...metadata
      };
    }
  }

  function loadImageForResize(file, fallbackDataUrl) {
    if (typeof createImageBitmap === "function") {
      return createImageBitmap(file, { imageOrientation: "from-image" });
    }

    return new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener("load", () => resolve(image), { once: true });
      image.addEventListener("error", () => reject(new Error("Unable to load image.")), { once: true });
      image.src = fallbackDataUrl;
    });
  }

  window.PressureFlowPhotoUtils = {
    fileToPhoto,
    readFileAsDataUrl
  };
})();
