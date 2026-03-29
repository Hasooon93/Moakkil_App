// js/app.js - المحرك الشامل لنظام موكّل الذكي (محدث وآمن 100%)
// تشمل: الكانبان، OCR، الإملاء الصوتي، البحث الذكي، وإدارة الأدوات، الحماية من XSS

let globalData = { cases: [], clients: [], staff: [], appointments: [], notifications: [] };
let currentUser = JSON.parse(localStorage.getItem(CONFIG.USER_KEY));
let realtimeSyncTimer = null;
let deferredPrompt; 
let notifiedIds = new Set(); 
let isKanbanView = false; 

// دالة الحماية من ثغرات الحقن (XSS Sanitizer)
const escapeHTML = (str) => {
    if (!str) return '';
    return str.toString().replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
};

window.onload = async () => {
    // تشغيل الـ Service Worker للإشعارات والكاش
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW Error:', err));
    }

    // التحقق من تسجيل الدخول
    if (!localStorage.getItem(CONFIG.TOKEN_KEY) || !currentUser) {
        window.location.href = 'login.html';
        return;
    }

    setupUserInfo();
    applyRoleBasedUI();
    loadFirmSettings(); 
    await loadAllData();
    await loadNotifications(); 
    startRealtimeSync();
};

// إعداد بيانات المستخدم في الترويسة
function setupUserInfo() {
    const roleAr = getRoleNameInArabic(currentUser.role);
    const userName = escapeHTML(currentUser.full_name || 'مستخدم');
    if (document.getElementById('welcome-name')) document.getElementById('welcome-name').innerText = userName;
    if (document.getElementById('welcome-role')) document.getElementById('welcome-role').innerText = `المنصب: ${roleAr}`;
    if (document.getElementById('top-user-name')) document.getElementById('top-user-name').innerText = userName;
    if (document.getElementById('top-user-avatar')) document.getElementById('top-user-avatar').innerText = userName.charAt(0).toUpperCase();
}

function getRoleNameInArabic(role) {
    if (role === 'admin') return 'مدير النظام';
    if (role === 'secretary') return 'سكرتاريا';
    if (role === 'lawyer') return 'محامي';
    return role || 'موظف';
}

// التحكم في العناصر بناءً على الصلاحيات
function applyRoleBasedUI() {
    const isAdmin = (currentUser.role === 'admin');
    if (isAdmin) {
        const staffSection = document.getElementById('staff-management-section');
        if (staffSection) staffSection.classList.remove('d-none');
        
        const statStaffCard = document.getElementById('stat-staff-card');
        if (statStaffCard) statStaffCard.style.display = 'block';

        const settingsBtn = document.getElementById('firm-settings-btn');
        if (settingsBtn) settingsBtn.style.display = 'block';
    }
}

// مزامنة البيانات كل 5 ثوانٍ لضمان التحديث اللحظي
function startRealtimeSync() {
    realtimeSyncTimer = setInterval(async () => {
        try {
            const [newCases, newAppts, newClients] = await Promise.all([
                API.getCases(), API.getAppointments(), API.getClients()
            ]);
            
            let needsUpdate = false;
            if(JSON.stringify(newCases) !== JSON.stringify(globalData.cases)) { filterAndSetCases(newCases); needsUpdate = true; }
            if(JSON.stringify(newAppts) !== JSON.stringify(globalData.appointments)) { filterAndSetAppointments(newAppts); needsUpdate = true; }
            if(JSON.stringify(newClients) !== JSON.stringify(globalData.clients)) { filterAndSetClients(newClients); needsUpdate = true; }

            if(needsUpdate) { 
                renderDashboard(); 
                renderCasesList(); 
                renderClientsList(); 
                if (isKanbanView) renderKanbanBoard(); else renderAgendaList();
            }
            
            await loadNotifications(true);
        } catch(e) {}
    }, 5000);
}

// تحميل إعدادات المكتب (الألوان والاسم واللوغو)
async function loadFirmSettings() {
    const localSettings = JSON.parse(localStorage.getItem('firm_settings'));
    if (localSettings) applyFirmSettings(localSettings);

    try {
        const res = await API.getFirmSettings();
        if (res) {
            const settings = { 
                firm_name: res.firm_name, 
                logo_url: res.logo_url, 
                primary_color: res.primary_color, 
                accent_color: res.accent_color 
            };
            localStorage.setItem('firm_settings', JSON.stringify(settings));
            applyFirmSettings(settings);
            
            if(document.getElementById('firm_setting_name')) document.getElementById('firm_setting_name').value = settings.firm_name || '';
            if(document.getElementById('firm_setting_logo')) document.getElementById('firm_setting_logo').value = settings.logo_url || '';
        }
    } catch(e) {}
}

function applyFirmSettings(settings) {
    if (!settings) return;
    const root = document.documentElement;
    if (settings.primary_color) root.style.setProperty('--navy', settings.primary_color);
    if (settings.accent_color) root.style.setProperty('--accent', settings.accent_color);
    
    const topName = document.getElementById('top-firm-name');
    if (topName) {
        const logoHtml = settings.logo_url ? `<img src="${escapeHTML(settings.logo_url)}" width="20" height="20" class="me-1 rounded" style="object-fit:cover;">` : `<i class="fas fa-balance-scale text-accent me-1"></i>`;
        topName.innerHTML = `${logoHtml} ${escapeHTML(settings.firm_name || 'موكّل')}`;
    }
}

async function saveFirmSettings(event) {
    event.preventDefault();
    const data = {
        firm_name: document.getElementById('firm_setting_name').value,
        logo_url: document.getElementById('firm_setting_logo').value,
        primary_color: document.getElementById('firm_setting_primary').value,
        accent_color: document.getElementById('firm_setting_accent').value
    };
    if(await API.updateFirmSettings(data)) {
        localStorage.setItem('firm_settings', JSON.stringify(data));
        applyFirmSettings(data);
        closeModal('settingsModal');
        showAlert('تم تحديث إعدادات المكتب بنجاح', 'success');
    }
}

// محرك التنقل بين الواجهات
function switchView(viewId) {
    // التوجيه للصفحات الخارجية المفقودة (الذكاء الاصطناعي، الحاسبة، المكتبة)
    if(viewId === 'ai') { window.location.href = 'ai-chat.html'; return; }
    if(viewId === 'library') { window.location.href = 'library.html'; return; }
    if(viewId === 'calculators') { window.location.href = 'calculators.html'; return; }

    document.querySelectorAll('.view').forEach(v => v.classList.add('d-none'));
    const target = document.getElementById(viewId + '-view');
    if(target) target.classList.remove('d-none');

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const activeNav = document.getElementById(`nav-icon-${viewId}`);
    if(activeNav) {
        activeNav.classList.add('active');
    }
    window.scrollTo(0, 0);
}

// ------------------ نظام vCard ------------------
function showVCard() {
    const qrContainer = document.getElementById('vcard-qrcode');
    qrContainer.innerHTML = ''; 
    const firmSettings = JSON.parse(localStorage.getItem('firm_settings')) || {};
    const vcardText = `BEGIN:VCARD\nVERSION:3.0\nFN:${currentUser.full_name}\nORG:${firmSettings.firm_name || 'مكتب محاماة'}\nTEL:${currentUser.phone || ''}\nEND:VCARD`;
    new QRCode(qrContainer, { text: vcardText, width: 180, height: 180, colorDark: "#0a192f" });
    openModal('vCardModal');
}

// ------------------ معالجة البيانات ------------------
async function loadAllData() {
    try {
        const [rawClients, rawCases, staff, rawAppointments] = await Promise.all([
            API.getClients(), API.getCases(), API.getStaff(), API.getAppointments()
        ]);
        globalData.staff = Array.isArray(staff) ? staff : [];
        filterAndSetClients(rawClients);
        filterAndSetCases(rawCases);
        filterAndSetAppointments(rawAppointments);
        renderDashboard();
        renderCasesList();
        renderClientsList();
        if (isKanbanView) renderKanbanBoard(); else renderAgendaList();
        renderStaffList();
        populateSelects();
    } catch(e) { showAlert('حدث خطأ في جلب البيانات', 'danger'); }
}

function filterAndSetCases(raw) { 
    const isLawyer = (currentUser.role === 'lawyer');
    const cases = Array.isArray(raw) ? raw : [];
    globalData.cases = isLawyer ? cases.filter(c => c.assigned_lawyer_id?.includes(currentUser.id) || c.created_by === currentUser.id) : cases;
}

function filterAndSetAppointments(raw) {
    const isLawyer = (currentUser.role === 'lawyer');
    const appts = Array.isArray(raw) ? raw : [];
    globalData.appointments = isLawyer ? appts.filter(a => a.assigned_to?.includes(currentUser.id) || a.created_by === currentUser.id) : appts;
}

function filterAndSetClients(raw) {
    globalData.clients = Array.isArray(raw) ? raw : [];
}

// ------------------ العرض (Rendering) مع حماية XSS ------------------
function renderDashboard() {
    document.getElementById('stat-cases').innerText = globalData.cases.length;
    document.getElementById('stat-clients').innerText = globalData.clients.length;
    document.getElementById('stat-appointments').innerText = globalData.appointments.length;
    document.getElementById('stat-staff').innerText = globalData.staff.length;

    let totalAgreed = 0, totalPaid = 0;
    globalData.cases.forEach(c => { totalAgreed += Number(c.total_agreed_fees) || 0; totalPaid += Number(c.total_paid) || 0; });
    document.getElementById('fin-agreed').innerText = totalAgreed.toLocaleString() + ' د.أ';
    document.getElementById('fin-paid').innerText = totalPaid.toLocaleString() + ' د.أ';
    document.getElementById('fin-rem').innerText = (totalAgreed - totalPaid).toLocaleString() + ' د.أ';
}

function renderCasesList() {
    const list = document.getElementById('cases-list');
    if(!list) return;
    if (globalData.cases.length === 0) { list.innerHTML = '<p class="text-center p-3 text-muted border bg-white rounded">لا يوجد قضايا</p>'; return; }
    list.innerHTML = globalData.cases.map(c => `
        <div class="card-custom p-3 mb-2 shadow-sm border-start border-4 border-accent" onclick="viewCaseDetails('${c.id}')" style="cursor:pointer;">
            <div class="d-flex justify-content-between align-items-center mb-1">
                <h6 class="fw-bold mb-0 text-navy">${escapeHTML(c.case_internal_id || 'ملف')}</h6>
                <span class="badge ${c.status === 'نشطة' ? 'bg-success' : 'bg-secondary'}">${escapeHTML(c.status)}</span>
            </div>
            <small class="text-muted"><i class="fas fa-user me-1"></i> ${escapeHTML(globalData.clients.find(cl => cl.id === c.client_id)?.full_name || 'موكل')}</small>
        </div>
    `).join('');
}

function renderClientsList() {
    const list = document.getElementById('clients-list');
    if(!list) return;
    list.innerHTML = globalData.clients.map(c => `
        <div class="card-custom p-3 mb-2 shadow-sm d-flex justify-content-between align-items-center" onclick="viewClientProfile('${c.id}')" style="cursor:pointer;">
            <div><b class="text-navy">${escapeHTML(c.full_name)}</b><br><small class="text-muted">${escapeHTML(c.phone || '')}</small></div>
            <i class="fas fa-chevron-left text-muted"></i>
        </div>
    `).join('');
}

function renderStaffList() {
    const list = document.getElementById('staff-list');
    if(!list) return;
    list.innerHTML = globalData.staff.map(s => `
        <li class="list-group-item d-flex justify-content-between align-items-center">
            <div>
                <b class="text-navy">${escapeHTML(s.full_name)}</b><br>
                <small class="text-muted">${getRoleNameInArabic(s.role)} - ${escapeHTML(s.phone)}</small>
            </div>
            ${s.id !== currentUser.id ? `<button class="btn btn-sm text-danger" onclick="deleteRecord('user', '${s.id}')"><i class="fas fa-trash"></i></button>` : ''}
        </li>
    `).join('');
}

// ------------------ الأجندة والكانبان ------------------
function toggleAgendaView() {
    isKanbanView = !isKanbanView;
    const list = document.getElementById('agenda-list');
    const kanban = document.getElementById('kanban-board');
    if (isKanbanView) {
        list.classList.add('d-none'); kanban.classList.remove('d-none'); renderKanbanBoard();
    } else {
        kanban.classList.add('d-none'); list.classList.remove('d-none'); renderAgendaList();
    }
}

function renderAgendaList() {
    const list = document.getElementById('agenda-list');
    if (!list) return;
    list.innerHTML = globalData.appointments.map(a => `
        <div class="card-custom p-3 mb-2 shadow-sm border-start border-4 border-primary">
            <div class="d-flex justify-content-between">
                <h6 class="fw-bold text-navy mb-1">${escapeHTML(a.title)}</h6>
                <button class="btn btn-sm text-danger p-0" onclick="deleteRecord('appointment', '${a.id}')"><i class="fas fa-trash"></i></button>
            </div>
            <small class="text-muted d-block mb-2"><i class="fas fa-clock text-warning"></i> ${new Date(a.appt_date).toLocaleString('ar-EG')}</small>
            <div class="d-flex gap-2">
                <button class="btn btn-sm btn-success py-0 px-2 fw-bold" onclick="openApptOutcomeModal('${a.id}')">إنجاز</button>
                <button class="btn btn-sm btn-outline-warning py-0 px-2 text-dark fw-bold" onclick="openApptPostponeModal('${a.id}')">تأجيل</button>
            </div>
        </div>
    `).join('');
}

function renderKanbanBoard() {
    const board = document.getElementById('kanban-board');
    const cols = [
        { label: 'قادمة / مجدولة', filter: a => a.status === 'مجدول' },
        { label: 'تم الإنجاز', filter: a => a.status === 'تم' },
        { label: 'ملغاة / مؤجلة', filter: a => ['ملغي', 'مؤجل'].includes(a.status) }
    ];
    board.innerHTML = cols.map(col => `
        <div class="kanban-col">
            <div class="kanban-header"><span>${col.label}</span><span class="badge bg-white text-navy">${globalData.appointments.filter(col.filter).length}</span></div>
            ${globalData.appointments.filter(col.filter).map(a => `
                <div class="card-custom p-2 mb-2 shadow-sm border-1 border" style="font-size: 13px;">
                    <b>${escapeHTML(a.title)}</b><br><small class="text-muted">${new Date(a.appt_date).toLocaleDateString('ar-EG')}</small>
                </div>
            `).join('')}
        </div>
    `).join('');
}

// ------------------ الميزات الذكية ------------------

// 1. مسح الهوية OCR
async function processIdImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    showAlert('جاري تحليل الهوية بالذكاء الاصطناعي...', 'info');
    try {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const data = await API.readOCR(e.target.result);
            if (data && !data.error) {
                if (data.full_name) document.getElementById('client_full_name').value = data.full_name;
                if (data.national_id) document.getElementById('client_national_id').value = data.national_id;
                showAlert('تم استخراج البيانات بنجاح', 'success');
            } else {
                showAlert('فشل استخراج البيانات', 'danger');
            }
        };
        reader.readAsDataURL(file);
    } catch(e) { showAlert('فشل تحليل الصورة', 'danger'); }
}

// 2. الإملاء الصوتي
function startDictation(targetId) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return showAlert('المتصفح لا يدعم التعرف على الصوت', 'warning');
    const rec = new SpeechRecognition();
    rec.lang = 'ar-JO';
    rec.start();
    showAlert('تحدث الآن...', 'info');
    rec.onresult = (e) => { document.getElementById(targetId).value += e.results[0][0].transcript; };
}

// 3. البحث الذكي
async function handleSmartSearch(q) {
    const drop = document.getElementById('search-results-dropdown');
    if (q.length < 2) return drop.classList.add('d-none');
    const res = await API.smartSearch(q);
    let html = '';
    if (res.cases?.length) html += '<h6 class="dropdown-header">القضايا</h6>' + res.cases.map(c => `<button class="dropdown-item" onclick="viewCaseDetails('${c.id}')">${escapeHTML(c.case_internal_id)}</button>`).join('');
    if (res.clients?.length) html += '<h6 class="dropdown-header">الموكلين</h6>' + res.clients.map(c => `<button class="dropdown-item" onclick="viewClientProfile('${c.id}')">${escapeHTML(c.full_name)}</button>`).join('');
    drop.innerHTML = html || '<div class="p-3 text-center small text-muted">لا نتائج</div>';
    drop.classList.remove('d-none');
}

// ------------------ CRUD وحفظ البيانات ------------------

async function saveClient(event) {
    event.preventDefault();
    const data = { 
        full_name: document.getElementById('client_full_name').value, 
        phone: document.getElementById('client_phone').value, 
        national_id: document.getElementById('client_national_id').value,
        client_type: document.getElementById('client_type').value,
        address: document.getElementById('client_address')?.value || '', // تم إضافة حقل العنوان
        created_by: currentUser.id 
    };
    if (await API.addClient(data)) { closeModal('clientModal'); await loadAllData(); showAlert('تمت الإضافة', 'success'); }
}

async function saveCase(event) {
    event.preventDefault();
    const lawyers = [];
    document.querySelectorAll('.case-lawyer-cb:checked').forEach(cb => lawyers.push(cb.value));
    
    const data = {
        client_id: document.getElementById('case_client_id').value,
        case_internal_id: document.getElementById('case_internal_id').value,
        access_pin: document.getElementById('case_access_pin').value,
        case_type: document.getElementById('case_type').value,
        opponent_name: document.getElementById('case_opponent_name').value,
        lawsuit_text: document.getElementById('case_lawsuit_text').value,
        total_agreed_fees: Number(document.getElementById('case_agreed_fees').value),
        claim_amount: Number(document.getElementById('case_claim_amount').value),
        assigned_lawyer_id: lawyers,
        status: 'نشطة',
        created_by: currentUser.id
    };

    const isWorkflow = document.getElementById('case_auto_tasks').checked;
    const res = await API.addCase(data);
    if (res) {
        if (isWorkflow) {
            const tasks = [
                { t: 'تجهيز لائحة الدعوى والوكالات', d: 1 },
                { t: 'تسجيل الدعوى في المحكمة المختصة', d: 3 },
                { t: 'متابعة التبليغ والخصوم', d: 7 }
            ];
            for (const task of tasks) {
                const date = new Date(); date.setDate(date.getDate() + task.d);
                await API.addAppointment({ title: `${task.t} - ${data.case_internal_id}`, appt_date: date.toISOString(), status: 'مجدول', created_by: currentUser.id });
            }
        }
        closeModal('caseModal'); await loadAllData(); showAlert('تم فتح القضية بنجاح', 'success');
    }
}

async function saveAppointment(event) {
    event.preventDefault();
    const data = {
        title: document.getElementById('appt_title').value,
        appt_date: new Date(document.getElementById('appt_date').value).toISOString(),
        type: document.getElementById('appt_type').value,
        status: 'مجدول',
        created_by: currentUser.id
    };
    if (await API.addAppointment(data)) { closeModal('apptModal'); await loadAllData(); showAlert('تمت الجدولة', 'success'); }
}

// ------------------ المساعدات (Helpers) ------------------

function populateSelects() {
    const caseClientSelect = document.getElementById('case_client_id');
    if(caseClientSelect) caseClientSelect.innerHTML = '<option value="">اختر الموكل...</option>' + globalData.clients.map(c => `<option value="${c.id}">${escapeHTML(c.full_name)}</option>`).join('');
    
    const lawyersContainer = document.getElementById('case_assigned_lawyers_container');
    if (lawyersContainer) {
        lawyersContainer.innerHTML = globalData.staff.map(s => `
            <div class="form-check small"><input class="form-check-input case-lawyer-cb" type="checkbox" value="${s.id}" id="l_${s.id}"><label class="form-check-label" for="l_${s.id}">${escapeHTML(s.full_name)}</label></div>
        `).join('');
    }
}

async function loadNotifications(silent = false) {
    const res = await API.getNotifications();
    globalData.notifications = Array.isArray(res) ? res : [];
    const unread = globalData.notifications.filter(n => !n.is_read);
    const badge = document.getElementById('notification-badge');
    if (unread.length > 0) {
        badge.innerText = unread.length; badge.classList.remove('d-none');
        if (silent) unread.forEach(n => { if(!notifiedIds.has(n.id)) { notifiedIds.add(n.id); triggerPushNotification(n.title, n.message); } });
    } else badge.classList.add('d-none');

    const list = document.getElementById('notifications-list');
    list.innerHTML = globalData.notifications.slice(0, 5).map(n => `<li class="dropdown-item border-bottom p-2 ${n.is_read ? 'opacity-50' : 'fw-bold'}"><small>${escapeHTML(n.title)}</small><br><span style="font-size:10px;">${escapeHTML(n.message)}</span></li>`).join('');
}

function viewCaseDetails(id) { localStorage.setItem('current_case_id', id); window.location.href = 'case-details.html'; }
function viewClientProfile(id) { localStorage.setItem('current_client_id', id); window.location.href = 'client-details.html'; }
function logout() { localStorage.clear(); window.location.href = 'login.html'; }
function openModal(id) { new bootstrap.Modal(document.getElementById(id)).show(); }
function closeModal(id) { bootstrap.Modal.getInstance(document.getElementById(id))?.hide(); }
function showAlert(m, t) { const box = document.getElementById('alertBox'); const id = Date.now(); box.insertAdjacentHTML('beforeend', `<div id="${id}" class="alert-custom alert-${t}-custom"><span>${escapeHTML(m)}</span></div>`); setTimeout(() => document.getElementById(id)?.remove(), 4000); }

// دوال فارغة للتوافق مع استدعاءات HTML
function runConflictCheckModal() { openModal('conflictModal'); }
function openApptOutcomeModal(id) { document.getElementById('outcome_appt_id').value = id; openModal('apptOutcomeModal'); }
function openApptPostponeModal(id) { document.getElementById('postpone_appt_id').value = id; openModal('apptPostponeModal'); }
async function saveApptOutcome(e) { e.preventDefault(); const id = document.getElementById('outcome_appt_id').value; if(await API.updateAppointment(id, {status:'تم', notes: document.getElementById('outcome_text').value})) { closeModal('apptOutcomeModal'); loadAllData(); } }
async function saveApptPostpone(e) { e.preventDefault(); const id = document.getElementById('postpone_appt_id').value; if(await API.updateAppointment(id, {status:'مؤجل', appt_date: new Date(document.getElementById('postpone_date').value).toISOString()})) { closeModal('apptPostponeModal'); loadAllData(); } }
async function deleteRecord(type, id) { if(confirm('تأكيد الحذف؟')) { if(type==='appointment') await API.deleteAppointment(id); if(type==='user') await API.deleteStaff(id); loadAllData(); } }
function filterCases() { const v = document.getElementById('search-cases').value.toLowerCase(); Array.from(document.getElementById('cases-list').children).forEach(c => c.style.display = c.innerText.toLowerCase().includes(v) ? '' : 'none'); }
function filterClients() { const v = document.getElementById('search-clients').value.toLowerCase(); Array.from(document.getElementById('clients-list').children).forEach(c => c.style.display = c.innerText.toLowerCase().includes(v) ? '' : 'none'); }