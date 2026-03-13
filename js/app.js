// js/app.js - محرك لوحة التحكم الشامل والنهائي

let globalData = { cases: [], clients: [], staff: [], appointments: [] };
let currentUser = JSON.parse(localStorage.getItem(CONFIG.USER_KEY));
let realtimeSyncTimer = null;

window.onload = async () => {
    if (!localStorage.getItem(CONFIG.TOKEN_KEY) || !currentUser) {
        window.location.href = 'login.html';
        return;
    }
    setupUserInfo();
    applyRoleBasedUI();
    await loadAllData();
    startRealtimeSync();
};

function startRealtimeSync() {
    realtimeSyncTimer = setInterval(async () => {
        try {
            const [newCases, newAppts, newClients] = await Promise.all([
                API.getCases(), API.getAppointments(), API.getClients()
            ]);
            
            let needsUpdate = false;
            
            if(newCases && JSON.stringify(newCases) !== JSON.stringify(globalData.cases)) {
                globalData.cases = newCases; needsUpdate = true;
            }
            if(newAppts && JSON.stringify(newAppts) !== JSON.stringify(globalData.appointments)) {
                globalData.appointments = newAppts; needsUpdate = true;
            }
            if(newClients && JSON.stringify(newClients) !== JSON.stringify(globalData.clients)) {
                globalData.clients = newClients; needsUpdate = true;
            }

            if(needsUpdate) {
                renderDashboard();
                renderCasesList();
                renderClientsList();
                renderAgendaList();
            }
        } catch(e) { console.log("Realtime sync error ignored"); }
    }, 5000);
}

function setupUserInfo() {
    const roleAr = getRoleNameInArabic(currentUser.role);
    const userName = currentUser.full_name || 'مستخدم';
    
    const welcomeName = document.getElementById('welcome-name');
    const welcomeRole = document.getElementById('welcome-role'); 
    if (welcomeName) welcomeName.innerText = userName;
    if (welcomeRole) welcomeRole.innerText = `المنصب: ${roleAr}`;
    
    const topUserName = document.getElementById('top-user-name');
    const topAvatar = document.getElementById('top-user-avatar');
    if (topUserName) topUserName.innerText = userName;
    if (topAvatar) topAvatar.innerText = userName.charAt(0).toUpperCase();

    const profName = document.getElementById('prof-name');
    const profRole = document.getElementById('prof-role');
    if (profName) profName.innerText = userName;
    if (profRole) profRole.innerText = roleAr;
}

function getRoleNameInArabic(role) {
    if (role === 'admin' || role === 'مدير') return 'مدير النظام';
    if (role === 'secretary' || role === 'سكرتاريا') return 'سكرتاريا';
    if (role === 'lawyer' || role === 'محامي') return 'محامي';
    return role || 'موظف';
}

function applyRoleBasedUI() {
    const isLawyer = (currentUser.role === 'lawyer' || currentUser.role === 'محامي');
    const isAdmin = (currentUser.role === 'admin' || currentUser.role === 'مدير');

    if (isLawyer) {
        const caseAssign = document.getElementById('case-assign-wrapper');
        const apptAssign = document.getElementById('appt-assign-wrapper');
        if(caseAssign) caseAssign.style.display = 'none';
        if(apptAssign) apptAssign.style.display = 'none';
    }

    if (isAdmin) {
        const staffCard = document.getElementById('stat-staff-card');
        const reportsBtn = document.getElementById('admin-reports-btn');
        if (staffCard) staffCard.style.display = 'block';
        if (reportsBtn) reportsBtn.classList.remove('d-none');
    }
}

async function loadAllData() {
    const [rawClients, rawCases, staff, rawAppointments] = await Promise.all([
        API.getClients(), API.getCases(), API.getStaff(), API.getAppointments()
    ]);

    const isLawyer = (currentUser.role === 'lawyer' || currentUser.role === 'محامي');

    if (isLawyer) {
        globalData.cases = (rawCases || []).filter(c => c.assigned_lawyer_id == currentUser.id || c.created_by == currentUser.id);
        globalData.appointments = (rawAppointments || []).filter(a => a.assigned_to == currentUser.id || a.created_by == currentUser.id);
        const myClientIds = new Set(globalData.cases.map(c => c.client_id));
        globalData.clients = (rawClients || []).filter(c => myClientIds.has(c.id) || c.created_by == currentUser.id);
    } else {
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
    const isAdmin = (currentUser.role === 'admin' || currentUser.role === 'مدير');
    list.innerHTML = globalData.cases.map(c => `
        <div class="card-custom p-3 mb-2 shadow-sm border-start border-4 border-accent position-relative">
            <div class="d-flex justify-content-between align-items-center mb-1">
                <h6 class="fw-bold mb-0 text-navy" onclick="viewCaseDetails('${c.id}')" style="cursor:pointer; width: 70%;">${c.case_internal_id || 'بدون رقم'}</h6>
                <div>
                    <span class="badge ${c.status === 'نشطة' ? 'bg-success' : 'bg-secondary'}">${c.status || 'نشطة'}</span>
                    ${isAdmin ? `<button class="btn btn-sm text-danger p-0 ms-2" onclick="deleteRecord('case', '${c.id}')"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            </div>
            <small class="text-muted d-block" onclick="viewClientProfile('${c.client_id}')" style="cursor:pointer;"><i class="fas fa-user me-1"></i> ${c.mo_clients?.full_name || 'موكل غير محدد'}</small>
            <div class="d-flex justify-content-between align-items-center mt-2">
                <small class="text-muted"><i class="fas fa-balance-scale me-1"></i> ${c.current_court || 'محكمة غير محددة'}</small>
                <button class="btn btn-sm btn-outline-info py-0 px-2 fw-bold" onclick="copyClientDeepLink('${c.public_token}', '${c.access_pin}')" title="مشاركة الرابط">
                    <i class="fas fa-share-alt"></i> إرسال للموكل
                </button>
            </div>
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
    const isAdmin = (currentUser.role === 'admin' || currentUser.role === 'مدير');
    list.innerHTML = globalData.clients.map(c => `
        <div class="card-custom p-3 mb-2 shadow-sm d-flex justify-content-between align-items-center">
            <div>
                <b class="text-navy" onclick="viewClientProfile('${c.id}')" style="cursor:pointer; font-size: 1.1rem;">${c.full_name}</b><br>
                <small class="text-muted"><i class="fas fa-phone me-1"></i> ${c.phone}</small>
            </div>
            ${isAdmin ? `<button class="btn btn-sm text-danger p-0" onclick="deleteRecord('client', '${c.id}')"><i class="fas fa-trash"></i></button>` : ''}
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
    const isAdmin = (currentUser.role === 'admin' || currentUser.role === 'مدير');
    list.innerHTML = globalData.appointments.map(a => `
        <div class="card-custom p-3 mb-2 shadow-sm border-start border-4 border-warning">
            <div class="d-flex justify-content-between align-items-start">
                <h6 class="fw-bold text-navy mb-1" style="width:85%">${a.title}</h6>
                ${isAdmin || a.created_by === currentUser.id ? `<button class="btn btn-sm text-danger p-0" onclick="deleteRecord('appointment', '${a.id}')"><i class="fas fa-trash"></i></button>` : ''}
            </div>
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
    const isAdmin = (currentUser.role === 'admin' || currentUser.role === 'مدير');
    list.innerHTML = globalData.staff.map(s => {
        const isMainAdmin = s.id === currentUser.id;
        const statusBadge = s.is_active === false ? '<span class="badge bg-danger">معطل</span>' : '<span class="badge bg-success">فعال</span>';
        const actionBtn = isAdmin && !isMainAdmin ? `
            <button class="btn btn-sm ${s.is_active === false ? 'btn-success' : 'btn-warning text-dark'} p-1" onclick="toggleStaffStatus('${s.id}', ${s.is_active})">
                <i class="fas ${s.is_active === false ? 'fa-user-check' : 'fa-user-lock'}"></i>
            </button>
        ` : '';

        return `
        <div class="card-custom p-3 mb-2 shadow-sm d-flex justify-content-between align-items-center ${s.is_active === false ? 'opacity-50' : ''}">
            <div>
                <b class="text-navy">${s.full_name}</b> ${statusBadge}<br>
                <small class="text-muted">${getRoleNameInArabic(s.role)} - @${s.username}</small>
            </div>
            <div>${actionBtn}</div>
        </div>
    `}).join('');
}

function populateSelects() {
    const clientSelect = document.getElementById('case_client_id');
    if(clientSelect) clientSelect.innerHTML = '<option value="">اختر الموكل...</option>' + globalData.clients.map(c => `<option value="${c.id}">${c.full_name}</option>`).join('');
    
    const activeStaff = globalData.staff.filter(s => s.is_active !== false);
    const staffOptions = activeStaff.map(s => `<option value="${s.id}">${s.full_name} (${getRoleNameInArabic(s.role)})</option>`).join('');
    
    const caseLawyerSelect = document.getElementById('case_assigned_lawyer');
    if(caseLawyerSelect) caseLawyerSelect.innerHTML = '<option value="">المحامي المسؤول (إسناد)...</option>' + staffOptions;
    
    const apptAssignSelect = document.getElementById('appt_assigned_to');
    if(apptAssignSelect) apptAssignSelect.innerHTML = '<option value="">إسناد إلى موظف (اختياري)...</option>' + staffOptions;
}

function filterCases() { const val = document.getElementById('search-cases').value.toLowerCase(); Array.from(document.getElementById('cases-list').children).forEach(card => card.style.display = card.innerText.toLowerCase().includes(val) ? '' : 'none'); }
function filterClients() { const val = document.getElementById('search-clients').value.toLowerCase(); Array.from(document.getElementById('clients-list').children).forEach(card => card.style.display = card.innerText.toLowerCase().includes(val) ? '' : 'none'); }

// -----------------------------------------------------------------
// الدالة المفقودة التي سببت الخطأ في الشاشة
// -----------------------------------------------------------------
function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('d-none'));
    const target = document.getElementById(viewId + '-view');
    if(target) target.classList.remove('d-none');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.add('text-muted'));
    const activeNav = document.getElementById(`nav-icon-${viewId}`);
    if(activeNav) activeNav.parentElement.classList.remove('text-muted');
}

async function saveClient(event) {
    event.preventDefault();
    const data = {
        full_name: document.getElementById('client_full_name').value, phone: document.getElementById('client_phone').value,
        national_id: document.getElementById('client_national_id').value, email: document.getElementById('client_email').value,
        client_type: 'فرد', created_by: currentUser.id
    };
    if(await API.addClient(data)) { closeModal('clientModal'); document.getElementById('clientForm').reset(); await loadAllData(); showAlert('تم إضافة الموكل بنجاح', 'success'); }
}

async function saveCase(event) {
    event.preventDefault();
    const isLawyer = (currentUser.role === 'lawyer' || currentUser.role === 'محامي');
    const assignedLawyer = isLawyer ? currentUser.id : (document.getElementById('case_assigned_lawyer').value || null);
    const data = {
        client_id: document.getElementById('case_client_id').value, access_pin: document.getElementById('case_access_pin').value,
        case_internal_id: document.getElementById('case_internal_id').value, case_type: document.getElementById('case_type').value,
        opponent_name: document.getElementById('case_opponent_name').value, current_court: document.getElementById('case_current_court').value,
        current_judge: document.getElementById('case_current_judge').value, claim_amount: document.getElementById('case_claim_amount').value ? Number(document.getElementById('case_claim_amount').value) : null,
        total_agreed_fees: document.getElementById('case_agreed_fees').value ? Number(document.getElementById('case_agreed_fees').value) : 0,
        assigned_lawyer_id: assignedLawyer, created_by: currentUser.id, status: 'نشطة'
    };
    if(await API.addCase(data)) { closeModal('caseModal'); document.getElementById('caseForm').reset(); await loadAllData(); showAlert('تم إنشاء ملف القضية بنجاح', 'success'); }
}

async function saveAppointment(event) {
    event.preventDefault();
    const isLawyer = (currentUser.role === 'lawyer' || currentUser.role === 'محامي');
    const assignedTo = isLawyer ? currentUser.id : (document.getElementById('appt_assigned_to').value || null);
    const data = {
        title: document.getElementById('appt_title').value, appt_date: document.getElementById('appt_date').value,
        type: document.getElementById('appt_type').value, assigned_to: assignedTo, created_by: currentUser.id, status: 'مجدول'
    };
    if(await API.addAppointment(data)) { closeModal('apptModal'); document.getElementById('apptForm').reset(); await loadAllData(); showAlert('تم جدولة الموعد بنجاح', 'success'); }
}

async function saveStaff(event) {
    event.preventDefault();
    const data = {
        full_name: document.getElementById('staff_full_name').value, 
        username: document.getElementById('staff_username').value,
        password: document.getElementById('staff_password').value, 
        role: document.getElementById('staff_role').value
    };
    
    const res = await fetchAPI('/api/users', 'POST', data);
    if(res && !res.error) { 
        closeModal('staffModal'); 
        document.getElementById('staffForm').reset(); 
        await loadAllData(); 
        if(res._warning) showAlert(res._warning, 'warning');
        else showAlert('تم إضافة الموظف الفعال بنجاح', 'success'); 
    } else if (res && res.error) {
        showAlert(res.error, 'danger');
    }
}

async function deleteRecord(type, id) {
    if(!confirm('هل أنت متأكد من الحذف النهائي؟')) return;
    let res;
    if(type === 'case') res = await API.deleteCase(id);
    if(type === 'client') res = await API.deleteClient(id);
    if(type === 'appointment') res = await API.deleteAppointment(id);
    if(res && res.success) { showAlert('تم الحذف', 'success'); await loadAllData(); }
}

async function toggleStaffStatus(id, currentStatus) {
    if(!confirm('تأكيد الإجراء؟ تذكر أنه لا يمكنك التراجع إلا بعد 24 ساعة!')) return;
    const newStatus = !currentStatus;
    
    const res = await fetchAPI(`/api/users?id=eq.${id}`, 'PATCH', { is_active: newStatus, can_login: newStatus });
    
    if(res && !res.error) { 
        showAlert('تم تحديث حالة الموظف بنجاح', 'success'); 
        await loadAllData(); 
    } else if (res && res.error) {
        showAlert(res.error, 'danger');
    }
}

function copyClientDeepLink(publicToken, pin) {
    if(!publicToken || publicToken === "undefined" || publicToken === "null") {
        showAlert('هذه القضية لا تملك رمزاً عاماً بعد.', 'danger');
        return;
    }
    
    const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
    const deepLink = `${baseUrl}client.html?token=${publicToken}`;
    const safePin = (pin && pin !== "undefined") ? pin : "غير محدد";
    
    const shareText = `مرحباً، يمكنك متابعة قضيتك عبر الرابط:\n${deepLink}\n\nرمز الدخول PIN الخاص بك هو: ${safePin}`;
    
    if (navigator.share) {
        navigator.share({
            title: 'رابط القضية',
            text: shareText
        }).catch(err => console.log('فشلت المشاركة', err));
    } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
    }
}

function viewCaseDetails(id) { localStorage.setItem('current_case_id', id); window.location.href = 'case-details.html'; }
function viewClientProfile(id) { if(id) { localStorage.setItem('current_client_id', id); window.location.href = 'client-details.html'; } }
function logout() { localStorage.clear(); window.location.href = 'login.html'; }

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
    if(type === 'warning') typeClass = 'bg-warning text-dark border-warning';
    box.insertAdjacentHTML('beforeend', `<div id="${alertId}" class="alert-custom ${typeClass}"><span>${message}</span></div>`);
    setTimeout(() => { const el = document.getElementById(alertId); if(el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); } }, 4000);
}