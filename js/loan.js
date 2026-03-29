// js/loan.js
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("calcLoanBtn");
    if(btn) {
        btn.addEventListener("click", () => {
            const amount = parseFloat(document.getElementById("loanAmount").value);
            const rate = parseFloat(document.getElementById("loanRate").value);
            const term = parseInt(document.getElementById("loanTerm").value);
            const resDiv = document.getElementById("loanResult");

            if(isNaN(amount) || isNaN(rate) || isNaN(term) || amount <= 0 || rate <= 0 || term <= 0) {
                showAlert("يرجى إدخال قيم صحيحة وموجبة لجميع الحقول", "warning");
                resDiv.classList.add("d-none");
                return;
            }

            const monthlyRate = (rate / 100) / 12;
            const payment = (amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -term));
            const totalPaid = payment * term;
            const totalInterest = totalPaid - amount;

            resDiv.innerHTML = `
                <h6 class="fw-bold mb-3 text-success border-bottom pb-2">نتيجة الحساب:</h6>
                <div class="d-flex justify-content-between mb-2"><span>القسط الشهري:</span> <b class="fs-5">${payment.toFixed(2)} د.أ</b></div>
                <div class="d-flex justify-content-between mb-2"><span>إجمالي الفوائد:</span> <b>${totalInterest.toFixed(2)} د.أ</b></div>
                <div class="d-flex justify-content-between"><span>الإجمالي المسدد:</span> <b class="text-success">${totalPaid.toFixed(2)} د.أ</b></div>
            `;
            resDiv.classList.remove("d-none");
        });
    }
});