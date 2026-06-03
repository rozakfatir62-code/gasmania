/**
 * script.js — IoT Monitor PWA
 * Logika alur: Splash → Onboarding → Dashboard
 *
 * Arsitektur:
 * 1. SplashController — mengelola animasi dan timing splash screen
 * 2. FormController — validasi & pengambilan data form profil
 * 3. StorageService — abstraksi localStorage
 * 4. DashboardController — merender dan menginisialisasi tampilan dashboard
 * 5. App.init() — titik masuk, mengatur alur keseluruhan
 */

'use strict';

// ============================================================
// SUPABASE CLIENT CONFIGURATION
// Kredensial proyek Supabase Anda
// ============================================================
const SUPABASE_URL = 'https://uwiirlygxqstclohfzch.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3aWlybHlneHFzdGNsb2hmemNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MDAyOTAsImV4cCI6MjA5NTk3NjI5MH0.ZwXaqS0_1LElYYEFHEnL1ElapdV6VdzIUIMnOujBf0E';
let supabaseClient = null;

try {
  // PERBAIKAN: Memastikan inisialisasi aman baik via window.supabase standar maupun modul
  const hasSupabaseLib = (typeof window.supabase !== 'undefined') || (typeof supabase !== 'undefined');

  if (hasSupabaseLib && SUPABASE_URL && !SUPABASE_URL.includes('YOUR_SUPABASE')) {
    const clientCreator = window.supabase || supabase;
    supabaseClient = clientCreator.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false // Menonaktifkan session persistence untuk menghindari Tracking Prevention browser
      }
    });
    console.log('[Supabase] Client berhasil diinisialisasi tanpa session persistence.');
  } else {
    console.warn('[Supabase] URL atau Anon Key belum dikonfigurasi dengan benar. Mengaktifkan mode simulasi.');
  }
} catch (err) {
  console.error('[Supabase] Gagal menginisialisasi client:', err);
}

/** Helper untuk mengamankan data input dari potensi XSS (HTML Escape) */
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ============================================================
 * STORAGE SERVICE
 * Abstraksi tipis di atas localStorage agar mudah diganti
 * ============================================================ */
const StorageService = {
  PROFILE_KEY: 'iot_monitor_profile',

  /** Simpan objek profil ke localStorage */
  saveProfile(profile) {
    try {
      localStorage.setItem(this.PROFILE_KEY, JSON.stringify(profile));
      return true;
    } catch (err) {
      console.error('[StorageService] Gagal menyimpan profil:', err);
      return false;
    }
  },

  /** Ambil profil dari localStorage; null jika belum ada */
  getProfile() {
    try {
      const raw = localStorage.getItem(this.PROFILE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.error('[StorageService] Gagal membaca profil:', err);
      return null;
    }
  },

  /** Hapus profil (logout) */
  clearProfile() {
    try {
      localStorage.removeItem(this.PROFILE_KEY);
      return true; // ✅ FIX #6: return boolean agar pemanggil bisa tahu apakah berhasil
    } catch (err) {
      console.error('[StorageService] Gagal menghapus profil:', err);
      return false; // ✅ FIX #6
    }
  },
};


/* ============================================================
 * SPLASH CONTROLLER
 * ============================================================ */
const SplashController = {
  SPLASH_DURATION: 1800, // ms — cukup lama agar logo terlihat

  /** Mulai splash screen, panggil onComplete saat selesai */
  run(onComplete) {
    const el = document.getElementById('splash-screen');
    if (!el) { onComplete(); return; }

    // Tunggu SPLASH_DURATION, lalu fade out
    setTimeout(() => {
      el.classList.add('fade-out');

      // ✅ FIX #11: Fallback jika transitionend tidak terpicu (misal animasi di-skip browser)
      const finish = () => {
        el.style.display = 'none';
        onComplete();
      };

      const fallback = setTimeout(finish, 600); // maksimal tunggu 600ms

      el.addEventListener('transitionend', () => {
        clearTimeout(fallback); // ✅ batalkan fallback jika animasi berjalan normal
        finish();
      }, { once: true });

    }, this.SPLASH_DURATION);
  },
};


/* ============================================================
 * FORM CONTROLLER
 * ============================================================ */
const FormController = {
  /** Tampilkan halaman onboarding dengan animasi fade in */
  show() {
    const page = document.getElementById('onboarding-page');
    if (!page) return;
    page.style.display = 'flex';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        page.classList.add('visible');
      });
    });
  },

  /** Sembunyikan halaman onboarding */
  hide() {
    const page = document.getElementById('onboarding-page');
    if (!page) return;
    page.classList.remove('visible');
    setTimeout(() => { page.style.display = 'none'; }, 500);
  },

  /** Validasi semua field form */
  validate() {
    let isValid = true;

    // --- Nama ---
    const nameEl = document.getElementById('input-name');
    const nameGroup = document.getElementById('group-name');
    const name = nameEl ? nameEl.value.trim() : '';

    if (!name || name.length < 2) {
      if (nameGroup) this._setError(nameGroup, true);
      isValid = false;
    } else {
      if (nameGroup) this._setError(nameGroup, false);
    }

    // --- Umur ---
    const ageEl = document.getElementById('input-age');
    const ageGroup = document.getElementById('group-age');
    const age = ageEl ? parseInt(ageEl.value, 10) : NaN;

    if (isNaN(age) || age < 1 || age > 120) {
      if (ageGroup) this._setError(ageGroup, true);
      isValid = false;
    } else {
      if (ageGroup) this._setError(ageGroup, false);
    }

    // --- Jenis Kelamin ---
    const genderEls = document.querySelectorAll('input[name="gender"]');
    const genderGroup = document.getElementById('group-gender');
    const selected = [...genderEls].find(el => el.checked);

    if (!selected) {
      if (genderGroup) this._setError(genderGroup, true);
      isValid = false;
    } else {
      if (genderGroup) this._setError(genderGroup, false);
    }

    if (!isValid) return { valid: false, data: null };

    return {
      valid: true,
      data: {
        name,
        age,
        gender: selected.value,
        createdAt: new Date().toISOString(),
      },
    };
  },

  /** Helper: pasang atau lepas kelas error pada grup field */
  _setError(groupEl, hasError) {
    if (hasError) {
      groupEl.classList.add('has-error');
      groupEl.querySelector('.form-input, .radio-group')
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      groupEl.classList.remove('has-error');
    }
  },

  /** Kosongkan semua field form (dipakai saat logout) */
  reset() {
    const nameEl = document.getElementById('input-name');
    const ageEl = document.getElementById('input-age');
    if (nameEl) nameEl.value = '';
    if (ageEl) ageEl.value = '';
    document.querySelectorAll('input[name="gender"]').forEach(el => { el.checked = false; });

    ['group-name', 'group-age', 'group-gender'].forEach(id => {
      document.getElementById(id)?.classList.remove('has-error');
    });
  },
};


/* ============================================================
 * DASHBOARD CONTROLLER
 * ============================================================ */
const DashboardController = {
  _sensorInterval: null,
  _supabaseSubscription: null,
  _updateTimeTimeout: null, // ✅ FIX #5: deklarasi eksplisit
  _ppmData: [], // Menyimpan riwayat data BAC lokal kronologis (Lama -> Baru)

 /** Tampilkan dashboard dan isi data profil */
 show(profile) {
  const page = document.getElementById('dashboard-page');
  if (!page) return;
  page.style.display = 'flex';
  requestAnimationFrame(() => requestAnimationFrame(() => page.classList.add('visible')));
  this._renderProfile(profile);

  // ==========================================
  // PERBAIKAN: PAKSA HANYA REAL-TIME SUPABASE
  // ==========================================
  if (supabaseClient) {
    this._startSupabaseRealtime();
  } else {
    console.error('[Supabase] Gagal terhubung. Client tidak tersedia. Menampilkan data kosong.');
    this._updateGauge(0.0);
    this._updateStatusCards(0.0, 0.0);
  }
},

  /** Sembunyikan dashboard */
  hide() {
    const page = document.getElementById('dashboard-page');
    if (!page) return;
    page.classList.remove('visible');
    this._stopSensorSimulation();
    this._stopSupabaseRealtime();
    setTimeout(() => { page.style.display = 'none'; }, 500);
  },

  /** Isi elemen-elemen UI dengan data profil */
  _renderProfile(profile) {
    const usernameEl = document.getElementById('dash-username');
    if (usernameEl) usernameEl.textContent = profile.name + '!';
    const avatarEl = document.getElementById('dash-avatar');
    if (avatarEl) avatarEl.textContent = profile.gender === 'Perempuan' ? '👩' : '🧑';
  },

  /** Format ISO string ke tanggal lokal Indonesia */
  _formatDate(isoString) {
    try {
      return new Date(isoString).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return '—';
    }
  },

  /** Helper penentuan status BAC */
  _getBacStatus(bacVal) {
    let statusStr = 'Aman';
    let cardColor = 'var(--color-card-green)'; // Hijau
    let textCol = '#1A7A3C';

    if (bacVal >= 0.08) {
      statusStr = 'Bahaya';
      cardColor = 'var(--color-card-pink)'; // Pink/Merah
      textCol = '#8C2A50';
    } else if (bacVal >= 0.05) {
      statusStr = 'Waspada';
      cardColor = 'var(--color-card-yellow)'; // Kuning
      textCol = '#7A5A00';
    }

    return { status: statusStr, bg: cardColor, text: textCol };
  },

  /** Memulai koneksi real-time dengan Supabase */
  async _startSupabaseRealtime() {
    this._ppmData = []; // Reset history lokal
    console.log('[Supabase] Memulai langganan real-time untuk alcohol_logs...');

    // 1. Ambil data history awal (terakhir 50 baris)
    try {
      const { data, error } = await supabaseClient
        .from('alcohol_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      if (data && data.length > 0) {
        // PERBAIKAN: Gunakan .reverse() agar urutannya kronologis (Lama -> Baru) di dalam array utama
        this._ppmData = data.map(row => {
          const bacVal = typeof row.bac_value === 'number' ? row.bac_value : parseFloat(row.bac_value || 0);
          const statusObj = this._getBacStatus(bacVal);
          const timeStr = new Date(row.created_at).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
          return {
            time: timeStr,
            bac: bacVal,
            status: statusObj.status,
            bg: statusObj.bg,
            text: statusObj.text
          };
        }).reverse();

        // Data terbaru sekarang berada di INDEKS PALING AKHIR array
        const latest = this._ppmData[this._ppmData.length - 1];
        const sum = this._ppmData.reduce((acc, cur) => acc + cur.bac, 0);
        const avg = sum / this._ppmData.length;

        this._updateGauge(latest.bac);
        this._updateStatusCards(latest.bac, avg);
      } else {
        this._updateGauge(0.0);
        this._updateStatusCards(0.0, 0.0);
      }
    } catch (err) {
      console.error('[Supabase] Gagal memuat data awal:', err);
    }

    // 2. Subscribe ke event INSERT baru di database
    try {
      // PERBAIKAN: Menggunakan nama channel yang dinamis/unik agar tidak bentrok di browser
      const channelId = `room_alcohol_${Date.now()}`;

      this._supabaseSubscription = supabaseClient
        .channel(channelId)
        .on(
          'postgres_changes',
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'alcohol_logs' 
          },
          (payload) => {
            console.log('[Supabase] Data baru masuk secara real-time:', payload.new);
            this._handleIncomingRecord(payload.new);
          }
        )
        // PERBAIKAN: Menambahkan callback untuk mendeteksi jika koneksi realtime ditolak/putus
        .subscribe((status, err) => {
          console.log('[Supabase] Status realtime channel:', status);
          
          if (err) {
            console.error('[Supabase Realtime Error] Terjadi masalah pada koneksi:', err.message);
          }
          
          if (status === 'CHANNEL_ERROR') {
            console.warn('[Supabase Realtime] Akses ditolak. Pastikan RLS / Replication pada tabel alcohol_logs di dashboard Supabase sudah aktif!');
          }
        });
        
    } catch (err) {
      console.error('[Supabase] Gagal melakukan setup realtime channel:', err);
    }
  },


  /** Menghentikan koneksi real-time dengan Supabase */
  _stopSupabaseRealtime() {
    if (this._supabaseSubscription && supabaseClient) {
      supabaseClient.removeChannel(this._supabaseSubscription);
      this._supabaseSubscription = null;
      console.log('[Supabase] Berhasil unsubscribe dari realtime channel.');
    }
  },

  /** Menangani log baru dari database */
  _handleIncomingRecord(record) {
    const bacVal = typeof record.bac_value === 'number' ? record.bac_value : parseFloat(record.bac_value || 0);
    const statusObj = this._getBacStatus(bacVal);
    const now = new Date(record.created_at || new Date());
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // PERBAIKAN: Gunakan .push() agar data baru ditambahkan ke akhir array (Menjaga konsistensi kronologis)
    this._ppmData.push({
      time: timeStr,
      bac: bacVal,
      status: statusObj.status,
      bg: statusObj.bg,
      text: statusObj.text
    });

    if (this._ppmData.length > 50) this._ppmData.shift();

    const sum = this._ppmData.reduce((acc, cur) => acc + cur.bac, 0);
    const avg = sum / this._ppmData.length;

    this._updateGauge(bacVal);
    this._updateStatusCards(bacVal, avg);

    // Update list visual jika halaman data sedang aktif dibuka
    const dataPage = document.getElementById('data-page');
    if (dataPage && dataPage.style.display === 'flex') {
      DataPageController.renderList();
    }
  },

  /** Simulasi data sensor (Fallback jika Supabase belum terkonfigurasi) */
  _startSensorSimulation() {
    this._ppmData = [];
    console.log('[Simulation] Memulai simulasi sensor (BAC random)...');

    const update = () => {
      const currentBac = parseFloat((Math.random() * 0.16).toFixed(2));
      const statusObj = this._getBacStatus(currentBac);
      const now = new Date();
      const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      this._ppmData.push({
        time: timeStr,
        bac: currentBac,
        status: statusObj.status,
        bg: statusObj.bg,
        text: statusObj.text
      });

      if (this._ppmData.length > 100) this._ppmData.shift();

      const sum = this._ppmData.reduce((acc, cur) => acc + cur.bac, 0);
      const avg = sum / this._ppmData.length;

      this._updateGauge(currentBac);
      this._updateStatusCards(currentBac, avg);

      const dataPage = document.getElementById('data-page');
      if (dataPage && dataPage.style.display === 'flex') {
        DataPageController.renderList();
      }
    };

    update();
    this._sensorInterval = setInterval(update, 3000);
  },

  _stopSensorSimulation() {
    if (this._sensorInterval) {
      clearInterval(this._sensorInterval);
      this._sensorInterval = null;
      console.log('[Simulation] Simulasi dihentikan.');
    }
  },

  /** Helper: Update animasi Gauge SVG */
  _updateGauge(bac) {
    const valueEl = document.getElementById('ppm-value');
    const progressEl = document.getElementById('gauge-progress');
    const thumbEl = document.getElementById('gauge-thumb');

    if (!valueEl || !progressEl || !thumbEl) return;

    valueEl.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    valueEl.style.opacity = '0.3';
    valueEl.style.transform = 'scale(0.95)';

    setTimeout(() => {
      valueEl.textContent = bac.toFixed(2);
      valueEl.style.opacity = '1';
      valueEl.style.transform = 'scale(1)';
    }, 150);

    const maxDash = 188.5;
    const maxBac = 0.40;
    const percentage = Math.min(Math.max(bac / maxBac, 0), 1);

    const offset = maxDash - (percentage * maxDash);
    progressEl.style.strokeDashoffset = offset;

    const rotationDeg = percentage * 270;
    thumbEl.style.transform = `rotate(${rotationDeg}deg)`;
  },

  /** Helper: Update 3 kartu status cepat */
  _updateStatusCards(bac, avgBac) {
    const statusTextEl = document.getElementById('status-text');
    const avgEl = document.getElementById('avg-ppm');
    const updateEl = document.getElementById('update-time');

    if (statusTextEl) {
      const statusObj = this._getBacStatus(bac);
      statusTextEl.textContent = statusObj.status;
      statusTextEl.style.color = statusObj.text;
    }

    if (avgEl) {
      avgEl.textContent = `${avgBac.toFixed(2)}% BAC`;
    }

    if (updateEl) {
      updateEl.style.transition = 'opacity 0.2s ease';
      updateEl.style.opacity = '0';

      setTimeout(() => {
        updateEl.textContent = 'Baru saja';
        updateEl.style.opacity = '1';
      }, 200);

      if (this._updateTimeTimeout) clearTimeout(this._updateTimeTimeout);
      this._updateTimeTimeout = setTimeout(() => {
        if (updateEl.textContent === 'Baru saja') {
          updateEl.style.opacity = '0';
          setTimeout(() => {
            updateEl.textContent = '2 detik lalu';
            updateEl.style.opacity = '1';
          }, 200);
        }
      }, 2000);
    }
  }
};


/* ============================================================
 * DATA PAGE CONTROLLER
 * ============================================================ */
const DataPageController = {
  show(profile) {
    const dashPage = document.getElementById('dashboard-page');
    if (dashPage) dashPage.style.display = 'none';

    const page = document.getElementById('data-page');
    if (!page) return;
    page.style.display = 'flex';
    requestAnimationFrame(() => requestAnimationFrame(() => page.classList.add('visible')));

    // Update nav state
    document.querySelectorAll('.bottom-nav__item').forEach(el => el.classList.remove('bottom-nav__item--active'));
    const navData = document.getElementById('nav-data');
    if (navData) navData.classList.add('bottom-nav__item--active');

    // Update subtitle di header
    const avatar = profile.gender === 'Laki-laki' ? '👨' : (profile.gender === 'Perempuan' ? '👩' : '🧑');
    const subtitleEl = document.getElementById('data-page-subtitle');
    if (subtitleEl) {
      subtitleEl.textContent = `${avatar} ${escapeHTML(profile.name)}, ${escapeHTML(String(profile.age))} tahun`;
    }

    this.renderList();
  },

  hide() {
    const page = document.getElementById('data-page');
    if (page) {
      page.classList.remove('visible');
      setTimeout(() => { page.style.display = 'none'; }, 400);
    }
  },

  renderList() {
    const container = document.getElementById('data-list-container');
    if (!container) return;

    const data = DashboardController._ppmData;

    // Update count label
    const countLabel = document.getElementById('data-count-label');
    if (countLabel) {
      countLabel.innerHTML = `<strong>${data.length}</strong> data tercatat`;
    }

    if (data.length === 0) {
      container.innerHTML = `<div class="data-empty"><div class="data-empty__icon">📭</div>Belum ada data terekam.</div>`;
      return;
    }

    const dataTerbaruDiAtas = data.slice().reverse();
    const statusClass = { 'Aman': 'status--aman', 'Waspada': 'status--waspada', 'Bahaya': 'status--bahaya' };
    const statusIcon = { 'Aman': '🛡️', 'Waspada': '⚠️', 'Bahaya': '🚨' };

    container.innerHTML = dataTerbaruDiAtas.map((item, idx) => `
      <div class="data-item ${statusClass[item.status] || 'status--aman'}" style="animation-delay:${idx * 0.03}s;">
        <div class="data-item__icon">${statusIcon[item.status] || '🛡️'}</div>
        <div class="data-item__body">
          <div class="data-item__bac">${item.bac.toFixed(2)}% BAC</div>
          <div class="data-item__time">${item.time}</div>
        </div>
        <div class="data-item__badge">${item.status}</div>
      </div>
    `).join('');
  },

  exportCSV() {
    const data = DashboardController._ppmData;
    if (data.length === 0) {
      alert("Tidak ada data untuk diekspor.");
      return;
    }
    let csvContent = "data:text/csv;charset=utf-8,Waktu,BAC (%),Status\n";
    data.forEach(row => {
      csvContent += `${row.time},${row.bac},${row.status}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "riwayat_alkohol.csv");
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};


/* ============================================================
 * BUTTON FEEDBACK
 * ============================================================ */
function setButtonLoading(btn, isLoading) {
  if (!btn) return;
  if (isLoading) {
    btn.classList.add('loading');
    btn.setAttribute('disabled', 'true');
  } else {
    btn.classList.remove('loading');
    btn.removeAttribute('disabled');
  }
}


/* ============================================================
 * APP — Titik masuk & pengatur alur
 * ============================================================ */
const App = {
  init() {
    const savedProfile = StorageService.getProfile();

    if (savedProfile) {
      this._skipTodashboard(savedProfile);
    } else {
      SplashController.run(() => {
        FormController.show();
        this._bindFormEvents();
      });
    }
  },

  _skipTodashboard(profile) {
    const splash = document.getElementById('splash-screen');
    if (splash) splash.style.display = 'none';

    loadDashboard(profile);
    this._bindNavEvents();
  },

  /** Hapus semua data di tabel alcohol_logs Supabase */
  async _clearSupabaseData() {
    if (!supabaseClient) return;
    try {
      const { error } = await supabaseClient
        .from('alcohol_logs')
        .delete()
        .neq('id', 0); // neq('id', 0) = hapus semua baris karena id tidak ada yang 0
      if (error) throw error;
      console.log('[Supabase] Tabel alcohol_logs berhasil dikosongkan.');
    } catch (err) {
      console.error('[Supabase] Gagal mengosongkan tabel:', err);
    }
  },

  _bindFormEvents() {
    const btn = document.getElementById('btn-submit');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      const result = FormController.validate();
      if (!result.valid) return;

      setButtonLoading(btn, true);

      // Kosongkan database dulu sebelum masuk dashboard
      await App._clearSupabaseData();

      setTimeout(() => {
        const saved = StorageService.saveProfile(result.data);

        if (!saved) {
          setButtonLoading(btn, false);
          alert('Gagal menyimpan data. Periksa izin penyimpanan browser Anda.');
          return;
        }

        FormController.hide();

        setTimeout(() => {
          loadDashboard(result.data);
          App._bindNavEvents();
        }, 300);

      }, 800);
    });

    // Validasi inline realtime
    const inputName = document.getElementById('input-name');
    if (inputName) {
      inputName.addEventListener('input', () => {
        const g = document.getElementById('group-name');
        if (g && g.classList.contains('has-error') && inputName.value.trim().length >= 2) {
          g.classList.remove('has-error');
        }
      });
    }

    const inputAge = document.getElementById('input-age');
    if (inputAge) {
      inputAge.addEventListener('input', () => {
        const g = document.getElementById('group-age');
        const val = parseInt(inputAge.value, 10);
        if (g && g.classList.contains('has-error') && val >= 1 && val <= 120) {
          g.classList.remove('has-error');
        }
      });
    }

    document.querySelectorAll('input[name="gender"]').forEach(radio => {
      radio.addEventListener('change', () => {
        document.getElementById('group-gender')?.classList.remove('has-error');
      });
    });
  },

  /** Helper: pasang event listener sekali saja, hindari duplikasi */
  // ✅ FIX #2: helper _bindOnce menggantikan pola replaceWith + addEventListener yang tersebar
  _bindOnce(id, event, handler) {
    const el = document.getElementById(id);
    if (!el) return;
    const clone = el.cloneNode(true);
    el.replaceWith(clone);
    document.getElementById(id).addEventListener(event, handler);
  },

  _bindNavEvents() {
    // ✅ FIX #2: semua nav pakai _bindOnce agar tidak menumpuk listener
    this._bindOnce('nav-dashboard', 'click', () => {
      DataPageController.hide();
      setTimeout(() => {
        const dashPage = document.getElementById('dashboard-page');
        if (dashPage) { dashPage.style.display = 'flex'; }
      }, 50);
      document.querySelectorAll('.bottom-nav__item').forEach(el => el.classList.remove('bottom-nav__item--active'));
      const navDash = document.getElementById('nav-dashboard');
      if (navDash) navDash.classList.add('bottom-nav__item--active');
    });

    this._bindOnce('nav-data', 'click', () => {
      const profile = StorageService.getProfile(); // ✅ FIX #1: selalu fresh, tidak stale
      if (profile) DataPageController.show(profile);
    });

    this._bindOnce('nav-profile', 'click', () => {
      if (confirm('Apakah Anda yakin ingin keluar dari sesi monitoring?')) {
        App._logout();
      }
    });

    this._bindOnce('btn-export', 'click', () => {
      DataPageController.exportCSV();
    });
  },

  _logout() {
    StorageService.clearProfile();
    FormController.reset();

    DashboardController.hide();
    DataPageController.hide();

    const globalNav = document.getElementById('global-nav');
    if (globalNav) globalNav.style.display = 'none';

    setTimeout(() => {
      FormController.show();
      App._bindFormEvents();
    }, 350);
  },
};


/* ============================================================
 * THEME CONTROLLER
 * ============================================================ */
const ThemeController = {
  STORAGE_KEY: 'iot_monitor_theme',
  ICON_DARK: '🌙',
  ICON_LIGHT: '☀️',

  init() {
    const saved = this._load();
    this._apply(saved);
    this._bindAll();
    console.log(`[ThemeController] Tema aktif: ${saved}`);
  },

  _apply(theme) {
    if (theme === 'dark') {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
    this._syncIcons(theme);
  },

  _toggle() {
    const isDark = document.body.classList.contains('dark-theme');
    const next = isDark ? 'light' : 'dark';
    this._save(next);
    this._apply(next);
    console.log(`[ThemeController] Beralih ke tema: ${next}`);
  },

  _syncIcons(theme) {
    const icon = theme === 'dark' ? this.ICON_LIGHT : this.ICON_DARK;
    document.querySelectorAll('.btn-theme-toggle').forEach(btn => {
      btn.textContent = icon;
    });
  },

  _bindAll() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('.btn-theme-toggle')) {
        this._toggle();
      }
    });
  },

  _save(theme) {
    try {
      localStorage.setItem(this.STORAGE_KEY, theme);
    } catch (_) {}
  },

  _load() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (_) {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  },
};


/* ============================================================
 * loadDashboard()
 * ============================================================ */
function loadDashboard(profile) {
  console.log('[loadDashboard] Memuat dashboard untuk:', profile.name);
  DashboardController.show(profile);

  const globalNav = document.getElementById('global-nav');
  if (globalNav) {
    globalNav.style.display = 'flex';
  }
}


/* ============================================================
 * BOOT — Mulai aplikasi saat DOM siap
 * ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  ThemeController.init();
  App.init();
});
