/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/ai-chat.js
 * الوصف: المحرك البرمجي للمستشار القانوني الذكي مع دعم النسخ، الذاكرة، والـ RAG
 * التحديثات المعمارية (V5.2 Enterprise Edition):
 * 1. إصلاح تعبيرات التنسيق (Regex Markdown Parser) ودعم الوضع الليلي بالكامل.
 * 2. الربط المباشر مع محرك fetchAPI الموحد وعرض شارة الاستناد التشريعي (RAG Badge).
 * 3. استقبال الاستعلامات المحولة من البحث الشامل (?q=...) وتشغيلها تلقائياً.
 * 4. دعم الإملاء الصوتي باللهجة الأردنية (ar-JO) وذاكرة السياق المتصل (Context Memory).
 * ============================================================================
 */

const AIChatEngine = {
    chatMemory: [],
    MAX_MEMORY_LENGTH: 10,

    chatBox: null,
    chatInput: null,
    btnSend: null,
    deepAnalysisToggle: null,

    init: function() {
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

        // التقاط أي استعلام قادم من البحث الشامل في لوحة القيادة (?q=...)
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

    formatText: function(text) {
        if (!text) return '';
        let f = String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        // تنسيق العناوين والنصوص العريضة والمائلة والقوائم النقطية
        f = f.replace(/\*\*(.*?)\*\*/g, '<b class="text-navy">$1</b>');
        f = f.replace(/\*(.*?)\*/g, '<i>$1</i>');
        f = f.replace(/\n-\s+(.*?)(?=\n|$)/g, '<br>• $1');
        f = f.replace(/\n\*\s+(.*?)(?=\n|$)/g, '<br>• $1');
        f = f.replace(/\n/g, '<br>');
        return f;
    },

    autoResize: function() {
        if (!this.chatInput) return;
        this.chatInput.style.height = 'auto';
        this.chatInput.style.height = (this.chatInput.scrollHeight < 120 ? this.chatInput.scrollHeight : 120) + 'px';
    },

    handleEnter: function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
        }
    },

    clearChat: function() {
        this.chatMemory = [];
        if (!this.chatBox) return;
        this.chatBox.innerHTML = `
            <div class="chat-bubble chat-ai">
                <div class="msg-content">
                    <h6 class="fw-bold mb-2 text-navy"><i class="fas fa-broom me-2" style="color: var(--gold-luxury);"></i>جلسة استشارة جديدة</h6>
                    تم تفريغ الذاكرة بالكامل. أنا جاهز لتلقي أسئلتك الجديدة وتقديم المشورة القانونية وفق التشريعات الأردنية.
                </div>
                <div class="msg-footer">
                    <span class="msg-time">${new Date().toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
            </div>
        `;
    },

    scrollToBottom: function() {
        if (!this.chatBox) return;
        this.chatBox.scrollTop = this.chatBox.scrollHeight;
    },

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
                    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'تم نسخ النص القانوني للحافظة', showConfirmButton: false, timer: 2000 });
                }
            });
        }
    },

    appendMessage: function(text, sender, ragApplied = false) {
        if (!this.chatBox) return;
        const div = document.createElement('div');
        div.className = `chat-bubble ${sender === 'user' ? 'chat-user' : 'chat-ai'}`;

        const time = new Date().toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' });

        let copyBtnHtml = '';
        let ragBadgeHtml = '';
        if (sender === 'ai') {
            const escapedText = encodeURIComponent(text);
            copyBtnHtml = `<button type="button" class="copy-btn" onclick="AIChatEngine.copyText(this, '${escapedText}')" title="نسخ للاستخدام في المذكرة"><i class="far fa-copy"></i></button>`;
            if (ragApplied) {
                ragBadgeHtml = `<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 me-2" style="font-size: 0.68rem;"><i class="fas fa-book-scale me-1"></i> مدعم بالتشريعات (RAG)</span>`;
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
                <small class="text-muted fw-bold">جاري البحث في التشريعات وصياغة الرأي القانوني...</small>
            </div>
        `;
        this.chatBox.appendChild(div);
        this.scrollToBottom();
    },

    removeTyping: function() {
        const typing = document.getElementById('typing');
        if (typing) typing.remove();
    },

    sendMessage: async function() {
        if (!this.chatInput) return;
        const text = this.chatInput.value.trim();
        if (!text) return;

        if (!navigator.onLine) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'أنت في وضع عدم الاتصال (Offline).', showConfirmButton: false, timer: 3000 });
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
            const response = await fetchAPI('/api/ai/process', 'POST', payload);

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
                this.appendMessage("⚠️ عذراً، لم أتمكن من استلام إجابة صحيحة من الخادم.", 'ai');
                this.chatMemory.pop();
            }

        } catch (error) {
            this.removeTyping();
            this.appendMessage("❌ حدث خطأ في الاتصال بالخادم السحابي. يرجى التأكد من استقرار الشبكة.", 'ai');
            this.chatMemory.pop();
            console.error("[AI Chat Engine Error]:", error);
        } finally {
            if (this.btnSend) this.btnSend.disabled = false;
        }
    },

    startDictation: function() {
        if (!navigator.onLine) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'يحتاج الإملاء الصوتي لاتصال بالإنترنت.', showConfirmButton: false, timer: 3000 });
            }
            return;
        }

        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'متصفحك لا يدعم الإملاء الصوتي المباشر.', showConfirmButton: false, timer: 3000 });
            }
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();

        recognition.lang = 'ar-JO';
        recognition.interimResults = false;

        const originalPlaceholder = this.chatInput ? this.chatInput.placeholder : '';
        if (this.chatInput) this.chatInput.placeholder = "الميكروفون يعمل.. تحدث الآن 🎙️";
        if (typeof Swal !== 'undefined') {
            Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'تحدث الآن لسؤال المساعد الذكي...', showConfirmButton: false, timer: 2000 });
        }

        recognition.start();

        recognition.onresult = (event) => {
            if (!this.chatInput) return;
            this.chatInput.value += (this.chatInput.value ? ' ' : '') + event.results[0][0].transcript;
            this.autoResize();
        };

        recognition.onerror = (event) => {
            if (event.error !== 'aborted' && typeof Swal !== 'undefined') {
                Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'تم إيقاف الميكروفون أو حدث خطأ.', showConfirmButton: false, timer: 2500 });
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