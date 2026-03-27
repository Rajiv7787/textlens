/* ============================================================
   TextLens OCR — script.js
   Full client-side OCR using Tesseract.js
   ============================================================ */

(function () {
  'use strict';

  /* ── DOM references ── */
  const dropZone        = document.getElementById('drop-zone');
  const fileInput       = document.getElementById('file-input');
  const previewCont     = document.getElementById('preview-container');
  const imagePreview    = document.getElementById('image-preview');
  const ocrBtn          = document.getElementById('ocr-btn');
  const clearBtn        = document.getElementById('clear-btn');
  const outputBox       = document.getElementById('output-box');
  const copyBtn         = document.getElementById('copy-btn');
  const downloadBtn     = document.getElementById('download-btn');
  const progressWrap    = document.getElementById('progress-wrap');
  const progressFill    = document.getElementById('progress-fill');
  const progressPct     = document.getElementById('progress-pct');
  const progressMsg     = document.getElementById('progress-msg');
  const errorBanner     = document.getElementById('error-banner');
  const errorText       = document.getElementById('error-text');
  const outputPlaceholder = document.getElementById('output-placeholder');
  const charCount       = document.getElementById('char-count');
  const wordCount       = document.getElementById('word-count');
  const themeToggle     = document.getElementById('theme-toggle');
  const themeIcon       = document.getElementById('theme-icon');
  const hamburger       = document.getElementById('hamburger');
  const mobileNav       = document.getElementById('mobile-nav');

  /* ── State ── */
  let currentFile  = null;
  let isProcessing = false;
  const MAX_SIZE   = 10 * 1024 * 1024; // 10 MB
  const ALLOWED    = ['image/jpeg', 'image/png', 'image/webp'];

  /* ============================================================
     THEME MANAGEMENT
     ============================================================ */
  const savedTheme = localStorage.getItem('tl-theme') || 'dark';
  applyTheme(savedTheme);

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next    = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem('tl-theme', next);
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (themeIcon) {
      themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
  }

  /* ============================================================
     NAVIGATION
     ============================================================ */
  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', () => {
      mobileNav.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!hamburger.contains(e.target) && !mobileNav.contains(e.target)) {
        mobileNav.classList.remove('open');
      }
    });
  }

  /* Mark active nav link */
  const currentPage = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a, .mobile-nav a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      a.classList.add('active');
    }
  });

  /* ============================================================
     FAQ ACCORDION
     ============================================================ */
  document.querySelectorAll('.faq-item').forEach(item => {
    const btn = item.querySelector('.faq-q');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      // Close all
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });

  /* ============================================================
     FILE HANDLING
     ============================================================ */
  if (!dropZone) return; // Only run OCR logic on index.html

  // Click on drop zone → trigger file input
  dropZone.addEventListener('click', (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      handleFile(fileInput.files[0]);
    }
  });

  // Drag & Drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', (e) => {
    if (!dropZone.contains(e.relatedTarget)) {
      dropZone.classList.remove('drag-over');
    }
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  // Ctrl+V paste
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) handleFile(file);
        break;
      }
    }
  });

  /* ── Validate & load file ── */
  function handleFile(file) {
    hideError();

    if (!ALLOWED.includes(file.type)) {
      showError('Unsupported format. Please upload JPG, PNG, or WEBP images.');
      return;
    }

    if (file.size > MAX_SIZE) {
      showError(`File too large. Maximum allowed size is 10 MB. Your file is ${formatBytes(file.size)}.`);
      return;
    }

    currentFile = file;

    const reader = new FileReader();
    reader.onload = (ev) => {
      imagePreview.src = ev.target.result;
      imagePreview.alt = `Uploaded image: ${file.name}`;
      showPreview();
    };
    reader.readAsDataURL(file);

    resetOutput();
  }

  function showPreview() {
    const defaultContent = document.getElementById('drop-default');
    if (defaultContent) defaultContent.style.display = 'none';
    previewCont.classList.add('visible');
    dropZone.classList.add('has-image');
    ocrBtn.disabled = false;
  }

  /* ============================================================
     OCR PROCESSING
     ============================================================ */
  if (ocrBtn) {
    ocrBtn.addEventListener('click', runOCR);
  }

  async function runOCR() {
    if (!currentFile || isProcessing) return;
    isProcessing = true;

    hideError();
    showProgress();
    setOcrBtnState(true);

    try {
      // Dynamic import of Tesseract from CDN
      const { createWorker } = Tesseract;

      updateProgress(5, 'Loading OCR engine…');

      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            const pct = Math.round(m.progress * 100);
            updateProgress(10 + pct * 0.88, `Recognizing text… ${pct}%`);
          } else if (m.status === 'loading tesseract core') {
            updateProgress(8, 'Loading Tesseract core…');
          } else if (m.status === 'initializing tesseract') {
            updateProgress(12, 'Initializing engine…');
          } else if (m.status === 'loading language traineddata') {
            updateProgress(18, 'Loading language data…');
          } else if (m.status === 'initializing api') {
            updateProgress(25, 'Starting OCR API…');
          }
        }
      });

      updateProgress(30, 'Analyzing image…');

      const { data: { text, confidence } } = await worker.recognize(currentFile);

      updateProgress(100, 'Done!');

      await worker.terminate();

      setTimeout(() => {
        hideProgress();
        displayResult(text, confidence);
        isProcessing = false;
        setOcrBtnState(false);
      }, 500);

    } catch (err) {
      console.error('OCR Error:', err);
      hideProgress();
      showError('OCR processing failed. Please try again with a clearer image.');
      isProcessing = false;
      setOcrBtnState(false);
    }
  }

  function displayResult(text, confidence) {
    const trimmed = text.trim();

    if (!trimmed) {
      showError('No text detected. Try a clearer image with visible text.');
      return;
    }

    if (outputPlaceholder) outputPlaceholder.style.display = 'none';
    outputBox.style.display = 'block';
    outputBox.textContent   = trimmed;

    // Stats
    const chars = trimmed.length;
    const words = trimmed.split(/\s+/).filter(Boolean).length;
    if (charCount) charCount.textContent = `${chars.toLocaleString()} chars`;
    if (wordCount)  wordCount.textContent  = `${words.toLocaleString()} words`;

    // Enable action buttons
    if (copyBtn)     copyBtn.disabled     = false;
    if (downloadBtn) downloadBtn.disabled = false;

    showToast('✅', `Text extracted successfully! Confidence: ${Math.round(confidence)}%`, 'success');
  }

  /* ============================================================
     ACTIONS
     ============================================================ */
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const text = outputBox.textContent.trim();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        showToast('📋', 'Text copied to clipboard!', 'success');
      } catch {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity  = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('📋', 'Text copied!', 'success');
      }
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const text = outputBox.textContent.trim();
      if (!text) return;
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'extracted-text.txt';
      a.click();
      URL.revokeObjectURL(url);
      showToast('💾', 'Text downloaded as .txt file!', 'success');
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', resetAll);
  }

  /* ============================================================
     PROGRESS UI
     ============================================================ */
  function showProgress() {
    if (progressWrap) progressWrap.classList.add('visible');
    updateProgress(2, 'Preparing…');
  }

  function hideProgress() {
    if (progressWrap) progressWrap.classList.remove('visible');
  }

  function updateProgress(pct, msg) {
    if (progressFill) progressFill.style.width = pct + '%';
    if (progressPct)  progressPct.textContent   = Math.round(pct) + '%';
    if (progressMsg)  progressMsg.textContent   = msg;
  }

  /* ============================================================
     ERROR UI
     ============================================================ */
  function showError(msg) {
    if (errorBanner && errorText) {
      errorText.textContent = msg;
      errorBanner.classList.add('visible');
    }
    showToast('⚠️', msg, 'error');
  }

  function hideError() {
    if (errorBanner) errorBanner.classList.remove('visible');
  }

  /* ============================================================
     RESET
     ============================================================ */
  function resetOutput() {
    outputBox.textContent   = '';
    outputBox.style.display = 'none';
    if (outputPlaceholder) outputPlaceholder.style.display = 'flex';
    if (charCount) charCount.textContent = '0 chars';
    if (wordCount)  wordCount.textContent  = '0 words';
    if (copyBtn)     copyBtn.disabled     = true;
    if (downloadBtn) downloadBtn.disabled = true;
    hideError();
    hideProgress();
  }

  function resetAll() {
    currentFile = null;
    fileInput.value = '';
    imagePreview.src = '';
    previewCont.classList.remove('visible');
    dropZone.classList.remove('has-image');
    const defaultContent = document.getElementById('drop-default');
    if (defaultContent) defaultContent.style.display = '';
    ocrBtn.disabled = true;
    isProcessing    = false;
    setOcrBtnState(false);
    resetOutput();
    showToast('🔄', 'Cleared! Ready for a new image.', 'success');
  }

  /* ============================================================
     OCR BTN STATE
     ============================================================ */
  function setOcrBtnState(loading) {
    if (!ocrBtn) return;
    if (loading) {
      ocrBtn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-color:rgba(0,0,0,0.2);border-top-color:#0d1a17"></span> Processing…';
      ocrBtn.disabled = true;
    } else {
      ocrBtn.innerHTML = '🔍 Extract Text';
      ocrBtn.disabled = !currentFile;
    }
  }

  /* ============================================================
     TOAST
     ============================================================ */
  function showToast(icon, msg, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.querySelector('.toast-icon').textContent = icon;
    toast.querySelector('.toast-msg').textContent  = msg;
    toast.className = `toast ${type}`;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3500);
  }

  /* ============================================================
     CONTACT FORM
     ============================================================ */
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name    = contactForm.querySelector('#cf-name').value.trim();
      const email   = contactForm.querySelector('#cf-email').value.trim();
      const message = contactForm.querySelector('#cf-message').value.trim();

      if (!name || !email || !message) {
        showContactMsg('Please fill in all required fields.', 'error');
        return;
      }

      if (!isValidEmail(email)) {
        showContactMsg('Please enter a valid email address.', 'error');
        return;
      }

      // Simulate submission (no backend)
      const submitBtn = contactForm.querySelector('.submit-btn');
      submitBtn.disabled  = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Sending…';

      setTimeout(() => {
        contactForm.reset();
        submitBtn.disabled  = false;
        submitBtn.innerHTML = '✉️ Send Message';
        showContactMsg('Thank you! Your message has been received. We\'ll get back to you shortly.', 'success');
      }, 1600);
    });
  }

  function showContactMsg(msg, type) {
    const el = document.getElementById('contact-feedback');
    if (!el) return;
    el.textContent = msg;
    el.className   = `contact-feedback ${type}`;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 5000);
  }

  function isValidEmail(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  }

  /* ============================================================
     UTILS
     ============================================================ */
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

})();
