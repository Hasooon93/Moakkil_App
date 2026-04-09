// js/history.js - محرك سجل الرقابة والمقارنة الذكية (Time Machine)

let auditLogs = [];
let diffModalInstance = null;

// قاموس لترجمة أسماء الجداول لتجربة مستخدم أفضل
const tableNamesAR = {
    'mo_cases': 'القضايا',
    'mo_clients': 'الموكلين',
    'mo_installments': 'الدفعات المالية',
    'mo_expenses': 'المصاريف',
    'mo_users': 'فريق العمل (HR)',
    'mo_appointments': 'المواعيد والمهام',
    'mo_case_updates': 'تحديثات القضايا',
    'mo_files': 'أرشيف الملفات',
    'mo_firms': 'إعدادات المكتب',
    'mo_subscriptions': 'الاشتراكات'
};

document.addEventListener('DOMContentLoaded', async () => {
    // التحقق من الصلاحيات (مسموح فقط للمدير)
    const userStr = localStorage.getItem(CONFIG.USER_KEY);
    if (!userStr) {
        window.location.href = 'login.html';
        return;
    }
    const user = JSON.parse(userStr);
    if (user.role !== 'admin' && user.role !== 'super_admin') {
        Swal.fire({
            icon: 'error',
            title: 'مرفوض',
            text: 'صلاحية الوصول لسجل الرقابة مقتصرة على مدراء المكتب فقط لدواعي أمنية.'
        }).then(() => {
            window.location.href = 'app.html';
        });
        return;
    }

    // تطبيق ألوان المكتب إذا كانت موجودة
    const settings = JSON.parse(localStorage.getItem('firm_settings'));
    if (settings) {
        const root = document.documentElement;
        if (settings.primary_color) root.style.setProperty('--navy', settings.primary_color);
        if (settings.accent_color) root.style.setProperty('--accent', settings.accent_color);
    }

    diffModalInstance = new bootstrap.Modal(document.getElementById('diffModal'));
    await loadAuditLogs();
});

async function loadAuditLogs() {
    const actionFilter = document.getElementById('filterAction').value;
    const moduleFilter = document.getElementById('filterModule').value;
    
    document.getElementById('loadingIndicator').style.display = 'block';
    document.getElementById('auditContainer').style.display = 'none';
    document.getElementById('auditContainer').innerHTML = '';

    try {
        // سحب السجلات مع اسم من قام بالحركة
        let query = `/api/history?select=*,mo_users(full_name,role)`;
        if (actionFilter) query += `&action_type=eq.${actionFilter}`;
        if (moduleFilter) query += `&entity_type=eq.${moduleFilter}`;
        query += `&order=created_at.desc&limit=100`;

        const logs = await API.get(query);
        auditLogs = logs || [];
        
        document.getElementById('loadingIndicator').style.display = 'none';
        document.getElementById('auditContainer').style.display = 'flex';

        if (auditLogs.length === 0) {
            document.getElementById('auditContainer').innerHTML = `
                <div class="col-12 text-center text-muted p-5 bg-white rounded shadow-sm border-0">
                    <i class="fas fa-folder-open fa-4x mb-3 opacity-50"></i>
                    <h5 class="fw-bold">لا توجد حركات مسجلة تطابق بحثك</h5>
                </div>
            `;
            return;
        }

        auditLogs.forEach((log, index) => {
            renderLogCard(log, index);
        });

    } catch (error) {
        console.error("Audit load error:", error);
        document.getElementById('loadingIndicator').style.display = 'none';
        document.getElementById('auditContainer').style.display = 'block';
        document.getElementById('auditContainer').innerHTML = `
            <div class="alert alert-danger shadow-sm border-0"><i class="fas fa-exclamation-triangle me-2"></i> حدث خطأ أثناء جلب السجل: ${error.message}</div>
        `;
    }
}

function renderLogCard(log, index) {
    const actionIcons = { 'CREATE': 'fa-plus-circle', 'UPDATE': 'fa-edit', 'DELETE': 'fa-trash-alt' };
    const actionNames = { 'CREATE': 'إضافة سجل', 'UPDATE': 'تعديل بيانات', 'DELETE': 'حذف سجل' };
    
    const userName = log.mo_users ? log.mo_users.full_name : 'مستخدم مجهول';
    const moduleName = tableNamesAR[log.entity_type] || log.entity_type;
    
    // تنسيق الوقت
    const logDate = new Date(log.created_at);
    const dateFormatted = logDate.toLocaleDateString('ar-EG');
    const timeFormatted = logDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    // استخراج ذكي لعنوان أو ملخص الحركة
    let summaryText = `معرف السجل: ${log.entity_id.substring(0,8)}...`;
    let detailData = log.new_data || log.old_data || {};
    
    if (detailData.full_name) summaryText = `الاسم: ${detailData.full_name}`;
    else if (detailData.case_internal_id) summaryText = `رقم القضية: ${detailData.case_internal_id}`;
    else if (detailData.title || detailData.update_title) summaryText = `العنوان: ${detailData.title || detailData.update_title}`;
    else if (detailData.amount) summaryText = `القيمة: ${detailData.amount} د.أ`;
    else if (detailData.file_name) summaryText = `الملف: ${detailData.file_name}`;

    const container = document.getElementById('auditContainer');
    const cardHTML = `
        <div class="col-12 mb-3">
            <div class="card bg-white border-0 shadow-sm audit-card h-100">
                <div class="card-body d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
                    <div>
                        <span class="badge action-badge ${log.action_type} rounded-pill mb-2 shadow-sm">
                            <i class="fas ${actionIcons[log.action_type]} me-1"></i> ${actionNames[log.action_type]}
                        </span>
                        <h6 class="fw-bold mb-1 text-navy">قسم ${moduleName} <i class="fas fa-arrow-left fa-xs mx-1 text-muted"></i> <span class="text-primary">${summaryText}</span></h6>
                        <small class="text-muted fw-bold">
                            <i class="fas fa-user-tie me-1 text-accent"></i> بواسطة: ${userName} 
                            <span class="mx-2">|</span> 
                            <i class="far fa-calendar-alt me-1"></i> ${dateFormatted} - ${timeFormatted}
                        </small>
                    </div>
                    <div>
                        <button class="btn btn-sm btn-outline-navy fw-bold px-3 shadow-sm" onclick="showDiff(${index})">
                            <i class="fas fa-code-branch me-1"></i> التفاصيل
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', cardHTML);
}

function showDiff(index) {
    const log = auditLogs[index];
    const modalBody = document.getElementById('diffModalBody');
    let diffHTML = '';

    const moduleName = tableNamesAR[log.entity_type] || log.entity_type;

    if (log.action_type === 'CREATE') {
        diffHTML = `
            <div class="alert alert-success border-0 shadow-sm fw-bold"><i class="fas fa-check-circle me-1"></i> تم إنشاء سجل جديد في (${moduleName}) بالبيانات التالية:</div>
            <div class="diff-viewer shadow-sm border">${syntaxHighlight(log.new_data)}</div>
        `;
    } 
    else if (log.action_type === 'DELETE') {
        diffHTML = `
            <div class="alert alert-danger border-0 shadow-sm fw-bold"><i class="fas fa-trash me-1"></i> تم حذف هذا السجل نهائياً. البيانات قبل الحذف:</div>
            <div class="diff-viewer shadow-sm border">${syntaxHighlight(log.old_data)}</div>
        `;
    } 
    else if (log.action_type === 'UPDATE') {
        diffHTML = `
            <div class="alert alert-info border-0 shadow-sm fw-bold"><i class="fas fa-exchange-alt me-1"></i> مقارنة التعديلات (الأحمر مُلغى، الأخضر مُضاف):</div>
            <div class="diff-viewer shadow-sm border">
        `;
        
        const oldData = log.old_data || {};
        const newData = log.new_data || {};
        const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
        
        diffHTML += `{\n`;
        let hasChanges = false;

        allKeys.forEach(key => {
            // استثناء الحقول التي تتحدث تلقائياً مثل التواريخ الداخلية إن لزم الأمر
            if(key === 'updated_at') return;

            const oldVal = oldData[key];
            const newVal = newData[key];

            if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
                hasChanges = true;
                diffHTML += `  <strong class="text-primary">"${key}"</strong>: \n`;
                if (oldVal !== undefined) {
                    diffHTML += `    <span class="diff-removed">- ${JSON.stringify(oldVal)}</span>\n`;
                }
                if (newVal !== undefined) {
                    diffHTML += `    <span class="diff-added">+ ${JSON.stringify(newVal)}</span>\n`;
                }
            }
        });

        if (!hasChanges) {
            diffHTML += `  <span class="text-muted">// لم يتم رصد تغييرات جوهرية في القيم</span>\n`;
        }

        diffHTML += `}</div>`;
    }

    modalBody.innerHTML = diffHTML;
    diffModalInstance.show();
}

// دالة مساعدة لتلوين الـ JSON في العرض
function syntaxHighlight(json) {
    if (typeof json != 'string') {
         json = JSON.stringify(json, undefined, 2);
    }
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        let cls = 'text-dark';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = 'text-primary fw-bold'; // مفتاح
            } else {
                cls = 'text-success'; // قيمة نصية
            }
        } else if (/true|false/.test(match)) {
            cls = 'text-warning fw-bold'; // بوليان
        } else if (/null/.test(match)) {
            cls = 'text-danger fw-bold'; // نول
        } else {
            cls = 'text-info fw-bold'; // رقم
        }
        return '<span class="' + cls + '">' + match + '</span>';
    });
}