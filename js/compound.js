// js/compound.js
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("calcCompBtn");
    if(btn) {
        btn.addEventListener("click", () => {
            const principal = parseFloat(document.getElementById("compPrincipal").value);
            const addition = parseFloat(document.getElementById("compAddition").value) || 0;
            const rate = parseFloat(document.getElementById("compRate").value);
            const years = parseInt(document.getElementById("compYears").value);
            const resDiv = document.getElementById("compResult");

            if(isNaN(principal) || isNaN(rate) || isNaN(years) || principal < 0 || rate <= 0 || years <= 0) {
                showAlert("يرجى إدخال قيم صحيحة (المبلغ والمدة والنسبة)", "warning");
                resDiv.classList.add("d-none");
                return;
            }

            const r = rate / 100;
            const months = years * 12;
            let futureValue = principal;
            let totalContributions = principal;

            for(let i = 1; i <= months; i++) {
                futureValue += addition;
                futureValue *= (1 + (r / 12));
                totalContributions += addition;
            }

            const totalInterest = futureValue - totalContributions;

            resDiv.innerHTML = `
                <h6 class="fw-bold mb-3 text-primary border-bottom pb-2">نتيجة الحساب:</h6>
                <div class="d-flex justify-content-between mb-2"><span>إجمالي المساهمات:</span> <b>${totalContributions.toFixed(2)} د.أ</b></div>
                <div class="d-flex justify-content-between mb-2"><span>إجمالي الأرباح/الفائدة:</span> <b>${totalInterest.toFixed(2)} د.أ</b></div>
                <div class="d-flex justify-content-between"><span>القيمة المستقبلية:</span> <b class="text-primary fs-5">${futureValue.toFixed(2)} د.أ</b></div>
            `;
            resDiv.classList.remove("d-none");
        });
    }
});