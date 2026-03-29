// js/inheritance.js
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("calcInhBtn");
    if (btn) {
        btn.addEventListener("click", () => {
            const total = parseFloat(document.getElementById("inhTotal").value);
            const gender = document.getElementById("inhGender").value;
            const spouse = parseInt(document.getElementById("inhSpouse").value);
            const sons = parseInt(document.getElementById("inhSons").value) || 0;
            const daughters = parseInt(document.getElementById("inhDaughters").value) || 0;
            const father = parseInt(document.getElementById("inhFather").value);
            const mother = parseInt(document.getElementById("inhMother").value);
            
            const brothers = parseInt(document.getElementById("inhBrothers").value) || 0;
            const sisters = parseInt(document.getElementById("inhSisters").value) || 0;
            const maternalSiblings = parseInt(document.getElementById("inhMaternalSiblings").value) || 0;
            
            const resDiv = document.getElementById("inhResult");

            if (isNaN(total) || total <= 0) {
                showAlert("يرجى إدخال قيمة صحيحة للتركة الإجمالية.", "error");
                resDiv.classList.add("d-none");
                return;
            }

            if (gender === 'female' && spouse > 1) {
                showAlert("لا يمكن أن يكون للزوجة المتوفاة أكثر من زوج واحد.", "error");
                resDiv.classList.add("d-none");
                return;
            }

            let remaining = total;
            let shares = [];

            // 1. أصحاب الفروض
            const hasChildren = (sons > 0 || daughters > 0);
            
            // الزوج / الزوجة
            if (spouse > 0) {
                let spouseShareRate = 0;
                let spouseLabel = "";
                if (gender === 'male') {
                    spouseShareRate = hasChildren ? (1/8) : (1/4);
                    spouseLabel = spouse > 1 ? `الزوجات (${spouse})` : "الزوجة";
                } else {
                    spouseShareRate = hasChildren ? (1/4) : (1/2);
                    spouseLabel = "الزوج";
                }
                const spouseAmount = total * spouseShareRate;
                shares.push({ label: spouseLabel, amount: spouseAmount, note: `فرض ${spouseShareRate === 1/8 ? 'الثمن' : spouseShareRate === 1/4 ? 'الربع' : 'النصف'}` });
                remaining -= spouseAmount;
            }

            // الأب
            let fatherShare = 0;
            if (father === 1) {
                if (hasChildren) {
                    fatherShare = total * (1/6);
                    shares.push({ label: "الأب", amount: fatherShare, note: "فرض السدس" });
                    remaining -= fatherShare;
                }
            }

            // الأم
            let motherShare = 0;
            if (mother === 1) {
                const hasSiblingsGroup = (brothers + sisters + maternalSiblings) >= 2;
                const motherRate = (hasChildren || hasSiblingsGroup) ? (1/6) : (1/3);
                motherShare = total * motherRate;
                shares.push({ label: "الأم", amount: motherShare, note: `فرض ${motherRate === 1/6 ? 'السدس' : 'الثلث'}` });
                remaining -= motherShare;
            }

            // 2. العصبات والرد
            
            // الإخوة لأم
            if (maternalSiblings > 0 && !hasChildren && father === 0) {
                let matSibRate = maternalSiblings === 1 ? (1/6) : (1/3);
                let matSibAmount = total * matSibRate;
                if(matSibAmount > remaining) matSibAmount = remaining; 
                shares.push({ label: `الإخوة لأم (${maternalSiblings})`, amount: matSibAmount, note: `فرض ${matSibRate === 1/6 ? 'السدس' : 'الثلث'} بالتساوي` });
                remaining -= matSibAmount;
            }

            // الأبناء والبنات
            if (sons > 0 || daughters > 0) {
                if (sons > 0) {
                    const totalParts = (sons * 2) + daughters;
                    const partValue = remaining / totalParts;
                    if (sons > 0) shares.push({ label: `الأبناء الذكور (${sons})`, amount: partValue * 2 * sons, note: "عصبة (للذكر مثل حظ الأنثيين)" });
                    if (daughters > 0) shares.push({ label: `البنات (${daughters})`, amount: partValue * daughters, note: "عصبة بالغير" });
                    remaining = 0;
                } else {
                    let daughtersRate = daughters === 1 ? (1/2) : (2/3);
                    let daughtersAmount = total * daughtersRate;
                    if(daughtersAmount > remaining) daughtersAmount = remaining;
                    shares.push({ label: `البنات (${daughters})`, amount: daughtersAmount, note: `فرض ${daughtersRate === 1/2 ? 'النصف' : 'الثلثين'}` });
                    remaining -= daughtersAmount;
                }
            }

            // الأب كعصبة
            if (father === 1 && sons === 0 && remaining > 0) {
                shares.push({ label: "الأب (عصبة)", amount: remaining, note: "الباقي تعصيباً" });
                remaining = 0;
            }

            // الإخوة الأشقاء
            if (remaining > 0 && father === 0 && sons === 0) {
                if (brothers > 0 || sisters > 0) {
                    if (brothers > 0) {
                        const totalParts = (brothers * 2) + sisters;
                        const partValue = remaining / totalParts;
                        if (brothers > 0) shares.push({ label: `الإخوة الأشقاء (${brothers})`, amount: partValue * 2 * brothers, note: "عصبة (للذكر مثل حظ الأنثيين)" });
                        if (sisters > 0) shares.push({ label: `الأخوات الشقيقات (${sisters})`, amount: partValue * sisters, note: "عصبة بالغير" });
                        remaining = 0;
                    } else {
                        let sistersRate = sisters === 1 ? (1/2) : (2/3);
                        let sistersAmount = total * sistersRate;
                        if(sistersAmount > remaining) sistersAmount = remaining; 
                        shares.push({ label: `الأخوات الشقيقات (${sisters})`, amount: sistersAmount, note: `فرض ${sistersRate === 1/2 ? 'النصف' : 'الثلثين'}` });
                        remaining -= sistersAmount;
                    }
                }
            }

            // بناء الواجهة
            let html = `<h6 class="fw-bold mb-3 text-dark border-bottom pb-2"><i class="fas fa-balance-scale"></i> الأنصبة الشرعية التقديرية:</h6><ul class="list-group mb-3">`;
            
            shares.forEach(s => {
                html += `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        <b class="text-navy">${s.label}</b>
                        <small class="d-block text-muted">${s.note}</small>
                    </div>
                    <b class="text-success fs-6">${s.amount.toFixed(2)} د.أ</b>
                </li>`;
            });
            
            html += `</ul>`;
            
            if (Math.abs(remaining) > 0.01) {
                if (remaining > 0) {
                    html += `<div class="alert alert-warning small p-2"><i class="fas fa-info-circle"></i> يوجد باقي في التركة (${remaining.toFixed(2)} د.أ) يُرد على أصحاب الفروض أو يذهب لذوي الأرحام وفق القانون.</div>`;
                } else {
                    html += `<div class="alert alert-danger small p-2"><i class="fas fa-exclamation-triangle"></i> المسألة عائلة (مجموع السهام أكبر من التركة)، تم تطبيق التخفيض النسبي.</div>`;
                }
            }

            resDiv.innerHTML = html;
            resDiv.className = "mt-4 p-3 bg-white border border-dark shadow-sm rounded-3";
            resDiv.classList.remove("d-none");
        });
    }
});