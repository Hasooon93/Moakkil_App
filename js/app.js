let globalData = { cases: [], clients: [], staff: [] };
let currentUser = JSON.parse(localStorage.getItem(CONFIG.USER_KEY));

window.onload = async () => {
    if (!localStorage.getItem(CONFIG.TOKEN_KEY)) return window.location.href = 'index.html';
    setupUI();
    await loadAllData();
};

function setupUI() {
    document.getElementById('welcome-name').innerText = currentUser.full_name;
}

async function loadAllData() {
    const [clients, cases, staff] = await Promise.all([API.getClients(), API.getCases(), API.getStaff()]);
    globalData = { clients, cases, staff };
    renderDashboard();
    renderCasesList();
    renderClientsList();
    populateSelects();
}

function switchView(v) {
    document.querySelectorAll('.view').forEach(el => el.classList.add('d-none'));
    document.getElementById(v + '-view').classList.remove('d-none');
}

function renderDashboard() {
    document.getElementById('stat-cases').innerText = globalData.cases.length;
    document.getElementById('stat-clients').innerText = globalData.clients.length;
}

function renderCasesList() {
    document.getElementById('cases-list').innerHTML = globalData.cases.map(c => `
        <div class="card-custom p-3 mb-2 shadow-sm border-start border-4 border-accent" onclick="viewCase('${c.id}')">
            <h6 class="fw-bold text-navy mb-1">${c.case_internal_id}</h6>
            <small class="text-muted">${c.mo_clients?.full_name || 'موكل'}</small>
        </div>
    `).join('');
}

function viewCase(id) {
    localStorage.setItem('current_case_id', id);
    window.location.href = 'case-details.html';
}

function populateSelects() {
    const s = document.getElementById('case_client_id');
    if(s) s.innerHTML = '<option>اختر الموكل...</option>' + globalData.clients.map(c => `<option value="${c.id}">${c.full_name}</option>`).join('');
}

async function saveClient(e) {
    e.preventDefault();
    await API.addClient({ full_name: document.getElementById('client_full_name').value, phone: document.getElementById('client_phone').value });
    location.reload();
}

async function saveCase(e) {
    e.preventDefault();
    await API.addCase({ client_id: document.getElementById('case_client_id').value, case_internal_id: document.getElementById('case_internal_id').value, status: 'نشطة' });
    location.reload();
}