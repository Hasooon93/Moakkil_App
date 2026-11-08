/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/compound.js
 * الوصف: محرك حاسبة الفائدة المركبة والعوائد الاستثمارية (Compound Interest Engine)
 * المهام:
 * 1. حساب القيمة المستقبلية لرأس المال مع الإيداعات الشهرية المتكررة.
 * 2. التدقيق المنطقي للمدخلات لمنع الأخطاء الحسابية (Validation).
 * 3. عرض النتيجة كتقرير مالي مفصل (رأس المال، الأرباح، القيمة النهائية).
 * ============================================================================
 */

document.addEventListener("DOMContentLoaded", () => {
    // ========================================================================
    // [1] ربط العناصر (DOM Elements)
    // ========================================================================
    const btnCalc = document.getElementById("calcCompBtn");
    const resDiv = document.getElementById("compResult");

    if (btnCalc) {
        btnCalc.addEventListener("click", () => {
            
            // ========================================================================
            // [2] جلب وتجهيز القيم المدخلة (Data Fetching)
            // ========================================================================
            const principal = parseFloat(document.getElementById("compPrincipal").value);
            const addition = parseFloat(document.getElementById("compAddition").value) || 0; // افتراضي صفر إذا تُرك فارغاً
            const rate = parseFloat(document.getElementById("compRate").value);
            const years = parseInt(document.getElementById("compYears").value);

            // ========================================================================
            // [3] جدار الحماية والتحقق المنطقي (Validation Firewall)
            // ========================================================================
            
            // التأكد من أن جميع المدخلات الحساسة أرقام صحيحة وموجبة
            if (isNaN(principal) || isNaN(rate) || isNaN(years) || principal < 0 || rate <= 0 || years <= 0) {
                if (typeof showAlert === 'function') {
                    showAlert("يرجى إدخال قيم رقمية صحيحة (المبلغ، النسبة، والمدة يجب أن تكون أكبر من صفر).", "warning");
                }
                resDiv.classList.add("d-none");
                return;
            }

            // إعطاء تأثير حركي للزر للإيحاء بالمعالجة الحسابية
            const originalBtnText = btnCalc.innerHTML;
            btnCalc.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري الحساب...';
            btnCalc.disabled = true;

            // ========================================================================
            // [4] تنفيذ العمليات الحسابية المعقدة (Core Math Logic)
            // ========================================================================
            setTimeout(() => {
                const r = rate / 100; // تحويل النسبة المئوية لعشري
                const months = years * 12; // إجمالي عدد الأشهر
                
                let futureValue = principal;
                let totalContributions = principal;

                // حلقة تكرارية لحساب العائد المركب شهرياً مع الإضافة الشهرية
                for(let i = 1; i <= months; i++) {
                    futureValue += addition; // إضافة المساهمة الشهرية أولاً
                    futureValue *= (1 + (r / 12)); // ضرب الناتج بالفائدة المركبة الشهرية
                    totalContributions += addition; // تتبع إجمالي رأس المال المدفوع
                }

                const totalInterest = futureValue - totalContributions; // صافي الأرباح

                // ========================================================================
                // [5] عرض النتيجة النهائية (Rendering Results)
                // ========================================================================
                
                // دالة مساعدة لتنسيق الأرقام بأسلوب مالي (مثال: 1,500,000.00)
                const fmt = (num) => num.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

                resDiv.innerHTML = `
                    <h6 class="fw-bold mb-4 border-bottom border-white border-opacity-25 pb-3 text-white text-start">
                        <i class="fas fa-chart-line me-2 text-warning"></i> التقرير المالي المبدئي:
                    </h6>
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <span class="fw-bold text-white opacity-75"><i class="fas fa-piggy-bank me-2"></i> إجمالي المساهمات (رأس المال):</span> 
                        <b class="fs-5 font-monospace text-white">${fmt(totalContributions)} <small class="fs-6 fw-normal">د.أ</small></b>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <span class="fw-bold text-white opacity-75"><i class="fas fa-arrow-trend-up me-2"></i> صافي الأرباح (الفائدة المتراكمة):</span> 
                        <b class="fs-5 font-monospace text-warning">${fmt(totalInterest)} <small class="fs-6 text-white fw-normal">د.أ</small></b>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mt-4 pt-3 border-top border-white border-opacity-25">
                        <span class="fw-bold text-white"><i class="fas fa-coins me-2"></i> القيمة المستقبلية الإجمالية:</span> 
                        <b class="fs-3 font-monospace text-warning" style="text-shadow: 0 2px 5px rgba(0,0,0,0.2);">${fmt(futureValue)} <small class="fs-6 text-white fw-normal">د.أ</small></b>
                    </div>
                `;
                
                // إظهار النتيجة مع حركة التلاشي الناعمة
                resDiv.classList.remove("d-none");
                resDiv.classList.add("fade-in");

                // استعادة حالة الزر
                btnCalc.innerHTML = originalBtnText;
                btnCalc.disabled = false;
            }, 300); // تأخير بسيط جداً لإعطاء إحساس بالمعالجة
        });
    }
});