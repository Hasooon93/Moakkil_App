/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/features/calculators/CalculatorsPage.tsx
 * الوصف: الحاسبات القانونية والمالية والشرعية الشاملة (مطابقة 100% لملف calculators.html
 * وملفات js/loan.js, js/compound.js, js/breakeven.js, js/discount.js, js/share.js, js/inheritance.js)
 * ============================================================================
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useTheme } from '../../context/ThemeContext';
import { BottomNav } from '../../components/layout/BottomNav';

// قائمة الورثة الشرعيين الـ 26 وفق قانون الأحوال الشخصية الأردني
const HEIR_TYPES = [
    { key: 'husband', label: 'الزوج', max: 1, category: 'spouses' },
    { key: 'wife', label: 'الزوجة', max: 4, category: 'spouses' },
    { key: 'son', label: 'الابن', max: 20, category: 'descendants' },
    { key: 'daughter', label: 'البنت', max: 20, category: 'descendants' },
    { key: 'grandson', label: 'ابن الابن', max: 20, category: 'descendants' },
    { key: 'granddaughter', label: 'بنت الابن', max: 20, category: 'descendants' },
    { key: 'father', label: 'الأب', max: 1, category: 'ascendants' },
    { key: 'mother', label: 'الأم', max: 1, category: 'ascendants' },
    { key: 'paternal_grandfather', label: 'الجد لأب (أب الأب)', max: 1, category: 'ascendants' },
    { key: 'maternal_grandmother', label: 'الجدة لأم', max: 1, category: 'ascendants' },
    { key: 'paternal_grandmother', label: 'الجدة لأب', max: 1, category: 'ascendants' },
    { key: 'full_brother', label: 'الأخ الشقيق', max: 20, category: 'siblings' },
    { key: 'full_sister', label: 'الأخت الشقيقة', max: 20, category: 'siblings' },
    { key: 'paternal_brother', label: 'الأخ لأب', max: 20, category: 'siblings' },
    { key: 'paternal_sister', label: 'الأخت لأب', max: 20, category: 'siblings' },
    { key: 'maternal_brother', label: 'الأخ لأم', max: 20, category: 'siblings' },
    { key: 'maternal_sister', label: 'الأخت لأم', max: 20, category: 'siblings' },
    { key: 'full_nephew', label: 'ابن الأخ الشقيق', max: 20, category: 'agnates' },
    { key: 'paternal_nephew', label: 'ابن الأخ لأب', max: 20, category: 'agnates' },
    { key: 'full_uncle', label: 'العم الشقيق', max: 20, category: 'agnates' },
    { key: 'paternal_uncle', label: 'العم لأب', max: 20, category: 'agnates' },
    { key: 'full_cousin', label: 'ابن العم الشقيق', max: 20, category: 'agnates' },
    { key: 'paternal_cousin', label: 'ابن العم لأب', max: 20, category: 'agnates' },
];

export const CalculatorsPage: React.FC = () => {
    const navigate = useNavigate();
    const { isDark, toggleDarkMode } = useTheme();
    const [activeTab, setActiveTab] = useState<
        'inheritance' | 'share' | 'loan' | 'compound' | 'discount' | 'breakeven'
    >('inheritance');

    // ========================================================================
    // 1. حاسبة المواريث الشرعية (Islamic Inheritance Engine - inheritance.js)
    // ========================================================================
    const [estateTotal, setEstateTotal] = useState<string>('100000');
    const [funeralCost, setFuneralCost] = useState<string>('0');
    const [debts, setDebts] = useState<string>('0');
    const [willAmount, setWillAmount] = useState<string>('0');
    const [heirsCount, setHeirsCount] = useState<Record<string, number>>({});
    const [inheritanceResult, setInheritanceResult] = useState<any>(null);

    const updateHeirCount = (key: string, val: number) => {
        setHeirsCount((prev) => {
            const next = { ...prev, [key]: Math.max(0, val) };
            // منع اجتماع الزوج والزوجة في مسألة واحدة
            if (key === 'husband' && val > 0) next.wife = 0;
            if (key === 'wife' && val > 0) next.husband = 0;
            return next;
        });
    };

    const calculateInheritance = () => {
        const gross = parseFloat(estateTotal) || 0;
        const funeral = parseFloat(funeralCost) || 0;
        const debt = parseFloat(debts) || 0;
        const rawWill = parseFloat(willAmount) || 0;

        const afterDebts = gross - funeral - debt;
        if (afterDebts <= 0) {
            Swal.fire('تنبيه شرعي', 'الديون ومصاريف التجهيز استغرقت كامل التركة، لا يوجد صافي للتوزيع.', 'warning');
            return;
        }

        // الوصية تنفذ في حدود الثلث شرعاً
        const maxWill = afterDebts / 3;
        const executedWill = Math.min(rawWill, maxWill);
        const netEstate = afterDebts - executedWill;

        const h = (k: string) => heirsCount[k] || 0;

        // فحص الفروع والأصول للحجب
        const hasSon = h('son') > 0;
        const hasGrandson = !hasSon && h('grandson') > 0;
        const hasMaleDescendant = hasSon || hasGrandson;
        const hasDaughter = h('daughter') > 0;
        const hasGranddaughter = h('granddaughter') > 0;
        const hasAnyDescendant = hasMaleDescendant || hasDaughter || hasGranddaughter;

        const hasFather = h('father') > 0;
        const hasGrandfather = !hasFather && h('paternal_grandfather') > 0;
        const hasMaleAscendant = hasFather || hasGrandfather;

        const totalSiblings =
            h('full_brother') +
            h('full_sister') +
            h('paternal_brother') +
            h('paternal_sister') +
            h('maternal_brother') +
            h('maternal_sister');

        interface ShareItem {
            key: string;
            label: string;
            count: number;
            fractionLabel: string;
            rawShare: number;
            isAsaba?: boolean;
            asabaWeight?: number;
            blockedReason?: string;
        }

        const results: ShareItem[] = [];
        let fixedSharesSum = 0;

        // أ. أصحاب الفروض
        if (h('husband') > 0) {
            const s = hasAnyDescendant ? 1 / 4 : 1 / 2;
            fixedSharesSum += s;
            results.push({
                key: 'husband',
                label: 'الزوج',
                count: 1,
                fractionLabel: hasAnyDescendant ? 'الربع (1/4) لوجود الفرع الوارث' : 'النصف (1/2) لعدم وجود الفرع الوارث',
                rawShare: s,
            });
        }

        if (h('wife') > 0) {
            const s = hasAnyDescendant ? 1 / 8 : 1 / 4;
            fixedSharesSum += s;
            results.push({
                key: 'wife',
                label: 'الزوجة',
                count: h('wife'),
                fractionLabel: hasAnyDescendant ? 'الثمن (1/8) لوجود الفرع الوارث' : 'الربع (1/4) لعدم وجود الفرع الوارث',
                rawShare: s,
            });
        }

        if (hasFather) {
            if (hasMaleDescendant) {
                fixedSharesSum += 1 / 6;
                results.push({
                    key: 'father',
                    label: 'الأب',
                    count: 1,
                    fractionLabel: 'السدس (1/6) فرضاً لوجود الفرع الوارث المذكر',
                    rawShare: 1 / 6,
                });
            } else if (hasAnyDescendant) {
                fixedSharesSum += 1 / 6;
                results.push({
                    key: 'father',
                    label: 'الأب',
                    count: 1,
                    fractionLabel: 'السدس (1/6) فرضاً + الباقي تعصيباً',
                    rawShare: 1 / 6,
                    isAsaba: true,
                    asabaWeight: 2,
                });
            } else {
                results.push({
                    key: 'father',
                    label: 'الأب',
                    count: 1,
                    fractionLabel: 'الباقي تعصيباً بالنفس',
                    rawShare: 0,
                    isAsaba: true,
                    asabaWeight: 2,
                });
            }
        }

        if (h('paternal_grandfather') > 0) {
            if (hasFather) {
                results.push({
                    key: 'paternal_grandfather',
                    label: 'الجد لأب',
                    count: 1,
                    fractionLabel: 'محجوب بالأب',
                    rawShare: 0,
                    blockedReason: 'محجوب بالأب',
                });
            } else if (hasMaleDescendant) {
                fixedSharesSum += 1 / 6;
                results.push({
                    key: 'paternal_grandfather',
                    label: 'الجد لأب',
                    count: 1,
                    fractionLabel: 'السدس (1/6) فرضاً',
                    rawShare: 1 / 6,
                });
            } else if (hasAnyDescendant) {
                fixedSharesSum += 1 / 6;
                results.push({
                    key: 'paternal_grandfather',
                    label: 'الجد لأب',
                    count: 1,
                    fractionLabel: 'السدس (1/6) فرضاً + الباقي تعصيباً',
                    rawShare: 1 / 6,
                    isAsaba: true,
                    asabaWeight: 2,
                });
            } else {
                results.push({
                    key: 'paternal_grandfather',
                    label: 'الجد لأب',
                    count: 1,
                    fractionLabel: 'الباقي تعصيباً',
                    rawShare: 0,
                    isAsaba: true,
                    asabaWeight: 2,
                });
            }
        }

        if (h('mother') > 0) {
            const s = hasAnyDescendant || totalSiblings >= 2 ? 1 / 6 : 1 / 3;
            fixedSharesSum += s;
            results.push({
                key: 'mother',
                label: 'الأم',
                count: 1,
                fractionLabel: s === 1 / 6 ? 'السدس (1/6)' : 'الثلث (1/3)',
                rawShare: s,
            });
        }

        // الجدات
        if (h('maternal_grandmother') > 0 || h('paternal_grandmother') > 0) {
            const mGrand = h('maternal_grandmother') > 0 && h('mother') === 0;
            const pGrand = h('paternal_grandmother') > 0 && h('mother') === 0 && !hasFather;
            if (mGrand || pGrand) {
                const s = 1 / 6;
                fixedSharesSum += s;
                results.push({
                    key: 'grandmothers',
                    label: 'الجدة الصحيحة',
                    count: (mGrand ? 1 : 0) + (pGrand ? 1 : 0),
                    fractionLabel: 'السدس (1/6)',
                    rawShare: s,
                });
            }
        }

        // الفروع (الأبناء والبنات)
        if (hasSon) {
            results.push({
                key: 'son',
                label: 'الابن',
                count: h('son'),
                fractionLabel: h('daughter') > 0 ? 'تعصيباً (للذكر مثل حظ الأنثيين)' : 'الباقي تعصيباً بالنفس',
                rawShare: 0,
                isAsaba: true,
                asabaWeight: 2,
            });
            if (hasDaughter) {
                results.push({
                    key: 'daughter',
                    label: 'البنت',
                    count: h('daughter'),
                    fractionLabel: 'عصبة بالغير مع الابن (للذكر مثل حظ الأنثيين)',
                    rawShare: 0,
                    isAsaba: true,
                    asabaWeight: 1,
                });
            }
        } else if (hasDaughter) {
            const s = h('daughter') === 1 ? 1 / 2 : 2 / 3;
            fixedSharesSum += s;
            results.push({
                key: 'daughter',
                label: 'البنت',
                count: h('daughter'),
                fractionLabel: h('daughter') === 1 ? 'النصف (1/2) فرضاً' : 'الثلثان (2/3) فرضاً',
                rawShare: s,
            });
        }

        // أولاد الابن
        if (!hasSon && (h('grandson') > 0 || h('granddaughter') > 0)) {
            if (h('grandson') > 0) {
                results.push({
                    key: 'grandson',
                    label: 'ابن الابن',
                    count: h('grandson'),
                    fractionLabel: 'الباقي تعصيباً',
                    rawShare: 0,
                    isAsaba: true,
                    asabaWeight: 2,
                });
                if (h('granddaughter') > 0) {
                    results.push({
                        key: 'granddaughter',
                        label: 'بنت الابن',
                        count: h('granddaughter'),
                        fractionLabel: 'عصبة بالغير مع ابن الابن',
                        rawShare: 0,
                        isAsaba: true,
                        asabaWeight: 1,
                    });
                }
            } else if (h('granddaughter') > 0) {
                if (h('daughter') === 0) {
                    const s = h('granddaughter') === 1 ? 1 / 2 : 2 / 3;
                    fixedSharesSum += s;
                    results.push({
                        key: 'granddaughter',
                        label: 'بنت الابن',
                        count: h('granddaughter'),
                        fractionLabel: h('granddaughter') === 1 ? 'النصف (1/2)' : 'الثلثان (2/3)',
                        rawShare: s,
                    });
                } else if (h('daughter') === 1) {
                    fixedSharesSum += 1 / 6;
                    results.push({
                        key: 'granddaughter',
                        label: 'بنت الابن',
                        count: h('granddaughter'),
                        fractionLabel: 'السدس (1/6) تكملة الثلثين',
                        rawShare: 1 / 6,
                    });
                }
            }
        }

        // الإخوة لأم (في الكلالة)
        if (!hasAnyDescendant && !hasMaleAscendant && (h('maternal_brother') + h('maternal_sister') > 0)) {
            const mCount = h('maternal_brother') + h('maternal_sister');
            const s = mCount === 1 ? 1 / 6 : 1 / 3;
            fixedSharesSum += s;
            results.push({
                key: 'maternal_siblings',
                label: 'الإخوة لأم',
                count: mCount,
                fractionLabel: mCount === 1 ? 'السدس (1/6)' : 'الثلث (1/3) بالتساوي للذكر والأنثى',
                rawShare: s,
            });
        }

        // الإخوة الأشقاء والإخوة لأب (عند عدم وجود فرع مذكر أو أصل مذكر)
        if (!hasMaleDescendant && !hasMaleAscendant) {
            if (h('full_brother') > 0) {
                results.push({
                    key: 'full_brother',
                    label: 'الأخ الشقيق',
                    count: h('full_brother'),
                    fractionLabel: 'تعصيباً',
                    rawShare: 0,
                    isAsaba: true,
                    asabaWeight: 2,
                });
                if (h('full_sister') > 0) {
                    results.push({
                        key: 'full_sister',
                        label: 'الأخت الشقيقة',
                        count: h('full_sister'),
                        fractionLabel: 'عصبة بالغير مع الأخ الشقيق',
                        rawShare: 0,
                        isAsaba: true,
                        asabaWeight: 1,
                    });
                }
            } else if (h('full_sister') > 0) {
                if (hasDaughter || hasGranddaughter) {
                    results.push({
                        key: 'full_sister',
                        label: 'الأخت الشقيقة',
                        count: h('full_sister'),
                        fractionLabel: 'عصبة مع الغير (مع البنات)',
                        rawShare: 0,
                        isAsaba: true,
                        asabaWeight: 1,
                    });
                } else {
                    const s = h('full_sister') === 1 ? 1 / 2 : 2 / 3;
                    fixedSharesSum += s;
                    results.push({
                        key: 'full_sister',
                        label: 'الأخت الشقيقة',
                        count: h('full_sister'),
                        fractionLabel: h('full_sister') === 1 ? 'النصف (1/2)' : 'الثلثان (2/3)',
                        rawShare: s,
                    });
                }
            }
        }

        // معالجة العول والرد وتوزيع الباقي للعصبات
        const activeAsaba = results.filter((r) => r.isAsaba);
        let caseType = 'عادلة / تعصيب';
        const remainder = Math.max(0, 1 - fixedSharesSum);

        if (fixedSharesSum > 1) {
            caseType = 'عائلة (تم تطبيق العول الشرعي)';
        } else if (remainder > 0.0001 && activeAsaba.length === 0 && results.length > 0) {
            caseType = 'رادّة (تم تطبيق الرد الشرعي على أصحاب الفروض عدا الزوجين)';
        }

        const totalFixedAdjusted = fixedSharesSum > 1 ? fixedSharesSum : 1;
        const asabaUnits = activeAsaba.reduce((acc, item) => acc + item.count * (item.asabaWeight || 1), 0);

        const finalDistribution = results.map((item) => {
            let finalRatio = 0;
            if (fixedSharesSum > 1) {
                // حالة العول
                finalRatio = item.rawShare / totalFixedAdjusted;
            } else if (item.isAsaba && asabaUnits > 0) {
                const asabaPart = remainder * ((item.count * (item.asabaWeight || 1)) / asabaUnits);
                finalRatio = item.rawShare + asabaPart;
            } else if (remainder > 0.0001 && activeAsaba.length === 0) {
                // حالة الرد
                const isSpouse = item.key === 'husband' || item.key === 'wife';
                const nonSpouseSum = results
                    .filter((x) => x.key !== 'husband' && x.key !== 'wife')
                    .reduce((s, x) => s + x.rawShare, 0);
                if (isSpouse || nonSpouseSum === 0) {
                    finalRatio = item.rawShare + (nonSpouseSum === 0 ? remainder : 0);
                } else {
                    const spouseShare = results
                        .filter((x) => x.key === 'husband' || x.key === 'wife')
                        .reduce((s, x) => s + x.rawShare, 0);
                    finalRatio = (1 - spouseShare) * (item.rawShare / nonSpouseSum);
                }
            } else {
                finalRatio = item.rawShare;
            }

            const totalMoney = finalRatio * netEstate;
            const perPerson = item.count > 0 ? totalMoney / item.count : 0;

            return {
                ...item,
                percentage: (finalRatio * 100).toFixed(2),
                totalMoney,
                perPerson,
            };
        });

        setInheritanceResult({
            gross,
            funeral,
            debt,
            executedWill,
            netEstate,
            caseType,
            items: finalDistribution,
        });
    };

    // ========================================================================
    // 2. حاسبة الحصص الفردية والأسهم (Share Calculator - share.js)
    // ========================================================================
    const [shareTotalAmount, setShareTotalAmount] = useState('50000');
    const [shareTotalParts, setShareTotalParts] = useState('24');
    const [shareOwnedParts, setShareOwnedParts] = useState('3');

    const totalAmtNum = parseFloat(shareTotalAmount) || 0;
    const totalPartsNum = parseFloat(shareTotalParts) || 1;
    const ownedPartsNum = parseFloat(shareOwnedParts) || 0;
    const singleShareVal = totalPartsNum > 0 ? totalAmtNum / totalPartsNum : 0;
    const ownedShareVal = singleShareVal * ownedPartsNum;
    const ownedSharePct = totalPartsNum > 0 ? (ownedPartsNum / totalPartsNum) * 100 : 0;

    // ========================================================================
    // 3. حاسبة القروض والأقساط (Loan Calculator - loan.js)
    // ========================================================================
    const [loanAmount, setLoanAmount] = useState('20000');
    const [loanRate, setLoanRate] = useState('7.5');
    const [loanYears, setLoanYears] = useState('5');

    const pLoan = parseFloat(loanAmount) || 0;
    const rLoan = (parseFloat(loanRate) || 0) / 100 / 12;
    const nLoan = (parseFloat(loanYears) || 1) * 12;
    const monthlyPayment =
        rLoan > 0
            ? (pLoan * rLoan * Math.pow(1 + rLoan, nLoan)) / (Math.pow(1 + rLoan, nLoan) - 1)
            : nLoan > 0
            ? pLoan / nLoan
            : 0;
    const totalLoanPayable = monthlyPayment * nLoan;
    const totalLoanInterest = totalLoanPayable - pLoan;

    // ========================================================================
    // 4. حاسبة الفائدة القانونية والمركبة (Compound Calculator - compound.js)
    // ========================================================================
    const [compPrincipal, setCompPrincipal] = useState('10000');
    const [compRate, setCompRate] = useState('9');
    const [compYears, setCompYears] = useState('3');
    const [compFreq, setCompFreq] = useState('1');

    const pComp = parseFloat(compPrincipal) || 0;
    const rComp = (parseFloat(compRate) || 0) / 100;
    const tComp = parseFloat(compYears) || 0;
    const nComp = parseFloat(compFreq) || 1;
    const simpleFinal = pComp * (1 + rComp * tComp);
    const compoundFinal = pComp * Math.pow(1 + rComp / nComp, nComp * tComp);

    // ========================================================================
    // 5. حاسبة الخصومات وضريبة المبيعات (Discount & VAT - discount.js)
    // ========================================================================
    const [discOriginal, setDiscOriginal] = useState('1000');
    const [discPercent, setDiscPercent] = useState('15');
    const [vatPercent, setVatPercent] = useState('16');

    const origVal = parseFloat(discOriginal) || 0;
    const discVal = origVal * ((parseFloat(discPercent) || 0) / 100);
    const afterDisc = origVal - discVal;
    const vatVal = afterDisc * ((parseFloat(vatPercent) || 0) / 100);
    const finalWithVat = afterDisc + vatVal;

    // ========================================================================
    // 6. حاسبة نقطة التعادل التجاري (Breakeven - breakeven.js)
    // ========================================================================
    const [beFixedCost, setBeFixedCost] = useState('5000');
    const [beUnitPrice, setBeUnitPrice] = useState('50');
    const [beVariableCost, setBeVariableCost] = useState('30');

    const fixedC = parseFloat(beFixedCost) || 0;
    const priceU = parseFloat(beUnitPrice) || 0;
    const varC = parseFloat(beVariableCost) || 0;
    const contributionMargin = priceU - varC;
    const breakEvenUnits = contributionMargin > 0 ? Math.ceil(fixedC / contributionMargin) : 0;
    const breakEvenRevenue = breakEvenUnits * priceU;

    return (
        <div className="min-vh-100 pb-5 mb-5">
            <div className="top-nav d-flex justify-content-between align-items-center px-3 py-3">
                <div className="d-flex align-items-center gap-2">
                    <button
                        className="btn btn-link text-white p-0 text-decoration-none"
                        onClick={() => navigate('/app.html#tools')}
                    >
                        <i className="fas fa-arrow-right fs-4"></i>
                    </button>
                    <h5 className="mb-0 fw-bold text-white">
                        <i className="fas fa-calculator me-2 text-warning"></i> الحاسبات القانونية والشرعية والمالية
                    </h5>
                </div>
                <button
                    className="btn btn-sm btn-outline-light rounded-3 px-3"
                    onClick={toggleDarkMode}
                    title="تبديل الوضع الليلي"
                >
                    <i className={`fas ${isDark ? 'fa-sun text-warning' : 'fa-moon'}`}></i>
                </button>
            </div>

            <div className="container mt-4">
                {/* شريط التبويبات */}
                <div className="d-flex gap-2 overflow-auto pb-2 mb-4">
                    <button
                        className={`btn fw-bold rounded-pill px-4 flex-shrink-0 ${
                            activeTab === 'inheritance' ? 'btn-gold' : 'btn-light border'
                        }`}
                        onClick={() => setActiveTab('inheritance')}
                    >
                        <i className="fas fa-mosque me-1"></i> المواريث الشرعية
                    </button>
                    <button
                        className={`btn fw-bold rounded-pill px-4 flex-shrink-0 ${
                            activeTab === 'share' ? 'btn-gold' : 'btn-light border'
                        }`}
                        onClick={() => setActiveTab('share')}
                    >
                        <i className="fas fa-chart-pie me-1"></i> الحصص والأسهم
                    </button>
                    <button
                        className={`btn fw-bold rounded-pill px-4 flex-shrink-0 ${
                            activeTab === 'compound' ? 'btn-gold' : 'btn-light border'
                        }`}
                        onClick={() => setActiveTab('compound')}
                    >
                        <i className="fas fa-percentage me-1"></i> الفائدة القانونية (9%)
                    </button>
                    <button
                        className={`btn fw-bold rounded-pill px-4 flex-shrink-0 ${
                            activeTab === 'loan' ? 'btn-gold' : 'btn-light border'
                        }`}
                        onClick={() => setActiveTab('loan')}
                    >
                        <i className="fas fa-hand-holding-usd me-1"></i> القروض والتمويل
                    </button>
                    <button
                        className={`btn fw-bold rounded-pill px-4 flex-shrink-0 ${
                            activeTab === 'discount' ? 'btn-gold' : 'btn-light border'
                        }`}
                        onClick={() => setActiveTab('discount')}
                    >
                        <i className="fas fa-tags me-1"></i> الضريبة والخصومات
                    </button>
                    <button
                        className={`btn fw-bold rounded-pill px-4 flex-shrink-0 ${
                            activeTab === 'breakeven' ? 'btn-gold' : 'btn-light border'
                        }`}
                        onClick={() => setActiveTab('breakeven')}
                    >
                        <i className="fas fa-balance-scale-right me-1"></i> نقطة التعادل
                    </button>
                </div>

                {/* 1. حاسبة المواريث الشرعية */}
                {activeTab === 'inheritance' && (
                    <div className="card border-0 shadow-sm rounded-4 p-4 fade-in">
                        <h5 className="fw-bold text-navy mb-3 border-bottom pb-2">
                            <i className="fas fa-mosque me-2 text-warning"></i> محرك حساب المواريث الشرعية (قانون الأحوال الشخصية الأردني)
                        </h5>

                        <div className="row g-3 mb-4">
                            <div className="col-md-3 col-6">
                                <label className="form-label fw-bold small">إجمالي التركة (د.أ)</label>
                                <input
                                    type="number"
                                    className="form-control fw-bold"
                                    value={estateTotal}
                                    onChange={(e) => setEstateTotal(e.target.value)}
                                />
                            </div>
                            <div className="col-md-3 col-6">
                                <label className="form-label fw-bold small">مصاريف التجهيز والدفن</label>
                                <input
                                    type="number"
                                    className="form-control"
                                    value={funeralCost}
                                    onChange={(e) => setFuneralCost(e.target.value)}
                                />
                            </div>
                            <div className="col-md-3 col-6">
                                <label className="form-label fw-bold small">الديون الثابتة والمهر المؤجل</label>
                                <input
                                    type="number"
                                    className="form-control"
                                    value={debts}
                                    onChange={(e) => setDebts(e.target.value)}
                                />
                            </div>
                            <div className="col-md-3 col-6">
                                <label className="form-label fw-bold small">الوصية (بحد أقصى الثلث)</label>
                                <input
                                    type="number"
                                    className="form-control"
                                    value={willAmount}
                                    onChange={(e) => setWillAmount(e.target.value)}
                                />
                            </div>
                        </div>

                        <h6 className="fw-bold text-navy mb-3">تحديد الورثة الأحياء وعددهم:</h6>
                        <div className="row g-2 mb-4">
                            {HEIR_TYPES.map((heir) => {
                                const count = heirsCount[heir.key] || 0;
                                return (
                                    <div key={heir.key} className="col-lg-3 col-md-4 col-6">
                                        <div
                                            className={`p-2 rounded-3 border d-flex justify-content-between align-items-center ${
                                                count > 0 ? 'border-warning bg-warning bg-opacity-10' : 'bg-light'
                                            }`}
                                        >
                                            <span className="fw-bold small">{heir.label}</span>
                                            <div className="d-flex align-items-center gap-1">
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-outline-secondary py-0 px-2"
                                                    onClick={() => updateHeirCount(heir.key, count - 1)}
                                                >
                                                    -
                                                </button>
                                                <span className="fw-bold font-monospace px-2">{count}</span>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-outline-primary py-0 px-2"
                                                    onClick={() =>
                                                        updateHeirCount(heir.key, Math.min(heir.max, count + 1))
                                                    }
                                                >
                                                    +
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="d-flex gap-2 mb-4">
                            <button
                                type="button"
                                className="btn btn-gold flex-grow-1 py-3 fw-bold fs-6"
                                onClick={calculateInheritance}
                            >
                                <i className="fas fa-balance-scale me-2"></i> احتساب الأنصبة الشرعية والمالية
                            </button>
                            <button
                                type="button"
                                className="btn btn-outline-secondary px-4 fw-bold"
                                onClick={() => {
                                    setHeirsCount({});
                                    setInheritanceResult(null);
                                }}
                            >
                                تصفير
                            </button>
                        </div>

                        {inheritanceResult && (
                            <div className="border-top pt-4 fade-in">
                                <div className="alert alert-success d-flex justify-content-between align-items-center flex-wrap gap-2">
                                    <div>
                                        <strong>صافي التركة القابل للتوزيع: </strong>
                                        <span className="fs-5 fw-black font-monospace">
                                            {inheritanceResult.netEstate.toLocaleString('en-US', {
                                                maximumFractionDigits: 2,
                                            })}{' '}
                                            د.أ
                                        </span>
                                    </div>
                                    <span className="badge bg-navy text-warning px-3 py-2">
                                        تكييف المسألة: {inheritanceResult.caseType}
                                    </span>
                                </div>

                                <div className="table-responsive">
                                    <table className="table table-bordered align-middle text-center">
                                        <thead className="table-dark">
                                            <tr>
                                                <th>الوارث</th>
                                                <th>العدد</th>
                                                <th>الفرض / التعصيب الشرعي</th>
                                                <th>النسبة المئوية</th>
                                                <th>إجمالي نصيب الصنف (د.أ)</th>
                                                <th>نصيب الفرد الواحد (د.أ)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {inheritanceResult.items.map((item: any) => (
                                                <tr key={item.key}>
                                                    <td className="fw-bold">{item.label}</td>
                                                    <td className="font-monospace fw-bold">{item.count}</td>
                                                    <td className="small fw-bold">{item.fractionLabel}</td>
                                                    <td className="font-monospace">{item.percentage}%</td>
                                                    <td className="font-monospace fw-bold text-success">
                                                        {item.totalMoney.toLocaleString('en-US', {
                                                            maximumFractionDigits: 2,
                                                        })}
                                                    </td>
                                                    <td className="font-monospace fw-bold text-primary">
                                                        {item.perPerson.toLocaleString('en-US', {
                                                            maximumFractionDigits: 2,
                                                        })}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* 2. حاسبة الحصص والأسهم العقارية */}
                {activeTab === 'share' && (
                    <div className="card border-0 shadow-sm rounded-4 p-4 fade-in">
                        <h5 className="fw-bold text-navy mb-3 border-bottom pb-2">
                            <i className="fas fa-chart-pie me-2 text-warning"></i> حاسبة الحصص الإرثية والأسهم العقارية (إزالة الشيوع)
                        </h5>
                        <div className="row g-3 mb-4">
                            <div className="col-md-4">
                                <label className="form-label fw-bold">القيمة الإجمالية للعقار أو المبلغ (د.أ)</label>
                                <input
                                    type="number"
                                    className="form-control"
                                    value={shareTotalAmount}
                                    onChange={(e) => setShareTotalAmount(e.target.value)}
                                />
                            </div>
                            <div className="col-md-4">
                                <label className="form-label fw-bold">إجمالي الحصص في سند التسجيل (أصل المسألة)</label>
                                <input
                                    type="number"
                                    className="form-control"
                                    value={shareTotalParts}
                                    onChange={(e) => setShareTotalParts(e.target.value)}
                                />
                            </div>
                            <div className="col-md-4">
                                <label className="form-label fw-bold">عدد الحصص المملوكة للشريك / الوارث</label>
                                <input
                                    type="number"
                                    className="form-control"
                                    value={shareOwnedParts}
                                    onChange={(e) => setShareOwnedParts(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="row g-3 text-center">
                            <div className="col-md-4">
                                <div className="p-3 rounded-4 bg-light border">
                                    <span className="text-muted small fw-bold d-block">قيمة السهم / الحصة الواحدة</span>
                                    <h4 className="fw-bold text-navy font-monospace mt-1 mb-0">
                                        {singleShareVal.toLocaleString('en-US', { maximumFractionDigits: 3 })} د.أ
                                    </h4>
                                </div>
                            </div>
                            <div className="col-md-4">
                                <div className="p-3 rounded-4 bg-light border">
                                    <span className="text-muted small fw-bold d-block">نسبة الملكية المئوية</span>
                                    <h4 className="fw-bold text-primary font-monospace mt-1 mb-0">
                                        {ownedSharePct.toFixed(2)}%
                                    </h4>
                                </div>
                            </div>
                            <div className="col-md-4">
                                <div className="p-3 rounded-4 bg-success bg-opacity-10 border border-success">
                                    <span className="text-success small fw-bold d-block">صافي قيمة حصص الشريك</span>
                                    <h4 className="fw-bold text-success font-monospace mt-1 mb-0">
                                        {ownedShareVal.toLocaleString('en-US', { maximumFractionDigits: 2 })} د.أ
                                    </h4>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. حاسبة الفائدة القانونية (9%) والمركبة */}
                {activeTab === 'compound' && (
                    <div className="card border-0 shadow-sm rounded-4 p-4 fade-in">
                        <h5 className="fw-bold text-navy mb-3 border-bottom pb-2">
                            <i className="fas fa-percentage me-2 text-warning"></i> حاسبة الفائدة القانونية الأردنية (9%) والمركبة
                        </h5>
                        <div className="row g-3 mb-4">
                            <div className="col-md-3">
                                <label className="form-label fw-bold">أصل مبلغ المطالبة (د.أ)</label>
                                <input
                                    type="number"
                                    className="form-control"
                                    value={compPrincipal}
                                    onChange={(e) => setCompPrincipal(e.target.value)}
                                />
                            </div>
                            <div className="col-md-3">
                                <label className="form-label fw-bold">نسبة الفائدة السنوية (%)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    className="form-control"
                                    value={compRate}
                                    onChange={(e) => setCompRate(e.target.value)}
                                />
                            </div>
                            <div className="col-md-3">
                                <label className="form-label fw-bold">عدد السنوات</label>
                                <input
                                    type="number"
                                    step="0.5"
                                    className="form-control"
                                    value={compYears}
                                    onChange={(e) => setCompYears(e.target.value)}
                                />
                            </div>
                            <div className="col-md-3">
                                <label className="form-label fw-bold">دورية التركيب</label>
                                <select
                                    className="form-select fw-bold"
                                    value={compFreq}
                                    onChange={(e) => setCompFreq(e.target.value)}
                                >
                                    <option value="1">سنوي (مرة في السنة)</option>
                                    <option value="2">نصف سنوي</option>
                                    <option value="4">ربع سنوي</option>
                                    <option value="12">شهري</option>
                                </select>
                            </div>
                        </div>

                        <div className="row g-3 text-center">
                            <div className="col-md-6">
                                <div className="p-4 rounded-4 bg-light border">
                                    <h6 className="fw-bold text-navy">الفائدة البسيطة (القانونية للمحاكم النظامية)</h6>
                                    <p className="text-muted small mb-1">
                                        مقدار الفائدة:{' '}
                                        <strong>
                                            {(simpleFinal - pComp).toLocaleString('en-US', {
                                                maximumFractionDigits: 2,
                                            })}{' '}
                                            د.أ
                                        </strong>
                                    </p>
                                    <h3 className="fw-bold text-success font-monospace mb-0">
                                        الإجمالي:{' '}
                                        {simpleFinal.toLocaleString('en-US', { maximumFractionDigits: 2 })} د.أ
                                    </h3>
                                </div>
                            </div>
                            <div className="col-md-6">
                                <div className="p-4 rounded-4 bg-light border">
                                    <h6 className="fw-bold text-navy">الفائدة المركبة (الاستثمارية / البنكية)</h6>
                                    <p className="text-muted small mb-1">
                                        مقدار الفائدة:{' '}
                                        <strong>
                                            {(compoundFinal - pComp).toLocaleString('en-US', {
                                                maximumFractionDigits: 2,
                                            })}{' '}
                                            د.أ
                                        </strong>
                                    </p>
                                    <h3 className="fw-bold text-primary font-monospace mb-0">
                                        الإجمالي:{' '}
                                        {compoundFinal.toLocaleString('en-US', { maximumFractionDigits: 2 })} د.أ
                                    </h3>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 4. حاسبة القروض والأقساط */}
                {activeTab === 'loan' && (
                    <div className="card border-0 shadow-sm rounded-4 p-4 fade-in">
                        <h5 className="fw-bold text-navy mb-3 border-bottom pb-2">
                            <i className="fas fa-hand-holding-usd me-2 text-warning"></i> حاسبة التمويل وجدولة الأقساط الشهرية
                        </h5>
                        <div className="row g-3 mb-4">
                            <div className="col-md-4">
                                <label className="form-label fw-bold">قيمة القرض / المديونية (د.أ)</label>
                                <input
                                    type="number"
                                    className="form-control"
                                    value={loanAmount}
                                    onChange={(e) => setLoanAmount(e.target.value)}
                                />
                            </div>
                            <div className="col-md-4">
                                <label className="form-label fw-bold">نسبة الفائدة السنوية (%)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    className="form-control"
                                    value={loanRate}
                                    onChange={(e) => setLoanRate(e.target.value)}
                                />
                            </div>
                            <div className="col-md-4">
                                <label className="form-label fw-bold">مدة السداد (بالسنوات)</label>
                                <input
                                    type="number"
                                    className="form-control"
                                    value={loanYears}
                                    onChange={(e) => setLoanYears(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="row g-3 text-center">
                            <div className="col-md-4">
                                <div className="p-3 rounded-4 bg-light border">
                                    <span className="text-muted small fw-bold d-block">القسط الشهري الثابت</span>
                                    <h4 className="fw-bold text-primary font-monospace mt-1 mb-0">
                                        {monthlyPayment.toLocaleString('en-US', { maximumFractionDigits: 2 })} د.أ
                                    </h4>
                                </div>
                            </div>
                            <div className="col-md-4">
                                <div className="p-3 rounded-4 bg-light border">
                                    <span className="text-muted small fw-bold d-block">إجمالي الفوائد البنكية</span>
                                    <h4 className="fw-bold text-danger font-monospace mt-1 mb-0">
                                        {totalLoanInterest.toLocaleString('en-US', { maximumFractionDigits: 2 })} د.أ
                                    </h4>
                                </div>
                            </div>
                            <div className="col-md-4">
                                <div className="p-3 rounded-4 bg-light border">
                                    <span className="text-muted small fw-bold d-block">إجمالي المبلغ المستحق</span>
                                    <h4 className="fw-bold text-navy font-monospace mt-1 mb-0">
                                        {totalLoanPayable.toLocaleString('en-US', { maximumFractionDigits: 2 })} د.أ
                                    </h4>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 5. حاسبة الضريبة والخصومات */}
                {activeTab === 'discount' && (
                    <div className="card border-0 shadow-sm rounded-4 p-4 fade-in">
                        <h5 className="fw-bold text-navy mb-3 border-bottom pb-2">
                            <i className="fas fa-tags me-2 text-warning"></i> حاسبة التسويات المالية والخصم وضريبة المبيعات (16%)
                        </h5>
                        <div className="row g-3 mb-4">
                            <div className="col-md-4">
                                <label className="form-label fw-bold">المبلغ الأصلي / الأتعاب (د.أ)</label>
                                <input
                                    type="number"
                                    className="form-control"
                                    value={discOriginal}
                                    onChange={(e) => setDiscOriginal(e.target.value)}
                                />
                            </div>
                            <div className="col-md-4">
                                <label className="form-label fw-bold">نسبة الخصم الممنوح (%)</label>
                                <input
                                    type="number"
                                    className="form-control"
                                    value={discPercent}
                                    onChange={(e) => setDiscPercent(e.target.value)}
                                />
                            </div>
                            <div className="col-md-4">
                                <label className="form-label fw-bold">نسبة الضريبة المضافة (%)</label>
                                <input
                                    type="number"
                                    className="form-control"
                                    value={vatPercent}
                                    onChange={(e) => setVatPercent(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="row g-3 text-center">
                            <div className="col-md-4">
                                <div className="p-3 rounded-4 bg-light border">
                                    <span className="text-muted small fw-bold d-block">قيمة الخصم (الوفر)</span>
                                    <h4 className="fw-bold text-success font-monospace mt-1 mb-0">
                                        {discVal.toLocaleString('en-US', { maximumFractionDigits: 2 })} د.أ
                                    </h4>
                                </div>
                            </div>
                            <div className="col-md-4">
                                <div className="p-3 rounded-4 bg-light border">
                                    <span className="text-muted small fw-bold d-block">قيمة الضريبة المضافة</span>
                                    <h4 className="fw-bold text-warning font-monospace mt-1 mb-0">
                                        {vatVal.toLocaleString('en-US', { maximumFractionDigits: 2 })} د.أ
                                    </h4>
                                </div>
                            </div>
                            <div className="col-md-4">
                                <div className="p-3 rounded-4 bg-navy text-white">
                                    <span className="small fw-bold d-block opacity-75">الصافي النهائي شامل الضريبة</span>
                                    <h4 className="fw-bold text-warning font-monospace mt-1 mb-0">
                                        {finalWithVat.toLocaleString('en-US', { maximumFractionDigits: 2 })} د.أ
                                    </h4>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 6. حاسبة نقطة التعادل */}
                {activeTab === 'breakeven' && (
                    <div className="card border-0 shadow-sm rounded-4 p-4 fade-in">
                        <h5 className="fw-bold text-navy mb-3 border-bottom pb-2">
                            <i className="fas fa-balance-scale-right me-2 text-warning"></i> حاسبة نقطة التعادل للشركات والمشاريع التجارية
                        </h5>
                        <div className="row g-3 mb-4">
                            <div className="col-md-4">
                                <label className="form-label fw-bold">التكاليف الثابتة الشهرية (د.أ)</label>
                                <input
                                    type="number"
                                    className="form-control"
                                    value={beFixedCost}
                                    onChange={(e) => setBeFixedCost(e.target.value)}
                                />
                            </div>
                            <div className="col-md-4">
                                <label className="form-label fw-bold">سعر بيع الوحدة / الخدمة (د.أ)</label>
                                <input
                                    type="number"
                                    className="form-control"
                                    value={beUnitPrice}
                                    onChange={(e) => setBeUnitPrice(e.target.value)}
                                />
                            </div>
                            <div className="col-md-4">
                                <label className="form-label fw-bold">التكلفة المتغيرة للوحدة (د.أ)</label>
                                <input
                                    type="number"
                                    className="form-control"
                                    value={beVariableCost}
                                    onChange={(e) => setBeVariableCost(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="row g-3 text-center">
                            <div className="col-md-4">
                                <div className="p-3 rounded-4 bg-light border">
                                    <span className="text-muted small fw-bold d-block">هامش المساهمة للوحدة</span>
                                    <h4 className="fw-bold text-navy font-monospace mt-1 mb-0">
                                        {contributionMargin.toLocaleString('en-US', { maximumFractionDigits: 2 })} د.أ
                                    </h4>
                                </div>
                            </div>
                            <div className="col-md-4">
                                <div className="p-3 rounded-4 bg-light border">
                                    <span className="text-muted small fw-bold d-block">عدد الوحدات اللازم للتعادل</span>
                                    <h4 className="fw-bold text-primary font-monospace mt-1 mb-0">
                                        {breakEvenUnits.toLocaleString('en-US')} وحدة
                                    </h4>
                                </div>
                            </div>
                            <div className="col-md-4">
                                <div className="p-3 rounded-4 bg-light border">
                                    <span className="text-muted small fw-bold d-block">حجم المبيعات اللازم للتعادل</span>
                                    <h4 className="fw-bold text-success font-monospace mt-1 mb-0">
                                        {breakEvenRevenue.toLocaleString('en-US', { maximumFractionDigits: 2 })} د.أ
                                    </h4>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <BottomNav activeTab="tools" />
        </div>
    );
};
