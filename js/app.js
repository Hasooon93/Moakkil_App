// js/app.js - محرك لوحة التحكم مع صلاحيات صارمة جداً (Strict RBAC)

let globalData = { cases: [], clients: [], staff: [], appointments: [] };
let currentUser = JSON.parse(localStorage.getItem(CONFIG.USER_KEY));

window.onload = async () => {
    if (!localStorage.getItem(CONFIG.TOKEN_KEY) || !currentUser) {
        window.location.href = 'login.html';
        return;
    }
    
    const welcomeName = document.getElementById('welcome-name');
    const welcomeRole = document.getElementById('welcome-role');
    const topUserName = document.getElementById('top-user-name');
    const topAvatar = document.getElementById('top-user-avatar');
    
    if (welcomeName) welcomeName.innerText = currentUser.full_name;
    if (welcomeRole) welcomeRole.innerText = `المنصب: ${getRoleNameInArabic(currentUser.role)}`;
    if (topUserName) topUserName.innerText = currentUser.full_name;
    if (topAvatar) topAvatar.innerText = currentUser.full_name.charAt(0);

    applyRoleBasedUI();

    const profName = document.getElementById('prof-name');
    const profRole = document.getElementById('prof-role');
    if(profName) profName.innerText = currentUser.full_name;
    if(profRole) profRole.innerText = getRoleNameInArabic(currentUser.role);

    await loadAllData();
};

function getRoleNameInArabic(role) {
    if (role === 'admin' || role === 'مدير') return 'مدير النظام';
    if (role === 'secretary' || role === 'سكرتاريا') return 'سكرتاريا';
    if (role === 'lawyer' || role === 'محامي') return 'محامي';
    return role;
}

function applyRoleBasedUI() {
    const isLawyer = (currentUser.role === 'lawyer' || currentUser.role === 'محامي');
    const isAdmin = (currentUser.role === 'admin' || currentUser.role === 'مدير');

    // إخفاء حقول الإسناد عن المحامي تماماً
    if (isLawyer) {
        const caseAssign = document.getElementById('case-assign-wrapper');
        const apptAssign = document.getElementById('appt-assign-wrapper');
        if(caseAssign) caseAssign.style.display = 'none';
        if(apptAssign) apptAssign.style.display = 'none';
    }

    // إظهار الصلاحيات الخاصة بالمدير
    if (isAdmin) {
        const staffCard = document.getElementById('stat-staff-card');
        const reportsBtn = document.getElementById('admin-reports-btn');
        if (staffCard) staffCard.style.display = 'block';
        if (reportsBtn) reportsBtn.classList.remove('d-none');
    }
}

async function loadAllData() {
    console.log("🔄 جاري مزامنة البيانات وتطبيق الفلترة الصارمة...");
    
    const [rawClients, rawCases, staff, rawAppointments] = await Promise.all([
        API.getClients(),
        API.getCases(),
        API.getStaff(),
        API.getAppointments()
    ]);

    const isLawyer = (currentUser.role === 'lawyer' || currentUser.role === 'محامي');

    if (isLawyer) {
        // المحامي يرى فقط القضايا والمواعيد التي تخصه (مسندة له أو هو من أضافها)
        globalData.cases = (rawCases || []).filter(c => c.assigned_lawyer_id == currentUser.id || c.created_by == currentUser.id);
        globalData.appointments = (rawAppointments || []).filter(a => a.assigned_to == currentUser.id || a.created_by == currentUser.id);
        
        // يرى فقط الموكلين المرتبطين بقضاياه
        const myClientIds = new Set(globalData.cases.map(c => c.client_id));
        globalData.clients = (rawClients || []).filter(c => myClientIds.has(c.id));
    } else {
        // المدير والسكرتاريا يرون كافة البيانات
        globalData.cases = rawCases || [];
        globalData.appointments = rawAppointments || [];
        globalData.clients = rawClients || [];
    }
    
    globalData.staff = staff || [];

    renderDashboard();
    renderCasesList();
    renderClientsList();
    renderAgendaList();
    renderStaffList();
    populateSelects();
}

function renderDashboard() {
    document.getElementById('stat-cases').innerText = globalData.cases.length;
    document.getElementById('stat-clients').innerText = globalData.clients.length;
    document.getElementById('stat-appointments').innerText = globalData.appointments.length;
    document.getElementById('stat-staff').innerText = globalData.staff.length;

    let totalAgreed = 0, totalPaid = 0;
    globalData.cases.forEach(c => {
        totalAgreed += Number(c.total_agreed_fees) || 0;
        totalPaid += Number(c.total_paid) || 0;
    });

    document.getElementById('fin-agreed').innerText = totalAgreed.toLocaleString();
    document.getElementById('fin-paid').innerText = totalPaid.toLocaleString();
    document.getElementById('fin-rem').innerText = (totalAgreed - totalPaid).toLocaleString();
}

function renderCasesList() {
    const list = document.getElementById('cases-list');
    if(!list) return;
    if (globalData.cases.length === 0) {
        list.innerHTML = '<p class="text-center p-3 text-muted">لا يوجد قضايا مسجلة</p>';
        return;
    }
    list.innerHTML = globalData.cases.map(c => `
        <div class="card-custom p-3 mb-2 shadow-sm border-start border-4 border-accent" onclick="viewCaseDetails('${c.id}')" style="cursor:pointer">
            <div class="d-flex justify-content-between align-items-center mb-1">
                <h6 class="fw-bold mb-0 text-navy">${c.case_internal_id || 'بدون رقم'}</h6>
                <span class="badge ${c.status === 'نشطة' ? 'bg-success' : 'bg-secondary'}">${c.status || 'نشطة'}</span>
            </div>
            <small class="text-muted d-block"><i class="fas fa-user me-1"></i> ${c.mo_clients?.full_name || 'موكل غير محدد'}</small>
            <small class="text-muted d-block"><i class="fas fa-balance-scale me-1"></i> ${c.current_court || 'محكمة غير محددة'}</small>
        </div>
    `).join('');
}

function renderClientsList() {
    const list = document.getElementById('clients-list');
    if(!list) return;
    if (globalData.clients.length === 0) {
        list.innerHTML = '<p class="text-center p-3 text-muted">لا يوجد موكلين مسجلين</p>';
        return;
    }
    list.innerHTML = globalData.clients.map(c => `
        <div class="card-custom p-3 mb-2 shadow-sm d-flex justify-content-between align-items-center">
            <div>
                <b class="text-navy">${c.full_name}</b><br>
                <small class="text-muted"><i class="fas fa-phone me-1"></i> ${c.phone}</small>
            </div>
        </div>
    `).join('');
}

function renderAgendaList() {
    const list = document.getElementById('agenda-list');
    if(!list) return;
    if (globalData.appointments.length === 0) {
        list.innerHTML = '<p class="text-center p-3 text-muted">لا توجد مواعيد مجدولة</p>';
        return;
    }
    list.innerHTML = globalData.appointments.map(a => `
        <div class="card-custom p-3 mb-2 shadow-sm border-start border-4 border-warning">
            <h6 class="fw-bold text-navy mb-1">${a.title}</h6>
            <small class="text-muted d-block"><i class="fas fa-clock me-1 text-warning"></i> ${new Date(a.appt_date).toLocaleString('ar-EG')}</small>
            <small class="badge bg-soft-primary text-primary mt-2">${a.type}</small>
        </div>
    `).join('');
}

function renderStaffList() {
    const list = document.getElementById('staff-list');
    if(!list) return;
    if (globalData.staff.length === 0) {
        list.innerHTML = '<p class="text-center p-3 text-muted">لا يوجد موظفين</p>';
        return;
    }
    list.innerHTML = globalData.staff.map(s => `
        <div class="card-custom p-3 mb-2 shadow-sm d-flex justify-content-between align-items-center">
            <div>
                <b class="text-navy">${s.full_name}</b><br>
                <small class="text-muted">${getRoleNameInArabic(s.role)}</small>
            </div>
            <span class="badge bg-purple text-white">${s.username}</span>
        </div>
    `).join('');
}

function populateSelects() {
    const clientSelect = document.getElementById('case_client_id');
    if(clientSelect) {
        clientSelect.innerHTML = '<option value="">اختر الموكل...</option>' + 
            globalData.clients.map(c => `<option value="${c.id}">${c.full_name}</option>`).join('');
    }
    const staffOptions = globalData.staff.map(s => `<option value="${s.id}">${s.full_name} (${getRoleNameInArabic(s.role)})</option>`).join('');
    const caseLawyerSelect = document.getElementById('case_assigned_lawyer');
    if(caseLawyerSelect) caseLawyerSelect.innerHTML = '<option value="">المحامي المسؤول (إسناد)...</option>' + staffOptions;
    const apptAssignSelect = document.getElementById('appt_assigned_to');
    if(apptAssignSelect) apptAssignSelect.innerHTML = '<option value="">إسناد إلى موظف (اختياري)...</option>' + staffOptions;
}

function filterCases() {
    const val = document.getElementById('search-cases').value.toLowerCase();
    Array.from(document.getElementById('cases-list').children).forEach(card => {
        card.style.display = card.innerText.toLowerCase().includes(val) ? '' : 'none';
    });
}

function filterClients() {
    const val = document.getElementById('search-clients').value.toLowerCase();
    Array.from(document.getElementById('clients-list').children).forEach(card => {
        card.style.display = card.innerText.toLowerCase().includes(val) ? '' : 'none';
    });
}

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('d-none'));
    const target = document.getElementById(viewId + '-view');
    if(target) target.classList.remove('d-none');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.add('text-muted'));
    const activeNav = document.getElementById(`nav-icon-${viewId}`);
    if(activeNav) activeNav.parentElement.classList.remove('text-muted');
}

// === الحفظ والاتصال بالسيرفر ===
async function saveClient(event) {
    event.preventDefault();
    const data = {
        full_name: document.getElementById('client_full_name').value,
        phone: document.getElementById('client_phone').value,
        national_id: document.getElementById('client_national_id').value,
        email: document.getElementById('client_email').value,
        created_by: currentUser.id // حقل إضافي لضمان ملكية الإضافة
    };
    const res = await API.addClient(data);
    if(res) {
        closeModal('clientModal');
        document.getElementById('clientForm').reset();
        await loadAllData();
        showAlert('تم إضافة الموكل بنجاح', 'success');
    }
}

async function saveCase(event) {
    event.preventDefault();
    const isLawyer = (currentUser.role === 'lawyer' || currentUser.role === 'محامي');
    const assignedLawyer = isLawyer ? currentUser.id : (document.getElementById('case_assigned_lawyer').value || null);

    const data = {
        client_id: document.getElementById('case_client_id').value,
        access_pin: document.getElementById('case_access_pin').value,
        case_internal_id: document.getElementById('case_internal_id').value,
        case_type: document.getElementById('case_type').value,
        opponent_name: document.getElementById('case_opponent_name').value,
        current_court: document.getElementById('case_current_court').value,
        current_judge: document.getElementById('case_current_judge').value,
        claim_amount: document.getElementById('case_claim_amount').value ? Number(document.getElementById('case_claim_amount').value) : null,
        total_agreed_fees: document.getElementById('case_agreed_fees').value ? Number(document.getElementById('case_agreed_fees').value) : 0,
        assigned_lawyer_id: assignedLawyer,
        created_by: currentUser.id,
        status: 'نشطة'
    };
    const res = await API.addCase(data);
    if(res) {
        closeModal('caseModal');
        document.getElementById('caseForm').reset();
        await loadAllData();
        showAlert('تم إنشاء ملف القضية بنجاح', 'success');
    }
}

async function saveAppointment(event) {
    event.preventDefault();
    const isLawyer = (currentUser.role === 'lawyer' || currentUser.role === 'محامي');
    const assignedTo = isLawyer ? currentUser.id : (document.getElementById('appt_assigned_to').value || null);

    const data = {
        title: document.getElementById('appt_title').value,
        appt_date: document.getElementById('appt_date').value,
        type: document.getElementById('appt_type').value,
        assigned_to: assignedTo,
        created_by: currentUser.id,
        status: 'مجدول'
    };
    const res = await API.addAppointment(data);
    if(res) {
        closeModal('apptModal');
        document.getElementById('apptForm').reset();
        await loadAllData();
        showAlert('تم جدولة الموعد بنجاح', 'success');
    }
}

async function saveStaff(event) {
    event.preventDefault();
    const data = {
        full_name: document.getElementById('staff_full_name').value,
        username: document.getElementById('staff_username').value,
        password: document.getElementById('staff_password').value,
        role: document.getElementById('staff_role').value
    };
    const res = await API.addStaff(data);
    if(res) {
        closeModal('staffModal');
        document.getElementById('staffForm').reset();
        await loadAllData();
        showAlert('تم إضافة الموظف بنجاح', 'success');
    }
}

function viewCaseDetails(id) {
    localStorage.setItem('current_case_id', id);
    window.location.href = 'case-details.html';
}

function logout() {
    localStorage.clear();
    window.location.href = 'login.html';
}

function openModal(id) { new bootstrap.Modal(document.getElementById(id)).show(); }
function closeModal(id) {
    const m = bootstrap.Modal.getInstance(document.getElementById(id));
    if(m) m.hide();
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
}

function showAlert(message, type = 'info') {
    const box = document.getElementById('alertBox');
    if(!box) return;
    const alertId = 'alert-' + Date.now();
    let typeClass = type === 'success' ? 'alert-success-custom' : 'alert-danger-custom';
    box.insertAdjacentHTML('beforeend', `<div id="${alertId}" class="alert-custom ${typeClass}"><i class="fas ${type === 'success' ? 'fa-check-circle text-success' : 'fa-info-circle text-info'}"></i><span>${message}</span></div>`);
    setTimeout(() => { const el = document.getElementById(alertId); if(el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); } }, 3000);
}