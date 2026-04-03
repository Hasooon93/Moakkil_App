// js/library.js - محرك المكتبة القانونية الذكية (تحديث شامل للاتصال المباشر و SweetAlert)

let currentUser = null;
let allTemplates = [];
let currentFilter = 'عقود'; // التبويب الافتراضي

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
    const currentToken = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
    
    if (!currentToken || !userStr) {
        window.location.href = 'login.html';
        return;
    }

    currentUser = JSON.parse(userStr);

    // إظهار زر "إضافة نموذج" للمدير والمحامي فقط (إخفاء للسكرتاريا)
    if (currentUser.role === 'admin' || currentUser.role === 'lawyer' || currentUser.role === 'مدير' || currentUser.role === 'محامي') {
        const btnAdd = document.getElementById('btn-add-template');
        if (btnAdd) btnAdd.style.display = 'block';
    }

    await loadTemplates();
};

async function loadTemplates() {
    try {
        // جلب الملفات المحددة كـ قوالب/نماذج (is_template = true)
        const files = await fetchAPI('/api/files?is_template=eq.true');
        allTemplates = Array.isArray(files) ? files : [];
        renderTemplates();
    } catch (error) {
        document.getElementById('templates-container').innerHTML = `
            <div class="col-12 text-center p-4 text-danger fw-bold bg-white rounded shadow-sm border">
                <i class="fas fa-exclamation-circle fa-2x mb-2"></i><br>
                حدث خطأ أثناء الاتصال بالخادم. يرجى التأكد من الإنترنت.
            </div>
        `;
    }
}

function filterTemplates(category) {
    currentFilter = category;
    document.getElementById('search-input').value = '';
    renderTemplates();
}

function searchTemplates() {
    renderTemplates();
}

function renderTemplates() {
    const container = document.getElementById('templates-container');
    const searchQuery = document.getElementById('search-input').value.toLowerCase();
    
    // فلترة حسب التبويب النشط وحسب البحث النصي
    const filtered = allTemplates.filter(t => {
        const matchCategory = t.file_category === currentFilter;
        const matchSearch = t.file_name && t.file_name.toLowerCase().includes(searchQuery);
        return matchCategory && matchSearch;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center p-5 text-muted bg-white rounded shadow-sm border">
                <i class="fas fa-folder-open fa-3x mb-3 opacity-50"></i>
                <br>لا توجد نماذج متوفرة في هذا القسم حالياً.
            </div>
        `;
        return;
    }

    // السماح بالحذف للمدير وصاحب الملف
    const canDelete = (fileOwnerId) => {
        return currentUser.role === 'admin' || currentUser.role === 'مدير' || currentUser.id === fileOwnerId;
    };

    container.innerHTML = filtered.map(t => {
        let icon = 'fa-file-alt text-secondary';
        if (t.file_type && t.file_type.includes('pdf')) icon = 'fa-file-pdf text-danger';
        else if (t.file_type && (t.file_type.includes('word') || t.file_type.includes('document'))) icon = 'fa-file-word text-primary';

        const delBtn = canDelete(t.added_by) ? 
            `<button class="btn btn-sm text-danger position-absolute top-0 start-0 m-2 bg-light rounded-circle shadow-sm" onclick="deleteRecord('${t.id}')" title="حذف النموذج"><i class="fas fa-trash"></i></button>` : '';

        return `
        <div class="col-12 col-md-6">
            <div class="template-card">
                ${delBtn}
                <div class="d-flex align-items-center">
                    <i class="fas ${icon} fa-3x me-3"></i>
                    <div class="flex-grow-1 text-truncate">
                        <h6 class="fw-bold text-navy mb-1 text-truncate" title="${escapeHTML(t.file_name)}">${escapeHTML(t.file_name)}</h6>
                        <small class="text-muted d-block"><i class="fas fa-clock me-1"></i> ${new Date(t.created_at).toLocaleDateString('ar-EG')}</small>
                    </div>
                </div>
                <div class="mt-3 text-end">
                    <a href="${escapeHTML(t.drive_file_id)}" target="_blank" class="btn btn-sm btn-outline-primary fw-bold shadow-sm px-3 rounded-pill">
                        <i class="fas fa-download me-1"></i> تحميل أو عرض
                    </a>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

async function uploadTemplate(event) {
    event.preventDefault();
    
    const titleInput = document.getElementById('tpl_title').value;
    const catInput = document.getElementById('tpl_category').value;
    const fileInput = document.getElementById('tpl_file');
    const btn = document.getElementById('btn_upload_tpl');

    if (!fileInput.files.length) {
        showAlert('يرجى اختيار ملف للرفع', 'warning');
        return;
    }

    const file = fileInput.files[0];
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري الرفع للأرشيف السحابي...';

    try {
        // 1. رفع الملف لجوجل درايف عبر دالة الـ API
        const driveRes = await API.uploadToDrive(file, `Library_${catInput}`);
        
        if (driveRes && driveRes.url) {
            // 2. تسجيل الملف في قاعدة البيانات كنماذج مكتبة (is_template = true)
            const payload = { 
                file_name: titleInput || file.name, 
                file_type: file.type, 
                file_category: catInput, 
                drive_file_id: driveRes.url, 
                is_template: true, // مهم جداً لتصنيفه في المكتبة
                case_id: null,
                client_id: null
            };

            const res = await API.addFileRecord(payload);
            
            if (res && !res.error) {
                closeModal('uploadModal');
                document.getElementById('uploadForm').reset();
                showAlert('تم حفظ النموذج في المكتبة بنجاح', 'success');
                await loadTemplates(); // تحديث العرض
            } else {
                throw new Error(res.error || "خطأ أثناء تسجيل الملف في قاعدة البيانات");
            }
        } else {
            throw new Error("فشل إرجاع رابط الملف من الخادم السحابي");
        }
    } catch (err) { 
        showAlert(err.message || "حدث خطأ غير متوقع أثناء الرفع", 'error'); 
    } finally { 
        btn.disabled = false; 
        btn.innerHTML = '<i class="fas fa-save me-1"></i> رفع وأرشفة النموذج'; 
    }
}

async function deleteRecord(id) {
    const confirmResult = await Swal.fire({
        title: 'هل أنت متأكد؟',
        text: "لن تتمكن من استعادة هذا النموذج!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء'
    });

    if (!confirmResult.isConfirmed) return;

    try {
        const res = await API.deleteFile(id);
        if(res && !res.error) {
            showAlert('تم حذف النموذج بنجاح', 'success');
            await loadTemplates();
        } else {
            showAlert(res.error || 'فشل الحذف', 'error');
        }
    } catch(e) {
        showAlert('حدث خطأ أثناء الاتصال بالخادم', 'error');
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
        
        document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
    }
}

function showAlert(message, type = 'success') {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: type === 'danger' ? 'error' : (type === 'info' ? 'info' : type),
            title: escapeHTML(message),
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true
        });
    } else {
        alert(message);
    }
}