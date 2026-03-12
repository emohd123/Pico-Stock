const revealElements = document.querySelectorAll('.reveal');
if (revealElements.length > 0) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  revealElements.forEach((element, index) => {
    element.style.setProperty('--reveal-delay', `${Math.min(index * 55, 320)}ms`);
    observer.observe(element);
  });
}

const productImages = document.querySelectorAll('img[data-product-image="true"]');
productImages.forEach((image) => {
  const fallbackSrc = image.getAttribute('data-fallback-src');
  if (!fallbackSrc) {
    return;
  }

  const applyFallback = () => {
    if (image.dataset.fallbackApplied === '1') {
      return;
    }

    image.dataset.fallbackApplied = '1';
    image.src = fallbackSrc;
  };

  image.addEventListener('error', applyFallback);
  if (image.complete && image.naturalWidth === 0) {
    applyFallback();
  }
});

const editorRoot = document.getElementById('admin-order-form');
if (editorRoot && window.picoOrderEditor) {
  const catalogMap = new Map(window.picoOrderEditor.catalogItems.map((item) => [String(item.id), item]));
  const linesRoot = document.getElementById('order-lines');
  const template = document.getElementById('order-line-template');
  const addButton = document.getElementById('add-order-line');
  const totalNode = document.getElementById('order-grand-total');
  const currency = window.picoOrderEditor.currency || 'BHD';

  const refreshGrandTotal = () => {
    const totals = Array.from(linesRoot.querySelectorAll('.admin-line-editor')).map((line) => {
      const qty = Number(line.querySelector('.line-quantity-input')?.value || 0);
      const price = Number(line.querySelector('.line-price-input')?.value || 0);
      return qty * price;
    });

    if (totalNode) {
      totalNode.textContent = totals.reduce((sum, value) => sum + value, 0).toFixed(3);
    }
  };

  const refreshLine = (line) => {
    const select = line.querySelector('.line-catalog-select');
    const quantityInput = line.querySelector('.line-quantity-input');
    const priceInput = line.querySelector('.line-price-input');
    const totalText = line.querySelector('.line-total');
    const nameText = line.querySelector('.line-item-name');
    const codeText = line.querySelector('.line-item-code');
    const image = line.querySelector('.admin-line-preview');
    const selected = catalogMap.get(String(select?.value || ''));
    const qty = Number(quantityInput?.value || 0);
    const currentPrice = Number(priceInput?.value || 0);

    if (selected) {
      nameText.textContent = selected.name || '';
      codeText.textContent = selected.code || '';
      if (image) {
        image.src = selected.imagePath || '';
        image.alt = selected.name || '';
      }

      if (priceInput && currentPrice === 0 && Number(selected.price || 0) > 0) {
        priceInput.value = Number(selected.price).toFixed(3);
      }
    }

    const lineTotal = qty * Number(priceInput?.value || 0);
    if (totalText) {
      totalText.textContent = `${lineTotal.toFixed(3)} ${currency}`;
    }

    refreshGrandTotal();
  };

  const refreshIndexes = () => {
    Array.from(linesRoot.querySelectorAll('.admin-line-editor')).forEach((line, index) => {
      line.dataset.lineIndex = index;
      line.querySelectorAll('input, select, textarea').forEach((field) => {
        if (field.name) {
          field.name = field.name.replace(/Lines\[\d+\]/g, `Lines[${index}]`);
        }
      });
    });
  };

  const wireLine = (line) => {
    line.querySelector('.line-catalog-select')?.addEventListener('change', () => refreshLine(line));
    line.querySelector('.line-quantity-input')?.addEventListener('input', () => refreshLine(line));
    line.querySelector('.line-price-input')?.addEventListener('input', () => refreshLine(line));
    line.querySelector('.remove-order-line')?.addEventListener('click', () => {
      line.remove();
      refreshIndexes();
      refreshGrandTotal();
    });
    refreshLine(line);
  };

  Array.from(linesRoot.querySelectorAll('.admin-line-editor')).forEach(wireLine);

  addButton?.addEventListener('click', () => {
    if (!template || !linesRoot) {
      return;
    }

    const index = linesRoot.querySelectorAll('.admin-line-editor').length;
    const html = template.innerHTML.replace(/__INDEX__/g, String(index));
    linesRoot.insertAdjacentHTML('beforeend', html);
    const line = linesRoot.lastElementChild;
    if (line) {
      wireLine(line);
      refreshIndexes();
    }
  });
}
