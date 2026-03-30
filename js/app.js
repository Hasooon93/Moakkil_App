// js/app.js - المحرك الشامل لنظام موكّل الذكي (إصلاح الـ QR ونظام الإعدادات)

let globalData = { cases: [], clients: [], staff: [], appointments: [], notifications: [] };
let currentUser = JSON.parse(localStorage.getItem(CONFIG.USER_KEY));
let realtimeSyncTimer = null;
let notifiedIds = new Set(); 
let isKanbanView = false; 
let currentCaseFilter = ''; 

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
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW Error:', err));
    }

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

function applyRoleBasedUI() {
    const isAdmin = (currentUser.role === 'admin');
    if (isAdmin) {
        if (document.getElementById('staff-management-section')) document.getElementById('staff-management-section').classList.remove('d-none');
        if (document.getElementById('stat-staff-card')) document.getElementById('stat-staff-card').style.display = 'block';
        if (document.getElementById('firm-settings-btn')) document.getElementById('firm-settings-btn').style.display = 'block';
        if (document.getElementById('admin-reports-btn')) document.getElementById('admin-reports-btn').classList.remove('d-none');
    }
}

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
    }, 10000); // زيادة المدة قليلاً لتوفير الموارد
}

async function loadFirmSettings() {
    const localSettings = JSON.parse(localStorage.getItem('firm_settings'));
    if (localSettings) applyFirmSettings(localSettings);

    try {
        const res = await API.getFirmSettings();
        if (res && res.length > 0) {
            const settings = { 
                firm_name: res[0].firm_name, 
                logo_url: res[0].logo_url, 
                primary_color: res[0].primary_color, 
                accent_color: res[0].accent_color,
                firm_phone: res[0].firm_phone || '',
                firm_address: res[0].firm_address || ''
            };
            localStorage.setItem('firm_settings', JSON.stringify(settings));
            applyFirmSettings(settings);
            
            if(document.getElementById('firm_setting_name')) document.getElementById('firm_setting_name').value = settings.firm_name || '';
            if(document.getElementById('firm_setting_logo')) document.getElementById('firm_setting_logo').value = settings.logo_url || '';
            if(document.getElementById('firm_setting_phone')) document.getElementById('firm_setting_phone').value = settings.firm_phone || '';
            if(document.getElementById('firm_setting_address')) document.getElementById('firm_setting_address').value = settings.firm_address || '';
            if(document.getElementById('firm_setting_primary')) document.getElementById('firm_setting_primary').value = settings.primary_color || '#0a192f';
            if(document.getElementById('firm_setting_accent')) document.getElementById('firm_setting_accent').value = settings.accent_color || '#64ffda';
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
        accent_color: document.getElementById('firm_setting_accent').value,
        firm_phone: document.getElementById('firm_setting_phone').value,
        firm_address: document.getElementById('firm_setting_address').value
    };
    
    const res = await API.updateFirmSettings(data);
    if(res && !res.error) {
        localStorage.setItem('firm_settings', JSON.stringify(data));
        applyFirmSettings(data);
        closeModal('settingsModal');
        showAlert('تم تحديث إعدادات المكتب بنجاح', 'success');
    } else {
        showAlert('خطأ: ' + (res.error || 'فشل التحديث'), 'danger');
    }
}

function switchView(viewId) {
    if(viewId === 'ai') { window.location.href = 'ai-chat.html'; return; }
    if(viewId === 'library') { window.location.href = 'library.html'; return; }
    if(viewId === 'calculators') { window.location.href = 'calculators.html'; return; }

    document.querySelectorAll('.view').forEach(v => v.classList.add('d-none'));
    const target = document.getElementById(viewId + '-view');
    if(target) target.classList.remove('d-none');

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const activeNav = document.getElementById(`nav-icon-${viewId}`);
    if(activeNav) activeNav.classList.add('active');
    window.scrollTo(0, 0);
}

// إصلاح مشكلة الـ Overflow في الـ QR كود
function showVCard() {
    const qrContainer = document.getElementById('vcard-qrcode');
    qrContainer.innerHTML = ''; 
    const firmSettings = JSON.parse(localStorage.getItem('firm_settings')) || {};
    
    // بناء vCard مختصر لتجنب تجاوز السعة
    const vcardText = `BEGIN:VCARD\nVERSION:3.0\nFN:${currentUser.full_name}\nORG:${firmSettings.firm_name || 'Law Office'}\nTEL;TYPE=CELL:${currentUser.phone || ''}\nADR;TYPE=WORK:;;${firmSettings.firm_address || ''};;;;\nEND:VCARD`;
    
    try {
        new QRCode(qrContainer, { 
            text: vcardText, 
            width: 200, 
            height: 200, 
            colorDark: "#0a192f",
            correctLevel: QRCode.CorrectLevel.L // استخدام أقل مستوى حماية لزيادة مساحة البيانات
        });
        openModal('vCardModal');
    } catch(e) {
        console.error("QR Error:", e);
        showAlert("بيانات المكتب طويلة جداً، يرجى اختصار العنوان أو الاسم", "warning");
    }
}

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

function renderDashboard() {
    document.getElementById('stat-cases').innerText = globalData.cases.filter(c => c.status !== 'مكتملة').length;
    document.getElementById('stat-clients').innerText = globalData.clients.length;
    document.getElementById('stat-appointments').innerText = globalData.appointments.filter(a => a.status === 'مجدول').length;
    document.getElementById('stat-staff').innerText = globalData.staff.length;

    let totalAgreed = 0, totalPaid = 0;
    globalData.cases.forEach(c => { totalAgreed += Number(c.total_agreed_fees) || 0; totalPaid += Number(c.total_paid) || 0; });
    document.getElementById('fin-agreed').innerText = totalAgreed.toLocaleString();
    document.getElementById('fin-paid').innerText = totalPaid.toLocaleString();
    document.getElementById('fin-rem').innerText = (totalAgreed - totalPaid).toLocaleString();
}

function filterCasesByBtn(btn, status) {
    document.querySelectorAll('.filter-btn').forEach(b => { b.classList.remove('btn-navy'); b.classList.add('btn-outline-navy'); });
    btn.classList.remove('btn-outline-navy'); btn.classList.add('btn-navy');
    currentCaseFilter = status;
    renderCasesList();
}

function renderCasesList() {
    const list = document.getElementById('cases-list');
    if(!list) return;
    const searchVal = document.getElementById('search-cases')?.value.toLowerCase() || '';
    const filteredCases = globalData.cases.filter(c => {
        const matchesStatus = currentCaseFilter === '' || c.status === currentCaseFilter;
        const matchesSearch = (c.case_internal_id && c.case_internal_id.toLowerCase().includes(searchVal)) || 
                              (c.opponent_name && c.opponent_name.toLowerCase().includes(searchVal));
        return matchesStatus && matchesSearch;
    });

    if (filteredCases.length === 0) { list.innerHTML = '<p class="text-center p-3 text-muted border bg-white rounded mt-2">لا توجد قضايا</p>'; return; }
    list.innerHTML = filteredCases.map(c => `
        <div class="card-custom p-3 mb-2 shadow-sm border-start border-4 border-accent position-relative" style="cursor:pointer;">
            <div class="d-flex justify-content-between align-items-center mb-1" onclick="viewCaseDetails('${c.id}')">
                <h6 class="fw-bold mb-0 text-navy">${escapeHTML(c.case_internal_id || 'ملف بلا رقم')}</h6>
                <span class="badge ${c.status === 'نشطة' ? 'bg-success' : 'bg-secondary'}">${escapeHTML(c.status || 'نشطة')}</span>
            </div>
            <div class="d-flex justify-content-between align-items-center">
                <small class="text-muted" onclick="viewCaseDetails('${c.id}')"><i class="fas fa-user me-1"></i> ${escapeHTML(globalData.clients.find(cl => cl.id === c.client_id)?.full_name || 'موكل غير محدد')}</small>
                <button class="btn btn-sm btn-outline-primary py-0 px-2 rounded-pill shadow-sm" onclick="openShareModal('${c.id}', '${c.access_pin}', '${c.public_token}')"><i class="fas fa-share-alt"></i></button>
            </div>
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
            <div><b class="text-navy">${escapeHTML(s.full_name)}</b><br><small class="text-muted">${getRoleNameInArabic(s.role)} - ${escapeHTML(s.phone)}</small></div>
            ${s.id !== currentUser.id ? `<button class="btn btn-sm text-danger" onclick="deleteRecord('user', '${s.id}')"><i class="fas fa-trash"></i></button>` : ''}
        </li>
    `).join('');
}

function toggleAgendaView() {
    isKanbanView = !isKanbanView;
    const list = document.getElementById('agenda-list');
    const kanban = document.getElementById('kanban-board');
    if (isKanbanView) { list.classList.add('d-none'); kanban.classList.remove('d-none'); renderKanbanBoard(); }
    else { kanban.classList.add('d-none'); list.classList.remove('d-none'); renderAgendaList(); }
}

function renderAgendaList() {
    const list = document.getElementById('agenda-list');
    if (!list) return;
    const activeAppts = globalData.appointments.filter(a => a.status === 'مجدول' || a.status === 'مؤجل');
    if (activeAppts.length === 0) { list.innerHTML = '<div class="text-center p-4 text-muted bg-white rounded shadow-sm">لا يوجد مهام حالية.</div>'; return; }
    list.innerHTML = activeAppts.map(a => `
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
    const cols = [{ l: 'مجدولة', f: a => a.status === 'مجدول' }, { l: 'منجزة', f: a => a.status === 'تم' }, { l: 'مؤجلة', f: a => a.status === 'مؤجل' }];
    board.innerHTML = cols.map(col => `
        <div class="kanban-col"><div class="kanban-header"><span>${col.l}</span></div>
        ${globalData.appointments.filter(col.f).map(a => `<div class="card-custom p-2 mb-2 shadow-sm border" style="font-size:13px;"><b class="text-navy">${escapeHTML(a.title)}</b><br><small>${new Date(a.appt_date).toLocaleDateString('ar-EG')}</small></div>`).join('')}</div>
    `).join('');
}

async function saveApptOutcome(e) { 
    e.preventDefault(); const id = document.getElementById('outcome_appt_id').value; 
    const notes = document.getElementById('outcome_text').value;
    if(await API.updateAppointment(id, {status:'تم', notes: notes})) { closeModal('apptOutcomeModal'); showAlert('تم الإنجاز', 'success'); await loadAllData(); } 
}

async function saveApptPostpone(e) { 
    e.preventDefault(); const id = document.getElementById('postpone_appt_id').value; 
    const d = new Date(document.getElementById('postpone_date').value).toISOString();
    if(await API.updateAppointment(id, {status:'مؤجل', appt_date: d})) { closeModal('apptPostponeModal'); showAlert('تم التأجيل', 'success'); await loadAllData(); } 
}

async function processIdImage(event) {
    const file = event.target.files[0]; if (!file) return;
    showAlert('جاري التحليل بالذكاء الاصطناعي...', 'info');
    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = await API.readOCR(e.target.result);
        if (data && !data.error) {
            if (data.full_name) document.getElementById('client_full_name').value = data.full_name;
            if (data.national_id) document.getElementById('client_national_id').value = data.national_id;
            showAlert('تم الاستخراج بنجاح', 'success');
        } else showAlert('فشل التحليل', 'danger');
    };
    reader.readAsDataURL(file);
}

function startDictation(targetId) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return showAlert('المتصفح لا يدعم الصوت', 'warning');
    const rec = new SpeechRecognition(); rec.lang = 'ar-JO'; rec.start(); showAlert('تحدث الآن...', 'info');
    rec.onresult = (e) => { document.getElementById(targetId).value += e.results[0][0].transcript; };
}

async function handleSmartSearch(q) {
    const drop = document.getElementById('search-results-dropdown'); if (q.length < 2) return drop.classList.add('d-none');
    const res = await API.smartSearch(q); let html = '';
    if (res.cases?.length) html += '<h6 class="dropdown-header">القضايا</h6>' + res.cases.map(c => `<button class="dropdown-item" onclick="viewCaseDetails('${c.id}')">${escapeHTML(c.case_internal_id)}</button>`).join('');
    if (res.clients?.length) html += '<h6 class="dropdown-header">الموكلين</h6>' + res.clients.map(c => `<button class="dropdown-item" onclick="viewClientProfile('${c.id}')">${escapeHTML(c.full_name)}</button>`).join('');
    drop.innerHTML = html || '<div class="p-3 text-center small text-muted">لا توجد نتائج</div>'; drop.classList.remove('d-none');
}

let currentShareLink = '';
function openShareModal(caseId, pin, publicToken) {
    const token = publicToken || caseId; 
    const baseUrl = window.location.origin + window.location.pathname.replace('app.html', 'client.html');
    currentShareLink = `${baseUrl}?token=${token}`;
    document.getElementById('share_link_input').value = currentShareLink;
    document.getElementById('share_pin_input').value = pin || 'لا يوجد';
    const qrContainer = document.getElementById('share-qrcode'); qrContainer.innerHTML = '';
    new QRCode(qrContainer, { text: currentShareLink, width: 150, height: 150, colorDark: "#10b981", correctLevel: QRCode.CorrectLevel.L });
    openModal('shareModal');
}

function copyShareLink() {
    const text = `رابط قضيتك: ${currentShareLink}\nالرمز السري: ${document.getElementById('share_pin_input').value}`;
    navigator.clipboard.writeText(text).then(() => showAlert('تم النسخ', 'success'));
}

function sendViaWhatsApp() {
    const text = `رابط قضيتك: ${currentShareLink}\nالرمز السري: ${document.getElementById('share_pin_input').value}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
}

async function saveClient(event) {
    event.preventDefault();
    const data = { full_name: document.getElementById('client_full_name').value, phone: document.getElementById('client_phone').value, national_id: document.getElementById('client_national_id').value, email: document.getElementById('client_email').value, client_type: document.getElementById('client_type').value, address: document.getElementById('client_address').value };
    if (await API.addClient(data)) { closeModal('clientModal'); await loadAllData(); showAlert('تمت الإضافة', 'success'); }
}

async function saveCase(event) {
    event.preventDefault(); const lawyers = [];
    document.querySelectorAll('.case-lawyer-cb:checked').forEach(cb => lawyers.push(cb.value));
    const data = { client_id: document.getElementById('case_client_id').value, case_internal_id: document.getElementById('case_internal_id').value, access_pin: document.getElementById('case_access_pin').value, case_type: document.getElementById('case_type').value, opponent_name: document.getElementById('case_opponent_name').value, lawsuit_text: document.getElementById('case_lawsuit_text').value, total_agreed_fees: Number(document.getElementById('case_agreed_fees').value), claim_amount: Number(document.getElementById('case_claim_amount').value), assigned_lawyer_id: lawyers, status: 'نشطة', public_token: crypto.randomUUID() };
    const btn = event.target.querySelector('button[type="submit"]'); btn.disabled = true;
    if (await API.addCase(data)) { closeModal('caseModal'); await loadAllData(); showAlert('تم فتح القضية', 'success'); }
    btn.disabled = false;
}

async function saveAppointment(event) {
    event.preventDefault(); const assignedTo = [];
    document.querySelectorAll('.appt-lawyer-cb:checked').forEach(cb => assignedTo.push(cb.value));
    const data = { title: document.getElementById('appt_title').value, appt_date: new Date(document.getElementById('appt_date').value).toISOString(), type: document.getElementById('appt_type').value, status: 'مجدول', assigned_to: assignedTo };
    if (await API.addAppointment(data)) { closeModal('apptModal'); await loadAllData(); showAlert('تمت الجدولة', 'success'); }
}

async function saveStaff(event) {
    event.preventDefault();
    const data = { full_name: document.getElementById('staff_full_name').value, phone: document.getElementById('staff_phone').value, telegram_id: document.getElementById('staff_telegram_id').value || null, role: document.getElementById('staff_role').value, is_active: true, can_login: true };
    const res = await API.addStaff(data);
    if(res && !res.error) { closeModal('staffModal'); await loadAllData(); showAlert('تم إضافة الموظف', 'success'); }
    else showAlert(res.error || 'فشل الإضافة (تأكد من الكوتا)', 'danger');
}

function populateSelects() {
    const clSel = document.getElementById('case_client_id');
    if(clSel) clSel.innerHTML = '<option value="">اختر الموكل...</option>' + globalData.clients.map(c => `<option value="${c.id}">${escapeHTML(c.full_name)}</option>`).join('');
    const cLDiv = document.getElementById('case_assigned_lawyers_container');
    if (cLDiv) cLDiv.innerHTML = globalData.staff.map(s => `<div class="form-check small"><input class="form-check-input case-lawyer-cb" type="checkbox" value="${s.id}" id="cl_${s.id}"><label class="form-check-label" for="cl_${s.id}">${escapeHTML(s.full_name)}</label></div>`).join('');
    const aLDiv = document.getElementById('appt_assigned_to_container');
    if (aLDiv) aLDiv.innerHTML = globalData.staff.map(s => `<div class="form-check small"><input class="form-check-input appt-lawyer-cb" type="checkbox" value="${s.id}" id="al_${s.id}"><label class="form-check-label" for="al_${s.id}">${escapeHTML(s.full_name)}</label></div>`).join('');
}

async function loadNotifications(silent = false) {
    const res = await API.getNotifications(); globalData.notifications = Array.isArray(res) ? res : [];
    const unread = globalData.notifications.filter(n => !n.is_read);
    const badge = document.getElementById('notification-badge');
    if (unread.length > 0) {
        badge.innerText = unread.length; badge.classList.remove('d-none');
        if (silent) unread.forEach(n => { if(!notifiedIds.has(n.id)) { notifiedIds.add(n.id); triggerPushNotification(n.title, n.message); } });
    } else badge.classList.add('d-none');
}

function triggerPushNotification(title, body) {
    if (Notification.permission === "granted") { navigator.serviceWorker.ready.then(reg => reg.showNotification(title, { body: body, icon: './icons/icon-192.png' })); }
    else if (Notification.permission !== "denied") { Notification.requestPermission().then(p => { if (p === "granted") triggerPushNotification(title, body); }); }
}

function viewCaseDetails(id) { localStorage.setItem('current_case_id', id); window.location.href = 'case-details.html'; }
function viewClientProfile(id) { localStorage.setItem('current_client_id', id); window.location.href = 'client-details.html'; }
function logout() { localStorage.clear(); window.location.href = 'login.html'; }
function openModal(id) { const m = new bootstrap.Modal(document.getElementById(id)); m.show(); }
function closeModal(id) { const m = bootstrap.Modal.getInstance(document.getElementById(id)); m?.hide(); }

function showAlert(m, t) { 
    Swal.fire({ toast: true, position: 'top-end', icon: t === 'danger' ? 'error' : (t === 'warning' ? 'warning' : 'success'), title: escapeHTML(m), showConfirmButton: false, timer: 3000 });
}

async function runConflictCheck() {
    const input = document.getElementById('conflict_search_input').value;
    const resDiv = document.getElementById('conflict_results');
    if (input.length < 2) return showAlert('أدخل حرفين على الأقل', 'warning');
    resDiv.innerHTML = '<div class="text-center p-3"><i class="fas fa-spinner fa-spin"></i> جاري الفحص...</div>';
    const res = await API.checkConflict(input);
    let html = '';
    if (res.clientConflicts?.length) html += `<h6 class="text-success fw-bold">موكل سابق:</h6><ul class="list-group mb-2">${res.clientConflicts.map(c => `<li class="list-group-item small">${escapeHTML(c.full_name)}</li>`).join('')}</ul>`;
    if (res.opponentConflicts?.length) html += `<h6 class="text-danger fw-bold">خصم في قضية:</h6><ul class="list-group">${res.opponentConflicts.map(c => `<li class="list-group-item small">${escapeHTML(c.opponent_name)}</li>`).join('')}</ul>`;
    resDiv.innerHTML = html || '<div class="text-center text-success py-3">لا يوجد تعارض</div>';
}

async function deleteRecord(type, id) { 
    if(confirm('هل أنت متأكد من الحذف؟')) { 
        if(type==='appointment') await API.deleteAppointment(id); 
        if(type==='user') await API.deleteStaff(id); 
        await loadAllData(); 
    } 
}

function filterCases() { renderCasesList(); }
function filterClients() { 
    const v = document.getElementById('search-clients').value.toLowerCase(); 
    Array.from(document.getElementById('clients-list').children).forEach(c => c.style.display = c.innerText.toLowerCase().includes(v) ? '' : 'none'); 
}