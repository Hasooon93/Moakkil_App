// js/library.js - محرك المكتبة القانونية الذكية (محمي ضد XSS ويدعم الحذف)

let currentUser = null;

// دالة الحماية من ثغرات الحقن (XSS Sanitizer)
const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
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
    const userStr = localStorage.getItem(CONFIG.USER_KEY);
    if (!localStorage.getItem(CONFIG.TOKEN_KEY) || !userStr) {
        window.location.href = 'login.html';
        return;
    }

    currentUser = JSON.parse(userStr);

    // إخفاء زر "إضافة نموذج" للسكرتاريا فقط (المدير والمحامي يمكنهم الرفع دائماً)
    if (currentUser.role === 'secretary' || currentUser.role === 'سكرتاريا') {
        const btnAdd = document.getElementById('btn-add-template');
        if (btnAdd) btnAdd.style.display = 'none';
    }

    await loadLibrary();
};

async function loadLibrary() {
    try {
        // جلب الملفات التي تم حفظها كقوالب (is_template = true)
        // نستخدم fetchAPI مباشرة لأنها مجهزة بتمرير التوكن في api.js
        const files = await fetchAPI('/api/files?is_template=true');
        
        const contracts = [];
        const poas = [];
        const pleadings = [];
        const laws = [];

        if (files && files.length > 0) {
            files.forEach(f => {
                if (f.file_category === 'عقود') contracts.push(f);
                else if (f.file_category === 'وكالات') poas.push(f);
                else if (f.file_category === 'لوائح') pleadings.push(f);
                else if (f.file_category === 'قوانين') laws.push(f);
                else contracts.push(f); 
            });
        }

        renderCategory('list-contracts', contracts, 'عقود جاهزة');
        renderCategory('list-poa', poas, 'نماذج وكالات');
        renderCategory('list-pleadings', pleadings, 'لوائح ومذكرات');
        renderCategory('list-laws', laws, 'نصوص قانونية');

    } catch (error) {
        showAlert('حدث خطأ أثناء جلب ملفات المكتبة', 'danger');
    }
}

function renderCategory(elementId, items, emptyMsg) {
    const container = document.getElementById(elementId);
    if (items.length === 0) {
        container.innerHTML = `<div class="col-12"><div class="text-center p-4 text-muted small bg-white rounded shadow-sm border">لا يوجد ${escapeHTML(emptyMsg)} مرفوعة حالياً.</div></div>`;
        return;
    }

    // السماح بالحذف للمدير والمحامي فقط
    const canDelete = (currentUser && (currentUser.role === 'admin' || currentUser.role === 'مدير' || currentUser.role === 'lawyer' || currentUser.role === 'محامي'));

    container.innerHTML = items.map(f => {
        // تحديد الأيقونة بناءً على امتداد الملف
        const isWord = f.file_name.toLowerCase().includes('.doc');
        const icon = isWord ? 'fa-file-word text-info' : 'fa-file-pdf text-danger';
        
        const delBtn = canDelete ? `<button class="btn btn-sm text-danger px-2 py-0" onclick="deleteTemplate('${f.id}')" title="حذف النموذج"><i class="fas fa-trash"></i></button>` : '';

        return `
        <div class="col-12 col-md-6">
            <div class="card-custom template-card p-3 bg-white shadow-sm border position-relative">
                <div class="position-absolute top-0 end-0 m-2">
                    ${delBtn}
                </div>
                <div class="d-flex flex-row align-items-center justify-content-between mt-2">
                    <div class="d-flex align-items-center" style="width: 75%; overflow:hidden;">
                        <i class="fas ${icon} fs-2 me-3"></i>
                        <div class="text-truncate">
                            <h6 class="fw-bold mb-1 text-navy text-truncate" title="${escapeHTML(f.file_name)}">${escapeHTML(f.file_name)}</h6>
                            <small class="text-muted d-block"><i class="fas fa-calendar-alt me-1"></i> ${escapeHTML(new Date(f.created_at).toLocaleDateString('ar-EG'))}</small>
                        </div>
                    </div>
                    <a href="${escapeHTML(f.drive_file_id)}" target="_blank" class="btn btn-outline-navy btn-sm fw-bold rounded-pill px-3"><i class="fas fa-download"></i> فتح</a>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

async function deleteTemplate(id) {
    if(!confirm('هل أنت متأكد من حذف هذا النموذج نهائياً؟')) return;
    try {
        await fetchAPI(`/api/files?id=eq.${id}`, 'DELETE');
        showAlert('تم حذف النموذج بنجاح', 'success');
        await loadLibrary();
    } catch(e) {
        showAlert('حدث خطأ أثناء الحذف', 'danger');
    }
}

async function saveTemplate(event) {
    event.preventDefault();
    const fileInput = document.getElementById('tpl_file');
    const titleInput = document.getElementById('tpl_title').value;
    const catInput = document.getElementById('tpl_category').value;
    const btn = document.getElementById('btn_upload_tpl');

    if (!fileInput.files.length) return;
    const file = fileInput.files[0];
    
    btn.disabled = true; 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري الرفع للسحابة...';

    try {
        // رفع الملف لـ Google Drive تحت مجلد "مكتبة" عام
        const driveRes = await API.uploadToDrive(file, 'مكتبة_موكّل');
        
        if(driveRes && driveRes.url) {
            const payload = {
                file_name: titleInput || file.name,
                file_type: file.type,
                file_category: catInput,
                drive_file_id: driveRes.url,
                is_template: true 
            };
            
            const dbRes = await API.addFileRecord(payload);
            
            if(dbRes && !dbRes.error) {
                closeModal('uploadTemplateModal');
                document.getElementById('templateForm').reset();
                showAlert('تم إضافة النموذج للمكتبة بنجاح', 'success');
                await loadLibrary(); // تحديث القائمة
            } else {
                showAlert(dbRes.error || "حدث خطأ أثناء الحفظ في قاعدة البيانات", 'danger');
            }
        }
    } catch (err) { 
        showAlert("فشل الرفع: " + err.message, 'danger'); 
    } finally { 
        btn.disabled = false; 
        btn.innerHTML = '<i class="fas fa-cloud-upload-alt me-1"></i> رفع وأرشفة النموذج'; 
    }
}

// -----------------------------------------------------------------
// دوال النوافذ المنبثقة المحسنة لتجنب أخطاء (backdrop)
// -----------------------------------------------------------------
function openModal(id) { 
    const el = document.getElementById(id);
    if(el) {
        const m = new bootstrap.Modal(el);
        m.show();
    }
}

function closeModal(id) { 
    const el = document.getElementById(id);
    if(el) {
        const m = bootstrap.Modal.getInstance(el);
        if(m) m.hide();
        
        // إزالة الخلفية السوداء يدوياً لضمان عدم تعليق الشاشة
        document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
    }
}

function showAlert(message, type = 'info') {
    const box = document.getElementById('alertBox'); 
    if(!box) return;
    const alertId = 'alert-' + Date.now();
    let typeClass = type === 'success' ? 'alert-success-custom' : 'alert-danger-custom';
    box.insertAdjacentHTML('beforeend', `<div id="${alertId}" class="alert-custom ${typeClass}"><span>${escapeHTML(message)}</span></div>`);
    setTimeout(() => { const el = document.getElementById(alertId); if(el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); } }, 3000);
}