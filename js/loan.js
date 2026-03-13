document.addEventListener("DOMContentLoaded", function() {
    const calcLoanBtn = document.getElementById("calcLoanBtn");
    
    if(calcLoanBtn) {
        calcLoanBtn.addEventListener("click", function() {
            // جلب القيم من الحقول
            const amount = parseFloat(document.getElementById("loanAmount").value);
            const annualRate = parseFloat(document.getElementById("loanRate").value);
            const months = parseInt(document.getElementById("loanTerm").value);
            const resultDiv = document.getElementById("loanResult");

            // التحقق من صحة المدخلات
            if (isNaN(amount) || isNaN(annualRate) || isNaN(months) || amount <= 0 || annualRate < 0 || months <= 0) {
                resultDiv.className = "mt-4 alert alert-danger";
                resultDiv.innerHTML = "يرجى إدخال أرقام صحيحة وموجبة في جميع الحقول.";
                resultDiv.classList.remove("d-none");
                return;
            }

            // الحسابات المالية
            const monthlyRate = (annualRate / 100) / 12;
            let monthlyPayment = 0;
            let totalPayment = 0;
            let totalInterest = 0;

            if (monthlyRate === 0) {
                // حالة القرض الحسن (بدون فائدة)
                monthlyPayment = amount / months;
                totalPayment = amount;
                totalInterest = 0;
            } else {
                // معادلة القسط الشهري (Amortization Formula)
                monthlyPayment = (amount * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
                totalPayment = monthlyPayment * months;
                totalInterest = totalPayment - amount;
            }

            // عرض النتيجة بشكل منظم
            resultDiv.className = "mt-4 alert alert-success";
            resultDiv.innerHTML = `
                <div class="row text-center">
                    <div class="col-md-4 border-end border-success">
                        <span class="d-block text-success mb-1" style="font-size: 0.9rem;">القسط الشهري</span>
                        <strong class="fs-4">${monthlyPayment.toFixed(2)}</strong>
                    </div>
                    <div class="col-md-4 border-end border-success">
                        <span class="d-block text-success mb-1" style="font-size: 0.9rem;">إجمالي الفوائد</span>
                        <strong class="fs-4">${totalInterest.toFixed(2)}</strong>
                    </div>
                    <div class="col-md-4">
                        <span class="d-block text-success mb-1" style="font-size: 0.9rem;">إجمالي السداد</span>
                        <strong class="fs-4">${totalPayment.toFixed(2)}</strong>
                    </div>
                </div>
            `;
            resultDiv.classList.remove("d-none");
        });
    }
});