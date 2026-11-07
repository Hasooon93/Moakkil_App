/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/app-core.js
 * الوصف: المحرك الأساسي، المزامنة، الإشعارات، العقود الذكية، الـ QR Scanner،
 * وإدارة السجل الأمني ومؤشر التواجد (Heartbeat) وتطبيقات الويب التقدمية (PWA).
 * التحديثات المعمارية (V5.2 Enterprise Edition):
 * 1. ربط بطاقة العمل (vCard) برابط صفحة التحقق الموحدة (verify.html?type=cv) لتفادي طفحان الـ QR.
 * 2. تطبيق مانع الطوفان الجذري (Boot Muter & State Manager) للإشعارات لمنع التكرار والإزعاج المطلق.
 * 3. تحسين بطاقة (Online Staff) لتشمل الصور الرمزية (Avatars) والأسماء بشكل متقدم مع حماية الصور المكسورة.
 * 4. ربط مباشر مع بوصلة اليوم (Urgent Briefing) والبحث الدلالي في التشريعات (legal_brain).
 * 5. عرض الوصف البشري العربي (_human_log) في سجل الرقابة الأمنية وآلة الزمن (Time Machine).
 * ============================================================================
 */

window.AppCore = {
    globalData: { cases: [], clients: [], staff: [], appointments: [], activityLogs: [], notifications: [] },
    currentUser: (typeof AUTH !== 'undefined' && typeof AUTH.checkSession === 'function')
        ? AUTH.checkSession()
        : JSON.parse(localStorage.getItem(CONFIG?.USER_KEY || 'moakkil_user') || 'null'),
    isKanbanView: false,
    currentCaseFilter: '',
    currentShareLink: '',

    // 🛡️ مانع طوفان الإشعارات (Anti-Spam State Manager)
    displayedNotifications: new Set(),
    isInitialNotifLoad: true, // كابح الطوفان عند أول عملية جلب للبيانات

    escapeHTML: function(str) {
        if (str === null || str === undefined) return '';
        return str.toString().replace(/[&<>'"]/g, tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag] || tag));
    },

    showAlert: function(msg, type = 'info') {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: type === 'danger' ? 'error' : type,
                title: this.escapeHTML(msg),
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true
            });
        } else {
            alert(msg);
        }
    },

    showToast: function(msg, type = 'info') {
        this.showAlert(msg, type);
    },

    openModal: function(id) {
        const el = document.getElementById(id);
        if (el) {
            const modalIns = bootstrap.Modal.getOrCreateInstance(el);
            modalIns.show();
            if (id === 'caseModal' && typeof window.generateStrongPIN === 'function') {
                window.generateStrongPIN();
            }
            if (id === 'apptModal' && typeof window.populateApptRelations === 'function') {
                window.populateApptRelations();
            }
        }
    },

    closeModal: function(id) {
        const el = document.getElementById(id);
        if (el) {
            const m = bootstrap.Modal.getInstance(el);
            if (m) m.hide();
            document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
            document.body.classList.remove('modal-open');
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
        }
    }
};

window.escapeHTML = (str) => window.AppCore.escapeHTML(str);
window.showAlert = (msg, type) => window.AppCore.showAlert(msg, type);
window.showToast = (msg, type) => window.AppCore.showToast(msg, type);
window.openModal = (id) => window.AppCore.openModal(id);
window.closeModal = (id) => window.AppCore.closeModal(id);

window.switchView = (viewId) => {
    if (!viewId) viewId = 'dashboard';
    const cleanView = String(viewId).replace(/^#/, '');
    if (['ai', 'ai-chat', 'library', 'calculators'].includes(cleanView)) {
        const targetPage = cleanView === 'ai' ? 'ai-chat.html' : `${cleanView}.html`;
        window.location.href = targetPage;
        return;
    }
    localStorage.setItem('last_active_view', cleanView);
    document.querySelectorAll('.view').forEach(v => v.classList.add('d-none', 'fade-in'));
    const activeView = document.getElementById(cleanView + '-view');
    if (activeView) {
        activeView.classList.remove('d-none');
        activeView.style.animation = 'none';
        activeView.offsetHeight;
        activeView.style.animation = null;
    }
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`nav-icon-${cleanView}`)?.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ============================================================================
// [1] محرك المزامنة وتفريغ البيانات (Sync & Populate)
// ============================================================================

window.loadAllData = async () => {
    try {
        const isAdminUser = window.AppCore.currentUser && ['admin', 'super_admin'].includes(window.AppCore.currentUser.role);
        const [clients, cases, staff, appts, notifs, logsRes] = await Promise.all([
            API.getClients().catch(() => []),
            API.getCases().catch(() => []),
            API.getStaff().catch(() => []),
            API.getAppointments().catch(() => []),
            API.getNotifications().catch(() => []),
            isAdminUser ? API.getHistory().catch(() => []) : Promise.resolve([])
        ]);

        window.AppCore.globalData.staff = Array.isArray(staff) ? staff : [];
        window.AppCore.globalData.clients = Array.isArray(clients) ? clients : [];
        window.AppCore.globalData.cases = Array.isArray(cases) ? cases : [];
        window.AppCore.globalData.appointments = Array.isArray(appts) ? appts : [];
        window.AppCore.globalData.notifications = Array.isArray(notifs) ? notifs : [];

        if (isAdminUser) {
            if (Array.isArray(logsRes)) {
                window.AppCore.globalData.activityLogs = logsRes;
            }
            window.renderOnlineStaff();
        }

        window.populateSelects();
        if (typeof window.populateApptRelations === 'function') window.populateApptRelations();
        window.renderDashboardStats();
        if (typeof window.updateUrgentBriefing === 'function') window.updateUrgentBriefing();
        window.renderNotifications();

        if (typeof window.renderCasesList === 'function') window.renderCasesList();
        if (typeof window.renderClientsList === 'function') window.renderClientsList();
        if (typeof window.renderAgendaList === 'function') {
            (window.AppAgenda && window.AppAgenda.isKanban) ? window.renderKanbanBoard() : window.renderAgendaList();
        }
        window.renderAuditTrail();

    } catch (e) {
        console.error("Data loading error:", e);
    }
};

window.loadDashboardData = window.loadAllData;
window.AppCore.loadAllData = window.loadAllData;

window.manualSync = async () => {
    const btn = document.getElementById('btn_sync_dashboard');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i>';
    }
    if (typeof processOfflineQueue === 'function' && navigator.onLine) {
        await processOfflineQueue();
    }
    await window.loadAllData();
    window.showToast('تمت المزامنة وتحديث البيانات السحابية', 'success');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
    }
};

window.populateSelects = () => {
    const staffList = window.AppCore.globalData.staff || [];
    const clientList = window.AppCore.globalData.clients || [];
    const caseList = window.AppCore.globalData.cases || [];

    const staffOpts = staffList.map(s => `<option value="${s.id}">${window.escapeHTML(s.full_name)}</option>`).join('');
    const clientOpts = '<option value="">اختر الموكل...</option>' + clientList.map(c => `<option value="${c.id}">${window.escapeHTML(c.full_name)}</option>`).join('');
    const caseOpts = '<option value="">-- اختر القضية المرتبطة --</option>' + caseList.map(cs => `<option value="${cs.id}" data-client="${cs.client_id || ''}">${window.escapeHTML(cs.case_internal_id || cs.court_case_number || 'ملف')} - ${window.escapeHTML(cs.opponent_name || cs.case_type || '')}</option>`).join('');

    ['case_assigned_lawyers', 'appt_assigned_to'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = staffOpts;
    });
    ['case_client_id', 'appt_client_id', 'contract_client_id'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = clientOpts;
    });
    const apptCaseEl = document.getElementById('appt_case_id');
    if (apptCaseEl) apptCaseEl.innerHTML = caseOpts;

    const parentCaseEl = document.getElementById('case_parent_id');
    if (parentCaseEl) {
        parentCaseEl.innerHTML = '<option value="">لا يوجد (هذه قضية رئيسية)</option>' +
            caseList.map(cs => `<option value="${cs.id}">${window.escapeHTML(cs.case_internal_id)}</option>`).join('');
    }
};

window.renderDashboardStats = () => {
    const { cases, clients, appointments, staff } = window.AppCore.globalData;
    if (document.getElementById('stat-cases')) document.getElementById('stat-cases').innerText = cases.filter(c => c.status !== 'مكتملة').length;
    if (document.getElementById('stat-clients')) document.getElementById('stat-clients').innerText = clients.length;
    if (document.getElementById('stat-appointments')) document.getElementById('stat-appointments').innerText = appointments.filter(a => ['مجدول', 'مؤجل'].includes(a.status)).length;
    if (document.getElementById('stat-staff')) document.getElementById('stat-staff').innerText = staff ? staff.length : 0;

    let agreed = 0, paid = 0;
    cases.forEach(c => {
        agreed += Number(c.total_agreed_fees || c.agreed_fees) || 0;
        paid += Number(c.total_paid) || 0;
    });
    if (document.getElementById('fin-agreed')) document.getElementById('fin-agreed').innerText = agreed.toLocaleString();
    if (document.getElementById('fin-paid')) document.getElementById('fin-paid').innerText = paid.toLocaleString();
    if (document.getElementById('fin-rem')) document.getElementById('fin-rem').innerText = Math.max(0, agreed - paid).toLocaleString();

    if (typeof window.updateUrgentBriefing === 'function') window.updateUrgentBriefing();
};

// ============================================================================
// [2] محرك البحث الذكي ومعالجة الـ QR Code (Smart Search & QR Parser)
// ============================================================================

window.handleSmartSearch = async (query) => {
    const drop = document.getElementById('search-results-dropdown');
    if (!drop) return;
    const safeQuery = (query || '').trim();
    if (safeQuery.length < 2) {
        drop.classList.add('d-none');
        return;
    }

    // الاستجابة الفورية لروابط QR Code الممسوحة
    if (safeQuery.includes('case-details.html?id=') || safeQuery.includes('client-details.html?id=')) {
        window.showToast('تم التقاط رابط الملف، جاري التوجيه...', 'success');
        setTimeout(() => { window.location.href = safeQuery; }, 400);
        drop.classList.add('d-none');
        return;
    }

    try {
        const res = await API.smartSearch(safeQuery);
        let html = '';

        if (res.cases?.length) {
            html += '<h6 class="dropdown-header fw-bold px-3 pt-2" style="color: var(--gold-luxury);"><i class="fas fa-gavel me-1"></i> القضايا المطابقة</h6>';
            html += res.cases.map(c => `
                <button type="button" class="dropdown-item py-2 border-bottom fw-bold text-navy d-flex justify-content-between align-items-center" onclick="localStorage.setItem('current_case_id','${c.id}'); window.location.href='case-details.html?id=${encodeURIComponent(c.id)}'">
                    <span>${window.escapeHTML(c.case_internal_id)} - ${window.escapeHTML(c.opponent_name || '')}</span>
                    <span class="badge bg-light text-dark border font-monospace">${window.escapeHTML(c.status || 'نشطة')}</span>
                </button>
            `).join('');
        }

        if (res.clients?.length) {
            html += '<h6 class="dropdown-header text-success fw-bold px-3 pt-2"><i class="fas fa-users me-1"></i> الموكلين</h6>';
            html += res.clients.map(c => `
                <button type="button" class="dropdown-item py-2 border-bottom fw-bold text-navy d-flex justify-content-between align-items-center" onclick="localStorage.setItem('current_client_id','${c.id}'); window.location.href='client-details.html?id=${encodeURIComponent(c.id)}'">
                    <span>${window.escapeHTML(c.full_name)}</span>
                    <small class="text-muted font-monospace" dir="ltr">${window.escapeHTML(c.phone || '')}</small>
                </button>
            `).join('');
        }

        if (res.brain?.length) {
            html += '<h6 class="dropdown-header text-primary fw-bold px-3 pt-2"><i class="fas fa-brain me-1"></i> التشريعات والعقل القانوني (بحث بالمعنى)</h6>';
            html += res.brain.map(b => `
                <button type="button" class="dropdown-item py-2 border-bottom text-start" onclick="window.location.href='ai-chat.html?q=${encodeURIComponent(b.title || b.category || '')}'">
                    <div class="fw-bold text-navy small">${window.escapeHTML(b.category || 'تشريع')} - المادة (${window.escapeHTML(b.article_number || '--')})</div>
                    <small class="text-muted d-block text-truncate" style="max-width: 100%;">${window.escapeHTML((b.original_text || b.title || '').substring(0, 85))}...</small>
                </button>
            `).join('');
        }

        drop.innerHTML = html || '<div class="p-3 text-center text-muted fw-bold"><i class="fas fa-search-minus fa-2x mb-2 d-block opacity-50"></i>لا توجد ملفات أو تشريعات مطابقة</div>';
        drop.classList.remove('d-none');
    } catch (e) {
        console.error("Smart Search Error:", e);
    }
};

// إغلاق قائمة البحث عند النقر خارجها
document.addEventListener('click', function(event) {
    const searchWrapper = document.querySelector('.search-input-wrapper');
    const dropdown = document.getElementById('search-results-dropdown');
    if (searchWrapper && dropdown && !searchWrapper.contains(event.target)) {
        dropdown.classList.add('d-none');
    }
});

// ============================================================================
// [3] نظام فحص التعارض المهني (Conflict Check Engine)
// ============================================================================

window.runConflictCheck = async () => {
    const input = document.getElementById('conflict_search_input');
    const resContainer = document.getElementById('conflict_results');

    if (!input || !input.value.trim()) {
        return window.showAlert('يرجى كتابة اسم الخصم للبدء بالفحص', 'warning');
    }

    const query = input.value.trim();
    resContainer.innerHTML = '<div class="text-center p-4"><i class="fas fa-circle-notch fa-spin fa-3x text-warning mb-3"></i><p class="fw-bold text-navy">جاري إجراء مسح عميق في سجلات الموكلين والخصوم...</p></div>';

    try {
        const data = await API.checkConflict(query);
        if (data && data.error) throw new Error(data.error);

        const matchedClients = data.clients || data.clientConflicts || [];
        const matchedOpponents = data.opponents || data.opponentConflicts || [];
        const hasConflict = data.has_conflict || matchedClients.length > 0 || matchedOpponents.length > 0;

        let html = '';
        if (hasConflict) {
            html += `<div class="alert alert-danger fw-bold border-danger border-2 shadow-sm fs-5"><i class="fas fa-exclamation-triangle me-2"></i> تحذير مهني: تم رصد تعارض مصالح محتمل!</div>`;

            if (matchedClients.length > 0) {
                html += `<h6 class="fw-bold text-navy mt-4 border-bottom pb-2"><i class="fas fa-user-tie me-2 text-success"></i> موكلون مسجلون في المكتب بنفس الاسم:</h6>`;
                matchedClients.forEach(c => {
                    html += `<div class="p-3 border-start border-danger border-4 bg-white mb-2 shadow-sm rounded-3 d-flex justify-content-between align-items-center">
                        <span class="fw-bold"><i class="fas fa-user text-danger me-2"></i> ${window.escapeHTML(c.full_name)}</span>
                        <span class="badge bg-light text-dark border font-monospace">وطني: ${window.escapeHTML(c.national_id || '--')}</span>
                    </div>`;
                });
            }
            if (matchedOpponents.length > 0) {
                html += `<h6 class="fw-bold text-navy mt-4 border-bottom pb-2"><i class="fas fa-gavel me-2 text-warning"></i> خصوم في قضايا مسجلة بالمكتب:</h6>`;
                matchedOpponents.forEach(o => {
                    html += `<div class="p-3 border-start border-warning border-4 bg-white mb-2 shadow-sm rounded-3 d-flex justify-content-between align-items-center">
                        <span class="fw-bold"><i class="fas fa-user-slash text-warning me-2"></i> ${window.escapeHTML(o.opponent_name)}</span>
                        <button type="button" class="btn btn-sm btn-light border text-navy fw-bold font-monospace" onclick="localStorage.setItem('current_case_id','${o.id}'); window.location.href='case-details.html?id=${encodeURIComponent(o.id)}'">ملف: ${window.escapeHTML(o.case_internal_id)}</button>
                    </div>`;
                });
            }
        } else {
            html = `<div class="alert alert-success fw-bold border-success border-2 shadow-sm text-center p-4 rounded-4">
                <i class="fas fa-shield-alt fa-3x mb-3 d-block text-success"></i> النتيجة سليمة 100%! لا يوجد أي تعارض مصالح مسجل لهذا الاسم. يمكنك قبول القضية بأمان.
            </div>`;
        }
        resContainer.innerHTML = html;
    } catch (e) {
        resContainer.innerHTML = `<div class="alert alert-danger fw-bold border-danger"><i class="fas fa-wifi-slash me-2"></i> خطأ في الفحص: ${window.escapeHTML(e.message)}</div>`;
    }
};

// ============================================================================
// [4] المراقبة ونبض الموظفين (Heartbeat & Online Staff Display)
// ============================================================================

window.renderOnlineStaff = () => {
    const container = document.getElementById('online-staff-container');
    const widget = document.getElementById('online-staff-widget');
    if (!container || !widget) return;

    const staff = window.AppCore.globalData.staff || [];
    const now = new Date();

    // نعتبر الموظف "متصلاً" إذا كان نشطاً خلال آخر 15 دقيقة (900,000 مللي ثانية)
    const onlineStaff = staff.filter(s => {
        const lastActivity = s.last_status_change || s.last_login;
        if (!lastActivity) return false;
        const last = new Date(lastActivity);
        return (now - last) < 900000;
    });

    widget.style.display = 'block';
    if (onlineStaff.length > 0) {
        container.innerHTML = onlineStaff.map(s => {
            const name = s.full_name || 'موظف';
            const initial = window.escapeHTML(name.charAt(0));

            const avatarHtml = s.avatar_url
                ? `<img src="${window.escapeHTML(s.avatar_url)}" style="width:28px; height:28px; border-radius:50%; object-fit:cover; border: 2px solid var(--gold-luxury); flex-shrink: 0;" onerror="this.onerror=null; this.outerHTML='<div style=\\'width:28px; height:28px; border-radius:50%; background:var(--primary-dark); color:var(--gold-luxury); display:flex; align-items:center; justify-content:center; font-size:0.85rem; font-weight:900; flex-shrink:0;\\'>${initial}</div>';">`
                : `<div style="width:28px; height:28px; border-radius:50%; background:var(--primary-dark); color:var(--gold-luxury); display:flex; align-items:center; justify-content:center; font-size:0.85rem; font-weight:900; flex-shrink: 0;">${initial}</div>`;

            return `
            <div class="bg-white border shadow-sm px-3 py-2 rounded-pill d-flex align-items-center gap-2" style="display: inline-flex; margin: 3px;">
                <span class="online-dot"></span>
                ${avatarHtml}
                <span class="text-navy" style="font-size: 0.92rem; font-weight: 800; white-space: nowrap; margin-right: 2px;">${window.escapeHTML(name)}</span>
            </div>`;
        }).join('');
    } else {
        container.innerHTML = `<span class="text-muted small fw-bold"><i class="fas fa-moon me-1"></i> لا يوجد موظفون متصلون حالياً.</span>`;
    }
};

window.startHeartbeat = () => {
    setInterval(async () => {
        if (navigator.onLine && window.AppCore.currentUser) {
            try {
                const token = localStorage.getItem(CONFIG?.TOKEN_KEY || 'moakkil_token');
                const baseUrl = window.API_BASE_URL || CONFIG?.API_URL || '';
                await fetch(`${baseUrl}/api/auth/heartbeat`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const staffRes = await API.getStaff();
                window.AppCore.globalData.staff = Array.isArray(staffRes) ? staffRes : [];
                if (['admin', 'super_admin'].includes(window.AppCore.currentUser.role)) {
                    window.renderOnlineStaff();
                }
            } catch (e) {}
        }
    }, 180000);
};

// ============================================================================
// [5] نظام الإشعارات الكابح للطوفان (Anti-Spam Notifications)
// ============================================================================

window.renderNotifications = () => {
    const list = document.getElementById('notifications-list');
    const badge = document.getElementById('notification-badge');
    const notifs = window.AppCore.globalData.notifications || [];

    // 1. في أول تحميل للنظام، نعتبر الإشعارات الحالية مسجلة في الذاكرة لمنع القفز المفاجئ
    if (window.AppCore.isInitialNotifLoad) {
        notifs.forEach(n => window.AppCore.displayedNotifications.add(n.id));
        window.AppCore.isInitialNotifLoad = false;
    }

    // 2. فرز الإشعارات الجديدة فعلياً فقط التي لم تنبه المستخدم بعد
    const newUnreadNotifs = notifs.filter(n => !n.is_read && !window.AppCore.displayedNotifications.has(n.id));

    // 3. معالجة التنبيهات المزعجة (Anti-Spam Logic)
    if (newUnreadNotifs.length > 0) {
        if (newUnreadNotifs.length > 3) {
            window.showToast(`لديك ${newUnreadNotifs.length} إشعارات جديدة بانتظارك.`, 'info');
        } else {
            newUnreadNotifs.forEach(n => window.showToast(n.title, 'info'));
        }
        newUnreadNotifs.forEach(n => window.AppCore.displayedNotifications.add(n.id));
    }

    // 4. تحديث الشارة الحمراء (Badge) وقائمة الإشعارات المنسدلة
    const totalUnread = notifs.filter(n => !n.is_read).length;
    if (totalUnread > 0 && badge) {
        badge.innerText = totalUnread > 99 ? '+99' : totalUnread;
        badge.classList.remove('d-none');
    } else if (badge) {
        badge.classList.add('d-none');
    }

    if (notifs.length === 0) {
        if (list) list.innerHTML = '<li class="p-4 text-center text-muted fw-bold small">لا توجد إشعارات حالياً</li>';
        return;
    }

    if (list) {
        list.innerHTML = notifs.slice(0, 12).map(n => `
            <li><a class="dropdown-item py-3 border-bottom ${n.is_read ? 'text-muted' : 'fw-bold text-navy bg-light'}" href="${window.escapeHTML(n.action_url || '#')}">
                <small class="d-block mb-1" style="color: var(--gold-luxury);">${window.escapeHTML(n.title)}</small>
                <span style="font-size:0.85rem; white-space: normal;">${window.escapeHTML(n.message)}</span>
            </a></li>
        `).join('');
    }
};

window.markNotificationsRead = async () => {
    const badge = document.getElementById('notification-badge');
    if (badge) badge.classList.add('d-none');
    document.querySelectorAll('#notifications-list .text-navy').forEach(el => el.classList.remove('text-navy', 'fw-bold', 'bg-light'));

    try {
        const unread = window.AppCore.globalData.notifications?.filter(n => !n.is_read) || [];
        for (let n of unread) {
            n.is_read = true;
            await API.markNotificationAsRead(n.id);
        }
    } catch (e) {}
};

// ============================================================================
// [6] العقود والمذكرات الذكية (AI Smart Contracts)
// ============================================================================

window.generateSmartContract = async () => {
    const clientId = document.getElementById('contract_client_id')?.value;
    const draftTypeEl = document.getElementById('ai_draft_type');
    const draftTypeValue = draftTypeEl ? draftTypeEl.value : '';
    const extraContext = document.getElementById('ai_extra_context')?.value || "";
    const btn = document.getElementById('btn_generate_contract');

    if (!clientId) return window.showAlert('يرجى اختيار الموكل أولاً لربط البيانات', 'warning');
    if (!draftTypeValue) return window.showAlert('يرجى اختيار نوع العقد أو المسودة', 'warning');

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري الصياغة القانونية...';
    }

    try {
        let templateText = "";
        if (draftTypeValue === 'اتفاقية أتعاب محاماة') {
            templateText = "إنه في يوم {{date}} تم الاتفاق والتراضي بين كل من:\nالطرف الأول (المكتب القانوني): {{firm_name}}\nالطرف الثاني (الموكل): {{client_name}} - يحمل الرقم الوطني: {{national_id}} - الهاتف: {{client_phone}} - العنوان: {{client_address}}\n\nمقدمة:\nبما أن الطرف الثاني يرغب بتوكيل الطرف الأول لتمثيله والدفاع عن حقوقه القانونية، فقد تم الاتفاق على الأتعاب والشروط التالية:\n\n1. يلتزم الطرف الأول ببذل العناية القانونية اللازمة ومتابعة الإجراءات القضائية.\n2. يلتزم الطرف الثاني بدفع الأتعاب المتفق عليها وفقاً للإيصالات الرسمية المعتمدة.\n\nتوجيهات وشروط إضافية:\n{{extra}}\n\nتوقيع الطرف الأول: __________________\nتوقيع الطرف الثاني: __________________";
        } else if (draftTypeValue === 'إنذار عدلي') {
            templateText = "لدى دائرة كاتب عدل عمّان الموقر\n\nالمنذر: {{client_name}} - رقمه الوطني: {{national_id}} - عنوانه: {{client_address}}\nوكيله القانوني: {{firm_name}}\nالمنذر إليه: ________________________\n\nالموضوع: إنذار عدلي رسمي للمطالبة بحقوق مالية وقانونية.\n\nالوقائع والإنذار:\n1. يعلم المنذر إليه بصحة وسلامة المطالبة المترتبة بذمته لصالح المنذر.\n2. وحيث أن المنذر إليه ممتنع عن أداء الالتزامات المترتبة عليه رغم المطالبات المتكررة.\n3. تفاصيل المطالبة:\n{{extra}}\n\nلذا ننذركم بضرورة دفع المبالغ المترتبة بذمتكم خلال المدة القانونية، وبعكس ذلك سنضطر لاتخاذ كافة الإجراءات القضائية والتنفيذية وتضمينكم الرسوم والمصاريف وأتعاب المحاماة والفائدة القانونية.\n\nواقبلوا الاحترام،\nوكيل المنذر: {{firm_name}}";
        } else {
            templateText = "عقد / مسودة قانونية: {{draft_type}}\n\nالتاريخ: {{date}}\nالطرف المعني (الموكل): {{client_name}} - الرقم الوطني: {{national_id}}\nالعنوان: {{client_address}}\nبإشراف المكتب القانوني: {{firm_name}}\n\nالبنود والتفاصيل:\n{{extra}}\n\nتمت صياغة هذه المسودة عبر محرك العقود الذكي في نظام موكّل ERP.";
        }

        const data = await API.generateSmartContract({
            client_id: clientId,
            template_text: templateText,
            additional_vars: { draft_type: draftTypeValue, extra: extraContext || 'وفقاً لأحكام التشريعات الأردنية النافذة.' }
        });

        if (data && data.error) throw new Error(data.error);

        if (data && data.generated_text) {
            document.getElementById('contract_result_container')?.classList.remove('d-none');
            const resultBox = document.getElementById('contract_result');
            if (resultBox) resultBox.value = data.generated_text;
            window.showToast('تم صياغة وتوليد العقد بنجاح', 'success');
        }
    } catch (e) {
        window.showAlert('تعذر توليد العقد: ' + e.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-cogs me-2"></i> توليد العقد الآن';
        }
    }
};

window.copyToClipboard = (elementId) => {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.select();
    el.setSelectionRange(0, 99999);
    if (navigator.clipboard) {
        navigator.clipboard.writeText(el.value).then(() => window.showToast('تم نسخ النص للحافظة بنجاح', 'success'));
    } else {
        document.execCommand('copy');
        window.showToast('تم نسخ النص للحافظة بنجاح', 'success');
    }
};

// ============================================================================
// [7] آلة الزمن الأمني وترجمة سجل الرقابة (Audit Trail & Time Machine)
// ============================================================================

// قاموس الترجمة الشامل للحقول (لجعل الـ Audit Log مقروءاً للبشر)
const fieldDict = {
    'status': 'الحالة', 'case_internal_id': 'رقم الملف الداخلي', 'opponent_name': 'اسم الخصم',
    'opponent_lawyer': 'وكيل الخصم', 'total_agreed_fees': 'الأتعاب المتفق عليها', 'agreed_fees': 'الأتعاب المتفق عليها',
    'claim_amount': 'قيمة المطالبة', 'paid_amount': 'المبلغ المقبوض', 'remaining_amount': 'المبلغ المتبقي',
    'full_name': 'الاسم الكامل', 'phone': 'رقم الهاتف', 'national_id': 'الرقم الوطني',
    'appt_date': 'تاريخ الموعد', 'notes': 'الملاحظات', 'title': 'العنوان', 'type': 'النوع',
    'current_court': 'المحكمة المختصة', 'court_room': 'الدائرة / القاعة', 'court_case_number': 'رقم الدعوى بالمحكمة',
    'case_year': 'سنة الدعوى', 'litigation_degree': 'درجة التقاضي', 'current_judge': 'هيئة القضاة',
    'court_clerk': 'قلم المحكمة / الكاتب', 'execution_file_number': 'رقم الملف التنفيذي',
    'statute_of_limitations_date': 'تاريخ التقادم / السقوط', 'judgment_date': 'تاريخ صدور الحكم',
    'police_station_ref': 'رقم الضبط الشرطي', 'prosecution_ref': 'رقم التحقيق المدعي العام',
    'co_plaintiffs': 'المدعون المشتركون', 'co_defendants': 'المدعى عليهم المشتركون',
    'experts_and_witnesses': 'الخبراء والشهود', 'power_of_attorney_number': 'رقم الوكالة ونوعها',
    'poa_details': 'تفاصيل الوكالة والتفويض', 'closure_reason': 'سبب إغلاق الملف',
    'physical_archive_location': 'موقع الحفظ الورقي (الأرشيف)', 'court_fees_paid': 'الرسوم القضائية المدفوعة',
    'court_deposits': 'الأمانات والودائع القضائية', 'case_tags': 'وسوم القضية',
    'current_stage': 'المرحلة الإجرائية', 'case_type': 'تصنيف القضية', 'case_outcome': 'منطوق الحكم / النتيجة',
    'lawsuit_facts': 'وقائع الدعوى', 'lawsuit_text': 'نص لائحة الدعوى', 'legal_basis': 'الأسانيد القانونية',
    'final_requests': 'الطلبات الختامية', 'update_title': 'عنوان الإجراء', 'update_details': 'تفاصيل الإجراء',
    'next_hearing_date': 'موعد الجلسة القادمة', 'description': 'البيان', 'expense_date': 'تاريخ المصروف',
    'file_name': 'اسم المستند', 'file_category': 'تصنيف المستند', 'expiry_date': 'تاريخ انتهاء الوثيقة',
    'assigned_lawyer_id': 'المحامون المسندون', 'assigned_to': 'المكلفون بالمهمة',
    'amount': 'المبلغ المالي', 'due_date': 'تاريخ الاستحقاق', 'is_active': 'حالة التفعيل',
    'missing_docs_request': 'طلب استكمال نواقص من الموكل', 'signature_request': 'طلب توقيع إلكتروني من الموكل',
    'missing_documents': 'المستندات الناقصة', 'client_portal_active': 'بوابة الموكل',
    'is_visible_to_client': 'إتاحة الرؤية للموكل', 'confidentiality_level': 'مستوى السرية',
    'priority_level': 'مستوى الأولوية', 'is_deleted': 'حالة الأرشفة (Soft Delete)',
    'role': 'الدور الوظيفي', 'can_login': 'صلاحية الدخول', 'permissions': 'الصلاحيات'
};

const isAuditValEmpty = (val) => {
    if (val === null || val === undefined || val === '') return true;
    if (typeof val === 'string' && val.trim() === '') return true;
    if (Array.isArray(val) && val.length === 0) return true;
    if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) return true;
    return false;
};

const formatAuditVal = (val) => {
    if (isAuditValEmpty(val)) return 'فارغ';
    if (typeof val === 'boolean') return val ? 'نعم' : 'لا';
    if (Array.isArray(val)) return val.join('، ');
    if (typeof val === 'object') return JSON.stringify(val);
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return str.split('T')[0];
    return str;
};

const cleanAuditHumanText = (rawText) => {
    if (!rawText || typeof rawText !== 'string') return '';
    return rawText
        .split('\n')
        .filter(line => !/(\[فارغ\]|\(فارغ\))\s*⬅️\s*(إلى\s*)?(\[فارغ\]|\(فارغ\))/.test(line))
        .filter(line => !/-\s*[a-zA-Z0-9_]+\s*:\s*\[فارغ\]\s*⬅️\s*\[فارغ\]/.test(line))
        .join('\n')
        .replace(/🔄\s*التعديلات المجراة:\s*$/g, 'تم حفظ السجل دون تغيير في القيم.')
        .trim();
};

window.renderAuditTrail = () => {
    const list = document.getElementById('audit-list');
    if (!list) return;
    const logs = window.AppCore.globalData.activityLogs;
    if (!logs || !Array.isArray(logs) || logs.length === 0) {
        list.innerHTML = '<div class="alert bg-white text-center shadow-sm fw-bold text-navy rounded-4 p-4">لا توجد حركات أمنية مسجلة حتى الآن.</div>';
        return;
    }

    const actLabel = { 'CREATE': 'إضافة', 'UPDATE': 'تعديل', 'DELETE': 'أرشفة/حذف' };
    const entLabel = {
        'mo_cases': 'قضية', 'mo_clients': 'موكل', 'mo_appointments': 'موعد/مهمة',
        'mo_firms': 'إعدادات المكتب', 'mo_installments': 'دفعة مالية',
        'mo_expenses': 'مصروف مالي', 'mo_case_updates': 'إجراء قضية',
        'mo_files': 'مستند أرشيف', 'mo_users': 'ملف موظف'
    };
    const colorVar = { 'CREATE': 'success', 'UPDATE': 'info', 'DELETE': 'danger' };

    let html = '';
    logs.slice(0, 100).forEach(log => {
        const staff = window.AppCore.globalData.staff.find(s => String(s.id) === String(log.user_id))?.full_name || 'إدارة النظام';
        const target = log.new_data?.case_internal_id || log.new_data?.full_name || log.new_data?.title || log.new_data?.update_title || log.old_data?.case_internal_id || log.old_data?.full_name || (log.entity_id ? String(log.entity_id).split('-')[0] : '--');
        const cVar = colorVar[log.action_type] || 'secondary';
        const humanDesc = cleanAuditHumanText(log.new_data?._human_log || '');
        const logDate = new Date(log.created_at);
        const fullDayStr = logDate.toLocaleDateString('ar-JO', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
        const timeStr = logDate.toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' });

        let desc = `<span class="badge bg-${cVar} bg-opacity-10 text-${cVar} border border-${cVar} border-opacity-25 me-1">${actLabel[log.action_type] || log.action_type}</span> ${entLabel[log.entity_type] || log.entity_type} <b class="text-navy">(${window.escapeHTML(target)})</b>`;

        html += `
        <div class="compact-card mb-3 transition-hover" style="border-right: 4px solid var(--bs-${cVar});">
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
                <div class="pe-2 flex-grow-1">
                    <h6 class="fw-bold mb-1 text-navy lh-base">${desc}</h6>
                    ${humanDesc ? `<p class="small text-muted fw-bold mb-2 lh-base" style="white-space: pre-wrap;">${window.escapeHTML(humanDesc)}</p>` : ''}
                    <div class="d-flex flex-wrap align-items-center gap-3 mt-1">
                        <small class="text-muted fw-bold"><i class="fas fa-user-tie text-info me-1"></i> بواسطة: <b class="text-navy">${window.escapeHTML(staff)}</b></small>
                        <small class="text-muted fw-bold"><i class="far fa-calendar-alt text-warning me-1"></i> ${window.escapeHTML(fullDayStr)} - الساعة ${window.escapeHTML(timeStr)}</small>
                    </div>
                </div>
                <div class="text-end flex-shrink-0">
                    <button type="button" class="btn btn-sm btn-light border text-navy rounded-pill px-3 fw-bold shadow-sm" style="font-size: 0.78rem;" onclick="window.showAuditDiff('${log.id}')"><i class="fas fa-eye me-1" style="color: var(--gold-luxury);"></i> مقارنة التعديلات</button>
                </div>
            </div>
        </div>`;
    });
    list.innerHTML = html;
};

window.showAuditDiff = (logId) => {
    const log = (window.AppCore.globalData.activityLogs || []).find(l => String(l.id) === String(logId));
    if (!log) return;
    const modalBody = document.getElementById('auditDiffModalBody');
    if (!modalBody) return;

    const staff = window.AppCore.globalData.staff.find(s => String(s.id) === String(log.user_id))?.full_name || 'إدارة النظام';
    const logDate = new Date(log.created_at);
    const fullDateTime = logDate.toLocaleString('ar-JO', { dateStyle: 'full', timeStyle: 'short' });

    let html = `
    <div class="d-flex flex-wrap justify-content-between align-items-center bg-light p-3 rounded-3 mb-3 border">
        <div><i class="fas fa-user-shield text-primary me-1"></i> <b>المنفذ:</b> ${window.escapeHTML(staff)}</div>
        <div><i class="far fa-clock text-warning me-1"></i> <b>اليوم والساعة:</b> ${window.escapeHTML(fullDateTime)}</div>
    </div>`;

    const cleanedHuman = cleanAuditHumanText(log.new_data?._human_log || '');
    if (cleanedHuman) {
        html += `<div class="alert alert-info border-0 shadow-sm fw-bold small mb-3 rounded-3" style="white-space: pre-wrap;"><i class="fas fa-robot me-1"></i> <b>توضيح الذكاء الاصطناعي:</b>\n${window.escapeHTML(cleanedHuman)}</div>`;
    }

    if (log.action_type === 'UPDATE' && log.new_data) {
        html += '<h6 class="fw-bold mb-3 text-navy">الحقول التي تم تعديلها فعلياً فقط (قبل ⬅️ بعد):</h6><ul class="list-group shadow-sm border-0">';
        let changesFound = false;
        const oldData = log.old_data || {};
        const skipKeys = new Set([
            'updated_at', 'last_login', 'client_last_seen', '_human_log', '_changes_list',
            'id', 'firm_id', 'created_at', 'public_token', 'case_embedding', 'embedding'
        ]);
        const zeroNumKeys = new Set(['court_fees_paid', 'court_deposits', 'claim_amount', 'agreed_fees', 'total_agreed_fees', 'amount', 'paid_amount', 'remaining_amount']);

        for (let key in log.new_data) {
            if (skipKeys.has(key)) continue;
            if (key === 'lawsuit_text' && log.new_data.lawsuit_facts !== undefined) continue;

            const rawNew = log.new_data[key];
            const rawOld = oldData[key];

            if (isAuditValEmpty(rawNew) && isAuditValEmpty(rawOld)) continue;

            if (zeroNumKeys.has(key)) {
                const nOld = isAuditValEmpty(rawOld) ? 0 : Number(rawOld);
                const nNew = isAuditValEmpty(rawNew) ? 0 : Number(rawNew);
                if (!Number.isNaN(nOld) && !Number.isNaN(nNew) && nOld === nNew) continue;
            }

            const oldDisplay = formatAuditVal(rawOld);
            const newDisplay = formatAuditVal(rawNew);

            if (oldDisplay !== newDisplay) {
                changesFound = true;
                const fName = fieldDict[key] || key;

                html += `
                <li class="list-group-item p-3 border-0 mb-2 rounded bg-white shadow-sm">
                    <b class="text-navy d-block mb-2"><i class="fas fa-pen-nib text-warning me-1"></i> حقل (${window.escapeHTML(fName)})</b>
                    <div class="d-flex flex-column flex-md-row align-items-md-center gap-3">
                        <div class="p-2 bg-danger bg-opacity-10 text-danger rounded w-100 w-md-50 text-center text-decoration-line-through font-monospace" style="word-break: break-word;">قبل: ${window.escapeHTML(oldDisplay)}</div>
                        <i class="fas fa-arrow-left text-muted d-none d-md-block"></i>
                        <i class="fas fa-arrow-down text-muted d-md-none text-center"></i>
                        <div class="p-2 bg-success bg-opacity-10 text-success rounded w-100 w-md-50 text-center fw-bold font-monospace" style="word-break: break-word;">بعد: ${window.escapeHTML(newDisplay)}</div>
                    </div>
                </li>`;
            }
        }

        if (!changesFound) {
            html += '<li class="list-group-item p-3 border-0 text-center fw-bold text-muted bg-white rounded shadow-sm">لم يتم تغيير أي قيم نصية أو رقمية في هذا التحديث.</li>';
        }
        html += '</ul>';
    } else if (log.action_type === 'CREATE') {
        html += '<div class="alert bg-success bg-opacity-10 text-success fw-bold p-4 text-center border border-success border-opacity-25 rounded-4"><i class="fas fa-check-circle fa-2x mb-2 d-block"></i> تم إنشاء وتوثيق هذا السجل لأول مرة في النظام.</div>';
    } else if (log.action_type === 'DELETE') {
        html += '<div class="alert bg-danger bg-opacity-10 text-danger fw-bold p-4 text-center border border-danger border-opacity-25 rounded-4"><i class="fas fa-archive fa-2x mb-2 d-block"></i> تم أرشفة/حذف هذا السجل بموجب المصادقة الثنائية (Soft Delete / Audit Protected).</div>';
    }

    modalBody.innerHTML = html;
    window.openModal('auditDiffModal');
};

// ============================================================================
// [8] PWA & Web Push Notifications & vCard (Global Scope)
// ============================================================================

window.generateVCard = () => {
    const user = window.AppCore.currentUser;
    const firm = JSON.parse(localStorage.getItem('firm_settings') || '{}');
    if (!user) return;

    // رابط صفحة التحقق المعتمدة للسيرة الذاتية والهوية المهنية
    const verifyUrl = `${window.location.origin}/verify.html?type=cv&id=${encodeURIComponent(user.id)}`;

    const qrContainer = document.getElementById('vcard-qrcode');
    if (qrContainer) {
        qrContainer.innerHTML = '';

        try {
            if (typeof QRCode !== 'undefined') {
                new QRCode(qrContainer, {
                    text: verifyUrl,
                    width: 180,
                    height: 180,
                    colorDark: "#0B132B",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.M
                });
            }
        } catch (e) {
            console.error("QR Generation failed:", e);
        }

        if (document.getElementById('vcard-name-title')) document.getElementById('vcard-name-title').innerText = window.escapeHTML(user.full_name || 'اسم المحامي');
        if (document.getElementById('vcard-firm-title')) document.getElementById('vcard-firm-title').innerText = window.escapeHTML(firm.firm_name || 'مكتب المحاماة');
        window.openModal('vCardModal');
    }
};
window.showVCard = window.generateVCard;

// تحويل مفتاح VAPID Base64 إلى Uint8Array قياسي لمتصفحات الموبايل
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('install-pwa-btn');
    if (installBtn) {
        installBtn.classList.remove('d-none');
        if (installBtn.parentElement) installBtn.parentElement.classList.remove('d-none');
    }
});

window.requestPushPermission = async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            document.getElementById('install-pwa-btn')?.classList.add('d-none');
        }
        deferredPrompt = null;
    }

    if ('serviceWorker' in navigator && 'PushManager' in window) {
        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                const registration = await navigator.serviceWorker.ready;
                const vapidKey = CONFIG?.VAPID_PUBLIC_KEY || "";
                const subOptions = { userVisibleOnly: true };
                if (vapidKey && vapidKey !== "BE_YOUR_VAPID_KEY_HERE") {
                    subOptions.applicationServerKey = urlBase64ToUint8Array(vapidKey);
                }
                const subscription = await registration.pushManager.subscribe(subOptions);
                await API.subscribePush(subscription);
                window.showToast('تم تفعيل الإشعارات الذكية بنجاح', 'success');
            }
        } catch (e) {
            console.error("Push Notification Setup Failed:", e);
        }
    }
};

// ============================================================================
// [9] تشغيل النظام (Boot Sequence)
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof AUTH !== 'undefined' && typeof AUTH.checkSession === 'function') {
        window.AppCore.currentUser = AUTH.checkSession();
    }
    if (!window.AppCore.currentUser) {
        window.location.replace('login.html');
        return;
    }

    // إخفاء الـ Splash Screen بسلاسة
    setTimeout(() => {
        const sp = document.getElementById('splash-screen');
        if (sp) {
            sp.style.opacity = '0';
            setTimeout(() => { sp.style.display = 'none'; }, 800);
        }
    }, 1800);

    const isAdmin = ['admin', 'super_admin'].includes(window.AppCore.currentUser.role);
    if (isAdmin) {
        if (document.getElementById('stat-staff-card')) document.getElementById('stat-staff-card').style.display = 'block';
        if (document.getElementById('firm-settings-btn')) document.getElementById('firm-settings-btn').style.display = 'block';
        if (document.getElementById('audit-trail-btn')) document.getElementById('audit-trail-btn').style.display = 'block';
        if (document.getElementById('reports-nav-btn')) document.getElementById('reports-nav-btn').style.display = 'block';
        if (document.getElementById('admin-reports-btn')) document.getElementById('admin-reports-btn').classList.remove('d-none');
    }

    const uName = window.escapeHTML(window.AppCore.currentUser.full_name || 'مستخدم');
    if (document.getElementById('welcome-name')) document.getElementById('welcome-name').innerText = uName;
    if (document.getElementById('top-user-name')) document.getElementById('top-user-name').innerText = uName;
    if (document.getElementById('top-user-avatar')) document.getElementById('top-user-avatar').innerText = uName.charAt(0);
    if (document.getElementById('welcome-role')) document.getElementById('welcome-role').innerText = `المنصب: ${isAdmin ? 'مدير النظام / الشريك الإداري' : 'محامي ومستشار قانوني'}`;

    // قراءة التبويب المطلوب من الرابط (#cases, #clients, #agenda, #tools) أو من آخر تبويب نشط
    const hashView = window.location.hash ? window.location.hash.replace('#', '') : '';
    const targetInitialView = ['dashboard', 'cases', 'clients', 'agenda', 'tools', 'audit'].includes(hashView)
        ? hashView
        : (localStorage.getItem('last_active_view') || 'dashboard');

    window.switchView(targetInitialView);

    await window.loadAllData();
    window.startHeartbeat();

    if (typeof window.loadMegaSettings === 'function') window.loadMegaSettings();
});