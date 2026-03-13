// js/app.js
let globalData = { cases: [], clients: [], staff: [] };
let currentUser = JSON.parse(localStorage.getItem(CONFIG.USER_KEY));

window.onload = async () => {
    if (!localStorage.getItem(CONFIG.TOKEN_KEY)) {
        window.location.href = 'index.html';
        return;
    }
    if (currentUser && document.getElementById('welcome-name')) {
        document.getElementById('welcome-name').innerText = currentUser.full_name;
    }
    await loadAllData();
};

async function loadAllData() {
    console.log("🔄 جاري المزامنة...");
    globalData.clients = await API.getClients() || [];
    globalData.cases = await API.getCases() || [];
    globalData.staff = await API.getStaff() || [];

    renderDashboard();
    renderCasesList();
    renderClientsList(); // هذه الدالة موجودة بالأسفل
    populateSelects();
}

function renderDashboard() {
    const caseStat = document.getElementById('stat-cases');
    const clientStat = document.getElementById('stat-clients');
    if(caseStat) caseStat.innerText = globalData.cases.length;
    if(clientStat) clientStat.innerText = globalData.clients.length;
}

function renderCasesList() {
    const list = document.getElementById('cases-list');
    if(!list) return;
    list.innerHTML = globalData.cases.map(c => `
        <div class="card-custom p-3 mb-2 shadow-sm border-start border-4 border-accent" onclick="viewCaseDetails('${c.id}')">
            <h6 class="fw-bold mb-1">${c.case_internal_id || 'بدون رقم'}</h6>
            <small class="text-muted">الحالة: ${c.status || 'نشطة'}</small>
        </div>
    `).join('') || '<p class="text-center p-3 text-muted">لا توجد قضايا</p>';
}

function renderClientsList() {
    const list = document.getElementById('clients-list');
    if(!list) return;
    list.innerHTML = globalData.clients.map(c => `
        <div class="card-custom p-3 mb-2 shadow-sm d-flex justify-content-between">
            <div><b>${c.full_name}</b><br><small>${c.phone}</small></div>
            <button class="btn btn-sm btn-light" onclick="copyDeepLink('${c.id}')"><i class="fas fa-link"></i></button>
        </div>
    `).join('') || '<p class="text-center p-3 text-muted">لا يوجد موكلين</p>';
}

function populateSelects() {
    const s = document.getElementById('case_client_id');
    if(s) s.innerHTML = '<option value="">اختر الموكل...</option>' + 
        globalData.clients.map(c => `<option value="${c.id}">${c.full_name}</option>`).join('');
}

function switchView(v) {
    document.querySelectorAll('.view').forEach(el => el.classList.add('d-none'));
    const target = document.getElementById(v + '-view');
    if(target) target.classList.remove('d-none');
}

async function saveClient(e) {
    e.preventDefault();
    const data = { full_name: document.getElementById('client_full_name').value, phone: document.getElementById('client_phone').value };
    await API.addClient(data);
    closeModal('clientModal');
    await loadAllData();
}

async function saveCase(e) {
    e.preventDefault();
    const data = { client_id: document.getElementById('case_client_id').value, case_internal_id: document.getElementById('case_internal_id').value, status: 'نشطة' };
    await API.addCase(data);
    closeModal('caseModal');
    await loadAllData();
}

function viewCaseDetails(id) {
    localStorage.setItem('current_case_id', id);
    window.location.href = 'case-details.html';
}

// دوال النوافذ (Modals)
function openModal(id) {
    const modalEl = document.getElementById(id);
    if(modalEl) {
        const m = new bootstrap.Modal(modalEl);
        m.show();
    }
}

function closeModal(id) {
    const modalEl = document.getElementById(id);
    if(modalEl) {
        const m = bootstrap.Modal.getInstance(modalEl);
        if(m) m.hide();
    }
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
}