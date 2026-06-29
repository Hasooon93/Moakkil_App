/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/ai-chat.js
 * الوصف: المحرك البرمجي للمستشار القانوني مع دعم النسخ، الذاكرة، والتنسيق الذكي
 * التحديث: تم ربطه بنجاح مع محرك fetchAPI الموحد.
 * ============================================================================
 */

const AIChatEngine = {
    chatMemory: [], 
    MAX_MEMORY_LENGTH: 10, 
    
    chatBox: document.getElementById('chat-box'),
    chatInput: document.getElementById('chat-input'),
    btnSend: document.getElementById('btn-send'),
    deepAnalysisToggle: document.getElementById('deepAnalysisToggle'),

    init: function() {
        if (typeof AUTH !== 'undefined' && AUTH.checkSession) AUTH.checkSession();
        if (this.chatInput) {
            this.chatInput.addEventListener('keypress', (e) => this.handleEnter(e));
            this.chatInput.addEventListener('input', () => this.autoResize());
            this.chatInput.focus();
        }
    },

    formatText: function(text) {
        if (!text) return '';
        let f = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        f = f.replace(/\*\*(.*?)\*\*/g, '<b style="color: var(--primary-dark);">$1</b>'); 
        f = f.replace(/\*(.*?)\*/g, '<i>$1</i>');
        f = f.replace(/\n- (.*?)(?=\n|$)/g, '<br>• $1'); 
        f = f.replace(/\n\* (.*?)(?=\n|$)/g, '<br>• $1'); 
        f = f.replace(/\n/g, '<br>');
        return f;
    },

    autoResize: function() {
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
        this.chatBox.innerHTML = `
            <div class="chat-bubble chat-ai">
                <div class="msg-content">
                    <h6 class="fw-bold mb-2 text-navy"><i class="fas fa-broom me-2"></i>جلسة استشارة جديدة</h6>
                    تم تفريغ الذاكرة بالكامل. أنا جاهز لتلقي أسئلتك الجديدة وتقديم المشورة.
                </div>
                <div class="msg-footer">
                    <span class="msg-time">${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
            </div>
        `;
    },

    scrollToBottom: function() {
        this.chatBox.scrollTop = this.chatBox.scrollHeight;
    },

    copyText: function(btn, encodedText) {
        const text = decodeURIComponent(encodedText);
        navigator.clipboard.writeText(text).then(() => {
            const icon = btn.querySelector('i');
            icon.className = 'fas fa-check text-success';
            setTimeout(() => { icon.className = 'far fa-copy'; }, 2000);
        });
    },

    appendMessage: function(text, sender) {
        const div = document.createElement('div');
        div.className = `chat-bubble ${sender === 'user' ? 'chat-user' : 'chat-ai'}`;
        
        const time = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        
        let copyBtnHtml = '';
        if (sender === 'ai') {
            const escapedText = encodeURIComponent(text);
            copyBtnHtml = `<button class="copy-btn" onclick="AIChatEngine.copyText(this, '${escapedText}')" title="نسخ للإستخدام بالمذكرة"><i class="far fa-copy"></i></button>`;
        }

        div.innerHTML = `
            <div class="msg-content">${this.formatText(text)}</div>
            <div class="msg-footer">
                <span class="msg-time">${time}</span>
                ${copyBtnHtml}
            </div>
        `;
        
        this.chatBox.appendChild(div);
        this.scrollToBottom();
    },

    showTyping: function() {
        const div = document.createElement('div');
        div.className = 'chat-bubble chat-ai w-75';
        div.id = 'typing';
        div.innerHTML = `<div class="msg-content d-flex gap-2 align-items-center">
                            <span class="spinner-grow spinner-grow-sm text-warning" role="status"></span>
                            <small class="text-muted fw-bold">جاري القراءة والتحليل...</small>
                         </div>`;
        this.chatBox.appendChild(div);
        this.scrollToBottom();
    },

    removeTyping: function() {
        const typing = document.getElementById('typing');
        if (typing) typing.remove();
    },

    sendMessage: async function() {
        const text = this.chatInput.value.trim();
        if (!text) return;

        if (!navigator.onLine) {
            Swal.fire({toast:true, position:'top-end', icon:'warning', title:'أنت في وضع عدم الاتصال (Offline).', showConfirmButton:false, timer:3000});
            return;
        }

        this.appendMessage(text, 'user');
        this.chatInput.value = '';
        this.autoResize();
        this.chatInput.focus();

        this.showTyping();
        this.btnSend.disabled = true;

        this.chatMemory.push({ role: 'user', content: text });
        if (this.chatMemory.length > this.MAX_MEMORY_LENGTH) this.chatMemory.shift();

        const isDeepAnalysis = this.deepAnalysisToggle && this.deepAnalysisToggle.checked;
        const payload = {
            type: isDeepAnalysis ? 'deep_legal_analysis' : 'legal_advisor',
            history: this.chatMemory,
            content: text
        };

        try {
            // 🔥 التعديل الجذري هنا: استخدام fetchAPI المباشر المتوافق مع api.js
            const response = await fetchAPI('/api/ai/process', 'POST', payload);
            
            this.removeTyping();

            if (response && response.error) {
                this.appendMessage(`⚠️ ${response.error}`, 'ai');
                this.chatMemory.pop(); 
            } else if (response && (response.reply || response.draft)) {
                const replyText = response.reply || response.draft;
                this.appendMessage(replyText, 'ai');
                
                this.chatMemory.push({ role: 'assistant', content: replyText });
                if (this.chatMemory.length > this.MAX_MEMORY_LENGTH) this.chatMemory.shift();
            } else {
                this.appendMessage("⚠️ عذراً، لم أتمكن من استلام إجابة صحيحة من الخادم.", 'ai');
            }

        } catch (error) {
            this.removeTyping();
            this.appendMessage("❌ حدث خطأ في الاتصال بالخادم السحابي. يرجى التأكد من استقرار الشبكة.", 'ai');
            console.error("[AI Chat Engine Error]:", error);
        } finally {
            this.btnSend.disabled = false;
        }
    },

    startDictation: function() {
        if (!navigator.onLine) {
            Swal.fire({toast:true, position:'top-end', icon:'warning', title:'يحتاج الإملاء الصوتي لاتصال بالإنترنت.', showConfirmButton:false, timer:3000});
            return;
        }

        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            Swal.fire({toast:true, position:'top-end', icon:'error', title:'متصفحك لا يدعم الإملاء الصوتي المباشر.', showConfirmButton:false, timer:3000});
            return;
        }
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        
        recognition.lang = 'ar-JO'; 
        recognition.interimResults = false;

        const originalPlaceholder = this.chatInput.placeholder;
        this.chatInput.placeholder = "الميكروفون يعمل.. تحدث الآن 🎙️";
        Swal.fire({toast:true, position:'top-end', icon:'info', title:'تحدث الآن لسؤال المساعد الذكي...', showConfirmButton:false, timer:2000});

        recognition.start();

        recognition.onresult = (event) => {
            this.chatInput.value += (this.chatInput.value ? ' ' : '') + event.results[0][0].transcript;
            this.autoResize();
        };

        recognition.onerror = (event) => {
            Swal.fire({toast:true, position:'top-end', icon:'error', title:'تم إيقاف الميكروفون أو حدث خطأ.', showConfirmButton:false, timer:2500});
            this.chatInput.placeholder = originalPlaceholder;
            console.error("[Voice Recognition Error]:", event.error);
        };

        recognition.onend = () => {
            this.chatInput.placeholder = originalPlaceholder;
        };
    }
};

document.addEventListener('DOMContentLoaded', () => AIChatEngine.init());