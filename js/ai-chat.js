/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/ai-chat.js
 * الإصدار: V5.6 Enterprise Edition (Legal AI Advisor & Multi-Turn Stream Engine)
 * ============================================================================
 * الميزات والمهام:
 * 1. محرك المحادثة التفاعلي الذكي للمستشار القانوني مع ذاكرة السياق المتعدد (Multi-Turn Memory).
 * 2. دعم استخراج الدفوع والثغرات القانونية المتقدمة (RAG Deep Analysis) من السجلات والتشريعات.
 * 3. منسق نصوص متطور للمذكرات والاستشارات (Markdown, Headers, Blockquotes, Bullets & Citations).
 * 4. حفظ واسترجac جلسة المحادثة النشطة محلياً (Session Persistence) مع عزل المستأجرين.
 * 5. الإملاء الصوتي الذكي المتكيف مع اللهجة المحلية واللغة المعتمدة للمنشأة.
 * 6. ميزة النسخ المباشر للرأي القانوني بضغطة زر مع شارات الاستناد التشريعي الموثقة.
 * ============================================================================
 */

const AIChatEngine = {
    chatMemory: [],
    MAX_MEMORY_LENGTH: 12,

    chatBox: null,
    chatInput: null,
    btnSend: null,
    deepAnalysisToggle: null,

    /**
     * جلب إعدادات المنشأة واللغة المعتمدة
     */
    getLocale: function() {
        try {
            const settings = JSON.parse(localStorage.getItem('firm_settings') || '{}');
            if (settings.locale) return settings.locale;
            if (settings.country === 'SA') return 'ar-SA';
            if (settings.country === 'AE') return 'ar-AE';
            if (settings.country === 'EG') return 'ar-EG';
            return 'ar-JO';
        } catch (e) {
            return 'ar-SA';
        }
    },

    /**
     * مفتاح تخزين جلسة المحادثة المعزول محلياً
     */
    getSessionKey: function() {
        try {
            const user = JSON.parse(localStorage.getItem(CONFIG?.USER_KEY || 'moakkil_user') || '{}');
            const uid = user.id || user.uid || 'guest';
            const firmId = user.firm_id || localStorage.getItem(CONFIG?.FIRM_KEY || 'moakkil_firm_id') || 'firm';
            return `moakkil_ai_chat_session_${firmId}_${uid}`;
        } catch (e) {
            return 'moakkil_ai_chat_session';
        }
    },

    /**
     * تهيئة محرك المحادثة
     */
    init: function() {
        // التحقق من صلاحية الجلسة
        if (typeof AUTH !== 'undefined' && typeof AUTH.checkSession === 'function') {
            if (!AUTH.checkSession()) return;
        }

        this.chatBox = document.getElementById('chat-box');
        this.chatInput = document.getElementById('chat-input');
        this.btnSend = document.getElementById('btn-send');
        this.deepAnalysisToggle = document.getElementById('deepAnalysisToggle');

        if (this.chatInput) {
            this.chatInput.addEventListener('keydown', (e) => this.handleEnter(e));
            this.chatInput.addEventListener('input', () => this.autoResize());
            this.chatInput.focus();
        }

        // استرجاع جلسة المحادثة السابقة إن وجدت
        this.restoreChatSession();

        // التقاط أي استعلام قادم من محرك البحث الشامل (?q=...)
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const prefillQuery = urlParams.get('q');
            if (prefillQuery && this.chatInput) {
                this.chatInput.value = `اشرح لي بالتفصيل القانوني والعملي: ${prefillQuery.trim()}`;
                this.autoResize();
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        } catch (e) {}
    },

    /**
     * منسق النصوص القانونية المتقدم (Advanced Markdown & Citations Parser)
     */
    formatText: function(text) {
        if (!text) return '';
        
        let f = String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        // 1. كتل الأكواد والتشريعات (Code Blocks)
        f = f.replace(/```([\s\S]*?)```/g, '<pre class="p-3 my-2 rounded-3 bg-dark text-light border border-secondary font-monospace overflow-auto" style="font-size: 0.85rem;" dir="ltr"><code>$1</code></pre>');

        // 2. الكلمات المضمنة وأرقام المواد (Inline Code)
        f = f.replace(/`([^`]+)`/g, '<code class="bg-secondary bg-opacity-10 text-danger border border-danger border-opacity-25 px-2 py-0.5 rounded font-monospace" style="font-size: 0.88rem;">$1</code>');

        // 3. العناوين القانونية
        f = f.replace(/^### (.*$)/gim, '<h6 class="fw-bold text-navy mt-3 mb-1"><i class="fas fa-bookmark me-1 text-warning"></i> $1</h6>');
        f = f.replace(/^## (.*$)/gim, '<h5 class="fw-bold text-navy mt-3 mb-2 border-bottom pb-1"><i class="fas fa-gavel me-1 text-warning"></i> $1</h5>');
        f = f.replace(/^# (.*$)/gim, '<h4 class="fw-bold text-navy mt-3 mb-2 border-bottom pb-2">$1</h4>');

        // 4. الاقتباسات والسند القانوني (Blockquotes)
        f = f.replace(/(?:^|\n)(?:&gt;|>)\s*(.*?)(?=\n|$)/g, '<blockquote class="border-end border-3 border-warning pe-3 my-2 text-muted fw-bold fst-italic" style="background: rgba(212, 175, 55, 0.05); padding: 8px 12px; border-radius: 4px;">$1</blockquote>');

        // 5. التنسيق العريض والمائل
        f = f.replace(/\*\*(.*?)\*\*/g, '<b class="text-navy fw-bold">$1</b>');
        f = f.replace(/\*(.*?)\*/g, '<i class="fst-italic">$1</i>');

        // 6. القوائم النقطية والرقمية
        f = f.replace(/\n-\s+(.*?)(?=\n|$)/g, '<br><span class="me-2 text-warning">•</span> $1');
        f = f.replace(/\n\*\s+(.*?)(?=\n|$)/g, '<br><span class="me-2 text-warning">•</span> $1');
        f = f.replace(/\n(\d+)\.\s+(.*?)(?=\n|$)/g, '<br><span class="badge bg-secondary bg-opacity-10 text-navy border me-1">$1</span> $2');

        // 7. فواصل الأسطر
        f = f.replace(/\n/g, '<br>');

        return f;
    },

    autoResize: function() {
        if (!this.chatInput) return;
        this.chatInput.style.height = 'auto';
        this.chatInput.style.height = Math.min(this.chatInput.scrollHeight, 120) + 'px';
    },

    handleEnter: function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
        }
    },

    /**
     * تفريغ محادثة الجلسة بالكامل وتصفير الذاكرة
     */
    clearChat: function() {
        this.chatMemory = [];
        try {
            sessionStorage.removeItem(this.getSessionKey());
        } catch (e) {}

        if (!this.chatBox) return;
        const time = new Date().toLocaleTimeString(this.getLocale(), { hour: '2-digit', minute: '2-digit' });

        this.chatBox.innerHTML = `
            <div class="chat-bubble chat-ai">
                <div class="msg-content">
                    <h6 class="fw-bold mb-2 text-navy"><i class="fas fa-broom me-2" style="color: var(--gold-luxury);"></i> جلسة استشارة قانونية جديدة</h6>
                    تم تفريغ الذاكرة وسياق المحادثة بالكامل. أنا مستعد لتلقي استفساراتك الجديدة وتقديم الرأي القانوني الموثق.
                </div>
                <div class="msg-footer">
                    <span class="msg-time">${time}</span>
                </div>
            </div>
        `;
    },

    scrollToBottom: function() {
        if (!this.chatBox) return;
        this.chatBox.scrollTop = this.chatBox.scrollHeight;
    },

    /**
     * حفظ الرسائل الحالية في سياق الجلسة
     */
    persistSession: function() {
        try {
            sessionStorage.setItem(this.getSessionKey(), JSON.stringify({
                memory: this.chatMemory,
                html: this.chatBox ? this.chatBox.innerHTML : ''
            }));
        } catch (e) {}
    },

    /**
     * استرجاع جلسة المحادثة السابقة
     */
    restoreChatSession: function() {
        try {
            const saved = sessionStorage.getItem(this.getSessionKey());
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.memory && Array.isArray(parsed.memory)) {
                    this.chatMemory = parsed.memory;
                }
                if (parsed.html && this.chatBox) {
                    this.chatBox.innerHTML = parsed.html;
                    this.scrollToBottom();
                }
            }
        } catch (e) {}
    },

    /**
     * نسخ النص القانوني للحافظة
     */
    copyText: function(btn, encodedText) {
        const text = decodeURIComponent(encodedText);
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                const icon = btn.querySelector('i');
                if (icon) {
                    icon.className = 'fas fa-check text-success';
                    setTimeout(() => { icon.className = 'far fa-copy'; }, 2000);
                }
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ 
                        toast: true, 
                        position: 'top-end', 
                        icon: 'success', 
                        title: 'تم نسخ النص القانوني للحافظة بنجاح!', 
                        showConfirmButton: false, 
                        timer: 2000 
                    });
                }
            });
        }
    },

    /**
     * إضافة فقاعة محادثة إلى الواجهة
     */
    appendMessage: function(text, sender, ragApplied = false) {
        if (!this.chatBox) return;
        const div = document.createElement('div');
        div.className = `chat-bubble ${sender === 'user' ? 'chat-user' : 'chat-ai'}`;

        const time = new Date().toLocaleTimeString(this.getLocale(), { hour: '2-digit', minute: '2-digit' });

        let copyBtnHtml = '';
        let ragBadgeHtml = '';
        if (sender === 'ai') {
            const escapedText = encodeURIComponent(text);
            copyBtnHtml = `<button type="button" class="copy-btn" onclick="AIChatEngine.copyText(this, '${escapedText}')" title="نسخ النص القانوني"><i class="far fa-copy"></i></button>`;
            if (ragApplied) {
                ragBadgeHtml = `<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 me-2" style="font-size: 0.68rem;"><i class="fas fa-book-scale me-1"></i> استناد تشريعي موثق (RAG)</span>`;
            }
        }

        div.innerHTML = `
            <div class="msg-content">${this.formatText(text)}</div>
            <div class="msg-footer">
                <div>
                    <span class="msg-time">${time}</span>
                    ${ragBadgeHtml}
                </div>
                ${copyBtnHtml}
            </div>
        `;

        this.chatBox.appendChild(div);
        this.scrollToBottom();
        this.persistSession();
    },

    showTyping: function() {
        if (!this.chatBox) return;
        this.removeTyping();
        const div = document.createElement('div');
        div.className = 'chat-bubble chat-ai w-75';
        div.id = 'typing';
        div.innerHTML = `
            <div class="msg-content d-flex gap-2 align-items-center">
                <span class="spinner-grow spinner-grow-sm text-warning" role="status"></span>
                <small class="text-muted fw-bold">جاري البحث في التشريعات والأنظمة وصياغة الرأي القانوني...</small>
            </div>
        `;
        this.chatBox.appendChild(div);
        this.scrollToBottom();
    },

    removeTyping: function() {
        const typing = document.getElementById('typing');
        if (typing) typing.remove();
    },

    /**
     * إرسال الرسالة إلى المعالج السحابي
     */
    sendMessage: async function() {
        if (!this.chatInput) return;
        const text = this.chatInput.value.trim();
        if (!text) return;

        if (!navigator.onLine) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({ 
                    toast: true, 
                    position: 'top-end', 
                    icon: 'warning', 
                    title: 'أنت في وضع عدم الاتصال (Offline).', 
                    showConfirmButton: false, 
                    timer: 3000 
                });
            }
            return;
        }

        this.appendMessage(text, 'user');
        this.chatInput.value = '';
        this.autoResize();
        this.chatInput.focus();

        this.showTyping();
        if (this.btnSend) this.btnSend.disabled = true;

        this.chatMemory.push({ role: 'user', content: text });
        if (this.chatMemory.length > this.MAX_MEMORY_LENGTH) this.chatMemory.shift();

        const isDeepAnalysis = this.deepAnalysisToggle && this.deepAnalysisToggle.checked;
        const payload = {
            type: isDeepAnalysis ? 'deep_legal_analysis' : 'legal_advisor',
            history: this.chatMemory,
            content: text
        };

        try {
            // استدعاء دالة fetchAPI الموحدة
            const apiRunner = (typeof fetchAPI === 'function') ? fetchAPI : (typeof API !== 'undefined' && typeof API.fetchAPI === 'function' ? API.fetchAPI : null);
            
            if (!apiRunner) {
                throw new Error("محرك الربط البرمجي fetchAPI غير متوفر في النطاق العام.");
            }

            const response = await apiRunner('/api/ai/process', 'POST', payload);

            this.removeTyping();

            if (response && response.error) {
                this.appendMessage(`⚠️ ${response.error}`, 'ai');
                this.chatMemory.pop();
            } else if (response && (response.reply || response.draft)) {
                const replyText = response.reply || response.draft;
                this.appendMessage(replyText, 'ai', !!response.rag_applied);

                this.chatMemory.push({ role: 'assistant', content: replyText });
                if (this.chatMemory.length > this.MAX_MEMORY_LENGTH) this.chatMemory.shift();
            } else {
                this.appendMessage("⚠️ عذراً، لم نتمكن من استلام إجابة صحيحة من المعالج الذكي.", 'ai');
                this.chatMemory.pop();
            }

        } catch (error) {
            this.removeTyping();
            this.appendMessage("❌ حدث خطأ في الاتصال بالمعالج السحابي. يرجى التأكد من استقرار الشبكة وتجديد الجلسة.", 'ai');
            this.chatMemory.pop();
            console.error("[AI Chat Engine Error]:", error);
        } finally {
            if (this.btnSend) this.btnSend.disabled = false;
            this.persistSession();
        }
    },

    /**
     * بدء الإملاء الصوتي الذكي
     */
    startDictation: function() {
        if (!navigator.onLine) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({ 
                    toast: true, 
                    position: 'top-end', 
                    icon: 'warning', 
                    title: 'يتطلب الإملاء الصوتي اتصالاً بالإنترنت.', 
                    showConfirmButton: false, 
                    timer: 3000 
                });
            }
            return;
        }

        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({ 
                    toast: true, 
                    position: 'top-end', 
                    icon: 'error', 
                    title: 'متصفحك الحالي لا يدعم ميزة الإملاء الصوتي المباشر.', 
                    showConfirmButton: false, 
                    timer: 3000 
                });
            }
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();

        recognition.lang = this.getLocale();
        recognition.interimResults = false;

        const originalPlaceholder = this.chatInput ? this.chatInput.placeholder : '';
        if (this.chatInput) this.chatInput.placeholder = "الميكروفون يعمل.. تحدث الآن 🎙️";
        
        if (typeof Swal !== 'undefined') {
            Swal.fire({ 
                toast: true, 
                position: 'top-end', 
                icon: 'info', 
                title: 'تحدث الآن وسيقوم المساعد بتحويل كلامك لنص...', 
                showConfirmButton: false, 
                timer: 2000 
            });
        }

        recognition.start();

        recognition.onresult = (event) => {
            if (!this.chatInput) return;
            this.chatInput.value += (this.chatInput.value ? ' ' : '') + event.results[0][0].transcript;
            this.autoResize();
        };

        recognition.onerror = (event) => {
            if (event.error !== 'aborted' && typeof Swal !== 'undefined') {
                Swal.fire({ 
                    toast: true, 
                    position: 'top-end', 
                    icon: 'error', 
                    title: 'تم إيقاف الميكروفون أو حدث خطأ أثناء الالتقاط.', 
                    showConfirmButton: false, 
                    timer: 2500 
                });
            }
            if (this.chatInput) this.chatInput.placeholder = originalPlaceholder;
            console.error("[Voice Recognition Error]:", event.error);
        };

        recognition.onend = () => {
            if (this.chatInput) this.chatInput.placeholder = originalPlaceholder;
        };
    }
};

window.AIChatEngine = AIChatEngine;
document.addEventListener('DOMContentLoaded', () => AIChatEngine.init());
