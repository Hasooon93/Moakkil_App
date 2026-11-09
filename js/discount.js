/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/discount.js
 * الإصدار: V5.6 Enterprise Edition (Discount & VAT Legal Engine)
 * ============================================================================
 * الميزات والمهام:
 * 1. حساب قيمة الخصم الممنوح واقتطاعه من المبلغ الأصلي (الوعاء الضريبي).
 * 2. احتساب ضريبة المبيعات أو القيمة المضافة (VAT) على السعر الصافي الخاضع للضريبة.
 * 3. استخراج السعر النهائي المطلوب سداده بدقة محاسبية متناهية.
 * 4. توليد فاتورة ضريبية مصغرة جاهزة للنسخ في اللوائح ومذكرات الدعاوى التجارية.
 * 5. التوافق التام مع الهوية البصرية الملكية V5.6 والوضع الليلي عالي التباين (WCAG AAA).
 * ============================================================================
 */

document.addEventListener("DOMContentLoaded", () => {
    const btnCalc = document.getElementById("calcDtBtn");
    const resDiv = document.getElementById("dtResult");

    if (btnCalc && resDiv) {
        btnCalc.addEventListener("click", (e) => {
            if (e) e.preventDefault();

            // 1. جلب المدخلات
            const priceInput = document.getElementById("dtPrice");
            const discountInput = document.getElementById("dtDiscount");
            const taxInput = document.getElementById("dtTax");

            if (!priceInput || !discountInput || !taxInput) {
                showAlert("خطأ في الواجهة: بعض حقول الحاسبة غير متوفرة.", "error");
                return;
            }

            const price = parseFloat(priceInput.value);
            const discountRate = parseFloat(discountInput.value) || 0;
            const taxRate = parseFloat(taxInput.value) || 0;

            // 2. التحقق من صحة المدخلات
            if (isNaN(price) || price <= 0 || discountRate < 0 || taxRate < 0) {
                showAlert("يرجى إدخال مبلغ صحيح ونسب مئوية موجبة للفواتير.", "warning");
                resDiv.classList.add("d-none");
                return;
            }

            if (discountRate > 100) {
                showAlert("لا يمكن أن تتجاوز نسبة الخصم الممنوح 100% من قيمة المبلغ الأصلي.", "error");
                resDiv.classList.add("d-none");
                return;
            }

            // تأثير التحميل
            const originalBtnText = btnCalc.innerHTML;
            btnCalc.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري التدقيق والاحتساب الضريبي...';
            btnCalc.disabled = true;

            setTimeout(() => {
                // 3. المعادلات الضريبية الرسمية
                // قيمة الخصم
                const discountAmount = price * (discountRate / 100);
                
                // السعر الخاضع للضريبة (الوعاء الضريبي بعد الخصم)
                const priceAfterDiscount = Math.max(0, price - discountAmount);
                
                // قيمة الضريبة المضافة
                const taxAmount = priceAfterDiscount * (taxRate / 100);
                
                // السعر النهائي الإجمالي
                const finalPrice = priceAfterDiscount + taxAmount;

                // 4. استخراج العملة المعتمدة
                let currency = 'د.أ';
                try {
                    const settings = JSON.parse(localStorage.getItem('firm_settings') || '{}');
                    currency = settings.currency || settings.currency_code || 'د.أ';
                } catch (e) {}

                // دالة تنسيق الأرقام
                const fmt = (num) => Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                // نص ملخص الفاتورة الضريبية القضائي
                const legalSummaryText = `[تقرير الحسبة الضريبية والفاتورة - نظام موكّل]\n` +
                    `• المبلغ الأصلي قبل الخصم والضريبة: ${fmt(price)} ${currency}\n` +
                    `• نسبة الخصم الممنوح: ${discountRate}% (المقدار: -${fmt(discountAmount)} ${currency})\n` +
                    `• الوعاء الخاضع للضريبة (بعد الخصم): ${fmt(priceAfterDiscount)} ${currency}\n` +
                    `• نسبة ضريبة المبيعات/القيمة المضافة (VAT): ${taxRate}% (المقدار: +${fmt(taxAmount)} ${currency})\n` +
                    `• السعر النهائي الإجمالي المستحق: ${fmt(finalPrice)} ${currency}`;

                // 5. حقن النتائج بهوية V5.6 الملكية المتجاوبة مع الوضع الليلي
                resDiv.innerHTML = `
                    <div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
                        <h5 class="fw-bold mb-0 text-danger d-flex align-items-center">
                            <i class="fas fa-file-invoice-dollar me-2 fs-4"></i> تفاصيل الفاتورة الضريبية الرسمية
                        </h5>
                        <button class="btn btn-sm btn-outline-dark fw-bold rounded-pill px-3 shadow-sm" onclick="copyDiscountSummary(${JSON.stringify(legalSummaryText)})" title="نسخ الفاتورة الضريبية للاستخدام في لوائح الدعوى">
                            <i class="fas fa-copy me-1 text-primary"></i> نسخ الفاتورة الضريبية
                        </button>
                    </div>

                    <div class="row g-3 mb-4">
                        <div class="col-6 col-md-3">
                            <div class="p-3 bg-light border border-secondary border-opacity-25 rounded-4 shadow-sm text-center h-100">
                                <span class="d-block text-muted small fw-bold mb-2">المبلغ الأصلي</span>
                                <b class="text-dark fs-4 font-monospace">${fmt(price)}</b>
                                <small class="text-muted d-block mt-1 font-monospace" style="font-size: 0.75rem;">${currency}</small>
                            </div>
                        </div>
                        <div class="col-6 col-md-3">
                            <div class="p-3 bg-light border border-success border-opacity-25 rounded-4 shadow-sm text-center h-100">
                                <span class="d-block text-muted small fw-bold mb-2">قيمة الخصم (${discountRate}%)</span>
                                <b class="text-success fs-4 font-monospace">- ${fmt(discountAmount)}</b>
                                <small class="text-success d-block mt-1 font-monospace" style="font-size: 0.75rem;">${currency}</small>
                            </div>
                        </div>
                        <div class="col-6 col-md-3">
                            <div class="p-3 bg-light border border-warning border-opacity-25 rounded-4 shadow-sm text-center h-100">
                                <span class="d-block text-muted small fw-bold mb-2">الضريبة المضافة (${taxRate}%)</span>
                                <b class="text-danger fs-4 font-monospace">+ ${fmt(taxAmount)}</b>
                                <small class="text-danger d-block mt-1 font-monospace" style="font-size: 0.75rem;">${currency}</small>
                            </div>
                        </div>
                        <div class="col-6 col-md-3">
                            <div class="p-3 bg-light border border-danger border-opacity-25 rounded-4 shadow-sm text-center h-100">
                                <span class="d-block text-muted small fw-bold mb-2">السعر النهائي المستحق</span>
                                <b class="text-dark fs-3 font-monospace">${fmt(finalPrice)}</b>
                                <small class="text-dark d-block mt-1 font-monospace" style="font-size: 0.75rem;">${currency}</small>
                            </div>
                        </div>
                    </div>

                    <div class="p-3 bg-light rounded-4 border mb-3">
                        <div class="d-flex justify-content-between align-items-center">
                            <span class="fw-bold text-muted small"><i class="fas fa-calculator me-1"></i> الوعاء الخاضع للضريبة الفعلي (بعد حسم الخصم):</span>
                            <b class="text-dark font-monospace fs-5">${fmt(priceAfterDiscount)} ${currency}</b>
                        </div>
                    </div>

                    <div class="alert alert-light border border-danger border-opacity-50 small text-muted mt-3 mb-0 fw-bold rounded-4 text-start lh-lg shadow-sm">
                        <i class="fas fa-shield-alt me-1 text-danger fs-5 align-middle"></i> 
                        تم احتساب ضريبة المبيعات / القيمة المضافة (VAT) وفق الأصول القانونية للتشريعات الضريبية باحتساب النسبة المئوية على السعر الصافي بعد اقتطاع الخصم التجاري الممنوح.
                    </div>
                `;

                resDiv.className = "mt-4 p-4 card-custom border-2 border-danger shadow-lg rounded-4 fade-in";
                resDiv.classList.remove("d-none");

                // استعادة الزر
                btnCalc.innerHTML = originalBtnText;
                btnCalc.disabled = false;
            }, 250);
        });
    }
});

/**
 * نسخ الملخص الضريبي للحافظة
 */
window.copyDiscountSummary = function(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'تم نسخ الفاتورة الضريبية للحافظة بنجاح!',
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
