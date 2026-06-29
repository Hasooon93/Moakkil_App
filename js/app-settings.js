/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/app-settings.js
 * الوصف: محرك الإعدادات (White-Labeling)، ومحرك المشاركة الذكي (Smart Share).
 * التصميم: بناء الهيكل المتقدم للتعامل مع JSONB والرفع السحابي.
 * ============================================================================
 */

window.AppSettings = {
    
    // ==========================================
    // 1. محرك الإعدادات (Settings Engine)
    // ==========================================
    loadSettings: async function() {
        try {
            const user = window.AppCore?.currentUser || JSON.parse(localStorage.getItem('moakkil_user'));
            if (!user || !user.firm_id) return;
            
            const token = localStorage.getItem('moakkil_token');
            const baseUrl = window.API_BASE_URL || window.CONFIG?.API_URL || '';
            
            const response = await fetch(`${baseUrl}/api/firms?id=eq.${user.firm_id}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!response.ok) return;
            const firms = await response.json();
            if (!firms || firms.length === 0) return;
            
            const firm = firms[0];
            const settings = firm.settings || {}; 

            const el = (id) => document.getElementById(id);
            
            if(el('firm_setting_name')) el('firm_setting_name').value = firm.firm_name || '';
            if(el('firm_setting_phone')) el('firm_setting_phone').value = settings.phone || '';
            if(el('firm_setting_address')) el('firm_setting_address').value = settings.address || '';
            if(el('firm_setting_logo')) el('firm_setting_logo').value = settings.logo_url || '';
            if(el('firm_setting_primary')) el('firm_setting_primary').value = settings.primary_color || '#0B132B';
            if(el('firm_setting_accent')) el('firm_setting_accent').value = settings.accent_color || '#D4AF37';
            if(el('firm_setting_currency')) el('firm_setting_currency').value = settings.currency || 'د.أ';
            if(el('firm_setting_tax')) el('firm_setting_tax').value = settings.tax_percent || '';
            if(el('firm_setting_inv_prefix')) el('firm_setting_inv_prefix').value = settings.inv_prefix || 'INV-2026-';
            if(el('firm_setting_legal_terms')) el('firm_setting_legal_terms').value = settings.legal_terms || '';
            
            const hardDeleteCheckbox = el('firm_setting_allow_hard_delete');
            if (hardDeleteCheckbox) {
                hardDeleteCheckbox.checked = settings.allow_hard_delete === true;
            }

            localStorage.setItem('firm_settings', JSON.stringify(settings));
            localStorage.setItem('firm_name', firm.firm_name);
            
            if (document.documentElement.getAttribute('data-theme') !== 'dark') {
                if (settings.primary_color) {
                    document.documentElement.style.setProperty('--primary-dark', settings.primary_color);
                    document.documentElement.style.setProperty('--navy', settings.primary_color);
                }
                if (settings.accent_color) {
                    document.documentElement.style.setProperty('--gold-luxury', settings.accent_color);
                    document.documentElement.style.setProperty('--accent', settings.accent_color);
                }
            }

            const topFirmName = el('top-firm-name');
            if (topFirmName) topFirmName.innerHTML = `<i class="fas fa-balance-scale me-1" style="color: var(--gold-luxury);"></i> ${firm.firm_name}`;

            if ((user.role === 'admin' || user.role === 'super_admin') && el('firm-settings-btn')) {
                el('firm-settings-btn').style.display = 'block';
            }

        } catch (error) {
            console.error("Error loading firm settings:", error);
        }
    },

    saveSettings: async function(e) {
        e.preventDefault();
        
        const btn = e.target.querySelector('button[type="submit"]');
        if (btn) { 
            btn.disabled = true; 
            btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري رفع وحفظ الإعدادات...'; 
        }

        try {
            const user = window.AppCore?.currentUser || JSON.parse(localStorage.getItem('moakkil_user'));
            if (!user || !user.firm_id) throw new Error('بيانات الجلسة مفقودة');

            const baseUrl = window.API_BASE_URL || window.CONFIG?.API_URL || '';
            const el = (id) => document.getElementById(id);
            let logoUrl = el('firm_setting_logo').value;

            const fileInput = el('firm_setting_logo_file');
            if (fileInput && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                if (window.API && typeof window.API.uploadFileToR2 === 'function') {
                    const uploadRes = await window.API.uploadFileToR2(file, 'logos', user.firm_id);
                    if (uploadRes && uploadRes.success) {
                        logoUrl = `${baseUrl}/api/r2/download?key=${encodeURIComponent(uploadRes.r2_key)}`;
                    } else {
                        throw new Error('فشل في رفع الشعار للسحابة.');
                    }
                } else {
                    const uploadReq = await fetch(`${baseUrl}/api/r2/upload`, {
                        method: 'POST',
                        headers: { 
                            'Authorization': `Bearer ${localStorage.getItem('moakkil_token')}`,
                            'x-file-name': `logo_${Date.now()}_${file.name}`
                        },
                        body: file
                    });
                    if (uploadReq.ok) {
                        const upData = await uploadReq.json();
                        logoUrl = `${baseUrl}/api/r2/download?key=${encodeURIComponent(upData.r2_key)}`;
                    } else {
                        throw new Error('تعذر الاتصال بخادم التخزين R2.');
                    }
                }
            }

            const firmName = el('firm_setting_name').value;
            
            const settingsPayload = {
                phone: el('firm_setting_phone')?.value || '',
                address: el('firm_setting_address')?.value || '',
                logo_url: logoUrl,
                primary_color: el('firm_setting_primary')?.value || '#0B132B',
                accent_color: el('firm_setting_accent')?.value || '#D4AF37',
                currency: el('firm_setting_currency')?.value || 'د.أ',
                tax_percent: el('firm_setting_tax')?.value || '',
                inv_prefix: el('firm_setting_inv_prefix')?.value || 'INV-2026-',
                legal_terms: el('firm_setting_legal_terms')?.value || '',
                allow_hard_delete: el('firm_setting_allow_hard_delete')?.checked || false
            };

            const payload = {
                firm_name: firmName,
                settings: settingsPayload
            };

            const token = localStorage.getItem('moakkil_token');
            const response = await fetch(`${baseUrl}/api/firms?id=eq.${user.firm_id}`, {
                method: 'PATCH',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('تم رفض الطلب من قبل الخادم. تأكد من الصلاحيات.');

            localStorage.setItem('firm_settings', JSON.stringify(settingsPayload));
            localStorage.setItem('firm_name', firmName);

            if (document.documentElement.getAttribute('data-theme') !== 'dark') {
                document.documentElement.style.setProperty('--primary-dark', settingsPayload.primary_color);
                document.documentElement.style.setProperty('--navy', settingsPayload.primary_color);
                document.documentElement.style.setProperty('--gold-luxury', settingsPayload.accent_color);
                document.documentElement.style.setProperty('--accent', settingsPayload.accent_color);
            }

            const topFirmName = el('top-firm-name');
            if (topFirmName) topFirmName.innerHTML = `<i class="fas fa-balance-scale me-1" style="color: var(--gold-luxury);"></i> ${firmName}`;

            if(window.AppCore && window.AppCore.showToast) {
                window.AppCore.showToast('تم حفظ إعدادات المكتب وتطبيقها بنجاح!', 'success');
                window.AppCore.closeModal('settingsModal');
            }

        } catch (error) {
            console.error("Save Settings Error:", error);
            if(window.AppCore && window.AppCore.showToast) {
                window.AppCore.showToast('حدث خطأ أثناء الحفظ: ' + error.message, 'danger');
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
     * @param {string} type - نوع العنصر (case, receipt, file)
     * @param {string} id - المعرف (ID)
     * @param {string} title - عنوان العنصر للمستخدم
     * @param {string} token - التوكن السري (إذا كان قضية)
     */
    openShareModal: function(type, id, title, token = null) {
        const baseUrl = window.location.origin;
        let shareUrl = '';

        // توليد الرابط بناءً على النوع
        if (type === 'case' && token) {
            shareUrl = `${baseUrl}/client.html?token=${token}`;
        } else if (type === 'receipt') {
            shareUrl = `${baseUrl}/verify.html?type=receipt&id=${id}`;
        } else if (type === 'cv') {
            shareUrl = `${baseUrl}/verify.html?type=cv&id=${id}`;
        } else {
            shareUrl = `${baseUrl}/verify.html?type=${type}&id=${id}`;
        }

        // تعبئة البيانات في النافذة
        const titleEl = document.getElementById('share_modal_title');
        if (titleEl) titleEl.innerHTML = `<i class="fas fa-share-alt text-primary me-2"></i> مشاركة الرابط الموثق: <span class="text-navy">${title || ''}</span>`;
        
        const linkInput = document.getElementById('share_modal_link');
        if (linkInput) linkInput.value = shareUrl;

        // توليد QR Code ديناميكي للرابط (إن كانت المكتبة متوفرة)
        const qrContainer = document.getElementById('share_modal_qr');
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
                const modal = new bootstrap.Modal(document.getElementById('shareModal'));
                modal.show();
            } catch(e) { console.error("Bootstrap modal error:", e); }
        }
    },

    copyShareLink: function() {
        const linkInput = document.getElementById('share_modal_link');
        if (linkInput) {
            linkInput.select();
            linkInput.setSelectionRange(0, 99999); // للهواتف
            try {
                document.execCommand('copy');
                if(window.AppCore && window.AppCore.showToast) {
                    window.AppCore.showToast('تم نسخ الرابط الموثق للحافظة بنجاح!', 'success');
                }
            } catch(err) {
                console.error('Failed to copy', err);
            }
        }
    },

    shareViaWhatsApp: function() {
        const linkInput = document.getElementById('share_modal_link');
        const titleText = document.getElementById('share_modal_title')?.innerText || 'رابط موثق';
        if (linkInput) {
            const text = encodeURIComponent(`مرحباً،\nمرفق لكم الرابط الموثق من نظام إدارة المكتب القانوني لـ (${titleText}):\n\n${linkInput.value}\n\nمع التحية.`);
            window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
        }
    }
};

// Global Bindings for HTML elements
window.saveFirmSettings = (e) => window.AppSettings.saveSettings(e);
window.copyShareLink = () => window.AppSettings.copyShareLink();
window.shareViaWhatsApp = () => window.AppSettings.shareViaWhatsApp();

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { window.AppSettings.loadSettings(); }, 800);

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