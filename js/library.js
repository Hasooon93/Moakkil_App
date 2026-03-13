// js/library.js - محرك المكتبة القانونية الذكية

let currentUser = JSON.parse(localStorage.getItem(CONFIG.USER_KEY));

window.onload = async () => {
    if (!localStorage.getItem(CONFIG.TOKEN_KEY) || !currentUser) {
        window.location.href = 'login.html';
        return;
    }

    // إظهار زر "إضافة نموذج" للمدراء والمحامين فقط (السكرتاريا لا يمكنهم إضافة نماذج رئيسية)
    if (currentUser.role === 'admin' || currentUser.role === 'مدير' || currentUser.role === 'محامي' || currentUser.role === 'lawyer') {
        document.getElementById('btn-add-template').style.display = 'block';
    }

    await loadLibrary();
};

async function loadLibrary() {
    try {
        // جلب الملفات التي تم حفظها كقوالب (is_template = true)
        const files = await fetchAPI('/api/files?is_template=eq.true&order=created_at.desc');
        
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
                else contracts.push(f); // إذا كان التصنيف غير معروف، نضعه في العقود افتراضياً
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
        container.innerHTML = `<div class="col-12"><div class="text-center p-4 text-muted small bg-white rounded shadow-sm border">لا يوجد ${emptyMsg} مرفوعة حالياً.</div></div>`;
        return;
    }

    container.innerHTML = items.map(f => {
        // تحديد الأيقونة بناءً على امتداد الملف
        const isWord = f.file_name.toLowerCase().includes('.doc');
        const icon = isWord ? 'fa-file-word text-info' : 'fa-file-pdf text-danger';

        return `
        <div class="col-12 col-md-6">
            <div class="card-custom template-card p-3 d-flex flex-row align-items-center justify-content-between bg-white shadow-sm border">
                <div class="d-flex align-items-center" style="width: 75%; overflow:hidden;">
                    <i class="fas ${icon} fs-2 me-3"></i>
                    <div class="text-truncate">
                        <h6 class="fw-bold mb-1 text-navy text-truncate" title="${f.file_name}">${f.file_name}</h6>
                        <small class="text-muted d-block"><i class="fas fa-calendar-alt me-1"></i> ${new Date(f.created_at).toLocaleDateString('ar-EG')}</small>
                    </div>
                </div>
                <a href="${f.drive_file_id}" target="_blank" class="btn btn-outline-navy btn-sm fw-bold rounded-pill px-3"><i class="fas fa-download"></i> فتح</a>
            </div>
        </div>
        `;
    }).join('');
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
                is_template: true // الإشارة التي تخبر قاعدة البيانات بأن هذا قالب للمكتبة وليس لقضية معينة
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

function openModal(id) { new bootstrap.Modal(document.getElementById(id)).show(); }
function closeModal(id) { 
    const m = bootstrap.Modal.getInstance(document.getElementById(id)); 
    if (m) m.hide(); 
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove()); 
}

function showAlert(message, type = 'info') {
    const box = document.getElementById('alertBox'); 
    if(!box) return;
    const alertId = 'alert-' + Date.now();
    let typeClass = type === 'success' ? 'alert-success-custom' : 'alert-danger-custom';
    box.insertAdjacentHTML('beforeend', `<div id="${alertId}" class="alert-custom ${typeClass}"><span>${message}</span></div>`);
    setTimeout(() => { const el = document.getElementById(alertId); if(el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); } }, 3000);
}