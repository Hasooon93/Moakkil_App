// js/app.js - المحرك الشامل لنظام موكّل الذكي (النسخة النهائية المنقحة: أداء عالي، فلاتر، منع الحذف، تقويم ذكي، استخلاص KYC، ذاكرة ذكية، وروابط عميقة، ومزامنة Offline)
// التحديثات الأخيرة: إظهار ملاحظات الإنجاز في بطاقات المواعيد، تفعيل Web Push Native، الجرس المباشر، سجل الرقابة، Optimistic UI، ومعالجة التواريخ.

let globalData = { cases: [], clients: [], staff: [], appointments: [], notifications: [], activityLogs: [] };
let currentUser = JSON.parse(localStorage.getItem(CONFIG.USER_KEY || 'moakkil_user'));
let backgroundSyncTimer = null;
let notifiedIds = new Set(); 
let isKanbanView = false; 
let currentCaseFilter = ''; 

// =================================================================
// 🔔 نظام المصافحة وتفعيل البوش نتفكيشن (Push Subscription)
// =================================================================

const VAPID_PUBLIC_KEY = 'BFhEWsEEpWXrLBrY1U_hrLjwVwpWbRFd-ii5zc8-qb6L0ZgxTRWZqoZNzMl-vuu7zUaAyyEaNJHWqp_oUSPgO_Q'; 

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

async function requestPushPermission() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { 
        showAlert('متصفحك لا يدعم الإشعارات المتطورة.', 'warning'); 
        return; 
    }
    
    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn('[Push] تم رفض الإشعارات من المستخدم.');
            showAlert('تم رفض الصلاحية للإشعارات المنبثقة.', 'danger');
            return;
        }

        const registration = await navigator.serviceWorker.ready;

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });
        }

        await API.subscribePush(subscription.toJSON());
        console.log('[Push] تم تسجيل الجهاز لاستقبال الإشعارات بنجاح!');
        showAlert('تم تفعيل الإشعارات بنجاح.', 'success');
        
        const btn = document.getElementById('install-pwa-btn'); 
        if(btn) btn.classList.add('d-none');

    } catch (error) {
        console.error('[Push Error] فشل تفعيل الإشعارات:', error);
        showAlert('حدث خطأ أثناء تفعيل الإشعارات.', 'danger');
    }
}

const escapeHTML = (str) => {
    if (!str) return '';
    return str.toString().replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
};

window.showToast = function(msg, type) {
    showAlert(msg, type === 'error' ? 'danger' : type);
};

window.onload = async () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW Error:', err));
    }

    if (!localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token') || !currentUser) {
        window.location.href = 'login';
        return;
    }

    setupUserInfo();
    applyRoleBasedUI();
    loadFirmSettings(); 
    await loadAllData();
    await loadNotifications(); 
    startSmartBackgroundSync();

    if ('Notification' in window && Notification.permission === 'default') {
        setTimeout(() => requestPushPermission(), 3000);
    }

    const lastView = localStorage.getItem('last_active_view') || 'dashboard';
    switchView(lastView);
};

function setupUserInfo() {
    const roleAr = getRoleNameInArabic(currentUser.role || currentUser.user_type);
    const userName = escapeHTML(currentUser.full_name || 'مستخدم');
    if (document.getElementById('welcome-name')) document.getElementById('welcome-name').innerText = userName;
    if (document.getElementById('welcome-role')) document.getElementById('welcome-role').innerText = `المنصب: ${roleAr}`;
    if (document.getElementById('top-user-name')) document.getElementById('top-user-name').innerText = userName;
    if (document.getElementById('top-user-avatar')) document.getElementById('top-user-avatar').innerText = userName.charAt(0).toUpperCase();
}

function getRoleNameInArabic(role) {
    if (role === 'admin' || role === 'super_admin' || role === 'superadmin') return 'مدير النظام';
    if (role === 'secretary') return 'سكرتاريا';
    if (role === 'lawyer') return 'محامي';
    return role || 'موظف';
}

function applyRoleBasedUI() {
    const isAdmin = (currentUser.role === 'admin' || currentUser.role === 'super_admin' || currentUser.role === 'superadmin');
    if (isAdmin) {
        if (document.getElementById('staff-management-section')) document.getElementById('staff-management-section').classList.remove('d-none');
        if (document.getElementById('stat-staff-card')) document.getElementById('stat-staff-card').style.display = 'block';
        if (document.getElementById('firm-settings-btn')) document.getElementById('firm-settings-btn').style.display = 'block';
        if (document.getElementById('admin-reports-btn')) document.getElementById('admin-reports-btn').classList.remove('d-none');
        if (document.getElementById('audit-trail-btn')) document.getElementById('audit-trail-btn').style.display = 'block';
    }

    const hasBiometric = localStorage.getItem('moakkil_biometric_id');
    const biometricBtn = document.querySelector('a[onclick="registerBiometricBtn()"]');
    if (hasBiometric && biometricBtn) {
        const liElement = biometricBtn.closest('li');
        if(liElement) liElement.style.display = 'none';
    }
}

window.manualSync = async () => {
    const btn = document.getElementById('btn_sync_dashboard');
    if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-sync fa-spin"></i>'; }
    await loadAllData();
    await loadNotifications();
    showAlert('تمت مزامنة البيانات بنجاح', 'success');
    if(btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync"></i>'; }
};

function startSmartBackgroundSync() {
    backgroundSyncTimer = setInterval(async () => {
        try { await loadNotifications(true); } catch(e) {}
    }, 15000); 
}

async function loadFirmSettings() {
    const localSettings = JSON.parse(localStorage.getItem('firm_settings'));
    if (localSettings) applyFirmSettings(localSettings);

    try {
        const res = await API.getFirmSettings();
        if (res && res.length > 0) {
            const settings = { 
                firm_name: res[0].firm_name, logo_url: res[0].logo_url, 
                primary_color: res[0].primary_color, accent_color: res[0].accent_color,
                firm_phone: res[0].firm_phone || '', firm_address: res[0].firm_address || ''
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

function switchView(viewId) {
    if(viewId === 'ai') { window.location.href = 'ai-chat'; return; }
    if(viewId === 'library') { window.location.href = 'library'; return; }
    if(viewId === 'calculators') { window.location.href = 'calculators'; return; }

    localStorage.setItem('last_active_view', viewId);
    document.querySelectorAll('.view').forEach(v => v.classList.add('d-none'));
    const target = document.getElementById(viewId + '-view');
    if(target) target.classList.remove('d-none');

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const activeNav = document.getElementById(`nav-icon-${viewId}`);
    if(activeNav) activeNav.classList.add('active');
    window.scrollTo(0, 0);
}

function showVCard() {
    const qrContainer = document.getElementById('vcard-qrcode');
    qrContainer.innerHTML = ''; 
    const pathArray = window.location.pathname.split('/');
    pathArray.pop(); 
    const basePath = pathArray.join('/');
    const cvLink = `${window.location.origin + basePath}/verify.html?type=cv&id=${currentUser.id}`;
    
    try {
        new QRCode(qrContainer, { text: cvLink, width: 200, height: 200, colorDark: "#0a192f", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.L });
        const linkDiv = document.getElementById('vcard-link-container');
        if(!linkDiv) qrContainer.insertAdjacentHTML('afterend', `<div id="vcard-link-container" class="mt-3 text-center" style="word-break: break-all;"><a href="${cvLink}" target="_blank" class="small text-primary text-decoration-none">${cvLink}</a></div>`);
        else linkDiv.innerHTML = `<a href="${cvLink}" target="_blank" class="small text-primary text-decoration-none">${cvLink}</a>`;
        openModal('vCardModal');
    } catch(e) {
        qrContainer.innerHTML = '<div class="text-danger small">تعذر توليد البطاقة. تأكد من تحميل مكتبة QR.</div>';
        openModal('vCardModal');
    }
}

async function loadAllData() {
    try {
        const [rawClients, rawCases, staff, rawAppointments] = await Promise.all([
            API.getClients(), API.getCases(), API.getStaff(), API.getAppointments()
        ]);
        
        if(rawClients?.error) console.warn("Clients Error:", rawClients.error);
        if(rawCases?.error) console.warn("Cases Error:", rawCases.error);
        if(staff?.error) console.warn("Staff Error:", staff.error);
        if(rawAppointments?.error) console.warn("Appointments Error:", rawAppointments.error);

        globalData.staff = Array.isArray(staff) ? staff : [];
        filterAndSetClients(Array.isArray(rawClients) ? rawClients : []);
        filterAndSetCases(Array.isArray(rawCases) ? rawCases : []);
        filterAndSetAppointments(Array.isArray(rawAppointments) ? rawAppointments : []);
        
        if (currentUser.role === 'admin' || currentUser.role === 'super_admin' || currentUser.role === 'superadmin') {
            try {
                const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
                const baseUrl = window.API_BASE_URL || CONFIG.API_URL || 'https://curly-pond-9975.hassan-alsakka.workers.dev';
                const historyRes = await fetch(`${baseUrl}/api/history`, { headers: { 'Authorization': `Bearer ${token}` }});
                if(historyRes.ok) {
                    const logs = await historyRes.json();
                    globalData.activityLogs = Array.isArray(logs) ? logs : [];
                }
            } catch(e) { console.warn("Audit Logs Error:", e); }
        }

        renderDashboard(); 
        renderCasesList(); 
        renderClientsList();
        if (isKanbanView) renderKanbanBoard(); else renderAgendaList();
        renderStaffList(); 
        populateSelects();
        renderActivityLogs();
    } catch(e) { 
        console.error("Load Data Error:", e);
        showAlert('خطأ في الاتصال ببعض البيانات', 'danger'); 
    }
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

function filterAndSetClients(raw) { globalData.clients = Array.isArray(raw) ? raw : []; }

function renderDashboard() {
    document.getElementById('stat-cases').innerText = globalData.cases.filter(c => c.status !== 'مكتملة').length;
    document.getElementById('stat-clients').innerText = globalData.clients.length;
    document.getElementById('stat-appointments').innerText = globalData.appointments.filter(a => a.status === 'مجدول' || a.status === 'مؤجل').length;
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
        const matchesStatus = currentCaseFilter === '' || c.status === currentCaseFilter || c.litigation_degree === currentCaseFilter;
        const matchesSearch = (c.case_internal_id && c.case_internal_id.toLowerCase().includes(searchVal)) || (c.opponent_name && c.opponent_name.toLowerCase().includes(searchVal));
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
                <div><h6 class="fw-bold mb-1 text-navy">${escapeHTML(c.case_internal_id || 'ملف بلا رقم')} ${deadlineBadge}</h6>${litBadge}</div>
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
        </div>`;
    }).join('');
}
function filterCases() { renderCasesList(); }

function filterClients() { renderClientsList(); }
function renderClientsList() {
    const list = document.getElementById('clients-list'); if(!list) return;
    let searchVal = document.getElementById('search-clients')?.value.toLowerCase() || '';
    let sortVal = document.getElementById('sort-clients')?.value || 'newest';
    let filtered = globalData.clients.filter(c => c.full_name.toLowerCase().includes(searchVal) || (c.phone && c.phone.includes(searchVal)));
    if (sortVal === 'alpha') filtered.sort((a, b) => a.full_name.localeCompare(b.full_name, 'ar'));
    else filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (filtered.length === 0) { list.innerHTML = '<div class="text-center p-3 text-muted border bg-white rounded mt-2 small">لا يوجد موكلين</div>'; return; }
    list.innerHTML = filtered.map(c => `
        <div class="card-custom client-card p-3 mb-2 shadow-sm d-flex justify-content-between align-items-center bg-white" onclick="viewClientProfile('${c.id}')" style="cursor:pointer; border-radius:12px;">
            <div class="d-flex align-items-center">
                <div class="bg-soft-success text-success rounded-circle d-flex justify-content-center align-items-center me-3 shadow-sm" style="width:45px; height:45px; font-size:1.2rem;"><i class="fas fa-user-tie"></i></div>
                <div><b class="text-navy fs-6">${escapeHTML(c.full_name)}</b><br><small class="text-muted"><i class="fas fa-phone-alt me-1"></i>${escapeHTML(c.phone || 'لا يوجد رقم')}</small></div>
            </div>
            <i class="fas fa-chevron-left text-muted"></i>
        </div>
    `).join('');
}

function renderStaffList() {
    const list = document.getElementById('staff-list'); if(!list) return;
    list.innerHTML = globalData.staff.map(s => `<li class="list-group-item d-flex justify-content-between align-items-center"><div><b class="text-navy">${escapeHTML(s.full_name)}</b><br><small class="text-muted">${getRoleNameInArabic(s.role)} - ${escapeHTML(s.phone)}</small></div></li>`).join('');
}

function toggleAgendaView() {
    isKanbanView = !isKanbanView;
    const list = document.getElementById('agenda-list'); const kanban = document.getElementById('kanban-board');
    if (isKanbanView) { list.classList.add('d-none'); kanban.classList.remove('d-none'); renderKanbanBoard(); }
    else { kanban.classList.add('d-none'); list.classList.remove('d-none'); renderAgendaList(); }
}
function filterAgenda() { renderAgendaList(); }

function renderAgendaList() {
    const list = document.getElementById('agenda-list'); if (!list) return;
    const searchVal = document.getElementById('search-agenda')?.value.toLowerCase() || '';
    const dateVal = document.getElementById('filter-date-agenda')?.value;
    let filteredAppts = globalData.appointments;

    if (searchVal) filteredAppts = filteredAppts.filter(a => a.title.toLowerCase().includes(searchVal));
    if (dateVal) {
        const targetDate = new Date(dateVal).toLocaleDateString('en-CA');
        filteredAppts = filteredAppts.filter(a => new Date(a.appt_date).toLocaleDateString('en-CA') === targetDate);
    } else if (!searchVal) {
        filteredAppts = filteredAppts.filter(a => a.status === 'مجدول' || a.status === 'مؤجل');
    }
    filteredAppts.sort((a, b) => new Date(a.appt_date) - new Date(b.appt_date));

    if (filteredAppts.length === 0) { list.innerHTML = '<div class="text-center p-4 text-muted bg-white rounded shadow-sm">لا توجد مهام تطابق البحث</div>'; return; }
    
    list.innerHTML = filteredAppts.map(a => {
        let assignedHtml = '';
        if (a.assigned_to && Array.isArray(a.assigned_to)) {
            assignedHtml = a.assigned_to.map(id => {
                const s = globalData.staff.find(st => st.id === id); return s ? `<span class="badge bg-soft-primary text-primary border me-1 mb-1"><i class="fas fa-user-tie"></i> ${escapeHTML(s.full_name.split(' ')[0])}</span>` : '';
            }).join('');
        }
        const startTime = new Date(a.appt_date).toISOString().replace(/-|:|\.\d+/g, '');
        const endTime = new Date(new Date(a.appt_date).getTime() + 60*60*1000).toISOString().replace(/-|:|\.\d+/g, '');
        const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(a.title)}&dates=${startTime}/${endTime}`;
        let statusBadgeColor = a.status === 'تم' ? 'success' : (a.status === 'ملغي' ? 'danger' : (a.status === 'مؤجل' ? 'warning' : 'primary'));
        let actionButtons = '';
        
        if (a.status === 'مجدول' || a.status === 'مؤجل') {
            actionButtons = `<div class="d-flex gap-2 mt-3 pt-2 border-top border-light"><button class="btn btn-sm btn-success flex-grow-1 fw-bold shadow-sm" onclick="openApptOutcomeModal('${a.id}')"><i class="fas fa-check"></i> إنجاز</button><button class="btn btn-sm btn-warning flex-grow-1 text-dark fw-bold shadow-sm" onclick="openApptPostponeModal('${a.id}')"><i class="fas fa-clock"></i> تأجيل</button><button class="btn btn-sm btn-danger flex-grow-1 fw-bold shadow-sm" onclick="cancelAppt('${a.id}')"><i class="fas fa-times"></i> إلغاء</button></div>`;
        }
        
        // 🔥 إظهار ملاحظات الإنجاز في بطاقة الموعد إذا وجدت
        let notesHtml = '';
        if (a.notes && a.notes.trim() !== '') {
            notesHtml = `<div class="mt-2 p-2 bg-light border rounded small text-muted"><i class="fas fa-info-circle text-info me-1"></i> <b>ملاحظات الإنجاز:</b> <span style="white-space: pre-wrap;">${escapeHTML(a.notes)}</span></div>`;
        }

        return `<div class="card-custom appt-card p-3 mb-3 shadow-sm border-start border-4 border-${statusBadgeColor} bg-white" style="border-radius:12px;">
            <div class="d-flex justify-content-between align-items-start"><h6 class="fw-bold text-navy mb-1 lh-base" style="max-width:75%;">${escapeHTML(a.title)}</h6><span class="badge bg-${statusBadgeColor} shadow-sm">${escapeHTML(a.status)}</span></div>
            <div class="d-flex justify-content-between align-items-center mb-2 mt-2 bg-light p-2 rounded"><small class="text-muted fw-bold"><i class="fas fa-calendar-alt text-warning me-1"></i> ${new Date(a.appt_date).toLocaleString('ar-EG', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small><a href="${calendarUrl}" target="_blank" class="btn btn-sm btn-outline-secondary py-0 px-2 rounded-pill shadow-sm" title="إضافة للتقويم"><i class="fas fa-calendar-plus"></i></a></div>
            <div class="mb-1">${assignedHtml}</div>
            ${notesHtml}
            ${actionButtons}
        </div>`;
    }).join('');
}

function renderKanbanBoard() {
    const board = document.getElementById('kanban-board'); if(!board) return;
    const cols = [{ l: 'القادمة', f: a => a.status === 'مجدول', color: 'primary' }, { l: 'مؤجلة', f: a => a.status === 'مؤجل', color: 'warning' }, { l: 'منجزة', f: a => a.status === 'تم', color: 'success' }, { l: 'ملغاة', f: a => a.status === 'ملغي', color: 'danger' }];
    board.innerHTML = cols.map(col => `
        <div class="kanban-col border-top border-4 border-${col.color} shadow-sm bg-white mx-2" style="width: 280px; flex-shrink: 0;">
            <div class="kanban-header text-${col.color} mb-3 pb-2 border-bottom border-light"><i class="fas fa-circle me-1 small"></i> ${col.l} (${globalData.appointments.filter(col.f).length})</div>
            <div class="d-flex flex-column gap-2" style="max-height: 55vh; overflow-y: auto;">
            ${globalData.appointments.filter(col.f).sort((a,b) => new Date(b.appt_date) - new Date(a.appt_date)).map(a => {
                
                // إظهار سطر صغير للملاحظات في وضع الـ Kanban
                let notesSnippet = (a.notes && a.notes.trim() !== '') ? `<div class="mt-2 pt-2 border-top border-light text-muted small"><i class="fas fa-info-circle text-info me-1"></i> <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;">${escapeHTML(a.notes)}</span></div>` : '';

                return `<div class="card-custom appt-card p-2 shadow-sm border border-light bg-light" style="font-size:13px; border-radius:10px;">
                    <b class="text-navy d-block text-truncate mb-1" title="${escapeHTML(a.title)}">${escapeHTML(a.title)}</b>
                    <small class="text-muted"><i class="fas fa-calendar-alt me-1 text-secondary"></i> ${new Date(a.appt_date).toLocaleString('ar-EG', {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}</small>
                    ${notesSnippet}
                </div>`;
            }).join('')}</div></div>`).join('');
}

function renderActivityLogs() {
    const list = document.getElementById('audit-list');
    if(!list) return;
    if(globalData.activityLogs.length === 0) {
        list.innerHTML = '<div class="text-center p-3 text-muted">لا يوجد حركات مسجلة حالياً</div>';
        return;
    }
    const actionTypes = { 'CREATE': 'إضافة', 'UPDATE': 'تعديل', 'DELETE': 'حذف' };
    const entityNames = { 'mo_cases': 'قضية', 'mo_clients': 'موكل', 'mo_appointments': 'موعد', 'mo_users': 'موظف', 'mo_installments': 'دفعة', 'mo_expenses': 'مصروف', 'mo_files': 'مستند', 'mo_firms': 'مكتب' };
    
    list.innerHTML = globalData.activityLogs.slice(0, 100).map(log => {
        const staffName = globalData.staff.find(s => s.id === log.user_id)?.full_name || 'مجهول';
        const action = actionTypes[log.action_type] || log.action_type;
        const entity = entityNames[log.entity_type] || log.entity_type;
        const badgeColor = log.action_type === 'CREATE' ? 'success' : (log.action_type === 'DELETE' ? 'danger' : 'warning');
        
        return `
        <div class="card-custom p-3 mb-2 shadow-sm border-start border-4 border-${badgeColor} bg-white" style="border-radius:12px;">
            <div class="d-flex justify-content-between align-items-center mb-1">
                <strong class="text-navy"><i class="fas fa-user-tie me-1 text-secondary"></i> ${escapeHTML(staffName)}</strong>
                <span class="badge bg-${badgeColor} shadow-sm">${action} ${entity}</span>
            </div>
            <small class="text-muted d-block mb-1"><i class="fas fa-clock me-1"></i> ${new Date(log.created_at).toLocaleString('ar-EG')}</small>
            <div class="text-muted" style="font-size: 11px; overflow-wrap: anywhere; user-select: all;">المعرف: ${log.entity_id}</div>
        </div>`;
    }).join('');
}

async function saveApptOutcome(e, id) { 
    if(e) e.preventDefault(); 
    const apptId = id || document.getElementById('outcome_appt_id').value; 
    
    if (apptId.toString().startsWith('temp_')) {
        showAlert('الموعد قيد المزامنة مع السيرفر، يرجى الانتظار ثانية واحدة.', 'warning');
        return;
    }

    const notes = document.getElementById('outcome_text') ? document.getElementById('outcome_text').value : '';
    
    // 🔥 تحديث الملاحظة والحالة محلياً لتظهر فوراً على الشاشة
    const idx = globalData.appointments.findIndex(a => a.id === apptId);
    if(idx !== -1) {
        globalData.appointments[idx].status = 'تم';
        globalData.appointments[idx].notes = notes; 
    }
    
    if (isKanbanView) renderKanbanBoard(); else renderAgendaList();
    closeModal('apptOutcomeModal'); 
    showAlert('تم تسجيل الإنجاز', 'success');

    await API.updateAppointment(apptId, {status:'تم', notes: notes});
}

async function saveApptPostpone(e) { 
    if(e) e.preventDefault(); 
    const id = document.getElementById('postpone_appt_id').value; 
    
    if (id.toString().startsWith('temp_')) {
        showAlert('الموعد قيد المزامنة مع السيرفر، يرجى الانتظار ثانية واحدة.', 'warning');
        return;
    }

    const dInput = document.getElementById('postpone_date').value;
    if(!dInput) return showAlert('الرجاء اختيار تاريخ', 'warning');
    const d = new Date(dInput).toISOString();
    
    const idx = globalData.appointments.findIndex(a => a.id === id);
    if(idx !== -1) { globalData.appointments[idx].status = 'مؤجل'; globalData.appointments[idx].appt_date = d; }
    if (isKanbanView) renderKanbanBoard(); else renderAgendaList();
    closeModal('apptPostponeModal'); 
    showAlert('تم تأجيل الموعد بنجاح', 'success');

    await API.updateAppointment(id, {status:'مؤجل', appt_date: d});
}

async function cancelAppt(id) {
    if (id.toString().startsWith('temp_')) {
        showAlert('الموعد قيد المزامنة مع السيرفر، يرجى الانتظار ثانية واحدة.', 'warning');
        return;
    }

    const confirm = await Swal.fire({ title: 'إلغاء الموعد؟', text: 'سيتم تسجيل الموعد كـ "ملغي" في دفتر الأرشيف.', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'نعم، إلغاء الموعد', cancelButtonText: 'تراجع' });
    if(confirm.isConfirmed) { 
        const idx = globalData.appointments.findIndex(a => a.id === id);
        if(idx !== -1) globalData.appointments[idx].status = 'ملغي';
        if (isKanbanView) renderKanbanBoard(); else renderAgendaList();
        showAlert('تم إلغاء الموعد', 'success');

        await API.updateAppointment(id, {status:'ملغي'});
    }
}

function openApptOutcomeModal(id) { document.getElementById('outcome_appt_id').value = id; document.getElementById('outcome_text').value = ''; openModal('apptOutcomeModal'); }
function openApptPostponeModal(id) { document.getElementById('postpone_appt_id').value = id; document.getElementById('postpone_date').value = ''; openModal('apptPostponeModal'); }

async function processIdImage(event) {
    const file = event.target.files[0]; 
    if (!file) return;
    
    showAlert('جاري قراءة الهوية سحابياً...', 'info');
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        const pureBase64 = e.target.result.split(',')[1];
        
        try {
            const data = await API.readOCR(pureBase64);
            
            if (data && !data.error) {
                const extractedName = data.full_name || (data.data && data.data.full_name) || (data.extracted_json && data.extracted_json.full_name);
                const extractedId = data.national_id || (data.data && data.data.national_id) || (data.extracted_json && data.extracted_json.national_id);
                
                let successCount = 0;
                
                if (extractedName) {
                    document.getElementById('client_full_name').value = extractedName;
                    successCount++;
                }
                
                if (extractedId) {
                    document.getElementById('client_national_id').value = extractedId;
                    successCount++;
                }
                
                if (successCount > 0) {
                    showAlert('تم استخراج البيانات الأساسية بنجاح', 'success');
                } else {
                    showAlert('تمت القراءة ولكن لم نتمكن من التقاط بيانات واضحة، يرجى إعادة التصوير بإضاءة جيدة.', 'warning');
                }
            } else {
                showAlert('فشل في تحليل الصورة من السيرفر', 'danger');
            }
        } catch (err) {
            showAlert('خطأ في الاتصال أثناء القراءة', 'danger');
        }
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
    
    if (res.brain?.length) html += '<h6 class="dropdown-header text-accent fw-bold"><i class="fas fa-brain"></i> الذاكرة القانونية (بحث بالمعنى)</h6>' + res.brain.map(b => `<button class="dropdown-item" onclick="window.location.href='ai-chat.html?q=${encodeURIComponent(b.title)}'"><small class="text-navy fw-bold">${escapeHTML(b.title)}</small><br><span style="font-size:10px;" class="text-muted text-wrap">${escapeHTML(b.ai_summary || b.original_text).substring(0, 70)}...</span></button>`).join('');
    
    if (res.cases?.length) html += '<h6 class="dropdown-header">القضايا</h6>' + res.cases.map(c => `<button class="dropdown-item" onclick="viewCaseDetails('${c.id}')">${escapeHTML(c.case_internal_id)}</button>`).join('');
    
    if (res.clients?.length) html += '<h6 class="dropdown-header">الموكلين</h6>' + res.clients.map(c => `<button class="dropdown-item" onclick="viewClientProfile('${c.id}')">${escapeHTML(c.full_name)}</button>`).join('');
    
    drop.innerHTML = html || '<div class="p-3 text-center small text-muted">لا يوجد نتائج</div>'; drop.classList.remove('d-none');
}

let currentShareLink = '';
function openShareModal(caseId, pin, publicToken) {
    const token = publicToken || caseId; 
    const pathArray = window.location.pathname.split('/'); pathArray.pop(); 
    currentShareLink = `${window.location.origin + pathArray.join('/')}/client.html?token=${token}`;
    document.getElementById('share_link_input').value = currentShareLink;
    document.getElementById('share_pin_input').value = pin || 'لا يوجد';
    const qrContainer = document.getElementById('share-qrcode'); qrContainer.innerHTML = '';
    new QRCode(qrContainer, { text: currentShareLink, width: 160, height: 160, colorDark: "#0a192f", correctLevel: QRCode.CorrectLevel.L });
    openModal('shareModal');
}
function copyShareLinkApp() { navigator.clipboard.writeText(`أهلاً بك، رابط متابعة قضيتك: ${currentShareLink}\nالرمز السري (PIN): ${document.getElementById('share_pin_input').value}`).then(() => showAlert('تم نسخ الرابط', 'success')); }
function sendShareViaWhatsApp() { window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`أهلاً بك، رابط متابعة ملفك: ${currentShareLink}\nالرمز (PIN): ${document.getElementById('share_pin_input').value}`)}`, '_blank'); }

window.generateStrongPIN = function() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let pin = '';
    for (let i = 0; i < 6; i++) pin += chars.charAt(Math.floor(Math.random() * chars.length));
    const pinInput = document.getElementById('case_access_pin'); if (pinInput) pinInput.value = pin;
};

async function saveClient(event) {
    event.preventDefault();
    
    const dobValue = document.getElementById('client_dob') ? document.getElementById('client_dob').value : '';
    const validDob = dobValue === '' ? null : dobValue;

    const data = { 
        full_name: document.getElementById('client_full_name').value, 
        phone: document.getElementById('client_phone').value, 
        national_id: document.getElementById('client_national_id').value, 
        email: document.getElementById('client_email') ? document.getElementById('client_email').value : '', 
        client_type: document.getElementById('client_type').value, 
        address: document.getElementById('client_address').value,
        mother_name: document.getElementById('client_mother') ? document.getElementById('client_mother').value : null,
        date_of_birth: validDob,
        place_of_birth: document.getElementById('client_pob') ? document.getElementById('client_pob').value : null,
        nationality: document.getElementById('client_nationality') ? document.getElementById('client_nationality').value : null,
        marital_status: document.getElementById('client_marital') ? document.getElementById('client_marital').value : null,
        profession: document.getElementById('client_profession') ? document.getElementById('client_profession').value : null,
        confidentiality_level: document.getElementById('client_confidentiality') ? document.getElementById('client_confidentiality').value : 'عادي'
    };
    
    const res = await API.addClient(data);
    if (res && !res.error) { 
        closeModal('clientModal'); await loadAllData(); await loadNotifications();
        showAlert(res.offline ? 'أنت غير متصل. تم الحفظ في الطابور المحلي للمزامنة لاحقاً' : 'تم إضافة الموكل بنجاح', res.offline ? 'warning' : 'success'); 
        event.target.reset(); 
    } else {
        showAlert(res?.error || 'حدث خطأ في الحفظ', 'danger');
    }
}

async function saveCase(event) {
    event.preventDefault(); 
    const lawyerSelect = document.getElementById('case_assigned_lawyers');
    let lawyers = lawyerSelect ? Array.from(lawyerSelect.selectedOptions).map(opt => opt.value) : [];
    if (lawyers.length === 0 && currentUser && currentUser.id) lawyers.push(currentUser.id);
    
    const autoTasks = document.getElementById('case_auto_tasks') ? document.getElementById('case_auto_tasks').checked : false;
    const parseToArray = (str) => str ? str.split('،').map(s => s.trim()).filter(s => s) : [];
    const parseLinesToArray = (str) => str ? str.split('\n').map(s => s.trim()).filter(s => s) : [];

    const deadlineValue = document.getElementById('case_deadline_date') ? document.getElementById('case_deadline_date').value : '';
    const validDeadline = deadlineValue === '' ? null : deadlineValue;

    const statuteValue = document.getElementById('case_statute_of_limitations_date') ? document.getElementById('case_statute_of_limitations_date').value : '';
    const validStatute = statuteValue === '' ? null : statuteValue;

    const parentIdValue = document.getElementById('case_parent_id') ? document.getElementById('case_parent_id').value : '';
    const validParentId = parentIdValue === '' ? null : parentIdValue;

    const data = { 
        client_id: document.getElementById('case_client_id').value, 
        case_internal_id: document.getElementById('case_internal_id').value, 
        access_pin: document.getElementById('case_access_pin').value, 
        case_type: document.getElementById('case_type').value, 
        priority_level: document.getElementById('case_priority_level') ? document.getElementById('case_priority_level').value : 'عادي',
        confidentiality_level: document.getElementById('case_confidentiality') ? document.getElementById('case_confidentiality').value : 'عادي',
        current_stage: document.getElementById('case_current_stage') ? document.getElementById('case_current_stage').value : '',
        
        current_court: document.getElementById('case_court') ? document.getElementById('case_court').value : '',
        court_room: document.getElementById('case_court_room') ? document.getElementById('case_court_room').value : '',
        court_case_number: document.getElementById('case_court_case_number') ? document.getElementById('case_court_case_number').value : '',
        case_year: document.getElementById('case_case_year') && document.getElementById('case_case_year').value ? Number(document.getElementById('case_case_year').value) : null,
        litigation_degree: document.getElementById('case_litigation_degree') ? document.getElementById('case_litigation_degree').value : null,
        current_judge: document.getElementById('case_current_judge') ? document.getElementById('case_current_judge').value : '',
        court_clerk: document.getElementById('case_court_clerk') ? document.getElementById('case_court_clerk').value : '',
        
        parent_case_id: validParentId, 
        
        deadline_date: validDeadline,
        statute_of_limitations_date: validStatute,
        police_station_ref: document.getElementById('case_police_station_ref') ? document.getElementById('case_police_station_ref').value : '',
        prosecution_ref: document.getElementById('case_prosecution_ref') ? document.getElementById('case_prosecution_ref').value : '',
        
        opponent_name: document.getElementById('case_opponent_name').value, 
        opponent_lawyer: document.getElementById('case_opponent_lawyer') ? document.getElementById('case_opponent_lawyer').value : '',
        power_of_attorney_number: document.getElementById('case_poa_number') ? document.getElementById('case_poa_number').value : '',
        poa_details: document.getElementById('case_poa_details') ? document.getElementById('case_poa_details').value : '',
        
        co_plaintiffs: document.getElementById('case_co_plaintiffs') ? parseToArray(document.getElementById('case_co_plaintiffs').value) : [],
        co_defendants: document.getElementById('case_co_defendants') ? parseToArray(document.getElementById('case_co_defendants').value) : [],
        experts_and_witnesses: document.getElementById('case_experts_and_witnesses') ? parseToArray(document.getElementById('case_experts_and_witnesses').value) : [],
        
        lawsuit_facts: document.getElementById('case_lawsuit_text') ? document.getElementById('case_lawsuit_text').value : '',
        legal_basis: document.getElementById('case_legal_basis') ? document.getElementById('case_legal_basis').value : '',
        final_requests: document.getElementById('case_final_requests') ? parseLinesToArray(document.getElementById('case_final_requests').value) : [],
        
        claim_amount: Number(document.getElementById('case_claim_amount').value), 
        total_agreed_fees: Number(document.getElementById('case_agreed_fees').value), 
        success_probability: document.getElementById('case_success_prob') && document.getElementById('case_success_prob').value ? Number(document.getElementById('case_success_prob').value) : null,
        
        assigned_lawyer_id: lawyers, status: 'نشطة', public_token: crypto.randomUUID()
    };
    
    const btn = event.target.querySelector('button[type="submit"]'); btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري الحفظ...';

    const res = await API.addCase(data);
    if (res && !res.error) { 
        if (autoTasks && !res.offline) {
            const tmr = new Date(Date.now() + 86400000).toISOString(); const afterTmr = new Date(Date.now() + 172800000).toISOString();
            await API.addAppointment({ title: 'دراسة ملف القضية وتحضير اللائحة', appt_date: tmr, type: 'كتابة لائحة', status: 'مجدول', assigned_to: lawyers });
            await API.addAppointment({ title: 'التواصل مع الموكل للمستندات', appt_date: afterTmr, type: 'اجتماع موكل', status: 'مجدول', assigned_to: lawyers });
        }
        closeModal('caseModal'); await loadAllData(); await loadNotifications(); 
        showAlert(res.offline ? 'أنت غير متصل. تم الحفظ في الطابور المحلي للمزامنة' : 'تم فتح ملف القضية وتوليد المجلد السحابي بنجاح', res.offline ? 'warning' : 'success'); 
        event.target.reset(); 
    } else { 
        showAlert(res?.error || 'فشل في إضافة القضية', 'error'); 
    }
    
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-save me-1"></i> حفظ وتوليد الملف السحابي';
}

async function saveAppointment(event) {
    event.preventDefault(); 
    const apptSelect = document.getElementById('appt_assigned_to');
    let assignedTo = apptSelect ? Array.from(apptSelect.selectedOptions).map(opt => opt.value) : [];
    if (assignedTo.length === 0 && currentUser && currentUser.id) assignedTo.push(currentUser.id);

    const rawDate = document.getElementById('appt_date').value;
    const data = { 
        title: document.getElementById('appt_title').value, 
        appt_date: rawDate, 
        type: document.getElementById('appt_type').value, 
        status: 'مجدول', 
        assigned_to: assignedTo 
    };
    
    closeModal('apptModal');
    event.target.reset();

    const tempId = 'temp_' + Date.now();
    const tempAppt = { ...data, id: tempId, created_at: new Date().toISOString() };
    globalData.appointments.push(tempAppt);
    
    if (isKanbanView) renderKanbanBoard(); else renderAgendaList();
    showAlert('تمت الجدولة بنجاح', 'success');

    try {
        const res = await API.addAppointment({ ...data, appt_date: new Date(rawDate).toISOString() });
        if (res && !res.error) { 
            const idx = globalData.appointments.findIndex(a => a.id === tempId);
            if (idx !== -1) globalData.appointments[idx] = res;
        } else {
            throw new Error(res?.error || 'حدث خطأ أثناء الجدولة');
        }
    } catch(err) {
        globalData.appointments = globalData.appointments.filter(a => a.id !== tempId);
        if (isKanbanView) renderKanbanBoard(); else renderAgendaList();
        showAlert(err.message, 'danger');
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
        if (typeof Choices !== 'undefined') { if (window.caseLawyerChoices) window.caseLawyerChoices.destroy(); window.caseLawyerChoices = new Choices(cLSelect, { removeItemButton: true, searchEnabled: true, placeholderValue: 'اختر المحامين...' }); }
    }
    const aLSelect = document.getElementById('appt_assigned_to');
    if (aLSelect) {
        aLSelect.innerHTML = globalData.staff.map(s => `<option value="${s.id}">${escapeHTML(s.full_name)}</option>`).join('');
        if (typeof Choices !== 'undefined') { if (window.apptLawyerChoices) window.apptLawyerChoices.destroy(); window.apptLawyerChoices = new Choices(aLSelect, { removeItemButton: true, searchEnabled: true, placeholderValue: 'اختر الموظفين...' }); }
    }
}

async function loadNotifications(silent = false) {
    try {
        const res = await API.getNotifications(); 
        if (!res || res.error) return;

        globalData.notifications = Array.isArray(res) ? res : [];
        
        const unread = globalData.notifications.filter(n => n.is_read === false);
        const badge = document.getElementById('notification-badge');
        const list = document.getElementById('notifications-list');

        if (unread.length > 0) {
            if(badge) { 
                badge.innerText = unread.length > 9 ? '+9' : unread.length; 
                badge.classList.remove('d-none'); 
            }
            if (silent) {
                unread.forEach(n => { 
                    if(!notifiedIds.has(n.id)) { 
                        notifiedIds.add(n.id); 
                        triggerPushNotification(n.title, n.message); 
                    } 
                });
            }
        } else { 
            if(badge) badge.classList.add('d-none'); 
        }

        if(list) {
            if (globalData.notifications.length === 0) {
                list.innerHTML = '<li class="p-3 text-center text-muted small">لا توجد إشعارات حالياً</li>';
            } else {
                list.innerHTML = globalData.notifications.slice(0, 10).map(n => `
                    <li class="dropdown-item border-bottom py-2 text-wrap ${n.is_read ? 'opacity-75' : 'bg-light'}" style="cursor:pointer" onclick="handleNotificationClick('${n.id}', '${n.action_url}')">
                        <strong class="d-block text-navy small mb-1"><i class="fas fa-bell text-warning me-1"></i> ${escapeHTML(n.title)}</strong>
                        <span class="small text-muted d-block" style="white-space: normal; line-height: 1.4;">${escapeHTML(n.message)}</span>
                        <small class="text-muted mt-1 d-block" style="font-size:10px;"><i class="fas fa-clock"></i> ${new Date(n.created_at).toLocaleString('ar-EG')}</small>
                    </li>
                `).join('');
            }
        }
    } catch (e) {
        console.error("خطأ في تحميل الإشعارات:", e);
    }
}

async function handleNotificationClick(id, url) {
    await API.markNotificationAsRead(id);
    if (url && url !== 'undefined' && url !== 'null') {
        window.location.href = url;
    } else {
        loadNotifications(); 
    }
}

async function markNotificationsRead() {
    const unread = globalData.notifications.filter(n => !n.is_read); if(unread.length === 0) return;
    const badge = document.getElementById('notification-badge'); if(badge) badge.classList.add('d-none');
    for (let n of unread) {
        await API.markNotificationAsRead(n.id);
    }
    await loadNotifications(true); 
}

function triggerPushNotification(title, body) { 
    if (Notification.permission === "granted") {
        navigator.serviceWorker.ready.then(reg => reg.showNotification(title, { body: body, icon: './icons/icon-192.png', badge: './icons/icon-192.png', dir:'rtl' })); 
    }
}

function viewCaseDetails(id) { localStorage.setItem('current_case_id', id); window.location.href = 'case-details.html'; }
function viewClientProfile(id) { localStorage.setItem('current_client_id', id); window.location.href = 'client-details.html'; }

function openModal(id) { 
    const el = document.getElementById(id); 
    if(el) { 
        const m = new bootstrap.Modal(el); m.show(); 
        if (id === 'caseModal') { const pinInput = document.getElementById('case_access_pin'); if (pinInput && !pinInput.value) generateStrongPIN(); }
    } 
}
function closeModal(id) { const el = document.getElementById(id); if(el) { const m = bootstrap.Modal.getInstance(el); m?.hide(); } }
function showAlert(m, t) { if(typeof Swal !== 'undefined') Swal.fire({ toast: true, position: 'top-end', icon: t === 'danger' ? 'error' : (t === 'warning' ? 'warning' : 'success'), title: escapeHTML(m), showConfirmButton: false, timer: 3000 }); }

async function runConflictCheck() {
    const input = document.getElementById('conflict_search_input').value; const resDiv = document.getElementById('conflict_results');
    if (input.length < 2) return showAlert('أدخل حرفين أو رقمين للبحث', 'warning');
    resDiv.innerHTML = '<div class="text-center p-3 small"><i class="fas fa-spinner fa-spin"></i> جاري الفحص الدقيق...</div>';
    
    const res = await API.checkConflict(input); let html = '';
    if (res.clientConflicts && res.clientConflicts.length > 0) {
        html += `<h6 class="text-success fw-bold small"><i class="fas fa-user-check"></i> موكل سابق (آمن):</h6><ul class="list-group mb-2 shadow-sm">`;
        html += res.clientConflicts.map(c => `<li class="list-group-item small px-2 py-2 border-0 d-flex justify-content-between align-items-center bg-light mb-1 rounded"><span class="fw-bold text-navy">${escapeHTML(c.full_name)}</span> <span class="badge bg-white text-dark border shadow-sm"><i class="fas fa-id-card text-muted"></i> ${escapeHTML(c.national_id || 'لا يوجد رقم')}</span></li>`).join('');
        html += `</ul>`;
    }
    if (res.opponentConflicts && res.opponentConflicts.length > 0) {
        html += `<h6 class="text-danger fw-bold small mt-3"><i class="fas fa-exclamation-triangle"></i> خصم مسجل (تعارض!):</h6><ul class="list-group shadow-sm">`;
        html += res.opponentConflicts.map(c => `<li class="list-group-item small px-2 py-2 border-0 bg-soft-danger mb-1 rounded"><span class="fw-bold text-danger">${escapeHTML(c.opponent_name)}</span><span class="d-block text-muted mt-1" style="font-size:10px;"><i class="fas fa-folder"></i> ملف: ${escapeHTML(c.case_internal_id || 'غير محدد')}</span></li>`).join('');
        html += `</ul>`;
    }
    resDiv.innerHTML = html || '<div class="text-center text-success py-3 small fw-bold"><i class="fas fa-check-circle fa-2x mb-2 d-block"></i>الاسم والرقم الوطني نظيف تماماً</div>';
}