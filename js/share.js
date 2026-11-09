/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/share.js
 * الإصدار: V5.6 Enterprise Edition (Partnership & Shares Legal Engine)
 * ============================================================================
 * الميزات والمهام:
 * 1. تقسيم المبالغ المالية الإجمالية (تصفية شركات، إزالة شيوع، تعويضات) على عدد من الشركاء بالتساوي.
 * 2. استخراج الحصص المالية بدقة بناءً على النسب المئوية المتفق عليها قانونياً.
 * 3. احتساب الرصيد المتبقي لبقية الشركاء والنسبة المئوية المكافئة.
 * 4. توليد تقرير مالي منسق جاهز للنسخ في اللوائح القضائية وعقود التخارج.
 * 5. التوافق التام مع الهوية البصرية الملكية V5.6 والوضع الليلي عالي التباين (WCAG AAA).
 * ============================================================================
 */

document.addEventListener("DOMContentLoaded", () => {
    const btnCalc = document.getElementById("calcShareBtn");
    const resDiv = document.getElementById("shareResult");

    if (btnCalc && resDiv) {
        btnCalc.addEventListener("click", (e) => {
            if (e) e.preventDefault();

            // 1. جلب المدخلات
            const totalInput = document.getElementById("shareTotal");
            const typeInput = document.getElementById("shareType");
            const valueInput = document.getElementById("shareValue");

            if (!totalInput || !typeInput || !valueInput) {
                showAlert("خطأ في الواجهة: بعض حقول الحاسبة غير متوفرة.", "error");
                return;
            }

            const total = parseFloat(totalInput.value);
            const type = typeInput.value;
            const value = parseFloat(valueInput.value);

            // 2. التحقق من صحة المدخلات
            if (isNaN(total) || isNaN(value) || total <= 0 || value <= 0) {
                showAlert("يرجى إدخال قيم رقمية موجبة في جميع حقول المبلغ والقسمة.", "warning");
                resDiv.classList.add("d-none");
                return;
            }

            if (type === 'percent' && value > 100) {
                showAlert("خطأ منطقي: لا يمكن أن تتجاوز نسبة الحصة المستخرجة 100%.", "error");
                resDiv.classList.add("d-none");
                return;
            }

            if (type === 'count' && (!Number.isInteger(value) || value < 1)) {
                showAlert("يرجى إدخال عدد صحيح للأفراد أو الشركاء (شخص واحد على الأقل).", "warning");
                return;
            }

            // تأثير التحميل
            const originalBtnText = btnCalc.innerHTML;
            btnCalc.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري احتساب الحصص بدقة...';
            btnCalc.disabled = true;

            setTimeout(() => {
                // 3. المعادلات المالية
                let shareAmount = 0;
                let shareLabel = "";
                let detailsNote = "";
                let equivalentPercent = 0;
                let remainingTotal = 0;

                if (type === 'count') {
                    shareAmount = total / value;
                    equivalentPercent = (1 / value) * 100;
                    remainingTotal = Math.max(0, total - shareAmount);
                    shareLabel = `حصة الفرد الواحد (من أصل ${value} شركاء)`;
                    detailsNote = `تم تقسيم إجمالي المبلغ بالتساوي على (${value}) من الشركاء، حيث تمثل حصة الفرد نسبة (${equivalentPercent.toFixed(2)}%) من إجمالي المال المشترك.`;
                } else if (type === 'percent') {
                    shareAmount = total * (value / 100);
                    equivalentPercent = value;
                    remainingTotal = Math.max(0, total - shareAmount);
                    shareLabel = `قيمة الحصة المستخرجة بنسبة (${value}%)`;
                    detailsNote = `تم اقتطاع ما نسبته (${value}%) من إجمالي المبلغ، ويتبقى لبقية الشركاء ما نسبته (${(100 - value).toFixed(2)}%).`;
                }

                // 4. استخراج العملة المعتمدة
                let currency = 'د.أ';
                try {
                    const settings = JSON.parse(localStorage.getItem('firm_settings') || '{}');
                    currency = settings.currency || settings.currency_code || 'د.أ';
                } catch (e) {}

                // دالة تنسيق الأرقام
                const fmt = (num) => Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                // نص ملخص قسمة الحصص القضائي
                const legalSummaryText = `[تقرير قسمة الحصص والمال المشترك - نظام موكّل]\n` +
                    `• القيمة الإجمالية المراد تقسيمها: ${fmt(total)} ${currency}\n` +
                    `• آلية التقسيم: ${type === 'count' ? `قسمة بالتساوي على ${value} شركاء` : `استخراج حصة مئوية قدرها ${value}%`}\n` +
                    `• قيمة الحصة المستحقة: ${fmt(shareAmount)} ${currency} (${equivalentPercent.toFixed(2)}% من الإجمالي)\n` +
                    `• الرصيد المتبقي لبقية الشركاء: ${fmt(remainingTotal)} ${currency} (${(100 - equivalentPercent).toFixed(2)}%)\n` +
                    `• ملاحظة: ${detailsNote}`;

                // 5. حقن النتائج بهوية V5.6 المتجاوبة مع الوضع الليلي
                resDiv.innerHTML = `
                    <div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
                        <h5 class="fw-bold mb-0 text-info d-flex align-items-center">
                            <i class="fas fa-chart-pie me-2 fs-4"></i> التقرير المالي لتوزيع الحصص والأنصبة
                        </h5>
                        <button class="btn btn-sm btn-outline-dark fw-bold rounded-pill px-3 shadow-sm" onclick="copyShareSummary(${JSON.stringify(legalSummaryText)})" title="نسخ تقرير الحصص للاستخدام في مذكرات وعقود القسمة">
                            <i class="fas fa-copy me-1 text-primary"></i> نسخ تقرير الحصص
                        </button>
                    </div>

                    <div class="row g-3 mb-4">
                        <div class="col-6 col-md-4">
                            <div class="p-3 bg-light border border-secondary border-opacity-25 rounded-4 shadow-sm text-center h-100">
                                <span class="d-block text-muted small fw-bold mb-2">إجمالي المال المقسم</span>
                                <b class="text-dark fs-4 font-monospace">${fmt(total)}</b>
                                <small class="text-muted d-block mt-1 font-monospace" style="font-size: 0.75rem;">${currency}</small>
                            </div>
                        </div>
                        <div class="col-6 col-md-4">
                            <div class="p-3 bg-light border border-info border-opacity-25 rounded-4 shadow-sm text-center h-100">
                                <span class="d-block text-muted small fw-bold mb-2">قيمة الحصة المستحقة</span>
                                <b class="text-primary fs-3 font-monospace">${fmt(shareAmount)}</b>
                                <small class="text-primary d-block mt-1 font-monospace" style="font-size: 0.75rem;">${currency} (${equivalentPercent.toFixed(1)}%)</small>
                            </div>
                        </div>
                        <div class="col-12 col-md-4">
                            <div class="p-3 bg-light border border-success border-opacity-25 rounded-4 shadow-sm text-center h-100">
                                <span class="d-block text-muted small fw-bold mb-2">المتبقي لبقية الشركاء</span>
                                <b class="text-success fs-4 font-monospace">${fmt(remainingTotal)}</b>
                                <small class="text-success d-block mt-1 font-monospace" style="font-size: 0.75rem;">${currency} (${(100 - equivalentPercent).toFixed(1)}%)</small>
                            </div>
                        </div>
                    </div>

                    <div class="p-3 bg-light rounded-4 border mb-3">
                        <span class="d-block fw-bold text-dark mb-1"><i class="fas fa-coins me-2 text-warning"></i> ${shareLabel}: <b class="font-monospace text-primary fs-5 ms-1">${fmt(shareAmount)} ${currency}</b></span>
                        <small class="text-muted fw-bold d-block mt-1"><i class="fas fa-info-circle me-1 text-info"></i> ${detailsNote}</small>
                    </div>

                    <div class="alert alert-light border border-info border-opacity-50 small text-muted mt-3 mb-0 fw-bold rounded-4 text-start lh-lg shadow-sm">
                        <i class="fas fa-shield-alt me-1 text-info fs-5 align-middle"></i> 
                        تم الاحتساب وفق القواعد القانونية لقسمة المال الشائع وتصفية الذمم المالية. الناتج مالي قطعي وجاهز للاستناد إليه في اتفاقيات التخارج والتسوية أو قرارات الخبرة القضائية.
                    </div>
                `;

                resDiv.className = "mt-4 p-4 card-custom border-2 border-info shadow-lg rounded-4 fade-in";
                resDiv.classList.remove("d-none");

                // استعادة الزر
                btnCalc.innerHTML = originalBtnText;
                btnCalc.disabled = false;
            }, 250);
        });
    }
});

/**
 * نسخ الملخص المالي لتوزيع الحصص
 */
window.copyShareSummary = function(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'تم نسخ تقرير الحصص للحافظة بنجاح!',
                showConfirmButton: false,
                timer: 2500
            });
        }
    }).catch(() => {
        showAlert("تعذر النسخ التلقائي للحافظة.", "warning");
    });
};

/**
 * دالة التنبيهات الموحدة
 */
function showAlert(message, type = 'info') {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: type === 'danger' ? 'error' : (type === 'warning' ? 'warning' : (type === 'success' ? 'success' : 'info')),
            title: message,
            showConfirmButton: false,
            timer: 3000
        });
    } else {
        alert(message);
    }
}
