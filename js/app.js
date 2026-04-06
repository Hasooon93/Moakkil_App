// js/app.js - المحرك الشامل لنظام موكّل الذكي (النسخة النهائية 2026: أداء عالي، فلاتر، منع الحذف، تقويم ذكي، استخلاص KYC، ذاكرة ذكية للنوافذ، روابط عميقة، وتوليد PIN)

let globalData = { cases: [], clients: [], staff: [], appointments: [], notifications: [] };
let currentUser = JSON.parse(localStorage.getItem(CONFIG.USER_KEY || 'moakkil_user'));
let backgroundSyncTimer = null;
let notifiedIds = new Set(); 
let isKanbanView = false; 
let currentCaseFilter = ''; 

// دالة الحماية من ثغرات الحقن (XSS Sanitizer) المعتمدة في الدستور
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

    // التحقق الصارم من الجلسة
    if (!localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token') || !currentUser) {
        window.location.href = 'login.html';
        return;
    }

    setupUserInfo();
    applyRoleBasedUI();
    loadFirmSettings(); 
    await loadAllData();
    await loadNotifications(); 
    startSmartBackgroundSync();

    // طلب الصلاحية للإشعارات المنبثقة تلقائياً إذا لم يقم المستخدم بتحديدها بعد
    if ('Notification' in window && Notification.permission === 'default') {
        setTimeout(() => requestPushPermission(), 3000);
    }

    // [الذاكرة الذكية]: استرجاع آخر نافذة كان عليها المستخدم وفتحها تلقائياً
    const lastView = localStorage.getItem('last_active_view') || 'dashboard';
    switchView(lastView);
};

// عرض بيانات المستخدم في الترويسة
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

// التحكم في العناصر بناءً على الصلاحيات (RBAC)
function applyRoleBasedUI() {
    const isAdmin = (currentUser.role === 'admin');
    if (isAdmin) {
        if (document.getElementById('staff-management-section')) document.getElementById('staff-management-section').classList.remove('d-none');
        if (document.getElementById('stat-staff-card')) document.getElementById('stat-staff-card').style.display = 'block';
        if (document.getElementById('firm-settings-btn')) document.getElementById('firm-settings-btn').style.display = 'block';
        if (document.getElementById('admin-reports-btn')) document.getElementById('admin-reports-btn').classList.remove('d-none');
    }
}

// المزامنة اليدوية والذكية (استبدال الـ Polling المزعج)
window.manualSync = async () => {
    const btn = document.getElementById('btn_sync_dashboard');
    if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-sync fa-spin"></i>'; }
    await loadAllData();
    await loadNotifications();
    showAlert('تمت مزامنة البيانات بنجاح', 'success');
    if(btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync"></i>'; }
};

function startSmartBackgroundSync() {
    // جلب الإشعارات كل 10 ثوانٍ للعمل في الخلفية لتصبح البوش نتفكيشن لحظية
    backgroundSyncTimer = setInterval(async () => {
        try { await loadNotifications(true); } catch(e) {}
    }, 10000); 
}

// جلب وتطبيق إعدادات الهوية البصرية للمكتب
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
        showAlert('تم حفظ إعدادات المكتب بنجاح', 'success');
    } else {
        showAlert('فشل الحفظ: ' + (res.error || 'خطأ غير معروف'), 'danger');
    }
}

// تبديل الواجهات (مع حفظ الذاكرة)
function switchView(viewId) {
    if(viewId === 'ai') { window.location.href = 'ai-chat.html'; return; }
    if(viewId === 'library') { window.location.href = 'library.html'; return; }
    if(viewId === 'calculators') { window.location.href = 'calculators.html'; return; }

    // [الذاكرة الذكية]: تسجيل النافذة المفتوحة للعودة إليها لاحقاً
    localStorage.setItem('last_active_view', viewId);

    document.querySelectorAll('.view').forEach(v => v.classList.add('d-none'));
    const target = document.getElementById(viewId + '-view');
    if(target) target.classList.remove('d-none');

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const activeNav = document.getElementById(`nav-icon-${viewId}`);
    if(activeNav) activeNav.classList.add('active');
    window.scrollTo(0, 0);
}

// vCard QR Code Builder - تم الإصلاح: الآن يولد رابط لصفحة التحقق بدلاً من نص ثابت لكي تفتح صفحة الـ CV
function showVCard() {
    const qrContainer = document.getElementById('vcard-qrcode');
    qrContainer.innerHTML = ''; 
    
    // بناء الرابط العميق لصفحة التحقق الخاصة بالسيرة الذاتية
    const pathArray = window.location.pathname.split('/');
    pathArray.pop(); // إزالة اسم الملف الحالي
    const basePath = pathArray.join('/');
    const baseUrl = window.location.origin + basePath + '/verify.html';
    
    // الرابط الذي سيتم مسحه بالكاميرا
    const cvLink = `${baseUrl}?type=cv&id=${currentUser.id}`;
    
    try {
        new QRCode(qrContainer, { 
            text: cvLink, 
            width: 200, 
            height: 200, 
            colorDark: "#0a192f",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.L 
        });
        
        // عرض الرابط كنص قابل للضغط تحت الكود احتياطياً
        const linkDiv = document.getElementById('vcard-link-container');
        if(!linkDiv) {
            qrContainer.insertAdjacentHTML('afterend', `<div id="vcard-link-container" class="mt-3 text-center" style="word-break: break-all;"><a href="${cvLink}" target="_blank" class="small text-primary text-decoration-none">${cvLink}</a></div>`);
        } else {
            linkDiv.innerHTML = `<a href="${cvLink}" target="_blank" class="small text-primary text-decoration-none">${cvLink}</a>`;
        }
        
        openModal('vCardModal');
    } catch(e) {
        qrContainer.innerHTML = '<div class="text-danger small">تعذر توليد البطاقة. تأكد من تحميل مكتبة QR.</div>';
        openModal('vCardModal');
    }
}

// تحميل كافة البيانات الأولية
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
    } catch(e) { showAlert('خطأ في الاتصال بالبيانات', 'danger'); }
}

function filterAndSetCases(raw) { 
    const isLawyer = (currentUser.role === 'lawyer');
    const cases = Array.isArray(raw) ? raw : [];
    globalData.cases = isLawyer ? cases.filter(c => (c.assigned_lawyer_id && c.assigned_lawyer_id.includes(currentUser.id)) || c.created_by === currentUser.id) : cases;
}

function filterAndSetAppointments(raw) {
    const isLawyer = (currentUser.role === 'lawyer');
    const appts = Array.isArray(raw) ? raw : [];
    globalData.appointments = isLawyer ? appts.filter(a => (a.assigned_to && a.assigned_to.includes(currentUser.id)) || a.created_by === currentUser.id) : appts;
}

function filterAndSetClients(raw) {
    globalData.clients = Array.isArray(raw) ? raw : [];
}

function renderDashboard() {
    document.getElementById('stat-cases').innerText = globalData.cases.filter(c => c.status !== 'مكتملة').length;
    document.getElementById('stat-clients').innerText = globalData.clients.length;
    document.getElementById('stat-appointments').innerText = globalData.appointments.filter(a => a.status === 'مجدول' || a.status === 'مؤجل').length;
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

// --- القضايا وتجميل البطاقات ---
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
        const matchesStatus = currentCaseFilter === '' || c.status === currentCaseFilter || c.litigation_degree === currentCaseFilter;
        const matchesSearch = (c.case_internal_id && c.case_internal_id.toLowerCase().includes(searchVal)) || 
                              (c.opponent_name && c.opponent_name.toLowerCase().includes(searchVal));
        return matchesStatus && matchesSearch;
    });

    if (filteredCases.length === 0) { list.innerHTML = '<div class="text-center p-3 text-muted border bg-white rounded mt-2 small">لا توجد قضايا تطابق البحث</div>'; return; }
    
    list.innerHTML = filteredCases.map(c => {
        let deadlineBadge = '';
        if (c.deadline_date) {
            const dLeft = Math.ceil((new Date(c.deadline_date) - new Date()) / 86400000);
            if (dLeft <= 7 && dLeft >= 0) deadlineBadge = `<span class="badge bg-danger ms-1 shadow-sm"><i class="fas fa-clock"></i> باقي ${dLeft} يوم</span>`;
            else if (dLeft < 0) deadlineBadge = `<span class="badge bg-dark ms-1 shadow-sm"><i class="fas fa-exclamation-triangle"></i> متأخر</span>`;
        }
        let litBadge = c.litigation_degree ? `<span class="badge bg-light text-dark border ms-1"><i class="fas fa-balance-scale"></i> ${escapeHTML(c.litigation_degree)}</span>` : '';
        
        let lawyersHtml = '';
        if (c.assigned_lawyer_id && Array.isArray(c.assigned_lawyer_id)) {
            lawyersHtml = c.assigned_lawyer_id.map(id => {
                const staff = globalData.staff.find(s => s.id === id);
                return staff ? `<span class="badge bg-soft-primary text-primary border me-1 mb-1"><i class="fas fa-user-tie"></i> ${escapeHTML(staff.full_name.split(' ')[0])}</span>` : '';
            }).join('');
        }

        let statusBadgeColor = c.status === 'نشطة' ? 'success' : (c.status === 'مكتملة' ? 'secondary' : 'warning');

        return `
        <div class="card-custom case-card p-3 mb-3 shadow-sm border-start border-4 border-${statusBadgeColor} bg-white position-relative" style="border-radius:12px;">
            <div class="d-flex justify-content-between align-items-start mb-2" onclick="viewCaseDetails('${c.id}')" style="cursor:pointer;">
                <div>
                    <h6 class="fw-bold mb-1 text-navy">${escapeHTML(c.case_internal_id || 'ملف بلا رقم')} ${deadlineBadge}</h6>
                    ${litBadge}
                </div>
                <span class="badge bg-${statusBadgeColor} shadow-sm">${escapeHTML(c.status || 'نشطة')}</span>
            </div>
            <div class="d-flex justify-content-between align-items-center mb-2 bg-light p-2 rounded" onclick="viewCaseDetails('${c.id}')" style="cursor:pointer;">
                <small class="text-muted fw-bold"><i class="fas fa-user text-success me-1"></i> ${escapeHTML(globalData.clients.find(cl => cl.id === c.client_id)?.full_name || 'موكل غير محدد')}</small>
                <small class="text-danger fw-bold"><i class="fas fa-user-shield me-1"></i> الخصم: ${escapeHTML(c.opponent_name || '--')}</small>
            </div>
            <div class="d-flex justify-content-between align-items-center mt-2 pt-2 border-top">
                <div class="d-flex flex-wrap gap-1">${lawyersHtml}</div>
                <button class="btn btn-sm btn-outline-primary py-1 px-3 rounded-pill shadow-sm fw-bold" onclick="openShareModal('${c.id}', '${escapeHTML(c.access_pin)}', '${c.public_token}')"><i class="fas fa-share-alt me-1"></i> مشاركة</button>
            </div>
        </div>
        `;
    }).join('');
}
function filterCases() { renderCasesList(); }

// --- الموكلين والفرز ---
function filterClients() { renderClientsList(); }

function renderClientsList() {
    const list = document.getElementById('clients-list');
    if(!list) return;

    let searchVal = document.getElementById('search-clients')?.value.toLowerCase() || '';
    let sortVal = document.getElementById('sort-clients')?.value || 'newest';

    let filtered = globalData.clients.filter(c => c.full_name.toLowerCase().includes(searchVal) || (c.phone && c.phone.includes(searchVal)));

    if (sortVal === 'alpha') {
        filtered.sort((a, b) => a.full_name.localeCompare(b.full_name, 'ar'));
    } else {
        filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    if (filtered.length === 0) { list.innerHTML = '<div class="text-center p-3 text-muted border bg-white rounded mt-2 small">لا يوجد موكلين</div>'; return; }

    list.innerHTML = filtered.map(c => `
        <div class="card-custom client-card p-3 mb-2 shadow-sm d-flex justify-content-between align-items-center bg-white" onclick="viewClientProfile('${c.id}')" style="cursor:pointer; border-radius:12px;">
            <div class="d-flex align-items-center">
                <div class="bg-soft-success text-success rounded-circle d-flex justify-content-center align-items-center me-3 shadow-sm" style="width:45px; height:45px; font-size:1.2rem;">
                    <i class="fas fa-user-tie"></i>
                </div>
                <div>
                    <b class="text-navy fs-6">${escapeHTML(c.full_name)}</b><br>
                    <small class="text-muted"><i class="fas fa-phone-alt me-1"></i>${escapeHTML(c.phone || 'لا يوجد رقم')}</small>
                </div>
            </div>
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
        </li>
    `).join('');
}

// --- الأجندة والمواعيد ---
function toggleAgendaView() {
    isKanbanView = !isKanbanView;
    const list = document.getElementById('agenda-list');
    const kanban = document.getElementById('kanban-board');
    if (isKanbanView) { list.classList.add('d-none'); kanban.classList.remove('d-none'); renderKanbanBoard(); }
    else { kanban.classList.add('d-none'); list.classList.remove('d-none'); renderAgendaList(); }
}

function filterAgenda() { renderAgendaList(); }

function renderAgendaList() {
    const list = document.getElementById('agenda-list');
    if (!list) return;

    const searchVal = document.getElementById('search-agenda')?.value.toLowerCase() || '';
    const dateVal = document.getElementById('filter-date-agenda')?.value;

    let filteredAppts = globalData.appointments;

    if (searchVal) {
        filteredAppts = filteredAppts.filter(a => a.title.toLowerCase().includes(searchVal));
    }

    if (dateVal) {
        const targetDate = new Date(dateVal).toLocaleDateString('en-CA');
        filteredAppts = filteredAppts.filter(a => new Date(a.appt_date).toLocaleDateString('en-CA') === targetDate);
    } else if (!searchVal) {
        filteredAppts = filteredAppts.filter(a => a.status === 'مجدول' || a.status === 'مؤجل');
    }

    filteredAppts.sort((a, b) => new Date(a.appt_date) - new Date(b.appt_date));

    if (filteredAppts.length === 0) { list.innerHTML = '<div class="text-center p-4 text-muted bg-white rounded shadow-sm">لا توجد مهام أو جلسات تطابق البحث</div>'; return; }
    
    list.innerHTML = filteredAppts.map(a => {
        let assignedHtml = '';
        if (a.assigned_to && Array.isArray(a.assigned_to)) {
            assignedHtml = a.assigned_to.map(id => {
                const s = globalData.staff.find(st => st.id === id);
                return s ? `<span class="badge bg-soft-primary text-primary border me-1 mb-1"><i class="fas fa-user-tie"></i> ${escapeHTML(s.full_name.split(' ')[0])}</span>` : '';
            }).join('');
        }

        const startTime = new Date(a.appt_date).toISOString().replace(/-|:|\.\d+/g, '');
        const endTime = new Date(new Date(a.appt_date).getTime() + 60*60*1000).toISOString().replace(/-|:|\.\d+/g, '');
        const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(a.title)}&dates=${startTime}/${endTime}`;

        let statusBadgeColor = a.status === 'تم' ? 'success' : (a.status === 'ملغي' ? 'danger' : (a.status === 'مؤجل' ? 'warning' : 'primary'));

        let actionButtons = '';
        if (a.status === 'مجدول' || a.status === 'مؤجل') {
            actionButtons = `
            <div class="d-flex gap-2 mt-3 pt-2 border-top border-light">
                <button class="btn btn-sm btn-success flex-grow-1 fw-bold shadow-sm" onclick="openApptOutcomeModal('${a.id}')"><i class="fas fa-check"></i> إنجاز</button>
                <button class="btn btn-sm btn-warning flex-grow-1 text-dark fw-bold shadow-sm" onclick="openApptPostponeModal('${a.id}')"><i class="fas fa-clock"></i> تأجيل</button>
                <button class="btn btn-sm btn-danger flex-grow-1 fw-bold shadow-sm" onclick="cancelAppt('${a.id}')"><i class="fas fa-times"></i> إلغاء</button>
            </div>`;
        }

        return `
        <div class="card-custom appt-card p-3 mb-3 shadow-sm border-start border-4 border-${statusBadgeColor} bg-white" style="border-radius:12px;">
            <div class="d-flex justify-content-between align-items-start">
                <h6 class="fw-bold text-navy mb-1 lh-base" style="max-width:75%;">${escapeHTML(a.title)}</h6>
                <span class="badge bg-${statusBadgeColor} shadow-sm">${escapeHTML(a.status)}</span>
            </div>
            <div class="d-flex justify-content-between align-items-center mb-2 mt-2 bg-light p-2 rounded">
                <small class="text-muted fw-bold"><i class="fas fa-calendar-alt text-warning me-1"></i> ${new Date(a.appt_date).toLocaleString('ar-EG', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>
                <a href="${calendarUrl}" target="_blank" class="btn btn-sm btn-outline-secondary py-0 px-2 rounded-pill shadow-sm" title="إضافة للتقويم"><i class="fas fa-calendar-plus"></i></a>
            </div>
            <div class="mb-1">${assignedHtml}</div>
            ${actionButtons}
        </div>
        `;
    }).join('');
}

function renderKanbanBoard() {
    const board = document.getElementById('kanban-board');
    if(!board) return;
    
    const cols = [
        { l: 'القادمة (مجدولة)', f: a => a.status === 'مجدول', color: 'primary' }, 
        { l: 'مؤجلة', f: a => a.status === 'مؤجل', color: 'warning' },
        { l: 'منجزة', f: a => a.status === 'تم', color: 'success' }, 
        { l: 'ملغاة', f: a => a.status === 'ملغي', color: 'danger' }
    ];
    
    board.innerHTML = cols.map(col => `
        <div class="kanban-col border-top border-4 border-${col.color} shadow-sm bg-white mx-2" style="width: 280px; flex-shrink: 0;">
            <div class="kanban-header text-${col.color} mb-3 pb-2 border-bottom border-light"><i class="fas fa-circle me-1 small"></i> ${col.l} (${globalData.appointments.filter(col.f).length})</div>
            <div class="d-flex flex-column gap-2" style="max-height: 55vh; overflow-y: auto;">
            ${globalData.appointments.filter(col.f).sort((a,b) => new Date(b.appt_date) - new Date(a.appt_date)).map(a => `
                <div class="card-custom appt-card p-2 shadow-sm border border-light bg-light" style="font-size:13px; border-radius:10px;">
                    <b class="text-navy d-block text-truncate mb-1" title="${escapeHTML(a.title)}">${escapeHTML(a.title)}</b>
                    <small class="text-muted"><i class="fas fa-calendar-alt me-1 text-secondary"></i> ${new Date(a.appt_date).toLocaleString('ar-EG', {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}</small>
                </div>
            `).join('')}
            </div>
        </div>
    `).join('');
}

async function saveApptOutcome(e) { 
    e.preventDefault(); const id = document.getElementById('outcome_appt_id').value; 
    const notes = document.getElementById('outcome_text').value;
    if(await API.updateAppointment(id, {status:'تم', notes: notes})) { 
        closeModal('apptOutcomeModal'); 
        showAlert('تم تسجيل الإنجاز في الدفتر', 'success'); 
        await loadAllData(); 
    } 
}

async function saveApptPostpone(e) { 
    e.preventDefault(); const id = document.getElementById('postpone_appt_id').value; 
    const d = new Date(document.getElementById('postpone_date').value).toISOString();
    if(await API.updateAppointment(id, {status:'مؤجل', appt_date: d})) { 
        closeModal('apptPostponeModal'); 
        showAlert('تم تأجيل الموعد بنجاح', 'success'); 
        await loadAllData(); 
    } 
}

async function cancelAppt(id) {
    const confirm = await Swal.fire({ title: 'إلغاء الموعد؟', text: 'سيتم تسجيل الموعد كـ "ملغي" في دفتر الأرشيف، ولن يتم حذفه نهائياً للحفاظ على السجل.', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3085d6', confirmButtonText: 'نعم، إلغاء الموعد', cancelButtonText: 'تراجع' });
    if(confirm.isConfirmed) {
        if(await API.updateAppointment(id, {status:'ملغي'})) { 
            showAlert('تم إلغاء الموعد بنجاح', 'success'); 
            await loadAllData(); 
        }
    }
}

function openApptOutcomeModal(id) { document.getElementById('outcome_appt_id').value = id; document.getElementById('outcome_text').value = ''; openModal('apptOutcomeModal'); }
function openApptPostponeModal(id) { document.getElementById('postpone_appt_id').value = id; document.getElementById('postpone_date').value = ''; openModal('apptPostponeModal'); }

// ميزات الذكاء الاصطناعي والبحث
async function processIdImage(event) {
    const file = event.target.files[0]; if (!file) return;
    showAlert('جاري قراءة الهوية سحابياً...', 'info');
    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = await API.readOCR(e.target.result);
        if (data && !data.error) {
            if (data.full_name) document.getElementById('client_full_name').value = data.full_name;
            if (data.national_id) document.getElementById('client_national_id').value = data.national_id;
            showAlert('تم استخراج البيانات الأساسية بنجاح', 'success');
        } else showAlert('فشل في تحليل الصورة', 'danger');
    };
    reader.readAsDataURL(file);
}

function startDictation(targetId) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return showAlert('المتصفح لا يدعم الإملاء', 'warning');
    const rec = new SpeechRecognition(); rec.lang = 'ar-JO'; rec.start(); showAlert('تحدث الآن...', 'info');
    rec.onresult = (e) => { document.getElementById(targetId).value += e.results[0][0].transcript; };
}

async function handleSmartSearch(q) {
    const drop = document.getElementById('search-results-dropdown'); if (q.length < 2) return drop.classList.add('d-none');
    const res = await API.smartSearch(q); let html = '';
    if (res.cases?.length) html += '<h6 class="dropdown-header">القضايا</h6>' + res.cases.map(c => `<button class="dropdown-item" onclick="viewCaseDetails('${c.id}')">${escapeHTML(c.case_internal_id)}</button>`).join('');
    if (res.clients?.length) html += '<h6 class="dropdown-header">الموكلين</h6>' + res.clients.map(c => `<button class="dropdown-item" onclick="viewClientProfile('${c.id}')">${escapeHTML(c.full_name)}</button>`).join('');
    drop.innerHTML = html || '<div class="p-3 text-center small text-muted">لا يوجد نتائج</div>'; drop.classList.remove('d-none');
}

// مشاركة البوابة مع إصلاح الرابط العميق (Absolute URL)
let currentShareLink = '';
function openShareModal(caseId, pin, publicToken) {
    const token = publicToken || caseId; 
    
    // الحل الجذري للروابط العميقة: جلب المسار الحالي وإزالة اسم الملف واستبداله بـ client.html
    const pathArray = window.location.pathname.split('/');
    pathArray.pop(); // إزالة app.html أو case-details.html
    const basePath = pathArray.join('/');
    const baseUrl = window.location.origin + basePath + '/client.html';
    
    currentShareLink = `${baseUrl}?token=${token}`;
    document.getElementById('share_link_input').value = currentShareLink;
    document.getElementById('share_pin_input').value = pin || 'لا يوجد';
    
    const qrContainer = document.getElementById('share-qrcode'); 
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, { text: currentShareLink, width: 160, height: 160, colorDark: "#0a192f", correctLevel: QRCode.CorrectLevel.L });
    openModal('shareModal');
}

function copyShareLinkApp() {
    const text = `أهلاً بك، رابط متابعة قضيتك: ${currentShareLink}\nالرمز السري (PIN): ${document.getElementById('share_pin_input').value}`;
    navigator.clipboard.writeText(text).then(() => showAlert('تم نسخ الرابط والمفاتيح بنجاح', 'success'));
}

function sendShareViaWhatsApp() {
    const text = `أهلاً بك، يرجى متابعة ملف قضيتك عبر بوابتنا الإلكترونية الآمنة:\nالرابط: ${currentShareLink}\nالرمز السري (PIN): ${document.getElementById('share_pin_input').value}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
}

// دالة توليد كلمة المرور المعقدة للموكل
window.generateStrongPIN = function() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // تجنبنا أحرف O و 0 و I و 1 لمنع التباس الموكل
    let pin = '';
    for (let i = 0; i < 6; i++) {
        pin += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const pinInput = document.getElementById('case_access_pin');
    if (pinInput) {
        pinInput.value = pin;
    }
};

// عمليات الإضافة (POST) - تم إضافة تحديث الجرس الفوري
async function saveClient(event) {
    event.preventDefault();
    const data = { 
        full_name: document.getElementById('client_full_name').value, 
        phone: document.getElementById('client_phone').value, 
        national_id: document.getElementById('client_national_id').value, 
        email: document.getElementById('client_email') ? document.getElementById('client_email').value : '', 
        client_type: document.getElementById('client_type').value, 
        address: document.getElementById('client_address').value,
        mother_name: document.getElementById('client_mother') ? document.getElementById('client_mother').value : null,
        date_of_birth: document.getElementById('client_dob') ? document.getElementById('client_dob').value : null,
        place_of_birth: document.getElementById('client_pob') ? document.getElementById('client_pob').value : null,
        nationality: document.getElementById('client_nationality') ? document.getElementById('client_nationality').value : null,
        marital_status: document.getElementById('client_marital') ? document.getElementById('client_marital').value : null,
        profession: document.getElementById('client_profession') ? document.getElementById('client_profession').value : null,
        confidentiality_level: document.getElementById('client_confidentiality') ? document.getElementById('client_confidentiality').value : 'عادي'
    };
    if (await API.addClient(data)) { 
        closeModal('clientModal'); 
        await loadAllData(); 
        await loadNotifications(); // تحديث فوري للجرس
        showAlert('تم إضافة الموكل بنجاح', 'success'); 
        event.target.reset(); 
    }
}

async function saveCase(event) {
    event.preventDefault(); 
    
    const lawyerSelect = document.getElementById('case_assigned_lawyers');
    const lawyers = lawyerSelect ? Array.from(lawyerSelect.selectedOptions).map(opt => opt.value) : [];
    const autoTasksObj = document.getElementById('case_auto_tasks');
    const autoTasks = autoTasksObj ? autoTasksObj.checked : false;

    const data = { 
        client_id: document.getElementById('case_client_id').value, 
        case_internal_id: document.getElementById('case_internal_id').value, 
        access_pin: document.getElementById('case_access_pin').value, 
        case_type: document.getElementById('case_type').value, 
        opponent_name: document.getElementById('case_opponent_name').value, 
        lawsuit_text: document.getElementById('case_lawsuit_text').value, 
        total_agreed_fees: Number(document.getElementById('case_agreed_fees').value), 
        claim_amount: Number(document.getElementById('case_claim_amount').value), 
        assigned_lawyer_id: lawyers.length > 0 ? lawyers : null, 
        status: 'نشطة', 
        public_token: crypto.randomUUID(),
        litigation_degree: document.getElementById('case_litigation_degree').value || null,
        parent_case_id: document.getElementById('case_parent_id').value || null,
        deadline_date: document.getElementById('case_deadline_date').value || null,
        success_probability: document.getElementById('case_success_prob').value ? Number(document.getElementById('case_success_prob').value) : null,
        confidentiality_level: document.getElementById('case_confidentiality') ? document.getElementById('case_confidentiality').value : 'عادي'
    };
    
    const btn = event.target.querySelector('button[type="submit"]'); btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري الحفظ...';

    const res = await API.addCase(data);
    if (res && !res.error) { 
        if (autoTasks) {
            const tmr = new Date(Date.now() + 86400000).toISOString();
            const afterTmr = new Date(Date.now() + 172800000).toISOString();
            await API.addAppointment({ title: 'دراسة ملف القضية وتحضير اللائحة', appt_date: tmr, type: 'كتابة لائحة', status: 'مجدول', assigned_to: lawyers.length > 0 ? lawyers : [currentUser.id] });
            await API.addAppointment({ title: 'التواصل مع الموكل للمستندات', appt_date: afterTmr, type: 'اجتماع موكل', status: 'مجدول', assigned_to: lawyers.length > 0 ? lawyers : [currentUser.id] });
        }
        closeModal('caseModal'); 
        await loadAllData(); 
        await loadNotifications(); // تحديث فوري للجرس لضمان ظهور إشعار الإسناد
        showAlert('تم فتح ملف القضية بنجاح', 'success'); 
        event.target.reset(); 
    } else {
        showAlert(res?.error || 'فشل في إضافة القضية', 'error');
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save me-1"></i> حفظ وتوليد الملف';
}

async function saveAppointment(event) {
    event.preventDefault(); 
    const apptSelect = document.getElementById('appt_assigned_to');
    const assignedTo = apptSelect ? Array.from(apptSelect.selectedOptions).map(opt => opt.value) : [];

    const data = { 
        title: document.getElementById('appt_title').value, 
        appt_date: new Date(document.getElementById('appt_date').value).toISOString(), 
        type: document.getElementById('appt_type').value, 
        status: 'مجدول', 
        assigned_to: assignedTo.length > 0 ? assignedTo : null 
    };
    if (await API.addAppointment(data)) { 
        closeModal('apptModal'); 
        await loadAllData(); 
        await loadNotifications(); // تحديث فوري للجرس بعد إسناد الموعد
        showAlert('تمت الجدولة بنجاح', 'success'); 
        event.target.reset(); 
    }
}

function populateSelects() {
    const clSel = document.getElementById('case_client_id');
    if(clSel) clSel.innerHTML = '<option value="">اختر الموكل...</option>' + globalData.clients.map(c => `<option value="${c.id}">${escapeHTML(c.full_name)}</option>`).join('');
    
    const pCaseSel = document.getElementById('case_parent_id');
    if(pCaseSel) pCaseSel.innerHTML = '<option value="">لا يوجد (قضية مستقلة)</option>' + globalData.cases.map(c => `<option value="${c.id}">${escapeHTML(c.case_internal_id || 'بدون رقم')}</option>`).join('');

    const cLSelect = document.getElementById('case_assigned_lawyers');
    if (cLSelect) {
        cLSelect.innerHTML = globalData.staff.map(s => `<option value="${s.id}">${escapeHTML(s.full_name)}</option>`).join('');
        if (typeof Choices !== 'undefined') {
            if (window.caseLawyerChoices) window.caseLawyerChoices.destroy();
            window.caseLawyerChoices = new Choices(cLSelect, { removeItemButton: true, searchEnabled: true, placeholderValue: 'اختر المحامين...' });
        }
    }
    
    const aLSelect = document.getElementById('appt_assigned_to');
    if (aLSelect) {
        aLSelect.innerHTML = globalData.staff.map(s => `<option value="${s.id}">${escapeHTML(s.full_name)}</option>`).join('');
        if (typeof Choices !== 'undefined') {
            if (window.apptLawyerChoices) window.apptLawyerChoices.destroy();
            window.apptLawyerChoices = new Choices(aLSelect, { removeItemButton: true, searchEnabled: true, placeholderValue: 'اختر الموظفين...' });
        }
    }
}

// الإشعارات والرقابة
async function loadNotifications(silent = false) {
    const res = await API.getNotifications(); 
    globalData.notifications = Array.isArray(res) ? res : [];
    
    const unread = globalData.notifications.filter(n => !n.is_read);
    const badge = document.getElementById('notification-badge');
    const list = document.getElementById('notifications-list');

    if (unread.length > 0) {
        if(badge) { badge.innerText = unread.length; badge.classList.remove('d-none'); }
        if (silent) unread.forEach(n => { 
            if(!notifiedIds.has(n.id)) { 
                notifiedIds.add(n.id); 
                triggerPushNotification(n.title, n.message); 
            } 
        });
    } else {
        if(badge) badge.classList.add('d-none');
    }

    if(list) {
        if (globalData.notifications.length === 0) {
            list.innerHTML = '<li class="p-3 text-center text-muted small">لا توجد إشعارات حالياً</li>';
        } else {
            list.innerHTML = globalData.notifications.slice(0, 15).map(n => `
                <li class="dropdown-item border-bottom py-2 text-wrap ${n.is_read ? 'opacity-75' : 'bg-light'}">
                    <strong class="d-block text-navy small mb-1"><i class="fas fa-bell text-warning me-1"></i> ${escapeHTML(n.title)}</strong>
                    <span class="small text-muted d-block" style="white-space: normal; line-height: 1.4;">${escapeHTML(n.message)}</span>
                    <small class="text-muted mt-1 d-block" style="font-size:10px;"><i class="fas fa-clock"></i> ${new Date(n.created_at).toLocaleString('ar-EG')}</small>
                </li>
            `).join('');
        }
    }
}

async function markNotificationsRead() {
    const unread = globalData.notifications.filter(n => !n.is_read);
    if(unread.length === 0) return;
    
    const badge = document.getElementById('notification-badge');
    if(badge) badge.classList.add('d-none');
    
    for (let n of unread) { await API.markNotificationAsRead(n.id); }
    await loadNotifications(true);
}

async function requestPushPermission() {
    if (!('Notification' in window)) { showAlert('متصفحك لا يدعم الإشعارات.', 'warning'); return; }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
        const reg = await navigator.serviceWorker.ready;
        await API.subscribePush({ device_token: 'web_browser_device', device_type: 'web' });
        showAlert('تم تفعيل إشعارات الهاتف بنجاح.', 'success');
        const btn = document.getElementById('install-pwa-btn');
        if(btn) btn.classList.add('d-none');
    } else {
        showAlert('يرجى السماح بالإشعارات من إعدادات المتصفح لتصلك التنبيهات الفورية.', 'warning');
    }
}

function triggerPushNotification(title, body) {
    if (Notification.permission === "granted") { 
        navigator.serviceWorker.ready.then(reg => reg.showNotification(title, { body: body, icon: './icons/icon-192.png', badge: './icons/icon-192.png' })); 
    }
}

function viewCaseDetails(id) { localStorage.setItem('current_case_id', id); window.location.href = 'case-details.html'; }
function viewClientProfile(id) { localStorage.setItem('current_client_id', id); window.location.href = 'client-details.html'; }
function logout() { localStorage.clear(); window.location.href = 'login.html'; }

function openModal(id) { 
    const el = document.getElementById(id); 
    if(el) { 
        const m = new bootstrap.Modal(el); 
        m.show(); 
        if (id === 'caseModal') {
            const pinInput = document.getElementById('case_access_pin');
            if (pinInput && !pinInput.value) {
                generateStrongPIN();
            }
        }
    } 
}

function closeModal(id) { const el = document.getElementById(id); if(el) { const m = bootstrap.Modal.getInstance(el); m?.hide(); } }
function showAlert(m, t) { if(typeof Swal !== 'undefined') Swal.fire({ toast: true, position: 'top-end', icon: t === 'danger' ? 'error' : (t === 'warning' ? 'warning' : 'success'), title: escapeHTML(m), showConfirmButton: false, timer: 3000 }); }

async function runConflictCheck() {
    const input = document.getElementById('conflict_search_input').value;
    const resDiv = document.getElementById('conflict_results');
    if (input.length < 2) return showAlert('أدخل حرفين للبحث', 'warning');
    resDiv.innerHTML = '<div class="text-center p-3 small"><i class="fas fa-spinner fa-spin"></i> جاري الفحص...</div>';
    
    const res = await API.checkConflict(input);
    let html = '';
    if (res.clientConflicts?.length) html += `<h6 class="text-success fw-bold small"><i class="fas fa-user-check"></i> موكل سابق (آمن):</h6><ul class="list-group mb-2 shadow-sm">${res.clientConflicts.map(c => `<li class="list-group-item small px-2 py-1 border-0">${escapeHTML(c.full_name)}</li>`).join('')}</ul>`;
    if (res.opponentConflicts?.length) html += `<h6 class="text-danger fw-bold small mt-3"><i class="fas fa-exclamation-triangle"></i> خصم حالي (تعارض!):</h6><ul class="list-group shadow-sm">${res.opponentConflicts.map(c => `<li class="list-group-item small px-2 py-1 border-0">${escapeHTML(c.opponent_name)}</li>`).join('')}</ul>`;
    resDiv.innerHTML = html || '<div class="text-center text-success py-3 small fw-bold"><i class="fas fa-check-circle fa-2x mb-2 d-block"></i>الاسم نظيف</div>';
}