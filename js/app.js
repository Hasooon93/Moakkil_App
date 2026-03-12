// js/app.js

// 1. المتغيرات العامة (لحفظ البيانات محلياً لتسريع الواجهة)
let globalData = {
    cases: [],
    clients: [],
    staff: [],
    appointments: []
};

let currentUser = null;

// 2. التهيئة الأولية عند تحميل الصفحة
window.onload = async () => {
    // التحقق من تسجيل الدخول
    const token = localStorage.getItem(CONFIG.TOKEN_KEY);
    const userStr = localStorage.getItem(CONFIG.USER_KEY);
    
    if (!token || !userStr) {
        window.location.href = 'index.html';
        return;
    }

    currentUser = JSON.parse(userStr);
    
    // إعداد واجهة المستخدم بناءً على الصلاحيات
    document.getElementById('top-user-name').innerText = currentUser.full_name;
    document.getElementById('top-user-avatar').innerText = currentUser.full_name.charAt(0);
    document.getElementById('welcome-name').innerText = currentUser.full_name;
    document.getElementById('prof-name').innerText = currentUser.full_name;
    
    let roleAr = currentUser.role === 'admin' ? 'مدير نظام' : (currentUser.role === 'lawyer' ? 'محامي' : 'سكرتاريا');
    document.getElementById('prof-role').innerText = roleAr;

    if (currentUser.role === 'admin') {
        document.getElementById('stat-staff-card').style.display = 'block';
    } else if (currentUser.role === 'secretary') {
        document.getElementById('financial-section').style.display = 'none';
    }

    await loadAllData();
};

// 3. نظام التنبيهات
function showAlert(message, type = 'info') {
    const alertBox = document.getElementById('alertBox');
    if(!alertBox) return alert(message);
    alertBox.innerHTML = `<div class="alert-custom alert-${type}-custom"><i class="fas fa-info-circle"></i> ${message}</div>`;
    setTimeout(() => alertBox.innerHTML = '', 4000);
}

// 4. التنقل بين التبويبات (Tabs)
function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('d-none'));
    document.getElementById(viewId + '-view').classList.remove('d-none');
    
    document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.remove('active');
        n.classList.add('text-muted');
    });
    
    const iconId = `nav-icon-${viewId}`;
    if (document.getElementById(iconId)) {
        document.getElementById(iconId).parentElement.classList.add('active');
        document.getElementById(iconId).parentElement.classList.remove('text-muted');
    }
    
    closeQuickActions();
}

// 5. الأزرار العائمة والنوافذ المنبثقة
function toggleQuickActions() {
    document.getElementById('quickActions').classList.toggle('show');
}
function closeQuickActions() {
    document.getElementById('quickActions').classList.remove('show');
}
function openModal(modalId) {
    closeQuickActions();
    const modalEl = document.getElementById(modalId);
    if(modalEl) {
        // تفريغ النموذج قبل الفتح
        const form = modalEl.querySelector('form');
        if(form) form.reset();
        new bootstrap.Modal(modalEl).show();
    }
}
function closeModal(modalId) {
    const modalEl = document.getElementById(modalId);
    if(modalEl) bootstrap.Modal.getInstance(modalEl).hide();
}

// 6. تحميل جميع البيانات من الخادم
async function loadAllData() {
    showAlert('جاري مزامنة البيانات...', 'info');
    try {
        const [clients, cases, staff, appts] = await Promise.all([
            API.getClients(),
            API.getCases(),
            API.getStaff(),
            API.getAppointments()
        ]);
        
        globalData.clients = clients || [];
        globalData.cases = cases || [];
        globalData.staff = staff || [];
        globalData.appointments = appts || [];

        renderAll();
    } catch(e) {
        showAlert('حدث خطأ أثناء جلب البيانات', 'danger');
    }
}

// 7. عرض البيانات في الواجهة
function renderAll() {
    updateDashboardStats();
    populateSelects();
    renderClients();
    renderStaff();
    renderCases();
    // سنقوم ببرمجة عرض الأجندة في خطوة لاحقة للتركيز
}

function updateDashboardStats() {
    document.getElementById('stat-cases').innerText = globalData.cases.length;
    document.getElementById('stat-clients').innerText = globalData.clients.length;
    document.getElementById('stat-appointments').innerText = globalData.appointments.length;
    document.getElementById('stat-staff').innerText = globalData.staff.length;

    let tAgreed = 0, tPaid = 0;
    globalData.cases.forEach(c => {
        tAgreed += Number(c.total_agreed_fees) || 0;
        tPaid += Number(c.total_paid) || 0;
    });

    document.getElementById('fin-agreed').innerText = tAgreed;
    document.getElementById('fin-paid').innerText = tPaid;
    document.getElementById('fin-rem').innerText = tAgreed - tPaid;
}

function populateSelects() {
    // تعبئة قائمة الموكلين في نافذة القضايا
    let clientOptions = '<option value="">اختر الموكل...</option>';
    globalData.clients.forEach(c => { clientOptions += `<option value="${c.id}">${c.full_name}</option>`; });
    const cSelect = document.getElementById('case_client_id');
    if(cSelect) cSelect.innerHTML = clientOptions;

    // تعبئة قائمة المحامين
    let lawyerOptions = '<option value="">المحامي المسؤول...</option>';
    globalData.staff.forEach(s => { lawyerOptions += `<option value="${s.id}">${s.full_name}</option>`; });
    const lSelect = document.getElementById('case_assigned_lawyer');
    if(lSelect) lSelect.innerHTML = lawyerOptions;
}

function renderClients() {
    const list = document.getElementById('clients-list');
    list.innerHTML = '';
    if(globalData.clients.length === 0) return list.innerHTML = '<div class="text-center text-muted p-3">لا يوجد موكلين</div>';
    
    globalData.clients.forEach(c => {
        list.innerHTML += `
        <div class="card-custom p-3 border-right border-info">
            <div class="d-flex justify-content-between">
                <b class="text-navy">${c.full_name}</b>
                <span class="badge bg-light text-dark"><i class="fas fa-phone fa-flip-horizontal text-info"></i> ${c.phone}</span>
            </div>
            ${c.national_id ? `<small class="text-muted d-block mt-1">الرقم الوطني: ${c.national_id}</small>` : ''}
        </div>`;
    });
}

function renderStaff() {
    const list = document.getElementById('staff-list');
    list.innerHTML = '';
    if(globalData.staff.length === 0) return list.innerHTML = '<div class="text-center text-muted p-3">لا يوجد موظفين</div>';
    
    globalData.staff.forEach(s => {
        const rColor = s.role === 'admin' ? 'danger' : (s.role === 'secretary' ? 'warning' : 'primary');
        list.innerHTML += `
        <div class="card-custom p-3 border-right border-${rColor}">
            <div class="d-flex justify-content-between align-items-center">
                <div><b class="text-navy d-block">${s.full_name}</b><small class="text-muted">@${s.username || s.phone}</small></div>
                <span class="badge bg-${rColor}">${s.role}</span>
            </div>
        </div>`;
    });
}

function renderCases() {
    const list = document.getElementById('cases-list');
    list.innerHTML = '';
    if(globalData.cases.length === 0) return list.innerHTML = '<div class="text-center text-muted p-3">لا يوجد قضايا</div>';
    
    globalData.cases.forEach(c => {
        const clientName = c.mo_clients ? c.mo_clients.full_name : 'غير محدد';
        list.innerHTML += `
        <div class="card-custom p-3 border-right border-accent">
            <div class="d-flex justify-content-between mb-2">
                <b class="text-navy fs-5">${c.case_internal_id}</b>
                <span class="badge bg-primary">${c.status}</span>
            </div>
            <small class="text-muted d-block mb-1"><i class="fas fa-user text-info me-1"></i> الموكل: ${clientName}</small>
            <small class="text-muted d-block"><i class="fas fa-gavel text-warning me-1"></i> المحكمة: ${c.current_court || '--'}</small>
        </div>`;
    });
}

// 8. إرسال النماذج إلى الخادم (حفظ البيانات)
async function saveClient(event) {
    event.preventDefault();
    const btn = event.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    const data = {
        full_name: document.getElementById('client_full_name').value,
        phone: document.getElementById('client_phone').value,
        national_id: document.getElementById('client_national_id').value
    };

    try {
        await API.addClient(data);
        showAlert('تم حفظ الموكل بنجاح', 'success');
        closeModal('clientModal');
        await loadAllData(); // إعادة تحميل الواجهة لتحديث الأرقام والقوائم
    } catch(e) { showAlert(e.message); } 
    finally { btn.disabled = false; }
}

async function saveStaff(event) {
    event.preventDefault();
    const btn = event.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    const data = {
        full_name: document.getElementById('staff_full_name').value,
        username: document.getElementById('staff_username').value,
        password: document.getElementById('staff_password').value,
        role: document.getElementById('staff_role').value
    };

    try {
        await API.addStaff(data);
        showAlert('تم إضافة الموظف بنجاح', 'success');
        closeModal('staffModal');
        await loadAllData();
    } catch(e) { showAlert(e.message); } 
    finally { btn.disabled = false; }
}

async function saveCase(event) {
    event.preventDefault();
    const btn = event.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    const data = {
        client_id: document.getElementById('case_client_id').value,
        case_internal_id: document.getElementById('case_internal_id').value,
        poa_number: document.getElementById('case_poa_number').value,
        case_type: document.getElementById('case_type').value,
        opponent_name: document.getElementById('case_opponent_name').value,
        current_court: document.getElementById('case_current_court').value,
        total_agreed_fees: document.getElementById('case_agreed_fees').value || 0,
        assigned_lawyer_id: document.getElementById('case_assigned_lawyer').value || currentUser.id
    };

    try {
        await API.addCase(data);
        showAlert('تم إنشاء ملف القضية بنجاح', 'success');
        closeModal('caseModal');
        await loadAllData();
    } catch(e) { showAlert(e.message); } 
    finally { btn.disabled = false; }
}

// 9. تسجيل الخروج
function logout() {
    localStorage.removeItem(CONFIG.TOKEN_KEY);
    localStorage.removeItem(CONFIG.USER_KEY);
    localStorage.removeItem(CONFIG.FIRM_KEY);
    window.location.href = 'index.html';
}