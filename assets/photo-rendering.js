(function () {
  function createPhotoRendering({ escapeHtml }) {
    function renderEditablePhotoGrid(container, photos, rerender, removePhoto) {
      container.innerHTML = "";
      if (!photos.length) {
        container.innerHTML = '<p class="photo-empty">No photos yet.</p>';
        return;
      }

      photos.forEach((photo) => {
        const figure = document.createElement("figure");
        figure.innerHTML = `
          <img src="${escapeHtml(photo.dataUrl)}" alt="${escapeHtml(photo.name)}">
          <button class="photo-remove" type="button" title="Remove photo">X</button>
        `;
        figure.querySelector("button").addEventListener("click", () => {
          if (removePhoto) {
            removePhoto(photo);
          } else {
            const index = photos.findIndex((item) => item.id === photo.id);
            if (index >= 0) {
              photos.splice(index, 1);
            }
          }
          rerender();
        });
        container.append(figure);
      });
    }

    function renderBeforePhotoPreview(container, photos) {
      if (!photos.length) {
        container.innerHTML = '<p class="photo-empty">No before photos yet.</p>';
        return;
      }

      const sections = [...new Set(photos.map((photo) => photo.section || "Before"))];
      container.innerHTML = sections.map((section) => {
        const sectionPhotos = photos.filter((photo) => (photo.section || "Before") === section);
        return `
          <div class="saved-photo-section">
            <p class="photo-label">${escapeHtml(section)}</p>
            <div class="photo-grid" data-before-photo-group="${escapeHtml(section)}">
              ${sectionPhotos.map((photo) => `
                <figure>
                  <img src="${escapeHtml(photo.dataUrl)}" alt="${escapeHtml(photo.name)}">
                  <button class="photo-remove" type="button" title="Remove photo" data-remove-before-photo="${escapeHtml(photo.id)}">X</button>
                </figure>
              `).join("")}
            </div>
          </div>
        `;
      }).join("");
    }

    function renderBeforePhotoSections(photos, knownSections) {
      if (!photos.length) {
        return '<p>No photos saved.</p>';
      }

      const sections = [...knownSections];
      photos.forEach((photo) => {
        const section = photo.section || "Main driveway";
        if (!sections.includes(section)) {
          sections.push(section);
        }
      });

      return sections
        .map((section) => {
          const sectionPhotos = photos.filter((photo) => (photo.section || "Main driveway") === section);
          if (!sectionPhotos.length) return "";
          return `
            <div class="saved-photo-section">
              <p class="photo-label">${escapeHtml(section)}</p>
              ${renderPhotoGrid(sectionPhotos)}
            </div>
          `;
        })
        .join("");
    }

    function renderPhotoGrid(photos) {
      if (!photos.length) {
        return '<p>No photos saved.</p>';
      }

      return `
        <div class="photo-grid saved-photo-grid">
          ${photos.map((photo) => `
            <figure>
              <button class="photo-open" type="button" data-photo-src="${escapeHtml(photo.dataUrl)}" data-photo-name="${escapeHtml(photo.name)}">
                <img src="${escapeHtml(photo.dataUrl)}" alt="${escapeHtml(photo.name)}">
              </button>
            </figure>
          `).join("")}
        </div>
      `;
    }

    return {
      renderBeforePhotoPreview,
      renderBeforePhotoSections,
      renderEditablePhotoGrid,
      renderPhotoGrid
    };
  }

  window.PressureFlowPhotoRendering = {
    createPhotoRendering
  };
})();
