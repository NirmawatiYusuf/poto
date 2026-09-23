/**
 * app.js — SnapBooth Studio Application Engine
 * Pro Camera Engine: Real-time Filters, Web Audio Feedback, 4-Shot Photobooth Strips, Mobile HTTPS Sync
 */

const App = (() => {
  // ─── Application State ───
  let stream = null;
  let videoEl = null;
  let canvasEl = null;
  let ctx = null;
  let currentFilter = 'normal';
  let isMirrored = true;
  let timerDuration = 0;
  let isCapturing = false;
  let animFrameId = null;
  let capturedItems = [];
  let currentCategory = 'all';
  let captureMode = 'single';
  let isAudioEnabled = true;
  let currentRatio = '4:3';
  let isGridVisible = false;
  let isRingLightActive = false;
  let stripFrameColor = '#ffffff';

  const isBrowser = typeof window !== 'undefined' && typeof location !== 'undefined';
  let localInfo = {
    localIP: isBrowser ? location.hostname : 'localhost',
    httpUrl: isBrowser ? `http://${location.hostname}:3000` : 'http://localhost:3000',
    httpsUrl: isBrowser ? `https://${location.hostname}:3443` : 'https://localhost:3443'
  };

  // Audio Context for synthetic sound FX
  let audioCtx = null;

  // ─── DOM Helpers ───
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ─── Lifecycle Init ───
  async function init() {
    videoEl = $('#camera-video');
    canvasEl = $('#camera-canvas');
    ctx = canvasEl.getContext('2d', { willReadFrequently: true });

    initAudio();
    checkSecurityContext();
    fetchServerInfo();
    bindEvents();
    renderFilterGrid('all');
    updateHudInfo();

    // Auto-attempt camera start so user doesn't need to manually click
    try {
      await startCamera();
    } catch (e) {
      console.log('Camera awaiting user trigger:', e);
    }
  }

  // ─── Check Secure Context for Mobile / Local Network ───
  function checkSecurityContext() {
    const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const isHttps = location.protocol === 'https:';

    // If accessed from another device via IP over HTTP, camera is blocked by browsers
    if (!isLocalhost && !isHttps) {
      const advisory = $('#network-advisory');
      if (advisory) advisory.classList.add('show');
    }
  }

  async function fetchServerInfo() {
    try {
      const res = await fetch('/api/info');
      if (res.ok) {
        localInfo = await res.json();
        const mobileUrlEl = $('#mobile-https-url');
        if (mobileUrlEl) {
          mobileUrlEl.textContent = localInfo.httpsUrl;
        }
      }
    } catch (e) {
      // Fallback to current hostname
      localInfo.httpsUrl = `https://${location.hostname}:3443`;
      const mobileUrlEl = $('#mobile-https-url');
      if (mobileUrlEl) {
        mobileUrlEl.textContent = localInfo.httpsUrl;
      }
    }
  }

  // ─── Web Audio Synthesizer ───
  function initAudio() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    } catch (e) {
      console.warn('Web Audio not available:', e);
    }
  }

  function playSound(type) {
    if (!isAudioEnabled || !audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const t = audioCtx.currentTime;

    if (type === 'tick') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.exponentialRampToValueAtTime(440, t + 0.08);

      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.08);
    } else if (type === 'snap') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, t);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.12);
    } else if (type === 'shutter') {
      const noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.15, audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseBuffer.length; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const noise = audioCtx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, t);
      filter.Q.setValueAtTime(2, t);

      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      noise.start(t);
    }
  }

  // ─── Event Binding ───
  function bindEvents() {
    // Camera start
    $('#btn-start-camera').addEventListener('click', () => startCamera());

    // Shutter Trigger
    $('#btn-shutter').addEventListener('click', triggerCapture);

    // Switch Camera
    $('#btn-switch-camera').addEventListener('click', switchCamera);

    // Mirror Toggle
    $('#btn-mirror').addEventListener('click', toggleMirror);

    // Timer Toggle (Off -> 3s -> 5s -> 10s)
    $('#btn-timer').addEventListener('click', cycleTimer);

    // Aspect Ratio Toggle (4:3 -> 1:1 -> 3:4)
    $('#btn-ratio').addEventListener('click', cycleRatio);

    // Grid Toggle
    $('#btn-grid').addEventListener('click', toggleGrid);

    // Ring Light / Screen Flash
    $('#btn-ring-light').addEventListener('click', toggleRingLight);

    // Audio Mute Toggle
    $('#btn-sound').addEventListener('click', toggleAudio);

    // Mobile HTTPS Modal (Optional local dev)
    const btnMobileModalOpen = $('#btn-mobile-modal-open');
    if (btnMobileModalOpen) {
      btnMobileModalOpen.addEventListener('click', () => {
        const modal = $('#mobile-modal');
        if (modal) modal.classList.add('active');
      });
    }

    const btnMobileModalClose = $('#mobile-modal-close');
    if (btnMobileModalClose) {
      btnMobileModalClose.addEventListener('click', () => {
        const modal = $('#mobile-modal');
        if (modal) modal.classList.remove('active');
      });
    }

    const mobileModal = $('#mobile-modal');
    if (mobileModal) {
      mobileModal.addEventListener('click', (e) => {
        if (e.target === mobileModal) mobileModal.classList.remove('active');
      });
    }

    // Copy Mobile Link
    const btnCopyUrl = $('#btn-copy-mobile-url');
    if (btnCopyUrl) {
      btnCopyUrl.addEventListener('click', () => {
        const urlEl = $('#mobile-https-url');
        if (urlEl) {
          navigator.clipboard.writeText(urlEl.textContent).then(() => {
            const prev = btnCopyUrl.textContent;
            btnCopyUrl.textContent = 'Tersalin!';
            setTimeout(() => { btnCopyUrl.textContent = prev; }, 2000);
          });
        }
      });
    }

    // Secret Admin Access: Triple-click brand logo
    let brandClickCount = 0;
    let brandClickTimer = null;
    const brandEl = $('#app-brand');
    if (brandEl) {
      brandEl.addEventListener('click', () => {
        brandClickCount++;
        clearTimeout(brandClickTimer);
        if (brandClickCount >= 3) {
          brandClickCount = 0;
          window.location.href = '/admin.html';
        } else {
          brandClickTimer = setTimeout(() => { brandClickCount = 0; }, 800);
        }
      });
    }

    // Secret Admin Access: Keyboard shortcut Ctrl + Shift + A
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        window.location.href = '/admin.html';
      }
    });

    // Switch to HTTPS button in advisory bar
    const btnSwitchHttps = $('#btn-switch-https');
    if (btnSwitchHttps) {
      btnSwitchHttps.addEventListener('click', () => {
        location.href = `https://${location.hostname}:3443`;
      });
    }

    // Mode Switcher (Single vs 4-Strip)
    $$('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        captureMode = btn.dataset.mode;
        updateModeUI();
      });
    });

    // Preset Category Tabs
    $$('.category-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.category-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentCategory = tab.dataset.category;
        renderFilterGrid(currentCategory);
      });
    });

    // Modal Close & Cancel
    $('#inspector-close').addEventListener('click', closeInspector);
    const btnModalCancel = $('#btn-modal-cancel');
    if (btnModalCancel) btnModalCancel.addEventListener('click', closeInspector);
    $('#inspector-modal').addEventListener('click', (e) => {
      if (e.target === $('#inspector-modal')) closeInspector();
    });

    // Modal Download
    $('#btn-modal-download').addEventListener('click', () => {
      const activeImg = $('#inspector-img');
      if (activeImg.dataset.downloadUrl) {
        downloadFile(activeImg.dataset.downloadUrl, activeImg.dataset.filename || 'snapbooth-photo.png');
      }
    });

    // Strip Frame Color Selectors in Modal
    $$('.frame-color-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        $$('.frame-color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        stripFrameColor = dot.dataset.color;
        regenerateActiveStrip();
      });
    });

    // Strip Custom Caption Input
    const captionInput = $('#strip-caption-input');
    if (captionInput) {
      captionInput.addEventListener('input', (e) => {
        stripCustomTitle = e.target.value;
        regenerateActiveStrip();
      });
    }

    // Stickers Drawer Toggle
    const btnStickers = $('#btn-stickers');
    if (btnStickers) {
      btnStickers.addEventListener('click', toggleStickersDrawer);
    }

    // Sticker Selection
    $$('.sticker-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        addSticker(btn.dataset.sticker);
      });
    });

    // Clear Stickers
    const btnClearStk = $('#btn-clear-stickers');
    if (btnClearStk) {
      btnClearStk.addEventListener('click', clearAllStickers);
    }

    // Modal GIF Boomerang Export
    const btnModalGif = $('#btn-modal-gif');
    if (btnModalGif) {
      btnModalGif.addEventListener('click', () => {
        const item = capturedItems.find(p => p.id == activeInspectorItemId);
        if (item && item.rawFrames) {
          generateBoomerangGif(item.rawFrames);
        }
      });
    }

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        triggerCapture();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        stepFilter(1);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        stepFilter(-1);
      } else if (e.code === 'KeyM') {
        toggleMirror();
      } else if (e.code === 'KeyG') {
        toggleGrid();
      } else if (e.code === 'Escape') {
        closeInspector();
        $('#mobile-modal').classList.remove('active');
      }
    });
  }

  // ─── Camera Management ───
  let _currentFacing = 'user';

  function stopCamera() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    if (stream) {
      try {
        stream.getTracks().forEach(track => {
          track.stop();
          track.enabled = false;
        });
      } catch (e) {
        console.warn('Error stopping stream tracks:', e);
      }
      stream = null;
    }
    if (videoEl) {
      videoEl.srcObject = null;
    }
  }

  // Ensure webcam hardware lock is released when tab is closed or refreshed
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', stopCamera);
    window.addEventListener('pagehide', stopCamera);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && stream && videoEl && videoEl.paused) {
        videoEl.play().catch(e => console.warn('Auto-resume video play:', e));
      }
    });
  }

  async function startCamera(facingMode = 'user') {
    // Check mediaDevices support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const standby = $('#standby-card');
      if (standby) {
        standby.style.display = 'flex';
        const h3 = standby.querySelector('h3');
        const p = standby.querySelector('#standby-msg');
        if (h3) h3.textContent = 'Kamera Membutuhkan HTTPS';
        if (p) {
          p.innerHTML =
            `Browser memblokir akses webcam di jaringan HTTP (<strong>${location.origin}</strong>).<br/><br/>` +
            `Silakan buka melalui koneksi aman HTTPS:<br/><strong><a href="https://${location.hostname}:3443" style="color:#38bdf8; text-decoration:underline;">https://${location.hostname}:3443</a></strong>`;
        }
      }
      return;
    }

    try {
      // Clean up any previously open tracks
      stopCamera();

      // Multi-stage progressive constraint fallback:
      // Stage 1: Try optimal HD (ideal only, zero strict min constraints)
      // Stage 2: Try basic facingMode
      // Stage 3: Try any video source (works on virtually 100% of devices)
      let newStream = null;
      try {
        // 1280x720 ideal: good quality live preview without stressing USB bandwidth
        newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: facingMode ? { ideal: facingMode } : undefined,
            frameRate: { ideal: 30, max: 30 }
          },
          audio: false
        });
      } catch (err1) {
        console.warn('HD 720p constraint failed, trying basic facingMode:', err1);
        try {
          newStream = await navigator.mediaDevices.getUserMedia({
            video: facingMode ? { facingMode: { ideal: facingMode } } : true,
            audio: false
          });
        } catch (err2) {
          console.warn('FacingMode constraint failed, falling back to any video device:', err2);
          newStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
        }
      }

      stream = newStream;

      // Listen for USB disconnect / track ending (USB selective suspend, cable pull)
      stream.getTracks().forEach(track => {
        track.onended = () => {
          console.warn('Camera track ended (USB disconnect?). Attempting reconnect in 1.5s...');
          stopCamera();
          const standby = $('#standby-card');
          if (standby) {
            standby.style.display = 'flex';
            const h3 = standby.querySelector('h3');
            const p = standby.querySelector('#standby-msg');
            if (h3) h3.textContent = 'Kamera Terputus';
            if (p) p.innerHTML = 'Koneksi kamera terputus. Menyambungkan ulang otomatis...<br/><small>Jika gagal, klik <strong>Mulai Kamera</strong> lagi.</small>';
          }
          setTimeout(() => startCamera(_currentFacing), 1500);
        };
      });

      videoEl.srcObject = stream;
      await videoEl.play();

      // Live preview canvas: cap at 720px wide to match 720p stream (no upscaling needed)
      const maxLiveW = 720;
      const vW = videoEl.videoWidth || 1280;
      const vH = videoEl.videoHeight || 720;
      const scale = Math.min(1, maxLiveW / vW);
      canvasEl.width = Math.round(vW * scale);
      canvasEl.height = Math.round(vH * scale);

      // Hide standby screen
      const standby = $('#standby-card');
      if (standby) standby.style.display = 'none';
      canvasEl.style.display = 'block';
      const shutterBtn = $('#btn-shutter');
      if (shutterBtn) shutterBtn.classList.remove('disabled');

      // Update HUD
      const statusPill = $('.status-pill');
      if (statusPill) {
        statusPill.classList.add('live');
        const stText = statusPill.querySelector('.status-text');
        if (stText) stText.textContent = 'LIVE FEED';
      }
      const resPill = $('.resolution-pill');
      if (resPill) {
        resPill.textContent = `${videoEl.videoWidth}×${videoEl.videoHeight}`;
      }

      startRenderLoop();

      // Refresh filter thumbnails with user's face!
      setTimeout(() => updateCardThumbnails(), 400);
    } catch (err) {
      console.error('Camera initialization failed:', err);
      stopCamera();
      const standby = $('#standby-card');
      if (standby) {
        standby.style.display = 'flex';
        const h3 = standby.querySelector('h3');
        const p = standby.querySelector('#standby-msg');
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          if (h3) h3.textContent = 'Izin Kamera Belum Diberikan';
          if (p) p.innerHTML = 'Peramban memblokir izin webcam. Klik ikon kamera / gembok di address bar, ubah ke <strong>Izinkan / Allow</strong>, lalu muat ulang.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          if (h3) h3.textContent = 'Webcam Tidak Terdeteksi';
          if (p) p.textContent = 'Pastikan kamera webcam internal atau eksternal Anda terpasang.';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          if (h3) h3.textContent = 'Kamera Sedang Digunakan';
          if (p) p.textContent = 'Kamera mungkin sedang digunakan aplikasi lain (Zoom, Teams, OBS, Google Meet). Tutup aplikasi tersebut lalu coba lagi.';
        } else {
          if (h3) h3.textContent = 'Gagal Mengakses Kamera';
          if (p) p.textContent = `Pesan sistem: ${err.name || 'Error'} — ${err.message || 'Silakan cek izin perangkat'}`;
        }
      }
    }
  }

  async function switchCamera() {
    _currentFacing = _currentFacing === 'user' ? 'environment' : 'user';
    await startCamera(_currentFacing);
  }

  // ─── Real-time Render Loop (capped at 30fps to reduce CPU/USB heat) ───
  const TARGET_FPS = 30;
  const FRAME_INTERVAL = 1000 / TARGET_FPS;
  let _lastFrameTime = 0;

  function startRenderLoop() {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    _lastFrameTime = 0;

    function render(timestamp) {
      if (!stream) {
        return; // Terminate loop if camera stopped
      }

      // Throttle to TARGET_FPS — prevents uncapped CPU/USB load
      const elapsed = timestamp - _lastFrameTime;
      if (elapsed < FRAME_INTERVAL) {
        animFrameId = requestAnimationFrame(render);
        return;
      }
      _lastFrameTime = timestamp - (elapsed % FRAME_INTERVAL);

      if (videoEl.readyState < 2) {
        animFrameId = requestAnimationFrame(render);
        return;
      }

      try {
        if (Filters.isCanvasFilter(currentFilter)) {
          // Hardware-accelerated clone / mirror / pixelate / pop-grid
          Filters.applyCanvas(currentFilter, ctx, videoEl, canvasEl.width, canvasEl.height, isMirrored);
        } else if (Filters.isGpuFilter(currentFilter)) {
          // 100% GPU-accelerated path (Direct3D/OpenGL/Metal) — 0 CPU overhead, 0 RAM allocation!
          Filters.applyGpu(currentFilter, ctx, videoEl, canvasEl.width, canvasEl.height, isMirrored);
        } else {
          // Fallback procedural CPU filter flow
          ctx.save();
          if (isMirrored) {
            ctx.translate(canvasEl.width, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
          ctx.restore();

          if (currentFilter !== 'normal') {
            const imageData = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
            const filtered = Filters.apply(currentFilter, imageData);
            ctx.putImageData(filtered, 0, 0);
          }
        }
      } catch (err) {
        console.warn('Render loop frame warning (recovering):', err);
        // Fail-safe: draw plain mirrored video frame so preview NEVER freezes
        try {
          ctx.filter = 'none';
          ctx.save();
          if (isMirrored) {
            ctx.translate(canvasEl.width, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
          ctx.restore();
        } catch (_) {}
      }

      // Safe recovery: ensure loop is always re-scheduled no matter what
      animFrameId = requestAnimationFrame(render);
    }

    animFrameId = requestAnimationFrame(render);
  }

  // ─── Filter Selection & HUD ───
  let _cachedThumbnailBase = null;

  function getThumbnailBase() {
    if (_cachedThumbnailBase) return _cachedThumbnailBase;

    const base = document.createElement('canvas');
    base.width = 80;
    base.height = 56;
    const bCtx = base.getContext('2d', { willReadFrequently: true });

    // Soft studio backdrop
    const bgGrad = bCtx.createLinearGradient(0, 0, 80, 56);
    bgGrad.addColorStop(0, '#334155');
    bgGrad.addColorStop(1, '#0f172a');
    bCtx.fillStyle = bgGrad;
    bCtx.fillRect(0, 0, 80, 56);

    // Shoulders
    bCtx.fillStyle = '#6366f1';
    bCtx.beginPath();
    bCtx.ellipse(40, 58, 28, 14, 0, 0, Math.PI * 2);
    bCtx.fill();

    // Neck
    bCtx.fillStyle = '#fed7aa';
    bCtx.fillRect(36, 30, 8, 10);

    // Face
    bCtx.fillStyle = '#fde047';
    bCtx.beginPath();
    bCtx.ellipse(40, 24, 13, 15, 0, 0, Math.PI * 2);
    bCtx.fill();

    // Hair
    bCtx.fillStyle = '#1e1b4b';
    bCtx.beginPath();
    bCtx.arc(40, 19, 14, Math.PI, 0, false);
    bCtx.fill();

    // Eyes
    bCtx.fillStyle = '#0f172a';
    bCtx.fillRect(35, 23, 3, 3);
    bCtx.fillRect(43, 23, 3, 3);

    // Smile
    bCtx.strokeStyle = '#e11d48';
    bCtx.lineWidth = 1.2;
    bCtx.beginPath();
    bCtx.arc(40, 29, 3.5, 0, Math.PI);
    bCtx.stroke();

    _cachedThumbnailBase = base;
    return base;
  }

  function updateCardThumbnails(filtersList) {
    let sourceBase = getThumbnailBase();
    if (stream && videoEl.videoWidth > 0) {
      const snap = document.createElement('canvas');
      snap.width = 80;
      snap.height = 56;
      const sCtx = snap.getContext('2d', { willReadFrequently: true });
      if (isMirrored) {
        sCtx.translate(80, 0);
        sCtx.scale(-1, 1);
      }
      sCtx.drawImage(videoEl, 0, 0, 80, 56);
      sourceBase = snap;
    }

    const filters = filtersList || Filters.getByCategory(currentCategory);

    filters.forEach(f => {
      const canvas = document.getElementById(`thumb-${f.id}`);
      if (!canvas) return;
      const tCtx = canvas.getContext('2d', { willReadFrequently: true });
      tCtx.clearRect(0, 0, 80, 56);

      try {
        if (Filters.isCanvasFilter(f.id)) {
          Filters.applyCanvas(f.id, tCtx, sourceBase, 80, 56, false);
        } else if (Filters.isGpuFilter(f.id)) {
          Filters.applyGpu(f.id, tCtx, sourceBase, 80, 56, false);
        } else {
          tCtx.drawImage(sourceBase, 0, 0, 80, 56);
          if (f.id !== 'normal') {
            const imgData = tCtx.getImageData(0, 0, 80, 56);
            const filtered = Filters.apply(f.id, imgData);
            tCtx.putImageData(filtered, 0, 0);
          }
        }
      } catch (e) {
        tCtx.drawImage(sourceBase, 0, 0, 80, 56);
      }
    });
  }

  function renderFilterGrid(category) {
    const grid = $('#preset-grid');
    const filters = Filters.getByCategory(category);

    $('#filter-count').textContent = filters.length;

    grid.innerHTML = filters.map(f => `
      <div class="preset-card ${f.id === currentFilter ? 'active' : ''}"
           data-filter="${f.id}"
           id="preset-${f.id}">
        <div class="preset-preview">
          <canvas class="preset-thumb-canvas" id="thumb-${f.id}" width="80" height="56"></canvas>
          <span class="preset-code-badge">${f.code}</span>
        </div>
        <div class="preset-details">
          <span class="preset-name">${f.name}</span>
          <span class="preset-tag">${f.tag}</span>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.preset-card').forEach(card => {
      card.addEventListener('click', () => {
        selectFilter(card.dataset.filter);
      });
    });

    updateCardThumbnails(filters);
  }

  function selectFilter(filterId) {
    currentFilter = filterId;
    $$('.preset-card').forEach(card => {
      card.classList.toggle('active', card.dataset.filter === currentFilter);
    });
    updateHudInfo();
  }

  function stepFilter(direction) {
    const filters = Filters.getByCategory(currentCategory);
    const currentIndex = filters.findIndex(f => f.id === currentFilter);
    let nextIndex = currentIndex + direction;
    if (nextIndex < 0) nextIndex = filters.length - 1;
    if (nextIndex >= filters.length) nextIndex = 0;
    selectFilter(filters[nextIndex].id);

    const activeEl = $(`#preset-${filters[nextIndex].id}`);
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function updateHudInfo() {
    const filter = Filters.getFilter(currentFilter);
    if (!filter) return;

    const badge = $('#hud-preset-badge');
    badge.querySelector('.preset-badge-name').textContent = `${filter.code} • ${filter.name}`;
    badge.querySelector('.preset-swatch-dot').style.background = filter.swatch;
  }

  // ─── Controls & Options ───
  function toggleMirror() {
    isMirrored = !isMirrored;
    $('#btn-mirror').classList.toggle('active', isMirrored);
  }

  function cycleTimer() {
    const durations = [0, 3, 5, 10];
    const currentIndex = durations.indexOf(timerDuration);
    timerDuration = durations[(currentIndex + 1) % durations.length];

    const timerBtn = $('#btn-timer');
    const textEl = timerBtn.querySelector('.console-btn-text');

    if (timerDuration === 0) {
      timerBtn.classList.remove('active');
      textEl.textContent = 'Timer Off';
    } else {
      timerBtn.classList.add('active');
      textEl.textContent = `${timerDuration}s`;
    }
  }

  function cycleRatio() {
    const ratios = ['4:3', '1:1', '3:4', '16:9'];
    const currentIndex = ratios.indexOf(currentRatio);
    currentRatio = ratios[(currentIndex + 1) % ratios.length];

    const frame = $('#viewport-frame');
    frame.classList.remove('ratio-square', 'ratio-portrait', 'ratio-wide');

    if (currentRatio === '1:1') frame.classList.add('ratio-square');
    if (currentRatio === '3:4') frame.classList.add('ratio-portrait');
    if (currentRatio === '16:9') frame.classList.add('ratio-wide');

    $('#btn-ratio .console-btn-text').textContent = currentRatio;
  }

  function toggleGrid() {
    isGridVisible = !isGridVisible;
    $('#composition-grid').classList.toggle('visible', isGridVisible);
    $('#btn-grid').classList.toggle('active', isGridVisible);
  }

  const ringLightModes = ['off', 'white', 'warm', 'neon', 'cyan'];
  let ringLightIndex = 0;

  function toggleRingLight() {
    ringLightIndex = (ringLightIndex + 1) % ringLightModes.length;
    const mode = ringLightModes[ringLightIndex];

    document.body.classList.remove('ring-light-active', 'ring-warm', 'ring-neon', 'ring-cyan');
    const ringBtn = $('#btn-ring-light');

    if (mode === 'off') {
      isRingLightActive = false;
      ringBtn.classList.remove('active');
      ringBtn.title = 'Ring Light Off';
    } else {
      isRingLightActive = true;
      document.body.classList.add('ring-light-active');
      ringBtn.classList.add('active');
      if (mode === 'warm') document.body.classList.add('ring-warm');
      if (mode === 'neon') document.body.classList.add('ring-neon');
      if (mode === 'cyan') document.body.classList.add('ring-cyan');

      const labels = {
        white: 'Ring Light: White Studio',
        warm: 'Ring Light: Warm Sunset',
        neon: 'Ring Light: Neon Cyberpunk',
        cyan: 'Ring Light: Soft Ice Blue'
      };
      ringBtn.title = labels[mode];
    }
  }

  function toggleAudio() {
    isAudioEnabled = !isAudioEnabled;
    const soundBtn = $('#btn-sound');
    soundBtn.classList.toggle('active', !isAudioEnabled);
    soundBtn.title = isAudioEnabled ? 'Mute Sound' : 'Unmute Sound';
  }

  function updateModeUI() {
    const shutter = $('#btn-shutter');
    if (captureMode === 'strip') {
      shutter.classList.add('strip-mode');
      shutter.setAttribute('data-tooltip', 'Ambil 4-Foto Strip');
    } else {
      shutter.classList.remove('strip-mode');
      shutter.setAttribute('data-tooltip', 'Ambil Foto');
    }
  }

  // ─── Capture Flow ───
  async function triggerCapture() {
    if (isCapturing || !stream) return;
    isCapturing = true;

    try {
      if (captureMode === 'single') {
        await executeSingleCapture();
      } else {
        await executeStripCapture();
      }
    } finally {
      isCapturing = false;
    }
  }

  async function executeSingleCapture() {
    if (timerDuration > 0) {
      await runCountdown(timerDuration);
    }
    flashScreen();
    playSound('shutter');

    const frameDataUrl = grabCurrentFrame();
    const item = {
      id: Date.now(),
      type: 'single',
      src: frameDataUrl,
      filter: currentFilter,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    capturedItems.unshift(item);
    renderGallery();

    // Open inspector preview modal with option to download or close
    openInspector(item.id);

    // Sync to PC server
    syncToServer(item.src, 'single', currentFilter);
  }

  async function executeStripCapture() {
    const frames = [];
    const totalShots = 4;

    for (let i = 1; i <= totalShots; i++) {
      const waitTime = timerDuration > 0 ? timerDuration : 3;
      await runCountdown(waitTime, `${i} / ${totalShots}`);
      flashScreen();
      playSound('shutter');
      frames.push(grabCurrentFrame());
      if (i < totalShots) {
        await sleep(600);
      }
    }

    const stripDataUrl = await buildPhotoStrip(frames, stripFrameColor);

    const item = {
      id: Date.now(),
      type: 'strip',
      src: stripDataUrl,
      rawFrames: frames,
      filter: currentFilter,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    capturedItems.unshift(item);
    renderGallery();
    openInspector(item.id);

    // Sync strip to PC server
    syncToServer(item.src, 'strip', currentFilter);
  }

  function runCountdown(seconds, subLabel = '') {
    return new Promise(resolve => {
      const overlay = $('#countdown-overlay');
      const digits = overlay.querySelector('.countdown-digits');
      const progress = overlay.querySelector('.countdown-strip-progress');

      progress.textContent = subLabel;
      overlay.classList.add('active');

      let current = seconds;
      digits.textContent = current;
      playSound('tick');

      const interval = setInterval(() => {
        current--;
        if (current > 0) {
          digits.textContent = current;
          playSound('tick');
        } else {
          clearInterval(interval);
          playSound('snap');
          overlay.classList.remove('active');
          resolve();
        }
      }, 1000);
    });
  }

  function flashScreen() {
    const flashEl = $('#viewport-flash');
    flashEl.classList.remove('flash');
    void flashEl.offsetHeight;
    flashEl.classList.add('flash');
  }

  function grabCurrentFrame() {
    const srcW = canvasEl.width;
    const srcH = canvasEl.height;

    let targetRatio = 4 / 3;
    if (currentRatio === '1:1') targetRatio = 1;
    else if (currentRatio === '3:4') targetRatio = 3 / 4;
    else if (currentRatio === '16:9') targetRatio = 16 / 9;
    else if (currentRatio === '4:3') targetRatio = 4 / 3;

    // Center crop based on selected aspect ratio
    const currentCanvasRatio = srcW / srcH;
    let cropW, cropH, cropX, cropY;

    if (currentCanvasRatio > targetRatio) {
      // Source canvas is wider than target ratio (e.g. 16:9 camera cropped to 4:3, 1:1, 3:4)
      cropH = srcH;
      cropW = Math.round(cropH * targetRatio);
      cropX = Math.round((srcW - cropW) / 2);
      cropY = 0;
    } else {
      // Source canvas is taller than target ratio
      cropW = srcW;
      cropH = Math.round(cropW / targetRatio);
      cropX = 0;
      cropY = Math.round((srcH - cropH) / 2);
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropW;
    tempCanvas.height = cropH;
    const tCtx = tempCanvas.getContext('2d');
    tCtx.drawImage(canvasEl, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    // Bake active stickers onto the captured photo!
    drawStickersOnCanvas(tCtx, cropW, cropH);

    return tempCanvas.toDataURL('image/png', 0.95);
  }

  // ─── 4-Shot Photobooth Strip Generator ───
  // Cover-fit helper: draws image to fill destination without stretching
  function drawImageCover(sCtx, img, dx, dy, dw, dh) {
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    const srcRatio = srcW / srcH;
    const destRatio = dw / dh;
    let sx, sy, sw, sh;
    if (srcRatio > destRatio) {
      sh = srcH;
      sw = sh * destRatio;
      sx = (srcW - sw) / 2;
      sy = 0;
    } else {
      sw = srcW;
      sh = sw / destRatio;
      sx = 0;
      sy = (srcH - sh) / 2;
    }
    // Round corners with clip
    const radius = 8;
    sCtx.save();
    sCtx.beginPath();
    sCtx.moveTo(dx + radius, dy);
    sCtx.lineTo(dx + dw - radius, dy);
    sCtx.quadraticCurveTo(dx + dw, dy, dx + dw, dy + radius);
    sCtx.lineTo(dx + dw, dy + dh - radius);
    sCtx.quadraticCurveTo(dx + dw, dy + dh, dx + dw - radius, dy + dh);
    sCtx.lineTo(dx + radius, dy + dh);
    sCtx.quadraticCurveTo(dx, dy + dh, dx, dy + dh - radius);
    sCtx.lineTo(dx, dy + radius);
    sCtx.quadraticCurveTo(dx, dy, dx + radius, dy);
    sCtx.closePath();
    sCtx.clip();
    sCtx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    sCtx.restore();
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }

  function buildPhotoStrip(frames, frameColor = '#ffffff', customTitle = 'SNAPBOOTH STUDIO') {
    return new Promise(resolve => {
      const stripCanvas = document.createElement('canvas');
      const sCtx = stripCanvas.getContext('2d');

      const isFilm = frameColor === 'film';
      const stripWidth = isFilm ? 640 : 600;
      const padding = isFilm ? 48 : 28;
      const gap = 20;
      const photoWidth = stripWidth - padding * 2;
      const photoHeight = Math.round(photoWidth * (3 / 4));
      const footerHeight = 110;
      const stripHeight = padding * 2 + (photoHeight * 4) + (gap * 3) + footerHeight;

      stripCanvas.width = stripWidth;
      stripCanvas.height = stripHeight;

      if (isFilm) {
        // Film base background
        sCtx.fillStyle = '#0f1115';
        sCtx.fillRect(0, 0, stripWidth, stripHeight);

        // Draw 35mm sprocket holes along left and right borders
        const holeW = 16;
        const holeH = 22;
        const holeRadius = 4;
        const holeSpacing = 36;
        const totalHoles = Math.floor(stripHeight / holeSpacing);

        sCtx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        for (let h = 0; h < totalHoles; h++) {
          const hy = h * holeSpacing + 12;
          drawRoundedRect(sCtx, 12, hy, holeW, holeH, holeRadius);
          drawRoundedRect(sCtx, stripWidth - 12 - holeW, hy, holeW, holeH, holeRadius);
        }

        // Film edge markings
        sCtx.fillStyle = '#f59e0b';
        sCtx.font = '600 10px "JetBrains Mono", monospace';
        sCtx.textAlign = 'left';
        sCtx.fillText('▶ 400TX', 12, stripHeight - 20);
        sCtx.textAlign = 'right';
        sCtx.fillText('KODAK SAFETY FILM ▶', stripWidth - 12, stripHeight - 20);
      } else {
        sCtx.fillStyle = frameColor;
        sCtx.fillRect(0, 0, stripWidth, stripHeight);
      }

      let loaded = 0;
      const images = frames.map(src => {
        const img = new Image();
        img.onload = () => {
          loaded++;
          if (loaded === 4) {
            images.forEach((imgEl, idx) => {
              const y = padding + idx * (photoHeight + gap);
              drawImageCover(sCtx, imgEl, padding, y, photoWidth, photoHeight);
            });

            const isDark = isFilm || frameColor === '#000000' || frameColor === '#161924';
            sCtx.fillStyle = isDark ? '#ffffff' : '#111827';
            sCtx.textAlign = 'center';

            const displayTitle = (customTitle || 'SNAPBOOTH STUDIO').trim().toUpperCase();
            sCtx.font = '700 18px "Plus Jakarta Sans", sans-serif';
            sCtx.letterSpacing = '3px';
            const footerY = stripHeight - 65;
            sCtx.fillText(displayTitle, stripWidth / 2, footerY);

            sCtx.fillStyle = isDark ? '#94a3b8' : '#6b7280';
            sCtx.font = '500 12px "JetBrains Mono", monospace';
            const today = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
            sCtx.fillText(`${today} • PHOTO STRIP #0${Math.floor(Math.random() * 900 + 100)}`, stripWidth / 2, footerY + 24);

            resolve(stripCanvas.toDataURL('image/png', 0.98));
          }
        };
        img.src = src;
        return img;
      });
    });
  }

  // ─── Gallery Tray ───
  function renderGallery() {
    const strip = $('#tray-strip');
    const emptyNotice = $('#tray-empty-notice');

    if (capturedItems.length === 0) {
      strip.style.display = 'none';
      emptyNotice.style.display = 'block';
      return;
    }

    strip.style.display = 'flex';
    emptyNotice.style.display = 'none';

    strip.innerHTML = capturedItems.map(item => `
      <div class="tray-item ${item.type === 'strip' ? 'is-strip' : ''}" data-id="${item.id}">
        <img src="${item.src}" alt="Snapshot" />
        <div class="tray-item-overlay">
          <button class="item-btn btn-view" data-id="${item.id}" title="Inspect">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
          </button>
          <button class="item-btn btn-download" data-id="${item.id}" title="Download">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
          </button>
          <button class="item-btn btn-delete" data-id="${item.id}" title="Delete">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </div>
      </div>
    `).join('');

    strip.querySelectorAll('.btn-view').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openInspector(btn.dataset.id);
      });
    });

    strip.querySelectorAll('.btn-download').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = capturedItems.find(p => p.id == btn.dataset.id);
        if (item) {
          const fname = item.type === 'strip' ? `snapbooth-strip-${item.id}.png` : `snapbooth-photo-${item.id}.png`;
          downloadFile(item.src, fname);
        }
      });
    });

    strip.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        capturedItems = capturedItems.filter(p => p.id != btn.dataset.id);
        renderGallery();
      });
    });

    strip.querySelectorAll('.tray-item').forEach(el => {
      el.addEventListener('click', () => openInspector(el.dataset.id));
    });
  }

  // ─── Modal Inspector ───
  let activeInspectorItemId = null;

  function openInspector(itemId) {
    const item = capturedItems.find(p => p.id == itemId);
    if (!item) return;

    activeInspectorItemId = item.id;
    const modal = $('#inspector-modal');
    const img = $('#inspector-img');
    img.src = item.src;
    img.dataset.downloadUrl = item.src;
    img.dataset.filename = item.type === 'strip' ? `snapbooth-strip-${item.id}.png` : `snapbooth-photo-${item.id}.png`;

    const frameSelector = $('#strip-frame-selector');
    if (frameSelector) {
      frameSelector.style.display = item.type === 'strip' ? 'flex' : 'none';
    }

    const captionWrapper = $('#strip-caption-wrapper');
    if (captionWrapper) {
      captionWrapper.style.display = item.type === 'strip' ? 'flex' : 'none';
    }

    const btnGif = $('#btn-modal-gif');
    if (btnGif) {
      btnGif.style.display = item.type === 'strip' ? 'inline-flex' : 'none';
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  let stripCustomTitle = 'SNAPBOOTH STUDIO';

  async function regenerateActiveStrip() {
    const item = capturedItems.find(p => p.id == activeInspectorItemId);
    if (!item || item.type !== 'strip' || !item.rawFrames) return;

    const newStripUrl = await buildPhotoStrip(item.rawFrames, stripFrameColor, stripCustomTitle);
    item.src = newStripUrl;

    const img = $('#inspector-img');
    img.src = newStripUrl;
    img.dataset.downloadUrl = newStripUrl;

    renderGallery();
  }

  function closeInspector() {
    const modal = $('#inspector-modal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
    activeInspectorItemId = null;
  }

  function downloadFile(dataUrl, filename) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ─── Device Detection ───
  function getDeviceName() {
    const ua = navigator.userAgent;
    if (/iPhone/i.test(ua)) return 'iPhone';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/Android/i.test(ua)) {
      const match = ua.match(/;\s*([^;)]+)\s*Build/i);
      return match ? match[1].trim().slice(0, 20) : 'Android';
    }
    if (/Windows/i.test(ua)) return 'Windows-PC';
    if (/Mac/i.test(ua)) return 'Mac';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'Browser';
  }

  // ─── Sync Photo to Server (saves to PC captures folder) ───
  async function syncToServer(dataUrl, type, filterName) {
    try {
      await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: dataUrl,
          type: type,
          filter: filterName,
          device: getDeviceName()
        })
      });
    } catch (_) {
      // Completely silent background sync
    }
  }

  // ─── Toast Notification ───
  function showSyncToast(message, type = 'success') {
    // Remove existing toast
    const existing = document.querySelector('.sync-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `sync-toast sync-toast-${type}`;
    toast.innerHTML = `
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
        ${type === 'success'
          ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>'
          : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>'
        }
      </svg>
      <span>${message}</span>
    `;
    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => toast.classList.add('visible'));

    // Auto remove
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ═══════════════════════════════════════════
  //  STICKERS & VIRTUAL PROPS
  // ═══════════════════════════════════════════
  let activeStickers = [];
  let isStickersDrawerOpen = false;

  function toggleStickersDrawer() {
    isStickersDrawerOpen = !isStickersDrawerOpen;
    const drawer = $('#stickers-drawer');
    if (drawer) drawer.style.display = isStickersDrawerOpen ? 'block' : 'none';
    const btn = $('#btn-stickers');
    if (btn) btn.classList.toggle('active', isStickersDrawerOpen);
  }

  function addSticker(emoji) {
    const id = 'stk-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const x = 50 + (Math.random() * 20 - 10);
    const y = 38 + (Math.random() * 20 - 10);
    activeStickers.push({ id, emoji, x, y });
    renderStickers();
  }

  function renderStickers() {
    const layer = $('#stickers-layer');
    if (!layer) return;

    layer.innerHTML = activeStickers.map(s => `
      <div class="active-sticker" id="${s.id}" style="left: ${s.x}%; top: ${s.y}%;">
        <span class="sticker-emoji">${s.emoji}</span>
        <button class="sticker-delete" data-id="${s.id}" title="Hapus Stiker">×</button>
      </div>
    `).join('');

    layer.querySelectorAll('.active-sticker').forEach(el => {
      setupStickerDrag(el);
    });

    layer.querySelectorAll('.sticker-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        activeStickers = activeStickers.filter(s => s.id !== btn.dataset.id);
        renderStickers();
      });
    });
  }

  function clearAllStickers() {
    activeStickers = [];
    renderStickers();
  }

  function setupStickerDrag(el) {
    const frame = $('#viewport-frame');
    if (!frame) return;

    function onPointerDown(e) {
      if (e.target.classList.contains('sticker-delete')) return;
      e.preventDefault();
      const pointer = e.touches ? e.touches[0] : e;
      const startX = pointer.clientX;
      const startY = pointer.clientY;

      const rect = frame.getBoundingClientRect();
      const sRect = el.getBoundingClientRect();
      const origX = ((sRect.left + sRect.width / 2 - rect.left) / rect.width) * 100;
      const origY = ((sRect.top + sRect.height / 2 - rect.top) / rect.height) * 100;

      function onPointerMove(moveEvent) {
        const p = moveEvent.touches ? moveEvent.touches[0] : moveEvent;
        const dx = ((p.clientX - startX) / rect.width) * 100;
        const dy = ((p.clientY - startY) / rect.height) * 100;
        const newX = Math.max(5, Math.min(95, origX + dx));
        const newY = Math.max(5, Math.min(95, origY + dy));
        el.style.left = `${newX}%`;
        el.style.top = `${newY}%`;

        const sObj = activeStickers.find(s => s.id === el.id);
        if (sObj) {
          sObj.x = newX;
          sObj.y = newY;
        }
      }

      function onPointerUp() {
        document.removeEventListener('mousemove', onPointerMove);
        document.removeEventListener('mouseup', onPointerUp);
        document.removeEventListener('touchmove', onPointerMove);
        document.removeEventListener('touchend', onPointerUp);
      }

      document.addEventListener('mousemove', onPointerMove);
      document.addEventListener('mouseup', onPointerUp);
      document.addEventListener('touchmove', onPointerMove, { passive: false });
      document.addEventListener('touchend', onPointerUp);
    }

    el.addEventListener('mousedown', onPointerDown);
    el.addEventListener('touchstart', onPointerDown, { passive: false });
  }

  function drawStickersOnCanvas(targetCtx, width, height) {
    if (!activeStickers || activeStickers.length === 0) return;
    targetCtx.save();
    const fontSize = Math.max(34, Math.round(height * 0.1));
    targetCtx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    targetCtx.textAlign = 'center';
    targetCtx.textBaseline = 'middle';
    activeStickers.forEach(s => {
      const px = (s.x / 100) * width;
      const py = (s.y / 100) * height;
      targetCtx.fillText(s.emoji, px, py);
    });
    targetCtx.restore();
  }

  // ═══════════════════════════════════════════
  //  BOOMERANG GIF GENERATOR (GIF89a)
  // ═══════════════════════════════════════════
  function createGif(framesData, width, height, delay = 32) {
    const bytes = [];
    function writeStr(s) { for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i)); }
    function writeByte(b) { bytes.push(b & 0xff); }
    function writeWord(w) { bytes.push(w & 0xff, (w >> 8) & 0xff); }

    writeStr('GIF89a');
    writeWord(width);
    writeWord(height);
    writeByte(0xf7); // Global Color Table Flag (256 colors)
    writeByte(0);
    writeByte(0);

    // 256 Color Palette (6x6x6 color cube + 40 grays)
    for (let r = 0; r < 6; r++) {
      for (let g = 0; g < 6; g++) {
        for (let b = 0; b < 6; b++) {
          writeByte(Math.round(r * 51));
          writeByte(Math.round(g * 51));
          writeByte(Math.round(b * 51));
        }
      }
    }
    for (let i = 0; i < 40; i++) {
      const v = Math.round((i / 39) * 255);
      writeByte(v); writeByte(v); writeByte(v);
    }

    // Netscape Application Block for Looping
    writeByte(0x21); writeByte(0xff); writeByte(0x0b);
    writeStr('NETSCAPE2.0');
    writeByte(0x03); writeByte(0x01); writeWord(0); writeByte(0x00);

    framesData.forEach(imgData => {
      // Graphic Control Extension
      writeByte(0x21); writeByte(0xf9); writeByte(0x04);
      writeByte(0x00);
      writeWord(delay);
      writeByte(0);
      writeByte(0x00);

      // Image Descriptor
      writeByte(0x2c);
      writeWord(0); writeWord(0);
      writeWord(width); writeWord(height);
      writeByte(0x00);

      const pixels = new Uint8Array(width * height);
      const d = imgData.data;
      for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        const r = Math.min(5, Math.round(d[i] / 51));
        const g = Math.min(5, Math.round(d[i+1] / 51));
        const b = Math.min(5, Math.round(d[i+2] / 51));
        pixels[p] = r * 36 + g * 6 + b;
      }

      const minCodeSize = 8;
      writeByte(minCodeSize);
      const clearCode = 1 << minCodeSize;
      const eoiCode = clearCode + 1;

      const subBlock = [];
      function flushSubBlock() {
        if (subBlock.length > 0) {
          writeByte(subBlock.length);
          for (let b of subBlock) writeByte(b);
          subBlock.length = 0;
        }
      }

      let curBits = 0;
      let curVal = 0;
      let codeSize = minCodeSize + 1;

      function writeCode(c) {
        curVal |= (c << curBits);
        curBits += codeSize;
        while (curBits >= 8) {
          subBlock.push(curVal & 0xff);
          curVal >>= 8;
          curBits -= 8;
          if (subBlock.length === 254) flushSubBlock();
        }
      }

      writeCode(clearCode);
      for (let p = 0; p < pixels.length; p++) {
        writeCode(pixels[p]);
      }
      writeCode(eoiCode);

      if (curBits > 0) subBlock.push(curVal & 0xff);
      flushSubBlock();
      writeByte(0x00);
    });

    writeByte(0x3b);
    return new Uint8Array(bytes);
  }

  async function generateBoomerangGif(frames) {
    showSyncToast('Membuat GIF Boomerang...', 'success');
    const gifW = 360;
    const gifH = 270;
    const gCanvas = document.createElement('canvas');
    gCanvas.width = gifW;
    gCanvas.height = gifH;
    const gCtx = gCanvas.getContext('2d');

    // Boomerang sequence: 0 -> 1 -> 2 -> 3 -> 2 -> 1
    const seqIndices = [0, 1, 2, 3, 2, 1];
    const loadedImages = await Promise.all(frames.map(src => {
      return new Promise(res => {
        const img = new Image();
        img.onload = () => res(img);
        img.src = src;
      });
    }));

    const framesImageData = seqIndices.map(idx => {
      const img = loadedImages[idx];
      gCtx.clearRect(0, 0, gifW, gifH);
      drawImageCover(gCtx, img, 0, 0, gifW, gifH);
      return gCtx.getImageData(0, 0, gifW, gifH);
    });

    const gifBytes = createGif(framesImageData, gifW, gifH, 30);
    const blob = new Blob([gifBytes], { type: 'image/gif' });
    const url = URL.createObjectURL(blob);
    downloadFile(url, `snapbooth-boomerang-${Date.now()}.gif`);
    showSyncToast('GIF Boomerang berhasil diunduh!', 'success');
  }

  return { init };
})();

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', App.init);
}
