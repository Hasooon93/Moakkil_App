/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/breakeven.js
 * الإصدار: V5.6 Enterprise Edition (Commercial Break-Even Legal Engine)
 * ============================================================================
 * الميزات والمهام:
 * 1. احتساب نقطة التعادل بالوحدات وبالقيمة الإجمالية للمبيعات بدقة تجارية معتمدة.
 * 2. احتساب هامش المساهمة للوحدة (Contribution Margin) ونسبة الهامش الحدي (%).
 * 3. صياغة تقرير الجدوى المالية المنسق الجاهز للنسخ في اللوائح والخبرات القضائية.
 * 4. دعم الهوية البصرية الملكية V5.6 والوضع الليلي عالي التباين (WCAG AAA).
 * ============================================================================
 */

document.addEventListener("DOMContentLoaded", () => {
    const btnCalc = document.getElementById("calcBeBtn");
    const resDiv = document.getElementById("beResult");

    if (btnCalc && resDiv) {
        btnCalc.addEventListener("click", (e) => {
            if (e) e.preventDefault();

            // 1. جلب المدخلات
            const fixedInput = document.getElementById("beFixedCosts");
            const varInput = document.getElementById("beVarCost");
            const priceInput = document.getElementById("bePrice");

            if (!fixedInput || !varInput || !priceInput) {
                showAlert("خطأ في الواجهة: بعض حقول نقطة التعادل مفقودة.", "error");
                return;
            }

            const fixedCosts = parseFloat(fixedInput.value);
            const varCost = parseFloat(varInput.value);
            const price = parseFloat(priceInput.value);

            // 2. التحقق من صحة المدخلات
            if (isNaN(fixedCosts) || isNaN(varCost) || isNaN(price) || fixedCosts < 0 || varCost < 0 || price <= 0) {
                showAlert("يرجى إدخال قيم رقمية موجبة وصحيحة في جميع حقول التكاليف والسعر.", "warning");
                resDiv.classList.add("d-none");
                return;
            }

            // التحقق التجاري: لا يمكن تحقيق التعادل إذا كانت التكلفة المتغيرة تساوي أو تتجاوز سعر البيع
            if (price <= varCost) {
                showAlert("خطأ تجاري: سعر بيع الوحدة يجب أن يتجاوز التكلفة المتغيرة لتحقيق هامش ربح وتغطية التكاليف الثابتة.", "error");
                resDiv.classList.add("d-none");
                return;
            }

            // تأثير التحميل المؤقت
            const originalBtnText = btnCalc.innerHTML;
            btnCalc.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري التحليل التجاري...';
            btnCalc.disabled = true;

            setTimeout(() => {
                // 3. المعادلات الاقتصادية
                // هامش المساهمة للوحدة الواحد = سعر البيع - التكلفة المتغيرة
                const contributionMargin = price - varCost;
                
                // نسبة هامش المساهمة = (هامش المساهمة / سعر البيع) * 100
                const marginRatio = (contributionMargin / price) * 100;

                // عدد وحدات التعادل = التكاليف الثابتة / هامش المساهمة
                const breakevenUnits = Math.ceil(fixedCosts / contributionMargin);

                // إيراد مبيعات التعادل الإجمالي = وحدات التعادل * سعر البيع
                const breakevenSales = breakevenUnits * price;

                // 4. استخراج العملة المعتمدة
                let currency = 'د.أ';
                try {
                    const settings = JSON.parse(localStorage.getItem('firm_settings') || '{}');
                    currency = settings.currency || settings.currency_code || 'د.أ';
                } catch (e) {}

                // دالة تنسيق الأرقام
                const fmt = (num) => Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const fmtInt = (num) => Number(num || 0).toLocaleString('en-US');

                // نص ملخص نقطة التعادل القضائي
                const legalSummaryText = `[تقرير نقطة التعادل التجاري - نظام موكّل]\n` +
                    `• التكاليف الثابتة الإجمالية: ${fmt(fixedCosts)} ${currency}\n` +
                    `• التكلفة المتغيرة للوحدة: ${fmt(varCost)} ${currency}\n` +
                    `• سعر بيع الوحدة المقترح: ${fmt(price)} ${currency}\n` +
                    `• هامش المساهمة للقطعة: ${fmt(contributionMargin)} ${currency} (نسبة الهامش: ${marginRatio.toFixed(1)}%)\n` +
                    `• حجم المبيعات المطلوب للتعادل: ${fmtInt(breakevenUnits)} وحدة\n` +
                    `• إجمالي إيرادات المبيعات للتعادل: ${fmt(breakevenSales)} ${currency}`;

                // 5. حقن النتائج بهوية V5.6 المتجاوبة
                resDiv.innerHTML = `
                    <div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
                        <h5 class="fw-bold mb-0 text-warning d-flex align-items-center">
                            <i class="fas fa-balance-scale me-2 fs-4"></i> التقرير التحليلي لنقطة التعادل التجارية (Break-Even)
                        </h5>
                        <button class="btn btn-sm btn-outline-dark fw-bold rounded-pill px-3 shadow-sm" onclick="copyBreakevenSummary(${JSON.stringify(legalSummaryText)})" title="نسخ ملخص التعادل للاستخدام في مذكرات الدعوى">
                            <i class="fas fa-copy me-1 text-primary"></i> نسخ التقرير المالي
                        </button>
                    </div>

                    <div class="row g-3 mb-4">
                        <div class="col-6 col-md-3">
                            <div class="p-3 bg-light border border-warning border-opacity-25 rounded-4 shadow-sm text-center h-100">
                                <span class="d-block text-muted small fw-bold mb-2">الوحدات المطلوبة للتعادل</span>
                                <b class="text-dark fs-3 font-monospace">${fmtInt(breakevenUnits)}</b>
                                <small class="text-muted d-block mt-1 font-monospace" style="font-size: 0.75rem;">وحدة مبيعات</small>
                            </div>
                        </div>
                        <div class="col-6 col-md-3">
                            <div class="p-3 bg-light border border-success border-opacity-25 rounded-4 shadow-sm text-center h-100">
                                <span class="d-block text-muted small fw-bold mb-2">إيرادات المبيعات المطلوبة</span>
                                <b class="text-success fs-4 font-monospace">${fmt(breakevenSales)}</b>
                                <small class="text-success d-block mt-1 font-monospace" style="font-size: 0.75rem;">${currency}</small>
                            </div>
                        </div>
                        <div class="col-6 col-md-3">
                            <div class="p-3 bg-light border border-primary border-opacity-25 rounded-4 shadow-sm text-center h-100">
                                <span class="d-block text-muted small fw-bold mb-2">هامش المساهمة للوحدة</span>
                                <b class="text-primary fs-4 font-monospace">${fmt(contributionMargin)}</b>
                                <small class="text-primary d-block mt-1 font-monospace" style="font-size: 0.75rem;">${currency} / وحدة</small>
                            </div>
                        </div>
                        <div class="col-6 col-md-3">
                            <div class="p-3 bg-light border border-info border-opacity-25 rounded-4 shadow-sm text-center h-100">
                                <span class="d-block text-muted small fw-bold mb-2">نسبة الهامش الحدي</span>
                                <b class="text-info fs-4 font-monospace">%${marginRatio.toFixed(1)}</b>
                                <small class="text-muted d-block mt-1 font-monospace" style="font-size: 0.75rem;">من سعر البيع</small>
                            </div>
                        </div>
                    </div>

                    <div class="alert alert-light border border-warning border-opacity-50 small text-muted mt-3 mb-0 fw-bold rounded-4 text-start lh-lg shadow-sm">
                        <i class="fas fa-info-circle me-1 text-warning fs-5 align-middle"></i> 
                        تم احتساب نقطة التعادل التجارية بجبر كسور الوحدات للأعلى (Ceiling Rounding) لضمان تغطية كامل التكاليف الثابتة. المبيعات الإضافية فوق (${fmtInt(breakevenUnits)} وحدة) تحقق ربحاً تشغيلياً صافياً للمشروع بمقدار (${fmt(contributionMargin)} ${currency}) لكل وحدة مباعة.
                    </div>
                `;

                resDiv.className = "mt-4 p-4 card-custom border-2 border-warning shadow-lg rounded-4 fade-in";
                resDiv.classList.remove("d-none");

                // استعادة الزر
                btnCalc.innerHTML = originalBtnText;
                btnCalc.disabled = false;
            }, 250);
        });
    }
});

/**
 * نسخ الملخص التحليلي لنقطة التعادل
 */
window.copyBreakevenSummary = function(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'تم نسخ تقرير التعادل للحافظة بنجاح!',
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
