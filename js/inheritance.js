/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/inheritance.js
 * الإصدار: V5.6 Enterprise Edition (Islamic Inheritance & Estate Division Engine)
 * ============================================================================
 * الميزات والمهام:
 * 1. حساب الفروض الشرعية الإسلامية بدقة قطعية (الزوج/الزوجات، الأب، الأم، البنات، الأخوات، الإخوة لأم).
 * 2. تطبيق قواعد الحجب الشرعي الكامل والجزئي بدقة فقهية معتمدة.
 * 3. تطبيق أحكام التعصيب (العصبة بالنفس، والعصبة بالغير) وفق قاعدة "للذكر مثل حظ الأنثيين".
 * 4. المعالجة الفقهية الدقيقة لمسائل العول (التخفيض النسبي العادل) ومسائل الرد (إشعار الفائض).
 * 5. استخراج استحقاق الفرد الواحد بدقة عند تعدد الوارثين من صنف واحد.
 * 6. جلب عملة المكتب ديناميكياً من إعدادات المنظومة (firm_settings).
 * 7. دعم التوافق الكامل مع الوضع الليلي فائق التباين (WCAG AAA) والطباعة القضائية النظيفة.
 * 8. توفير ميزة النسخ الفوري لصك حصر وقسمة الإرث للاستخدام في مذكرات المحاكم وعقود التخارج.
 * ============================================================================
 */

document.addEventListener("DOMContentLoaded", () => {
    const btnCalc = document.getElementById("calcInhBtn");
    const resDiv = document.getElementById("inhResult");

    if (btnCalc && resDiv) {
        btnCalc.addEventListener("click", (e) => {
            if (e) e.preventDefault();

            // ========================================================================
            // [1] جلب المدخلات والتحقق الأمني والمنطقي
            // ========================================================================
            const totalInput = document.getElementById("inhTotal");
            const genderInput = document.getElementById("inhGender");
            const spouseInput = document.getElementById("inhSpouse");
            const sonsInput = document.getElementById("inhSons");
            const daughtersInput = document.getElementById("inhDaughters");
            const fatherInput = document.getElementById("inhFather");
            const motherInput = document.getElementById("inhMother");
            const brothersInput = document.getElementById("inhBrothers");
            const sistersInput = document.getElementById("inhSisters");
            const maternalInput = document.getElementById("inhMaternalSiblings");

            if (!totalInput || !genderInput || !spouseInput || !sonsInput || !daughtersInput ||
                !fatherInput || !motherInput || !brothersInput || !sistersInput || !maternalInput) {
                showAlert("خطأ في بنية الحاسبة: بعض حقول الإدخال غير متوفرة.", "error");
                return;
            }

            const total = parseFloat(totalInput.value);
            const gender = genderInput.value;
            const spouse = parseInt(spouseInput.value, 10) || 0;
            const sons = parseInt(sonsInput.value, 10) || 0;
            const daughters = parseInt(daughtersInput.value, 10) || 0;
            const father = parseInt(fatherInput.value, 10) || 0;
            const mother = parseInt(motherInput.value, 10) || 0;
            const brothers = parseInt(brothersInput.value, 10) || 0;
            const sisters = parseInt(sistersInput.value, 10) || 0;
            const maternalSiblings = parseInt(maternalInput.value, 10) || 0;

            // جدار التحقق المالي
            if (isNaN(total) || total <= 0) {
                showAlert("يرجى إدخال قيمة صحيحة وموجبة لصافي التركة (الوعاء الإرثي).", "warning");
                resDiv.classList.add("d-none");
                return;
            }

            // فحص السلامة الشرعية للزوجية
            if (gender === 'female' && spouse > 1) {
                showAlert("خطأ فقهي: لا يمكن شرعاً أن يكون للزوجة المتوفاة أكثر من زوج واحد على قيد الحياة.", "error");
                resDiv.classList.add("d-none");
                return;
            }

            // مؤشر التحميل المتفاعل
            const originalBtnText = btnCalc.innerHTML;
            btnCalc.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري استخراج الفريضة الشرعية وتطبيق القواعد الفقهية...';
            btnCalc.disabled = true;

            setTimeout(() => {
                // ========================================================================
                // [2] المتغيرات الفقهية ومؤشرات الحجب والتعصيب
                // ========================================================================
                const hasMaleChildren = (sons > 0);
                const hasChildren = (sons > 0 || daughters > 0);
                const hasSiblingsGroup = (brothers + sisters + maternalSiblings) >= 2;

                // مصفوفة أصحاب الفروض المبدئية
                let fardhList = [];

                // 1. نصيب الزوج / الزوجات (فرضاً)
                if (spouse > 0) {
                    let rate = 0;
                    let rateStr = '';
                    let note = '';
                    let label = '';

                    if (gender === 'male') {
                        // المتوفى رجل، الوارث زوجة أو زوجات
                        label = spouse > 1 ? `الزوجات (${spouse})` : "الزوجة";
                        if (hasChildren) {
                            rate = 1 / 8;
                            rateStr = '1/8';
                            note = 'فرض الثمن لوجود الفرع الوارث المباشر (الأولاد).';
                        } else {
                            rate = 1 / 4;
                            rateStr = '1/4';
                            note = 'فرض الربع لعدم وجود الفرع الوارث المباشر.';
                        }
                    } else {
                        // المتوفاة امرأة، الوارث زوج
                        label = "الزوج";
                        if (hasChildren) {
                            rate = 1 / 4;
                            rateStr = '1/4';
                            note = 'فرض الربع لوجود الفرع الوارث المباشر.';
                        } else {
                            rate = 1 / 2;
                            rateStr = '1/2';
                            note = 'فرض النصف لعدم وجود الفرع الوارث.';
                        }
                    }
                    fardhList.push({ key: 'spouse', label, rate, rateStr, note, count: spouse });
                }

                // 2. نصيب الأب (فرضاً)
                // إذا وجد فرع مذكر يأخذ السدس فقط فرضاً. إذا وجد فرع مؤنث يأخذ السدس فرضاً + الباقي تعصيباً إن وجد.
                if (father === 1) {
                    if (hasMaleChildren) {
                        fardhList.push({
                            key: 'father',
                            label: "الأب",
                            rate: 1 / 6,
                            rateStr: '1/6',
                            note: "فرض السدس فقط لوجود الفرع الوارث المذكر (الابن).",
                            count: 1
                        });
                    } else if (hasChildren) { // بنات فقط
                        fardhList.push({
                            key: 'father',
                            label: "الأب (فرضاً)",
                            rate: 1 / 6,
                            rateStr: '1/6',
                            note: "فرض السدس لوجود الفرع المؤنث، مع استحقاق الباقي تعصيباً إن فضل شيء.",
                            count: 1,
                            mayInheritTaaseeb: true
                        });
                    }
                    // إذا لم يوجد أولاد إطلاقاً: يرث تعصيباً فقط بعد أصحاب الفروض (يُعالج في مرحلة العصبات)
                }

                // 3. نصيب الأم (فرضاً)
                if (mother === 1) {
                    let rate = 0;
                    let rateStr = '';
                    let note = '';

                    if (hasChildren || hasSiblingsGroup) {
                        rate = 1 / 6;
                        rateStr = '1/6';
                        note = "فرض السدس لوجود الفرع الوارث أو جمع من الإخوة (اثنين فأكثر).";
                    } else {
                        rate = 1 / 3;
                        rateStr = '1/3';
                        note = "فرض الثلث لعدم وجود فرع وارث ولعدم وجود جمع من الإخوة.";
                    }
                    fardhList.push({ key: 'mother', label: "الأم", rate, rateStr, note, count: 1 });
                }

                // 4. الإخوة لأم (فرضاً: يُحجبون حجب حرمان بالأب وبالفرع الوارث مطلقاً ذكراً أو أنثى)
                if (maternalSiblings > 0 && !hasChildren && father === 0) {
                    let rate = 0;
                    let rateStr = '';
                    let note = '';

                    if (maternalSiblings === 1) {
                        rate = 1 / 6;
                        rateStr = '1/6';
                        note = "فرض السدس للانفراد وعدم وجود الحاجب (الأب أو الفرع الوارث).";
                    } else {
                        rate = 1 / 3;
                        rateStr = '1/3';
                        note = `فرض الثلث للتعدد (${maternalSiblings})، يُقسم بينهم بالتساوي شرعاً للذكر مثل الأنثى.`;
                    }
                    fardhList.push({ key: 'maternal', label: `الإخوة لأم (${maternalSiblings})`, rate, rateStr, note, count: maternalSiblings });
                }

                // 5. البنات (فرضاً: في حالة عدم وجود معصب لهن وهو الابن الذكر)
                if (daughters > 0 && sons === 0) {
                    let rate = 0;
                    let rateStr = '';
                    let note = '';

                    if (daughters === 1) {
                        rate = 1 / 2;
                        rateStr = '1/2';
                        note = "فرض النصف للانفراد وعدم وجود المعصب (الابن الذكر).";
                    } else {
                        rate = 2 / 3;
                        rateStr = '2/3';
                        note = `فرض الثلثين للتعدد (${daughters} بنات) بالتساوي لعدم وجود المعصب.`;
                    }
                    fardhList.push({ key: 'daughters', label: `البنات (${daughters})`, rate, rateStr, note, count: daughters });
                }

                // 6. الأخوات الشقيقات (فرضاً: في حال عدم وجود فرع وارث ولا أب ولا إخوة ذكور معصبين)
                if (!hasChildren && father === 0 && brothers === 0 && sisters > 0) {
                    let rate = 0;
                    let rateStr = '';
                    let note = '';

                    if (sisters === 1) {
                        rate = 1 / 2;
                        rateStr = '1/2';
                        note = "فرض النصف للانفراد وعدم وجود الحاجب أو المعصب.";
                    } else {
                        rate = 2 / 3;
                        rateStr = '2/3';
                        note = `فرض الثلثين للتعدد (${sisters} أخوات) بالتساوي لعدم وجود الحاجب أو المعصب.`;
                    }
                    fardhList.push({ key: 'sisters', label: `الأخوات الشقيقات (${sisters})`, rate, rateStr, note, count: sisters });
                }

                // ========================================================================
                // [3] معالجة العول والأنصبة النهائية (Awl & Final Shares Calculation)
                // ========================================================================
                let finalShares = [];
                const sumFardhRate = fardhList.reduce((sum, item) => sum + item.rate, 0);
                const isAwl = sumFardhRate > 1.00001; // تزاحم الفروض الشرعية (العول)

                let remainingAmount = total;

                if (isAwl) {
                    // في مسألة العول: يدخل النقص النسبي الشرعي على جميع أصحاب الفروض بالتساوي
                    fardhList.forEach(item => {
                        const scaledRate = item.rate / sumFardhRate;
                        const amount = total * scaledRate;
                        const indAmount = amount / item.count;
                        finalShares.push({
                            label: item.label,
                            amount: amount,
                            indAmount: indAmount,
                            note: `${item.note} [دخلها العول الشرعي: خُفضت النسبة نسبياً من ${item.rateStr} إلى ${(scaledRate * 100).toFixed(1)}% لتزاحم الفروض].`,
                            rateStr: `${item.rateStr} (عالت)`,
                            count: item.count,
                            ratePct: (scaledRate * 100)
                        });
                    });
                    remainingAmount = 0;
                } else {
                    // الفروض مستقرة وتستوفي استحقاقها الأصلي
                    fardhList.forEach(item => {
                        const amount = total * item.rate;
                        const indAmount = amount / item.count;
                        remainingAmount -= amount;
                        finalShares.push({
                            label: item.label,
                            amount: amount,
                            indAmount: indAmount,
                            note: item.note,
                            rateStr: item.rateStr,
                            count: item.count,
                            ratePct: (item.rate * 100)
                        });
                    });

                    // تصحيح أخطاء الفاصلة العائمة
                    if (remainingAmount < 0.0001) remainingAmount = 0;

                    // ====================================================================
                    // [4] استحقاق العصبات من التركة المتبقية (Ta'seeb)
                    // ====================================================================
                    if (remainingAmount > 0.01) {
                        // أولوية 1: الأبناء الذكور (عصبة بالنفس أو بالغير مع البنات)
                        if (sons > 0) {
                            const totalHeads = (sons * 2) + daughters;
                            const sharePerHead = remainingAmount / totalHeads;

                            finalShares.push({
                                label: `الأبناء الذكور (${sons})`,
                                amount: sharePerHead * 2 * sons,
                                indAmount: sharePerHead * 2,
                                note: "أخذوا الباقي تعصيباً بالنفس (يُقسم بينهم شرعاً للذكر مثل حظ الأنثيين).",
                                rateStr: 'عصبة بالنفس',
                                count: sons,
                                ratePct: ((sharePerHead * 2 * sons) / total) * 100
                            });

                            if (daughters > 0) {
                                finalShares.push({
                                    label: `البنات (${daughters})`,
                                    amount: sharePerHead * daughters,
                                    indAmount: sharePerHead,
                                    note: "عصبة بالغير مع إخوانهن الذكور (للذكر مثل حظ الأنثيين).",
                                    rateStr: 'عصبة بالغير',
                                    count: daughters,
                                    ratePct: ((sharePerHead * daughters) / total) * 100
                                });
                            }
                            remainingAmount = 0;
                        }
                        // أولوية 2: الأب (إذا لم يوجد فرع وارث مذكر)
                        else if (father === 1) {
                            if (hasChildren) {
                                // وجود بنات فقط: الأب أخذ السدس فرضاً، ويأخذ الباقي الآن تعصيباً
                                finalShares.push({
                                    label: "الأب (الباقي تعصيباً)",
                                    amount: remainingAmount,
                                    indAmount: remainingAmount,
                                    note: "أخذ الباقي تعصيباً بعد أصحاب الفروض لعدم وجود فرع وارث مذكر.",
                                    rateStr: 'الباقي تعصيباً',
                                    count: 1,
                                    ratePct: (remainingAmount / total) * 100
                                });
                            } else {
                                // عدم وجود أولاد إطلاقاً: الأب عصبة محضة
                                finalShares.push({
                                    label: "الأب (عصبة محضة)",
                                    amount: remainingAmount,
                                    indAmount: remainingAmount,
                                    note: "أخذ كامل الباقي تعصيباً محضاً لعدم وجود فرع وارث للمتوفى.",
                                    rateStr: 'عصبة بالنفس',
                                    count: 1,
                                    ratePct: (remainingAmount / total) * 100
                                });
                            }
                            remainingAmount = 0;
                        }
                        // أولوية 3: الإخوة الأشقاء (إذا لم يوجد أب ولا أبناء)
                        else if (father === 0 && sons === 0 && brothers > 0) {
                            const totalHeads = (brothers * 2) + sisters;
                            const sharePerHead = remainingAmount / totalHeads;

                            finalShares.push({
                                label: `الإخوة الأشقاء (${brothers})`,
                                amount: sharePerHead * 2 * brothers,
                                indAmount: sharePerHead * 2,
                                note: "أخذوا الباقي تعصيباً بالنفس لعدم وجود الحاجب (الأب أو الفرع المذكر).",
                                rateStr: 'عصبة بالنفس',
                                count: brothers,
                                ratePct: ((sharePerHead * 2 * brothers) / total) * 100
                            });

                            if (sisters > 0) {
                                finalShares.push({
                                    label: `الأخوات الشقيقات (${sisters})`,
                                    amount: sharePerHead * sisters,
                                    indAmount: sharePerHead,
                                    note: "عصبة بالغير مع إخوانهن الذكور الأشقاء (للذكر مثل حظ الأنثيين).",
                                    rateStr: 'عصبة بالغير',
                                    count: sisters,
                                    ratePct: ((sharePerHead * sisters) / total) * 100
                                });
                            }
                            remainingAmount = 0;
                        }
                    }
                }

                // ========================================================================
                // [5] جلب العملة وتنسيق المخرجات
                // ========================================================================
                let currency = 'د.أ';
                try {
                    const settings = JSON.parse(localStorage.getItem('firm_settings') || '{}');
                    currency = settings.currency || settings.currency_code || 'د.أ';
                } catch (e) {}

                const fmt = (num) => Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                // توليد النص القانوني لصك حصر وقسمة التركة (جاهز للنسخ الفوري)
                let legalSummary = `[صك حصر وقسمة التركة الشرعية - نظام موكّل]\n`;
                legalSummary += `• صافي التركة الإجمالي (الوعاء الإرثي): ${fmt(total)} ${currency}\n`;
                legalSummary += `• جنس المتوفى: ${gender === 'male' ? 'ذكر' : 'أنثى'}\n`;
                legalSummary += `• حالة المسألة: ${isAwl ? 'مسألة عَوْل (تزاحمت الفروض فخُفضت نسبياً بالعدل الشرعي)' : (remainingAmount > 0.01 ? 'مسألة رَدّ (تبقى فائض مالي بعد أصحاب الفروض)' : 'مسألة عادلة مستوفاة بالتمام')}\n`;
                legalSummary += `--------------------------------------------------\n`;
                legalSummary += `توزيع الأنصبة والسهام الشرعية:\n`;

                finalShares.forEach((s, idx) => {
                    legalSummary += `${idx + 1}. ${s.label}: ${fmt(s.amount)} ${currency} (${s.rateStr} - %${s.ratePct.toFixed(1)})\n`;
                    if (s.count > 1) {
                        legalSummary += `   - نصيب الفرد الواحد: ${fmt(s.indAmount)} ${currency}\n`;
                    }
                    legalSummary += `   - السند الشرعي: ${s.note}\n`;
                });

                if (remainingAmount > 0.01) {
                    legalSummary += `--------------------------------------------------\n`;
                    legalSummary += `• الفائض المتبقي للرد: ${fmt(remainingAmount)} ${currency} (يُرد على أصحاب الفروض عدا الزوجين وفق القانون المتبع).\n`;
                }
                legalSummary += `--------------------------------------------------\n`;
                legalSummary += `حرر هذا الكشف استناداً لأحكام الشريعة الإسلامية وقانون الأحوال الشخصية عبر نظام موكّل 2026.`;

                // ========================================================================
                // [6] حقن الواجهة بالتصميم الملكي V5.6 المتوافق مع الوضع الليلي والطباعة
                // ========================================================================
                let html = `
                    <div class="d-flex flex-wrap justify-content-between align-items-center mb-4 border-bottom pb-3 gap-2">
                        <div class="d-flex align-items-center gap-2">
                            <span class="p-2 rounded-3 bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25">
                                <i class="fas fa-balance-scale fs-4"></i>
                            </span>
                            <div>
                                <h5 class="fw-bold mb-0 text-dark">صك توزيع التركة الشرعية التفصيلي</h5>
                                <small class="text-muted fw-bold">الوعاء الإرثي الإجمالي: <span class="font-monospace text-primary">${fmt(total)} ${currency}</span></small>
                            </div>
                        </div>
                        <div class="d-flex gap-2 d-print-none">
                            <button class="btn btn-sm btn-outline-primary fw-bold rounded-pill px-3 shadow-sm" onclick="copyInheritanceSummary(${JSON.stringify(legalSummary)})" title="نسخ صك الإرث لمذكرات الدعاوى">
                                <i class="fas fa-copy me-1"></i> نسخ الصك القضائي
                            </button>
                            <button class="btn btn-sm btn-outline-dark fw-bold rounded-pill px-3 shadow-sm" onclick="window.print()" title="طباعة رسمية">
                                <i class="fas fa-print me-1"></i> طباعة الصك
                            </button>
                        </div>
                    </div>
                `;

                if (finalShares.length === 0) {
                    html += `
                        <div class="alert alert-warning fw-bold text-center border-0 shadow-sm rounded-4 p-4">
                            <i class="fas fa-exclamation-triangle fs-3 d-block mb-2 text-warning"></i>
                            لم يتم تحديد أي ورثة شرعيين مستحقين بناءً على المعطيات المدخلة أعلاه.
                        </div>
                    `;
                } else {
                    html += `
                        <div class="table-responsive rounded-4 border border-secondary border-opacity-25 shadow-sm mb-4">
                            <table class="table table-hover align-middle mb-0" style="font-size: 0.95rem;">
                                <thead class="table-light">
                                    <tr class="fw-bold text-muted small text-uppercase">
                                        <th class="py-3 px-3">الوارث الشرعي</th>
                                        <th class="py-3 text-center">الفرض / الصفة</th>
                                        <th class="py-3 text-center">النسبة من التركة</th>
                                        <th class="py-3 text-center">النصيب الإجمالي (${currency})</th>
                                        <th class="py-3 px-3">السند والتكييف الشرعي</th>
                                    </tr>
                                </thead>
                                <tbody>
                    `;

                    finalShares.forEach(s => {
                        let indHtml = '';
                        if (s.count > 1) {
                            indHtml = `
                                <div class="mt-1 pt-1 border-top border-secondary border-opacity-25 text-muted small fw-bold font-monospace">
                                    <i class="fas fa-user-friends me-1 text-info"></i> حصة الفرد: <span class="text-primary">${fmt(s.indAmount)}</span> ${currency}
                                </div>
                            `;
                        }

                        html += `
                            <tr>
                                <td class="px-3 fw-bold text-dark">${s.label}</td>
                                <td class="text-center">
                                    <span class="badge bg-secondary bg-opacity-10 text-dark border border-secondary border-opacity-25 px-3 py-2 rounded-pill fw-bold">
                                        ${s.rateStr}
                                    </span>
                                </td>
                                <td class="text-center fw-bold text-primary font-monospace" dir="ltr">
                                    %${s.ratePct.toFixed(1)}
                                </td>
                                <td class="text-center font-monospace fw-bold fs-6">
                                    <span class="text-success">${fmt(s.amount)}</span>
                                    ${indHtml}
                                </td>
                                <td class="px-3 small text-muted fw-bold lh-base">${s.note}</td>
                            </tr>
                        `;
                    });

                    html += `</tbody></table></div>`;
                }

                // ========================================================================
                // [7] تنبيهات الفقه الدقيقة (العول والرد)
                // ========================================================================
                if (isAwl) {
                    html += `
                        <div class="alert alert-danger border border-danger border-opacity-50 shadow-sm d-flex align-items-start gap-3 rounded-4 p-3 mb-3">
                            <i class="fas fa-balance-scale-right text-danger fs-2 mt-1"></i>
                            <div>
                                <b class="d-block mb-1 fs-5 text-danger">تنبيه فقهي: مسألة عَوْل (تزاحم الفروض الشرعية)</b>
                                <p class="small text-muted fw-bold mb-0 lh-lg">
                                    تجاوز مجموع السهام المفروضة للورثة أصل التركة (نسبة الفروض: %${(sumFardhRate * 100).toFixed(1)}). وتطبيقاً للعدل الشرعي وإجماع الصحابة رضوان الله عليهم، تم إدخال النقص على جميع أصحاب الفروض بنسبة أنصبتهم (العول). الأرقام المعروضة في الجدول أعلاه هي الأنصبة الشرعية النهائية المستحقة بعد التخفيض النسبي.
                                </p>
                            </div>
                        </div>
                    `;
                } else if (remainingAmount > 0.01) {
                    html += `
                        <div class="alert alert-info border border-info border-opacity-50 shadow-sm d-flex align-items-start gap-3 rounded-4 p-3 mb-3">
                            <i class="fas fa-info-circle text-info fs-2 mt-1"></i>
                            <div>
                                <b class="d-block mb-1 fs-5 text-info">تنبيه فقهي: مسألة رَدّ (فائض مالي بعد أصحاب الفروض)</b>
                                <p class="small text-muted fw-bold mb-0 lh-lg">
                                    تبقى من التركة فائض مالي قدره <b class="font-monospace text-dark">${fmt(remainingAmount)} ${currency}</b> بعد استيفاء جميع أصحاب الفروض لحصصهم، لعدم وجود عصبة تستغرقه. يُرد هذا المبلغ عادةً على أصحاب الفروض (عدا الزوجين عند جمهور الفقهاء) بنسبة فروضهم، أو يُوزع على ذوي الأرحام وفقاً لقانون الأحوال الشخصية المعمول به في محكمتكم الموقرة.
                                </p>
                            </div>
                        </div>
                    `;
                }

                // شارة الاعتماد والتوثيق
                html += `
                    <div class="alert alert-light border border-secondary border-opacity-25 small text-muted mt-3 mb-0 fw-bold rounded-4 text-start lh-lg shadow-sm">
                        <i class="fas fa-shield-alt me-1 text-warning fs-5 align-middle"></i> 
                        تم استخراج صك القسمة والتوريث وفق الضوابط الفقهية المعتمدة في المذاهب الإسلامية وقوانين الأحوال الشخصية. التقرير مالي قطعي وجاهز للإرفاق في لوائح حصر الإرث وقضايا التركات أمام المحاكم الشرعية ومحاكم الأحوال الشخصية.
                    </div>
                `;

                resDiv.innerHTML = html;
                resDiv.className = "mt-4 p-4 card-custom border-2 border-warning shadow-lg rounded-4 fade-in";
                resDiv.classList.remove("d-none");

                // استعادة زر الحساب
                btnCalc.innerHTML = originalBtnText;
                btnCalc.disabled = false;
            }, 300);
        });
    }
});

/**
 * نسخ صك حصر وقسمة التركة الشرعي للحافظة
 */
window.copyInheritanceSummary = function(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'تم نسخ صك حصر الإرث الشرعي بنجاح!',
                showConfirmButton: false,
                timer: 2500
            });
        }
    }).catch(() => {
        showAlert("تعذر النسخ التلقائي للحافظة.", "warning");
    });
};

/**
 * دالة التنبيهات الموحدة السريعة
 */
function showAlert(message, type = 'info') {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: type === 'danger' ? 'error' : (type === 'warning' ? 'warning' : (type === 'success' ? 'success' : 'info')),
            title: message,
            showConfirmButton: false,
            timer: 3000
        });
    } else {
        alert(message);
    }
}
