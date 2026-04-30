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
});


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
        
        // --- SIMPAN SESI KE BROWSER ---
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
    const select = el('grade-sel-siswa');
    if(!select) return;
    select.innerHTML = '<option value="">-- Pilih Siswa --</option>';
    ALL_DATA.students.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s[0]; // NISN
        opt.innerText = s[2] + " (" + s[7] + ")"; // Nama (Kelas)
        select.appendChild(opt);
    });
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
    el('m-ortu').value = ''; el('m-status').value = 'LULUS';
    el('m-foto').value = ''; el('m-ucapan').value = '';
    el('m-file-skl').value = ''; el('m-preview').style.display = 'none'; el('m-file-status').innerText = '';
    el('modal-student').classList.add('active');
}

function editStudent(nisn) {
    const s = ALL_DATA.students.find(x => String(x[0]) == String(nisn));
    if(!s) return;
    el('m-nisn').value = s[0]; el('m-pass').value = s[1];
    el('m-nama').value = s[2]; el('m-nis').value = s[3];
    el('m-tmp').value = s[4]; el('m-tgl').value = s[5]; 
    el('m-jk').value = s[6]; el('m-thn').value = s[12];
    el('m-ortu').value = s[13]; el('m-status').value = s[8];
    el('m-foto').value = s[10]; el('m-ucapan').value = s[11];
    el('m-file-skl').value = s[14] || ''; 
    if(s[10]) { el('m-preview').src = s[10]; el('m-preview').style.display='block'; } else el('m-preview').style.display='none';
    el('m-file-status').innerText = s[14] ? "File SKL Manual sudah ada" : "";
    el('modal-student').classList.add('active');
}

async function handleSaveStudent(e) {
    e.preventDefault();
    showLoader();
    const fileInput = el('m-file-skl-input');
    
    const processSave = async (fileUrl) => {
        const formData = {
          nisn: el('m-nisn').value, password: el('m-pass').value, nama: el('m-nama').value, nis: el('m-nis').value,
          tempat_lahir: el('m-tmp').value, tgl_lahir: el('m-tgl').value, jk: el('m-jk').value, kelas: 'XII', 
          status: el('m-status').value, link_foto: el('m-foto').value, ucapan: el('m-ucapan').value,
          thn_lulus: el('m-thn').value, nama_ortu: el('m-ortu').value, link_file_skl: fileUrl || el('m-file-skl').value
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
            const filename = "FILE_SKL_" + el('m-nisn').value + ".pdf";
            const upRes = await fetchAPI('uploadFileToDrive', {
                base64Data: e.target.result, 
                filename: filename, 
                folderId: ALL_DATA.settings['SKL_FOLDER_ID'], 
                mimeType: file.type
            });
            processSave(upRes.data); // upRes.data returns the direct URL or message string
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
      tr.innerHTML = `<td><button class="btn btn-danger btn-sm" onclick='deleteMapel("${row[0]}")'>Hapus</button></td><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td><td>${row[3]}</td>`;
      tbody.appendChild(tr);
    });
}
function openMapelModal() { el('modal-mapel').classList.add('active'); el('mp-id').value=''; el('mp-nama').value=''; }

async function handleSaveMapel(e) { 
    e.preventDefault(); showLoader(); 
    const payload = { i: el('mp-id').value, n: el('mp-nama').value, k: el('mp-kkm').value, c: el('mp-cat').value };
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
    const existingGrades = ALL_DATA.grades.filter(g => String(g[1]) == String(nisn));
    const tbody = el('tbl-grades-input').querySelector('tbody'); tbody.innerHTML = '';
    ALL_DATA.subjects.forEach(sub => {
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
async function saveSKLSettingsJS() {
    const form = { no_surat: el('skl-no').value, tempat_surat: el('skl-tempat').value, tgl_surat: el('skl-tgl').value, dasar1: el('skl-d1').value, dasar2: el('skl-d2').value, kepsek_nama: el('skl-kepsek').value, kepsek_nip: el('skl-nip').value, kepsek_pangkat: el('skl-pangkat').value, tembusan: el('skl-cc').value };
    showLoader(); 
    await fetchAPI('saveSKLSettings', { f: form });
    loadAllData(); hideLoader(); Toast.fire('Disimpan', 'Pengaturan SKL disimpan', 'success');
}

function getSKLFormData() {
    return { nisn: el('skl-siswa').value, no_surat: el('skl-no').value, tempat_surat: el('skl-tempat').value, tgl_surat: el('skl-tgl').value, dasar1: el('skl-d1').value, dasar2: el('skl-d2').value, kepsek_nama: el('skl-kepsek').value, kepsek_nip: el('skl-nip').value, kepsek_pangkat: el('skl-pangkat').value, tembusan: el('skl-cc').value };
}

async function generateSKL() {
    if(!el('skl-siswa').value) return Swal.fire('Pilih Siswa dulu');
    showLoader();
    const result = await fetchAPI('generateSKLDoc', { formData: getSKLFormData() });
    hideLoader(); 
    const res = result.data;
    if(res && res.status === 'success') { Swal.fire({ title: 'Berhasil', text: 'Dokumen SKL Dibuat', icon: 'success', footer: `<a href="${res.url}" target="_blank">Buka Dokumen</a>` }); } 
    else Swal.fire('Error', res.message, 'error');
}

async function generatePDF() {
    if(!el('skl-siswa').value) return Swal.fire('Pilih Siswa dulu');
    showLoader();
    const result = await fetchAPI('generateSKLPdf', { formData: getSKLFormData() });
    hideLoader(); 
    const res = result.data;
    if(res && res.status === 'success') { 
        const link = document.createElement('a'); 
        link.href = "data:application/pdf;base64," + res.base64; 
        link.download = res.filename; link.click(); 
    } 
    else Swal.fire('Error', res.message, 'error');
}

function filterSklStudents() {
  var input = el('skl-search-input').value.toLowerCase();
  var select = el('skl-siswa');
  var students = ALL_DATA.students; 
  select.innerHTML = '';
  if (input.length < 1) { select.innerHTML = '<option value="">-- Masukkan Nama/NISN --</option>'; return; }
  var matches = students.filter(function(s) {
    var nisn = s[0].toString().toLowerCase();
    var nama = s[2].toString().toLowerCase();
    return nisn.indexOf(input) > -1 || nama.indexOf(input) > -1;
  });
  if (matches.length > 0) {
    matches.forEach(function(row) {
      var opt = document.createElement('option');
      opt.value = row[0]; 
      opt.innerHTML = row[2] + " (" + row[0] + ")"; 
      select.appendChild(opt);
    });
  } else { select.innerHTML = '<option value="">Data tidak ditemukan...</option>'; }
}

function liveSearchSkl() {
  const input = el('skl-search-input').value.toLowerCase();
  const resultsDiv = el('skl-search-results');
  const targetHidden = el('skl-siswa');
  const students = ALL_DATA.students;
  
  resultsDiv.innerHTML = '';
  if (input.length < 1) { resultsDiv.style.display = 'none'; targetHidden.value = ''; return; }

  const matches = students.filter(s => s[2].toLowerCase().includes(input) || s[0].toString().includes(input));
  const topTen = matches.slice(0, 10);

  if (topTen.length > 0) {
    topTen.forEach(s => {
      const item = document.createElement('div');
      item.style.padding = '10px 15px'; item.style.cursor = 'pointer'; item.style.borderBottom = '1px solid #f1f5f9'; item.style.fontSize = '0.9rem';
      item.innerHTML = `<strong>${s[2]}</strong> <span style="color: #64748b;">(${s[0]})</span>`;
      item.onclick = function() { selectSklStudent(s[2], s[0]); };
      item.onmouseover = () => item.style.background = '#f8fafc'; item.onmouseout = () => item.style.background = 'white';
      resultsDiv.appendChild(item);
    });
    if (matches.length > 10) {
      const info = document.createElement('div');
      info.style.padding = '8px 15px'; info.style.fontSize = '0.75rem'; info.style.color = '#94a3b8'; info.style.background = '#f8fafc'; info.style.textAlign = 'center';
      info.innerText = "Menampilkan 10 dari " + matches.length + " hasil. Persempit pencarian...";
      resultsDiv.appendChild(info);
    }
    resultsDiv.style.display = 'block';
  } else {
    resultsDiv.innerHTML = '<div style="padding:10px; color:#94a3b8;">Tidak ada hasil...</div>';
    resultsDiv.style.display = 'block';
  }
}

function selectSklStudent(nama, nisn) {
  el('skl-search-input').value = nama; 
  el('skl-siswa').value = nisn;        
  el('skl-search-results').style.display = 'none'; 
}

document.addEventListener('click', function(e) {
  if (e.target.id !== 'skl-search-input') { el('skl-search-results').style.display = 'none'; }
});


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
        csv = "ID,NAMA_MAPEL,KKM,KATEGORI";
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
        const json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {header: 1});
        if(json.length > 0) json.shift();
        
        const res = await fetchAPI('importDataBatch', { t: type, r: json });
        hideLoader(); el('modal-import').classList.remove('active'); loadAllData(); Swal.fire('Sukses', res.data, 'success');
    };
    reader.readAsBinaryString(file);
}


// ==========================================
// 12. STUDENT VIEW (KELULUSAN)
// ==========================================
function renderStudentView(res) {
    const s = res.data; const set = res.settings;
    
    el('s-nama-ins-text').innerText = set.NAMA_INSTANSI;
    el('s-nama-sek-text').innerText = set.NAMA_SEKOLAH;
    el('s-nama-sek').innerText = set.NAMA_SEKOLAH;

    if(set.LOGO_INSTANSI) { el('s-logo-ins').src = set.LOGO_INSTANSI; el('s-logo-ins').style.display='block'; }
    if(set.LOGO_SEKOLAH) { el('s-logo-sek').src = set.LOGO_SEKOLAH; el('s-logo-sek').style.display='block'; }

    el('res-nama').innerText = s.nama;
    el('res-nisn').innerText = s.nisn;
    
    if(s.foto) { el('res-foto').src = s.foto; el('res-foto').style.display='block'; }
    
    const target = res.targetTime;
    if(COUNTDOWN_INTERVAL) clearInterval(COUNTDOWN_INTERVAL);
    
    const checkTime = () => {
        const now = new Date().getTime();
        const diff = target - now;
        if(diff > 0) {
            el('res-content-locked').classList.remove('hidden');
            el('res-content-open').classList.add('hidden');
            const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const sec = Math.floor((diff % (1000 * 60)) / 1000);
            el('res-timer').innerText = `${h}j ${m}m ${sec}d`;
        } else {
            clearInterval(COUNTDOWN_INTERVAL);
            el('res-content-locked').classList.add('hidden');
            el('res-content-open').classList.remove('hidden');
            
            // Render Detail (karena timer sudah habis)
            el('res-nis').innerText = s.nis || '-';
            el('res-ttl').innerText = s.ttl || '-';
            el('res-kelas').innerText = s.kelas || '-';
            el('res-ortu').innerText = s.ortu || '-';
            
            renderStudentResult(res);
        }
    };
    checkTime();
    COUNTDOWN_INTERVAL = setInterval(checkTime, 1000);
}

function renderStudentResult(res) {
    const s = res.data;
    const grades = res.grades || [];
    const subjects = res.subjects || [];
    
    el('res-status').innerText = s.status;
    el('res-status').className = 'p-status ' + (s.status == 'LULUS' ? 'status-lulus' : 'status-gagal');
    el('res-ucapan').innerText = s.ucapan || (s.status == 'LULUS' ? 'Selamat, Anda Lulus!' : 'Mohon maaf, Anda belum lulus.');
    
    let sum = 0, count = 0;
    subjects.forEach((sub, i) => {
        const g = grades.find(x => String(x[2]) == String(sub[0]));
        const val = g ? parseFloat(g[3]) : 0;
        sum += val; count++;
    });
    const avg = count > 0 ? (sum/count).toFixed(2) : 0;
    el('res-avg').innerText = avg;

    el('res-table-container').innerHTML = ''; 

    const btnDl = el('btn-download-skl');
    if(s.link_file_skl && s.link_file_skl.length > 10) {
        btnDl.classList.remove('hidden');
        btnDl.onclick = () => window.open(s.link_file_skl, '_blank');
        btnDl.innerHTML = "📥 DOWNLOAD SKL (PDF)";
    } else {
        btnDl.classList.add('hidden');
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
