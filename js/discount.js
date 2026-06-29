/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/discount.js
 * الوصف: محرك حاسبة الخصومات والضرائب المضافة (Discount & VAT Engine)
 * المهام:
 * 1. حساب قيمة الخصم المئوي واقتطاعه من المبلغ الأساسي.
 * 2. حساب قيمة الضريبة المضافة (VAT) على المبلغ الصافي (بعد الخصم).
 * 3. استخراج السعر النهائي المطلوب بدقة مالية متناهية.
 * 4. عرض النتيجة كفاتورة مصغرة بتصميم فائق الفخامة.
 * ============================================================================
 */

document.addEventListener("DOMContentLoaded", () => {
    // ========================================================================
    // [1] ربط العناصر (DOM Elements)
    // ========================================================================
    const btnCalc = document.getElementById("calcDtBtn");
    const resDiv = document.getElementById("dtResult");

    if (btnCalc) {
        btnCalc.addEventListener("click", () => {
            
            // ========================================================================
            // [2] جلب وتجهيز القيم المدخلة (Data Fetching)
            // ========================================================================
            const price = parseFloat(document.getElementById("dtPrice").value);
            const discountRate = parseFloat(document.getElementById("dtDiscount").value) || 0; // افتراضي صفر
            const taxRate = parseFloat(document.getElementById("dtTax").value) || 0;       // افتراضي صفر

            // ========================================================================
            // [3] جدار الحماية والتحقق المنطقي (Validation Firewall)
            // ========================================================================
            
            // التأكد من صحة ومنطقية الأرقام (لا يمكن أن يكون السعر سالباً أو النسب سالبة)
            if (isNaN(price) || price <= 0 || discountRate < 0 || taxRate < 0) {
                if (typeof showAlert === 'function') {
                    showAlert("يرجى إدخال مبلغ صحيح ونسب مئوية موجبة للفواتير.", "warning");
                }
                resDiv.classList.add("d-none");
                return;
            }

            // التحقق من ألا يتجاوز الخصم 100%
            if (discountRate > 100) {
                if (typeof showAlert === 'function') {
                    showAlert("لا يمكن أن تتجاوز نسبة الخصم 100% من قيمة المبلغ الأصلي.", "error");
                }
                resDiv.classList.add("d-none");
                return;
            }

            // إعطاء تأثير حركي للزر للإيحاء بالمعالجة الحسابية
            const originalBtnText = btnCalc.innerHTML;
            btnCalc.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري استخراج الفاتورة...';
            btnCalc.disabled = true;

            // ========================================================================
            // [4] تنفيذ العمليات الحسابية المتسلسلة (Core Math Logic)
            // ========================================================================
            setTimeout(() => {
                // 1. حساب قيمة الخصم
                const discountAmount = price * (discountRate / 100);
                
                // 2. استخراج السعر بعد الخصم (الوعاء الضريبي)
                const priceAfterDiscount = price - discountAmount;
                
                // 3. حساب قيمة الضريبة المضافة بناءً على السعر الجديد (بعد الخصم)
                const taxAmount = priceAfterDiscount * (taxRate / 100);
                
                // 4. استخراج السعر النهائي الصافي
                const finalPrice = priceAfterDiscount + taxAmount;

                // ========================================================================
                // [5] عرض النتيجة النهائية (Rendering Invoice Breakdown)
                // ========================================================================
                
                // دالة مساعدة لتنسيق الأرقام بأسلوب مالي (مثال: 1,500.00)
                const fmt = (num) => num.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

                // عرض النتيجة بطريقة تتناسب مع خلفية الـ Danger الفاخرة (نصوص بيضاء وذهبية)
                resDiv.innerHTML = `
                    <h6 class="fw-bold mb-4 border-bottom border-white border-opacity-25 pb-3 text-white text-start">
                        <i class="fas fa-file-invoice-dollar me-2 text-warning"></i> التفاصيل المالية للفاتورة:
                    </h6>
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <span class="fw-bold text-white opacity-75">المبلغ الأصلي:</span>
                        <b class="fs-5 font-monospace text-white">${fmt(price)} <small class="fs-6 fw-normal">د.أ</small></b>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <span class="fw-bold text-white opacity-75">قيمة الخصم الممنوح (${discountRate}%):</span>
                        <b class="fs-5 font-monospace" style="color: #6ee7b7 !important;">- ${fmt(discountAmount)} <small class="fs-6 text-white fw-normal">د.أ</small></b>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <span class="fw-bold text-white opacity-75">السعر الخاضع للضريبة (بعد الخصم):</span>
                        <b class="fs-5 font-monospace text-white">${fmt(priceAfterDiscount)} <small class="fs-6 fw-normal">د.أ</small></b>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <span class="fw-bold text-white opacity-75">قيمة الضريبة المضافة (${taxRate}%):</span>
                        <b class="fs-5 font-monospace text-warning">+ ${fmt(taxAmount)} <small class="fs-6 text-white fw-normal">د.أ</small></b>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mt-4 pt-3 border-top border-white border-opacity-25">
                        <span class="fw-bold text-white"><i class="fas fa-coins me-2"></i> السعر النهائي المطلوب:</span>
                        <b class="fs-2 font-monospace text-warning" style="text-shadow: 0 2px 5px rgba(0,0,0,0.2);">${fmt(finalPrice)} <small class="fs-5 text-white fw-normal">د.أ</small></b>
                    </div>
                `;
                
                // إظهار النتيجة مع حركة التلاشي الناعمة
                resDiv.classList.remove("d-none");
                resDiv.classList.add("fade-in");

                // استعادة حالة الزر
                btnCalc.innerHTML = originalBtnText;
                btnCalc.disabled = false;
            }, 300); // تأخير بسيط للإيحاء بالتحليل والاستخراج
        });
    }
});