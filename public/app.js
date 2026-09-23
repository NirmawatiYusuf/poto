/**
 * app.js — SnapBooth Studio Application Engine
 * Pro Camera Engine: Real-time Filters, Web Audio Feedback, Frame-Driven Photostrips, Mobile HTTPS Sync
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
  
  // Audio Voice & Sound Modes
  const AUDIO_MODES = [
    { id: 'voice-id', name: 'Suara Indonesia', icon: '🗣️' },
    { id: 'voice-en', name: 'Voice English',   icon: '🌐' },
    { id: 'chime',    name: 'Arcade Chime',    icon: '🎵' },
    { id: 'beep',     name: 'Beep Klasik',     icon: '🔔' },
    { id: 'mute',     name: 'Hening',          icon: '🔇' }
  ];
  let currentAudioModeIndex = 0;
  let currentStripFrames = []; // Holds 4 frames for review & live retake
  let countdownRecordedFrames = []; // ImageData frames recorded during countdown for GIF
  let allStripCountdownFrames = []; // Accumulated countdown frames across strip shots
  let _gifRecordCanvas = null;
  let _gifRecordCtx = null;
  let deferredPwaPrompt = null;

  let currentRatio = '4:3';
  let isGridVisible = false;
  let isRingLightActive = false;
  let stripFrameColor = '#ffffff';

  // ─── Strip Templates & Chroma Key Custom Presets ───
  const DEFAULT_TEMPLATES = [
    {
      id: 'denim-scrapbook',
      name: 'Denim Scrapbook',
      type: 'png-overlay',
      src: '/templates/frame-denim.png',
      totalShots: 4,
      desc: '4 Foto • Tekstur Jeans, Robekan Kertas & Stiker',
      preview: '/templates/frame-denim.png'
    },
    {
      id: 'classic-white',
      name: 'Classic White',
      type: 'preset-color',
      color: '#ffffff',
      totalShots: 4,
      desc: '4 Foto • Strip Putih Minimalis & Elegan'
    },
    {
      id: 'film-noir',
      name: 'Vintage 35mm Film',
      type: 'preset-color',
      color: 'film',
      totalShots: 4,
      desc: '4 Foto • Lubang Sprocket 35mm Hitam Klasik'
    },
    {
      id: 'pastel-peach',
      name: 'Pastel Dream',
      type: 'preset-color',
      color: '#fed7aa',
      totalShots: 3,
      desc: '3 Foto • Soft Peach Pastel Estetik'
    }
  ];

  let customTemplates = [];
  let activeTemplateId = 'denim-scrapbook';
  let hasChosenFrame = false;
  let isAwaitingFrameCapture = false;
  let scannedUploadTemplate = null;
  const _templateCache = {};

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
    updateAudioButtonUI();
    loadCustomTemplates();
    initFrameSelector();
    checkSecurityContext();
    fetchServerInfo();
    bindEvents();
    renderFilterGrid('all');
    updateHudInfo();

    // Ask for camera access only after the visitor chooses to start the camera.
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

  function speakVoice(text, lang = 'id-ID') {
    const mode = AUDIO_MODES[currentAudioModeIndex].id;
    if (mode === 'mute' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang;
      utter.rate = 1.15;
      utter.pitch = 1.1;
      utter.volume = 1.0;
      window.speechSynthesis.speak(utter);
    } catch (_) {}
  }

  function playChime(freq, duration = 0.16) {
    const mode = AUDIO_MODES[currentAudioModeIndex].id;
    if (!audioCtx || mode === 'mute') return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    try {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + duration);
    } catch (_) {}
  }

  function playSound(type) {
    const mode = AUDIO_MODES[currentAudioModeIndex].id;
    if (mode === 'mute' || !audioCtx) return;
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

      gain.gain.setValueAtTime(0.12, t);
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
      gain.gain.setValueAtTime(0.18, t);
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

    // Audio Sound Mode Cycle
    $('#btn-sound').addEventListener('click', cycleAudioMode);

    // Strip Review & Live Retake Actions
    const btnRetakeAll = $('#btn-retake-all');
    if (btnRetakeAll) {
      btnRetakeAll.addEventListener('click', () => {
        closeStripReviewModal();
        triggerCapture();
      });
    }

    const btnStripConfirm = $('#btn-strip-confirm');
    if (btnStripConfirm) {
      btnStripConfirm.addEventListener('click', finalizeStripCapture);
    }

    // PWA Install Prompt Handler
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPwaPrompt = e;
      const btnInstall = $('#btn-pwa-install');
      if (btnInstall) {
        btnInstall.style.display = 'inline-flex';
        btnInstall.addEventListener('click', async () => {
          if (deferredPwaPrompt) {
            deferredPwaPrompt.prompt();
            const { outcome } = await deferredPwaPrompt.userChoice;
            if (outcome === 'accepted') {
              btnInstall.style.display = 'none';
            }
            deferredPwaPrompt = null;
          }
        });
      }
    });

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

    // Mode Switcher (Single vs Photostrip)
    $$('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        captureMode = btn.dataset.mode;
        updateModeUI();
        if (captureMode === 'strip') {
          openFrameSelectorModal(false);
        }
      });
    });

    // Frame Selector Console Button
    const btnFrameSelect = $('#btn-frame-select');
    if (btnFrameSelect) {
      btnFrameSelect.addEventListener('click', () => openFrameSelectorModal(false));
    }

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

    // Modal Countdown Video Download
    const btnCountdownGif = $('#btn-modal-countdown-gif');
    if (btnCountdownGif) {
      btnCountdownGif.addEventListener('click', () => {
        const item = capturedItems.find(p => p.id == activeInspectorItemId);
        if (item && item.countdownVideoUrl) {
          downloadFile(item.countdownVideoUrl, `snapbooth-countdown-${item.id}.${item.countdownVideoExt || 'webm'}`);
        }
      });
    }

    // Modal Boomerang Video Download
    const btnModalGif = $('#btn-modal-gif');
    if (btnModalGif) {
      btnModalGif.addEventListener('click', () => {
        const item = capturedItems.find(p => p.id == activeInspectorItemId);
        if (item && item.boomerangVideoUrl) {
          downloadFile(item.boomerangVideoUrl, `snapbooth-boomerang-${item.id}.${item.boomerangVideoExt || 'webm'}`);
        } else if (item && item.rawFrames) {
          generateBoomerangVideo(item.rawFrames);
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

  const THUMB_W = 160;
  const THUMB_H = 112;

  function getThumbnailBase() {
    if (_cachedThumbnailBase) return _cachedThumbnailBase;

    const base = document.createElement('canvas');
    base.width = THUMB_W;
    base.height = THUMB_H;
    const bCtx = base.getContext('2d', { willReadFrequently: true });
    bCtx.scale(2, 2);

    // A crisp illustrated portrait gives every filter a readable preview
    // before the visitor grants camera access.
    const bgGrad = bCtx.createLinearGradient(0, 0, 80, 56);
    bgGrad.addColorStop(0, '#f4b67a');
    bgGrad.addColorStop(0.55, '#bc7183');
    bgGrad.addColorStop(1, '#514b78');
    bCtx.fillStyle = bgGrad;
    bCtx.fillRect(0, 0, 80, 56);

    // Offset arch and a little afternoon sun, like a printed portrait card.
    bCtx.fillStyle = 'rgba(255,246,211,.28)';
    bCtx.beginPath();
    bCtx.roundRect(10, 5, 60, 54, 28, 28, 4, 4);
    bCtx.fill();
    bCtx.fillStyle = 'rgba(255,229,135,.9)';
    bCtx.beginPath();
    bCtx.arc(59, 15, 9, 0, Math.PI * 2);
    bCtx.fill();

    // Jacket and neck
    bCtx.fillStyle = '#334d64';
    bCtx.beginPath();
    bCtx.moveTo(15, 57);
    bCtx.quadraticCurveTo(19, 40, 32, 38);
    bCtx.lineTo(48, 38);
    bCtx.quadraticCurveTo(63, 41, 67, 57);
    bCtx.closePath();
    bCtx.fill();
    bCtx.fillStyle = '#ed8d72';
    bCtx.beginPath();
    bCtx.moveTo(35, 34);
    bCtx.lineTo(45, 34);
    bCtx.lineTo(47, 43);
    bCtx.quadraticCurveTo(40, 49, 33, 43);
    bCtx.closePath();
    bCtx.fill();

    // Face with soft cheek light
    bCtx.fillStyle = '#f3bd91';
    bCtx.beginPath();
    bCtx.moveTo(28, 19);
    bCtx.quadraticCurveTo(29, 8, 40, 8);
    bCtx.quadraticCurveTo(53, 8, 52, 23);
    bCtx.lineTo(49, 33);
    bCtx.quadraticCurveTo(40, 42, 31, 33);
    bCtx.closePath();
    bCtx.fill();

    // Swept fringe, tucked behind the ear
    bCtx.fillStyle = '#293246';
    bCtx.beginPath();
    bCtx.moveTo(27, 22);
    bCtx.quadraticCurveTo(24, 6, 39, 5);
    bCtx.quadraticCurveTo(54, 5, 54, 18);
    bCtx.quadraticCurveTo(47, 13, 40, 15);
    bCtx.quadraticCurveTo(34, 15, 27, 22);
    bCtx.closePath();
    bCtx.fill();
    bCtx.beginPath();
    bCtx.moveTo(27, 16);
    bCtx.quadraticCurveTo(23, 31, 30, 36);
    bCtx.quadraticCurveTo(27, 25, 33, 20);
    bCtx.fill();

    // Eyebrows, eyes, nose and a tiny crooked smile
    bCtx.strokeStyle = '#503d47';
    bCtx.lineWidth = 1.1;
    bCtx.lineCap = 'round';
    bCtx.beginPath();
    bCtx.moveTo(33, 22); bCtx.lineTo(37, 21.5);
    bCtx.moveTo(43, 21.5); bCtx.lineTo(47, 22.2);
    bCtx.stroke();
    bCtx.fillStyle = '#282d39';
    bCtx.beginPath(); bCtx.ellipse(35, 24, 1, 1.35, 0, 0, Math.PI * 2); bCtx.fill();
    bCtx.beginPath(); bCtx.ellipse(45, 24, 1, 1.35, 0, 0, Math.PI * 2); bCtx.fill();
    bCtx.strokeStyle = 'rgba(142,83,75,.65)';
    bCtx.beginPath(); bCtx.moveTo(40, 24); bCtx.lineTo(39, 28); bCtx.stroke();
    bCtx.strokeStyle = '#a64f61';
    bCtx.lineWidth = 1.4;
    bCtx.beginPath(); bCtx.moveTo(37, 32); bCtx.quadraticCurveTo(41, 35, 44, 31.5); bCtx.stroke();
    bCtx.fillStyle = 'rgba(225,111,112,.35)';
    bCtx.beginPath(); bCtx.ellipse(33, 28, 3, 1.5, 0, 0, Math.PI * 2); bCtx.fill();
    bCtx.beginPath(); bCtx.ellipse(47, 28, 3, 1.5, 0, 0, Math.PI * 2); bCtx.fill();

    // Simple jacket seam and deterministic paper grain
    bCtx.strokeStyle = 'rgba(246,206,160,.75)';
    bCtx.lineWidth = .8;
    bCtx.beginPath(); bCtx.moveTo(40, 44); bCtx.lineTo(40, 56); bCtx.stroke();
    let grain = 17;
    for (let i = 0; i < 90; i++) {
      grain = (grain * 9301 + 49297) % 233280;
      const x = (grain / 233280) * 80;
      grain = (grain * 9301 + 49297) % 233280;
      const y = (grain / 233280) * 56;
      bCtx.fillStyle = i % 2 ? 'rgba(255,255,255,.12)' : 'rgba(35,28,47,.09)';
      bCtx.fillRect(x, y, .45, .45);
    }

    _cachedThumbnailBase = base;
    return base;
  }

  function updateCardThumbnails(filtersList) {
    let sourceBase = getThumbnailBase();
    if (stream && videoEl.videoWidth > 0) {
      const snap = document.createElement('canvas');
      snap.width = THUMB_W;
      snap.height = THUMB_H;
      const sCtx = snap.getContext('2d', { willReadFrequently: true });
      if (isMirrored) {
        sCtx.translate(THUMB_W, 0);
        sCtx.scale(-1, 1);
      }
      sCtx.drawImage(videoEl, 0, 0, THUMB_W, THUMB_H);
      sourceBase = snap;
    }

    const filters = filtersList || Filters.getByCategory(currentCategory);

    filters.forEach(f => {
      const canvas = document.getElementById(`thumb-${f.id}`);
      if (!canvas) return;
      const tCtx = canvas.getContext('2d', { willReadFrequently: true });
      tCtx.clearRect(0, 0, THUMB_W, THUMB_H);

      try {
        if (Filters.isCanvasFilter(f.id)) {
          Filters.applyCanvas(f.id, tCtx, sourceBase, THUMB_W, THUMB_H, false);
        } else if (Filters.isGpuFilter(f.id)) {
          Filters.applyGpu(f.id, tCtx, sourceBase, THUMB_W, THUMB_H, false);
        } else {
          tCtx.drawImage(sourceBase, 0, 0, THUMB_W, THUMB_H);
          if (f.id !== 'normal') {
            const imgData = tCtx.getImageData(0, 0, THUMB_W, THUMB_H);
            const filtered = Filters.apply(f.id, imgData);
            tCtx.putImageData(filtered, 0, 0);
          }
        }
      } catch (e) {
        tCtx.drawImage(sourceBase, 0, 0, THUMB_W, THUMB_H);
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
          <canvas class="preset-thumb-canvas" id="thumb-${f.id}" width="${THUMB_W}" height="${THUMB_H}"></canvas>
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

  function cycleAudioMode() {
    currentAudioModeIndex = (currentAudioModeIndex + 1) % AUDIO_MODES.length;
    updateAudioButtonUI();
    const mode = AUDIO_MODES[currentAudioModeIndex];
    if (mode.id === 'voice-id') speakVoice('Senyum!', 'id-ID');
    else if (mode.id === 'voice-en') speakVoice('Smile!', 'en-US');
    else if (mode.id === 'chime') playChime(784, 0.25);
    else if (mode.id === 'beep') playSound('tick');
  }

  function updateAudioButtonUI() {
    const soundBtn = $('#btn-sound');
    if (!soundBtn) return;
    const mode = AUDIO_MODES[currentAudioModeIndex];
    soundBtn.classList.toggle('active', mode.id !== 'mute');
    soundBtn.title = `Suara: ${mode.name} (Klik untuk ganti)`;
    
    let badge = soundBtn.querySelector('.audio-mode-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'audio-mode-badge';
      soundBtn.appendChild(badge);
    }
    badge.textContent = mode.icon;
  }

  // ─── Custom Template & Chroma Key Scanner Engine ───
  function scanChromaKeySlots(imgOrCanvas) {
    const canvas = document.createElement('canvas');
    canvas.width = imgOrCanvas.naturalWidth || imgOrCanvas.width;
    canvas.height = imgOrCanvas.naturalHeight || imgOrCanvas.height;
    const sCtx = canvas.getContext('2d', { willReadFrequently: true });
    sCtx.drawImage(imgOrCanvas, 0, 0);

    const imgData = sCtx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const width = canvas.width;
    const height = canvas.height;

    const mask = new Uint8Array(width * height);
    let totalChroma = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a < 120) continue;

      // Pure Magenta (#FF00FF / Pink Stabilo)
      const isMagenta = (r > 185 && b > 185 && g < 80);
      // Neon Green (#00FF00 / Chroma Green)
      const isGreen = (g > 185 && r < 80 && b < 80);
      // Bright Solid Red (#FE2623 / #FF0000)
      const isRed = (r > 200 && g < 70 && b < 70);

      if (isMagenta || isGreen || isRed) {
        mask[i / 4] = 1;
        totalChroma++;
      }
    }

    if (totalChroma < 400) {
      return { slots: [], canvasWithHoles: canvas, width, height };
    }

    const visited = new Uint8Array(width * height);
    const blobs = [];
    const minBlobSize = Math.max(1000, Math.round((width * height) * 0.003));
    const step = 4;

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const idx = y * width + x;
        if (mask[idx] === 1 && !visited[idx]) {
          let minX = x, maxX = x, minY = y, maxY = y;
          let count = 0;
          const queue = [idx];
          visited[idx] = 1;

          while (queue.length > 0) {
            const curr = queue.pop();
            const cx = curr % width;
            const cy = Math.floor(curr / width);
            count++;

            if (cx < minX) minX = cx;
            if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy;
            if (cy > maxY) maxY = cy;

            const neighbors = [
              (cy > 0) ? curr - width : -1,
              (cy < height - 1) ? curr + width : -1,
              (cx > 0) ? curr - 1 : -1,
              (cx < width - 1) ? curr + 1 : -1
            ];

            for (let n = 0; n < neighbors.length; n++) {
              const ni = neighbors[n];
              if (ni !== -1 && mask[ni] === 1 && !visited[ni]) {
                visited[ni] = 1;
                queue.push(ni);
              }
            }
          }

          if (count >= minBlobSize) {
            const bw = maxX - minX + 1;
            const bh = maxY - minY + 1;
            if (bw > width * 0.12 && bh > height * 0.04) {
              blobs.push({
                x: minX,
                y: minY,
                width: bw,
                height: bh,
                pixelCount: count
              });
            }
          }
        }
      }
    }

    // Sort vertically from top to bottom
    blobs.sort((a, b) => a.y - b.y);

    // Erase chroma pixels on canvas to make holes transparent
    for (let i = 0; i < data.length; i += 4) {
      if (mask[i / 4] === 1) {
        data[i + 3] = 0;
      }
    }
    sCtx.putImageData(imgData, 0, 0);

    return {
      slots: blobs,
      canvasWithHoles: canvas,
      width,
      height
    };
  }

  function drawScannerPreview(canvas, img, slots) {
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const pCtx = canvas.getContext('2d');
    pCtx.drawImage(img, 0, 0);

    slots.forEach((slot, idx) => {
      pCtx.save();
      pCtx.strokeStyle = '#06b6d4';
      pCtx.lineWidth = Math.max(6, Math.round(canvas.width * 0.01));
      pCtx.shadowColor = '#06b6d4';
      pCtx.shadowBlur = 14;
      pCtx.strokeRect(slot.x, slot.y, slot.width, slot.height);
      pCtx.restore();

      pCtx.fillStyle = 'rgba(6, 182, 212, 0.22)';
      pCtx.fillRect(slot.x, slot.y, slot.width, slot.height);

      const badgeR = Math.max(22, Math.round(slot.width * 0.08));
      const bx = slot.x + slot.width / 2;
      const by = slot.y + slot.height / 2;

      pCtx.fillStyle = '#06b6d4';
      pCtx.beginPath();
      pCtx.arc(bx, by, badgeR, 0, Math.PI * 2);
      pCtx.fill();

      pCtx.fillStyle = '#ffffff';
      pCtx.font = `bold ${Math.round(badgeR * 1.1)}px "Plus Jakarta Sans", sans-serif`;
      pCtx.textAlign = 'center';
      pCtx.textBaseline = 'middle';
      pCtx.fillText(String(idx + 1), bx, by);
    });
  }

  function loadCustomTemplates() {
    try {
      const raw = localStorage.getItem('snapbooth_custom_templates');
      if (raw) {
        customTemplates = JSON.parse(raw) || [];
      }
    } catch (_) {}
  }

  function saveCustomTemplate(template) {
    customTemplates.push(template);
    try {
      localStorage.setItem('snapbooth_custom_templates', JSON.stringify(customTemplates));
    } catch (e) {
      console.warn('Storage warning when saving template:', e);
    }
  }

  function deleteCustomTemplate(id) {
    customTemplates = customTemplates.filter(t => t.id !== id);
    try {
      localStorage.setItem('snapbooth_custom_templates', JSON.stringify(customTemplates));
    } catch (_) {}
    if (activeTemplateId === id) {
      activeTemplateId = 'denim-scrapbook';
    }
    renderFramePresets();
    updateModeUI();
  }

  function getAllTemplates() {
    return [...DEFAULT_TEMPLATES, ...customTemplates];
  }

  function getActiveTemplate() {
    const all = getAllTemplates();
    return all.find(t => t.id === activeTemplateId) || DEFAULT_TEMPLATES[0];
  }

  function openFrameSelectorModal(triggerCaptureAfter = false) {
    isAwaitingFrameCapture = triggerCaptureAfter;
    const modal = $('#frame-selector-modal');
    if (!modal) return;
    renderFramePresets();
    modal.classList.add('active');
  }

  function closeFrameSelectorModal() {
    const modal = $('#frame-selector-modal');
    if (modal) modal.classList.remove('active');
    isAwaitingFrameCapture = false;
  }

  function renderFramePresets() {
    const grid = $('#frame-preset-grid');
    if (!grid) return;

    const all = getAllTemplates();
    const active = getActiveTemplate();

    const badgeEl = $('#selected-frame-badge');
    const descEl = $('#selected-frame-desc');
    if (badgeEl) badgeEl.textContent = `${active.totalShots || 4} Foto`;
    if (descEl) descEl.textContent = `${active.name} — ${active.totalShots || 4} Jepretan Otomatis`;

    grid.innerHTML = all.map(t => {
      const isAct = t.id === activeTemplateId;
      const isCustom = !!t.isCustom;
      let previewContent = '';

      if (t.type === 'png-overlay') {
        previewContent = `<img src="${t.preview || t.src}" alt="${t.name}" class="frame-preview-img" />`;
      } else if (t.color === 'film') {
        previewContent = `
          <div style="width:100%; height:100%; background:#0f1115; display:flex; flex-direction:column; justify-content:space-evenly; align-items:center; padding:10px 0; border:1px solid #334155;">
            <div style="width:75%; height:20%; background:#1e293b; border-radius:4px;"></div>
            <div style="width:75%; height:20%; background:#1e293b; border-radius:4px;"></div>
            <div style="width:75%; height:20%; background:#1e293b; border-radius:4px;"></div>
            <div style="width:75%; height:20%; background:#1e293b; border-radius:4px;"></div>
          </div>
        `;
      } else {
        const slotH = t.totalShots === 3 ? '26%' : '20%';
        const gradients = [
          'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)'
        ];
        let slotsHtml = '';
        for (let s = 0; s < (t.totalShots || 4); s++) {
          slotsHtml += `<div style="width:75%; height:${slotH}; background:${gradients[s % gradients.length]}; border-radius:4px; opacity:0.85;"></div>`;
        }
        previewContent = `
          <div style="width:100%; height:100%; background:${t.color || '#fff'}; display:flex; flex-direction:column; justify-content:space-evenly; align-items:center; padding:10px 0; border:1px solid rgba(255,255,255,0.15); border-radius:6px;">
            ${slotsHtml}
          </div>
        `;
      }

      return `
        <div class="frame-item-card ${isAct ? 'active' : ''}" data-id="${t.id}">
          <div class="frame-preview-box">
            ${previewContent}
          </div>
          <div class="frame-meta">
            <span class="frame-name" title="${t.name}">${t.name}</span>
            <div class="frame-badge-row">
              <span class="frame-shots-badge">${t.totalShots || 4} Shot</span>
              ${isCustom ? `
                <button class="btn-delete-custom-frame" data-id="${t.id}" title="Hapus Template Kustom">🗑️</button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.frame-item-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-delete-custom-frame')) return;
        activeTemplateId = card.dataset.id;
        hasChosenFrame = true;
        renderFramePresets();
        updateModeUI();
      });
    });

    grid.querySelectorAll('.btn-delete-custom-frame').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (confirm('Hapus template kustom ini?')) {
          deleteCustomTemplate(id);
        }
      });
    });
  }

  function initFrameSelector() {
    renderFramePresets();
    updateModeUI();

    const btnClose = $('#btn-close-frame-modal');
    if (btnClose) btnClose.addEventListener('click', closeFrameSelectorModal);

    const modal = $('#frame-selector-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeFrameSelectorModal();
      });
    }

    const tabPresets = $('#tab-frame-presets');
    const tabUpload = $('#tab-frame-upload');
    const contentPresets = $('#frame-presets-content');
    const contentUpload = $('#frame-upload-content');

    if (tabPresets && tabUpload) {
      tabPresets.addEventListener('click', () => {
        tabPresets.classList.add('active');
        tabUpload.classList.remove('active');
        contentPresets.style.display = 'flex';
        contentUpload.style.display = 'none';
      });

      tabUpload.addEventListener('click', () => {
        tabUpload.classList.add('active');
        tabPresets.classList.remove('active');
        contentPresets.style.display = 'none';
        contentUpload.style.display = 'flex';
      });
    }

    const btnConfirm = $('#btn-confirm-frame');
    if (btnConfirm) {
      btnConfirm.addEventListener('click', () => {
        hasChosenFrame = true;
        closeFrameSelectorModal();
        updateModeUI();
        if (isAwaitingFrameCapture) {
          isAwaitingFrameCapture = false;
          triggerCapture();
        }
      });
    }

    // Upload & Dropzone Handling
    const dropzone = $('#frame-dropzone');
    const fileInput = $('#frame-file-input');
    const btnBrowse = $('#btn-browse-frame');

    if (dropzone && fileInput) {
      if (btnBrowse) {
        btnBrowse.addEventListener('click', (e) => {
          e.stopPropagation();
          fileInput.click();
        });
      }

      dropzone.addEventListener('click', () => fileInput.click());

      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });

      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
      });

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleFrameUpload(e.dataTransfer.files[0]);
        }
      });

      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          handleFrameUpload(e.target.files[0]);
        }
      });
    }

    const btnSaveCustom = $('#btn-save-custom-frame');
    if (btnSaveCustom) {
      btnSaveCustom.addEventListener('click', () => {
        if (!scannedUploadTemplate) {
          alert('Silakan upload file PNG frame terlebih dahulu');
          return;
        }
        const nameInput = $('#custom-frame-name');
        const customName = (nameInput && nameInput.value.trim()) || `Custom Frame (${scannedUploadTemplate.totalShots}x)`;

        const newTemplate = {
          id: 'custom-' + Date.now(),
          name: customName,
          type: 'png-overlay',
          src: scannedUploadTemplate.rawSrc,
          preview: scannedUploadTemplate.previewDataUrl,
          processedOverlayDataUrl: scannedUploadTemplate.overlayDataUrl,
          slots: scannedUploadTemplate.slots,
          totalShots: scannedUploadTemplate.totalShots,
          desc: `${scannedUploadTemplate.totalShots} Foto • Custom Frame Upload`,
          isCustom: true
        };

        saveCustomTemplate(newTemplate);
        activeTemplateId = newTemplate.id;
        hasChosenFrame = true;

        scannedUploadTemplate = null;
        const previewCard = $('#scanner-preview-card');
        if (previewCard) previewCard.style.display = 'none';
        if (nameInput) nameInput.value = '';

        if (tabPresets) tabPresets.click();
        renderFramePresets();
        updateModeUI();
      });
    }
  }

  function handleFrameUpload(file) {
    if (!file || !file.type.startsWith('image/')) {
      alert('Mohon pilih file gambar berformat PNG / JPEG');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const rawSrc = e.target.result;
      const img = new Image();
      img.onload = () => {
        const scanRes = scanChromaKeySlots(img);
        if (!scanRes.slots || scanRes.slots.length === 0) {
          alert('⚠️ Tidak ditemukan kotak foto dengan warna Pure Magenta (#FF00FF), Hijau Neon (#00FF00), atau Merah Solid (#FF0000) pada gambar ini.\n\nPastikan kotak tempat foto diberi warna solid tanpa gradasi.');
          return;
        }

        const previewCanvas = $('#scanner-canvas');
        if (previewCanvas) {
          drawScannerPreview(previewCanvas, img, scanRes.slots);
        }

        const previewDataUrl = previewCanvas ? previewCanvas.toDataURL('image/png') : rawSrc;
        const overlayDataUrl = scanRes.canvasWithHoles.toDataURL('image/png');

        scannedUploadTemplate = {
          rawSrc,
          previewDataUrl,
          overlayDataUrl,
          slots: scanRes.slots,
          totalShots: scanRes.slots.length,
          width: scanRes.width,
          height: scanRes.height
        };

        const statusText = $('#scanner-status-text');
        if (statusText) {
          statusText.innerHTML = `✅ <b>Berhasil Terdeteksi!</b> Ditemukan <b>${scanRes.slots.length} kolom foto</b> pada template ini.`;
        }

        const nameInput = $('#custom-frame-name');
        if (nameInput) {
          nameInput.value = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        }

        const previewCard = $('#scanner-preview-card');
        if (previewCard) previewCard.style.display = 'flex';
      };
      img.src = rawSrc;
    };
    reader.readAsDataURL(file);
  }

  function updateModeUI() {
    const shutter = $('#btn-shutter');
    const btnFrame = $('#btn-frame-select');
    if (captureMode === 'strip') {
      shutter.classList.add('strip-mode');
      const tmpl = getActiveTemplate();
      const shots = tmpl.totalShots || 4;
      shutter.setAttribute('data-tooltip', `Ambil ${shots}-Foto Strip`);
      if (btnFrame) {
        btnFrame.style.display = 'inline-flex';
        const label = $('#active-frame-label');
        if (label) label.textContent = `${tmpl.name.split(' ')[0]} (${shots}x)`;
      }
    } else {
      shutter.classList.remove('strip-mode');
      shutter.setAttribute('data-tooltip', 'Ambil Foto');
      if (btnFrame) btnFrame.style.display = 'none';
    }
  }

  // ─── Capture Flow ───
  async function triggerCapture() {
    if (isCapturing || !stream) return;

    if (captureMode === 'strip' && !hasChosenFrame) {
      openFrameSelectorModal(true);
      return;
    }

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
    countdownRecordedFrames = [];
    if (timerDuration > 0) {
      await runCountdown(timerDuration);
    }
    flashScreen();
    playSound('shutter');

    const frameDataUrl = grabCurrentFrame();
    const recordedFrames = [...countdownRecordedFrames]; // snapshot before clearing

    const item = {
      id: Date.now(),
      type: 'single',
      src: frameDataUrl,
      filter: currentFilter,
      countdownVideoUrl: null,
      countdownVideoExt: 'webm',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    capturedItems.unshift(item);
    renderGallery();
    openInspector(item.id);
    syncToServer(item.src, 'single', currentFilter);

    // Generate countdown video in background (non-blocking)
    if (recordedFrames.length >= 3) {
      generateVideosInBackground(item, recordedFrames, null);
    }
  }

  // ─── Dynamic Photostrip Flow with Live Retake ───
  async function executeStripCapture() {
    const tmpl = getActiveTemplate();
    const totalShots = tmpl.totalShots || 4;
    currentStripFrames = [];
    allStripCountdownFrames = [];

    for (let i = 1; i <= totalShots; i++) {
      countdownRecordedFrames = [];
      const waitTime = timerDuration > 0 ? timerDuration : 3;
      await runCountdown(waitTime, `${i} / ${totalShots}`);
      flashScreen();
      playSound('shutter');
      currentStripFrames.push(grabCurrentFrame());
      allStripCountdownFrames.push(...countdownRecordedFrames);
      if (i < totalShots) {
        await sleep(600);
      }
    }

    openStripReviewModal();
  }

  function openStripReviewModal() {
    const modal = $('#strip-review-modal');
    if (!modal) {
      // Fallback: finalize directly if modal not found
      finalizeStripCapture();
      return;
    }
    renderStripReviewCards();
    modal.classList.add('active');
  }

  function closeStripReviewModal() {
    const modal = $('#strip-review-modal');
    if (modal) modal.classList.remove('active');
  }

  function renderStripReviewCards() {
    const grid = $('#strip-review-grid');
    if (!grid) return;
    const shotCount = currentStripFrames.length;
    const title = $('#strip-review-title');
    const copy = $('#strip-review-copy');
    const retakeAllLabel = $('#retake-all-label');
    if (title) title.textContent = `Hasil jepretanmu (${shotCount} foto)`;
    if (copy) copy.textContent = `Frame pilihanmu meminta ${shotCount} foto. Ulangi yang perlu, lalu simpan.`;
    if (retakeAllLabel) retakeAllLabel.textContent = `Ulangi semua (${shotCount} foto)`;
    grid.innerHTML = currentStripFrames.map((frameSrc, idx) => `
      <div class="review-frame-card" data-index="${idx}">
        <div class="review-frame-thumb-wrap">
          <img src="${frameSrc}" alt="Frame ${idx + 1}" class="review-frame-thumb" />
          <span class="review-frame-badge">Shot ${idx + 1}</span>
        </div>
        <button class="btn-retake-single" data-index="${idx}">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          Ulangi Foto ${idx + 1}
        </button>
      </div>
    `).join('');

    // Bind retake buttons
    grid.querySelectorAll('.btn-retake-single').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.index);
        await retakeSingleFrame(idx);
      });
    });
  }

  async function retakeSingleFrame(index) {
    closeStripReviewModal();
    // 3s Countdown for single retake
    const waitTime = timerDuration > 0 ? timerDuration : 3;
    await runCountdown(waitTime, `Retake Foto ${index + 1}`);
    flashScreen();
    playSound('shutter');
    currentStripFrames[index] = grabCurrentFrame();
    openStripReviewModal();
  }

  async function finalizeStripCapture() {
    closeStripReviewModal();
    const tmpl = getActiveTemplate();
    const stripDataUrl = await buildPhotoStrip(currentStripFrames, tmpl, stripCustomTitle);
    const countdownFramesSnapshot = [...allStripCountdownFrames];

    const item = {
      id: Date.now(),
      type: 'strip',
      src: stripDataUrl,
      rawFrames: [...currentStripFrames],
      template: tmpl,
      filter: currentFilter,
      countdownVideoUrl: null,
      countdownVideoExt: 'webm',
      boomerangVideoUrl: null,
      boomerangVideoExt: 'webm',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    capturedItems.unshift(item);
    renderGallery();
    openInspector(item.id);
    syncToServer(item.src, 'strip', currentFilter);

    // Generate videos in background (non-blocking)
    generateVideosInBackground(item, countdownFramesSnapshot, item.rawFrames);
  }

  // ─── Background Video Generation (non-blocking) ───
  async function generateVideosInBackground(item, countdownFrames, photoFrames) {
    // Generate countdown video
    if (countdownFrames && countdownFrames.length >= 3) {
      try {
        const result = await createVideoFromFrames(countdownFrames, 360, 270, 8);
        if (result) {
          item.countdownVideoUrl = result.url;
          item.countdownVideoExt = result.ext;
          // Show button if inspector is still viewing this item
          if (activeInspectorItemId == item.id) {
            const btn = $('#btn-modal-countdown-gif');
            if (btn) btn.style.display = 'inline-flex';
          }
        }
      } catch (_) {}
    }

    // Generate boomerang video (strip only)
    if (photoFrames && photoFrames.length >= 2) {
      try {
        const result = await createBoomerangVideo(photoFrames);
        if (result) {
          item.boomerangVideoUrl = result.url;
          item.boomerangVideoExt = result.ext;
          if (activeInspectorItemId == item.id) {
            const btn = $('#btn-modal-gif');
            if (btn) btn.style.display = 'inline-flex';
          }
        }
      } catch (_) {}
    }
  }

  // ─── Voice-Aware Countdown with GIF Frame Recording ───
  function runCountdown(seconds, subLabel = '') {
    return new Promise(resolve => {
      const overlay = $('#countdown-overlay');
      const digits = overlay.querySelector('.countdown-digits');
      const progress = overlay.querySelector('.countdown-strip-progress');

      progress.textContent = subLabel;
      overlay.classList.add('active');

      // Record video frames for GIF during countdown (~4fps)
      const recordInterval = setInterval(() => {
        const frameData = recordVideoFrameForGif();
        if (frameData) countdownRecordedFrames.push(frameData);
      }, 250);

      let current = seconds;
      digits.textContent = current;

      function playTickAudio(num) {
        const mode = AUDIO_MODES[currentAudioModeIndex].id;
        if (mode === 'voice-id') {
          if (num === 3) speakVoice('Tiga', 'id-ID');
          else if (num === 2) speakVoice('Dua', 'id-ID');
          else if (num === 1) speakVoice('Satu', 'id-ID');
          else if (num > 3) speakVoice(String(num), 'id-ID');
          playSound('tick');
        } else if (mode === 'voice-en') {
          if (num === 3) speakVoice('Three', 'en-US');
          else if (num === 2) speakVoice('Two', 'en-US');
          else if (num === 1) speakVoice('One', 'en-US');
          else if (num > 3) speakVoice(String(num), 'en-US');
          playSound('tick');
        } else if (mode === 'chime') {
          playChime(523 + (seconds - num) * 130, 0.2);
        } else if (mode === 'beep') {
          playSound('tick');
        }
      }

      playTickAudio(current);

      const interval = setInterval(() => {
        current--;
        if (current > 0) {
          digits.textContent = current;
          playTickAudio(current);
        } else {
          clearInterval(interval);
          clearInterval(recordInterval);
          const mode = AUDIO_MODES[currentAudioModeIndex].id;
          if (mode === 'voice-id') speakVoice('Senyum!', 'id-ID');
          else if (mode === 'voice-en') speakVoice('Smile!', 'en-US');
          else if (mode === 'chime') playChime(1046, 0.3);
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

  // ─── Dual Resolution Capture ───
  function grabCurrentFrame() {
    // Dual Resolution Engine:
    // Live preview uses 720p (efficient, cool USB camera)
    // Snapped photo captures directly from full-sensor resolution (e.g. 1080p, 2K, 4K)
    const nativeW = videoEl.videoWidth || canvasEl.width;
    const nativeH = videoEl.videoHeight || canvasEl.height;

    let targetRatio = 4 / 3;
    if (currentRatio === '1:1') targetRatio = 1;
    else if (currentRatio === '3:4') targetRatio = 3 / 4;
    else if (currentRatio === '16:9') targetRatio = 16 / 9;
    else if (currentRatio === '4:3') targetRatio = 4 / 3;

    // Center crop based on selected aspect ratio
    const currentVideoRatio = nativeW / nativeH;
    let cropW, cropH, cropX, cropY;

    if (currentVideoRatio > targetRatio) {
      cropH = nativeH;
      cropW = Math.round(cropH * targetRatio);
      cropX = Math.round((nativeW - cropW) / 2);
      cropY = 0;
    } else {
      cropW = nativeW;
      cropH = Math.round(cropW / targetRatio);
      cropX = 0;
      cropY = Math.round((nativeH - cropH) / 2);
    }

    // Step 1: Render high-resolution processed canvas
    const hiCanvas = document.createElement('canvas');
    hiCanvas.width = nativeW;
    hiCanvas.height = nativeH;
    const hiCtx = hiCanvas.getContext('2d', { willReadFrequently: true });

    try {
      if (Filters.isCanvasFilter(currentFilter)) {
        Filters.applyCanvas(currentFilter, hiCtx, videoEl, nativeW, nativeH, isMirrored);
      } else if (Filters.isGpuFilter(currentFilter)) {
        Filters.applyGpu(currentFilter, hiCtx, videoEl, nativeW, nativeH, isMirrored);
      } else {
        hiCtx.save();
        if (isMirrored) {
          hiCtx.translate(nativeW, 0);
          hiCtx.scale(-1, 1);
        }
        hiCtx.drawImage(videoEl, 0, 0, nativeW, nativeH);
        hiCtx.restore();

        if (currentFilter !== 'normal') {
          const imgData = hiCtx.getImageData(0, 0, nativeW, nativeH);
          const filtered = Filters.apply(currentFilter, imgData);
          hiCtx.putImageData(filtered, 0, 0);
        }
      }
    } catch (_) {
      hiCtx.save();
      if (isMirrored) {
        hiCtx.translate(nativeW, 0);
        hiCtx.scale(-1, 1);
      }
      hiCtx.drawImage(videoEl, 0, 0, nativeW, nativeH);
      hiCtx.restore();
    }

    // Step 2: Crop to selected aspect ratio at full resolution
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropW;
    tempCanvas.height = cropH;
    const tCtx = tempCanvas.getContext('2d');
    tCtx.drawImage(hiCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    // Bake active stickers onto high-res canvas
    drawStickersOnCanvas(tCtx, cropW, cropH);

    return tempCanvas.toDataURL('image/png', 0.95);
  }

  // ─── Frame-Driven Photostrip Generator ───
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

  async function buildPhotoStrip(frames, templateOrColor = '#ffffff', customTitle = 'SNAPBOOTH STUDIO') {
    let template = typeof templateOrColor === 'object' && templateOrColor !== null ? templateOrColor : null;
    if (!template) {
      if (typeof templateOrColor === 'string' && (templateOrColor.startsWith('#') || templateOrColor === 'film')) {
        template = {
          id: 'color-' + templateOrColor,
          type: 'preset-color',
          color: templateOrColor,
          totalShots: frames.length,
          name: 'Solid Strip'
        };
      } else {
        template = getActiveTemplate();
      }
    }

    if (template && template.type === 'png-overlay') {
      return buildCustomOverlayStrip(frames, template);
    }

    return buildClassicColorStrip(frames, (template && template.color) || '#ffffff', customTitle, (template && template.totalShots) || frames.length);
  }

  function getOrScanTemplate(template) {
    if (_templateCache[template.id]) {
      return Promise.resolve(_templateCache[template.id]);
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        if (template.slots && template.slots.length > 0 && template.processedOverlayDataUrl) {
          const ovImg = new Image();
          ovImg.onload = () => {
            const res = {
              slots: template.slots,
              overlayImage: ovImg,
              width: img.naturalWidth || img.width,
              height: img.naturalHeight || img.height
            };
            _templateCache[template.id] = res;
            resolve(res);
          };
          ovImg.onerror = reject;
          ovImg.src = template.processedOverlayDataUrl;
          return;
        }

        const scanned = scanChromaKeySlots(img);
        const ovImg = new Image();
        ovImg.onload = () => {
          const res = {
            slots: scanned.slots,
            overlayImage: ovImg,
            width: scanned.width,
            height: scanned.height
          };
          _templateCache[template.id] = res;
          resolve(res);
        };
        ovImg.onerror = reject;
        ovImg.src = scanned.canvasWithHoles.toDataURL('image/png');
      };
      img.onerror = reject;
      img.src = template.src;
    });
  }

  function buildCustomOverlayStrip(frames, template) {
    return new Promise(async (resolve) => {
      try {
        const overlayInfo = await getOrScanTemplate(template);
        const { slots, overlayImage, width, height } = overlayInfo;

        const stripCanvas = document.createElement('canvas');
        stripCanvas.width = width;
        stripCanvas.height = height;
        const sCtx = stripCanvas.getContext('2d');

        sCtx.fillStyle = '#ffffff';
        sCtx.fillRect(0, 0, width, height);

        const loadedImages = await Promise.all(frames.map(fSrc => {
          return new Promise(res => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = () => res(null);
            img.src = fSrc;
          });
        }));

        slots.forEach((slot, idx) => {
          const img = loadedImages[idx] || loadedImages[loadedImages.length - 1];
          if (img) {
            drawImageCover(sCtx, img, slot.x, slot.y, slot.width, slot.height);
          }
        });

        if (overlayImage) {
          sCtx.drawImage(overlayImage, 0, 0, width, height);
        }

        resolve(stripCanvas.toDataURL('image/png', 0.98));
      } catch (err) {
        console.error('Error building custom overlay strip:', err);
        resolve(buildClassicColorStrip(frames, '#ffffff'));
      }
    });
  }

  function buildClassicColorStrip(frames, frameColor = '#ffffff', customTitle = 'SNAPBOOTH STUDIO', totalShots = 4) {
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
      const count = frames.length || totalShots;
      const stripHeight = padding * 2 + (photoHeight * count) + (gap * (count - 1)) + footerHeight;

      stripCanvas.width = stripWidth;
      stripCanvas.height = stripHeight;

      if (isFilm) {
        sCtx.fillStyle = '#0f1115';
        sCtx.fillRect(0, 0, stripWidth, stripHeight);
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
          if (loaded === count) {
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

    // Countdown video button (available when video was recorded during capture)
    const btnCountdownGif = $('#btn-modal-countdown-gif');
    if (btnCountdownGif) {
      btnCountdownGif.style.display = item.countdownVideoUrl ? 'inline-flex' : 'none';
    }

    // Boomerang video button (strip with multiple frames)
    const btnGif = $('#btn-modal-gif');
    if (btnGif) {
      btnGif.style.display = (item.boomerangVideoUrl || (item.type === 'strip' && item.rawFrames)) ? 'inline-flex' : 'none';
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
      const clearCode = 1 << minCodeSize;   // 256
      const eoiCode = clearCode + 1;         // 257

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
      let codeSize = minCodeSize + 1;        // starts at 9
      let nextCode = eoiCode + 1;            // first dictionary entry = 258

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

      // Emit clear code to initialize decoder's dictionary
      writeCode(clearCode);

      for (let p = 0; p < pixels.length; p++) {
        writeCode(pixels[p]);
        nextCode++;

        // When decoder's dictionary reaches 2^codeSize, it increases code width
        // Encoder must match by increasing codeSize at the same point
        if (nextCode === (1 << codeSize) && codeSize < 12) {
          codeSize++;
        }

        // At max table size (4096), reset with clear code
        if (nextCode >= 4096) {
          writeCode(clearCode);
          codeSize = minCodeSize + 1;
          nextCode = eoiCode + 1;
        }
      }

      writeCode(eoiCode);

      if (curBits > 0) subBlock.push(curVal & 0xff);
      flushSubBlock();
      writeByte(0x00);
    });

    writeByte(0x3b);
    return new Uint8Array(bytes);
  }

  // ─── Video Helper: Record Video Frame for countdown recording ───
  function recordVideoFrameForGif() {
    if (!videoEl || videoEl.readyState < 2) return null;
    const vW = 360, vH = 270;
    if (!_gifRecordCanvas) {
      _gifRecordCanvas = document.createElement('canvas');
      _gifRecordCanvas.width = vW;
      _gifRecordCanvas.height = vH;
      _gifRecordCtx = _gifRecordCanvas.getContext('2d', { willReadFrequently: true });
    }
    _gifRecordCtx.save();
    if (isMirrored) {
      _gifRecordCtx.translate(vW, 0);
      _gifRecordCtx.scale(-1, 1);
    }
    _gifRecordCtx.drawImage(videoEl, 0, 0, vW, vH);
    _gifRecordCtx.restore();
    return _gifRecordCtx.getImageData(0, 0, vW, vH);
  }

  // ─── Video Helper: Detect best supported video MIME type ───
  function getVideoMimeType() {
    if (typeof MediaRecorder === 'undefined') return null;
    const types = [
      'video/mp4;codecs=avc1',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return null;
  }

  // ─── Video Helper: Create video from ImageData frames using MediaRecorder ───
  function createVideoFromFrames(framesImageData, width, height, fps = 8) {
    return new Promise(resolve => {
      const mimeType = getVideoMimeType();
      if (!mimeType || framesImageData.length < 2) { resolve(null); return; }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      // Draw first frame so captureStream has content
      ctx.putImageData(framesImageData[0], 0, 0);

      const stream = canvas.captureStream(0);
      const track = stream.getVideoTracks()[0];
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 2_000_000
      });
      const chunks = [];

      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
        resolve({ url: URL.createObjectURL(blob), ext });
      };

      recorder.start();

      const frameDelay = Math.round(1000 / fps);
      let idx = 0;

      function drawNext() {
        if (idx >= framesImageData.length) {
          setTimeout(() => recorder.stop(), 150);
          return;
        }
        ctx.putImageData(framesImageData[idx], 0, 0);
        if (track.requestFrame) track.requestFrame();
        idx++;
        setTimeout(drawNext, frameDelay);
      }

      drawNext();
    });
  }

  // ─── Video Helper: Create boomerang video from photo data URLs ───
  async function createBoomerangVideo(frames) {
    const mimeType = getVideoMimeType();
    if (!mimeType || frames.length < 2) return null;

    const vW = 480, vH = 360;
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = vW;
    tmpCanvas.height = vH;
    const tmpCtx = tmpCanvas.getContext('2d');

    // Load all photo images
    const loadedImages = (await Promise.all(frames.map(src =>
      new Promise(res => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => res(null);
        img.src = src;
      })
    ))).filter(Boolean);

    if (loadedImages.length < 2) return null;

    // Build boomerang sequence: 0→1→2→3→2→1, repeated 3 times
    const seq = [];
    for (let rep = 0; rep < 3; rep++) {
      for (let i = 0; i < loadedImages.length; i++) seq.push(i);
      for (let i = loadedImages.length - 2; i > 0; i--) seq.push(i);
    }

    // Convert photo sequence to ImageData frames (cover-fill, no clipping)
    const framesData = seq.map(idx => {
      const img = loadedImages[idx];
      tmpCtx.clearRect(0, 0, vW, vH);
      const srcW = img.naturalWidth || img.width;
      const srcH = img.naturalHeight || img.height;
      const srcR = srcW / srcH;
      const dstR = vW / vH;
      let sx, sy, sw, sh;
      if (srcR > dstR) { sh = srcH; sw = sh * dstR; sx = (srcW - sw) / 2; sy = 0; }
      else { sw = srcW; sh = sw / dstR; sx = 0; sy = (srcH - sh) / 2; }
      tmpCtx.drawImage(img, sx, sy, sw, sh, 0, 0, vW, vH);
      return tmpCtx.getImageData(0, 0, vW, vH);
    });

    return createVideoFromFrames(framesData, vW, vH, 4);
  }

  // ─── Legacy Boomerang Video download (fallback for items without pre-generated video) ───
  async function generateBoomerangVideo(frames) {
    const result = await createBoomerangVideo(frames);
    if (result) {
      downloadFile(result.url, `snapbooth-boomerang-${Date.now()}.${result.ext}`);
    }
  }

  return { init };
})();

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', App.init);
}
