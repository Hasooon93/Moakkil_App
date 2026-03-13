// js/reports.js - محرك صفحة التقارير المفصلة (للمدير فقط)

window.onload = async () => {
    const currentUser = JSON.parse(localStorage.getItem(CONFIG.USER_KEY));
    const token = localStorage.getItem(CONFIG.TOKEN_KEY);

    // حماية الصفحة: طرد أي شخص غير المدير
    if (!token || !currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'مدير')) {
        alert("عذراً، هذه الصفحة مخصصة لمدير النظام فقط.");
        window.location.href = 'app.html';
        return;
    }

    await generateReports();
};

async function generateReports() {
    try {
        // جلب كافة البيانات من السيرفر
        const [cases, staff] = await Promise.all([
            API.getCases(),
            API.getStaff()
        ]);

        const casesList = cases || [];
        const staffList = staff || [];

        let totalAgreed = 0, totalPaid = 0;
        let active = 0, closed = 0, appeal = 0;
        
        // كائن لتتبع أداء كل محامي
        let lawyerStats = {};
        staffList.forEach(s => {
            if(s.role === 'lawyer' || s.role === 'محامي') {
                lawyerStats[s.id] = { name: s.full_name, caseCount: 0, collected: 0 };
            }
        });

        // المرور على القضايا لحساب الإجماليات وتوزيعها على المحامين
        casesList.forEach(c => {
            const agreed = Number(c.total_agreed_fees) || 0;
            const paid = Number(c.total_paid) || 0;
            
            totalAgreed += agreed;
            totalPaid += paid;

            if (c.status === 'نشطة') active++;
            else if (c.status === 'مغلقة') closed++;
            else if (c.status === 'قيد الاستئناف') appeal++;

            // إضافة الإحصائية للمحامي المسؤول
            if (c.assigned_lawyer_id && lawyerStats[c.assigned_lawyer_id]) {
                lawyerStats[c.assigned_lawyer_id].caseCount++;
                lawyerStats[c.assigned_lawyer_id].collected += paid;
            }
        });

        // طباعة الملخص المالي
        document.getElementById('rep-total-agreed').innerText = totalAgreed.toLocaleString();
        document.getElementById('rep-total-paid').innerText = totalPaid.toLocaleString();
        document.getElementById('rep-total-rem').innerText = (totalAgreed - totalPaid).toLocaleString();

        // طباعة إحصائيات القضايا
        document.getElementById('rep-active').innerText = active;
        document.getElementById('rep-closed').innerText = closed;
        document.getElementById('rep-appeal').innerText = appeal;

        // طباعة جدول أداء المحامين
        const tbody = document.getElementById('lawyer-performance-body');
        const lawyersArray = Object.values(lawyerStats);
        
        if (lawyersArray.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-muted p-3">لا يوجد محامين مسجلين</td></tr>';
        } else {
            tbody.innerHTML = lawyersArray.map(l => `
                <tr>
                    <td class="fw-bold text-navy">${l.name}</td>
                    <td><span class="badge bg-soft-primary text-primary">${l.caseCount}</span></td>
                    <td class="text-success fw-bold">${l.collected.toLocaleString()}</td>
                </tr>
            `).join('');
        }

    } catch (err) {
        console.error("خطأ في توليد التقارير:", err);
        alert("حدث خطأ أثناء تحميل التقارير.");
    }
}