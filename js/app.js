// js/app.js - محرك لوحة التحكم الشامل (يحتوي على الإملاء الصوتي، OCR، لوحة كانبان، والمهام الآلية)

let globalData = { cases: [], clients: [], staff: [], appointments: [], notifications: [] };
let currentUser = JSON.parse(localStorage.getItem(CONFIG.USER_KEY));
let realtimeSyncTimer = null;
let deferredPrompt; 
let notifiedIds = new Set(); 
let isKanbanView = false; // تتبع حالة عرض الأجندة

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

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('install-pwa-btn');
    if (installBtn) {
        installBtn.classList.remove('d-none');
        installBtn.onclick = async () => {
            installBtn.classList.add('d-none');
            deferredPrompt.prompt();
            deferredPrompt = null;
        };
    }
});

window.addEventListener('appinstalled', () => {
    const installBtn = document.getElementById('install-pwa-btn');
    if (installBtn) installBtn.classList.add('d-none');
});

function startRealtimeSync() {
    realtimeSyncTimer = setInterval(async () => {
        try {
            const [newCases, newAppts, newClients] = await Promise.all([
                API.getCases(), API.getAppointments(), API.getClients()
            ]);
            let needsUpdate = false;
            
            const safeCases = Array.isArray(newCases) ? newCases : [];
            const safeAppts = Array.isArray(newAppts) ? newAppts : [];
            const safeClients = Array.isArray(newClients) ? newClients : [];

            if(JSON.stringify(safeCases) !== JSON.stringify(globalData.cases)) { filterAndSetCases(safeCases); needsUpdate = true; }
            if(JSON.stringify(safeAppts) !== JSON.stringify(globalData.appointments)) { filterAndSetAppointments(safeAppts); needsUpdate = true; }
            if(JSON.stringify(safeClients) !== JSON.stringify(globalData.clients)) { filterAndSetClients(safeClients); needsUpdate = true; }

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

async function loadFirmSettings() {
    const localSettings = JSON.parse(localStorage.getItem('firm_settings'));
    if (localSettings) applyFirmSettings(localSettings);

    try {
        let res;
        if(typeof API.getFirmSettings === 'function') res = await API.getFirmSettings();
        if (res) {
            const settings = { firm_name: res.firm_name || res.name, logo_url: res.logo_url, primary_color: res.primary_color, accent_color: res.accent_color };
            localStorage.setItem('firm_settings', JSON.stringify(settings));
            applyFirmSettings(settings);
            
            if(document.getElementById('firm_setting_name')) document.getElementById('firm_setting_name').value = settings.firm_name || '';
            if(document.getElementById('firm_setting_logo')) document.getElementById('firm_setting_logo').value = settings.logo_url || '';
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
    if (topName && (settings.firm_name || settings.logo_url)) {
        const logoHtml = settings.logo_url ? `<img src="${settings.logo_url}" width="24" height="24" class="me-2 rounded" style="object-fit:cover;">` : `<i class="fas fa-balance-scale text-accent me-2"></i>`;
        topName.innerHTML = `${logoHtml} ${settings.firm_name || 'موكّل'}`;
    }
}

async function saveFirmSettings(event) {
    event.preventDefault();
    const data = {
        firm_name: document.getElementById('firm_setting_name').value, logo_url: document.getElementById('firm_setting_logo').value,
        primary_color: document.getElementById('firm_setting_primary').value, accent_color: document.getElementById('firm_setting_accent').value
    };
    localStorage.setItem('firm_settings', JSON.stringify(data));
    applyFirmSettings(data);
    
    try {
        if(typeof API.updateFirmSettings === 'function') await API.updateFirmSettings(data);
    } catch(e) {}

    closeModal('settingsModal');
    showAlert('تم حفظ الإعدادات', 'success');
}

// ------------------ نظام vCard الذكي ------------------
function showVCard() {
    const modal = document.getElementById('vCardModal');
    if(!modal) return;
    
    const qrContainer = document.getElementById('vcard-qrcode');
    qrContainer.innerHTML = ''; 
    
    const firmSettings = JSON.parse(localStorage.getItem('firm_settings')) || {};
    const firmName = firmSettings.firm_name || 'مكتب المحاماة';
    const userName = currentUser.full_name || '';
    const phone = currentUser.phone || '';
    const url = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);

    const vcardText = `BEGIN:VCARD\nVERSION:3.0\nFN:${userName}\nORG:${firmName}\nTEL:${phone}\nURL:${url}\nEND:VCARD`;

    new QRCode(qrContainer, {
        text: vcardText,
        width: 200,
        height: 200,
        colorDark : "#0a192f",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.M
    });

    openModal('vCardModal');
}

// ------------------ نظام الإشعارات ------------------
async function requestNotificationPermission() {
    if (!("Notification" in window)) {
        showAlert('متصفحك لا يدعم الإشعارات المنبثقة', 'danger');
        return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        showAlert('تم تفعيل إشعارات الهاتف بنجاح!', 'success');
        renderNotificationsDropdown(false); 
    } else {
        showAlert('تم رفض صلاحية الإشعارات من قبل النظام', 'warning');
    }
}

function triggerPushNotification(title, body) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(registration => {
                registration.showNotification('نظام موكّل | ' + title, {
                    body: body,
                    icon: './icons/icon-192.png',
                    vibrate: [200, 100, 200],
                    badge: './icons/icon-192.png'
                }).catch(e => {
                    new Notification('نظام موكّل | ' + title, { body: body });
                });
            });
        } else {
            new Notification('نظام موكّل | ' + title, { body: body });
        }
    } catch(err) { console.log("Push Notification Error:", err); }
}

async function loadNotifications(isSilent = false) {
    if (typeof API.getNotifications !== 'function') return;
    const notifications = await API.getNotifications();
    globalData.notifications = Array.isArray(notifications) ? notifications : [];
    renderNotificationsDropdown(isSilent);
}

function renderNotificationsDropdown(isSilent) {
    const list = document.getElementById('notifications-list');
    const badge = document.getElementById('notification-badge');
    const bellIcon = document.querySelector('#notificationDropdown i');
    if (!list || !badge) return;

    const unreadNotifications = globalData.notifications.filter(n => !n.is_read);
    
    if (unreadNotifications.length > 0) {
        badge.innerText = unreadNotifications.length;
        badge.classList.remove('d-none');
        if (bellIcon) bellIcon.classList.add('heartbeat-animation'); 

        unreadNotifications.forEach(n => {
            if (!notifiedIds.has(n.id)) {
                notifiedIds.add(n.id);
                if (isSilent) {
                    triggerPushNotification(n.title, n.message || n.body);
                }
            }
        });
    } else {
        badge.classList.add('d-none');
        if (bellIcon) bellIcon.classList.remove('heartbeat-animation');
    }

    let html = '';
    
    if ("Notification" in window && Notification.permission === "default") {
        html += `<li class="p-2 mb-2 bg-light border-bottom">
                    <button class="btn btn-sm btn-primary w-100 fw-bold shadow-sm" onclick="requestNotificationPermission()"><i class="fas fa-bell-on"></i> تفعيل إشعارات المتصفح/الهاتف</button>
                 </li>`;
    }

    html += `<li><h6 class="dropdown-header fw-bold text-navy"><i class="fas fa-bell me-2"></i>الإشعارات الحديثة</h6></li><li><hr class="dropdown-divider"></li>`;

    if (globalData.notifications.length === 0) {
        html += `<li><a class="dropdown-item text-center text-muted small py-3" href="#">لا توجد إشعارات</a></li>`;
    } else {
        html += globalData.notifications.slice(0, 10).map(n => {
            const bgClass = n.is_read ? '' : 'bg-light';
            const fwClass = n.is_read ? 'text-muted' : 'fw-bold text-dark';
            const timeString = new Date(n.created_at).toLocaleString('ar-EG', {hour: '2-digit', minute:'2-digit', day:'numeric', month:'numeric'});
            return `<li><a class="dropdown-item py-2 border-bottom ${bgClass}" href="#" onclick="handleNotificationClick('${n.id}', '${n.link}')">
                        <div class="d-flex justify-content-between"><span class="small ${fwClass}">${n.title}</span><small class="text-muted" style="font-size: 0.7rem;">${timeString}</small></div>
                        <div class="small text-muted text-wrap mt-1" style="font-size: 0.8rem;">${n.message || n.body}</div></a></li>`;
        }).join('');
    }
    list.innerHTML = html;
}

async function handleNotificationClick(id, linkAction) {
    event.preventDefault();
    const notif = globalData.notifications.find(n => n.id === id);
    if (notif && !notif.is_read) { await API.markNotificationAsRead(id); notif.is_read = true; renderNotificationsDropdown(false); }
    if (linkAction === 'cases') switchView('cases');
    else if (linkAction === 'appointments' || linkAction === 'agenda') switchView('agenda');
    else switchView('dashboard');
}

function setupUserInfo() {
    const roleAr = getRoleNameInArabic(currentUser.role);
    const userName = currentUser.full_name || 'مستخدم';
    if (document.getElementById('welcome-name')) document.getElementById('welcome-name').innerText = userName;
    if (document.getElementById('welcome-role')) document.getElementById('welcome-role').innerText = `المنصب: ${roleAr}`;
    if (document.getElementById('top-user-name')) document.getElementById('top-user-name').innerText = userName;
    if (document.getElementById('top-user-avatar')) document.getElementById('top-user-avatar').innerText = userName.charAt(0).toUpperCase();
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
        if(document.getElementById('case-assign-wrapper')) document.getElementById('case-assign-wrapper').style.display = 'none';
        if(document.getElementById('appt-assign-wrapper')) document.getElementById('appt-assign-wrapper').style.display = 'none';
    }
    if (isAdmin) {
        if (document.getElementById('stat-staff-card')) document.getElementById('stat-staff-card').style.display = 'block';
        if (document.getElementById('admin-reports-btn')) document.getElementById('admin-reports-btn').classList.remove('d-none');
        if (document.getElementById('firm-settings-btn')) document.getElementById('firm-settings-btn').style.display = 'block';
    } else {
        if(document.getElementById('staff-management-section')) document.getElementById('staff-management-section').style.display = 'none';
    }
}

function filterAndSetCases(rawCases) {
    const isLawyer = (currentUser.role === 'lawyer' || currentUser.role === 'محامي');
    let casesArray = Array.isArray(rawCases) ? rawCases : [];
    
    if (isLawyer) {
        globalData.cases = casesArray.filter(c => {
            let isAssigned = false;
            if (Array.isArray(c.assigned_lawyer_id)) isAssigned = c.assigned_lawyer_id.includes(currentUser.id);
            else if (c.assigned_lawyer_id) isAssigned = (c.assigned_lawyer_id === currentUser.id);
            return isAssigned || c.created_by == currentUser.id;
        });
    } else {
        globalData.cases = casesArray;
    }
}

function filterAndSetAppointments(rawAppointments) {
    const isLawyer = (currentUser.role === 'lawyer' || currentUser.role === 'محامي');
    let apptsArray = Array.isArray(rawAppointments) ? rawAppointments : [];
    
    if (isLawyer) {
        globalData.appointments = apptsArray.filter(a => {
            let isAssigned = false;
            if (Array.isArray(a.assigned_to)) isAssigned = a.assigned_to.includes(currentUser.id);
            else if (a.assigned_to) isAssigned = (a.assigned_to === currentUser.id);
            return isAssigned || a.created_by == currentUser.id;
        });
    } else {
        globalData.appointments = apptsArray;
    }
}

function filterAndSetClients(rawClients) {
    const isLawyer = (currentUser.role === 'lawyer' || currentUser.role === 'محامي');
    let clientsArray = Array.isArray(rawClients) ? rawClients : [];
    
    if (isLawyer) {
        const myClientIds = new Set(globalData.cases.map(c => c.client_id));
        globalData.clients = clientsArray.filter(c => myClientIds.has(c.id) || c.created_by == currentUser.id);
    } else {
        globalData.clients = clientsArray;
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
    } catch(e) {
        showAlert('تأكد من الاتصال بالإنترنت لتحديث البيانات', 'warning');
    }
}

function renderDashboard() {
    document.getElementById('stat-cases').innerText = globalData.cases.length;
    document.getElementById('stat-clients').innerText = globalData.clients.length;
    document.getElementById('stat-appointments').innerText = globalData.appointments.length;
    document.getElementById('stat-staff').innerText = globalData.staff.length;

    let totalAgreed = 0, totalPaid = 0;
    globalData.cases.forEach(c => { totalAgreed += Number(c.total_agreed_fees) || 0; totalPaid += Number(c.total_paid) || 0; });
    document.getElementById('fin-agreed').innerText = totalAgreed.toLocaleString();
    document.getElementById('fin-paid').innerText = totalPaid.toLocaleString();
    document.getElementById('fin-rem').innerText = (totalAgreed - totalPaid).toLocaleString();
}

function renderCasesList() {
    const list = document.getElementById('cases-list');
    if(!list) return;
    if (globalData.cases.length === 0) { list.innerHTML = '<p class="text-center p-3 text-muted border bg-white rounded">لا يوجد قضايا مسجلة</p>'; return; }
    
    const isAdmin = (currentUser.role === 'admin' || currentUser.role === 'مدير');
    list.innerHTML = globalData.cases.map(c => {
        let deadlineWarning = '';
        if(c.deadline_date) {
            const daysLeft = Math.ceil((new Date(c.deadline_date) - new Date()) / (1000 * 60 * 60 * 24));
            if(daysLeft <= 7 && daysLeft >= 0) deadlineWarning = `<span class="badge bg-danger ms-2 heartbeat-animation"><i class="fas fa-clock"></i> متبقي ${daysLeft} أيام</span>`;
            else if(daysLeft < 0) deadlineWarning = `<span class="badge bg-dark ms-2"><i class="fas fa-times-circle"></i> منتهي</span>`;
        }
        
        const client = globalData.clients.find(cl => cl.id === c.client_id);
        const clientName = client ? client.full_name : 'موكل غير محدد';

        return `
        <div class="card-custom p-3 mb-2 shadow-sm border-start border-4 border-accent position-relative">
            <div class="d-flex justify-content-between align-items-center mb-1">
                <h6 class="fw-bold mb-0 text-navy" onclick="viewCaseDetails('${c.id}')" style="cursor:pointer; width: 70%;">${c.case_internal_id || 'بدون رقم'} ${deadlineWarning}</h6>
                <div>
                    <span class="badge ${c.status === 'نشطة' ? 'bg-success' : 'bg-secondary'}">${c.status || 'نشطة'}</span>
                    ${isAdmin ? `<button class="btn btn-sm text-danger p-0 ms-2" onclick="deleteRecord('case', '${c.id}')"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            </div>
            <small class="text-muted d-block" onclick="viewClientProfile('${c.client_id}')" style="cursor:pointer;"><i class="fas fa-user me-1"></i> ${clientName}</small>
            <div class="d-flex justify-content-between align-items-center mt-2">
                <small class="text-muted"><i class="fas fa-balance-scale me-1"></i> ${c.current_court || 'محكمة غير محددة'}</small>
                <button class="btn btn-sm btn-outline-info py-0 px-2 fw-bold" onclick="copyClientDeepLink('${c.public_token}', '${c.access_pin}')"><i class="fas fa-share-alt"></i> إرسال للموكل</button>
            </div>
        </div>`
    }).join('');
}

function renderClientsList() {
    const list = document.getElementById('clients-list');
    if(!list) return;
    if (globalData.clients.length === 0) { list.innerHTML = '<p class="text-center p-3 text-muted border bg-white rounded">لا يوجد موكلين مسجلين لك</p>'; return; }
    
    const isAdmin = (currentUser.role === 'admin' || currentUser.role === 'مدير');
    list.innerHTML = globalData.clients.map(c => `
        <div class="card-custom p-3 mb-2 shadow-sm d-flex justify-content-between align-items-center">
            <div>
                <b class="text-navy" onclick="viewClientProfile('${c.id}')" style="cursor:pointer; font-size: 1.1rem;">${c.full_name}</b><br>
                <small class="text-muted"><i class="fas fa-phone me-1"></i> ${c.phone || 'بدون هاتف'}</small>
            </div>
            ${isAdmin ? `<button class="btn btn-sm text-danger p-0" onclick="deleteRecord('client', '${c.id}')"><i class="fas fa-trash"></i></button>` : ''}
        </div>
    `).join('');
}

// ------------------ نظام الأجندة ولوحة كانبان ------------------
function toggleAgendaView() {
    isKanbanView = !isKanbanView;
    const listContainer = document.getElementById('agenda-list');
    const kanbanContainer = document.getElementById('kanban-board');
    const toggleBtn = document.getElementById('btn-toggle-agenda');

    if (isKanbanView) {
        listContainer.classList.add('d-none');
        kanbanContainer.classList.remove('d-none');
        toggleBtn.innerHTML = '<i class="fas fa-list"></i>';
        renderKanbanBoard();
    } else {
        listContainer.classList.remove('d-none');
        kanbanContainer.classList.add('d-none');
        toggleBtn.innerHTML = '<i class="fas fa-columns"></i>';
        renderAgendaList();
    }
}

function renderAgendaList() {
    const list = document.getElementById('agenda-list');
    if(!list) return;
    if (globalData.appointments.length === 0) { list.innerHTML = '<p class="text-center p-3 text-muted border bg-white rounded">لا توجد مهام ومواعيد</p>'; return; }
    
    const isAdmin = (currentUser.role === 'admin' || currentUser.role === 'مدير');
    list.innerHTML = globalData.appointments.map(a => {
        const apptDate = new Date(a.appt_date);
        const isPast = apptDate < new Date();
        const isScheduled = a.status === 'مجدول' || !a.status;

        let actionButtons = '';
        if (isPast && isScheduled) {
            actionButtons = `
                <div class="d-flex gap-2 mt-3 border-top pt-2">
                    <button class="btn btn-sm btn-success flex-grow-1 fw-bold" onclick="openApptOutcomeModal('${a.id}')"><i class="fas fa-check-circle"></i> تم الإنجاز</button>
                    <button class="btn btn-sm btn-warning flex-grow-1 fw-bold text-dark" onclick="openApptPostponeModal('${a.id}')"><i class="fas fa-clock"></i> تأجيل</button>
                    <button class="btn btn-sm btn-danger flex-grow-1 fw-bold" onclick="cancelAppointment('${a.id}')"><i class="fas fa-times-circle"></i> إلغاء</button>
                </div>
            `;
        }

        let statusBadge = '';
        if (a.status === 'تم') statusBadge = '<span class="badge bg-success ms-2">منجز</span>';
        else if (a.status === 'مؤجل') statusBadge = '<span class="badge bg-warning text-dark ms-2">مؤجل</span>';
        else if (a.status === 'ملغي') statusBadge = '<span class="badge bg-danger ms-2">ملغي</span>';
        else if (isPast) statusBadge = '<span class="badge bg-secondary ms-2 heartbeat-animation">بانتظار إجراء</span>';
        else statusBadge = '<span class="badge bg-info ms-2">قادم</span>';

        const dateStr = apptDate.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = apptDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

        return `
        <div class="card-custom p-3 mb-3 shadow-sm border-start border-4 ${a.status==='تم'?'border-success': a.status==='ملغي'?'border-danger': a.status==='مؤجل'?'border-warning':'border-primary'}">
            <div class="d-flex justify-content-between align-items-start mb-2">
                <h6 class="fw-bold text-navy mb-0" style="width:75%">${a.title} ${statusBadge}</h6>
                <div>
                    <button class="btn btn-sm text-info p-0 me-2" onclick="shareAppointment('${a.id}')" title="إرسال الموعد"><i class="fas fa-share-alt"></i></button>
                    ${isAdmin || a.created_by === currentUser.id ? `<button class="btn btn-sm text-danger p-0" onclick="deleteRecord('appointment', '${a.id}')"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            </div>
            <div class="text-muted small mb-1"><i class="fas fa-calendar-day me-1 text-primary"></i> ${dateStr}</div>
            <div class="text-muted small mb-2"><i class="fas fa-clock me-1 text-warning"></i> الساعة: ${timeStr}</div>
            <div class="d-flex justify-content-between align-items-center">
                <span class="badge bg-soft-primary text-primary">${a.type || 'مهمة'}</span>
                <small class="text-muted"><i class="fas fa-user-check me-1"></i> إسناد: ${getAssignedNames(a.assigned_to)}</small>
            </div>
            ${a.notes ? `<div class="mt-2 p-2 bg-light rounded small border-start border-success border-3"><b>مخرجات وتفاصيل:</b> <br>${a.notes.replace(/\n/g, '<br>')}</div>` : ''}
            ${actionButtons}
        </div>
    `}).join('');
}

function renderKanbanBoard() {
    const kanbanContainer = document.getElementById('kanban-board');
    if (!kanbanContainer) return;

    const statuses = [
        { id: 'todo', label: 'مطلوبة / قادمة', class: 'border-primary', bg: 'bg-soft-primary', condition: a => (!a.status || a.status === 'مجدول' || a.status === 'مؤجل') },
        { id: 'done', label: 'تم الإنجاز', class: 'border-success', bg: 'bg-soft-success', condition: a => a.status === 'تم' },
        { id: 'cancelled', label: 'ملغاة', class: 'border-danger', bg: 'bg-soft-danger', condition: a => a.status === 'ملغي' }
    ];

    let html = '';
    statuses.forEach(col => {
        const colAppts = globalData.appointments.filter(col.condition);
        
        let cardsHtml = colAppts.map(a => {
            const dateStr = new Date(a.appt_date).toLocaleDateString('ar-EG', {month: 'short', day: 'numeric'});
            return `
            <div class="card-custom p-2 mb-2 shadow-sm border-start border-3 ${col.class} cursor-pointer bg-white" onclick="openApptOutcomeModal('${a.id}')" title="اضغط لتغيير الحالة">
                <small class="fw-bold text-navy d-block text-truncate">${a.title}</small>
                <div class="d-flex justify-content-between align-items-center mt-1">
                    <span class="badge bg-light text-dark" style="font-size: 0.6rem;">${dateStr}</span>
                    <small class="text-muted" style="font-size: 0.65rem;">${getAssignedNames(a.assigned_to).split('،')[0]}</small>
                </div>
            </div>`;
        }).join('');

        if(colAppts.length === 0) cardsHtml = `<div class="text-center text-muted small p-3 opacity-50 border rounded bg-light">لا يوجد مهام</div>`;

        html += `
        <div class="col-10 col-md-4" style="min-width: 280px;">
            <div class="kanban-col shadow-sm border border-2 border-white ${col.bg}">
                <div class="kanban-header text-navy"><i class="fas fa-circle me-1" style="font-size:8px;"></i> ${col.label} <span class="badge bg-white text-dark ms-1">${colAppts.length}</span></div>
                <div class="kanban-items-container">
                    ${cardsHtml}
                </div>
            </div>
        </div>`;
    });

    kanbanContainer.innerHTML = html;
}

function getAssignedNames(assigned_to) {
    if (!assigned_to) return 'عام للمكتب';
    let ids = Array.isArray(assigned_to) ? assigned_to : [assigned_to];
    let names = ids.map(id => {
        let staff = globalData.staff.find(s => s.id === id);
        return staff ? staff.full_name : '';
    }).filter(n => n);
    return names.length > 0 ? names.join('، ') : 'عام للمكتب';
}

function openApptOutcomeModal(id) {
    document.getElementById('outcome_appt_id').value = id;
    document.getElementById('outcome_text').value = '';
    openModal('apptOutcomeModal');
}

async function saveApptOutcome(event) {
    event.preventDefault();
    const id = document.getElementById('outcome_appt_id').value;
    const outcome = document.getElementById('outcome_text').value;
    if(await API.updateAppointment(id, { status: 'تم', notes: outcome })) {
        closeModal('apptOutcomeModal');
        showAlert('تم تسجيل النتيجة بنجاح في السجل', 'success');
        await loadAllData();
    }
}

function openApptPostponeModal(id) {
    document.getElementById('postpone_appt_id').value = id;
    document.getElementById('postpone_date').value = '';
    openModal('apptPostponeModal');
}

async function saveApptPostpone(event) {
    event.preventDefault();
    const id = document.getElementById('postpone_appt_id').value;
    const newDateStr = document.getElementById('postpone_date').value;
    
    const isoDate = newDateStr ? new Date(newDateStr).toISOString() : null;

    const appt = globalData.appointments.find(a => a.id === id);
    let newTitle = appt.title;
    if(!newTitle.includes('(مؤجل)')) newTitle += ' (مؤجل)';
    
    if(await API.updateAppointment(id, { status: 'مجدول', appt_date: isoDate, title: newTitle })) {
        closeModal('apptPostponeModal');
        showAlert('تم تأجيل الموعد وإعادة جدولته بنجاح', 'success');
        await loadAllData();
    }
}

async function cancelAppointment(id) {
    if(!confirm('هل أنت متأكد من إلغاء هذا الموعد؟')) return;
    if(await API.updateAppointment(id, { status: 'ملغي' })) {
        showAlert('تم إلغاء الموعد', 'info');
        await loadAllData();
    }
}

// ------------------ الميزات الجديدة الذكية ------------------

// 1. نظام قراءة الهوية الذكي (OCR Scanner)
async function processIdImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    const btn = event.target.previousElementSibling;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري القراءة...';
    btn.disabled = true;

    try {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const base64Image = e.target.result;
            const res = await fetch(`${CONFIG.API_URL}/api/ai/ocr`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem(CONFIG.TOKEN_KEY)}`
                },
                body: JSON.stringify({ image_base64: base64Image })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            if (data.full_name) document.getElementById('client_full_name').value = data.full_name;
            if (data.national_id) document.getElementById('client_national_id').value = data.national_id;

            showAlert('تم استخراج بيانات الموكل من الهوية بنجاح!', 'success');
        };
        reader.readAsDataURL(file);
    } catch (err) {
        showAlert(err.message || 'فشل في قراءة الهوية، يرجى التصوير بوضوح أكثر.', 'danger');
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
        event.target.value = ''; 
    }
}

// 2. الإملاء الصوتي (Voice Dictation)
function startDictation(elementId) {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showAlert('عذراً، متصفحك الحالي لا يدعم الإملاء الصوتي. يرجى استخدام جوجل كروم أو سفاري المحدث.', 'warning');
        return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ar-JO'; 
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    const textArea = document.getElementById(elementId);
    const originalPlaceholder = textArea.placeholder;
    textArea.placeholder = "الميكروفون يعمل.. تحدث الآن ليتم تحويل كلامك لنص...";
    
    showAlert('جاري الاستماع... يمكنك التحدث الآن', 'info');

    recognition.start();

    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        textArea.value += (textArea.value ? ' ' : '') + transcript;
    };

    recognition.onerror = function(event) {
        showAlert('حدث خطأ أثناء الاستماع أو تم إلغاء الصلاحية.', 'danger');
        textArea.placeholder = originalPlaceholder;
    };

    recognition.onend = function() {
        textArea.placeholder = originalPlaceholder;
        showAlert('تم إيقاف التسجيل وإدراج النص.', 'success');
    };
}

// -----------------------------------------------------------

function renderStaffList() {
    const list = document.getElementById('staff-list');
    if(!list) return;
    if (globalData.staff.length === 0) { list.innerHTML = '<p class="text-center p-3 text-muted border bg-white rounded">لا يوجد موظفين</p>'; return; }
    const isAdmin = (currentUser.role === 'admin' || currentUser.role === 'مدير');
    list.innerHTML = globalData.staff.map(s => {
        const isMainAdmin = s.id === currentUser.id;
        const statusBadge = s.is_active === false ? '<span class="badge bg-danger">معطل</span>' : '<span class="badge bg-success">فعال</span>';
        const actionBtn = isAdmin && !isMainAdmin ? `
            <button class="btn btn-sm btn-outline-warning text-dark p-1 me-1" onclick="openEditStaffModal('${s.id}')"><i class="fas fa-pen"></i></button>
            <button class="btn btn-sm ${s.is_active === false ? 'btn-success' : 'btn-dark'} p-1" onclick="toggleStaffStatus('${s.id}', ${s.is_active})"><i class="fas ${s.is_active === false ? 'fa-user-check' : 'fa-user-lock'}"></i></button>
        ` : '';
        return `
        <div class="card-custom p-3 mb-2 shadow-sm d-flex justify-content-between align-items-center ${s.is_active === false ? 'opacity-50' : ''}">
            <div><b class="text-navy">${s.full_name}</b> ${statusBadge}<br><small class="text-muted">${getRoleNameInArabic(s.role)} - @${s.username}</small></div>
            <div>${actionBtn}</div>
        </div>
    `}).join('');
}

function populateSelects() {
    const clientSelect = document.getElementById('case_client_id');
    if(clientSelect) clientSelect.innerHTML = '<option value="">اختر الموكل...</option>' + globalData.clients.map(c => `<option value="${c.id}">${c.full_name}</option>`).join('');
    
    const activeStaff = globalData.staff.filter(s => s.is_active !== false);
    
    const lawyersContainer = document.getElementById('case_assigned_lawyers_container');
    if (lawyersContainer) {
        lawyersContainer.innerHTML = activeStaff.length ? activeStaff.map(s => `
            <div class="form-check border-bottom pb-1 mb-1">
                <input class="form-check-input case-lawyer-cb" type="checkbox" value="${s.id}" id="c_lawyer_${s.id}">
                <label class="form-check-label small fw-bold" for="c_lawyer_${s.id}">${s.full_name}</label>
            </div>
        `).join('') : '<small class="text-muted">لا يوجد موظفين</small>';
    }

    const apptsContainer = document.getElementById('appt_assigned_to_container');
    if (apptsContainer) {
        apptsContainer.innerHTML = activeStaff.length ? activeStaff.map(s => `
            <div class="form-check border-bottom pb-1 mb-1">
                <input class="form-check-input appt-lawyer-cb" type="checkbox" value="${s.id}" id="a_lawyer_${s.id}">
                <label class="form-check-label small fw-bold" for="a_lawyer_${s.id}">${s.full_name}</label>
            </div>
        `).join('') : '<small class="text-muted">لا يوجد موظفين</small>';
    }
}

function filterCases() { const val = document.getElementById('search-cases').value.toLowerCase(); Array.from(document.getElementById('cases-list').children).forEach(card => card.style.display = card.innerText.toLowerCase().includes(val) ? '' : 'none'); }
function filterClients() { const val = document.getElementById('search-clients').value.toLowerCase(); Array.from(document.getElementById('clients-list').children).forEach(card => card.style.display = card.innerText.toLowerCase().includes(val) ? '' : 'none'); }

async function handleSmartSearch(query) {
    const drop = document.getElementById('search-results-dropdown');
    if(!query || query.length < 2) { drop.classList.add('d-none'); return; }
    const res = await API.smartSearch(query);
    if(!res) return;
    let html = '';
    if(res.cases && res.cases.length) html += `<h6 class="dropdown-header bg-light fw-bold">القضايا</h6>` + res.cases.map(c => `<button class="dropdown-item py-2 border-bottom" onclick="viewCaseDetails('${c.id}')"><i class="fas fa-gavel text-warning"></i> ${c.case_internal_id}</button>`).join('');
    if(res.clients && res.clients.length) html += `<h6 class="dropdown-header bg-light fw-bold">الموكلين</h6>` + res.clients.map(c => `<button class="dropdown-item py-2 border-bottom" onclick="viewClientProfile('${c.id}')"><i class="fas fa-user text-info"></i> ${c.full_name}</button>`).join('');
    drop.innerHTML = html || '<div class="p-3 text-center text-muted small">لا توجد نتائج مطابقة</div>';
    drop.classList.remove('d-none');
}

document.addEventListener('click', (e) => { if(!e.target.closest('.position-relative')) document.getElementById('search-results-dropdown')?.classList.add('d-none'); });

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('d-none'));
    const target = document.getElementById(viewId + '-view');
    if(target) target.classList.remove('d-none');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.add('text-muted'));
    const activeNav = document.getElementById(`nav-icon-${viewId}`);
    if(activeNav) activeNav.parentElement.classList.remove('text-muted');
}

async function runConflictCheck() {
    const query = document.getElementById('conflict_search_input').value;
    if(!query || query.length < 2) { showAlert('أدخل اسم الخصم للبحث (حرفين على الأقل)', 'warning'); return; }
    const btn = document.querySelector('#conflictModal .btn-danger');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true;
    const resultsDiv = document.getElementById('conflict_results');
    resultsDiv.innerHTML = '<div class="text-center text-muted small py-3"><i class="fas fa-shield-alt fa-2x mb-2 text-warning"></i><br>جاري الفحص الأمني السريع في الأرشيف...</div>';
    
    try {
        const res = await API.checkConflict(query);
        if(res.error) throw new Error(res.error);
        let html = '';
        if(res.opponentConflicts.length > 0 || res.clientConflicts.length > 0) {
            html += `<div class="alert alert-danger small fw-bold mb-2"><i class="fas fa-exclamation-triangle"></i> تحذير: تم العثور على تعارض مصالح محتمل!</div>`;
            if(res.clientConflicts.length > 0) html += `<h6 class="fw-bold text-navy mt-3 border-bottom pb-1"><i class="fas fa-user-tie"></i> موكلين سابقين مطابقين:</h6>` + res.clientConflicts.map(c => `<div class="p-2 border rounded mb-1 bg-white text-danger small shadow-sm"><b>${c.full_name}</b><br>هاتف: ${c.phone}</div>`).join('');
            if(res.opponentConflicts.length > 0) html += `<h6 class="fw-bold text-navy mt-3 border-bottom pb-1"><i class="fas fa-balance-scale"></i> خصوم في قضايا أخرى:</h6>` + res.opponentConflicts.map(c => `<div class="p-2 border rounded mb-1 bg-white text-danger small shadow-sm"><b>${c.opponent_name}</b><br>رقم الملف: ${c.case_internal_id} - الحالة: ${c.status}</div>`).join('');
        } else {
            html = `<div class="alert alert-success small fw-bold text-center py-3"><i class="fas fa-check-circle fs-3 d-block mb-2"></i>السجل نظيف. لا يوجد تعارض مصالح.</div>`;
        }
        resultsDiv.innerHTML = html;
    } catch (err) { resultsDiv.innerHTML = `<div class="alert alert-danger small">خطأ: ${err.message}</div>`; } 
    finally { btn.innerHTML = '<i class="fas fa-search"></i> فحص'; btn.disabled = false; }
}

async function saveClient(event) {
    event.preventDefault();
    const data = {
        full_name: document.getElementById('client_full_name').value, phone: document.getElementById('client_phone').value,
        national_id: document.getElementById('client_national_id').value, email: document.getElementById('client_email').value,
        client_type: document.getElementById('client_type')?.value || 'فرد', created_by: currentUser.id
    };
    if(await API.addClient(data)) { closeModal('clientModal'); document.getElementById('clientForm').reset(); await loadAllData(); showAlert('تم إضافة الموكل بنجاح', 'success'); }
}

// تعديل حفظ القضية ليتضمن نظام المهام التلقائية (Workflow)
async function saveCase(event) {
    event.preventDefault();
    const isLawyer = (currentUser.role === 'lawyer' || currentUser.role === 'محامي');
    let assignedLawyers = [];
    if (isLawyer) assignedLawyers = [currentUser.id];
    else document.querySelectorAll('.case-lawyer-cb:checked').forEach(cb => assignedLawyers.push(cb.value));
    
    const lawsuitTextElement = document.getElementById('case_lawsuit_text');
    const lawsuitText = lawsuitTextElement ? lawsuitTextElement.value : null;

    const autoTasksCheckbox = document.getElementById('case_auto_tasks');
    const generateTasks = autoTasksCheckbox ? autoTasksCheckbox.checked : false;

    const data = {
        client_id: document.getElementById('case_client_id')?.value || null, 
        access_pin: document.getElementById('case_access_pin')?.value || '',
        case_internal_id: document.getElementById('case_internal_id')?.value || '', 
        case_type: document.getElementById('case_type')?.value || '',
        opponent_name: document.getElementById('case_opponent_name')?.value || null, 
        current_court: document.getElementById('case_current_court')?.value || null,
        court_case_number: document.getElementById('case_court_case_number')?.value || null,
        case_year: document.getElementById('case_case_year')?.value ? Number(document.getElementById('case_case_year').value) : null,
        litigation_degree: document.getElementById('case_litigation_degree')?.value || null,
        current_judge: document.getElementById('case_current_judge')?.value || null, 
        claim_amount: document.getElementById('case_claim_amount')?.value ? Number(document.getElementById('case_claim_amount').value) : null,
        total_agreed_fees: document.getElementById('case_agreed_fees')?.value ? Number(document.getElementById('case_agreed_fees').value) : 0,
        assigned_lawyer_id: assignedLawyers.length > 0 ? assignedLawyers : null, 
        created_by: currentUser.id, 
        status: 'نشطة',
        lawsuit_text: lawsuitText, 
        ai_entities: {} 
    };
    
    const btn = document.querySelector('#caseModal button[type="submit"]');
    const originalBtnText = btn ? btn.innerHTML : '';
    if(btn && lawsuitText && lawsuitText.trim().length > 10) {
        btn.innerHTML = '<i class="fas fa-brain fa-spin me-1"></i> جاري التحليل...';
        btn.disabled = true;
    }

    if(await API.addCase(data)) { 
        closeModal('caseModal'); 
        document.getElementById('caseForm').reset(); 

        // توليد المهام التلقائية إذا كان الخيار مفعلاً
        if (generateTasks) {
            const caseIdLabel = data.case_internal_id || 'ملف جديد';
            const tasks = [
                { title: `دراسة وتجهيز اللائحة - ${caseIdLabel}`, type: 'مهمة مكتبية (صياغة)' },
                { title: `تسجيل الدعوى ودفع الرسوم - ${caseIdLabel}`, type: 'مراجعة دائرة' },
                { title: `متابعة إجراءات التبليغ للخصم - ${caseIdLabel}`, type: 'مراجعة دائرة' }
            ];

            for (let i = 0; i < tasks.length; i++) {
                const taskDate = new Date();
                taskDate.setDate(taskDate.getDate() + (i + 1) * 2); // توزيع المهام على الأيام القادمة
                
                await API.addAppointment({
                    title: tasks[i].title,
                    appt_date: taskDate.toISOString(),
                    type: tasks[i].type,
                    assigned_to: assignedLawyers.length > 0 ? assignedLawyers : null,
                    created_by: currentUser.id,
                    status: 'مجدول'
                });
            }
            showAlert('تم إنشاء القضية وتوليد المهام التلقائية (Workflow) بنجاح!', 'success');
        } else {
            showAlert('تم إنشاء القضية بنجاح', 'success');
        }
        
        await loadAllData(); 
    }
    if(btn) { btn.innerHTML = originalBtnText; btn.disabled = false; }
}

async function saveAppointment(event) {
    event.preventDefault();
    const isLawyer = (currentUser.role === 'lawyer' || currentUser.role === 'محامي');
    let assignedStaff = [];
    if (isLawyer) assignedStaff = [currentUser.id];
    else document.querySelectorAll('.appt-lawyer-cb:checked').forEach(cb => assignedStaff.push(cb.value));

    const apptDateStr = document.getElementById('appt_date')?.value;
    const isoDate = apptDateStr ? new Date(apptDateStr).toISOString() : null;

    const data = {
        title: document.getElementById('appt_title')?.value, 
        appt_date: isoDate,
        type: document.getElementById('appt_type')?.value, 
        assigned_to: assignedStaff.length > 0 ? assignedStaff : null, 
        created_by: currentUser.id, 
        status: 'مجدول'
    };
    if(await API.addAppointment(data)) { closeModal('apptModal'); document.getElementById('apptForm').reset(); await loadAllData(); showAlert('تم جدولة الموعد', 'success'); }
}

async function saveStaff(event) {
    event.preventDefault();
    const data = { full_name: document.getElementById('staff_full_name').value, username: document.getElementById('staff_username').value, password: document.getElementById('staff_password').value, role: document.getElementById('staff_role').value };
    const res = await API.addStaff(data);
    if(res && !res.error) { closeModal('staffModal'); document.getElementById('staffForm').reset(); await loadAllData(); if(res._warning) showAlert(res._warning, 'warning'); else showAlert('تم الإضافة', 'success'); } else if (res && res.error) { showAlert(res.error, 'danger'); }
}

function openEditStaffModal(id) {
    const s = globalData.staff.find(x => x.id === id);
    if(!s) return;
    document.getElementById('edit_staff_id').value = s.id;
    document.getElementById('edit_staff_full_name').value = s.full_name;
    document.getElementById('edit_staff_username').value = s.username;
    document.getElementById('edit_staff_password').value = '';
    document.getElementById('edit_staff_role').value = s.role;
    openModal('editStaffModal');
}

async function updateStaffDetails(event) {
    event.preventDefault();
    const id = document.getElementById('edit_staff_id').value;
    const data = { full_name: document.getElementById('edit_staff_full_name').value, username: document.getElementById('edit_staff_username').value, role: document.getElementById('edit_staff_role').value };
    const pw = document.getElementById('edit_staff_password').value;
    if(pw && pw.length >= 3) data.password = pw;
    
    const res = await API.updateStaff(id, data);
    if(res && !res.error) { closeModal('editStaffModal'); showAlert('تم تعديل البيانات', 'success'); await loadAllData(); } else { showAlert('خطأ أثناء التعديل', 'danger'); }
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
    const res = await API.updateStaff(id, { is_active: !currentStatus, can_login: !currentStatus });
    if(res && !res.error) { showAlert('تم التحديث', 'success'); await loadAllData(); } else if (res && res.error) { showAlert(res.error, 'danger'); }
}

function shareAppointment(apptId) {
    const appt = globalData.appointments.find(a => a.id === apptId);
    if(!appt) return;
    let names = [];
    if (Array.isArray(appt.assigned_to)) { names = appt.assigned_to.map(id => { const s = globalData.staff.find(st => st.id === id); return s ? s.full_name : ''; }).filter(n => n); } 
    else if (appt.assigned_to) { const s = globalData.staff.find(st => st.id === appt.assigned_to); if(s) names.push(s.full_name); }
    
    const staffText = names.length > 0 ? `مع المحامي/ة: ${names.join(' و ')}` : 'مع فريق المكتب';
    const txt = `أهلاً بك،\nنود تذكيركم بموعدكم المجدول معنا:\n\n📌 بخصوص: ${appt.title}\n📅 التاريخ والوقت: ${new Date(appt.appt_date).toLocaleString('ar-EG')}\n👥 ${staffText}\n\nنرجو الالتزام بالموعد، ودمتم بخير.`;
    if (navigator.share) navigator.share({ title: 'موعد جديد', text: txt }).catch(e => console.log(e));
    else window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank');
}

function copyClientDeepLink(publicToken, pin) {
    if(!publicToken || publicToken === "undefined" || publicToken === "null") { showAlert('هذه القضية لا تملك رمزاً عاماً بعد.', 'danger'); return; }
    const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
    const deepLink = `${baseUrl}client.html?token=${publicToken}`;
    const safePin = (pin && pin !== "undefined") ? pin : "غير محدد";
    const shareText = `مرحباً، يمكنك متابعة قضيتك عبر الرابط:\n${deepLink}\n\nرمز الدخول PIN الخاص بك هو: ${safePin}`;
    if (navigator.share) navigator.share({ title: 'رابط القضية', text: shareText }).catch(err => console.log('فشلت المشاركة', err));
    else window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
}

function viewCaseDetails(id) { localStorage.setItem('current_case_id', id); window.location.href = 'case-details.html'; }
function viewClientProfile(id) { if(id) { localStorage.setItem('current_client_id', id); window.location.href = 'client-details.html'; } }
function logout() { localStorage.clear(); window.location.href = 'login.html'; }
function openModal(id) { const el = document.getElementById(id); if(el) { const m = new bootstrap.Modal(el); m.show(); } }
function closeModal(id) { const el = document.getElementById(id); if(el) { const m = bootstrap.Modal.getInstance(el); if(m) m.hide(); document.querySelectorAll('.modal-backdrop').forEach(b => b.remove()); document.body.classList.remove('modal-open'); document.body.style.overflow = ''; document.body.style.paddingRight = ''; } }
function showAlert(message, type = 'info') { const box = document.getElementById('alertBox'); if(!box) return; const alertId = 'alert-' + Date.now(); let typeClass = type === 'success' ? 'alert-success-custom' : 'alert-danger-custom'; if(type === 'warning') typeClass = 'bg-warning text-dark border-warning'; box.insertAdjacentHTML('beforeend', `<div id="${alertId}" class="alert-custom ${typeClass}"><span>${message}</span></div>`); setTimeout(() => { const el = document.getElementById(alertId); if(el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); } }, 4000); }