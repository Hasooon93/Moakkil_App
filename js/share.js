/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/share.js
 * الوصف: محرك حاسبة حصص الأفراد والشركاء (Partnership & Shares Calculator)
 * المهام:
 * 1. تقسيم المبالغ الإجمالية (تعويضات، تصفية شركات، تركات بسيطة) على عدد من الشركاء.
 * 2. استخراج الحصة المالية الدقيقة بناءً على نسبة مئوية محددة.
 * 3. حماية المدخلات من الأخطاء المنطقية.
 * 4. عرض النتيجة في واجهة تقرير مالي مصغر واحترافي.
 * ============================================================================
 */

document.addEventListener("DOMContentLoaded", () => {
    // ========================================================================
    // [1] ربط العناصر (DOM Elements)
    // ========================================================================
    const btnCalc = document.getElementById("calcShareBtn");
    const resDiv = document.getElementById("shareResult");

    if (btnCalc) {
        btnCalc.addEventListener("click", () => {
            
            // ========================================================================
            // [2] جلب وتجهيز القيم المدخلة (Data Fetching)
            // ========================================================================
            const total = parseFloat(document.getElementById("shareTotal").value);
            const type = document.getElementById("shareType").value;
            const value = parseFloat(document.getElementById("shareValue").value);

            // ========================================================================
            // [3] جدار الحماية والتحقق المنطقي (Validation Firewall)
            // ========================================================================
            
            // التأكد من أن جميع المدخلات أرقام صحيحة وموجبة
            if (isNaN(total) || isNaN(value) || total <= 0 || value <= 0) {
                if (typeof showAlert === 'function') {
                    showAlert("يرجى إدخال قيم مالية رقمية صحيحة وموجبة في جميع الحقول.", "warning");
                }
                resDiv.classList.add("d-none");
                return;
            }

            // التحقق المنطقي: لا يمكن استخراج نسبة مئوية تتجاوز 100%
            if (type === 'percent' && value > 100) {
                if (typeof showAlert === 'function') {
                    showAlert("خطأ منطقي: لا يمكن أن تكون النسبة المئوية المستخرجة أكبر من 100%.", "error");
                }
                resDiv.classList.add("d-none");
                return;
            }

            // إعطاء تأثير حركي للزر للإيحاء بالمعالجة الحسابية الدقيقة
            const originalBtnText = btnCalc.innerHTML;
            btnCalc.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري التقسيم المالي...';
            btnCalc.disabled = true;

            // ========================================================================
            // [4] تنفيذ العمليات الحسابية (Core Math Logic)
            // ========================================================================
            setTimeout(() => {
                let shareAmount = 0;
                let shareLabel = "";
                let detailsNote = "";

                if (type === 'count') {
                    shareAmount = total / value;
                    shareLabel = `حصة الفرد الواحد (من أصل ${value}):`;
                    detailsNote = "تم تقسيم المبلغ الإجمالي بالتساوي على عدد الأفراد المحددين.";
                } else if (type === 'percent') {
                    shareAmount = total * (value / 100);
                    shareLabel = `قيمة الحصة المستخرجة (${value}%):`;
                    detailsNote = "تم استخراج القيمة بناءً على النسبة المئوية المحددة من الإجمالي.";
                }

                // ========================================================================
                // [5] عرض النتيجة النهائية (Rendering Dashboard)
                // ========================================================================
                
                // دالة مساعدة لتنسيق الأرقام بأسلوب مالي (مثال: 1,500.00)
                const fmt = (num) => num.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});

                // عرض النتيجة بطريقة تتناسب مع خلفية الـ Info (أزرق فاتح / داكن)
                resDiv.innerHTML = `
                    <h6 class="fw-bold mb-4 border-bottom border-dark border-opacity-25 pb-3 text-dark text-start">
                        <i class="fas fa-chart-pie me-2 text-primary"></i> التقرير المالي للحصص:
                    </h6>
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <span class="fw-bold text-dark opacity-75">القيمة الإجمالية للتقسيم:</span>
                        <b class="fs-5 font-monospace text-dark">${fmt(total)} <small class="fs-6 fw-normal">د.أ</small></b>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mt-4 pt-3 border-top border-dark border-opacity-25">
                        <span class="fw-bold text-dark"><i class="fas fa-coins me-2"></i> ${shareLabel}</span>
                        <b class="fs-2 font-monospace text-primary" style="text-shadow: 0 1px 2px rgba(0,0,0,0.1);">${fmt(shareAmount)} <small class="fs-5 text-dark fw-normal">د.أ</small></b>
                    </div>
                    <div class="mt-3 text-start">
                        <small class="text-dark opacity-75 fw-bold"><i class="fas fa-info-circle me-1"></i> ${detailsNote}</small>
                    </div>
                `;
                
                // إظهار النتيجة مع حركة التلاشي الناعمة
                resDiv.classList.remove("d-none");
                resDiv.classList.add("fade-in");

                // استعادة حالة الزر
                btnCalc.innerHTML = originalBtnText;
                btnCalc.disabled = false;
            }, 300); // تأخير بسيط للإيحاء بالمعالجة
        });
    }
});