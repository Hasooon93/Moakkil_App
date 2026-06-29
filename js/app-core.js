/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/app-core.js
 * الوصف: المحرك الأساسي، المزامنة، الإشعارات، العقود الذكية، الـ QR Scanner، 
 * وإدارة السجل الأمني ومؤشر التواجد (Heartbeat) وتطبيقات الويب التقدمية (PWA).
 * التحديث: ربط بطاقة العمل (vCard) برابط صفحة التحقق (verify-cv) لتفادي طفحان الـ QR.
 * ============================================================================
 */

window.AppCore = {
    globalData: { cases: [], clients: [], staff: [], appointments: [], activityLogs: [], notifications: [] },
    currentUser: JSON.parse(localStorage.getItem(CONFIG?.USER_KEY || 'moakkil_user')),
    isKanbanView: false, 
    currentCaseFilter: '', 
    currentShareLink: '',

    escapeHTML: function(str) { 
        if (!str) return ''; 
        return str.toString().replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)); 
    },
    
    showAlert: function(msg, type = 'info') { 
        typeof Swal !== 'undefined' ? Swal.fire({ toast: true, position: 'top-end', icon: type === 'danger' ? 'error' : type, title: this.escapeHTML(msg), showConfirmButton: false, timer: 3000 }) : alert(msg); 
    },
    
    showToast: function(msg, type = 'info') {
        this.showAlert(msg, type);
    },

    openModal: function(id) { 
        const el = document.getElementById(id); 
        if(el) { 
            new bootstrap.Modal(el).show(); 
            if(id === 'caseModal' && window.generateStrongPIN) window.generateStrongPIN(); 
        } 
    },

    closeModal: function(id) { 
        const el = document.getElementById(id); 
        if(el) bootstrap.Modal.getInstance(el)?.hide(); 
    }
};

window.escapeHTML = (str) => window.AppCore.escapeHTML(str);
window.showAlert = (msg, type) => window.AppCore.showAlert(msg, type);
window.showToast = (msg, type) => window.AppCore.showToast(msg, type);
window.openModal = (id) => window.AppCore.openModal(id);
window.closeModal = (id) => window.AppCore.closeModal(id);

window.switchView = (viewId) => {
    if(['ai','library','calculators'].includes(viewId)) return window.location.href = `${viewId}.html`;
    localStorage.setItem('last_active_view', viewId);
    document.querySelectorAll('.view').forEach(v => v.classList.add('d-none', 'fade-in'));
    const activeView = document.getElementById(viewId + '-view');
    if(activeView) {
        activeView.classList.remove('d-none');
        activeView.style.animation = 'none';
        activeView.offsetHeight; 
        activeView.style.animation = null;
    }
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`nav-icon-${viewId}`)?.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ============================================================================
// [1] محرك المزامنة وتفريغ البيانات (Sync & Populate)
// ============================================================================

window.loadAllData = async () => {
    try {
        const [clients, cases, staff, appts, notifs] = await Promise.all([ 
            API.getClients().catch(()=>[]), 
            API.getCases().catch(()=>[]), 
            API.getStaff().catch(()=>[]), 
            API.getAppointments().catch(()=>[]),
            API.getNotifications().catch(()=>[])
        ]);
        
        window.AppCore.globalData.staff = Array.isArray(staff) ? staff : [];
        window.AppCore.globalData.clients = Array.isArray(clients) ? clients : [];
        window.AppCore.globalData.cases = Array.isArray(cases) ? cases : [];
        window.AppCore.globalData.appointments = Array.isArray(appts) ? appts : [];
        window.AppCore.globalData.notifications = Array.isArray(notifs) ? notifs : [];

        if (window.AppCore.currentUser && ['admin', 'super_admin'].includes(window.AppCore.currentUser.role)) {
            const logsRes = await fetch(`${CONFIG.API_URL}/api/history`, { headers: { 'Authorization': `Bearer ${localStorage.getItem(CONFIG.TOKEN_KEY)}` }});
            if(logsRes.ok) window.AppCore.globalData.activityLogs = await logsRes.json();
            window.renderOnlineStaff(); // عرض المتصلين للمدير
        }

        window.populateSelects(); 
        window.renderDashboardStats();
        window.renderNotifications();
        
        if(typeof window.renderCasesList === 'function') window.renderCasesList();
        if(typeof window.renderClientsList === 'function') window.renderClientsList();
        if(typeof window.renderAgendaList === 'function') { window.AppCore.isKanbanView ? window.renderKanbanBoard() : window.renderAgendaList(); }
        window.renderAuditTrail();
        
    } catch(e) { console.error("Data loading error:", e); }
};

window.manualSync = async () => { 
    const btn = document.getElementById('btn_sync_dashboard'); 
    if(btn){ btn.disabled=true; btn.innerHTML='<i class="fas fa-sync-alt fa-spin"></i>'; }
    await window.loadAllData(); 
    window.showToast('تمت المزامنة وتحديث البيانات', 'success');
    if(btn){ btn.disabled=false; btn.innerHTML='<i class="fas fa-sync-alt"></i>'; }
};

window.populateSelects = () => {
    const staffOpts = window.AppCore.globalData.staff.map(s => `<option value="${s.id}">${window.escapeHTML(s.full_name)}</option>`).join('');
    const clientOpts = '<option value="">اختر الموكل...</option>' + window.AppCore.globalData.clients.map(c => `<option value="${c.id}">${window.escapeHTML(c.full_name)}</option>`).join('');
    
    ['case_assigned_lawyers', 'appt_assigned_to'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).innerHTML = staffOpts; });
    ['case_client_id', 'appt_client_id', 'contract_client_id'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).innerHTML = clientOpts; });
};

window.renderDashboardStats = () => {
    const { cases, clients, appointments, staff } = window.AppCore.globalData;
    if(document.getElementById('stat-cases')) document.getElementById('stat-cases').innerText = cases.filter(c => c.status !== 'مكتملة').length;
    if(document.getElementById('stat-clients')) document.getElementById('stat-clients').innerText = clients.length;
    if(document.getElementById('stat-appointments')) document.getElementById('stat-appointments').innerText = appointments.filter(a => ['مجدول','مؤجل'].includes(a.status)).length;
    if(document.getElementById('stat-staff')) document.getElementById('stat-staff').innerText = staff ? staff.length : 0;
    
    let agreed = 0, paid = 0;
    cases.forEach(c => { agreed += Number(c.total_agreed_fees) || 0; paid += Number(c.total_paid) || 0; });
    if(document.getElementById('fin-agreed')) document.getElementById('fin-agreed').innerText = agreed.toLocaleString();
    if(document.getElementById('fin-paid')) document.getElementById('fin-paid').innerText = paid.toLocaleString();
    if(document.getElementById('fin-rem')) document.getElementById('fin-rem').innerText = (agreed - paid).toLocaleString();
};

// ============================================================================
// [2] محرك البحث الذكي و معالجة الـ QR Code (Smart Search & QR Parser)
// ============================================================================

window.handleSmartSearch = async (query) => {
    const drop = document.getElementById('search-results-dropdown');
    const safeQuery = query.trim();
    if (safeQuery.length < 2) return drop.classList.add('d-none');

    // 💡 [الاستجابة لـ QR Code]: إذا قام الماسح بقراءة رابط، نقوم بتوجيه المستخدم فوراً!
    if (safeQuery.includes('case-details.html?id=')) {
        window.showToast('تم التقاط رابط الملف، جاري التوجيه...', 'success');
        setTimeout(() => { window.location.href = safeQuery; }, 500);
        return drop.classList.add('d-none');
    }

    try {
        const res = await API.smartSearch(safeQuery); 
        let html = '';
        
        if (res.cases?.length) {
            html += '<h6 class="dropdown-header text-accent fw-bold px-3 pt-2"><i class="fas fa-gavel me-1"></i> القضايا المطابقة</h6>';
            html += res.cases.map(c => `<button class="dropdown-item py-2 border-bottom fw-bold text-navy" onclick="window.location.href='case-details.html?id=${c.id}'">${window.escapeHTML(c.case_internal_id)} - ${window.escapeHTML(c.opponent_name)}</button>`).join('');
        }
        
        if (res.clients?.length) {
            html += '<h6 class="dropdown-header text-success fw-bold px-3 pt-2"><i class="fas fa-users me-1"></i> الموكلين</h6>';
            html += res.clients.map(c => `<button class="dropdown-item py-2 border-bottom fw-bold text-navy" onclick="window.location.href='client-details.html?id=${c.id}'">${window.escapeHTML(c.full_name)}</button>`).join('');
        }
        
        drop.innerHTML = html || '<div class="p-3 text-center text-muted fw-bold"><i class="fas fa-search-minus fa-2x mb-2 d-block opacity-50"></i>لا توجد ملفات مطابقة</div>'; 
        drop.classList.remove('d-none');
    } catch(e) {
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
// [3] نظام فحص التعارض (Conflict Check Engine)
// ============================================================================

window.runConflictCheck = async () => {
    const input = document.getElementById('conflict_search_input');
    const resContainer = document.getElementById('conflict_results');
    
    if(!input || !input.value.trim()) return window.showAlert('يرجى كتابة اسم الخصم للبدء بالفحص', 'warning');

    const query = input.value.trim();
    resContainer.innerHTML = '<div class="text-center p-4"><i class="fas fa-circle-notch fa-spin fa-3x text-warning mb-3"></i><p class="fw-bold text-navy">جاري إجراء مسح دلالي عميق في قاعدة البيانات...</p></div>';

    try {
        const res = await fetch(`${CONFIG.API_URL}/api/conflict-check?name=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem(CONFIG.TOKEN_KEY)}` }
        });
        
        const data = await res.json();
        if(!res.ok) throw new Error(data.error || 'فشل الاتصال بمحرك الفحص');

        let html = '';
        if(data.has_conflict) {
            html += `<div class="alert alert-danger fw-bold border-danger border-2 shadow-sm fs-5"><i class="fas fa-exclamation-triangle me-2"></i> تحذير مهني: تم رصد تعارض محتمل!</div>`;
            
            if(data.clients && data.clients.length > 0) {
                html += `<h6 class="fw-bold text-navy mt-4 border-bottom pb-2"><i class="fas fa-user-tie me-2 text-success"></i> موكلين مسجلين مسبقاً بنفس الاسم:</h6>`;
                data.clients.forEach(c => {
                    html += `<div class="p-3 border-start border-danger border-4 bg-white mb-2 shadow-sm rounded-3 d-flex justify-content-between align-items-center">
                        <span class="fw-bold"><i class="fas fa-user text-danger me-2"></i> ${window.escapeHTML(c.full_name)}</span> 
                        <span class="badge bg-light text-dark border">وطني: ${window.escapeHTML(c.national_id || '--')}</span>
                    </div>`;
                });
            }
            if(data.opponents && data.opponents.length > 0) {
                html += `<h6 class="fw-bold text-navy mt-4 border-bottom pb-2"><i class="fas fa-gavel me-2 text-warning"></i> خصوم في قضايا مسجلة بالمكتب:</h6>`;
                data.opponents.forEach(o => {
                    html += `<div class="p-3 border-start border-warning border-4 bg-white mb-2 shadow-sm rounded-3 d-flex justify-content-between align-items-center">
                        <span class="fw-bold"><i class="fas fa-user-slash text-warning me-2"></i> ${window.escapeHTML(o.opponent_name)}</span> 
                        <button class="btn btn-sm btn-light border text-navy fw-bold" onclick="window.location.href='case-details.html?id=${o.id}'">ملف: ${window.escapeHTML(o.case_internal_id)}</button>
                    </div>`;
                });
            }
        } else {
            html = `<div class="alert alert-success fw-bold border-success border-2 shadow-sm text-center p-4 rounded-4">
                <i class="fas fa-shield-check fa-3x mb-3 d-block text-success"></i> النتيجة سليمة 100%! لا يوجد أي تعارض مسجل لهذا الاسم. يمكنك قبول القضية بأمان.
            </div>`;
        }
        resContainer.innerHTML = html;
    } catch(e) {
        resContainer.innerHTML = `<div class="alert alert-danger fw-bold border-danger"><i class="fas fa-wifi-slash me-2"></i> خطأ في الفحص: ${window.escapeHTML(e.message)}</div>`;
    }
};

// ============================================================================
// [4] المراقبة ونبض الموظفين (Heartbeat & Online Status)
// ============================================================================

window.renderOnlineStaff = () => {
    const container = document.getElementById('online-staff-container');
    const widget = document.getElementById('online-staff-widget');
    if(!container || !widget) return;

    const staff = window.AppCore.globalData.staff || [];
    const now = new Date();
    
    // نعتبر الموظف "متصل" إذا كان نشطاً خلال آخر 15 دقيقة (900,000 مللي ثانية)
    const onlineStaff = staff.filter(s => {
        if(!s.last_login) return false;
        const last = new Date(s.last_login);
        return (now - last) < 900000;
    });

    if(onlineStaff.length > 0) {
        widget.style.display = 'block';
        container.innerHTML = onlineStaff.map(s => `
            <div class="badge bg-white text-navy border shadow-sm px-3 py-2 rounded-pill d-flex align-items-center gap-2">
                <span class="online-dot"></span> ${window.escapeHTML(s.full_name)}
            </div>
        `).join('');
    } else {
        container.innerHTML = `<span class="text-muted small fw-bold"><i class="fas fa-moon me-1"></i> لا يوجد موظفين متصلين حالياً.</span>`;
        widget.style.display = 'block';
    }
};

window.startHeartbeat = () => {
    // يقوم النظام بتحديث البيانات الصامت كل 3 دقائق لتنشيط التوكن وجلب حالة الموظفين
    setInterval(async () => {
        if(navigator.onLine && window.AppCore.currentUser) {
            try {
                const staffRes = await API.getStaff();
                window.AppCore.globalData.staff = Array.isArray(staffRes) ? staffRes : [];
                if (['admin', 'super_admin'].includes(window.AppCore.currentUser.role)) {
                    window.renderOnlineStaff();
                }
                // إرسال نبض للخادم
                fetch(`${CONFIG.API_URL}/api/auth/heartbeat`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${localStorage.getItem(CONFIG.TOKEN_KEY)}` }
                });
            } catch(e){}
        }
    }, 180000);
};

// ============================================================================
// [5] نظام الإشعارات (Notifications)
// ============================================================================

window.renderNotifications = () => {
    const list = document.getElementById('notifications-list');
    const badge = document.getElementById('notification-badge');
    if(!list) return;
    
    const notifs = window.AppCore.globalData.notifications || [];
    const unread = notifs.filter(n => !n.is_read).length;
    
    if(unread > 0 && badge) {
        badge.innerText = unread;
        badge.classList.remove('d-none');
    } else if (badge) {
        badge.classList.add('d-none');
    }
    
    if(notifs.length === 0) {
        list.innerHTML = '<li class="p-4 text-center text-muted fw-bold small">لا توجد إشعارات حالياً</li>';
        return;
    }
    
    list.innerHTML = notifs.slice(0, 10).map(n => `
        <li><a class="dropdown-item py-3 border-bottom ${n.is_read ? 'text-muted' : 'fw-bold text-navy bg-light'}" href="${n.action_url || '#'}">
            <small class="d-block mb-1" style="color: var(--accent);">${window.escapeHTML(n.title)}</small>
            <span style="font-size:0.85rem; white-space: normal;">${window.escapeHTML(n.message)}</span>
        </a></li>
    `).join('');
};

window.markNotificationsRead = async () => {
    const badge = document.getElementById('notification-badge');
    if(badge) badge.classList.add('d-none');
    document.querySelectorAll('#notifications-list .text-navy').forEach(el => el.classList.remove('text-navy', 'fw-bold', 'bg-light'));
    
    try {
        const unread = window.AppCore.globalData.notifications?.filter(n => !n.is_read) || [];
        for(let n of unread) { await API.markNotificationAsRead(n.id); }
    } catch(e) {}
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

    if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري الصياغة القانونية...'; }

    try {
        let templateText = "";
        if (draftTypeValue === 'اتفاقية أتعاب محاماة') {
            templateText = "إنه في يوم {{date}} تم الاتفاق والتراضي بين كل من:\nالطرف الأول (المحامي): {{firm_name}}\nالطرف الثاني (الموكل): {{client_name}} - يحمل رقم وطني: {{national_id}}\n\nمقدمة:\nبما أن الطرف الثاني يرغب بتوكيل الطرف الأول لتمثيله والدفاع عن حقوقه، فقد تم الاتفاق على الأتعاب والشروط التالية:\n\n1. يلتزم الطرف الأول ببذل العناية القانونية اللازمة.\n2. يلتزم الطرف الثاني بدفع الأتعاب المتفق عليها وفقاً للإيصالات الرسمية.\n\nتوجيهات إضافية: {{extra}}\n\nتوقيع الطرف الأول: __________________\nتوقيع الطرف الثاني: __________________";
        } else if (draftTypeValue === 'إنذار عدلي') {
            templateText = "بواسطة الكاتب العدل الموقر\n\nالمنذر: {{client_name}} - رقمه الوطني: {{national_id}}\nوكيله المحامي: {{firm_name}}\nالمنذر إليه: ________________________\n\nالموضوع: إنذار عدلي شديد اللهجة للمطالبة بحقوق مالية وقانونية.\n\nالوقائع:\n1. بناءً على توكيلنا الرسمي من قبل المنذر.\n2. وحيث أن المنذر إليه ممتنع عن أداء الالتزامات المترتبة عليه.\n3. التوجيهات الخاصة بالإنذار: {{extra}}\n\nوبعكس ذلك، سيتم اتخاذ كافة الإجراءات القانونية بحقكم بما فيها الحجز التحفظي وتضمينكم الرسوم والمصاريف وأتعاب المحاماة.\n\nواقبلوا الاحترام،\nوكيل المنذر: {{firm_name}}";
        } else {
            templateText = "عقد / مسودة: {{draft_type}}\n\nالطرف المعني: {{client_name}}\nالتاريخ: {{date}}\nالتوجيهات: {{extra}}\n\nتم صياغة هذه المسودة عبر محرك الذكاء الاصطناعي لنظام موكّل، يرجى مراجعتها واعتمادها.";
        }

        const res = await fetch(`${CONFIG.API_URL}/api/contracts/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem(CONFIG.TOKEN_KEY)}` },
            body: JSON.stringify({ 
                client_id: clientId, 
                template_text: templateText, 
                additional_vars: { draft_type: draftTypeValue, extra: extraContext } 
            })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'فشل التوليد');

        if (data.success) {
            document.getElementById('contract_result_container')?.classList.remove('d-none');
            const resultBox = document.getElementById('contract_result');
            if(resultBox) resultBox.value = data.generated_text;
            window.showToast('تم صياغة وتوليد النص بنجاح', 'success');
        }
    } catch (e) {
        window.showAlert('تعذر الاتصال بالمحرك السحابي: ' + e.message, 'error');
    } finally {
        if(btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-cogs me-2"></i> توليد العقد الآن'; }
    }
};

window.copyToClipboard = (elementId) => {
    const el = document.getElementById(elementId);
    if(el) { el.select(); document.execCommand('copy'); window.showToast('تم نسخ النص للحافظة بنجاح', 'success'); }
};

// ============================================================================
// [7] آلة الزمن الأمني وترجمة سجل الرقابة (Audit Trail & Time Machine)
// ============================================================================

window.renderAuditTrail = () => {
    const list = document.getElementById('audit-list'); if(!list) return;
    const logs = window.AppCore.globalData.activityLogs;
    if(!logs || logs.length === 0) return list.innerHTML = '<div class="alert bg-white text-center shadow-sm fw-bold text-navy">لا توجد حركات مسجلة.</div>';

    const actLabel = { 'CREATE':'أضاف', 'UPDATE':'عدل', 'DELETE':'حذف' };
    const entLabel = { 'mo_cases':'قضية', 'mo_clients':'موكل', 'mo_appointments':'موعد/مهمة', 'mo_firms':'إعدادات المكتب', 'mo_installments':'دفعة مالية', 'mo_expenses':'مصروف' };
    const colorVar = { 'CREATE':'success', 'UPDATE':'info', 'DELETE':'danger' }; 
    
    let html = '';
    logs.slice(0, 100).forEach(log => {
        const staff = window.AppCore.globalData.staff.find(s => s.id === log.user_id)?.full_name || 'موظف/إداري';
        const target = log.new_data?.case_internal_id || log.new_data?.full_name || log.new_data?.title || log.old_data?.case_internal_id || log.entity_id.split('-')[0];
        
        let desc = `<span class="badge bg-${colorVar[log.action_type]} bg-opacity-10 text-${colorVar[log.action_type]} border border-${colorVar[log.action_type]} border-opacity-25 me-1">${actLabel[log.action_type] || log.action_type}</span> ${entLabel[log.entity_type]||log.entity_type} <b class="text-navy">(${window.escapeHTML(target)})</b>`;
        
        html += `
        <div class="compact-card mb-3 transition-hover" style="border-right: 3px solid var(--${colorVar[log.action_type]});">
            <div class="d-flex justify-content-between align-items-start">
                <div class="pe-2">
                    <h6 class="fw-bold mb-1 text-navy lh-base">${desc}</h6>
                    <small class="text-muted"><i class="fas fa-user-tie text-info me-1"></i> ${window.escapeHTML(staff)}</small>
                </div>
                <div class="text-end">
                    <small class="d-block fw-bold font-monospace text-navy">${new Date(log.created_at).toLocaleDateString('ar-EG')}</small>
                    <small class="text-muted font-monospace">${new Date(log.created_at).toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'})}</small>
                </div>
            </div>
            <div class="mt-3 pt-2 border-top text-end">
                <button class="btn btn-sm btn-light border text-navy rounded-pill px-4 fw-bold shadow-sm" style="font-size: 0.8rem;" onclick="window.showAuditDiff('${log.id}')"><i class="fas fa-eye me-1 text-accent"></i> التفاصيل التقنية</button>
            </div>
        </div>`;
    });
    list.innerHTML = html;
};

// قاموس الترجمة الشامل للحقول (لجعل الـ Audit Log مقروءاً للبشر)
const fieldDict = {
    'status': 'الحالة', 'case_internal_id': 'رقم القضية', 'opponent_name': 'اسم الخصم',
    'total_agreed_fees': 'الأتعاب المتفق عليها', 'claim_amount': 'قيمة المطالبة',
    'full_name': 'الاسم الكامل', 'phone': 'رقم الهاتف', 'national_id': 'الرقم الوطني',
    'appt_date': 'تاريخ الموعد', 'notes': 'الملاحظات', 'title': 'العنوان',
    'current_court': 'المحكمة المختصة', 'current_stage': 'المرحلة الإجرائية',
    'assigned_lawyer_id': 'المحامين المسندين', 'assigned_to': 'المكلفين بالمهمة',
    'amount': 'المبلغ (المالي)', 'due_date': 'تاريخ الاستحقاق', 'is_active': 'حالة الحساب',
    'missing_documents': 'المستندات الناقصة', 'client_portal_active': 'بوابة الموكل'
};

window.showAuditDiff = (logId) => {
    const log = window.AppCore.globalData.activityLogs.find(l => l.id === logId); 
    if (!log) return;
    const modalBody = document.getElementById('auditDiffModalBody');
    
    let html = '';
    if (log.action_type === 'UPDATE' && log.new_data) {
        html += '<h6 class="fw-bold mb-3 text-navy">تغييرات البيانات (قبل وبعد):</h6><ul class="list-group shadow-sm border-0">';
        let changesFound = false;
        const oldData = log.old_data || {};
        
        for (let key in log.new_data) {
            if (['updated_at','last_login','client_last_seen'].includes(key)) continue;

            let valNew = typeof log.new_data[key] === 'object' ? JSON.stringify(log.new_data[key]) : log.new_data[key];
            let valOld = typeof oldData[key] === 'object' ? JSON.stringify(oldData[key]) : oldData[key];
            
            if (valNew !== valOld && valNew !== undefined) {
                changesFound = true;
                let fName = fieldDict[key] || key;
                let oldDisplay = (oldData[key] !== null && oldData[key] !== undefined) ? String(oldData[key]) : 'فارغ / غير محدد';
                let newDisplay = (log.new_data[key] !== null && log.new_data[key] !== undefined) ? String(log.new_data[key]) : 'فارغ / غير محدد';
                
                if(oldDisplay.startsWith('[')) oldDisplay = 'تحديث مصفوفة/قائمة';
                if(newDisplay.startsWith('[')) newDisplay = 'تحديث مصفوفة/قائمة';

                html += `
                <li class="list-group-item p-3 border-0 mb-2 rounded bg-white shadow-sm">
                    <b class="text-navy d-block mb-2">تعديل حقل (${window.escapeHTML(fName)})</b>
                    <div class="d-flex flex-column flex-md-row align-items-md-center gap-3">
                        <div class="p-2 bg-danger bg-opacity-10 text-danger rounded w-100 w-md-50 text-center text-decoration-line-through font-monospace" style="word-break: break-word;">${window.escapeHTML(oldDisplay)}</div>
                        <i class="fas fa-arrow-left text-muted d-none d-md-block"></i>
                        <i class="fas fa-arrow-down text-muted d-md-none text-center"></i>
                        <div class="p-2 bg-success bg-opacity-10 text-success rounded w-100 w-md-50 text-center fw-bold font-monospace" style="word-break: break-word;">${window.escapeHTML(newDisplay)}</div>
                    </div>
                </li>`;
            }
        }
        
        if(!changesFound) html += '<li class="list-group-item p-3 border-0 text-center fw-bold text-muted bg-white rounded shadow-sm">تحديث بيانات عامة (لم يتم رصد تغيير جوهري)</li>';
        html += '</ul>';
    } else if (log.action_type === 'CREATE') {
        html = '<div class="alert bg-success bg-opacity-10 text-success fw-bold p-4 text-center border border-success border-opacity-25 rounded-4"><i class="fas fa-check-circle fa-2x mb-2 d-block"></i> تم إنشاء وتوثيق هذا السجل لأول مرة في النظام.</div>';
    } else if (log.action_type === 'DELETE') {
        html = '<div class="alert bg-danger bg-opacity-10 text-danger fw-bold p-4 text-center border border-danger border-opacity-25 rounded-4"><i class="fas fa-trash-alt fa-2x mb-2 d-block"></i> تم إتلاف ومسح هذا السجل نهائياً من قاعدة البيانات.</div>';
    }
    
    modalBody.innerHTML = html;
    window.openModal('auditDiffModal');
};

// ============================================================================
// [9] PWA & Web Push Notifications & vCard (Global Scope)
// ============================================================================

window.generateVCard = () => {
    const user = window.AppCore.currentUser;
    const firm = JSON.parse(localStorage.getItem('firm_settings') || '{}');
    if (!user) return;

    // الحل الجذري والذكي: توليد رابط لصفحة التحقق/السيرة الذاتية (Verify CV) بدلاً من حشو الـ vCard
    // هذا يمنع أي طفحان (Overflow) ويتيح عرض صفحة تفاعلية للموكل عند مسح الرمز.
    const verifyUrl = `${window.location.origin}/verify-cv.html?id=${user.id}`;
    
    const qrContainer = document.getElementById('vcard-qrcode');
    if (qrContainer) {
        qrContainer.innerHTML = '';
        
        try {
            new QRCode(qrContainer, { 
                text: verifyUrl, 
                width: 200, 
                height: 200, 
                colorDark: "#0B132B", 
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.M 
            });
        } catch(e) {
            console.error("QR Generation failed:", e);
        }

        if(document.getElementById('vcard-name-title')) document.getElementById('vcard-name-title').innerText = window.escapeHTML(user.full_name);
        if(document.getElementById('vcard-firm-title')) document.getElementById('vcard-firm-title').innerText = window.escapeHTML(firm.firm_name || 'مكتب المحاماة');
        window.openModal('vCardModal');
    }
};
window.showVCard = window.generateVCard; // Alias

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('install-pwa-btn');
    if (installBtn) {
        installBtn.classList.remove('d-none');
        if(installBtn.parentElement) installBtn.parentElement.classList.remove('d-none');
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
                // VAPID KEY is loaded from CONFIG
                const vapidKey = CONFIG.VAPID_PUBLIC_KEY || "BE_YOUR_VAPID_KEY_HERE"; 
                const subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: vapidKey
                });
                await fetch(`${CONFIG.API_URL}/api/notifications/subscribe`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem(CONFIG.TOKEN_KEY)}` },
                    body: JSON.stringify(subscription)
                });
                window.showToast('تم تفعيل الإشعارات وتثبيت التطبيق بنجاح', 'success');
            }
        } catch (e) {
            console.error("Push Notification Setup Failed:", e);
        }
    }
};

// ============================================================================
// [10] تشغيل النظام (Boot Sequence)
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    if (!window.AppCore.currentUser) return window.location.href = 'login.html';
    
    // إخفاء الـ Splash Screen بسلاسة
    setTimeout(() => { const sp = document.getElementById('splash-screen'); if(sp) { sp.style.opacity = '0'; setTimeout(()=>sp.style.display='none', 800); } }, 2000);

    const isAdmin = ['admin', 'super_admin'].includes(window.AppCore.currentUser.role);
    if(isAdmin) {
        if(document.getElementById('stat-staff-card')) document.getElementById('stat-staff-card').style.display = 'block';
        if(document.getElementById('firm-settings-btn')) document.getElementById('firm-settings-btn').style.display = 'block';
        if(document.getElementById('audit-trail-btn')) document.getElementById('audit-trail-btn').style.display = 'block';
        if(document.getElementById('admin-reports-btn')) document.getElementById('admin-reports-btn').classList.remove('d-none');
    }

    if(document.getElementById('welcome-name')) document.getElementById('welcome-name').innerText = window.escapeHTML(window.AppCore.currentUser.full_name);
    if(document.getElementById('top-user-name')) document.getElementById('top-user-name').innerText = window.escapeHTML(window.AppCore.currentUser.full_name);
    if(document.getElementById('top-user-avatar')) document.getElementById('top-user-avatar').innerText = window.escapeHTML(window.AppCore.currentUser.full_name).charAt(0);
    if(document.getElementById('welcome-role')) document.getElementById('welcome-role').innerText = `المنصب: ${isAdmin ? 'مدير النظام' : 'محامي'}`;

    await window.loadAllData();
    window.startHeartbeat(); // بدء نبض المراقبة
    
    if(typeof window.loadMegaSettings === 'function') window.loadMegaSettings();
    window.switchView(localStorage.getItem('last_active_view') || 'dashboard');
});