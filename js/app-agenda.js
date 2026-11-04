/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/app-agenda.js
 * الوصف: المحرك المتطور للأجندة، وإدارة المواعيد، ربط القضايا والموكلين، الإنجاز المرفق (R2)، والإلغاء.
 * التحديثات المعمارية (V5.2 Enterprise Edition):
 * 1. ربط كامل للمواعيد مع الموكلين (client_id) والقضايا (related_case_id) وعرضها تفاعلياً في الكروت وكانبان.
 * 2. استبدال نوافذ التفاعل بـ SweetAlert2 مع دعم كامل لنوافذ Bootstrap Modals في app.html.
 * 3. تحميل آمن للمرفقات المستندية من Cloudflare R2 عبر API.downloadR2File بدلاً من الروابط المكشوفة.
 * 4. توافق كامل مع تقويم الهاتف (.ics) وتقويم جوجل والتوقيت الأردني الدقيق (+03:00).
 * ============================================================================
 */

// جسر طوارئ أمني لمنع خطأ TypeError وضمان توافق المرجعيات
if (window.AppCore && typeof window.loadAllData === 'function') {
    window.AppCore.loadAllData = window.loadAllData;
}

window.AppAgenda = {
    isKanban: false,

    // دالة مساعدة لتعقيم النصوص (XSS Protection)
    _escape: function(str) {
        if (window.AppCore && typeof window.AppCore.escapeHTML === 'function') {
            return window.AppCore.escapeHTML(str);
        }
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>'"]/g, tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag] || tag));
    },

    // دالة مساعدة للوصول الآمن للبيانات المركزية
    _getData: function() {
        if (window.AppCore && window.AppCore.globalData) return window.AppCore.globalData;
        if (typeof globalData !== 'undefined') return globalData;
        return { appointments: [], cases: [], clients: [], staff: [] };
    },

    // دالة مساعدة لإظهار التنبيهات
    _toast: function(msg, type = 'success') {
        if (window.AppCore && typeof window.AppCore.showToast === 'function') {
            window.AppCore.showToast(msg, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        } else if (typeof Swal !== 'undefined') {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: type === 'danger' ? 'error' : type,
                title: msg,
                showConfirmButton: false,
                timer: 3000
            });
        }
    },

    // دالة مساعدة لتحديث البيانات في الواجهة بعد أي تعديل
    _reloadData: async function() {
        if (typeof window.loadAllData === 'function') {
            await window.loadAllData();
        } else if (window.AppCore && typeof window.AppCore.loadAllData === 'function') {
            await window.AppCore.loadAllData();
        }
        if (typeof window.updateUrgentBriefing === 'function') {
            window.updateUrgentBriefing();
        }
    },

    toggleView: function() {
        this.isKanban = !this.isKanban;
        const btnToggle = document.getElementById('btn-toggle-agenda');

        if (this.isKanban) {
            document.getElementById('agenda-list')?.classList.add('d-none');
            document.getElementById('kanban-board')?.classList.remove('d-none');
            if (btnToggle) btnToggle.innerHTML = '<i class="fas fa-list me-1"></i> عرض القائمة';
            this.renderKanban();
        } else {
            document.getElementById('kanban-board')?.classList.add('d-none');
            document.getElementById('agenda-list')?.classList.remove('d-none');
            if (btnToggle) btnToggle.innerHTML = '<i class="fas fa-columns me-1"></i> لوحة كانبان (Kanban)';
            this.renderList();
        }
    },

    // الحل المعماري الصارم للتوقيت الأردني (+03:00)
    getLocalISOString: function(dateInputStr) {
        if (!dateInputStr) return new Date().toISOString();
        if (dateInputStr.length === 16 && dateInputStr.includes('T')) {
            return dateInputStr + ':00+03:00';
        }
        return new Date(dateInputStr).toISOString();
    },

    filterData: function() {
        const gData = this._getData();
        let appts = Array.isArray(gData.appointments) ? [...gData.appointments] : [];
        const searchVal = document.getElementById('search-agenda')?.value.toLowerCase().trim() || '';
        const dateVal = document.getElementById('filter-date-agenda')?.value;

        if (searchVal) {
            appts = appts.filter(a => {
                const clientObj = (gData.clients || []).find(c => String(c.id) === String(a.client_id));
                const caseObj = (gData.cases || []).find(cs => String(cs.id) === String(a.related_case_id || a.case_id));
                const clientName = clientObj?.full_name?.toLowerCase() || '';
                const caseNum = (caseObj?.case_internal_id || caseObj?.court_case_number || '').toLowerCase();

                return (a.title && a.title.toLowerCase().includes(searchVal)) ||
                       (a.notes && a.notes.toLowerCase().includes(searchVal)) ||
                       (a.status && a.status.toLowerCase().includes(searchVal)) ||
                       (a.type && a.type.toLowerCase().includes(searchVal)) ||
                       clientName.includes(searchVal) ||
                       caseNum.includes(searchVal);
            });
        }
        if (dateVal) {
            const d = new Date(dateVal).toLocaleDateString('en-CA');
            appts = appts.filter(a => a.appt_date && new Date(a.appt_date).toLocaleDateString('en-CA', { timeZone: 'Asia/Amman' }) === d);
        } else if (!searchVal) {
            appts = appts.filter(a => a.status === 'مجدول' || a.status === 'مؤجل');
        }
        return appts.sort((a, b) => new Date(a.appt_date) - new Date(b.appt_date));
    },

    render: function() {
        if (this.isKanban) this.renderKanban();
        else this.renderList();
    },

    downloadICS: function(apptId) {
        const gData = this._getData();
        const appt = (gData.appointments || []).find(a => String(a.id) === String(apptId));
        if (!appt) return this._toast('الموعد غير موجود', 'danger');

        const dObj = new Date(appt.appt_date);
        const pad = (n) => n < 10 ? '0' + n : n;
        const formatICSDate = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

        const startTime = formatICSDate(dObj);
        const endTime = formatICSDate(new Date(dObj.getTime() + (2 * 3600000)));

        const cleanTitle = appt.title ? this._escape(appt.title) : 'موعد/جلسة';
        const cleanNotes = appt.notes ? this._escape(appt.notes.replace(/\r?\n/g, ' ')) : 'تمت الجدولة عبر نظام موكّل.';

        const icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Moakkil ERP//AR',
            'CALSCALE:GREGORIAN',
            'BEGIN:VEVENT',
            `UID:moakkil-appt-${appt.id}@moakkil.erp`,
            `DTSTAMP:${formatICSDate(new Date())}`,
            `DTSTART:${startTime}`,
            `DTEND:${endTime}`,
            `SUMMARY:${cleanTitle}`,
            `DESCRIPTION:${cleanNotes}`,
            'STATUS:CONFIRMED',
            'BEGIN:VALARM',
            'TRIGGER:-PT30M',
            'ACTION:DISPLAY',
            'DESCRIPTION:تذكير بموعد قانوني - موكّل ERP',
            'END:VALARM',
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n');

        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.setAttribute('download', `Moakkil_${cleanTitle.replace(/\s+/g, '_')}.ics`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        this._toast('تم تحميل ملف التقويم (.ics) بنجاح', 'success');
    },

    // استخراج زر تحميل مرفق R2 الآمن من الملاحظات إن وجد
    _formatNotesWithR2Attachment: function(notesStr) {
        if (!notesStr) return { text: '', attachBtn: '' };
        let cleanText = notesStr;
        let r2Key = null;

        const r2TagMatch = cleanText.match(/\[R2_FILE:([^\]]+)\]/);
        if (r2TagMatch) {
            r2Key = r2TagMatch[1];
            cleanText = cleanText.replace(r2TagMatch[0], '').trim();
        } else {
            const legacyUrlMatch = cleanText.match(/📎 المرفق المستندي:\s*https?:\/\/[^\s]+\?key=([^\s&]+)/);
            if (legacyUrlMatch) {
                r2Key = decodeURIComponent(legacyUrlMatch[1]);
                cleanText = cleanText.replace(legacyUrlMatch[0], '').trim();
            }
        }

        const attachBtn = r2Key
            ? `<button type="button" class="btn btn-sm btn-outline-primary rounded-pill fw-bold mt-2 px-3 shadow-sm" onclick="event.stopPropagation(); API.downloadR2File('${this._escape(r2Key)}')"><i class="fas fa-paperclip me-1"></i> تحميل المرفق المشفر</button>`
            : '';

        return { text: cleanText, attachBtn };
    },

    renderList: function() {
        const list = document.getElementById('agenda-list');
        if (!list) return;
        const filtered = this.filterData();
        const gData = this._getData();

        if (filtered.length === 0) {
            list.innerHTML = '<div class="col-12 text-center p-5 text-muted bg-white border-0 rounded-4 shadow-sm fw-bold fade-in"><i class="fas fa-calendar-times fa-4x mb-3 opacity-25 text-navy"></i><br><span class="fs-5">الأجندة فارغة. لا توجد مواعيد أو مهام مطابقة.</span></div>';
            return;
        }

        list.innerHTML = filtered.map(a => {
            const dObj = new Date(a.appt_date);
            const isDone = (a.status === 'تم' || a.status === 'منجز');
            const isCanceled = (a.status === 'ملغي' || a.status === 'ملغي/مؤرشف');
            const isOverdue = (dObj < new Date() && !isDone && !isCanceled);
            const startTimeGcal = dObj.toISOString().replace(/-|:|\.\d+/g, '');
            const endTimeGcal = new Date(dObj.getTime() + 3600000).toISOString().replace(/-|:|\.\d+/g, '');
            const calUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(a.title || '')}&details=${encodeURIComponent(a.notes || '')}&dates=${startTimeGcal}/${endTimeGcal}`;

            let statusColor = isDone ? 'success' : (isCanceled ? 'danger' : (a.status === 'مؤجل' ? 'warning' : 'info'));
            if (isOverdue) statusColor = 'danger';

            let badgeHtml = `<span class="badge bg-${statusColor} bg-opacity-10 text-${statusColor} border border-${statusColor} border-opacity-25 px-3 py-1 rounded-pill shadow-sm">${isOverdue ? '<i class="fas fa-exclamation-circle me-1"></i> متأخر' : this._escape(a.status)}</span>`;

            // عرض الموكل والقضية المرتبطة والمحامين المكلفين
            const clientObj = (gData.clients || []).find(c => String(c.id) === String(a.client_id));
            const linkedCaseId = a.related_case_id || a.case_id;
            const caseObj = (gData.cases || []).find(cs => String(cs.id) === String(linkedCaseId));

            let relationBadges = '';
            if (clientObj) {
                relationBadges += `<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-2 py-1 me-1" style="cursor:pointer;" onclick="localStorage.setItem('current_client_id','${clientObj.id}'); window.location.href='client-details.html?id=${encodeURIComponent(clientObj.id)}'" title="فتح ملف الموكل"><i class="fas fa-user-tie me-1"></i> ${this._escape(clientObj.full_name)}</span>`;
            }
            if (caseObj) {
                relationBadges += `<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-2 py-1 me-1 font-monospace" style="cursor:pointer;" onclick="localStorage.setItem('current_case_id','${caseObj.id}'); window.location.href='case-details.html?id=${encodeURIComponent(caseObj.id)}'" title="فتح ملف القضية"><i class="fas fa-gavel me-1"></i> ${this._escape(caseObj.case_internal_id || caseObj.court_case_number || 'ملف قضية')}</span>`;
            }

            let staffBadges = '';
            if (Array.isArray(a.assigned_to) && a.assigned_to.length > 0) {
                staffBadges = '<div class="mt-2 d-flex flex-wrap gap-1">' + a.assigned_to.map(uid => {
                    const st = (gData.staff || []).find(s => String(s.id) === String(uid));
                    return st ? `<span class="badge bg-light text-dark border px-2 py-1" style="font-size:0.72rem;"><i class="fas fa-user-check text-secondary me-1"></i> ${this._escape(st.full_name.split(' ')[0])}</span>` : '';
                }).join('') + '</div>';
            }

            const parsedNotes = this._formatNotesWithR2Attachment(a.notes || a.completion_notes || '');

            let actionBtns = '';
            if (a.status === 'مجدول' || a.status === 'مؤجل') {
                actionBtns = `
                <div class="d-flex gap-2 mt-3 pt-3 border-top">
                    <button class="btn btn-sm btn-outline-success bg-white flex-grow-1 fw-bold rounded-pill shadow-sm py-2" onclick="window.AppAgenda.promptApptOutcome('${a.id}')"><i class="fas fa-check me-1"></i> إنجاز</button>
                    <button class="btn btn-sm btn-outline-warning bg-white flex-grow-1 fw-bold rounded-pill shadow-sm py-2 text-dark" onclick="window.AppAgenda.promptApptPostpone('${a.id}')"><i class="fas fa-clock me-1"></i> تأجيل</button>
                    <button class="btn btn-sm btn-outline-danger bg-white flex-grow-1 fw-bold rounded-pill shadow-sm py-2" onclick="window.AppAgenda.promptApptCancel('${a.id}')"><i class="fas fa-ban me-1"></i> إلغاء</button>
                </div>`;
            } else if (isDone) {
                actionBtns = `<div class="mt-3 pt-2 border-top text-success fw-bold small"><i class="fas fa-check-double me-1"></i> ${this._escape(parsedNotes.text || 'تم الإنجاز')}${parsedNotes.attachBtn ? `<div class="mt-1">${parsedNotes.attachBtn}</div>` : ''}</div>`;
            } else if (isCanceled) {
                actionBtns = `<div class="mt-3 pt-2 border-top text-danger fw-bold small"><i class="fas fa-ban me-1"></i> ${this._escape(parsedNotes.text || 'تم الإلغاء')}</div>`;
            }

            const dateStr = dObj.toLocaleDateString('ar-EG', { timeZone: 'Asia/Amman', month: 'short', day: 'numeric' });
            const timeStr = dObj.toLocaleTimeString('ar-EG', { timeZone: 'Asia/Amman', hour: '2-digit', minute: '2-digit' });

            return `
            <div class="col-md-6 col-lg-4 mb-3 fade-in">
                <div class="compact-card p-4 h-100 d-flex flex-column transition-hover bg-white shadow-sm rounded-4" style="border: 2px solid transparent;" onmouseover="this.style.borderColor='var(--navy)'" onmouseout="this.style.borderColor='transparent'">
                    <div class="d-flex justify-content-between align-items-start mb-3">
                        <div class="overflow-hidden pe-2">
                            <h5 class="fw-bold text-navy text-truncate mb-2 lh-base" title="${this._escape(a.title)}">${this._escape(a.title)}</h5>
                            <div class="d-flex flex-wrap gap-1 align-items-center">
                                <span class="badge bg-light text-muted border px-2 py-1"><i class="fas fa-tag me-1 text-accent"></i> ${this._escape(a.type)}</span>
                                ${relationBadges}
                            </div>
                            ${staffBadges}
                        </div>
                        ${badgeHtml}
                    </div>
                    
                    <div class="bg-light p-3 rounded-4 border-0 mb-2">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <i class="fas fa-calendar-day text-${statusColor} me-1 fs-6"></i> 
                                <span class="font-monospace fw-bold text-dark">${dateStr}</span>
                                <i class="fas fa-clock text-danger ms-3 me-1 fs-6"></i> 
                                <span class="font-monospace fw-bold text-dark">${timeStr}</span>
                            </div>
                            <div class="d-flex gap-1">
                                <button onclick="window.AppAgenda.downloadICS('${a.id}')" class="btn btn-sm btn-white border shadow-sm rounded-circle text-primary" style="width:32px; height:32px; padding:0;" title="حفظ في الهاتف (ICS)"><i class="fas fa-download"></i></button>
                                <a href="${calUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-white border shadow-sm rounded-circle text-danger" style="width:32px; height:32px; padding:0; line-height:30px;" title="إضافة لتقويم جوجل"><i class="fab fa-google"></i></a>
                            </div>
                        </div>
                    </div>
                    
                    <div class="mt-auto">${actionBtns}</div>
                </div>
            </div>`;
        }).join('');
    },

    renderKanban: function() {
        const board = document.getElementById('kanban-board');
        if (!board) return;
        const appts = this.filterData();
        const gData = this._getData();

        const cols = [
            { label: 'مجدولة وقادمة', filter: a => a.status === 'مجدول', color: 'info', icon: 'fa-list-ul' },
            { label: 'قيد التأجيل', filter: a => a.status === 'مؤجل', color: 'warning', icon: 'fa-pause-circle' },
            { label: 'مكتملة وملغاة', filter: a => (a.status === 'تم' || a.status === 'منجز' || a.status === 'ملغي'), color: 'success', icon: 'fa-check-circle' }
        ];

        board.innerHTML = cols.map(col => `
        <div class="kanban-col shadow-sm bg-white mx-1 d-flex flex-column rounded-4" style="width: 340px; border-top: 5px solid var(--bs-${col.color});">
            <h6 class="kanban-header text-navy border-bottom pb-3 mb-3 fw-bold d-flex justify-content-between align-items-center px-2 pt-2">
                <span><i class="fas ${col.icon} me-2 text-${col.color}"></i> ${col.label}</span>
                <span class="badge bg-${col.color} bg-opacity-10 text-${col.color} border border-${col.color} border-opacity-25 shadow-sm rounded-pill px-3">${appts.filter(col.filter).length}</span>
            </h6>
            <div class="d-flex flex-column gap-3 flex-grow-1 px-2 pb-2" style="overflow-y: auto; max-height: 65vh;">
                ${appts.filter(col.filter).map(a => {
                    let stColor = a.status === 'ملغي' ? 'danger' : col.color;
                    const dObj = new Date(a.appt_date);
                    const dtStr = dObj.toLocaleString('ar-EG', { timeZone: 'Asia/Amman', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                    const caseObj = (gData.cases || []).find(cs => String(cs.id) === String(a.related_case_id || a.case_id));
                    const caseBadge = caseObj ? `<span class="badge bg-primary bg-opacity-10 text-primary border font-monospace mt-1 d-inline-block"><i class="fas fa-gavel me-1"></i> ${this._escape(caseObj.case_internal_id)}</span>` : '';

                    return `
                    <div class="compact-card p-3 shadow-sm transition-hover bg-white rounded-4" style="border: 1px solid var(--border-color); border-right: 4px solid var(--bs-${stColor}) !important;">
                        <div class="d-flex justify-content-between align-items-start mb-1">
                            <b class="text-navy lh-base fs-6">${this._escape(a.title)}</b>
                        </div>
                        ${caseBadge}
                        <div class="text-muted fw-bold bg-light p-2 rounded-3 border-0 font-monospace mt-2 d-flex justify-content-between align-items-center" style="font-size: 0.8rem;">
                            <span><i class="fas fa-clock text-danger me-1"></i> ${dtStr}</span>
                        </div>
                        ${(a.status !== 'تم' && a.status !== 'منجز' && a.status !== 'ملغي') ? `
                        <div class="d-flex gap-2 mt-3 pt-2 border-top">
                            <button class="btn btn-sm btn-outline-success flex-grow-1 rounded-pill shadow-sm py-1 bg-white" onclick="window.AppAgenda.promptApptOutcome('${a.id}')"><i class="fas fa-check"></i></button>
                            <button class="btn btn-sm btn-outline-warning flex-grow-1 rounded-pill shadow-sm py-1 bg-white text-dark" onclick="window.AppAgenda.promptApptPostpone('${a.id}')"><i class="fas fa-clock"></i></button>
                            <button class="btn btn-sm btn-outline-danger flex-grow-1 rounded-pill shadow-sm py-1 bg-white" onclick="window.AppAgenda.promptApptCancel('${a.id}')"><i class="fas fa-ban"></i></button>
                        </div>` : `<div class="mt-2 text-${stColor} fw-bold small"><i class="fas fa-info-circle me-1"></i> ${this._escape(a.status)}</div>`}
                    </div>`;
                }).join('')}
            </div>
        </div>`).join('');
    },

    // تعبئة قوائم الموكلين والقضايا في نافذة جدولة الموعد (#apptModal)
    populateRelations: function() {
        const gData = this._getData();
        const clients = gData.clients || [];
        const cases = gData.cases || [];

        const clientSelect = document.getElementById('appt_client_id');
        const caseSelect = document.getElementById('appt_case_id');

        if (clientSelect) {
            const currentVal = clientSelect.value;
            clientSelect.innerHTML = '<option value="">-- موعد عام / غير مرتبط بموكل --</option>' +
                clients.map(c => `<option value="${c.id}">${this._escape(c.full_name || 'موكل')}</option>`).join('');
            clientSelect.value = currentVal;
        }

        if (caseSelect) {
            const currentCaseVal = caseSelect.value;
            caseSelect.innerHTML = '<option value="">-- اختر القضية المرتبطة --</option>' +
                cases.map(cs => `<option value="${cs.id}" data-client="${cs.client_id || ''}">${this._escape(cs.case_internal_id || cs.court_case_number || 'ملف')} - ${this._escape(cs.opponent_name || cs.case_type || '')}</option>`).join('');
            caseSelect.value = currentCaseVal;
        }
    },

    filterCasesByClient: function(clientId) {
        const gData = this._getData();
        const cases = gData.cases || [];
        const caseSelect = document.getElementById('appt_case_id');
        if (!caseSelect) return;

        const filtered = clientId ? cases.filter(cs => String(cs.client_id) === String(clientId)) : cases;
        caseSelect.innerHTML = '<option value="">-- اختر القضية المرتبطة --</option>' +
            filtered.map(cs => `<option value="${cs.id}" data-client="${cs.client_id || ''}">${this._escape(cs.case_internal_id || cs.court_case_number || 'ملف')} - ${this._escape(cs.opponent_name || cs.case_type || '')}</option>`).join('');
    },

    syncCheckboxes: function() {
        const select = document.getElementById('appt_assigned_to');
        if (!select) return;

        select.removeAttribute('required');

        // إذا كانت قائمة select فارغة، نملأها من بيانات الموظفين في globalData
        const gData = this._getData();
        if (select.options.length === 0 && Array.isArray(gData.staff) && gData.staff.length > 0) {
            select.innerHTML = gData.staff.map(s => `<option value="${s.id}">${this._escape(s.full_name)}</option>`).join('');
        }

        let container = document.getElementById('custom_staff_checkboxes');
        if (!container) {
            container = document.createElement('div');
            container.id = 'custom_staff_checkboxes';
            container.className = 'border border-2 rounded-4 p-3 bg-light shadow-sm mt-2';
            container.style.maxHeight = '180px';
            container.style.overflowY = 'auto';
            select.parentNode.insertBefore(container, select.nextSibling);
            select.style.display = 'none';
        }

        container.innerHTML = '<label class="form-label text-navy fw-bold d-block border-bottom pb-2 mb-3"><i class="fas fa-users-cog me-1 text-accent"></i> اختر الأشخاص المكلفين بالمهمة (تحديد متعدد):</label>';

        let hasOptions = false;
        Array.from(select.options).forEach(opt => {
            if (!opt.value) return;
            hasOptions = true;
            const div = document.createElement('div');
            div.className = 'form-check mb-2';
            div.innerHTML = `
                <input class="form-check-input assigned-staff-checkbox border-navy shadow-sm" type="checkbox" value="${opt.value}" id="staff_cb_${opt.value}">
                <label class="form-check-label text-dark fw-bold" for="staff_cb_${opt.value}" style="cursor:pointer;">
                    ${this._escape(opt.text)}
                </label>
            `;
            container.appendChild(div);
        });

        if (!hasOptions) {
            container.innerHTML += '<small class="text-danger fw-bold">لا يوجد موظفين مسجلين في النظام.</small>';
        }
    },

    save: async function(e) {
        e.preventDefault();
        const btn = document.querySelector('#apptForm button[type="submit"]');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
        }

        let assignedTo = [];
        const checkboxes = document.querySelectorAll('.assigned-staff-checkbox:checked');
        if (checkboxes.length > 0) {
            assignedTo = Array.from(checkboxes).map(cb => cb.value);
        } else {
            const apptSelect = document.getElementById('appt_assigned_to');
            if (apptSelect && apptSelect.selectedOptions.length > 0) {
                assignedTo = Array.from(apptSelect.selectedOptions).map(o => o.value);
            } else if (apptSelect && apptSelect.value) {
                assignedTo.push(apptSelect.value);
            }
        }

        const currentUser = (window.AppCore && window.AppCore.currentUser) || (typeof AUTH !== 'undefined' ? AUTH.checkSession() : null) || {};
        if (assignedTo.length === 0 && currentUser.id) {
            assignedTo.push(currentUser.id);
        }

        const gData = this._getData();
        let client_id = document.getElementById('appt_client_id')?.value?.trim() || null;
        let related_case_id = document.getElementById('appt_case_id')?.value?.trim() || null;

        // إذا اختار المحامي قضية ولم يختر الموكل يدوياً، نستنتج الموكل تلقائياً من القضية لضمان الترابط
        if (related_case_id && !client_id) {
            const matchedCase = (gData.cases || []).find(cs => String(cs.id) === String(related_case_id));
            if (matchedCase && matchedCase.client_id) {
                client_id = matchedCase.client_id;
            }
        }

        let rawTitle = document.getElementById('appt_title').value.trim();
        let finalTitle = rawTitle;

        if (client_id) {
            const clientObj = (gData.clients || []).find(c => String(c.id) === String(client_id));
            if (clientObj && !rawTitle.includes(clientObj.full_name)) {
                finalTitle = `${rawTitle} (الموكل: ${clientObj.full_name})`;
            }
        }

        const exactTime = this.getLocalISOString(document.getElementById('appt_date').value);
        const apptType = document.getElementById('appt_type').value;

        const data = {
            title: finalTitle,
            appt_date: exactTime,
            type: apptType,
            status: 'مجدول',
            client_id: client_id,
            related_case_id: related_case_id,
            assigned_to: assignedTo,
            notes: `نوع الموعد: ${apptType} \nتمت الجدولة بتاريخ: ${new Date().toLocaleDateString('ar-EG')}`,
            created_by: currentUser.id || null
        };

        try {
            const res = await API.addAppointment(data);
            if (res && !res.error) {
                if (window.AppCore && typeof window.AppCore.closeModal === 'function') {
                    window.AppCore.closeModal('apptModal');
                } else {
                    const mEl = document.getElementById('apptModal');
                    if (mEl) bootstrap.Modal.getInstance(mEl)?.hide();
                }

                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'success',
                        title: 'تمت الجدولة بنجاح',
                        text: res.offline ? 'تم الحفظ محلياً وسيتم المزامنة فور عودة الاتصال.' : 'تم ربط الموعد وإشعار فريق العمل.',
                        timer: 2000,
                        showConfirmButton: false
                    });
                } else {
                    this._toast('تمت الجدولة بنجاح', 'success');
                }

                e.target.reset();
                document.querySelectorAll('.assigned-staff-checkbox').forEach(cb => cb.checked = false);
                await this._reloadData();
            } else {
                throw new Error(res?.error || 'خطأ في السيرفر');
            }
        } catch (err) {
            console.error("Appointment Save Error: ", err);
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'error', title: 'فشل الجدولة', text: err.message });
            } else {
                this._toast('فشل الجدولة: ' + err.message, 'danger');
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-bell me-2"></i> جدولة وتفعيل التنبيه الآلي';
            }
        }
    },

    // توثيق إنجاز الموعد عبر SweetAlert2 مع رفع آمن للمرفق إلى R2
    promptApptOutcome: async function(apptId) {
        const gData = this._getData();
        const appt = (gData.appointments || []).find(a => String(a.id) === String(apptId));

        const { value: formValues } = await Swal.fire({
            title: 'إنجاز الموعد / الجلسة',
            html: `
                <textarea id="swal-outcome-notes" class="swal2-textarea" placeholder="أدخل ملخص مخرجات هذا الاجتماع أو قرار الجلسة..."></textarea>
                <div class="mt-3 text-start">
                    <label class="form-label text-navy fw-bold small"><i class="fas fa-paperclip me-1"></i> إرفاق محضر/مستند في الأرشيف السحابي R2 (اختياري)</label>
                    <input type="file" id="swal-outcome-file" class="form-control border-primary shadow-sm bg-light">
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-check-circle me-1"></i> تأكيد الإنجاز',
            cancelButtonText: 'إلغاء',
            confirmButtonColor: '#198754',
            preConfirm: () => {
                const notes = document.getElementById('swal-outcome-notes').value;
                const fileInput = document.getElementById('swal-outcome-file');
                return { notes, file: fileInput.files[0] };
            }
        });

        if (formValues) {
            Swal.fire({ title: 'جاري التوثيق...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
            try {
                let finalNotes = `النتيجة: ${formValues.notes || 'تم الإنجاز بنجاح.'}`;
                const targetClientId = appt?.client_id || 'general';
                const targetCaseId = appt?.related_case_id || appt?.case_id || 'general';

                if (formValues.file) {
                    const uploadRes = await API.uploadFileToR2(formValues.file, targetClientId, targetCaseId);
                    if (uploadRes && uploadRes.r2_key) {
                        finalNotes += `\n[R2_FILE:${uploadRes.r2_key}]`;
                        if (targetCaseId !== 'general' && typeof API.addFileRecord === 'function') {
                            await API.addFileRecord({
                                case_id: targetCaseId,
                                client_id: targetClientId !== 'general' ? targetClientId : null,
                                file_name: formValues.file.name,
                                file_type: formValues.file.type,
                                file_category: 'قرار',
                                file_url: uploadRes.r2_key,
                                drive_file_id: uploadRes.r2_key,
                                is_visible_to_client: false
                            });
                        }
                    }
                }

                await API.updateAppointment(apptId, {
                    status: 'تم',
                    notes: finalNotes,
                    completion_notes: formValues.notes || 'تم الإنجاز بنجاح.'
                });

                await Swal.fire('نجاح!', 'تم اعتماد إنجاز المهمة وإضافتها للسجل.', 'success');
                await this._reloadData();

            } catch (err) {
                Swal.fire('خطأ', 'حدث خطأ أثناء حفظ الإنجاز: ' + err.message, 'error');
            }
        }
    },

    promptApptPostpone: async function(apptId) {
        const { value: newDate } = await Swal.fire({
            title: 'تأجيل الموعد',
            html: '<input type="datetime-local" id="swal-postpone-date" class="swal2-input border-warning">',
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-clock me-1"></i> تأكيد التأجيل',
            cancelButtonText: 'إلغاء',
            confirmButtonColor: '#ffc107',
            preConfirm: () => {
                const dt = document.getElementById('swal-postpone-date').value;
                if (!dt) Swal.showValidationMessage('يجب اختيار تاريخ جديد للتأجيل');
                return dt;
            }
        });

        if (newDate) {
            Swal.fire({ title: 'جاري التأجيل...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
            try {
                const exactTime = this.getLocalISOString(newDate);
                await API.updateAppointment(apptId, { status: 'مؤجل', appt_date: exactTime });
                await Swal.fire('تم التأجيل', 'تم تأجيل الموعد للموعد الجديد بنجاح.', 'success');
                await this._reloadData();
            } catch (err) {
                Swal.fire('خطأ', 'حدث خطأ أثناء التأجيل.', 'error');
            }
        }
    },

    promptApptCancel: async function(apptId) {
        const { value: reason } = await Swal.fire({
            title: 'تأكيد الإلغاء القاطع',
            text: "هل أنت متأكد من رغبتك في إلغاء هذا الموعد؟",
            icon: 'warning',
            input: 'text',
            inputPlaceholder: 'الرجاء إدخال سبب الإلغاء (إلزامي للرقابة)',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#6c757d',
            confirmButtonText: '<i class="fas fa-trash"></i> نعم، إلغاء الموعد',
            cancelButtonText: 'تراجع',
            inputValidator: (value) => {
                if (!value || !value.trim()) return 'يجب إدخال سبب الإلغاء لتوثيقه في السجل الأمني';
            }
        });

        if (reason) {
            Swal.fire({ title: 'جاري الإلغاء...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
            try {
                await API.updateAppointment(apptId, { status: 'ملغي', notes: `تم الإلغاء. السبب: ${reason.trim()}` });
                await Swal.fire('تم الإلغاء', 'تم إلغاء الموعد بنجاح وتوثيق السبب في سجل الرقابة.', 'success');
                await this._reloadData();
            } catch (err) {
                Swal.fire('خطأ', 'حدث خطأ أثناء إلغاء الموعد.', 'error');
            }
        }
    },

    // دوال التوافق مع النوافذ المنبثقة (Bootstrap Modals Fallback) في app.html
    saveApptOutcome: async function(e) {
        if (e) e.preventDefault();
        const apptId = document.getElementById('outcome_appt_id')?.value;
        const notes = document.getElementById('outcome_text')?.value || '';
        const fileInput = document.getElementById('outcome_file');
        if (!apptId) return;

        try {
            let finalNotes = `النتيجة: ${notes}`;
            if (fileInput && fileInput.files && fileInput.files[0]) {
                const uploadRes = await API.uploadFileToR2(fileInput.file[0], 'general', 'general');
                if (uploadRes && uploadRes.r2_key) finalNotes += `\n[R2_FILE:${uploadRes.r2_key}]`;
            }
            await API.updateAppointment(apptId, { status: 'تم', notes: finalNotes, completion_notes: notes });
            if (window.AppCore && typeof window.AppCore.closeModal === 'function') window.AppCore.closeModal('apptOutcomeModal');
            this._toast('تم توثيق إنجاز المهمة بنجاح', 'success');
            await this._reloadData();
        } catch (err) {
            this._toast(err.message, 'danger');
        }
    },

    saveApptPostpone: async function(e) {
        if (e) e.preventDefault();
        const apptId = document.getElementById('postpone_appt_id')?.value;
        const newDate = document.getElementById('postpone_date')?.value;
        if (!apptId || !newDate) return;

        try {
            const exactTime = this.getLocalISOString(newDate);
            await API.updateAppointment(apptId, { status: 'مؤجل', appt_date: exactTime });
            if (window.AppCore && typeof window.AppCore.closeModal === 'function') window.AppCore.closeModal('apptPostponeModal');
            this._toast('تم تأجيل الموعد بنجاح', 'success');
            await this._reloadData();
        } catch (err) {
            this._toast(err.message, 'danger');
        }
    },

    saveCancel: async function(e) {
        if (e) e.preventDefault();
        const apptId = document.getElementById('cancel_appt_id')?.value;
        const reason = document.getElementById('cancel_reason')?.value;
        if (!apptId || !reason) return;

        try {
            await API.updateAppointment(apptId, { status: 'ملغي', notes: `تم الإلغاء. السبب: ${reason}` });
            if (window.AppCore && typeof window.AppCore.closeModal === 'function') window.AppCore.closeModal('apptCancelModal');
            this._toast('تم إلغاء الموعد وتوثيق السبب', 'success');
            await this._reloadData();
        } catch (err) {
            this._toast(err.message, 'danger');
        }
    }
};

// توافقية رجعية في حال تم استدعاء toggleClientSelectForAppt
window.toggleClientSelectForAppt = function() {
    window.AppAgenda.populateRelations();
};

// الروابط العامة (Global Bindings)
window.renderAgendaList = () => window.AppAgenda.renderList();
window.renderKanbanBoard = () => window.AppAgenda.renderKanban();
window.toggleAgendaView = () => window.AppAgenda.toggleView();
window.filterAgenda = () => window.AppAgenda.render();
window.saveAppointment = (e) => window.AppAgenda.save(e);
window.populateApptRelations = () => window.AppAgenda.populateRelations();
window.filterApptCasesByClient = (clientId) => window.AppAgenda.filterCasesByClient(clientId);

document.addEventListener('show.bs.modal', function(event) {
    if (event.target && event.target.id === 'apptModal') {
        window.AppAgenda.populateRelations();
        window.AppAgenda.syncCheckboxes();
    }
});