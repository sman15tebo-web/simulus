// ==========================================
// 1. KONFIGURASI API (HUBUNGAN KE BACKEND)
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbyCawyY6IWTiDlgNIzbO4yg_QSlciYv60K7XsXq_vo2vOt2rdm8eX_Z6p_AJ8fOu6spFQ/exec"; 

/**
 * Fungsi Pengganti google.script.run
 * Digunakan untuk mengambil/mengirim data dari/ke Google Apps Script
 */
async function fetchAPI(action, payload = {}) {
    const adminToken = localStorage.getItem('adminToken');
    if (adminToken) {
        payload.adminToken = adminToken;
    }
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: action, payload: payload })
        });
        const result = await response.json();
        return result;
    } catch (error) {
        console.error("Terjadi kesalahan jaringan:", error);
        return { status: 'error', message: 'Gagal terhubung ke server.' };
    }
}


// ==========================================
// 2. VARIABEL GLOBAL & UTILS
// ==========================================
let ADMIN_WA = ''; 
let CURRENT_USER = null;
let ALL_DATA = { students: [], subjects: [], grades: [], settings: {} };
let SELECTED_STUDENT_ID = null;
let CROPPER = null;
let UPLOAD_TARGET_ID = ''; 
let COUNTDOWN_INTERVAL = null;

// PAGINATION VARS
let CURRENT_PAGE = 1;
const ROWS_PER_PAGE = 10;
let FILTERED_STUDENTS = [];

let CROP_RATIO = 3/4; 
let CROP_MIME = 'image/jpeg'; 

// Charts Instances
let chartInstanceLulus = null;
let chartInstanceGender = null;

const el = (id) => document.getElementById(id);
const showLoader = () => el('loader').classList.add('active');
const hideLoader = () => el('loader').classList.remove('active');
const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });


// ==========================================
// 3. UI HELPER & SCROLL
// ==========================================
function scrollToTop() {
    const mainDiv = document.querySelector('.main');
    if(mainDiv) {
        mainDiv.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

document.querySelector('.main').addEventListener('scroll', function(e) {
    const btn = document.getElementById('btn-scroll-top');
    if(e.target.scrollTop > 300) btn.classList.add('show');
    else btn.classList.remove('show');
});

window.addEventListener('scroll', function() {
    const btn = document.getElementById('btn-scroll-top');
    if(window.scrollY > 300) btn.classList.add('show');
    else btn.classList.remove('show');
});

function togglePass(id, icon) {
    const input = el(id);
    if (input.type === "password") {
        input.type = "text";
        icon.innerText = "🔒"; 
    } else {
        input.type = "password";
        icon.innerText = "👁️";
    }
}


// ==========================================
// 4. INIT (AUTO FETCH DATA PUBLIK SAAT HALAMAN DIBUKA)
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    // --- 1. CEK SESI LOGIN YANG TERSIMPAN ---
    const savedUser = localStorage.getItem('userData');
    if (savedUser) {
        try {
            CURRENT_USER = JSON.parse(savedUser);
            el('login-view').classList.add('hidden'); // Sembunyikan layar login
            
            if (CURRENT_USER.role === 'admin') {
                el('admin-layout').classList.remove('hidden');
                loadAllData();
            } else {
                el('student-view-layout').classList.remove('hidden');
                renderStudentView(CURRENT_USER);
            }
        } catch (e) {
            // Jika data corrupt, hapus sesi
            localStorage.removeItem('userData');
            localStorage.removeItem('adminToken');
        }
    }

    // --- 2. TARIK DATA PUBLIK (LOGO & NAMA SEKOLAH) ---
    try {
        const res = await fetchAPI('getPublicSettings');
        if (res && res.status === 'success') {
            const settings = res.data;
            if(settings.NAMA_SEKOLAH) {
                const labelSek = el('l-nama-sek');
                if(labelSek) labelSek.innerText = settings.NAMA_SEKOLAH;
                const labelIns = el('l-nama-ins');
                if(labelIns) labelIns.innerText = settings.NAMA_INSTANSI || 'PEMERINTAH';
            }
            if(settings.NOMOR_HP) ADMIN_WA = settings.NOMOR_HP;
            if(settings.LOGO_SEKOLAH) { el('l-logo-sek').src = settings.LOGO_SEKOLAH; el('l-logo-sek').style.display='block'; }
            if(settings.LOGO_INSTANSI) { el('l-logo-ins').src = settings.LOGO_INSTANSI; el('l-logo-ins').style.display='block'; }
        }
    } catch(e) { console.error("Gagal load setting publik"); }

    // --- 3. EVENT LISTENER UNTUK LOGIN PAKAI ENTER ---
    const handleEnter = (e) => { 
        if (e.key === 'Enter') {
            e.preventDefault(); // Mencegah form reload bawaan browser
            doLogin(); 
        }
    };
    
    const logU = el('log-u');
    const logP = el('log-p');
    if (logU) logU.addEventListener('keypress', handleEnter);
    if (logP) logP.addEventListener('keypress', handleEnter);
});

// --- FUNGSI LOGIN HARUS BERDIRI SENDIRI DI LUAR ---
async function doLogin() {
    const u = el('log-u').value;
    const p = el('log-p').value;
    
    if(!u || !p) {
        return Swal.fire('Peringatan', 'Username dan Password harus diisi', 'warning');
    }

    showLoader(); 
    const res = await fetchAPI('processLogin', { u: u, p: p });
    hideLoader(); 
    
    if(res.status === 'success') {
        CURRENT_USER = res;
        localStorage.setItem('userData', JSON.stringify(res));
        el('login-view').classList.add('hidden');
        
        if(res.role === 'admin') {
            localStorage.setItem('adminToken', res.token); 
            el('admin-layout').classList.remove('hidden');
            loadAllData(); 
        } else {
            el('student-view-layout').classList.remove('hidden');
            renderStudentView(res);
        }
    } else {
        Swal.fire('Gagal Masuk', res.message || 'Error', 'error');
    }
}

// ==========================================
// 5. LOGIN & LUPA PASSWORD
// ==========================================
function forgotPass() {
    if (!ADMIN_WA) {
        Swal.fire('Info', 'Hubungi Admin sekolah.', 'info');
        return;
    }
    
    var cleanNum = ADMIN_WA.toString().replace(/[^0-9]/g, '');
    if (cleanNum.startsWith('0')) { cleanNum = '62' + cleanNum.substring(1); }

    var url = "https://wa.me/" + cleanNum + "?text=Halo%20Admin%20saya%20lupa%20password";
    
    Swal.fire({
        title: 'Lupa Password?',
        text: 'Chat Admin via WhatsApp?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Chat WA'
    }).then((result) => {
        if (result.isConfirmed) { window.open(url, '_blank'); }
    });
}


function doLogout() {
    CURRENT_USER = null;
    
    // --- HAPUS SEMUA SESI DARI BROWSER ---
    localStorage.removeItem('adminToken'); 
    localStorage.removeItem('userData'); 
    
    ALL_DATA = { students: [], subjects: [], grades: [], settings: {} };
    el('admin-layout').classList.add('hidden');
    el('student-view-layout').classList.add('hidden');
    el('login-view').classList.remove('hidden');
    el('log-u').value = '';
    el('log-p').value = '';
    if(chartInstanceLulus) { chartInstanceLulus.destroy(); chartInstanceLulus = null; }
    if(chartInstanceGender) { chartInstanceGender.destroy(); chartInstanceGender = null; }
}


// ==========================================
// 6. ADMIN DASHBOARD & CORE
// ==========================================
function nav(page) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    event.target.classList.add('active');
    ['dashboard','students','subjects','grades','skl','settings'].forEach(p => el('page-'+p).classList.add('hidden'));
    el('page-'+page).classList.remove('hidden');
    
    if(page === 'grades') populateStudentSelects();
    if(page === 'skl') populateSklClassFilter(); 
    if(page === 'dashboard') renderDashboardCharts(); 
    if(window.innerWidth <= 768) { 
        toggleSidebar(); 
        scrollToTop(); 
    }
}

async function loadAllData() {
    showLoader();
    const res = await fetchAPI('getInitialData');
    if (res.status === 'success') {
        ALL_DATA = res.data;
        FILTERED_STUDENTS = [...res.data.students];
        renderSettings(res.data.settings);
        renderStudents(); 
        renderSubjects(res.data.subjects);
        renderDashboardCharts(); 
    } else {
        Swal.fire('Session Expired', 'Silahkan login kembali', 'error');
        doLogout();
    }
    hideLoader();
}

function populateStudentSelects() {
    const selKelas = el('grade-sel-kelas');
    if(!selKelas) return;
    
    // 1. Dapatkan daftar kelas yang unik dari data siswa
    const uniqueClasses = [...new Set(ALL_DATA.students.map(s => String(s[7]).trim()).filter(c => c !== ''))].sort();
    
    // 2. Isi dropdown kelas
    selKelas.innerHTML = '<option value="">-- Semua Kelas --</option>';
    uniqueClasses.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.innerText = c;
        selKelas.appendChild(opt);
    });

    // 3. Panggil fungsi filter untuk mengisi dropdown siswa awal
    filterGradeStudents();
}

function filterGradeStudents() {
    const selectedClass = el('grade-sel-kelas').value;
    const selSiswa = el('grade-sel-siswa');
    
    selSiswa.innerHTML = '<option value="">-- Pilih Siswa --</option>';
    
    let filteredStudents = ALL_DATA.students;
    
    // Jika ada kelas yang dipilih, filter data siswa
    if (selectedClass !== '') {
        filteredStudents = filteredStudents.filter(s => String(s[7]).trim() === selectedClass);
    }

    // Urutkan siswa berdasarkan nama (Alfabetis) agar mudah dicari
    filteredStudents.sort((a, b) => String(a[2]).localeCompare(String(b[2])));

    // Isi dropdown siswa
    filteredStudents.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s[0]; // NISN
        opt.innerText = s[2] + " (" + s[7] + ")"; // Nama (Kelas)
        selSiswa.appendChild(opt);
    });
    
    // Sembunyikan form nilai setiap kali ganti kelas agar tidak salah input
    el('grade-container').classList.add('hidden');
}

function toggleSidebar() {
    document.querySelector('.sidebar').classList.toggle('show');
    const overlay = document.getElementById('sidebar-overlay');
    if(document.querySelector('.sidebar').classList.contains('show')) {
        overlay.classList.add('active');
    } else {
        overlay.classList.remove('active');
    }
}

function renderDashboardCharts() {
    const s = ALL_DATA.students;
    if(!s || s.length === 0) return;

    const total = s.length;
    const lulus = s.filter(x => x[8] === 'LULUS').length;
    const gagal = s.filter(x => x[8] !== 'LULUS').length;
    const laki = s.filter(x => x[6] === 'L').length;
    const perempuan = s.filter(x => x[6] === 'P').length;

    el('dash-total').innerText = total;
    el('dash-lulus').innerText = lulus;
    el('dash-gagal').innerText = gagal;

    const ctxLulus = document.getElementById('chartLulus').getContext('2d');
    if(chartInstanceLulus) chartInstanceLulus.destroy();
    chartInstanceLulus = new Chart(ctxLulus, {
        type: 'doughnut',
        data: {
            labels: ['Lulus', 'Tidak Lulus'],
            datasets: [{
                data: [lulus, gagal],
                backgroundColor: ['#10b981', '#ef4444'],
                borderWidth: 0
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom' } } }
    });

    const ctxGender = document.getElementById('chartGender').getContext('2d');
    if(chartInstanceGender) chartInstanceGender.destroy();
    chartInstanceGender = new Chart(ctxGender, {
        type: 'bar',
        data: {
            labels: ['Laki-laki', 'Perempuan'],
            datasets: [{
                label: 'Jumlah',
                data: [laki, perempuan],
                backgroundColor: ['#3b82f6', '#ec4899'],
                borderRadius: 5
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } } }
    });
}


// ==========================================
// 7. SISWA TABLE & CRUD ADMIN
// ==========================================
function renderStudents() {
    const searchName = el('s-search-nama').value.toLowerCase();
    const searchStatus = el('s-search-status').value;
    const searchYear = el('s-search-tahun').value;

    FILTERED_STUDENTS = ALL_DATA.students.filter(s => {
        const matchName = s[2].toLowerCase().includes(searchName); 
        const matchStatus = searchStatus ? s[8] === searchStatus : true; 
        const matchYear = searchYear ? String(s[12]).includes(searchYear) : true; 
        return matchName && matchStatus && matchYear;
    });

    const totalRows = FILTERED_STUDENTS.length;
    const maxPage = Math.ceil(totalRows / ROWS_PER_PAGE) || 1;
    if(CURRENT_PAGE > maxPage) CURRENT_PAGE = 1; 
    
    const startIndex = (CURRENT_PAGE - 1) * ROWS_PER_PAGE;
    const endIndex = startIndex + ROWS_PER_PAGE;
    const pageData = FILTERED_STUDENTS.slice(startIndex, endIndex);

    const tbody = el('tbl-students').querySelector('tbody');
    tbody.innerHTML = '';
    
    if(pageData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Tidak ada data ditemukan</td></tr>';
    } else {
        pageData.forEach(row => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td style="white-space:nowrap; width:150px;">
              <button class="btn btn-primary btn-sm" onclick='openReview("${row[0]}")'>👁️</button>
              <button class="btn btn-outline btn-sm" onclick='editStudent("${row[0]}")'>✏️</button>
              <button class="btn btn-danger btn-sm" onclick='deleteStudent("${row[0]}")'>🗑️</button>
            </td>
            <td><img src="${row[10] || 'https://via.placeholder.com/40'}" loading="lazy" style="width:40px;height:40px;border-radius:50%;object-fit:cover"></td>
            <td>${row[0]}</td>
            <td><b>${row[2]}</b><br><small style="color:#64748b">${row[3]}</small></td>
            <td>${row[7]}</td>
            <td><span class="${row[8]=='LULUS'?'status-lulus':'status-gagal'}" style="padding:4px 10px; border-radius:20px; font-size:0.7rem; font-weight:700;">${row[8]}</span></td>
          `;
          tbody.appendChild(tr);
        });
    }

    el('page-info').innerText = `Halaman ${CURRENT_PAGE} dari ${maxPage}`;
    document.querySelector('.pagination button:first-child').disabled = (CURRENT_PAGE === 1);
    document.querySelector('.pagination button:last-child').disabled = (CURRENT_PAGE === maxPage);
}

function changePage(delta) {
    CURRENT_PAGE += delta;
    renderStudents();
    scrollToTop(); 
}

function openReview(nisn) {
    const s = ALL_DATA.students.find(x => String(x[0]) == String(nisn));
    if(!s) return;
    el('rv-foto').src = s[10] || 'https://via.placeholder.com/150';
    el('rv-nama').innerText = s[2];
    el('rv-nisn').innerText = s[0];
    el('rv-nis').innerText = s[3];
    el('rv-ttl').innerText = (s[4] || '') + ', ' + (s[5] || '');
    el('rv-kelas').innerText = s[7];
    el('rv-ortu').innerText = s[13] || '-';
    el('rv-pass').innerText = s[1];
    
    const statEl = el('rv-status');
    statEl.innerText = s[8];
    statEl.className = 'p-status ' + (s[8] == 'LULUS' ? 'status-lulus' : 'status-gagal');

    const linkDoc = s[9], linkFile = s[14];
    let hasDoc = false;
    if(linkDoc && linkDoc.length > 5) { el('rv-link-doc').href = linkDoc; el('rv-link-doc').classList.remove('hidden'); hasDoc = true; } 
    else el('rv-link-doc').classList.add('hidden');
    if(linkFile && linkFile.length > 5) { el('rv-link-file').href = linkFile; el('rv-link-file').classList.remove('hidden'); hasDoc = true; } 
    else el('rv-link-file').classList.add('hidden');
    if(hasDoc) el('rv-no-doc').classList.add('hidden'); else el('rv-no-doc').classList.remove('hidden');
    el('modal-review').classList.add('active');
}

function openStudentModal() {
    el('m-nisn').value = ''; el('m-pass').value = '12345';
    el('m-nama').value = ''; el('m-nis').value = '';
    el('m-tmp').value = ''; el('m-tgl').value = '';
    el('m-jk').value = 'L'; el('m-thn').value = new Date().getFullYear();
    el('m-kelas').value = ''; 
    el('m-ortu').value = ''; el('m-status').value = 'LULUS';
    el('m-foto').value = ''; el('m-ucapan').value = '';
    el('m-file-skl').value = ''; el('m-preview').style.display = 'none'; el('m-file-status').innerText = '';
    
    // Buka kunci NISN untuk Tambah Baru
    el('m-nisn').removeAttribute('readonly');
    el('m-nisn').style.background = '#fff';

    el('modal-student').classList.add('active');
}

// Fungsi Helper untuk menerjemahkan format tanggal dari Google Sheets
function formatTgl(dateStr) {
    if(!dateStr) return '';
    // Jika formatnya sudah benar (YYYY-MM-DD), langsung kembalikan
    if(/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr; 
    
    try {
        let d = new Date(dateStr);
        // Jika Date Javascript gagal membaca formatnya (NaN)
        if(isNaN(d.getTime())) {
            let p = dateStr.split(/[\/\-]/);
            // Cek apakah ini format DD/MM/YYYY dari locale Indonesia
            if(p.length === 3 && p[2].length === 4) {
                return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
            }
            return '';
        }
        // Jika berhasil dibaca, susun ulang jadi YYYY-MM-DD
        return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    } catch(e) { 
        return ''; 
    }
}

function editStudent(nisn) {
    const s = ALL_DATA.students.find(x => String(x[0]) == String(nisn));
    if(!s) return;
    el('m-nisn').value = s[0]; el('m-pass').value = s[1];
    el('m-nama').value = s[2]; el('m-nis').value = s[3];
    el('m-tmp').value = s[4]; 
    
    // PANGGIL FUNGSI PENERJEMAH TANGGAL DI SINI
    el('m-tgl').value = formatTgl(s[5]); 
    
    el('m-jk').value = s[6]; el('m-thn').value = s[12];
    el('m-kelas').value = s[7]; 
    el('m-ortu').value = s[13]; el('m-status').value = s[8];
    el('m-foto').value = s[10]; el('m-ucapan').value = s[11];
    el('m-file-skl').value = s[14] || ''; 
    if(s[10]) { el('m-preview').src = s[10]; el('m-preview').style.display='block'; } else el('m-preview').style.display='none';
    el('m-file-status').innerText = s[14] ? "File SKL Manual sudah ada" : "";

    el('m-nisn').setAttribute('readonly', 'true');
    el('m-nisn').style.background = '#e2e8f0'; 

    el('modal-student').classList.add('active');
}

async function handleSaveStudent(e) {
    e.preventDefault();
    
    // --- VALIDASI NISN WAJIB TEPAT 10 ANGKA ---
    const nisnVal = el('m-nisn').value.trim();
    if(!/^\d{10}$/.test(nisnVal)) {
        return Swal.fire('Peringatan', 'NISN wajib berisi tepat 10 angka!', 'warning');
    }

    showLoader();
    const fileInput = el('m-file-skl-input');
    
        const processSave = async (fileUrl) => {
            const formData = {
              nisn: nisnVal,
              password: el('m-pass').value, 
              nama: String(el('m-nama').value).toUpperCase(), // <--- OTOMATIS KAPITAL
              nis: el('m-nis').value,
              tempat_lahir: String(el('m-tmp').value).toUpperCase(), // <--- OTOMATIS KAPITAL
              tgl_lahir: el('m-tgl').value, 
              jk: el('m-jk').value, 
              kelas: String(el('m-kelas').value).toUpperCase(), // <--- OTOMATIS KAPITAL (Opsional, agar format kelas rapi)
              status: el('m-status').value, 
              link_foto: el('m-foto').value, 
              ucapan: el('m-ucapan').value,
              thn_lulus: el('m-thn').value, 
              nama_ortu: String(el('m-ortu').value).toUpperCase(), // <--- OTOMATIS KAPITAL
              link_file_skl: fileUrl || el('m-file-skl').value
            };
        
        const res = await fetchAPI('adminSaveStudent', { data: formData });
        loadAllData(); 
        el('modal-student').classList.remove('active'); 
        hideLoader(); 
        if(res.status === 'success') Toast.fire('Berhasil', res.message, 'success');
        else Swal.fire('Error', res.message, 'error');
    };

    if(fileInput.files.length > 0) {
        const file = fileInput.files[0];
        if(file.size > 409600) { hideLoader(); return Swal.fire('File Terlalu Besar', 'Ukuran file SKL maksimal 400Kb', 'error'); }
        const reader = new FileReader();
        reader.onload = async function(e) {
            const filename = "FILE_SKL_" + nisnVal + ".pdf";
            const upRes = await fetchAPI('uploadFileToDrive', {
                base64Data: e.target.result, 
                filename: filename, 
                folderId: ALL_DATA.settings['SKL_FOLDER_ID'], 
                mimeType: file.type
            });
            processSave(upRes.data); 
        };
        reader.readAsDataURL(file);
    } else { 
        processSave(null); 
    }
}

function deleteStudent(nisn) {
    Swal.fire({ title: 'Hapus?', text: "Data nilai juga akan terhapus!", icon: 'warning', showCancelButton: true, confirmButtonText: 'Ya, Hapus' }).then(async (result) => {
      if (result.isConfirmed) {
        showLoader();
        const res = await fetchAPI('adminDeleteStudent', { nisn: nisn });
        loadAllData(); 
        hideLoader(); 
        if(res.status === 'success') Toast.fire('Dihapus', res.message, 'success');
      }
    });
}

function resetManual() {
  Swal.fire({
    title: 'Reset Password Siswa',
    text: 'Masukkan NISN siswa untuk mengembalikan password ke 123456',
    input: 'text',
    inputPlaceholder: 'Ketik NISN di sini...',
    showCancelButton: true,
    confirmButtonText: 'Reset Sekarang',
    confirmButtonColor: '#f59e0b',
    showLoaderOnConfirm: true,
    preConfirm: (nisn) => {
      if (!nisn) Swal.showValidationMessage('NISN tidak boleh kosong!');
      return nisn;
    }
  }).then(async (result) => {
    if (result.isConfirmed) {
      showLoader(); 
      const res = await fetchAPI('adminResetPassword', { nisn: result.value });
      hideLoader();
      if (res.data && res.data.includes("Error")) {
        Swal.fire('Gagal', res.data, 'error');
      } else {
        Swal.fire('Berhasil!', 'Sandi NISN ' + result.value + ' telah direset.', 'success');
        loadAllData();
      }
    }
  });
}


// ==========================================
// 8. MAPEL & GRADES CRUD
// ==========================================
function renderSubjects(data) {
    const tbody = el('tbl-subjects').querySelector('tbody'); tbody.innerHTML = '';
    data.forEach(row => {
      const tr = document.createElement('tr');
      // Menampilkan data kelas (jika kosong, tampilkan badge 'Semua Kelas')
      const targetKelas = row[4] ? row[4] : '<span style="color:#10b981;font-weight:bold;">Semua Kelas</span>';
      
      tr.innerHTML = `<td><button class="btn btn-danger btn-sm" onclick='deleteMapel("${row[0]}")'>Hapus</button></td><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td><td>${row[3]}</td><td>${targetKelas}</td>`;
      tbody.appendChild(tr);
    });
}

function openMapelModal() { 
    el('modal-mapel').classList.add('active'); 
    el('mp-id').value=''; 
    el('mp-nama').value=''; 
    el('mp-kelas').value=''; // Kosongkan inputan baru
}

async function handleSaveMapel(e) { 
    e.preventDefault(); showLoader(); 
    // Tambahkan payload kls
    const payload = { i: el('mp-id').value, n: el('mp-nama').value, k: el('mp-kkm').value, c: el('mp-cat').value, kls: el('mp-kelas').value };
    await fetchAPI('adminSaveMapel', payload);
    loadAllData(); 
    el('modal-mapel').classList.remove('active'); 
    hideLoader(); 
}

async function deleteMapel(id) { 
    if(!confirm('Hapus Mapel ini?')) return; 
    showLoader(); 
    await fetchAPI('adminDeleteMapel', { id: id });
    loadAllData(); 
    hideLoader();
}

function loadGradesView(nisn) {
    if(!nisn) { el('grade-container').classList.add('hidden'); return; }
    SELECTED_STUDENT_ID = nisn;
    const student = ALL_DATA.students.find(x => String(x[0]) == String(nisn));
    el('grade-student-name').innerText = student ? student[2] : '';
    
    // --- FILTER MAPEL BERDASARKAN KELAS SISWA ---
    const studentClass = student ? String(student[7]).trim() : '';
    const filteredSubjects = ALL_DATA.subjects.filter(sub => {
        const subClass = sub[4] ? String(sub[4]).trim() : '';
        if(subClass === '') return true; // Mapel Umum
        return subClass.split(',').map(x=>x.trim()).includes(studentClass);
    });

    const existingGrades = ALL_DATA.grades.filter(g => String(g[1]) == String(nisn));
    const tbody = el('tbl-grades-input').querySelector('tbody'); tbody.innerHTML = '';
    
    // Looping menggunakan mapel yang sudah difilter
    filteredSubjects.forEach(sub => {
       const g = existingGrades.find(x => String(x[2]) == String(sub[0]));
       const tr = document.createElement('tr');
       tr.innerHTML = `<td>${sub[1]}</td><td><input type="number" class="form-input grade-p" data-id="${sub[0]}" value="${g ? g[3] : 0}" onkeyup="validateGrade(this)" onchange="validateGrade(this); calcGrades()"></td><td><input type="number" class="form-input grade-k" value="${g ? g[4] : 0}" onkeyup="validateGrade(this)" onchange="validateGrade(this); calcGrades()"></td><td><input type="text" class="form-input grade-s" value="${g ? g[5] : 'B'}"></td>`;
       tbody.appendChild(tr);
    });
    el('grade-container').classList.remove('hidden');
    calcGrades();
}

function validateGrade(input) {
    let val = parseFloat(input.value);
    if(val > 100) { Swal.fire('Error', 'Nilai maksimal adalah 100!', 'warning'); input.value = ''; return; }
    if (event.type === 'change' && input.value !== "") { input.value = parseFloat(val).toFixed(2); }
}
function calcGrades() {
    let sumP = 0, sumK = 0, count = 0;
    document.querySelectorAll('.grade-p').forEach(i => { sumP += parseFloat(i.value||0); count++; });
    document.querySelectorAll('.grade-k').forEach(i => { sumK += parseFloat(i.value||0); });
    el('calc-sum-p').innerText = sumP; el('calc-sum-k').innerText = sumK;
    el('calc-avg-p').innerText = count > 0 ? (sumP/count).toFixed(2) : 0; el('calc-avg-k').innerText = count > 0 ? (sumK/count).toFixed(2) : 0;
}
async function saveGrades() {
    const grades = [];
    const rows = el('tbl-grades-input').querySelectorAll('tbody tr');
    rows.forEach(tr => { grades.push({ id_mapel: tr.querySelector('.grade-p').getAttribute('data-id'), p: tr.querySelector('.grade-p').value, k: tr.querySelector('.grade-k').value, s: tr.querySelector('.grade-s').value }); });
    showLoader();
    const res = await fetchAPI('adminSaveGrades', { n: SELECTED_STUDENT_ID, g: grades });
    loadAllData(); 
    hideLoader(); 
    if(res.status==='success') Toast.fire('Tersimpan', res.data, 'success');
}


// ==========================================
// 9. SKL GENERATOR & EXCEL IMPORT
// ==========================================

// Logika Tampilan Tab
function switchSklTab(tab) {
    if(tab === 'setting') {
        el('skl-section-setting').classList.remove('hidden');
        el('skl-section-siswa').classList.add('hidden');
        el('tab-btn-setting').className = 'btn btn-primary';
        el('tab-btn-siswa').className = 'btn btn-outline';
    } else {
        el('skl-section-setting').classList.add('hidden');
        el('skl-section-siswa').classList.remove('hidden');
        el('tab-btn-setting').className = 'btn btn-outline';
        el('tab-btn-siswa').className = 'btn btn-primary';
        renderSklTable();
    }
}

async function saveSKLSettingsJS() {
    const form = { no_surat: el('skl-no').value, tempat_surat: el('skl-tempat').value, tgl_surat: el('skl-tgl').value, dasar1: el('skl-d1').value, dasar2: el('skl-d2').value, kepsek_nama: el('skl-kepsek').value, kepsek_nip: el('skl-nip').value, kepsek_pangkat: el('skl-pangkat').value, tembusan: el('skl-cc').value };
    showLoader(); 
    await fetchAPI('saveSKLSettings', { f: form });
    loadAllData(); hideLoader(); Toast.fire('Disimpan', 'Pengaturan SKL disimpan', 'success');
}

function getSKLFormData(nisn) {
    // Sekarang menerima nisn langsung dari tombol, bukan dari inputan manual
    return { nisn: nisn, no_surat: el('skl-no').value, tempat_surat: el('skl-tempat').value, tgl_surat: el('skl-tgl').value, dasar1: el('skl-d1').value, dasar2: el('skl-d2').value, kepsek_nama: el('skl-kepsek').value, kepsek_nip: el('skl-nip').value, kepsek_pangkat: el('skl-pangkat').value, tembusan: el('skl-cc').value };
}

function populateSklClassFilter() {
    const selKelas = el('skl-filter-kelas');
    if(!selKelas) return;
    const uniqueClasses = [...new Set(ALL_DATA.students.map(s => String(s[7]).trim()).filter(c => c !== ''))].sort();
    
    selKelas.innerHTML = '<option value="">-- Tampilkan Semua Kelas --</option>';
    uniqueClasses.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.innerText = c;
        selKelas.appendChild(opt);
    });
    renderSklTable();
}

function renderSklTable() {
    const selectedClass = el('skl-filter-kelas').value;
    const tbody = el('tbl-skl-siswa').querySelector('tbody');
    tbody.innerHTML = '';
    
    let filtered = ALL_DATA.students;
    if (selectedClass !== '') {
        filtered = filtered.filter(s => String(s[7]).trim() === selectedClass);
    }
    
    filtered.sort((a, b) => String(a[2]).localeCompare(String(b[2]))); // Urut Alfabet
    
    filtered.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row[0]}</td>
            <td><b>${row[2]}</b></td>
            <td>${row[6]}</td>
            <td>${row[7]}</td>
            <td style="white-space:nowrap;">
                <button class="btn btn-danger btn-sm" onclick="printSingleSKL('${row[0]}', 'pdf')">PDF</button>
                <button class="btn btn-primary btn-sm" onclick="printSingleSKL('${row[0]}', 'doc')">DOC</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function printSingleSKL(nisn, format) {
    showLoader();
    const formData = getSKLFormData(nisn);
    
    // Agar sinkron dengan fitur folder kelas, PDF dan DOC sama-sama kita proses di Drive
    const actionName = format === 'doc' ? 'generateSKLDoc' : 'generateSKLPdfToDrive';
    const result = await fetchAPI(actionName, { formData: formData });
    
    hideLoader(); 
    
    if(result.data && result.data.status === 'success') { 
        const driveUrl = result.data.url;
        let downloadUrl = driveUrl;
        
        // Ekstrak ID File dari URL untuk mengubahnya menjadi link Direct Download
        const match = driveUrl.match(/[-\w]{25,}/);
        if(match) {
            const fileId = match[0];
            if(format === 'doc') {
                // Link download khusus file Google Docs -> ke .docx
                downloadUrl = `https://docs.google.com/document/d/${fileId}/export?format=docx`;
            } else {
                // Link download khusus file dari Google Drive
                downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
            }
        }
        
        // Modal Pop-Up dengan 2 Tombol Berwarna
        Swal.fire({ 
            title: 'Berhasil Dicetak!', 
            html: `Dokumen SKL atas nama siswa berhasil dibuat ke dalam folder kelas.<br><br>
                   <div style="display:flex; justify-content:center; gap:10px; margin-top:20px;">
                       <a href="${driveUrl}" target="_blank" style="padding:10px 20px; background:#2563eb; color:white; border-radius:10px; text-decoration:none; font-weight:bold; font-size:0.95rem; box-shadow:0 4px 6px rgba(37,99,235,0.2); transition:0.2s;">📂 BUKA DI DRIVE</a>
                       <a href="${downloadUrl}" style="padding:10px 20px; background:#10b981; color:white; border-radius:10px; text-decoration:none; font-weight:bold; font-size:0.95rem; box-shadow:0 4px 6px rgba(16,185,129,0.2); transition:0.2s;">⬇️ UNDUH FILE</a>
                   </div>`,
            icon: 'success', 
            showConfirmButton: false, // Sembunyikan tombol OK bawaan
            showCloseButton: true // Munculkan tanda (X) di pojok kanan atas
        }); 
    } 
    else { 
        Swal.fire('Error', result.message || result.data.message, 'error'); 
    }
}

// FUNGSI SUPER: CETAK MASSAL OTOMATIS (SMART BATCHING)
async function batchPrintSKL(format) {
    const selectedClass = el('skl-filter-kelas').value;
    if (!selectedClass) return Swal.fire('Pilih Kelas', 'Silakan pilih kelas pada kolom filter terlebih dahulu!', 'warning');
    
    const students = ALL_DATA.students.filter(s => String(s[7]).trim() === selectedClass);
    if (students.length === 0) return Swal.fire('Kosong', 'Tidak ada siswa di kelas ini', 'info');

    const confirm = await Swal.fire({
        title: `Cetak ${students.length} SKL?`,
        text: `Sistem akan memproses ${students.length} file ${format.toUpperCase()} secara bergantian dan menyimpannya ke Folder Google Drive.`,
        icon: 'question',
        showCancelButton: true, confirmButtonText: 'Ya, Mulai!', cancelButtonText: 'Batal'
    });

    if (!confirm.isConfirmed) return;

    let successCount = 0;
    let failCount = 0;

    Swal.fire({
        title: 'Memproses Batch...',
        html: `Menyiapkan Data...<br><br><small>Mohon jangan tutup atau muat ulang halaman ini.</small>`,
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    // Panggil fungsi PDF Drive yang baru atau fungsi Doc bawaan
    const actionName = format === 'pdf' ? 'generateSKLPdfToDrive' : 'generateSKLDoc';

    for (let i = 0; i < students.length; i++) {
        const nisn = students[i][0];
        Swal.getHtmlContainer().innerHTML = `Mencetak Siswa: <b>${students[i][2]}</b><br>Progres: <b>${i + 1}</b> / ${students.length}<br><br><small>Menyimpan ke Google Drive...</small>`;
        
        const formData = getSKLFormData(nisn);
        const res = await fetchAPI(actionName, { formData: formData });
        
        if (res.data && res.data.status === 'success') { successCount++; } 
        else { failCount++; console.error(`Gagal: ${nisn}`, res); }
    }

    let folderUrl = "https://drive.google.com/drive/my-drive";
    if (ALL_DATA.settings['SKL_FOLDER_ID']) folderUrl = `https://drive.google.com/drive/folders/${ALL_DATA.settings['SKL_FOLDER_ID']}`;

    Swal.fire({
        title: 'Selesai!',
        html: `Berhasil: <b>${successCount}</b><br>Gagal: <b>${failCount}</b><br><br>Semua file telah disimpan di Folder SKL Google Drive Anda.`,
        icon: successCount > 0 ? 'success' : 'warning',
        confirmButtonText: 'Buka Folder Drive',
        showCancelButton: true, cancelButtonText: 'Tutup'
    }).then((result) => {
        if (result.isConfirmed) window.open(folderUrl, '_blank');
        loadAllData(); // Refresh data supaya link manual terupdate
    });
}

// ==========================================
// 10. SYSTEM SETTINGS
// ==========================================
function renderSettings(s) {
    if(!s) return;
    el('set-instansi').value = s.NAMA_INSTANSI || ''; el('set-dinas').value = s.NAMA_DINAS || '';
    el('set-sekolah').value = s.NAMA_SEKOLAH || ''; el('set-alamat').value = s.ALAMAT_SEKOLAH || '';
    el('set-logo-sek').value = s.LOGO_SEKOLAH || ''; el('set-logo-ins').value = s.LOGO_INSTANSI || '';
    el('set-template-id').value = s.TEMPLATE_DOC_ID || ''; el('set-folder-skl').value = s.SKL_FOLDER_ID || '';
    el('set-folder-foto').value = s.PHOTO_FOLDER_ID || ''; el('set-user').value = s.ADMIN_USER || '';
    el('set-pass').value = s.ADMIN_PASS || '';
    el('set-web').value = s.WEB_SEKOLAH || ''; el('set-hp').value = s.NOMOR_HP || '';
    
    if(s.WAKTU_PENGUMUMAN) {
       const d = new Date(s.WAKTU_PENGUMUMAN);
       const pad = n => n<10?'0'+n:n;
       const dateStr = d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
       el('set-waktu').value = dateStr;
    }
    
    el('h-nama-sek').innerText = s.NAMA_SEKOLAH;
    el('h-logo-sek').src = s.LOGO_SEKOLAH;
    el('l-nama-ins').innerText = s.NAMA_INSTANSI; el('l-nama-sek').innerText = s.NAMA_SEKOLAH;
    if(s.LOGO_INSTANSI) { el('l-logo-ins').src = s.LOGO_INSTANSI; el('l-logo-ins').style.display='block'; el('s-logo-ins').src = s.LOGO_INSTANSI; el('s-logo-ins').style.display='block'; }
    if(s.LOGO_SEKOLAH) { el('l-logo-sek').src = s.LOGO_SEKOLAH; el('l-logo-sek').style.display='block'; el('s-logo-sek').src = s.LOGO_SEKOLAH; el('s-logo-sek').style.display='block'; }
    
    el('skl-no').value = s.SKL_NO_SURAT || ''; el('skl-d1').value = s.SKL_DASAR1 || '';
    el('skl-d2').value = s.SKL_DASAR2 || ''; el('skl-tgl').value = s.SKL_TGL_SURAT || '';
    el('skl-tempat').value = s.SKL_TEMPAT_SURAT || ''; el('skl-kepsek').value = s.SKL_KEPSEK_NAMA || '';
    el('skl-nip').value = s.SKL_KEPSEK_NIP || ''; el('skl-pangkat').value = s.SKL_KEPSEK_PANGKAT || '';
    el('skl-cc').value = s.SKL_TEMBUSAN || '';
}

async function saveSettings(e) {
    e.preventDefault();
    const form = {
        NAMA_INSTANSI: el('set-instansi').value, NAMA_DINAS: el('set-dinas').value, NAMA_SEKOLAH: el('set-sekolah').value,
        ALAMAT_SEKOLAH: el('set-alamat').value, LOGO_SEKOLAH: el('set-logo-sek').value, LOGO_INSTANSI: el('set-logo-ins').value,
        TEMPLATE_DOC_ID: el('set-template-id').value, SKL_FOLDER_ID: el('set-folder-skl').value, PHOTO_FOLDER_ID: el('set-folder-foto').value,
        ADMIN_USER: el('set-user').value, ADMIN_PASS: el('set-pass').value, WAKTU_PENGUMUMAN: el('set-waktu').value,
        WEB_SEKOLAH: el('set-web').value, NOMOR_HP: el('set-hp').value
    };
    showLoader();
    await fetchAPI('adminSaveSettings', { f: form });
    loadAllData(); hideLoader(); Toast.fire('Tersimpan', 'Pengaturan disimpan', 'success');
}


// ==========================================
// 11. CROPPER & EXCEL IMPORT UI
// ==========================================
function cropImg(type, targetId) {
    UPLOAD_TARGET_ID = targetId;
    if(type === 'logo') { CROP_RATIO = 1; CROP_MIME = 'image/png'; } else { CROP_RATIO = 3/4; CROP_MIME = 'image/jpeg'; }
    el('modal-crop').classList.add('active');
    if(CROPPER) { CROPPER.destroy(); CROPPER = null; }
    el('crop-img').src = ''; el('file-input').value = '';
}
el('file-input').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if(file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            el('crop-img').src = ev.target.result;
            if(CROPPER) CROPPER.destroy();
            CROPPER = new Cropper(el('crop-img'), { aspectRatio: CROP_RATIO, viewMode: 1, background: false });
        };
        reader.readAsDataURL(file);
    }
});

async function doCrop() {
    if(!CROPPER) return;
    
    showLoader();
    
    try {
        // Tentukan ukuran agar ringan (Logo max 150px, Foto max 200px)
        const maxWidth = CROP_MIME === 'image/png' ? 150 : 200;
        
        // Ambil gambar dari Cropper
        const canvas = CROPPER.getCroppedCanvas({ 
            width: maxWidth, 
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high' 
        });

        if (!canvas) throw new Error("Canvas gagal dimuat");

        // Jadikan teks Base64 langsung dengan kompresi 70%
        const base64String = canvas.toDataURL(CROP_MIME || 'image/jpeg', 0.7);
        
        // Masukkan Base64 ke dalam input teks (INI YANG BIKIN UNDEFINED SEBELUMNYA JIKA SALAH)
        el(UPLOAD_TARGET_ID).value = base64String;
        
        // Tampilkan preview jika yang di-upload adalah foto siswa
        if(UPLOAD_TARGET_ID === 'm-foto') { 
            el('m-preview').src = base64String; 
            el('m-preview').style.display='block'; 
        }
        
        el('modal-crop').classList.remove('active'); 
    } catch (e) {
        console.error("Gagal Crop:", e);
        Swal.fire('Error', 'Gagal memotong gambar', 'error');
    }
    
    hideLoader();
}

function openImport(type) { el('modal-import').classList.add('active'); el('modal-import').setAttribute('data-type', type); }

function downloadTemplate() {
    const type = el('modal-import').getAttribute('data-type');
    let csv = "";
    
    if(type == 'students') {
        // Urutan ini SEKARANG COCOK 100% dengan kolom A sampai O di Google Sheets
        csv = "NISN,PASSWORD,NAMA,NIS,TEMPAT_LAHIR,TGL_LAHIR(YYYY-MM-DD),JK(L/P),KELAS,STATUS,LINK_SKL(KOSONGKAN),LINK_FOTO(KOSONGKAN),UCAPAN,THN_LULUS,NAMA_ORTU,LINK_FILE_MANUAL(KOSONGKAN)";
    }
    else if(type == 'subjects') {
        csv = "ID,NAMA_MAPEL,KKM,KATEGORI,KELAS_TUJUAN(KOSONGKAN JIKA UMUM)";
    }
    else if(type == 'grades') {
        csv = "NISN,ID_MAPEL,PENGETAHUAN,KETERAMPILAN,SIKAP";
    }
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); 
    a.href = url; 
    a.download = 'template_' + type + '.csv'; 
    a.click();
}

function doImport() {
    const file = el('import-file').files[0];
    if(!file) return Swal.fire('Pilih file dulu');
    const type = el('modal-import').getAttribute('data-type');
    showLoader();
    const reader = new FileReader();
    reader.onload = async function(e) {
        const data = e.target.result;
        const workbook = XLSX.read(data, {type: 'binary'});
        const sheetName = workbook.SheetNames[0];
        
        // PENTING: Tambahkan raw: false agar format teks bawaan Excel dipertahankan
        const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {header: 1, raw: false});
        if(json.length > 0) json.shift(); 
        
        let maxCols = 0;
        if(type === 'students') maxCols = 15;
        if(type === 'subjects') maxCols = 5;
        if(type === 'grades') maxCols = 5;

        const normalizedData = json.map(row => {
            let newRow = [...row];
            while(newRow.length < maxCols) newRow.push('');
            newRow = newRow.slice(0, maxCols); 
            
            // --- KAPITALISASI OTOMATIS & PERBAIKAN NISN ---
            if (type === 'students') {
                if (newRow[2]) newRow[2] = String(newRow[2]).toUpperCase(); // Nama
                if (newRow[4]) newRow[4] = String(newRow[4]).toUpperCase(); // Tempat Lahir
                if (newRow[7]) newRow[7] = String(newRow[7]).toUpperCase(); // Kelas
                if (newRow[13]) newRow[13] = String(newRow[13]).toUpperCase(); // Ortu

                // Trik mengembalikan angka 0 di depan NISN
                if (newRow[0]) {
                    let nisnStr = String(newRow[0]).replace(/\D/g, ''); 
                    if (nisnStr.length > 0 && nisnStr.length < 10) {
                        newRow[0] = nisnStr.padStart(10, '0');
                    } else {
                        newRow[0] = nisnStr;
                    }
                }
            }
            
            // Trik mengembalikan angka 0 di depan NISN untuk input nilai
            if (type === 'grades' && newRow[0]) {
                let nisnStr = String(newRow[0]).replace(/\D/g, ''); 
                if (nisnStr.length > 0 && nisnStr.length < 10) {
                    newRow[0] = nisnStr.padStart(10, '0');
                } else {
                    newRow[0] = nisnStr;
                }
            }

            return newRow;
        });

        const finalData = normalizedData.filter(row => row.join('').trim() !== '');

        if(finalData.length === 0) {
            hideLoader(); 
            return Swal.fire('Error', 'File kosong atau format salah!', 'error');
        }
        
        // --- VALIDASI BLOKIR JIKA ADA NISN > 10 ANGKA ATAU MASIH SALAH ---
        if (type === 'students' || type === 'grades') {
            const invalidNISN = finalData.find(r => r[0].length !== 10);
            if (invalidNISN) {
                hideLoader();
                return Swal.fire('Error Import', `Gagal! Ditemukan NISN yang panjangnya tidak 10 angka: ${invalidNISN[0]}. Silakan perbaiki file Anda.`, 'error');
            }
        }
        
        const res = await fetchAPI('importDataBatch', { t: type, r: finalData });
        hideLoader(); 
        el('modal-import').classList.remove('active'); 
        loadAllData(); 
        
        if(res.status === 'success') {
            Swal.fire('Sukses', res.data, 'success');
        } else {
            Swal.fire('Error', res.message, 'error');
        }
    };
    reader.readAsBinaryString(file);
}


// ==========================================
// 12. STUDENT VIEW (KELULUSAN)
// ==========================================
// --- FUNGSI TAMPILAN DASHBOARD SISWA (ANTI-CRASH) ---
function renderStudentView(res) {
    try {
        const s = res.data || {}; 
        const set = res.settings || {};

        el('s-nama-ins-text').innerText = set.NAMA_INSTANSI || 'PEMERINTAH';
        el('s-nama-sek-text').innerText = set.NAMA_SEKOLAH || 'SEKOLAH';
        el('s-nama-sek').innerText = set.NAMA_SEKOLAH || 'SEKOLAH';

        if(set.LOGO_INSTANSI) { el('s-logo-ins').src = set.LOGO_INSTANSI; el('s-logo-ins').style.display='block'; }
        if(set.LOGO_SEKOLAH) { el('s-logo-sek').src = set.LOGO_SEKOLAH; el('s-logo-sek').style.display='block'; }

        el('res-nama').innerText = s.nama || '-';
        el('res-nisn').innerText = s.nisn || '-';

        if(s.foto) { el('res-foto').src = s.foto; el('res-foto').style.display='block'; }

        // Jika Pengumuman Dibuka
        if (res.isOpen) {
            el('res-content-locked').classList.add('hidden');
            el('res-content-open').classList.remove('hidden');

            el('res-nis').innerText = s.nis || '-';
            el('res-ttl').innerText = s.ttl || '-';
            el('res-kelas').innerText = s.kelas || '-';
            el('res-ortu').innerText = s.ortu || '-';

            // Cek apakah data nilai lengkap
            if(res.grades && res.subjects && res.grades.length > 0) {
                renderStudentResult(res);
            } else {
                el('res-table-container').innerHTML = '<div style="text-align:center; padding:20px; color:#ef4444; background:#fef2f2; border-radius:10px; border:1px solid #fecaca;">Data nilai belum tersedia. Jika ini kesalahan, harap lapor ke Admin.</div>';
            }
        } 
        // Jika Pengumuman Belum Dibuka
        else {
            el('res-content-locked').classList.remove('hidden');
            el('res-content-open').classList.add('hidden');

            const target = res.targetTime;
            if(COUNTDOWN_INTERVAL) clearInterval(COUNTDOWN_INTERVAL);

            const checkTime = () => {
                const now = new Date().getTime();
                const diff = target ? (target - now) : 0;
                
                if(diff > 0) {
                    const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                    const sec = Math.floor((diff % (1000 * 60)) / 1000);
                    el('res-timer').innerText = `${h}j ${m}m ${sec}d`;
                } else {
                    clearInterval(COUNTDOWN_INTERVAL);
                    // PENTING: Saat jam habis, paksa Logout agar Cache lama terhapus saat mereka login ulang!
                    el('res-timer').innerHTML = `<span style="font-size:1.1rem; color:#b91c1c;">Waktu Tiba!</span><br><button onclick="doLogout()" class="btn btn-danger" style="margin-top:10px; font-size:0.9rem; border-radius:20px; box-shadow:0 4px 10px rgba(239, 68, 68, 0.3);">🔄 Login Ulang Untuk Melihat Hasil</button>`;
                }
            };
            
            checkTime();
            COUNTDOWN_INTERVAL = setInterval(checkTime, 1000);
        }
    } catch (error) {
        console.error(error);
        Swal.fire('Error Sistem', 'Terjadi kegagalan saat memuat data: ' + error.message, 'error');
    }
}

// --- FUNGSI MENGGAMBAR TABEL NILAI SISWA ---
function renderStudentResult(res) {
    try {
        const s = res.data || {};
        const grades = res.grades || [];
        const subjects = res.subjects || [];

        el('res-status').innerText = s.status || '-';
        
        // Memastikan warna kelulusan selalu ada walau tanpa class CSS tambahan
        const statusBg = s.status === 'LULUS' ? '#d1fae5' : '#fee2e2';
        const statusColor = s.status === 'LULUS' ? '#059669' : '#b91c1c';
        el('res-status').style.cssText = `display:inline-block; padding:6px 15px; border-radius:20px; font-weight:800; font-size:0.9rem; background:${statusBg}; color:${statusColor};`;

        el('res-ucapan').innerText = s.ucapan || (s.status == 'LULUS' ? 'Selamat, Anda Lulus!' : 'Mohon maaf, Anda belum lulus.');

        const studentClass = String(s.kelas || '').trim().toUpperCase();
        const filteredSubjects = subjects.filter(sub => {
            const subClass = sub[4] ? String(sub[4]).trim().toUpperCase() : '';
            if(subClass === '') return true;
            return subClass.split(',').map(x=>x.trim()).includes(studentClass);
        });

        let sum = 0, count = 0;
        
        let tableHTML = `
        <table style="width:100%; border-collapse: collapse; margin-top: 25px; font-size: 0.85rem; text-align: left; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <thead>
                <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0;">
                    <th style="padding:12px 15px; font-weight:700; color:#475569;">MATA PELAJARAN</th>
                    <th style="padding:12px 15px; font-weight:700; text-align:center; color:#475569;">NILAI</th>
                </tr>
            </thead>
            <tbody>
        `;

        filteredSubjects.forEach((sub) => {
            const g = grades.find(x => String(x[2]) == String(sub[0]));
            const val = g ? parseFloat(g[3]) : 0;
            sum += val; count++;

            tableHTML += `
                <tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:12px 15px; color:#334155;">${sub[1]}</td>
                    <td style="padding:12px 15px; text-align:center; font-weight:700; color:#0f172a;">${val}</td>
                </tr>
            `;
        });

        const avg = count > 0 ? (sum/count).toFixed(2) : 0;
        el('res-avg').innerText = avg; 

        tableHTML += `
            </tbody>
            <tfoot>
                <tr style="background:#f8fafc; border-top:2px solid #cbd5e1;">
                    <td style="padding:12px 15px; text-align:right; font-weight:700; color:#334155;">JUMLAH</td>
                    <td style="padding:12px 15px; text-align:center; font-weight:800; color:#2563eb; font-size:1rem;">${sum.toFixed(2)}</td>
                </tr>
                <tr style="background:#f8fafc;">
                    <td style="padding:12px 15px; text-align:right; font-weight:700; color:#334155;">RATA-RATA</td>
                    <td style="padding:12px 15px; text-align:center; font-weight:800; color:#2563eb; font-size:1rem;">${avg}</td>
                </tr>
            </tfoot>
        </table>
        `;

        el('res-table-container').innerHTML = tableHTML;

        const btnDl = el('btn-download-skl');
        if(s.link_file_skl && s.link_file_skl.length > 10) {
            btnDl.classList.remove('hidden');
            btnDl.onclick = () => window.open(s.link_file_skl, '_blank');
            btnDl.innerHTML = "📥 DOWNLOAD DOKUMEN SKL";
        } else {
            btnDl.classList.add('hidden');
        }
    } catch (error) {
        console.error(error);
        Swal.fire('Error Tabel', 'Gagal merender nilai: ' + error.message, 'error');
    }
}

function openPrivacy() { el('modal-privacy').classList.add('active'); }
function closeModal(id) { el(id).classList.remove('active'); }
function openChangePass() { el('modal-pass').classList.add('active'); }

async function handleChangePass(e) {
    e.preventDefault();
    const oldP = el('pass-old').value;
    const newP = el('pass-new').value;
    const nisn = CURRENT_USER.data.nisn;
    showLoader();
    
    const res = await fetchAPI('studentChangePassword', { nisn: nisn, oldPass: oldP, newPass: newP });
    hideLoader();
    
    if(res.data && res.data.includes("Sukses")) {
       el('modal-pass').classList.remove('active');
       Swal.fire('Sukses', res.data, 'success');
    } else { Swal.fire('Gagal', res.data, 'error'); }
}
