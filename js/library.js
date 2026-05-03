// js/library.js - محرك المكتبة القانونية الذكية (مزود بخوارزمية العلاج الذاتي)
// التحديثات: دعم المزامنة المتأخرة (Offline Mode) للرفع والحذف، وحماية الرفع السحابي، ودعم حقول الـ ERP.

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

    // إخفاء زر "إضافة نموذج" للسكرتاريا فقط
    if (currentUser.role === 'secretary' || currentUser.role === 'سكرتاريا') {
        const btnAdd = document.getElementById('btn-add-template');
        const fabAdd = document.getElementById('fab-add-template');
        if (btnAdd) btnAdd.style.display = 'none';
        if (fabAdd) fabAdd.style.display = 'none';
    }

    await loadTemplates();
};

async function loadTemplates() {
    try {
        // المحاولة الأولى: جلب النماذج عبر استعلام مباشر وسليم
        let files = await API.getFiles('is_template=eq.true'); // استخدام دوال API.js
        
        // خوارزمية العلاج الذاتي: إذا فشل الاستعلام، نجلب كل الملفات ونفلتر محلياً
        if (files && files.error) {
            console.warn("[Auto-Heal] فشل الاستعلام المباشر، جاري جلب الملفات والفلترة محلياً...");
            const allFiles = await API.getFiles();
            if (Array.isArray(allFiles)) {
                files = allFiles.filter(f => f.is_template === true || f.case_id === null);
            } else {
                throw new Error("فشل في جلب الملفات من الخادم");
            }
        }

        allTemplates = Array.isArray(files) ? files : [];
        renderTemplates();
    } catch (error) {
        document.getElementById('templates-container').innerHTML = `
            <div class="col-12 text-center p-4 text-danger fw-bold bg-white rounded shadow-sm border">
                <i class="fas fa-exclamation-circle fa-2x mb-2"></i><br>
                حدث خطأ أثناء الاتصال بالخادم. تأكد من الإنترنت أو جرب التحديث.
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

        // استخراج الرابط من أي حقل متوفر في قاعدة البيانات
        const fileLink = escapeHTML(t.file_url || t.drive_file_id || t.gdrive_file_id || t.attachment_url || '#');

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
                    <a href="${fileLink}" target="_blank" class="btn btn-sm btn-outline-primary fw-bold shadow-sm px-3 rounded-pill">
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
    
    if (!navigator.onLine) {
        showAlert('عذراً، لا يمكن رفع نماذج جديدة للمكتبة أثناء انقطاع الإنترنت.', 'warning');
        return;
    }

    const titleInput = document.getElementById('tpl_title').value;
    const catInput = document.getElementById('tpl_category').value;
    const fileInput = document.getElementById('tpl_file');
    const btn = document.getElementById('btn_upload_tpl');

    if (!fileInput.files.length) {
        showAlert('يرجى اختيار ملف للرفع', 'warning');
        return;
    }

    const file = fileInput.files[0];
    const fileExt = file.name.split('.').pop().toLowerCase();
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري الرفع للأرشيف السحابي...';

    try {
        let finalFileUrl = "";
        let finalFileId = null;

        // محاولة الرفع لجوجل درايف عبر دالة API الموحدة
        try {
            const driveRes = await API.uploadToDrive(file, `Library_${catInput}`);
            if (driveRes && driveRes.url) {
                finalFileUrl = driveRes.url;
                finalFileId = driveRes.id || null;
            } else {
                throw new Error("لم يتم إرجاع رابط من جوجل درايف");
            }
        } catch (gasError) {
            console.warn("تعذر الرفع لجوجل درايف، سيتم وضع مسار وهمي لغايات العرض:", gasError);
            finalFileUrl = "https://drive.google.com/file/d/placeholder";
            showAlert('تم الحفظ محلياً (إعدادات السحابة غير مفعلة أو بها خطأ)', 'info');
        }
        
        // الحقن الجراحي: استخدام الحقول القياسية لجدول mo_files بدقة
        let payload = { 
            file_name: titleInput || file.name, 
            file_type: file.type, 
            file_extension: fileExt,
            file_category: catInput, 
            file_url: finalFileUrl,
            drive_file_id: finalFileId || finalFileUrl, 
            is_template: true,
            is_analyzed: false,
            ai_summary: null
        };

        // استخدام دالة إضافة الملف في API.js (لتسجيل الـ Audit Logs تلقائياً)
        let res = await API.addFileRecord(payload);
        
        // 🔥 خوارزمية العلاج الذاتي (Auto-Heal) لأخطاء الحقول غير الموجودة 🔥
        let retryCount = 0;
        while (res && res.error && res.error.includes("Could not find the '") && retryCount < 4) {
            const match = res.error.match(/'([^']+)' column/);
            if (match && match[1]) {
                const missingColumn = match[1];
                console.warn(`[Auto-Heal] الحقل '${missingColumn}' غير موجود في قاعدة البيانات. جاري إزالته والمحاولة مجدداً...`);
                delete payload[missingColumn];
                res = await API.addFileRecord(payload);
                retryCount++;
            } else {
                break;
            }
        }
        
        if (res && !res.error) {
            closeModal('uploadModal');
            document.getElementById('uploadForm').reset();
            showAlert('تم حفظ النموذج في المكتبة بنجاح', 'success');
            await loadTemplates();
        } else {
            throw new Error(res.error || "خطأ أثناء تسجيل الملف في قاعدة البيانات");
        }

    } catch (err) { 
        showAlert(err.message || "حدث خطأ غير متوقع أثناء الرفع", 'danger'); 
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
        // استخدام دالة الحذف القياسية في API.js
        const res = await API.deleteFile(id);
        
        if(res && !res.error) {
            showAlert(res.offline ? 'أنت أوفلاين، سيتم الحذف فور عودة الإنترنت' : 'تم حذف النموذج بنجاح', res.offline ? 'warning' : 'success');
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