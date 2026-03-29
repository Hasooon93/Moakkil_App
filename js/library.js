// js/library.js - محرك المكتبة القانونية الذكية (تحديث شامل للاتصال المباشر و SweetAlert)

let currentUser = null;
let currentToken = null;

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
    const userStr = localStorage.getItem(CONFIG.USER_KEY || 'moakkil_user');
    currentToken = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
    
    if (!currentToken || !userStr) {
        window.location.href = 'login.html';
        return;
    }

    currentUser = JSON.parse(userStr);

    // إظهار زر "إضافة نموذج" للمدير والمحامي فقط (إخفاء للسكرتاريا)
    if (currentUser.role === 'admin' || currentUser.role === 'lawyer') {
        const btnAdd = document.getElementById('btn-add-template');
        if (btnAdd) btnAdd.style.display = 'block';
    }

    await loadLibrary();
};

// دالة جلب الملفات من الخادم مباشرة مع تمرير التوكن الصريح
async function loadLibrary() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/api/files?is_template=true`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            }
        });

        if (!response.ok) throw new Error("فشل الاتصال بالخادم لجلب المكتبة");
        
        const files = await response.json();
        
        const contracts = [];
        const poas = [];
        const pleadings = [];
        const laws = [];

        if (Array.isArray(files) && files.length > 0) {
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
        showAlert('حدث خطأ أثناء جلب ملفات المكتبة، يرجى التحقق من اتصالك بالإنترنت.', 'error');
    }
}

// رسم بطاقات الملفات في الواجهة
function renderCategory(elementId, items, emptyMsg) {
    const container = document.getElementById(elementId);
    if (items.length === 0) {
        container.innerHTML = `<div class="col-12"><div class="text-center p-5 text-muted small bg-white rounded shadow-sm border"><i class="fas fa-folder-open fa-2x mb-3 opacity-50"></i><br>لا يوجد ${escapeHTML(emptyMsg)} مرفوعة حالياً في مكتبتك.</div></div>`;
        return;
    }

    // السماح بالحذف للمدير والمحامي فقط
    const canDelete = (currentUser && (currentUser.role === 'admin' || currentUser.role === 'lawyer'));

    container.innerHTML = items.map(f => {
        // تحديد الأيقونة بناءً على امتداد/نوع الملف
        const isWord = f.file_name.toLowerCase().includes('.doc');
        const icon = isWord ? 'fa-file-word text-info' : 'fa-file-pdf text-danger';
        
        const delBtn = canDelete ? `<button class="btn btn-sm btn-light text-danger shadow-sm px-2 py-1 position-absolute top-0 end-0 m-2 rounded-circle" onclick="deleteTemplate('${f.id}')" title="حذف النموذج"><i class="fas fa-trash"></i></button>` : '';

        return `
        <div class="col-12 col-md-6">
            <div class="card-custom template-card p-3 bg-white shadow-sm position-relative">
                ${delBtn}
                <div class="d-flex flex-row align-items-center justify-content-between mt-2">
                    <div class="d-flex align-items-center" style="width: 70%; overflow:hidden;">
                        <div class="bg-light p-3 rounded-circle me-3 text-center" style="width: 50px; height: 50px; display: flex; align-items: center; justify-content: center;">
                            <i class="fas ${icon} fs-4"></i>
                        </div>
                        <div class="text-truncate">
                            <h6 class="fw-bold mb-1 text-navy text-truncate" title="${escapeHTML(f.file_name)}">${escapeHTML(f.file_name)}</h6>
                            <small class="text-muted d-block"><i class="fas fa-calendar-alt me-1"></i> ${escapeHTML(new Date(f.created_at).toLocaleDateString('ar-EG'))}</small>
                        </div>
                    </div>
                    <a href="${escapeHTML(f.drive_file_id)}" target="_blank" class="btn btn-outline-navy btn-sm fw-bold rounded-pill px-3 shadow-sm"><i class="fas fa-cloud-download-alt me-1"></i> تحميل</a>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

// دالة حذف النموذج مع الاتصال المباشر بالخادم
async function deleteTemplate(id) {
    const confirmResult = await Swal.fire({
        title: 'هل أنت متأكد؟',
        text: "سيتم حذف هذا النموذج من المكتبة نهائياً!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'نعم، احذفه!',
        cancelButtonText: 'إلغاء'
    });

    if (!confirmResult.isConfirmed) return;

    try {
        const response = await fetch(`${CONFIG.API_URL}/api/files?id=eq.${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            }
        });

        if (response.ok) {
            showAlert('تم حذف النموذج بنجاح', 'success');
            await loadLibrary(); // تحديث الواجهة
        } else {
            throw new Error("فشل الحذف من الخادم");
        }
    } catch(e) {
        showAlert('حدث خطأ أثناء الحذف، تأكد من صلاحياتك.', 'error');
    }
}

// دالة حفظ ورفع النموذج (مربوطة بـ Google Apps Script ثم الخادم السحابي)
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
        // 1. رفع الملف لـ Google Drive عبر API (الموجودة في api.js)
        const driveRes = await API.uploadToDrive(file, 'مكتبة_موكّل');
        
        if(driveRes && driveRes.url) {
            const payload = {
                file_name: titleInput || file.name,
                file_type: file.type,
                file_category: catInput,
                drive_file_id: driveRes.url,
                is_template: true 
            };
            
            // 2. إرسال البيانات لقاعدة البيانات عبر طلب مباشر موثق
            const response = await fetch(`${CONFIG.API_URL}/api/files`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify(payload)
            });
            
            if(response.ok) {
                closeModal('uploadTemplateModal');
                document.getElementById('templateForm').reset();
                showAlert('تم أرشفة النموذج في المكتبة بنجاح', 'success');
                await loadLibrary(); // تحديث القائمة
            } else {
                const errData = await response.json();
                throw new Error(errData.error || "فشل تسجيل الملف في قاعدة البيانات");
            }
        } else {
             throw new Error("فشل رفع الملف إلى Google Drive");
        }
    } catch (err) { 
        showAlert(err.message || "حدث خطأ غير متوقع أثناء الرفع", 'error'); 
    } finally { 
        btn.disabled = false; 
        btn.innerHTML = '<i class="fas fa-save me-1"></i> رفع وأرشفة النموذج'; 
    }
}

// -----------------------------------------------------------------
// دوال النوافذ المنبثقة (Modals & Alerts) الموحدة
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
        
        // تنظيف الخلفية السوداء لضمان عدم التعليق
        document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
    }
}

// دالة إظهار التنبيهات باستخدام SweetAlert2 (و Fallback كإجراء احتياطي)
function showAlert(message, type = 'success') {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: type,
            title: escapeHTML(message),
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true
        });
    } else {
        alert(message);
    }
}