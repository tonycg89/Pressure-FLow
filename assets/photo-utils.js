(function () {
  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(reader.result));
      reader.addEventListener("error", () => reject(new Error("Unable to read file.")));
      reader.readAsDataURL(file);
    });
  }

  function fileToPhoto(file, metadata = {}) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        const image = new Image();
        image.addEventListener("load", () => {
          const maxSide = 1100;
          const scale = Math.min(maxSide / Math.max(image.width, image.height), 1);
          const width = Math.max(Math.round(image.width * scale), 1);
          const height = Math.max(Math.round(image.height * scale), 1);
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0, width, height);

          resolve({
            id: crypto.randomUUID(),
            name: file.name.replace(/\.[^.]+$/, ".jpg"),
            dataUrl: canvas.toDataURL("image/jpeg", 0.72),
            capturedAt: new Date().toISOString(),
            ...metadata
          });
        });
        image.addEventListener("error", () => {
          resolve({
            id: crypto.randomUUID(),
            name: file.name,
            dataUrl: reader.result,
            capturedAt: new Date().toISOString(),
            ...metadata
          });
        });
        image.src = reader.result;
      });
      reader.addEventListener("error", reject);
      reader.readAsDataURL(file);
    });
  }

  window.PressureFlowPhotoUtils = {
    fileToPhoto,
    readFileAsDataUrl
  };
})();
