// js/app.js (النسخة الكاملة والشاملة لجميع الوظائف)

let globalData = {
    cases: [],
    clients: [],
    staff: [],
    appointments: []
};

let currentUser = JSON.parse(localStorage.getItem('moakkil_v2_user'));

// 1. التهيئة عند التحميل
window.onload = async () => {
    if (!localStorage.getItem('moakkil_v2_token')) {
        window.location.href = 'index.html';
        return;
    }
    setupUI();
    await loadAllData();
};

function setupUI() {
    if (currentUser) {
        document.getElementById('welcome-name').innerText = currentUser.full_name;
        document.getElementById('top-user-name').innerText = currentUser.full_name;
        document.getElementById('top-user-avatar').innerText = currentUser.full_name.charAt(0);
        document.getElementById('prof-name').innerText = currentUser.full_name;
        
        let roleAr = currentUser.role === 'admin' ? 'مدير نظام' : (currentUser.role === 'lawyer' ? 'محامي' : 'سكرتاريا');
        document.getElementById('prof-role').innerText = roleAr;

        if (currentUser.role === 'admin') {
            document.getElementById('stat-staff-card').style.display = 'block';
        }
    }
}

// 2. تحميل البيانات من الخادم
async function loadAllData() {
    try {
        console.log("جاري تحميل البيانات...");
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

        renderDashboard(); // عرض أرقام الإحصائيات
        renderCasesList(); // عرض القضايا
        renderClientsList(); // عرض الموكلين
        renderStaffList(); // عرض الموظفين
        populateSelects(); // تعبئة القوائم المنسدلة
        
    } catch (e) {
        console.error("Data Load Error:", e);
        showAlert('فشل في مزامنة البيانات من الخادم', 'danger');
    }
}

// 3. دالة التبديل بين الشاشات (كانت مفقودة)
function switchView(viewId) {
    console.log("الانتقال إلى الشاشة:", viewId);
    
    // إخفاء كل الشاشات
    document.querySelectorAll('.view').forEach(v => v.classList.add('d-none'));
    
    // إظهار الشاشة المطلوبة
    const targetView = document.getElementById(viewId + '-view');
    if (targetView) targetView.classList.remove('d-none');
    
    // تحديث شكل القائمة السفلية
    document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.add('text-muted');
        const icon = n.querySelector('i');
        if (icon) icon.classList.replace('text-navy', 'text-muted');
    });
    
    // تمييز العنصر النشط
    const activeNavIcon = document.getElementById(`nav-icon-${viewId}`);
    if (activeNavIcon) {
        activeNavIcon.parentElement.classList.remove('text-muted');
        activeNavIcon.classList.replace('text-muted', 'text-navy');
    }
}

// 4. عرض لوحة الإحصائيات (كانت مفقودة)
function renderDashboard() {
    document.getElementById('stat-cases').innerText = globalData.cases.length;
    document.getElementById('stat-clients').innerText = globalData.clients.length;
    document.getElementById('stat-appointments').innerText = globalData.appointments.length;
    document.getElementById('stat-staff').innerText = globalData.staff.length;

    let tAgreed = 0, tPaid = 0;
    globalData.cases.forEach(c => {
        tAgreed += Number(c.total_agreed_fees) || 0;
        tPaid += Number(c.total_paid) || 0;
    });

    document.getElementById('fin-agreed').innerText = tAgreed + " د.أ";
    document.getElementById('fin-paid').innerText = tPaid + " د.أ";
    document.getElementById('fin-rem').innerText = (tAgreed - tPaid) + " د.أ";
}

// 5. عرض قائمة القضايا
function renderCasesList() {
    const list = document.getElementById('cases-list');
    list.innerHTML = globalData.cases.map(c => `
        <div class="card-custom p-3 mb-2 border-start border-4 border-accent" onclick="viewCaseDetails('${c.id}')">
            <div class="d-flex justify-content-between align-items-start">
                <div>
                    <h6 class="fw-bold text-navy mb-1">${c.case_internal_id}</h6>
                    <small class="text-muted"><i class="fas fa-user me-1"></i> ${c.mo_clients?.full_name || 'موكل غير معروف'}</small>
                </div>
                <span class="badge ${c.status === 'نشطة' ? 'bg-success' : 'bg-secondary'}">${c.status}</span>
            </div>
            <div class="mt-2 small text-muted">
                <i class="fas fa-gavel me-1"></i> ${c.current_court || 'لم تحدد'}
            </div>
        </div>
    `).join('') || '<div class="text-center p-4 text-muted">لا يوجد قضايا حالياً</div>';
}

// 6. عرض قائمة الموكلين
function renderClientsList() {
    const list = document.getElementById('clients-list');
    list.innerHTML = globalData.clients.map(c => `
        <div class="card-custom p-3 mb-2">
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <b class="text-navy">${c.full_name}</b>
                    <div class="small text-muted">${c.phone}</div>
                </div>
                <button class="btn btn-sm btn-light" onclick="copyDeepLink('${c.id}')"><i class="fas fa-link"></i></button>
            </div>
        </div>
    `).join('') || '<div class="text-center p-4 text-muted">لا يوجد موكلين</div>';
}

// 7. عرض قائمة الموظفين
function renderStaffList() {
    const list = document.getElementById('staff-list');
    if (!list) return;
    list.innerHTML = globalData.staff.map(s => `
        <div class="card-custom p-3 mb-2 border-start border-4 border-info">
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <b class="text-navy">${s.full_name}</b>
                    <div class="small text-muted">@${s.username || s.phone}</div>
                </div>
                <span class="badge bg-light text-dark border">${s.role}</span>
            </div>
        </div>
    `).join('') || '<div class="text-center p-4 text-muted">لا يوجد موظفين</div>';
}

// 8. تعبئة القوائم المنسدلة (Selects)
function populateSelects() {
    const cSelect = document.getElementById('case_client_id');
    if (cSelect) {
        cSelect.innerHTML = '<option value="">اختر الموكل...</option>' + 
            globalData.clients.map(c => `<option value="${c.id}">${c.full_name}</option>`).join('');
    }

    const lSelect = document.getElementById('case_assigned_lawyer');
    if (lSelect) {
        lSelect.innerHTML = '<option value="">المحامي المسؤول...</option>' + 
            globalData.staff.filter(s => s.role !== 'secretary').map(s => `<option value="${s.id}">${s.full_name}</option>`).join('');
    }
}

// 9. الدوال الخاصة بالذكاء الاصطناعي والأدوات
async function askAI() {
    const promptArea = document.querySelector('#library-view textarea');
    const prompt = promptArea.value;
    if (!prompt) return showAlert('يرجى كتابة سؤال أولاً', 'warning');
    
    const btn = document.querySelector('#library-view button');
    const resultDiv = document.getElementById('ai-results');
    
    btn.disabled = true;
    btn.innerHTML = 'جاري التفكير... <i class="fas fa-spinner fa-spin"></i>';
    resultDiv.innerHTML = '<div class="card-custom p-3">جاري تحليل الطلب بالذكاء الاصطناعي...</div>';

    try {
        const data = await API.askAI(prompt);
        resultDiv.innerHTML = `
            <div class="card-custom p-3 bg-white shadow-sm border-start border-4 border-purple">
                <h6 class="fw-bold text-purple"><i class="fas fa-robot"></i> رد موكّل الذكي:</h6>
                <p class="mb-0" style="white-space: pre-wrap; font-size: 14px;">${data.result}</p>
            </div>`;
    } catch (e) {
        resultDiv.innerHTML = '<div class="alert alert-danger">فشل الاتصال بالذكاء الاصطناعي</div>';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-magic me-1"></i> تحليل وبحث';
    }
}

// 10. إرسال النماذج (حفظ البيانات)
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
        await loadAllData();
    } catch(e) { showAlert(e.message, 'danger'); } 
    finally { btn.disabled = false; }
}

async function saveCase(event) {
    event.preventDefault();
    const btn = event.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    const data = {
        client_id: document.getElementById('case_client_id').value,
        case_internal_id: document.getElementById('case_internal_id').value,
        case_type: document.getElementById('case_type').value,
        opponent_name: document.getElementById('case_opponent_name').value,
        current_court: document.getElementById('case_current_court').value,
        total_agreed_fees: document.getElementById('case_agreed_fees').value || 0,
        assigned_lawyer_id: document.getElementById('case_assigned_lawyer').value
    };
    try {
        await API.addCase(data);
        showAlert('تم فتح ملف القضية بنجاح', 'success');
        closeModal('caseModal');
        await loadAllData();
    } catch(e) { showAlert(e.message, 'danger'); } 
    finally { btn.disabled = false; }
}

// 11. المساعدات (Helpers)
function openModal(modalId) {
    const modal = new bootstrap.Modal(document.getElementById(modalId));
    modal.show();
}
function closeModal(modalId) {
    const m = bootstrap.Modal.getInstance(document.getElementById(modalId));
    if(m) m.hide();
}
function showAlert(msg, type) {
    const box = document.getElementById('alertBox');
    box.innerHTML = `<div class="alert-custom alert-${type}-custom">${msg}</div>`;
    setTimeout(() => box.innerHTML = '', 4000);
}
function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}