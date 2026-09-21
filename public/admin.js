// ─── SnapBooth Cloud Admin Logic ───

(function () {
  let allPhotos = [];
  let currentFilterType = 'all';
  let searchQuery = '';
  let activePhotoId = null;

  const AUTH_KEY = 'snapbooth_admin_token';

  // DOM Elements
  const pinGate = document.getElementById('pin-gate');
  const pinForm = document.getElementById('pin-form');
  const pinInput = document.getElementById('pin-input');
  const pinError = document.getElementById('pin-error');
  const adminContent = document.getElementById('admin-content');
  const gallery = document.getElementById('admin-gallery');
  const emptyState = document.getElementById('empty-state');
  const storagePill = document.getElementById('storage-pill');
  const storageText = document.getElementById('storage-text');
  const searchInput = document.getElementById('search-input');

  const statTotal = document.getElementById('stat-total');
  const statSingle = document.getElementById('stat-single');
  const statStrip = document.getElementById('stat-strip');
  const statStorage = document.getElementById('stat-storage');

  const modal = document.getElementById('admin-modal');
  const modalImg = document.getElementById('modal-img');
  const modalMeta = document.getElementById('modal-meta');
  const modalClose = document.getElementById('modal-close');
  const btnModalDl = document.getElementById('btn-modal-dl');
  const btnOpenDrive = document.getElementById('btn-open-drive');

  const btnRefresh = document.getElementById('btn-refresh');
  const btnLogout = document.getElementById('btn-logout');

  // ─── Auth Flow ───
  function checkAuth() {
    const token = localStorage.getItem(AUTH_KEY);
    if (token) {
      pinGate.style.display = 'none';
      adminContent.style.display = 'flex';
      loadPhotos();
    } else {
      pinGate.style.display = 'flex';
      adminContent.style.display = 'none';
      pinInput.focus();
    }
  }

  pinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    pinError.style.display = 'none';
    const pin = pinInput.value.trim();

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        localStorage.setItem(AUTH_KEY, data.token);
        pinGate.style.display = 'none';
        adminContent.style.display = 'flex';
        loadPhotos();
      } else {
        pinError.textContent = data.error || 'PIN salah, silakan coba lagi.';
        pinError.style.display = 'block';
        pinInput.select();
      }
    } catch (err) {
      pinError.textContent = 'Gagal menghubungi server.';
      pinError.style.display = 'block';
    }
  });

  btnLogout.addEventListener('click', () => {
    localStorage.removeItem(AUTH_KEY);
    checkAuth();
  });

  // ─── Fetch Photos ───
  async function loadPhotos() {
    storageText.textContent = 'Memuat foto...';
    try {
      const res = await fetch('/api/photos?limit=150');
      const data = await res.json();

      allPhotos = data.photos || [];

      // Update Storage status pill
      if (data.storage === 'gdrive') {
        storagePill.className = 'storage-status-pill';
        storageText.textContent = 'Connected: Google Drive Cloud';
        statStorage.textContent = 'Google Drive';
      } else {
        storagePill.className = 'storage-status-pill local';
        storageText.textContent = 'Local Disk (Belum Setup Drive)';
        statStorage.textContent = 'Local Disk';
      }

      updateStats();
      renderGallery();
    } catch (err) {
      console.error('Failed to load photos:', err);
      storageText.textContent = 'Gagal memuat foto';
    }
  }

  function updateStats() {
    statTotal.textContent = allPhotos.length;
    const singles = allPhotos.filter(p => p.type === 'single').length;
    const strips = allPhotos.filter(p => p.type === 'strip').length;
    statSingle.textContent = singles;
    statStrip.textContent = strips;
  }

  // ─── Render Gallery ───
  function renderGallery() {
    let filtered = allPhotos;

    if (currentFilterType !== 'all') {
      filtered = filtered.filter(p => p.type === currentFilterType);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        (p.device && p.device.toLowerCase().includes(q)) ||
        (p.filter && p.filter.toLowerCase().includes(q)) ||
        (p.filename && p.filename.toLowerCase().includes(q)) ||
        (p.createdTime && p.createdTime.toLowerCase().includes(q))
      );
    }

    if (filtered.length === 0) {
      gallery.innerHTML = '';
      emptyState.style.display = 'flex';
      return;
    }

    emptyState.style.display = 'none';

    gallery.innerHTML = filtered.map(p => {
      const date = new Date(p.createdTime);
      const timeStr = isNaN(date.getTime()) ? '' : date.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });

      const isStrip = p.type === 'strip';
      const thumbUrl = p.thumbnailUrl || p.downloadUrl;

      return `
        <div class="photo-card" data-id="${p.id}">
          <div class="photo-media ${isStrip ? 'is-strip' : ''}" onclick="window.AdminApp.openModal('${p.id}')">
            <div class="card-badges">
              <span class="badge-pill badge-device">${p.device || 'Device'}</span>
              <span class="badge-pill badge-filter">${p.filter || 'Normal'}</span>
              ${isStrip ? '<span class="badge-pill badge-type">Strip</span>' : ''}
            </div>
            <img src="${thumbUrl}" alt="${p.filename}" loading="lazy" />
          </div>
          <div class="card-footer">
            <div class="card-meta">
              <span class="card-time">${timeStr}</span>
              <span class="card-filename" title="${p.filename}">${p.filename}</span>
            </div>
            <div class="card-actions">
              ${p.webViewLink ? `
                <a href="${p.webViewLink}" target="_blank" rel="noopener noreferrer" class="card-act-btn" title="Buka di Drive">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                  </svg>
                </a>
              ` : ''}
              <button class="card-act-btn" onclick="window.AdminApp.download('${p.downloadUrl}', '${p.filename}')" title="Unduh File">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ─── Modal Inspector ───
  function openModal(photoId) {
    const photo = allPhotos.find(p => p.id === photoId);
    if (!photo) return;

    activePhotoId = photoId;
    modalImg.src = photo.downloadUrl || photo.thumbnailUrl;

    const date = new Date(photo.createdTime);
    const dateStr = isNaN(date.getTime()) ? '-' : date.toLocaleString('id-ID');

    modalMeta.innerHTML = `
      <span class="meta-chip">📱 ${photo.device || 'Unknown'}</span>
      <span class="meta-chip">🎨 ${photo.filter || 'Normal'}</span>
      <span class="meta-chip">📐 ${photo.type === 'strip' ? '4-Shot Strip' : 'Single Shot'}</span>
      <span class="meta-chip">🕒 ${dateStr}</span>
      <span class="meta-chip">💾 ${(photo.size / (1024 * 1024)).toFixed(2)} MB</span>
    `;

    if (photo.webViewLink) {
      btnOpenDrive.href = photo.webViewLink;
      btnOpenDrive.style.display = 'inline-flex';
    } else {
      btnOpenDrive.style.display = 'none';
    }

    btnModalDl.onclick = () => download(photo.downloadUrl, photo.filename);

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.classList.remove('active');
    document.body.style.overflow = '';
    activePhotoId = null;
  }

  modalClose.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  function download(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'snapbooth-photo.png';
    a.target = '_blank';
    a.click();
  }

  // ─── Google Drive OAuth 2.0 Management ───
  let oauthState = { connected: false, hasClientId: false };

  const oauthBanner = document.getElementById('oauth-banner');
  const oauthTitle = document.getElementById('oauth-title');
  const oauthDesc = document.getElementById('oauth-desc');
  const btnOAuthConnect = document.getElementById('btn-oauth-connect');
  const btnOAuthText = document.getElementById('btn-oauth-text');
  const btnOAuthConfig = document.getElementById('btn-oauth-config');

  const oauthModal = document.getElementById('oauth-modal');
  const oauthModalClose = document.getElementById('oauth-modal-close');
  const btnOAuthCancel = document.getElementById('btn-oauth-cancel');
  const oauthConfigForm = document.getElementById('oauth-config-form');
  const inputClientId = document.getElementById('oauth-client-id');
  const inputClientSecret = document.getElementById('oauth-client-secret');
  const inputFolderId = document.getElementById('oauth-folder-id');

  async function checkOAuthStatus() {
    try {
      const res = await fetch('/api/oauth?action=status');
      const data = await res.json();
      oauthState = data;

      if (data.connected) {
        oauthBanner.classList.add('connected');
        oauthTitle.innerHTML = `🟢 Google Drive Terhubung (OAuth 2.0)`;
        oauthDesc.textContent = `Akun aktif: ${data.email || 'Terhubung'} • Kuota: Akun Pribadi 15GB • Foto otomatis tersimpan langsung ke Google Drive.`;
        btnOAuthText.textContent = 'Putuskan Akun';
        btnOAuthConnect.className = 'btn-secondary';
        storagePill.className = 'storage-status-pill';
        storageText.textContent = 'Connected: Google Drive OAuth (15GB)';
        statStorage.textContent = 'Google Drive';
      } else {
        oauthBanner.classList.remove('connected');
        oauthTitle.textContent = 'Koneksi Google Drive (OAuth 2.0)';
        oauthDesc.textContent = 'Hubungkan akun Google pribadi agar foto otomatis tersimpan langsung di Google Drive (Kuota 15GB).';
        btnOAuthText.textContent = data.hasClientId ? 'Hubungkan Google Drive (1-Klik)' : 'Setup & Hubungkan Google Drive';
        btnOAuthConnect.className = 'btn-primary';
      }

      if (data.folderId && !inputFolderId.value) {
        inputFolderId.value = data.folderId;
      }
    } catch (_) {}
  }

  btnOAuthConnect.addEventListener('click', async () => {
    if (oauthState.connected) {
      if (confirm('Apakah kamu ingin memutuskan koneksi Google Drive?')) {
        await fetch('/api/oauth?action=disconnect', { method: 'POST' });
        checkOAuthStatus();
        loadPhotos();
      }
      return;
    }

    if (oauthState.hasClientId) {
      window.location.href = '/api/auth/google';
    } else {
      openOAuthModal();
    }
  });

  btnOAuthConfig.addEventListener('click', openOAuthModal);

  function openOAuthModal() {
    oauthModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => inputClientId.focus(), 100);
  }

  function closeOAuthModal() {
    oauthModal.classList.remove('active');
    document.body.style.overflow = '';
  }

  oauthModalClose.addEventListener('click', closeOAuthModal);
  btnOAuthCancel.addEventListener('click', closeOAuthModal);
  oauthModal.addEventListener('click', (e) => {
    if (e.target === oauthModal) closeOAuthModal();
  });

  oauthConfigForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const clientId = inputClientId.value.trim();
    const clientSecret = inputClientSecret.value.trim();
    const folderId = inputFolderId.value.trim();

    try {
      const res = await fetch('/api/oauth?action=config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret, folderId })
      });
      const data = await res.json();
      if (data.success) {
        closeOAuthModal();
        window.location.href = '/api/auth/google';
      } else {
        alert('Gagal menyimpan: ' + (data.error || 'Terjadi kesalahan'));
      }
    } catch (err) {
      alert('Gagal menghubungi server: ' + err.message);
    }
  });

  function handleUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('oauth_success') === 'true') {
      const email = params.get('email');
      alert(`🎉 Sukses! Google Drive (${email || 'Akun Pribadi'}) berhasil terhubung. Foto otomatis masuk langsung ke Google Drive kamu!`);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('oauth_error')) {
      alert(`⚠️ Gagal menghubungkan Google Drive: ${params.get('oauth_error')}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  // ─── Filter & Search Listeners ───
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilterType = tab.dataset.type;
      renderGallery();
    });
  });

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    renderGallery();
  });

  btnRefresh.addEventListener('click', () => {
    loadPhotos();
    checkOAuthStatus();
  });

  // Expose global methods for inline card handlers
  window.AdminApp = {
    openModal,
    download
  };

  // Run on startup
  checkAuth();
  checkOAuthStatus();
  handleUrlParams();
})();
