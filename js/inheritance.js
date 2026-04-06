// js/inheritance.js - حاسبة المواريث الشرعية (تقرير مفصل مع تفصيل حصة الفرد الواحد)

document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("calcInhBtn");
    if (btn) {
        btn.addEventListener("click", (e) => {
            e.preventDefault(); // منع تحديث الصفحة

            // جلب القيم من الحقول
            const total = parseFloat(document.getElementById("inhTotal").value);
            const gender = document.getElementById("inhGender").value;
            const spouse = parseInt(document.getElementById("inhSpouse").value) || 0;
            const sons = parseInt(document.getElementById("inhSons").value) || 0;
            const daughters = parseInt(document.getElementById("inhDaughters").value) || 0;
            const father = parseInt(document.getElementById("inhFather").value) || 0;
            const mother = parseInt(document.getElementById("inhMother").value) || 0;
            
            const brothers = parseInt(document.getElementById("inhBrothers").value) || 0;
            const sisters = parseInt(document.getElementById("inhSisters").value) || 0;
            const maternalSiblings = parseInt(document.getElementById("inhMaternalSiblings").value) || 0;
            
            const resDiv = document.getElementById("inhResult");

            // التحققات الأولية
            if (isNaN(total) || total <= 0) {
                showAlert("يرجى إدخال قيمة صحيحة وموجبة للتركة الإجمالية.", "error");
                resDiv.classList.add("d-none");
                return;
            }

            if (gender === 'female' && spouse > 1) {
                showAlert("لا يمكن شرعاً أن يكون للزوجة أكثر من زوج واحد.", "error");
                resDiv.classList.add("d-none");
                return;
            }

            let remaining = total;
            let shares = [];
            const hasMaleChildren = (sons > 0);
            const hasChildren = (sons > 0 || daughters > 0);
            const hasSiblingsGroup = (brothers + sisters + maternalSiblings) >= 2;

            // 1. حساب نصيب الزوج / الزوجة
            if (spouse > 0) {
                let rate = 0;
                let note = "";
                let label = gender === 'male' ? (spouse > 1 ? `الزوجات (${spouse})` : "الزوجة") : "الزوج";
                if (gender === 'male') {
                    rate = hasChildren ? (1/8) : (1/4);
                    note = hasChildren ? "فرض الثمن لوجود الفرع الوارث المباشر." : "فرض الربع لعدم وجود الفرع الوارث.";
                } else {
                    rate = hasChildren ? (1/4) : (1/2);
                    note = hasChildren ? "فرض الربع لوجود الفرع الوارث المباشر." : "فرض النصف لعدم وجود الفرع الوارث.";
                }
                const amount = total * rate;
                shares.push({ label, amount, note, rateStr: rate === 1/8 ? '1/8' : rate === 1/4 ? '1/4' : '1/2', count: spouse, indAmount: amount / spouse });
                remaining -= amount;
            }

            // 2. حساب نصيب الأب
            if (father === 1) {
                if (hasMaleChildren) {
                    shares.push({ label: "الأب", amount: total * (1/6), note: "فرض السدس فقط لوجود الفرع الوارث المذكر (الابن).", rateStr: '1/6', count: 1, indAmount: total * (1/6) });
                    remaining -= total * (1/6);
                } else if (hasChildren) { // بنات فقط
                    shares.push({ label: "الأب", amount: total * (1/6), note: "فرض السدس لوجود الفرع المؤنث، مع إمكانية أخذ الباقي تعصيباً.", rateStr: '1/6 + ع', count: 1, indAmount: total * (1/6) });
                    remaining -= total * (1/6);
                }
            }

            // 3. حساب نصيب الأم
            if (mother === 1) {
                const rate = (hasChildren || hasSiblingsGroup) ? (1/6) : (1/3);
                const note = (hasChildren || hasSiblingsGroup) ? "فرض السدس لوجود فرع وارث للميت أو جمع من الإخوة." : "فرض الثلث لعدم وجود فرع وارث ولا جمع من الإخوة.";
                shares.push({ label: "الأم", amount: total * rate, note, rateStr: rate === 1/6 ? '1/6' : '1/3', count: 1, indAmount: total * rate });
                remaining -= total * rate;
            }

            // 4. الإخوة لأم (يُحجبون تماماً بوجود الأب أو الفرع الوارث)
            if (maternalSiblings > 0 && !hasChildren && father === 0) {
                const rate = maternalSiblings === 1 ? (1/6) : (1/3);
                const note = maternalSiblings === 1 ? "فرض السدس للانفراد." : "فرض الثلث للتعدد (يُقسم بينهم بالتساوي للذكر مثل الأنثى).";
                let amount = total * rate;
                if(amount > remaining) amount = remaining; // معالجة العول البسيطة
                shares.push({ label: `الإخوة لأم (${maternalSiblings})`, amount, note, rateStr: rate === 1/6 ? '1/6' : '1/3', count: maternalSiblings, indAmount: amount / maternalSiblings });
                remaining -= amount;
            }

            // 5. البنات (في حال عدم وجود أبناء ذكور يعصبوهن)
            if (daughters > 0 && sons === 0) {
                const rate = daughters === 1 ? (1/2) : (2/3);
                const note = daughters === 1 ? "فرض النصف للانفراد وعدم وجود المعصب (الابن الذكر)." : "فرض الثلثين للتعدد وعدم وجود المعصب.";
                let amount = total * rate;
                if(amount > remaining) amount = remaining; // معالجة العول البسيطة
                shares.push({ label: `البنات (${daughters})`, amount, note, rateStr: rate === 1/2 ? '1/2' : '2/3', count: daughters, indAmount: amount / daughters });
                remaining -= amount;
            }

            // 6. العصبات واستخراج الباقي (الأبناء، الأب، الإخوة الأشقاء)
            if (remaining > 0.01) { // 0.01 لتجاوز فواصل الجافاسكربت العشرية
                if (sons > 0) {
                    const totalParts = (sons * 2) + daughters;
                    const partVal = remaining / totalParts;
                    if (sons > 0) shares.push({ label: `الأبناء الذكور (${sons})`, amount: partVal * 2 * sons, note: "أخذوا الباقي عصبة بالنفس (يُقسم للذكر مثل حظ الأنثيين).", rateStr: 'عصبة', count: sons, indAmount: partVal * 2 });
                    if (daughters > 0) shares.push({ label: `البنات (${daughters})`, amount: partVal * daughters, note: "أخذن الباقي عصبة بالغير بوجود إخوانهن الذكور.", rateStr: 'عصبة', count: daughters, indAmount: partVal });
                    remaining = 0;
                } 
                else if (father === 1) {
                    shares.push({ label: "الأب (كعصبة)", amount: remaining, note: "أخذ الباقي تعصيباً لعدم وجود فرع مذكر للمتوفى.", rateStr: 'الباقي تعصيباً', count: 1, indAmount: remaining });
                    remaining = 0;
                }
                else if (father === 0 && sons === 0) { // الإخوة الأشقاء
                    if (brothers > 0) {
                        const totalParts = (brothers * 2) + sisters;
                        const partVal = remaining / totalParts;
                        if (brothers > 0) shares.push({ label: `الإخوة الأشقاء (${brothers})`, amount: partVal * 2 * brothers, note: "أخذوا الباقي عصبة بالنفس (يُقسم للذكر مثل حظ الأنثيين).", rateStr: 'عصبة', count: brothers, indAmount: partVal * 2 });
                        if (sisters > 0) shares.push({ label: `الأخوات الشقيقات (${sisters})`, amount: partVal * sisters, note: "عصبة بالغير بوجود الإخوة الذكور.", rateStr: 'عصبة', count: sisters, indAmount: partVal });
                        remaining = 0;
                    } else if (sisters > 0) {
                        const rate = sisters === 1 ? (1/2) : (2/3);
                        const note = sisters === 1 ? "فرض النصف للانفراد وعدم الحاجب." : "فرض الثلثين للتعدد وعدم المعصب.";
                        let amount = total * rate;
                        if(amount > remaining) amount = remaining;
                        shares.push({ label: `الأخوات الشقيقات (${sisters})`, amount, note, rateStr: rate === 1/2 ? '1/2' : '2/3', count: sisters, indAmount: amount / sisters });
                        remaining -= amount;
                    }
                }
            }

            // 7. بناء الواجهة التفصيلية للنتائج (التقرير الشرعي)
            let html = `<h5 class="fw-bold mb-3 text-navy border-bottom pb-2"><i class="fas fa-balance-scale text-accent me-2"></i> التقرير الشرعي المفصل:</h5>`;
            
            if (shares.length === 0) {
                html += `<div class="alert alert-warning fw-bold">لا يوجد ورثة مستحقين بناءً على المدخلات الحالية.</div>`;
            } else {
                html += `<div class="table-responsive"><table class="table table-bordered table-hover shadow-sm bg-white" style="font-size:0.9rem;">
                            <thead class="table-light">
                                <tr>
                                    <th>الوارث</th>
                                    <th class="text-center">نصيبه (الفرض)</th>
                                    <th class="text-center">النسبة المئوية</th>
                                    <th class="text-center">الإجمالي (د.أ)</th>
                                    <th>السبب الشرعي</th>
                                </tr>
                            </thead>
                            <tbody>`;
                
                shares.forEach(s => {
                    const pct = ((s.amount / total) * 100).toFixed(1);
                    
                    // إظهار حصة الفرد إذا كان العدد أكبر من 1
                    let indHtml = '';
                    if (s.count > 1) {
                        indHtml = `<div class="text-info mt-1" style="font-size: 0.8rem;"><i class="fas fa-user"></i> للفرد: ${s.indAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>`;
                    }

                    html += `
                    <tr>
                        <td class="fw-bold text-navy align-middle">${s.label}</td>
                        <td class="text-center align-middle"><span class="badge bg-secondary fs-6">${s.rateStr}</span></td>
                        <td class="text-center fw-bold text-dark align-middle" dir="ltr">%${pct}</td>
                        <td class="text-success fw-bold text-center align-middle fs-6">
                            ${s.amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            ${indHtml}
                        </td>
                        <td class="text-muted small align-middle" style="line-height: 1.4;">${s.note}</td>
                    </tr>`;
                });
                
                html += `</tbody></table></div>`;
            }

            // 8. تنبيهات الرد والعول إن وجدت
            if (Math.abs(remaining) > 0.01) {
                if (remaining > 0) {
                    html += `
                    <div class="alert alert-info mt-3 border-info shadow-sm d-flex align-items-start gap-2">
                        <i class="fas fa-info-circle text-info fs-4 mt-1"></i>
                        <div>
                            <b class="d-block mb-1">مسألة رَدّ (تبقى مبلغ من التركة):</b>
                            <span class="small">تبقى من التركة مبلغ <b>(${remaining.toFixed(2)} د.أ)</b> بعد إعطاء أصحاب الفروض. يُرد هذا المبلغ على أصحاب الفروض (عدا الزوجين غالباً) بنسبة أنصبائهم، أو يُورث لذوي الأرحام وفق قانون الأحوال الشخصية المتبع.</span>
                        </div>
                    </div>`;
                } else {
                    html += `
                    <div class="alert alert-danger mt-3 border-danger shadow-sm d-flex align-items-start gap-2">
                        <i class="fas fa-exclamation-triangle text-danger fs-4 mt-1"></i>
                        <div>
                            <b class="d-block mb-1">مسألة عَوْل (زيادة السهام عن التركة):</b>
                            <span class="small">مجموع السهام الشرعية تجاوز قيمة التركة. لتطبيق العدل تم إدخال النقص على جميع الورثة (التخفيض النسبي). القيم المعروضة في الجدول أعلاه تمثل الاستحقاق النهائي المخفض.</span>
                        </div>
                    </div>`;
                }
            }

            resDiv.innerHTML = html;
            resDiv.className = "mt-4 p-3 bg-light border border-2 border-primary shadow-lg rounded-3 fade-in";
            resDiv.classList.remove("d-none");
        });
    }

    // دالة الإشعارات السريعة (مضمنة لتجنب أي نقص)
    function showAlert(message, type = 'success') {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: type === 'danger' ? 'error' : (type === 'warning' ? 'warning' : 'success'),
                title: message,
                showConfirmButton: false,
                timer: 3000
            });
        } else {
            alert(message);
        }
    }
});