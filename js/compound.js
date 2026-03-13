document.addEventListener("DOMContentLoaded", function() {
    const calcCompBtn = document.getElementById("calcCompBtn");
    
    if(calcCompBtn) {
        calcCompBtn.addEventListener("click", function() {
            // جلب القيم؛ نستخدم 0 كقيمة افتراضية إذا ترك الحقل فارغاً لبعض المدخلات
            const principal = parseFloat(document.getElementById("compPrincipal").value) || 0;
            const monthlyAddition = parseFloat(document.getElementById("compAddition").value) || 0;
            const annualRate = parseFloat(document.getElementById("compRate").value);
            const years = parseFloat(document.getElementById("compYears").value);
            const resultDiv = document.getElementById("compResult");

            // التحقق من المدخلات الأساسية
            if (isNaN(annualRate) || isNaN(years) || annualRate < 0 || years <= 0 || (principal === 0 && monthlyAddition === 0)) {
                resultDiv.className = "mt-4 alert alert-danger";
                resultDiv.innerHTML = "يرجى إدخال أرقام صحيحة. لابد من وجود رأس مال أو مساهمة شهرية على الأقل، مع مدة زمنية ونسبة مئوية موجبة.";
                resultDiv.classList.remove("d-none");
                return;
            }

            const months = years * 12;
            const monthlyRate = (annualRate / 100) / 12;
            let futureValue = 0;
            const totalInvested = principal + (monthlyAddition * months);

            if (monthlyRate === 0) {
                // إذا كانت الفائدة صفر، الرصيد النهائي هو مجموع ما تم استثماره فقط
                futureValue = totalInvested;
            } else {
                // حساب القيمة المستقبلية لرأس المال الأساسي
                const fvPrincipal = principal * Math.pow(1 + monthlyRate, months);
                // حساب القيمة المستقبلية للمساهمات الشهرية المتكررة
                const fvAdditions = monthlyAddition * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
                
                futureValue = fvPrincipal + fvAdditions;
            }

            const totalInterest = futureValue - totalInvested;

            // عرض النتيجة
            resultDiv.className = "mt-4 alert alert-success";
            resultDiv.innerHTML = `
                <div class="row text-center">
                    <div class="col-md-4 border-end border-success">
                        <span class="d-block text-success mb-1" style="font-size: 0.9rem;">إجمالي المبلغ المستثمر</span>
                        <strong class="fs-4">${totalInvested.toFixed(2)}</strong>
                    </div>
                    <div class="col-md-4 border-end border-success">
                        <span class="d-block text-success mb-1" style="font-size: 0.9rem;">إجمالي الأرباح المتراكمة</span>
                        <strong class="fs-4">${totalInterest.toFixed(2)}</strong>
                    </div>
                    <div class="col-md-4">
                        <span class="d-block text-success mb-1" style="font-size: 0.9rem;">الرصيد النهائي</span>
                        <strong class="fs-4">${futureValue.toFixed(2)}</strong>
                    </div>
                </div>
            `;
            resultDiv.classList.remove("d-none");
        });
    }
});