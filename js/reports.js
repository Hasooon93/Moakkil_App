// js/reports.js - محرك التقارير المتقدم (المالية، الإحصائيات، أداء الفريق)

window.onload = async () => {
    const token = localStorage.getItem(CONFIG.TOKEN_KEY);
    const user = JSON.parse(localStorage.getItem(CONFIG.USER_KEY));
    
    // حماية إضافية: صفحة التقارير للمدراء فقط
    if (!token || !user || (user.role !== 'admin' && user.role !== 'مدير')) {
        alert('غير مصرح لك بالوصول لصفحة التقارير');
        window.location.href = 'app.html';
        return;
    }
    
    document.getElementById('report-date').innerText = new Date().toLocaleDateString('ar-EG');
    await generateComprehensiveReport();
};

async function generateComprehensiveReport() {
    try {
        // جلب جميع البيانات الأساسية للمكتب بالتوازي للسرعة
        const [cases, staff, installments, expenses] = await Promise.all([
            API.getCases(),
            API.getStaff(),
            fetchAPI('/api/installments'), // جلب كل الدفعات في المكتب
            fetchAPI('/api/expenses')      // جلب كل المصروفات في المكتب
        ]);

        if (!cases) throw new Error("تعذر جلب البيانات الأساسية");

        calculateFinancials(cases, installments || [], expenses || []);
        calculateCaseStats(cases);
        calculateStaffPerformance(cases, staff || []);

    } catch (error) {
        console.error("Reports Error:", error);
        showAlert('حدث خطأ أثناء تحليل البيانات للتقرير', 'danger');
    }
}

function calculateFinancials(cases, installments, expenses) {
    let totalAgreed = 0;
    let totalPaid = 0;
    let totalExpenses = 0;

    // 1. حساب إجمالي الأتعاب المتفق عليها من جميع القضايا
    cases.forEach(c => {
        totalAgreed += Number(c.total_agreed_fees) || 0;
    });

    // 2. حساب المبالغ المحصلة فعلياً (دفعات حالتها "مدفوعة")
    installments.forEach(i => {
        if (i.status === 'مدفوعة') {
            totalPaid += Number(i.amount) || 0;
        }
    });

    // 3. حساب إجمالي المصروفات للمكتب والقضايا
    expenses.forEach(e => {
        totalExpenses += Number(e.amount) || 0;
    });

    // 4. الربح الصافي (المدفوع - المصروفات)
    const netProfit = totalPaid - totalExpenses;

    // تحديث الواجهة
    document.getElementById('rep-total-agreed').innerText = totalAgreed.toLocaleString();
    document.getElementById('rep-total-paid').innerText = totalPaid.toLocaleString();
    document.getElementById('rep-total-expenses').innerText = totalExpenses.toLocaleString();
    document.getElementById('rep-net-profit').innerText = netProfit.toLocaleString();
}

function calculateCaseStats(cases) {
    let active = 0, closed = 0, appeal = 0;

    cases.forEach(c => {
        if (c.status === 'نشطة') active++;
        else if (c.status === 'مغلقة' || c.status === 'محفوظة') closed++;
        else if (c.status === 'قيد الاستئناف') appeal++;
        else if (c.litigation_degree === 'استئناف' || c.litigation_degree === 'تمييز') appeal++; // احتساب درجة التقاضي
    });

    document.getElementById('rep-cases-total').innerText = cases.length;
    document.getElementById('rep-cases-active').innerText = active;
    document.getElementById('rep-cases-closed').innerText = closed;
    document.getElementById('rep-cases-appeal').innerText = appeal;
}

function calculateStaffPerformance(cases, staff) {
    const tableBody = document.getElementById('lawyer-performance-body');
    
    if (staff.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="text-muted">لا يوجد موظفين مسجلين</td></tr>';
        return;
    }

    let rowsHtml = '';

    // حساب إحصائيات كل موظف
    staff.forEach(member => {
        let assignedCasesCount = 0;
        let associatedFees = 0;

        // البحث في القضايا المرتبطة بهذا الموظف
        cases.forEach(c => {
            if (c.assigned_lawyer_id === member.id || c.created_by === member.id) {
                assignedCasesCount++;
                associatedFees += Number(c.total_agreed_fees) || 0;
            }
        });

        // حالة الحساب (فعال أو معطل)
        const statusBadge = member.is_active === false 
            ? '<span class="badge bg-danger">معطل</span>' 
            : '<span class="badge bg-success">فعال</span>';

        // إضافة سطر الموظف في الجدول
        rowsHtml += `
            <tr class="${member.is_active === false ? 'opacity-50' : ''}">
                <td class="text-start ps-3">
                    <div class="d-flex align-items-center">
                        <div class="bg-light text-navy fw-bold rounded-circle d-flex align-items-center justify-content-center me-2 border" style="width:35px; height:35px;">
                            ${member.full_name.charAt(0)}
                        </div>
                        <div>
                            <b class="text-navy d-block">${member.full_name}</b>
                            <small class="text-muted">${member.role === 'admin' ? 'مدير' : member.role}</small>
                        </div>
                    </div>
                </td>
                <td>${statusBadge}</td>
                <td><span class="badge bg-soft-primary text-primary fs-6">${assignedCasesCount}</span></td>
                <td class="text-success fw-bold">${associatedFees.toLocaleString()}</td>
            </tr>
        `;
    });

    tableBody.innerHTML = rowsHtml;
}

function showAlert(message, type = 'info') {
    const box = document.getElementById('alertBox');
    if(!box) return;
    const alertId = 'alert-' + Date.now();
    let typeClass = type === 'success' ? 'alert-success-custom' : 'alert-danger-custom';
    box.insertAdjacentHTML('beforeend', `<div id="${alertId}" class="alert-custom ${typeClass}"><i class="fas ${type === 'success' ? 'fa-check-circle text-success' : 'fa-info-circle text-info'}"></i><span>${message}</span></div>`);
    setTimeout(() => { const el = document.getElementById(alertId); if(el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); } }, 3000);
}