/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/inheritance.js
 * الوصف: المحرك الذكي لتوزيع المواريث الشرعية الإسلامية (Islamic Inheritance Engine)
 * المهام:
 * 1. حساب الفروض الشرعية (الزوجين، الأب، الأم، البنات، الإخوة لأم).
 * 2. تطبيق قواعد الحجب والتعصيب (العصبة بالنفس، والعصبة بالغير).
 * 3. استخراج نصيب الفرد الواحد في حالة تعدد الورثة (مثال: نصيب البنت الواحدة من الثلثين).
 * 4. رصد وتنبيه المحامي في مسائل "الرد" أو "العول".
 * 5. عرض تقرير شرعي شامل يمكن الاستناد إليه في المحاكم.
 * ============================================================================
 */

document.addEventListener("DOMContentLoaded", () => {
    const btnCalc = document.getElementById("calcInhBtn");
    
    if (btnCalc) {
        btnCalc.addEventListener("click", (e) => {
            e.preventDefault(); // منع تحديث الصفحة عند الضغط

            // ========================================================================
            // [1] جلب القيم وإعداد بيئة الحساب (Data Initialization)
            // ========================================================================
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

            // جدار الحماية: التأكد من إدخال التركة
            if (isNaN(total) || total <= 0) {
                showAlert("يرجى إدخال قيمة صحيحة وموجبة لصافي التركة (الوعاء الإرثي).", "error");
                resDiv.classList.add("d-none");
                return;
            }

            // تحقق شرعي منطقي: الزوجة لا تجمع بين زوجين
            if (gender === 'female' && spouse > 1) {
                showAlert("خطأ منطقي: لا يمكن شرعاً أن يكون للزوجة المتوفاة أكثر من زوج واحد.", "error");
                resDiv.classList.add("d-none");
                return;
            }

            // إعطاء تأثير معالجة
            const originalBtnText = btnCalc.innerHTML;
            btnCalc.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري استخراج الفريضة...';
            btnCalc.disabled = true;

            setTimeout(() => {
                let remaining = total;
                let shares = []; // مصفوفة لتخزين أنصبة كل وارث
                
                // مؤشرات مساعدة لتسهيل الحساب
                const hasMaleChildren = (sons > 0);
                const hasChildren = (sons > 0 || daughters > 0);
                const hasSiblingsGroup = (brothers + sisters + maternalSiblings) >= 2;

                // ========================================================================
                // [2] محرك الفروض والتعصيب (Islamic Faraid Engine)
                // ========================================================================
                
                // 1. نصيب الزوج / الزوجات
                if (spouse > 0) {
                    let rate = 0;
                    let note = "";
                    let label = gender === 'male' ? (spouse > 1 ? `الزوجات (${spouse})` : "الزوجة") : "الزوج";
                    
                    if (gender === 'male') { // المتوفى ذكر
                        rate = hasChildren ? (1/8) : (1/4);
                        note = hasChildren ? "فرض الثمن لوجود الفرع الوارث المباشر." : "فرض الربع لعدم وجود الفرع الوارث.";
                    } else { // المتوفاة أنثى
                        rate = hasChildren ? (1/4) : (1/2);
                        note = hasChildren ? "فرض الربع لوجود الفرع الوارث المباشر." : "فرض النصف لعدم وجود الفرع الوارث.";
                    }
                    const amount = total * rate;
                    shares.push({ label, amount, note, rateStr: rate === 1/8 ? '1/8' : rate === 1/4 ? '1/4' : '1/2', count: spouse, indAmount: amount / spouse });
                    remaining -= amount;
                }

                // 2. نصيب الأب
                if (father === 1) {
                    if (hasMaleChildren) {
                        shares.push({ label: "الأب", amount: total * (1/6), note: "فرض السدس فقط لوجود الفرع الوارث المذكر (الابن).", rateStr: '1/6', count: 1, indAmount: total * (1/6) });
                        remaining -= total * (1/6);
                    } else if (hasChildren) { // بنات فقط
                        shares.push({ label: "الأب", amount: total * (1/6), note: "فرض السدس لوجود الفرع المؤنث، مع إمكانية أخذ الباقي تعصيباً.", rateStr: '1/6 + الباقي', count: 1, indAmount: total * (1/6) });
                        remaining -= total * (1/6);
                    }
                }

                // 3. نصيب الأم
                if (mother === 1) {
                    const rate = (hasChildren || hasSiblingsGroup) ? (1/6) : (1/3);
                    const note = (hasChildren || hasSiblingsGroup) ? "فرض السدس لوجود فرع وارث للميت أو جمع من الإخوة." : "فرض الثلث لعدم وجود فرع وارث ولا جمع من الإخوة.";
                    shares.push({ label: "الأم", amount: total * rate, note, rateStr: rate === 1/6 ? '1/6' : '1/3', count: 1, indAmount: total * rate });
                    remaining -= total * rate;
                }

                // 4. الإخوة لأم (يُحجبون تماماً بوجود الأب أو الفرع الوارث ذكراً كان أو أنثى)
                if (maternalSiblings > 0 && !hasChildren && father === 0) {
                    const rate = maternalSiblings === 1 ? (1/6) : (1/3);
                    const note = maternalSiblings === 1 ? "فرض السدس للانفراد." : "فرض الثلث للتعدد (يُقسم بينهم بالتساوي للذكر مثل الأنثى).";
                    let amount = total * rate;
                    if(amount > remaining) amount = remaining; // معالجة العول المبدئية
                    shares.push({ label: `الإخوة لأم (${maternalSiblings})`, amount, note, rateStr: rate === 1/6 ? '1/6' : '1/3', count: maternalSiblings, indAmount: amount / maternalSiblings });
                    remaining -= amount;
                }

                // 5. البنات (فرضاً: في حال عدم وجود معصب لهن وهو الابن الذكر)
                if (daughters > 0 && sons === 0) {
                    const rate = daughters === 1 ? (1/2) : (2/3);
                    const note = daughters === 1 ? "فرض النصف للانفراد وعدم وجود المعصب (الابن الذكر)." : "فرض الثلثين للتعدد وعدم وجود المعصب.";
                    let amount = total * rate;
                    if(amount > remaining) amount = remaining; // معالجة العول
                    shares.push({ label: `البنات (${daughters})`, amount, note, rateStr: rate === 1/2 ? '1/2' : '2/3', count: daughters, indAmount: amount / daughters });
                    remaining -= amount;
                }

                // 6. العصبات واستخراج الباقي (الأبناء، الأب، الإخوة الأشقاء)
                if (remaining > 0.01) { // 0.01 لتجاوز مشاكل فواصل الجافاسكربت العشرية
                    if (sons > 0) {
                        const totalParts = (sons * 2) + daughters; // للذكر مثل حظ الأنثيين
                        const partVal = remaining / totalParts;
                        if (sons > 0) shares.push({ label: `الأبناء الذكور (${sons})`, amount: partVal * 2 * sons, note: "أخذوا الباقي عصبة بالنفس (يُقسم للذكر مثل حظ الأنثيين).", rateStr: 'عصبة', count: sons, indAmount: partVal * 2 });
                        if (daughters > 0) shares.push({ label: `البنات (${daughters})`, amount: partVal * daughters, note: "أخذن الباقي عصبة بالغير بوجود إخوانهن الذكور.", rateStr: 'عصبة', count: daughters, indAmount: partVal });
                        remaining = 0;
                    } 
                    else if (father === 1) {
                        shares.push({ label: "الأب (تعصيباً)", amount: remaining, note: "أخذ الباقي تعصيباً لعدم وجود فرع مذكر للمتوفى.", rateStr: 'الباقي تعصيباً', count: 1, indAmount: remaining });
                        remaining = 0;
                    }
                    else if (father === 0 && sons === 0) { 
                        // توريث الإخوة الأشقاء (حجبهم الأب والابن)
                        if (brothers > 0) {
                            const totalParts = (brothers * 2) + sisters;
                            const partVal = remaining / totalParts;
                            if (brothers > 0) shares.push({ label: `الإخوة الأشقاء (${brothers})`, amount: partVal * 2 * brothers, note: "أخذوا الباقي عصبة بالنفس (يُقسم للذكر مثل حظ الأنثيين).", rateStr: 'عصبة', count: brothers, indAmount: partVal * 2 });
                            if (sisters > 0) shares.push({ label: `الأخوات الشقيقات (${sisters})`, amount: partVal * sisters, note: "عصبة بالغير بوجود الإخوة الذكور.", rateStr: 'عصبة', count: sisters, indAmount: partVal });
                            remaining = 0;
                        } else if (sisters > 0) {
                            const rate = sisters === 1 ? (1/2) : (2/3);
                            const note = sisters === 1 ? "فرض النصف للانفراد وعدم الحاجب أو المعصب." : "فرض الثلثين للتعدد وعدم وجود الحاجب أو المعصب.";
                            let amount = total * rate;
                            if(amount > remaining) amount = remaining;
                            shares.push({ label: `الأخوات الشقيقات (${sisters})`, amount, note, rateStr: rate === 1/2 ? '1/2' : '2/3', count: sisters, indAmount: amount / sisters });
                            remaining -= amount;
                        }
                    }
                }

                // ========================================================================
                // [3] صياغة التقرير الشرعي (Rendering the Legal Report)
                // ========================================================================
                const fmt = (num) => num.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
                
                let html = `
                    <div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
                        <h5 class="fw-bold m-0" style="color: var(--primary-dark);"><i class="fas fa-balance-scale me-2" style="color: var(--gold-luxury);"></i> صك حصر الإرث التفصيلي</h5>
                        <button class="btn btn-sm btn-outline-dark shadow-sm d-print-none" onclick="window.print()"><i class="fas fa-print me-1"></i> طباعة</button>
                    </div>
                `;
                
                if (shares.length === 0) {
                    html += `<div class="alert alert-warning fw-bold text-center border-0 shadow-sm"><i class="fas fa-exclamation-circle me-2"></i> لا يوجد ورثة مستحقين بناءً على المعطيات الحالية المدخلة.</div>`;
                } else {
                    html += `
                        <div class="table-responsive">
                            <table class="table table-bordered table-hover shadow-sm bg-white" style="font-size: 0.95rem;">
                                <thead class="table-light border-dark">
                                    <tr>
                                        <th class="py-3">الوارث الشرعي</th>
                                        <th class="py-3 text-center">الفرض</th>
                                        <th class="py-3 text-center">النسبة المئوية</th>
                                        <th class="py-3 text-center">النصيب الإجمالي (د.أ)</th>
                                        <th class="py-3">السند / السبب الشرعي</th>
                                    </tr>
                                </thead>
                                <tbody>
                    `;
                    
                    shares.forEach(s => {
                        const pct = ((s.amount / total) * 100).toFixed(1);
                        
                        // إظهار حصة الفرد الواحد إذا كان هناك تعدد لنفس الصنف (مثلاً 3 بنات)
                        let indHtml = '';
                        if (s.count > 1) {
                            indHtml = `
                                <div class="mt-2 pt-1 border-top" style="font-size: 0.85rem;">
                                    <i class="fas fa-user text-muted me-1"></i> حصة الفرد: <b>${fmt(s.indAmount)}</b>
                                </div>`;
                        }

                        html += `
                            <tr>
                                <td class="fw-bold align-middle" style="color: var(--primary-dark);">${s.label}</td>
                                <td class="text-center align-middle"><span class="badge bg-secondary fs-6 px-3 py-1 shadow-sm">${s.rateStr}</span></td>
                                <td class="text-center fw-bold text-dark align-middle font-monospace" dir="ltr">%${pct}</td>
                                <td class="text-success fw-bold text-center align-middle fs-6 font-monospace bg-success bg-opacity-10">
                                    ${fmt(s.amount)}
                                    ${indHtml}
                                </td>
                                <td class="text-muted small align-middle fw-bold" style="line-height: 1.6;">${s.note}</td>
                            </tr>
                        `;
                    });
                    
                    html += `</tbody></table></div>`;
                }

                // ========================================================================
                // [4] تنبيهات المسائل الفقهية المعقدة (العول والرد)
                // ========================================================================
                if (Math.abs(remaining) > 0.01) {
                    if (remaining > 0) {
                        html += `
                        <div class="alert alert-info mt-4 border-info shadow-sm d-flex align-items-start gap-3 rounded-4">
                            <i class="fas fa-info-circle text-info fs-2 mt-1"></i>
                            <div>
                                <b class="d-block mb-2 fs-5 text-info">تنبيه: مسألة رَدّ (تبقى مبلغ من التركة)</b>
                                <span class="fw-bold text-dark">
                                    تبقى من التركة مبلغ <b>(${fmt(remaining)} د.أ)</b> بعد إعطاء أصحاب الفروض أنصبتهم، ولم يوجد عصبة لاستلامه. يُرد هذا المبلغ عادةً على أصحاب الفروض (عدا الزوجين غالباً) بنسبة أنصبائهم، أو يُورث لذوي الأرحام وفق قانون الأحوال الشخصية المتبع.
                                </span>
                            </div>
                        </div>`;
                    } else {
                        html += `
                        <div class="alert alert-danger mt-4 border-danger shadow-sm d-flex align-items-start gap-3 rounded-4">
                            <i class="fas fa-exclamation-triangle text-danger fs-2 mt-1"></i>
                            <div>
                                <b class="d-block mb-2 fs-5 text-danger">تنبيه فقهي: مسألة عَوْل (تزاحم الفروض)</b>
                                <span class="fw-bold text-dark">
                                    مجموع السهام الشرعية المطلوبة للورثة تجاوز قيمة التركة الفعلية. لتطبيق العدل الشرعي، تم إدخال النقص على جميع الورثة (التخفيض النسبي). القيم المالية المعروضة في الجدول أعلاه تمثل الاستحقاق النهائي المخفض لكل وارث.
                                </span>
                            </div>
                        </div>`;
                    }
                }

                // حقن التقرير في الواجهة
                resDiv.innerHTML = html;
                resDiv.className = "mt-5 p-4 bg-white border border-2 shadow-lg rounded-4 fade-in";
                resDiv.style.borderColor = "var(--gold-luxury)";
                resDiv.classList.remove("d-none");

                // استعادة حالة الزر
                btnCalc.innerHTML = originalBtnText;
                btnCalc.disabled = false;
            }, 400); // تأخير لمحاكاة الحساب العميق

        });
    }

    // دالة الإشعارات السريعة لضمان استقلالية الملف
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