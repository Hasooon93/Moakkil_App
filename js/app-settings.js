/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/app-settings.js
 * الوصف: محرك الإعدادات (White-Labeling)، ومحرك المشاركة الذكي (Smart Share) - النسخة V5.1 المحصنة أمنياً.
 * التصميم: بناء الهيكل المتقدم للتعامل مع JSONB والرفع السحابي مع إغلاق ثغرات Stored XSS.
 * ============================================================================
 */

window.AppSettings = {
    
    // ==========================================
    // 0. دوال الحماية والتعقيم (Security Helpers)
    // ==========================================
    _escapeHTML: function(str) {
        if (window.UTILS && typeof window.UTILS.escapeHTML === 'function') {
            return window.UTILS.escapeHTML(str);
        }
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>'"]/g, (tag) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag));
    },

    _sanitizeColor: function(color, fallback) {
        if (window.UTILS && typeof window.UTILS.sanitizeColor === 'function') {
            return window.UTILS.sanitizeColor(color, fallback);
        }
        return (typeof color === 'string' && /^#[0-9A-Fa-f]{3,8}$/.test(color.trim())) ? color.trim() : fallback;
    },

    /**
     * 🛡️ تحديث اسم المكتب في الترويسة العلوية بأمان تام ضد Stored XSS عبر DOM API
     */
    _renderSafeTopFirmName: function(firmName, logoUrl = '') {
        const topFirmName = document.getElementById('top-firm-name');
        if (!topFirmName) return;

        topFirmName.textContent = ''; // تفريغ آمن

        if (logoUrl && typeof logoUrl === 'string' && (logoUrl.startsWith('http://') || logoUrl.startsWith('https://') || logoUrl.startsWith('/'))) {
            const img = document.createElement('img');
            img.src = logoUrl;
            img.width = 20;
            img.height = 20;
            img.className = 'me-1 rounded';
            img.style.objectFit = 'cover';
            img.alt = 'Logo';
            img.onerror = function() { this.style.display = 'none'; };
            topFirmName.appendChild(img);
        } else {
            const icon = document.createElement('i');
            icon.className = 'fas fa-balance-scale me-1';
            icon.style.color = 'var(--gold-luxury)';
            topFirmName.appendChild(icon);
        }

        const textNode = document.createTextNode(' ' + (firmName || 'منصة موكّل'));
        topFirmName.appendChild(textNode);
    },

    /**
     * تطبيق الهوية اللونية للمكتب على متغيرات الـ CSS القياسية
     */
    _applyThemeColors: function(primaryColor, accentColor) {
        const safePrimary = this._sanitizeColor(primaryColor, '#0B132B');
        const safeAccent = this._sanitizeColor(accentColor, '#D4AF37');

        document.documentElement.style.setProperty('--firm-brand-primary', safePrimary);
        document.documentElement.style.setProperty('--gold-luxury', safeAccent);
        document.documentElement.style.setProperty('--accent', safeAccent);

        if (document.documentElement.getAttribute('data-theme') !== 'dark') {
            document.documentElement.style.setProperty('--primary-dark', safePrimary);
            document.documentElement.style.setProperty('--navy', safePrimary);
        } else {
            document.documentElement.style.removeProperty('--primary-dark');
            document.documentElement.style.removeProperty('--navy');
        }
    },

    // ==========================================
    // 1. محرك الإعدادات (Settings Engine)
    // ==========================================
    loadSettings: async function() {
        try {
            const user = window.AppCore?.currentUser || JSON.parse(localStorage.getItem(window.CONFIG?.USER_KEY || 'moakkil_user') || 'null');
            if (!user || !user.firm_id) return;

            const el = (id) => document.getElementById(id);

            // إظهار زر الإعدادات للمدير فقط
            if ((user.role === 'admin' || user.role === 'super_admin') && el('firm-settings-btn')) {
                el('firm-settings-btn').style.display = 'block';
            }

            // 1. التطبيق الفوري من الكاش المحلي لسرعة الاستجابة (Optimistic UI)
            try {
                const cachedSettings = JSON.parse(localStorage.getItem('firm_settings') || 'null');
                const cachedName = localStorage.getItem('firm_name') || cachedSettings?.firm_name || '';
                if (cachedSettings) {
                    this._applyThemeColors(cachedSettings.primary_color, cachedSettings.accent_color);
                    if (cachedName) this._renderSafeTopFirmName(cachedName, cachedSettings.logo_url);
                }
            } catch (cacheErr) {}

            // 2. جلب أحدث الإعدادات من السيرفر السحابي
            let firms = null;
            if (window.API && typeof window.API.getFirmSettings === 'function') {
                firms = await window.API.getFirmSettings();
            } else {
                const token = localStorage.getItem(window.CONFIG?.TOKEN_KEY || 'moakkil_token');
                const deviceId = localStorage.getItem('moakkil_device_id') || 'unknown-device';
                const baseUrl = window.API_BASE_URL || window.CONFIG?.API_URL || '';
                const response = await fetch(`${baseUrl}/api/firms?id=eq.${encodeURIComponent(user.firm_id)}`, {
                    method: 'GET',
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'x-device-id': deviceId
                    }
                });
                if (response.ok) firms = await response.json();
            }

            if (!Array.isArray(firms) || firms.length === 0) return;
            
            const firm = firms[0];
            const settings = (firm.settings && typeof firm.settings === 'object') ? firm.settings : {};
            const firmName = firm.firm_name || settings.firm_name || 'مكتب المحاماة';
            const phoneVal = settings.phone || firm.phone || firm.firm_phone || '';
            const addressVal = settings.address || firm.address || firm.firm_address || '';
            const logoVal = settings.logo_url || firm.logo_url || '';
            const primaryVal = this._sanitizeColor(settings.primary_color || firm.primary_color, '#0B132B');
            const accentVal = this._sanitizeColor(settings.accent_color || firm.accent_color, '#D4AF37');
            const currencyVal = settings.currency || firm.currency || firm.currency_code || 'د.أ';
            const taxVal = settings.tax_percent !== undefined ? settings.tax_percent : (firm.tax_rate || '');
            const invPrefixVal = settings.inv_prefix || firm.invoice_prefix || 'INV-2026-';
            const legalTermsVal = settings.legal_terms || firm.legal_terms || '';
            const allowHardDeleteVal = settings.allow_hard_delete === true || firm.allow_hard_delete === true;

            if (el('firm_setting_name')) el('firm_setting_name').value = firmName;
            if (el('firm_setting_phone')) el('firm_setting_phone').value = phoneVal;
            if (el('firm_setting_address')) el('firm_setting_address').value = addressVal;
            if (el('firm_setting_logo')) el('firm_setting_logo').value = logoVal;
            if (el('firm_setting_primary')) el('firm_setting_primary').value = primaryVal;
            if (el('firm_setting_accent')) el('firm_setting_accent').value = accentVal;
            if (el('firm_setting_currency')) el('firm_setting_currency').value = currencyVal;
            if (el('firm_setting_tax')) el('firm_setting_tax').value = taxVal;
            if (el('firm_setting_inv_prefix')) el('firm_setting_inv_prefix').value = invPrefixVal;
            if (el('firm_setting_legal_terms')) el('firm_setting_legal_terms').value = legalTermsVal;
            
            const hardDeleteCheckbox = el('firm_setting_allow_hard_delete');
            if (hardDeleteCheckbox) {
                hardDeleteCheckbox.checked = allowHardDeleteVal;
            }

            // توحيد كائن الإعدادات المحلي ليحوي firm_name أيضاً لخدمة البطاقة الذكية والفواتير
            const unifiedLocalSettings = {
                ...settings,
                firm_name: firmName,
                phone: phoneVal,
                firm_phone: phoneVal,
                address: addressVal,
                firm_address: addressVal,
                logo_url: logoVal,
                primary_color: primaryVal,
                accent_color: accentVal,
                currency: currencyVal,
                tax_percent: taxVal,
                inv_prefix: invPrefixVal,
                legal_terms: legalTermsVal,
                allow_hard_delete: allowHardDeleteVal
            };

            localStorage.setItem('firm_settings', JSON.stringify(unifiedLocalSettings));
            localStorage.setItem('firm_name', firmName);
            
            this._applyThemeColors(primaryVal, accentVal);

            // 🛡️ عرض اسم المكتب في الهيدر بأمان تام (بدون ثغرة Stored XSS)
            this._renderSafeTopFirmName(firmName, logoVal);

        } catch (error) {
            console.error("Error loading firm settings:", error);
        }
    },

    saveSettings: async function(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        
        const formEl = e?.target || document.querySelector('#settingsModal form');
        const btn = formEl ? formEl.querySelector('button[type="submit"]') : null;
        if (btn) { 
            btn.disabled = true; 
            btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري رفع وحفظ الإعدادات...'; 
        }

        try {
            const user = window.AppCore?.currentUser || JSON.parse(localStorage.getItem(window.CONFIG?.USER_KEY || 'moakkil_user') || 'null');
            if (!user || !user.firm_id) throw new Error('بيانات الجلسة مفقودة');
            if (user.role !== 'admin' && user.role !== 'super_admin') {
                throw new Error('صلاحية تعديل إعدادات المكتب مقتصرة على المدير العام فقط.');
            }

            const baseUrl = window.API_BASE_URL || window.CONFIG?.API_URL || '';
            const el = (id) => document.getElementById(id);
            let logoUrl = (el('firm_setting_logo')?.value || '').trim();
            if (logoUrl.startsWith('📄')) logoUrl = '';

            const fileInput = el('firm_setting_logo_file');
            if (fileInput && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : 'png';
                const logoFile = new File([file], `firm_logo_${Date.now()}.${ext}`, { type: file.type || 'image/png' });
                if (window.API && typeof window.API.uploadFileToR2 === 'function') {
                    const uploadRes = await window.API.uploadFileToR2(logoFile, 'logos', user.firm_id);
                    if (uploadRes && uploadRes.success && uploadRes.r2_key) {
                        logoUrl = `${baseUrl}/api/public/r2/download?key=${encodeURIComponent(uploadRes.r2_key)}`;
                    } else {
                        throw new Error('فشل في رفع الشعار للسحابة.');
                    }
                } else {
                    const token = localStorage.getItem(window.CONFIG?.TOKEN_KEY || 'moakkil_token');
                    const deviceId = localStorage.getItem('moakkil_device_id') || 'unknown-device';
                    const uploadReq = await fetch(`${baseUrl}/api/r2/upload`, {
                        method: 'POST',
                        headers: { 
                            'Authorization': `Bearer ${token}`,
                            'x-device-id': deviceId,
                            'x-file-name': encodeURIComponent(logoFile.name),
                            'x-client-id': encodeURIComponent('logos'),
                            'x-case-id': encodeURIComponent(user.firm_id)
                        },
                        body: logoFile
                    });
                    if (uploadReq.ok) {
                        const upData = await uploadReq.json();
                        logoUrl = `${baseUrl}/api/public/r2/download?key=${encodeURIComponent(upData.r2_key)}`;
                    } else {
                        throw new Error('تعذر الاتصال بخادم التخزين R2.');
                    }
                }
                if (el('firm_setting_logo')) el('firm_setting_logo').value = logoUrl;
                fileInput.value = '';
            }

            const firmName = (el('firm_setting_name')?.value || '').trim() || 'مكتب المحاماة';
            const primaryColor = this._sanitizeColor(el('firm_setting_primary')?.value, '#0B132B');
            const accentColor = this._sanitizeColor(el('firm_setting_accent')?.value, '#D4AF37');
            
            const settingsPayload = {
                firm_name: firmName,
                phone: (el('firm_setting_phone')?.value || '').trim(),
                address: (el('firm_setting_address')?.value || '').trim(),
                logo_url: logoUrl,
                primary_color: primaryColor,
                accent_color: accentColor,
                currency: (el('firm_setting_currency')?.value || 'د.أ').trim(),
                tax_percent: el('firm_setting_tax')?.value || '',
                inv_prefix: (el('firm_setting_inv_prefix')?.value || 'INV-2026-').trim(),
                legal_terms: (el('firm_setting_legal_terms')?.value || '').trim(),
                allow_hard_delete: el('firm_setting_allow_hard_delete')?.checked === true
            };

            const payload = {
                firm_name: firmName,
                settings: settingsPayload
            };

            let saveResult = null;
            if (window.API && typeof window.API.updateFirmSettings === 'function') {
                saveResult = await window.API.updateFirmSettings(payload);
                if (saveResult && saveResult.error) throw new Error(saveResult.error);
            } else {
                const token = localStorage.getItem(window.CONFIG?.TOKEN_KEY || 'moakkil_token');
                const deviceId = localStorage.getItem('moakkil_device_id') || 'unknown-device';
                const response = await fetch(`${baseUrl}/api/firms?id=eq.${encodeURIComponent(user.firm_id)}`, {
                    method: 'PATCH',
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'x-device-id': deviceId,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify(payload)
                });
                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.error || 'تم رفض الطلب من قبل الخادم. تأكد من الصلاحيات.');
                }
            }

            localStorage.setItem('firm_settings', JSON.stringify(settingsPayload));
            localStorage.setItem('firm_name', firmName);

            this._applyThemeColors(primaryColor, accentColor);

            // 🛡️ تحديث اسم المكتب في الترويسة بأمان تام ضد XSS
            this._renderSafeTopFirmName(firmName, logoUrl);

            if (window.AppCore && typeof window.AppCore.showToast === 'function') {
                window.AppCore.showToast('تم حفظ إعدادات المكتب وتطبيقها بنجاح!', 'success');
                if (typeof window.AppCore.closeModal === 'function') window.AppCore.closeModal('settingsModal');
            } else if (window.showToast) {
                window.showToast('تم حفظ إعدادات المكتب وتطبيقها بنجاح!', 'success');
                const modalEl = document.getElementById('settingsModal');
                if (modalEl && typeof bootstrap !== 'undefined') {
                    const inst = bootstrap.Modal.getInstance(modalEl);
                    if (inst) inst.hide();
                }
            }

        } catch (error) {
            console.error("Save Settings Error:", error);
            if (window.AppCore && typeof window.AppCore.showToast === 'function') {
                window.AppCore.showToast('حدث خطأ أثناء الحفظ: ' + error.message, 'danger');
            } else if (window.showToast) {
                window.showToast('حدث خطأ أثناء الحفظ: ' + error.message, 'error');
            }
        } finally {
            if (btn) { 
                btn.disabled = false; 
                btn.innerHTML = '<i class="fas fa-check-double me-2"></i> حفظ وتطبيق الإعدادات فوراً'; 
            }
        }
    },

    // ==========================================
    // 2. محرك المشاركة الذكي (Smart Share Engine)
    // ==========================================
    
    /**
     * دالة لفتح نافذة المشاركة وتوليد الرابط الآمن
     * @param {string} type نوع العنصر (case, receipt, cv, file)
     * @param {string} id المعرف (ID)
     * @param {string} title عنوان العنصر للمستخدم
     * @param {string} token التوكن السري (إذا كان قضية)
     * @param {string} pinCode الرمز السري للقضية (اختياري)
     */
    openShareModal: function(type, id, title, token = null, pinCode = null) {
        const baseUrl = window.location.origin;
        let shareUrl = '';

        // توليد الرابط بناءً على النوع
        if (type === 'case' && (token || id)) {
            shareUrl = `${baseUrl}/client.html?token=${encodeURIComponent(token || id)}`;
        } else if (type === 'receipt') {
            shareUrl = `${baseUrl}/verify.html?type=receipt&id=${encodeURIComponent(id)}`;
        } else if (type === 'cv') {
            shareUrl = `${baseUrl}/verify.html?type=cv&id=${encodeURIComponent(id)}`;
        } else {
            shareUrl = `${baseUrl}/verify.html?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`;
        }

        // 🛡️ تعبئة العنوان في النافذة بأمان ضد XSS
        const titleEl = document.getElementById('share_modal_title');
        if (titleEl) {
            titleEl.innerHTML = `<i class="fas fa-share-alt text-primary me-2"></i> مشاركة الرابط الموثق: <span class="text-navy">${this._escapeHTML(title || '')}</span>`;
        }
        
        // دعم كلا المعرفين في واجهات النظام (share_modal_link و share_link_input)
        const linkInput = document.getElementById('share_modal_link') || document.getElementById('share_link_input');
        if (linkInput) linkInput.value = shareUrl;

        // دعم عرض الـ PIN إن وُجد
        const pinContainer = document.getElementById('share_pin_container');
        const pinInput = document.getElementById('share_pin_input');
        if (pinInput) {
            if (pinCode) {
                if (pinContainer) pinContainer.classList.remove('d-none');
                pinInput.value = pinCode;
            } else if (pinContainer) {
                pinContainer.classList.add('d-none');
                pinInput.value = '';
            }
        }

        // توليد QR Code ديناميكي للرابط (دعم share_modal_qr و share-qrcode)
        const qrContainer = document.getElementById('share_modal_qr') || document.getElementById('share-qrcode');
        if (qrContainer && typeof QRCode !== 'undefined') {
            qrContainer.innerHTML = ''; // مسح القديم
            new QRCode(qrContainer, {
                text: shareUrl,
                width: 150,
                height: 150,
                colorDark : "#0B132B",
                colorLight : "#ffffff",
                correctLevel : QRCode.CorrectLevel.H
            });
        }

        // فتح النافذة
        if (window.AppCore && typeof window.AppCore.openModal === 'function') {
            window.AppCore.openModal('shareModal');
        } else {
            try {
                const modalEl = document.getElementById('shareModal');
                if (modalEl && typeof bootstrap !== 'undefined') {
                    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
                    modal.show();
                }
            } catch(e) { console.error("Bootstrap modal error:", e); }
        }
    },

    copyShareLink: function() {
        const linkInput = document.getElementById('share_modal_link') || document.getElementById('share_link_input');
        if (linkInput && linkInput.value) {
            linkInput.select();
            linkInput.setSelectionRange(0, 99999); // للهواتف
            const notifySuccess = () => {
                if (window.AppCore && typeof window.AppCore.showToast === 'function') {
                    window.AppCore.showToast('تم نسخ الرابط الموثق للحافظة بنجاح!', 'success');
                } else if (window.showToast) {
                    window.showToast('تم نسخ الرابط الموثق للحافظة بنجاح!', 'success');
                }
            };

            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                navigator.clipboard.writeText(linkInput.value).then(notifySuccess).catch(() => {
                    try { document.execCommand('copy'); notifySuccess(); } catch (e) {}
                });
            } else {
                try {
                    document.execCommand('copy');
                    notifySuccess();
                } catch(err) {
                    console.error('Failed to copy', err);
                }
            }
        }
    },

    shareViaWhatsApp: function() {
        const linkInput = document.getElementById('share_modal_link') || document.getElementById('share_link_input');
        const pinInput = document.getElementById('share_pin_input');
        const pinContainer = document.getElementById('share_pin_container');
        const titleText = document.getElementById('share_modal_title')?.innerText || 'بوابة الموكل القانونية';
        if (linkInput && linkInput.value) {
            let rawMsg = `مرحباً،\nمرفق لكم الرابط الموثق من نظام إدارة المكتب القانوني (${titleText.trim()}):\n\n${linkInput.value}\n`;
            if (pinInput && pinInput.value && (!pinContainer || !pinContainer.classList.contains('d-none'))) {
                rawMsg += `\nرمز الدخول السري (PIN): ${pinInput.value}\n`;
            }
            rawMsg += `\nمع التحية.`;
            const text = encodeURIComponent(rawMsg);
            window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
        }
    }
};

// Global Bindings for HTML elements
window.saveFirmSettings = (e) => window.AppSettings.saveSettings(e);
window.copyShareLink = () => window.AppSettings.copyShareLink();
window.shareViaWhatsApp = () => window.AppSettings.shareViaWhatsApp();

document.addEventListener('DOMContentLoaded', () => {
    window.AppSettings.loadSettings();

    const logoInput = document.getElementById('firm_setting_logo_file');
    if (logoInput) {
        logoInput.addEventListener('change', function() {
            if (this.files && this.files.length > 0) {
                const urlInput = document.getElementById('firm_setting_logo');
                if (urlInput) urlInput.value = "📄 تم إرفاق ملف للرفع: " + this.files[0].name;
            }
        });
    }
});