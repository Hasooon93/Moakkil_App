/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/app-agenda.js
 * الوصف: المحرك المتطور للأجندة، وإدارة المواعيد، الإنجاز المرفق، والإلغاء.
 * التحديث: 
 * 1. استبدال نوافذ التفاعل بالكامل بـ SweetAlert2 لتجربة مستخدم (Enterprise UX).
 * 2. دمج المصادقة والتحذيرات القاطعة عند إلغاء أو تغيير حالة المواعيد.
 * 3. تحسين المزامنة الحية لتحديث الواجهة بسلاسة (Smooth Rerender).
 * ============================================================================
 */

// 🛡️ جسر طوارئ أمني لمنع خطأ TypeError
if (window.AppCore && typeof window.loadAllData === 'function') {
    window.AppCore.loadAllData = window.loadAllData; 
}

window.AppAgenda = {
    isKanban: false,
    
    toggleView: function() {
        this.isKanban = !this.isKanban;
        const btnToggle = document.getElementById('btn-toggle-agenda');
        
        if(this.isKanban) { 
            document.getElementById('agenda-list').classList.add('d-none'); 
            document.getElementById('kanban-board').classList.remove('d-none'); 
            if(btnToggle) btnToggle.innerHTML = '<i class="fas fa-list me-1"></i> عرض القائمة';
            this.renderKanban(); 
        } else { 
            document.getElementById('kanban-board').classList.add('d-none'); 
            document.getElementById('agenda-list').classList.remove('d-none'); 
            if(btnToggle) btnToggle.innerHTML = '<i class="fas fa-columns me-1"></i> لوحة كانبان (Kanban)';
            this.renderList(); 
        }
    },

    // 🚀 الحل المعماري الصارم لمشكلة التوقيت:
    // نأخذ التاريخ والوقت من الحقل كما هو، ونلصق به توقيت الأردن (+03:00) إجبارياً، 
    // ثم نتركه للـ Backend ليحفظه بدقة.
    getLocalISOString: function(dateInputStr) {
        if (!dateInputStr) return new Date().toISOString();
        if (dateInputStr.length === 16 && dateInputStr.includes('T')) {
            // إجبار التوقيت الأردني (+03:00) لتجنب اختلافات وإزاحات المتصفح
            return dateInputStr + ':00+03:00'; 
        }
        return new Date(dateInputStr).toISOString();
    },

    filterData: function() {
        let appts = window.AppCore.globalData.appointments || [];
        const searchVal = document.getElementById('search-agenda')?.value.toLowerCase() || ''; 
        const dateVal = document.getElementById('filter-date-agenda')?.value;
        
        if (searchVal) {
            appts = appts.filter(a => 
                (a.title && a.title.toLowerCase().includes(searchVal)) || 
                (a.notes && a.notes.toLowerCase().includes(searchVal)) ||
                (a.status && a.status.toLowerCase().includes(searchVal)) ||
                (a.type && a.type.toLowerCase().includes(searchVal))
            );
        }
        if (dateVal) { 
            const d = new Date(dateVal).toLocaleDateString('en-CA'); 
            appts = appts.filter(a => new Date(a.appt_date).toLocaleDateString('en-CA') === d); 
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
        const appt = window.AppCore.globalData.appointments.find(a => a.id === apptId);
        if (!appt) return window.AppCore.showToast('الموعد غير موجود', 'danger');

        const dObj = new Date(appt.appt_date);
        const pad = (n) => n < 10 ? '0' + n : n;
        const formatICSDate = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

        const startTime = formatICSDate(dObj);
        const endTime = formatICSDate(new Date(dObj.getTime() + (2 * 3600000))); 
        
        const cleanTitle = appt.title ? window.AppCore.escapeHTML(appt.title) : 'موعد/جلسة';
        const cleanNotes = appt.notes ? window.AppCore.escapeHTML(appt.notes) : 'تمت الجدولة عبر نظام موكّل.';

        const icsContent = [
            'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moakkil ERP//AR', 'CALSCALE:GREGORIAN',
            'BEGIN:VEVENT', `DTSTART:${startTime}`, `DTEND:${endTime}`, `SUMMARY:${cleanTitle}`,
            `DESCRIPTION:${cleanNotes}`, 'STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR'
        ].join('\r\n');

        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.setAttribute('download', `Moakkil_${cleanTitle.replace(/\s+/g, '_')}.ics`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.AppCore.showToast('تم تحميل ملف التقويم بنجاح', 'success');
    },

    renderList: function() {
        const list = document.getElementById('agenda-list'); if (!list) return;
        const filtered = this.filterData();
        
        if (filtered.length === 0) {
            return list.innerHTML = '<div class="col-12 text-center p-5 text-muted bg-white border-0 rounded-4 shadow-sm fw-bold fade-in"><i class="fas fa-calendar-times fa-4x mb-3 opacity-25 text-navy"></i><br><span class="fs-5">الأجندة فارغة. لا توجد مواعيد أو مهام مطابقة.</span></div>';
        }
        
        list.innerHTML = filtered.map(a => {
            const dObj = new Date(a.appt_date);
            const isOverdue = (dObj < new Date() && a.status !== 'تم' && a.status !== 'ملغي');
            const startTimeGcal = dObj.toISOString().replace(/-|:|\.\d+/g, ''); 
            const endTimeGcal = new Date(dObj.getTime() + 3600000).toISOString().replace(/-|:|\.\d+/g, ''); 
            const calUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(a.title)}&details=${encodeURIComponent(a.notes || '')}&dates=${startTimeGcal}/${endTimeGcal}`;
            
            let statusColor = a.status === 'تم' ? 'success' : (a.status === 'ملغي' ? 'danger' : (a.status === 'مؤجل' ? 'warning' : 'info'));
            if(isOverdue && a.status !== 'تم' && a.status !== 'ملغي') statusColor = 'danger'; 

            let badgeHtml = `<span class="badge bg-${statusColor} bg-opacity-10 text-${statusColor} border border-${statusColor} border-opacity-25 px-3 py-1 rounded-pill shadow-sm">${isOverdue ? '<i class="fas fa-exclamation-circle me-1"></i> متأخر' : window.AppCore.escapeHTML(a.status)}</span>`;

            let actionBtns = '';
            if (a.status === 'مجدول' || a.status === 'مؤجل') {
                actionBtns = `
                <div class="d-flex gap-2 mt-3 pt-3 border-top">
                    <button class="btn btn-sm btn-outline-success bg-white flex-grow-1 fw-bold rounded-pill shadow-sm py-2" onclick="window.AppAgenda.promptApptOutcome('${a.id}')"><i class="fas fa-check me-1"></i> إنجاز</button>
                    <button class="btn btn-sm btn-outline-warning bg-white flex-grow-1 fw-bold rounded-pill shadow-sm py-2 text-dark" onclick="window.AppAgenda.promptApptPostpone('${a.id}')"><i class="fas fa-clock me-1"></i> تأجيل</button>
                    <button class="btn btn-sm btn-outline-danger bg-white flex-grow-1 fw-bold rounded-pill shadow-sm py-2" onclick="window.AppAgenda.promptApptCancel('${a.id}')"><i class="fas fa-ban me-1"></i> إلغاء</button>
                </div>`;
            } else if (a.status === 'تم') {
                actionBtns = `<div class="mt-3 pt-2 border-top text-success fw-bold small text-truncate"><i class="fas fa-check-double me-1"></i> ${window.AppCore.escapeHTML(a.notes || 'تم الإنجاز')}</div>`;
            } else if (a.status === 'ملغي') {
                actionBtns = `<div class="mt-3 pt-2 border-top text-danger fw-bold small text-truncate"><i class="fas fa-ban me-1"></i> ${window.AppCore.escapeHTML(a.notes || 'تم الإلغاء')}</div>`;
            }

            // عرض التوقيت بدقة (بتوقيت الأردن المخصص)
            const dateStr = dObj.toLocaleDateString('ar-EG', { timeZone: 'Asia/Amman', month: 'short', day: 'numeric' });
            const timeStr = dObj.toLocaleTimeString('ar-EG', { timeZone: 'Asia/Amman', hour: '2-digit', minute: '2-digit' });

            return `
            <div class="col-md-6 col-lg-4 mb-3 fade-in">
                <div class="compact-card p-4 h-100 d-flex flex-column transition-hover bg-white shadow-sm rounded-4" style="border: 2px solid transparent;" onmouseover="this.style.borderColor='var(--navy)'" onmouseout="this.style.borderColor='transparent'">
                    <div class="d-flex justify-content-between align-items-start mb-3">
                        <div class="overflow-hidden pe-2">
                            <h5 class="fw-bold text-navy text-truncate mb-1 lh-base" title="${window.AppCore.escapeHTML(a.title)}">${window.AppCore.escapeHTML(a.title)}</h5>
                            <span class="badge bg-light text-muted border px-2 py-1"><i class="fas fa-tag me-1 text-accent"></i> ${window.AppCore.escapeHTML(a.type)}</span>
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
                                <a href="${calUrl}" target="_blank" class="btn btn-sm btn-white border shadow-sm rounded-circle text-danger" style="width:32px; height:32px; padding:0; line-height:30px;" title="إضافة لتقويم جوجل"><i class="fab fa-google"></i></a>
                            </div>
                        </div>
                    </div>
                    
                    <div class="mt-auto">${actionBtns}</div>
                </div>
            </div>`;
        }).join('');
    },

    renderKanban: function() {
        const board = document.getElementById('kanban-board'); if(!board) return;
        const appts = this.filterData();

        const cols = [ 
            { label: 'مجدولة وقادمة', filter: a=>a.status==='مجدول', color: 'info', icon: 'fa-list-ul' }, 
            { label: 'قيد التأجيل', filter: a=>a.status==='مؤجل', color: 'warning', icon: 'fa-pause-circle' }, 
            { label: 'مكتملة وملغاة', filter: a=>(a.status==='تم' || a.status==='ملغي'), color: 'success', icon: 'fa-check-circle' } 
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

                    return `
                    <div class="compact-card p-3 shadow-sm transition-hover bg-white rounded-4" style="border: 1px solid var(--border-color); border-right: 4px solid var(--bs-${stColor}) !important;">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <b class="text-navy lh-base fs-6">${window.AppCore.escapeHTML(a.title)}</b>
                        </div>
                        <div class="text-muted fw-bold bg-light p-2 rounded-3 border-0 font-monospace mt-2 d-flex justify-content-between align-items-center" style="font-size: 0.8rem;">
                            <span><i class="fas fa-clock text-danger me-1"></i> ${dtStr}</span>
                        </div>
                        ${(a.status !== 'تم' && a.status !== 'ملغي') ? `
                        <div class="d-flex gap-2 mt-3 pt-2 border-top">
                            <button class="btn btn-sm btn-outline-success flex-grow-1 rounded-pill shadow-sm py-1 bg-white" onclick="window.AppAgenda.promptApptOutcome('${a.id}')"><i class="fas fa-check"></i></button>
                            <button class="btn btn-sm btn-outline-warning flex-grow-1 rounded-pill shadow-sm py-1 bg-white text-dark" onclick="window.AppAgenda.promptApptPostpone('${a.id}')"><i class="fas fa-clock"></i></button>
                            <button class="btn btn-sm btn-outline-danger flex-grow-1 rounded-pill shadow-sm py-1 bg-white" onclick="window.AppAgenda.promptApptCancel('${a.id}')"><i class="fas fa-ban"></i></button>
                        </div>` : `<div class="mt-2 text-${stColor} fw-bold small"><i class="fas fa-info-circle me-1"></i> ${a.status}</div>`}
                    </div>`;
                }).join('')}
            </div>
        </div>`).join('');
    },

    syncCheckboxes: function() {
        const select = document.getElementById('appt_assigned_to');
        if (!select) return;

        select.removeAttribute('required');
        
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
            if(!opt.value) return; 
            hasOptions = true;
            const div = document.createElement('div');
            div.className = 'form-check mb-2';
            div.innerHTML = `
                <input class="form-check-input assigned-staff-checkbox border-navy shadow-sm" type="checkbox" value="${opt.value}" id="staff_cb_${opt.value}">
                <label class="form-check-label text-dark fw-bold" for="staff_cb_${opt.value}" style="cursor:pointer;">
                    ${window.AppCore.escapeHTML(opt.text)}
                </label>
            `;
            container.appendChild(div);
        });

        if(!hasOptions) {
            container.innerHTML += '<small class="text-danger fw-bold">لا يوجد موظفين مسجلين في النظام.</small>';
        }
    },

    save: async function(e) {
        e.preventDefault(); 
        const btn = document.querySelector('#apptForm button[type="submit"]');
        if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...'; }

        let assignedTo = [];
        const checkboxes = document.querySelectorAll('.assigned-staff-checkbox:checked');
        if (checkboxes.length > 0) {
            assignedTo = Array.from(checkboxes).map(cb => cb.value);
        } else {
            const apptSelect = document.getElementById('appt_assigned_to');
            if (apptSelect && apptSelect.value) { assignedTo.push(apptSelect.value); }
        }
        
        if (assignedTo.length === 0 && window.AppCore.currentUser) assignedTo.push(window.AppCore.currentUser.id);
        
        let client_id = document.getElementById('appt_client_id')?.value;
        if (!client_id || client_id.trim() === '') client_id = null;

        let rawTitle = document.getElementById('appt_title').value;
        let finalTitle = rawTitle;
        let clientName = '';

        if (client_id) {
            const clientObj = window.AppCore.globalData.clients.find(c => c.id === client_id);
            if (clientObj) {
                clientName = clientObj.full_name;
                finalTitle = `${rawTitle} (مع الموكل: ${clientName})`;
            }
        }

        const exactTime = this.getLocalISOString(document.getElementById('appt_date').value);

        const data = { 
            title: finalTitle, 
            appt_date: exactTime, 
            type: document.getElementById('appt_type').value, 
            status: 'مجدول', 
            client_id: client_id, 
            assigned_to: assignedTo, 
            notes: `نوع الموعد: ${document.getElementById('appt_type').value} \nتمت الجدولة بتاريخ: ${new Date().toLocaleDateString('ar-EG')}`,
            created_by: window.AppCore.currentUser.id
        };
        
        try {
            const res = await API.addAppointment(data);
            if (res && !res.error) { 
                window.AppCore.closeModal('apptModal'); 
                
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'success',
                        title: 'تمت الجدولة بنجاح',
                        text: 'سيتم إشعار فريق العمل بالموعد.',
                        timer: 2000,
                        showConfirmButton: false
                    });
                } else {
                    window.AppCore.showToast('تمت الجدولة بنجاح', 'success'); 
                }
                
                e.target.reset(); 
                document.querySelectorAll('.assigned-staff-checkbox').forEach(cb => cb.checked = false);
                document.getElementById('appt_client_wrapper')?.classList.add('d-none');
                
                if(typeof window.loadAllData === 'function') await window.loadAllData();
                else if(window.AppCore && typeof window.AppCore.loadAllData === 'function') await window.AppCore.loadAllData();
                
            } else {
                throw new Error(res.error || 'خطأ في السيرفر');
            }
        } catch(err) { 
            console.error("Appointment Save Error: ", err);
            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'error', title: 'فشل الجدولة', text: err.message });
            } else {
                window.AppCore.showToast('فشل الجدولة: ' + err.message, 'danger'); 
            }
        } finally {
            if(btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-bell me-2"></i> جدولة وتفعيل التنبيه الآلي'; }
        }
    },

    // 🚀 تطبيق SweetAlert2 على عمليات تغيير حالة الأجندة
    promptApptOutcome: async function(apptId) {
        const { value: formValues } = await Swal.fire({
            title: 'إنجاز الموعد/المهمة',
            html: `
                <textarea id="swal-outcome-notes" class="swal2-textarea" placeholder="أدخل ملخص مخرجات هذا الاجتماع أو المهمة..."></textarea>
                <div class="mt-3 text-start">
                    <label class="form-label text-navy fw-bold small"><i class="fas fa-paperclip me-1"></i> إرفاق محضر/مستند (اختياري)</label>
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
            Swal.fire({ title: 'جاري التوثيق...', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });
            try {
                let finalNotes = `النتيجة: ${formValues.notes || 'تم الإنجاز بنجاح.'}`;
                if (formValues.file) {
                    const uploadRes = await API.uploadFileToR2(formValues.file, 'agenda', apptId);
                    if (uploadRes && uploadRes.success) {
                        const baseUrl = window.API_BASE_URL || (typeof CONFIG !== 'undefined' ? CONFIG.API_URL : '');
                        const fileUrl = `${baseUrl}/api/r2/download?key=${encodeURIComponent(uploadRes.r2_key)}`;
                        finalNotes += `\n\n📎 المرفق المستندي: ${fileUrl}`;
                    }
                }

                await API.updateAppointment(apptId, { status: 'تم', notes: finalNotes });
                
                await Swal.fire('نجاح!', 'تم اعتماد إنجاز المهمة وإضافتها للسجل.', 'success');
                if(typeof window.loadAllData === 'function') await window.loadAllData();
                else if(window.AppCore && typeof window.AppCore.loadAllData === 'function') await window.AppCore.loadAllData();

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
            Swal.fire({ title: 'جاري التأجيل...', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });
            try {
                const exactTime = this.getLocalISOString(newDate);
                await API.updateAppointment(apptId, { status: 'مؤجل', appt_date: exactTime });
                await Swal.fire('تم التأجيل', 'تم تأجيل الموعد للموعد الجديد بنجاح.', 'success');
                
                if(typeof window.loadAllData === 'function') await window.loadAllData();
                else if(window.AppCore && typeof window.AppCore.loadAllData === 'function') await window.AppCore.loadAllData();
                
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
            inputPlaceholder: 'الرجاء إدخال سبب الإلغاء (إلزامي)',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#6c757d',
            confirmButtonText: '<i class="fas fa-trash"></i> نعم، إلغاء الموعد',
            cancelButtonText: 'تراجع',
            inputValidator: (value) => {
                if (!value) return 'يجب إدخال سبب الإلغاء لتوثيقه في السجل الأمني';
            }
        });

        if (reason) {
            Swal.fire({ title: 'جاري الإلغاء...', allowOutsideClick: false, didOpen: () => { Swal.showLoading() } });
            try {
                await API.updateAppointment(apptId, { status: 'ملغي', notes: `تم الإلغاء. السبب: ${reason}` });
                await Swal.fire('تم الإلغاء', 'تم إلغاء الموعد بنجاح وتوثيق السبب.', 'success');
                
                if(typeof window.loadAllData === 'function') await window.loadAllData();
                else if(window.AppCore && typeof window.AppCore.loadAllData === 'function') await window.AppCore.loadAllData();
                
            } catch (err) {
                Swal.fire('خطأ', 'حدث خطأ أثناء إلغاء الموعد.', 'error');
            }
        }
    }
};

window.toggleClientSelectForAppt = function() {
    const type = document.getElementById('appt_type')?.value;
    let wrapper = document.getElementById('appt_client_wrapper');
    
    if (!wrapper) {
        const typeContainer = document.getElementById('appt_type').parentElement;
        wrapper = document.createElement('div');
        wrapper.id = 'appt_client_wrapper';
        wrapper.className = 'mb-4 d-none fade-in';
        
        const clients = window.AppCore.globalData.clients || [];
        const clientOpts = '<option value="">اختر الموكل (اختياري)...</option>' + 
                           clients.map(c => `<option value="${c.id}">${window.AppCore.escapeHTML(c.full_name)}</option>`).join('');

        wrapper.innerHTML = `
            <label class="form-label fw-bold" style="color: var(--navy);"><i class="fas fa-user-tie me-1 text-accent"></i> ارتباط بموكل (تنبيه الموكل)</label>
            <select class="form-select fw-bold bg-light shadow-sm border-0 py-2" id="appt_client_id">
                ${clientOpts}
            </select>
            <small class="text-muted fw-bold mt-2 d-block font-monospace"><i class="fas fa-paper-plane text-success me-1"></i> سيتم إشعار الموكل بموعد الاجتماع عبر تيليغرام.</small>
        `;
        typeContainer.parentNode.insertBefore(wrapper, typeContainer.nextSibling);
    }

    if (type === 'اجتماع موكل') {
        wrapper.classList.remove('d-none');
    } else { 
        wrapper.classList.add('d-none'); 
        const selectEl = document.getElementById('appt_client_id');
        if(selectEl) selectEl.value = ''; 
    }
};

// الروابط العامة (Global Bindings) - تم تحديثها لتكون قوية ومترابطة تماماً
window.renderAgendaList = () => window.AppAgenda.renderList();
window.renderKanbanBoard = () => window.AppAgenda.renderKanban();
window.toggleAgendaView = () => window.AppAgenda.toggleView();
window.filterAgenda = () => window.AppAgenda.render();
window.saveAppointment = (e) => window.AppAgenda.save(e);

document.addEventListener('DOMContentLoaded', () => {
    const typeSelect = document.getElementById('appt_type');
    if(typeSelect) typeSelect.addEventListener('change', window.toggleClientSelectForAppt);
});

document.addEventListener('show.bs.modal', function (event) {
    if(event.target.id === 'apptModal') {
        window.AppAgenda.syncCheckboxes();
    }
});