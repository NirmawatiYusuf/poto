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

  const tabBtnGallery = document.getElementById('tab-btn-gallery');
  const tabBtnAnalytics = document.getElementById('tab-btn-analytics');
  const tabCountGallery = document.getElementById('tab-count-gallery');
  const galleryView = document.getElementById('gallery-view');
  const analyticsView = document.getElementById('analytics-view');

  const insightPeakHour = document.getElementById('insight-peak-hour');
  const insightTopFilter = document.getElementById('insight-top-filter');
  const insightTopDevice = document.getElementById('insight-top-device');
  const insightStripRatio = document.getElementById('insight-strip-ratio');

  const peakHourBadge = document.getElementById('peak-hour-badge');
  const hourlyBars = document.getElementById('hourly-bars');
  const filterBreakdown = document.getElementById('filter-breakdown');
  const deviceBreakdown = document.getElementById('device-breakdown');
  const sessionLogCount = document.getElementById('session-log-count');
  const sessionLogTbody = document.getElementById('session-log-tbody');

  const statTotal = document.getElementById('stat-total');
  const statSingle = document.getElementById('stat-single');
  const statStrip = document.getElementById('stat-strip');
  const statStorage = document.getElementById('stat-storage');

  const modal = document.getElementById('admin-modal');
  const modalImg = document.getElementById('modal-img');
  const modalMeta = document.getElementById('modal-meta');
  const modalClose = document.getElementById('modal-close');
  const btnModalDl = document.getElementById('btn-modal-dl');
  const btnModalDelete = document.getElementById('btn-modal-delete');
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
      if (tabCountGallery) tabCountGallery.textContent = allPhotos.length;
      renderGallery();
      renderAnalytics();
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
              <button class="card-act-btn btn-delete" onclick="window.AdminApp.deletePhoto('${p.id}')" title="Hapus Foto">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
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
      <span class="meta-chip">📐 ${photo.type === 'strip' ? 'Photostrip' : 'Single Shot'}</span>
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
    if (btnModalDelete) {
      btnModalDelete.onclick = () => deletePhoto(activePhotoId);
    }

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

  async function deletePhoto(photoId) {
    if (!photoId) return;
    const photo = allPhotos.find(p => p.id === photoId);
    const fname = photo ? photo.filename : 'foto ini';

    if (!confirm(`⚠️ Apakah kamu yakin ingin menghapus "${fname}" secara permanen?\n\nFoto akan terhapus langsung dari Google Drive Cloud / storage lokal.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/photos?id=${encodeURIComponent(photoId)}`, {
        method: 'DELETE'
      });
      const data = await res.json();

      if (res.ok && data.success) {
        allPhotos = allPhotos.filter(p => p.id !== photoId);
        updateStats();
        if (tabCountGallery) tabCountGallery.textContent = allPhotos.length;
        renderGallery();
        renderAnalytics();
        closeModal();
      } else {
        alert('Gagal menghapus foto: ' + (data.error || 'Terjadi kesalahan'));
      }
    } catch (err) {
      alert('Gagal menghubungi server untuk menghapus foto: ' + err.message);
    }
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

  // ─── View Switcher (Gallery vs Analytics) ───
  function switchView(mode) {
    if (mode === 'gallery') {
      if (tabBtnGallery) tabBtnGallery.classList.add('active');
      if (tabBtnAnalytics) tabBtnAnalytics.classList.remove('active');
      if (galleryView) galleryView.style.display = 'block';
      if (analyticsView) analyticsView.style.display = 'none';
    } else {
      if (tabBtnGallery) tabBtnGallery.classList.remove('active');
      if (tabBtnAnalytics) tabBtnAnalytics.classList.add('active');
      if (galleryView) galleryView.style.display = 'none';
      if (analyticsView) analyticsView.style.display = 'block';
      renderAnalytics();
    }
  }

  if (tabBtnGallery) tabBtnGallery.addEventListener('click', () => switchView('gallery'));
  if (tabBtnAnalytics) tabBtnAnalytics.addEventListener('click', () => switchView('analytics'));

  // ─── Analytics & Session Intelligence ───
  const FILTER_COLORS = {
    'normal': '#6366f1',
    'vintage': '#f59e0b',
    'warm': '#f97316',
    'cool': '#06b6d4',
    'bnw': '#94a3b8',
    'cyberpunk': '#ec4899',
    'retro': '#8b5cf6',
    'soft': '#10b981',
    'default': '#6366f1'
  };

  function getFilterColor(name) {
    const k = (name || '').toLowerCase();
    return FILTER_COLORS[k] || '#818cf8';
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = 2;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function getTimeAgo(date) {
    if (!date || isNaN(date.getTime())) return '';
    const diff = Math.floor((new Date() - date) / 1000);
    if (diff < 60) return 'Baru saja';
    if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
    return `${Math.floor(diff / 86400)} hari lalu`;
  }

  function renderAnalytics() {
    if (!insightPeakHour) return;

    if (!allPhotos || allPhotos.length === 0) {
      if (insightPeakHour) insightPeakHour.textContent = '-';
      if (insightTopFilter) insightTopFilter.textContent = '-';
      if (insightTopDevice) insightTopDevice.textContent = '-';
      if (insightStripRatio) insightStripRatio.textContent = '-';
      if (peakHourBadge) peakHourBadge.textContent = 'Belum Ada Sesi';
      if (hourlyBars) hourlyBars.innerHTML = '<div class="chart-empty-msg">Belum ada data sesi foto</div>';
      if (filterBreakdown) filterBreakdown.innerHTML = '<div class="chart-empty-msg">Belum ada data filter</div>';
      if (deviceBreakdown) deviceBreakdown.innerHTML = '<div class="chart-empty-msg">Belum ada data perangkat</div>';
      if (sessionLogCount) sessionLogCount.textContent = '0 Sesi';
      if (sessionLogTbody) sessionLogTbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-muted);">Belum ada riwayat aktivitas sesi foto</td></tr>';
      return;
    }

    const total = allPhotos.length;

    // 1. Hourly Distribution (0 - 23)
    const hours = new Array(24).fill(0);
    const filterCounts = {};
    const deviceCounts = {};
    let stripCount = 0;
    let singleCount = 0;

    allPhotos.forEach(p => {
      // Hour
      const d = new Date(p.createdTime);
      if (!isNaN(d.getTime())) {
        hours[d.getHours()]++;
      }

      // Filter
      const fName = (p.filter || 'normal').toLowerCase();
      filterCounts[fName] = (filterCounts[fName] || 0) + 1;

      // Device
      let dev = p.device || 'Unknown';
      if (/iphone|ipad|ipod/i.test(dev)) dev = 'iPhone / iOS';
      else if (/android/i.test(dev)) dev = 'Android Device';
      else if (/mac/i.test(dev)) dev = 'Mac Desktop';
      else if (/win/i.test(dev)) dev = 'Windows PC';
      else if (/local/i.test(dev)) dev = 'PC Local-Booth';
      deviceCounts[dev] = (deviceCounts[dev] || 0) + 1;

      // Type
      if (p.type === 'strip') stripCount++;
      else singleCount++;
    });

    // Peak Hour calculation
    let maxHourVal = 0;
    let peakHourIdx = 0;
    hours.forEach((cnt, idx) => {
      if (cnt > maxHourVal) {
        maxHourVal = cnt;
        peakHourIdx = idx;
      }
    });

    if (maxHourVal > 0) {
      const hStart = String(peakHourIdx).padStart(2, '0') + ':00';
      const hEnd = String((peakHourIdx + 1) % 24).padStart(2, '0') + ':00';
      const peakStr = `${hStart} - ${hEnd}`;
      if (insightPeakHour) insightPeakHour.textContent = peakStr;
      if (peakHourBadge) peakHourBadge.textContent = `Paling Ramai: ${peakStr} (${maxHourVal} sesi)`;
    } else {
      if (insightPeakHour) insightPeakHour.textContent = '-';
      if (peakHourBadge) peakHourBadge.textContent = 'Aktivitas Merata';
    }

    // Render 24-hour bars
    const chartMax = Math.max(maxHourVal, 1);
    if (hourlyBars) {
      hourlyBars.innerHTML = hours.map((cnt, h) => {
        const pct = (cnt / chartMax) * 100;
        const isPeak = cnt > 0 && cnt === maxHourVal;
        const hourLabel = String(h).padStart(2, '0') + ':00';
        return `
          <div class="hourly-bar-col" title="${hourLabel} • ${cnt} foto diambil">
            <div class="hourly-bar-fill ${isPeak ? 'is-peak' : ''}" style="height: ${Math.max(pct, cnt > 0 ? 12 : 4)}%;">
              ${cnt > 0 ? `<span class="bar-val">${cnt}</span>` : ''}
            </div>
            <span class="bar-hour-label">${h % 4 === 0 ? h : ''}</span>
          </div>
        `;
      }).join('');
    }

    // 2. Filter Breakdown
    const sortedFilters = Object.entries(filterCounts)
      .map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count);

    if (insightTopFilter) {
      insightTopFilter.textContent = sortedFilters.length > 0 ? `${sortedFilters[0].name.toUpperCase()} (${sortedFilters[0].pct}%)` : '-';
    }

    if (filterBreakdown) {
      filterBreakdown.innerHTML = sortedFilters.map(item => `
        <div class="breakdown-row">
          <div class="breakdown-meta">
            <span class="breakdown-name">
              <span class="filter-dot" style="background:${getFilterColor(item.name)}"></span>
              ${item.name.charAt(0).toUpperCase() + item.name.slice(1)}
            </span>
            <span class="breakdown-nums"><b>${item.count}</b> foto <span class="pct">(${item.pct}%)</span></span>
          </div>
          <div class="breakdown-bar-track">
            <div class="breakdown-bar-progress" style="width: ${item.pct}%; background: ${getFilterColor(item.name)};"></div>
          </div>
        </div>
      `).join('');
    }

    // 3. Device Breakdown
    const sortedDevices = Object.entries(deviceCounts)
      .map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count);

    if (insightTopDevice) {
      insightTopDevice.textContent = sortedDevices.length > 0 ? `${sortedDevices[0].name} (${sortedDevices[0].pct}%)` : '-';
    }

    if (deviceBreakdown) {
      deviceBreakdown.innerHTML = sortedDevices.map(item => `
        <div class="breakdown-row">
          <div class="breakdown-meta">
            <span class="breakdown-name">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14" style="color:var(--text-secondary)">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
              </svg>
              ${item.name}
            </span>
            <span class="breakdown-nums"><b>${item.count}</b> <span class="pct">(${item.pct}%)</span></span>
          </div>
          <div class="breakdown-bar-track">
            <div class="breakdown-bar-progress device-progress" style="width: ${item.pct}%;"></div>
          </div>
        </div>
      `).join('');
    }

    // 4. Strip vs Single Ratio
    const stripPct = Math.round((stripCount / total) * 100);
    const singlePct = Math.round((singleCount / total) * 100);
    if (insightStripRatio) {
      insightStripRatio.textContent = `${stripPct}% Strip / ${singlePct}% Single`;
    }

    // 5. Session Timeline & Activity Log Table
    if (sessionLogCount) sessionLogCount.textContent = `${total} Sesi`;

    if (sessionLogTbody) {
      const recentSessions = allPhotos.slice(0, 50);
      sessionLogTbody.innerHTML = recentSessions.map(p => {
        const date = new Date(p.createdTime);
        const dateStr = isNaN(date.getTime()) ? '-' : date.toLocaleString('id-ID', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        const isStrip = p.type === 'strip';
        const sizeStr = formatBytes(p.size);

        return `
          <tr>
            <td>
              <div class="time-cell">
                <span class="time-main">${dateStr}</span>
                <span class="time-rel">${getTimeAgo(date)}</span>
              </div>
            </td>
            <td>
              <span class="badge-pill ${isStrip ? 'badge-type' : 'badge-single'}">
                ${isStrip ? 'Photostrip' : 'Single Shot'}
              </span>
            </td>
            <td>
              <span class="badge-pill badge-filter" style="border-left: 3px solid ${getFilterColor(p.filter)}">
                ${p.filter || 'normal'}
              </span>
            </td>
            <td>
              <span class="device-cell">${p.device || 'Unknown'}</span>
            </td>
            <td class="size-cell">${sizeStr}</td>
            <td>
              <div class="table-actions">
                <button class="tbl-btn" onclick="window.AdminApp.openModal('${p.id}')" title="Lihat Foto">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                  </svg>
                  Lihat
                </button>
                <button class="tbl-btn" onclick="window.AdminApp.download('${p.downloadUrl}', '${p.filename}')" title="Unduh">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                  </svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
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
    download,
    deletePhoto
  };

  // Run on startup
  checkAuth();
  checkOAuthStatus();
  handleUrlParams();
})();
