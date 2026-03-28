// js/inheritance.js - محرك توزيع المواريث الشرعية (موكّل ERP) مع تفصيل حصص الأفراد

document.addEventListener("DOMContentLoaded", function() {
    const calcInhBtn = document.getElementById("calcInhBtn");
    
    if(calcInhBtn) {
        calcInhBtn.addEventListener("click", function() {
            // 1. جلب المدخلات من واجهة المستخدم
            const total = parseFloat(document.getElementById("inhTotal").value);
            const gender = document.getElementById("inhGender").value; // male أو female
            const spouses = parseInt(document.getElementById("inhSpouse").value) || 0;
            const sons = parseInt(document.getElementById("inhSons").value) || 0;
            const daughters = parseInt(document.getElementById("inhDaughters").value) || 0;
            const fatherAlive = parseInt(document.getElementById("inhFather").value) === 1;
            const motherAlive = parseInt(document.getElementById("inhMother").value) === 1;
            const brothers = parseInt(document.getElementById("inhBrothers").value) || 0;
            const sisters = parseInt(document.getElementById("inhSisters").value) || 0;
            const maternalSiblings = parseInt(document.getElementById("inhMaternalSiblings").value) || 0;

            const resultDiv = document.getElementById("inhResult");

            // 2. التحقق من صحة مبلغ التركة
            if (isNaN(total) || total <= 0) {
                resultDiv.className = "mt-4 alert alert-danger";
                resultDiv.innerHTML = "<i class='fas fa-exclamation-triangle me-2'></i> يرجى إدخال صافي التركة برقم صحيح وموجب.";
                resultDiv.classList.remove("d-none");
                return;
            }

            let remaining = total;
            let shares = []; // مصفوفة لتخزين أنصبة الفئات والورثة

            // متغيرات مساعدة للحجب والتعصيب
            const hasDescendants = (sons > 0 || daughters > 0);
            const hasMaleDescendants = (sons > 0);
            const siblingsCount = brothers + sisters + maternalSiblings;
            const hasMultipleSiblings = siblingsCount >= 2;

            // ==========================================
            // أصحاب الفروض
            // ==========================================

            // 1. الزوج أو الزوجة (Spouses)
            if (spouses > 0) {
                let spouseShareRatio = 0;
                let title = "";
                if (gender === 'male') { 
                    // المتوفى ذكر -> الورثة زوجات
                    spouseShareRatio = hasDescendants ? (1/8) : (1/4);
                    title = spouses > 1 ? `الزوجات (${spouses})` : "الزوجة";
                } else { 
                    // المتوفاة أنثى -> الوارث زوج
                    spouseShareRatio = hasDescendants ? (1/4) : (1/2);
                    title = "الزوج";
                }
                let amount = total * spouseShareRatio;
                shares.push({ 
                    title: title, 
                    amount: amount, 
                    ratioText: `1/${Math.round(1/spouseShareRatio)}`,
                    count: spouses,
                    singleAmount: amount / spouses
                });
                remaining -= amount;
            }

            // 2. الأم (Mother)
            if (motherAlive) {
                // ترث السدس لوجود فرع وارث أو جمع من الإخوة، وإلا فالثلث
                let motherShareRatio = (hasDescendants || hasMultipleSiblings) ? (1/6) : (1/3);
                let amount = total * motherShareRatio;
                shares.push({ 
                    title: "الأم", 
                    amount: amount, 
                    ratioText: `1/${Math.round(1/motherShareRatio)}`,
                    count: 1,
                    singleAmount: amount
                });
                remaining -= amount;
            }

            // 3. الأب (Father) - فرضاً
            let fatherTakesResidue = false;
            if (fatherAlive) {
                // الأب يأخذ السدس فرضاً لوجود فرع وارث
                let fatherShareRatio = (1/6);
                let amount = total * fatherShareRatio;
                shares.push({ 
                    title: "الأب (فرضاً)", 
                    amount: amount, 
                    ratioText: "1/6", 
                    isFather: true,
                    count: 1,
                    singleAmount: amount
                });
                remaining -= amount;
                
                // الأب يعصب (يأخذ الباقي) إذا لم يكن للمتوفى فرع وارث ذكر
                if (!hasMaleDescendants) {
                    fatherTakesResidue = true;
                }
            }

            // 4. الإخوة لأم (Maternal Siblings)
            // يحجبون بالأصل الوارث الذكر (الأب) والفرع الوارث مطلقاً (أبناء أو بنات)
            if (maternalSiblings > 0 && !hasDescendants && !fatherAlive) {
                let msShareRatio = maternalSiblings === 1 ? (1/6) : (1/3);
                let amount = total * msShareRatio;
                shares.push({ 
                    title: `الإخوة لأم (${maternalSiblings}) بالتساوي`, 
                    amount: amount, 
                    ratioText: `1/${Math.round(1/msShareRatio)}`,
                    count: maternalSiblings,
                    singleAmount: amount / maternalSiblings
                });
                remaining -= amount;
            }

            // 5. البنات (Daughters) - في حال عدم وجود أبناء يعصبونهن
            if (daughters > 0 && sons === 0) {
                let dShareRatio = daughters === 1 ? (1/2) : (2/3);
                let amount = total * dShareRatio;
                shares.push({ 
                    title: `البنات (${daughters})`, 
                    amount: amount, 
                    ratioText: daughters === 1 ? "1/2" : "2/3",
                    count: daughters,
                    singleAmount: amount / daughters
                });
                remaining -= amount;
            }

            // 6. الأخوات الشقيقات (فرضاً) - في حال عدم وجود فرع وارث، ولا أب، ولا إخوة ذكور يعصبونهن
            if (sisters > 0 && brothers === 0 && !hasDescendants && !fatherAlive) {
                let sShareRatio = sisters === 1 ? (1/2) : (2/3);
                let amount = total * sShareRatio;
                shares.push({ 
                    title: `الأخوات الشقيقات (${sisters})`, 
                    amount: amount, 
                    ratioText: sisters === 1 ? "1/2" : "2/3",
                    count: sisters,
                    singleAmount: amount / sisters
                });
                remaining -= amount;
            }


            // ==========================================
            // العصبات (Ta'seeb) و العول (Aul)
            // ==========================================

            // معالجة العول رياضياً: إذا زادت السهام المفروضة عن التركة (تخطت 100%)
            let totalCalculated = shares.reduce((sum, s) => sum + s.amount, 0);
            if (totalCalculated > total) {
                // إعادة تحجيم الأنصبة لتتناسب مع التركة الكلية (العول)
                let scale = total / totalCalculated;
                shares.forEach(s => {
                    s.amount = s.amount * scale;
                    if (s.singleAmount) s.singleAmount = s.singleAmount * scale;
                    s.ratioText += " (عولاً)";
                });
                remaining = 0;
            }

            // التعصيب 1: الأب يأخذ الباقي تعصيباً (إذا وجد باقي ولم يكن هناك فرع وارث ذكر)
            if (fatherTakesResidue && remaining > 0 && sons === 0) {
                let fatherEntry = shares.find(s => s.isFather);
                if (fatherEntry) {
                    fatherEntry.amount += remaining;
                    fatherEntry.singleAmount += remaining;
                    fatherEntry.title = "الأب (فرضاً وتعصيباً)";
                    fatherEntry.ratioText = "1/6 + الباقي";
                    remaining = 0;
                }
            }

            // التعصيب 2: الأبناء والبنات (للذكر مثل حظ الأنثيين)
            if (sons > 0 && remaining > 0) {
                let totalShares = (sons * 2) + daughters;
                let shareValue = remaining / totalShares;
                shares.push({ 
                    title: `الأبناء والبنات (${sons} ذكور، ${daughters} إناث)`, 
                    amount: remaining, 
                    ratioText: "الباقي تعصيباً", 
                    isMixed: true,
                    maleCount: sons,
                    femaleCount: daughters,
                    maleAmount: shareValue * 2,
                    femaleAmount: shareValue
                });
                remaining = 0;
            }

            // التعصيب 3: الإخوة والأخوات الأشقاء (عصبة بالغير أو مع الغير) يحجبون بالأب والفرع الذكر
            if ((brothers > 0 || sisters > 0) && !hasMaleDescendants && !fatherAlive && remaining > 0) {
                if (daughters > 0) {
                    // الأخوات يصبحن عصبة مع البنات (الأخوات مع البنات عصبات)
                    if (sisters > 0 && brothers === 0) {
                        shares.push({ 
                            title: `الأخوات الشقيقات (${sisters}) (عصبة مع الغير)`, 
                            amount: remaining, 
                            ratioText: "الباقي",
                            count: sisters,
                            singleAmount: remaining / sisters
                        });
                        remaining = 0;
                    } else if (brothers > 0) {
                        let totalShares = (brothers * 2) + sisters;
                        let shareValue = remaining / totalShares;
                        shares.push({ 
                            title: `الإخوة والأخوات الأشقاء (${brothers} ذكور، ${sisters} إناث)`, 
                            amount: remaining, 
                            ratioText: "الباقي تعصيباً", 
                            isMixed: true,
                            maleCount: brothers,
                            femaleCount: sisters,
                            maleAmount: shareValue * 2,
                            femaleAmount: shareValue
                        });
                        remaining = 0;
                    }
                } else if (brothers > 0) {
                    // إخوة أشقاء (ومعهم أخوات إن وجد) يعصبون ما تبقى في غياب الفرع الوارث والأب
                    let totalShares = (brothers * 2) + sisters;
                    let shareValue = remaining / totalShares;
                    shares.push({ 
                        title: `الإخوة والأخوات الأشقاء (${brothers} ذكور، ${sisters} إناث)`, 
                        amount: remaining, 
                        ratioText: "الباقي تعصيباً", 
                        isMixed: true,
                        maleCount: brothers,
                        femaleCount: sisters,
                        maleAmount: shareValue * 2,
                        femaleAmount: shareValue
                    });
                    remaining = 0;
                }
            }

            // ==========================================
            // عرض النتيجة بالتفصيل
            // ==========================================

            resultDiv.className = "mt-4 p-4 border-0 shadow-sm rounded-3 bg-white";
            let html = `<h5 class="fw-bold text-navy mb-4 border-bottom pb-2"><i class="fas fa-balance-scale-right text-success me-2"></i> نتيجة التوزيع الشرعي وتفصيل الحصص</h5>`;
            
            if (shares.length === 0) {
                html += `<div class="alert alert-warning"><i class="fas fa-info-circle me-1"></i> لا يوجد ورثة مستحقين بناءً على المدخلات المحددة.</div>`;
            } else {
                html += `
                <div class="table-responsive">
                    <table class="table table-bordered table-hover text-center align-middle mb-0">
                        <thead class="table-light">
                            <tr>
                                <th class="text-navy text-start">صِفة الوارث وتفصيل حصة الفرد الواحد</th>
                                <th class="text-navy">النصيب</th>
                                <th class="text-navy">إجمالي حصة الصنف (د.أ)</th>
                            </tr>
                        </thead>
                        <tbody>`;
                
                shares.forEach(s => {
                    let detailHtml = '';
                    
                    // توليد تفصيل الحصص (كم يأخذ الذكر وكم تأخذ الأنثى، أو كم يأخذ الفرد الواحد)
                    if (s.isMixed) {
                        if (s.maleCount > 0) {
                            detailHtml += `<div class="text-primary small mt-1"><i class="fas fa-male me-1"></i> نصيب الذكر الواحد: <b>${s.maleAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</b> د.أ</div>`;
                        }
                        if (s.femaleCount > 0) {
                            detailHtml += `<div class="text-danger small mt-1"><i class="fas fa-female me-1"></i> نصيب الأنثى الواحدة: <b>${s.femaleAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</b> د.أ</div>`;
                        }
                    } else if (s.count > 1) {
                        detailHtml = `<div class="text-muted small mt-1"><i class="fas fa-user me-1"></i> نصيب الفرد الواحد: <b>${s.singleAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</b> د.أ</div>`;
                    } else {
                        detailHtml = `<div class="text-muted small mt-1"><i class="fas fa-user me-1"></i> يستحق المبلغ كاملاً المخصص لصفته</div>`;
                    }

                    html += `
                        <tr>
                            <td class="text-start">
                                <div class="fw-bold text-dark fs-6 mb-1">${s.title}</div>
                                ${detailHtml}
                            </td>
                            <td><span class="badge bg-secondary px-3 py-2">${s.ratioText}</span></td>
                            <td class="fw-bold text-success fs-5 bg-light">${s.amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        </tr>`;
                });
                
                html += `</tbody></table></div>`;
            }
            
            // في حال وجود فائض لم يستغرقه أصحاب الفروض (يذهب للرد أو لبيت المال)
            if (remaining > 0.05) { 
                html += `
                <div class="alert alert-warning small mt-3 mb-0">
                    <i class="fas fa-exclamation-circle me-1"></i> يوجد باقي من التركة مقداره <b class="fs-6">${remaining.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</b> د.أ لم يتم توزيعه (يُرد على أصحاب الفروض، أو لذوي الأرحام، أو يؤول لبيت المال حسب قواعد الفقه).
                </div>`;
            }

            resultDiv.innerHTML = html;
            resultDiv.classList.remove("d-none");
        });
    }
});