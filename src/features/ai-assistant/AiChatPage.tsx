/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: src/features/ai-assistant/AiChatPage.tsx
 * الوصف: المستشار القانوني الذكي (RAG + إملاء صوتي ar-JO + ذاكرة سياق 10 رسائل)
 * مطابق 100% لملف ai-chat.html + js/ai-chat.js
 * ============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { MoakkilAPI } from '../../services/moakkilApi.service';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { BottomNav } from '../../components/layout/BottomNav';

interface ChatBubble {
    id: string;
    sender: 'user' | 'ai';
    text: string;
    time: string;
    ragApplied?: boolean;
}

export const AiChatPage: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { isOnline } = useAuth();
    const { isDark, toggleDarkMode } = useTheme();

    const [messages, setMessages] = useState<ChatBubble[]>([
        {
            id: 'welcome',
            sender: 'ai',
            text: 'أهلاً بك يا أستاذ!\nأنا مساعدك القانوني الذكي.\nاسألني أي سؤال قانوني، أو قم بتفعيل نمط **"تحليل الثغرات والدفوع"** لأقوم بتحليل الوقائع واستخراج الثغرات بدقة متناهية.',
            time: 'الآن',
        },
    ]);
    const [memory, setMemory] = useState<Array<{ role: string; content: string }>>([]);
    const [inputText, setInputText] = useState('');
    const [deepAnalysis, setDeepAnalysis] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [isRecording, setIsRecording] = useState(false);

    const chatBoxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const q = searchParams.get('q');
        if (q) {
            setInputText(`اشرح لي بالتفصيل القانوني والعملي: ${q.trim()}`);
            setSearchParams({}, { replace: true });
        }
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        if (chatBoxRef.current) {
            chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
        }
    }, [messages, isTyping]);

    const formatMarkdownHtml = (raw: string): string => {
        if (!raw) return '';
        let f = String(raw)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        f = f.replace(/\*\*(.*?)\*\*/g, '<b class="text-navy">$1</b>');
        f = f.replace(/\*(.*?)\*/g, '<i>$1</i>');
        f = f.replace(/\n-\s+(.*?)(?=\n|$)/g, '<br>• $1');
        f = f.replace(/\n\*\s+(.*?)(?=\n|$)/g, '<br>• $1');
        f = f.replace(/\n/g, '<br>');
        return f;
    };

    const handleSendMessage = async () => {
        const text = inputText.trim();
        if (!text || isTyping) return;

        if (!isOnline) {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'warning',
                title: 'أنت في وضع عدم الاتصال (Offline).',
                showConfirmButton: false,
                timer: 3000,
            });
            return;
        }

        const nowStr = new Date().toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' });
        const userMsg: ChatBubble = {
            id: 'msg_' + Date.now(),
            sender: 'user',
            text,
            time: nowStr,
        };

        setMessages((prev) => [...prev, userMsg]);
        setInputText('');
        setIsTyping(true);

        const nextMemory = [...memory, { role: 'user', content: text }].slice(-10);
        setMemory(nextMemory);

        try {
            const response = await MoakkilAPI.askAI(text, nextMemory, deepAnalysis);
            const replyTime = new Date().toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' });

            if (response && response.error) {
                setMessages((prev) => [
                    ...prev,
                    { id: 'err_' + Date.now(), sender: 'ai', text: `⚠️ ${response.error}`, time: replyTime },
                ]);
                setMemory((prev) => prev.slice(0, -1));
            } else if (response && (response.reply || response.draft)) {
                const replyText = response.reply || response.draft;
                setMessages((prev) => [
                    ...prev,
                    {
                        id: 'ai_' + Date.now(),
                        sender: 'ai',
                        text: replyText,
                        time: replyTime,
                        ragApplied: !!response.rag_applied,
                    },
                ]);
                setMemory((prev) => [...prev, { role: 'assistant', content: replyText }].slice(-10));
            } else {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: 'err_' + Date.now(),
                        sender: 'ai',
                        text: '⚠️ عذراً، لم أتمكن من استلام إجابة صحيحة من الخادم.',
                        time: replyTime,
                    },
                ]);
                setMemory((prev) => prev.slice(0, -1));
            }
        } catch {
            setMessages((prev) => [
                ...prev,
                {
                    id: 'err_' + Date.now(),
                    sender: 'ai',
                    text: '❌ حدث خطأ في الاتصال بالخادم السحابي. يرجى التأكد من استقرار الشبكة.',
                    time: new Date().toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' }),
                },
            ]);
            setMemory((prev) => prev.slice(0, -1));
        } finally {
            setIsTyping(false);
        }
    };

    const handleClearChat = () => {
        setMemory([]);
        setMessages([
            {
                id: 'clear_' + Date.now(),
                sender: 'ai',
                text: '**جلسة استشارة جديدة**\nتم تفريغ الذاكرة بالكامل. أنا جاهز لتلقي أسئلتك الجديدة وتقديم المشورة القانونية وفق التشريعات الأردنية.',
                time: new Date().toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' }),
            },
        ]);
    };

    const handleCopy = (text: string) => {
        navigator.clipboard?.writeText(text).then(() => {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'تم نسخ النص القانوني للحافظة',
                showConfirmButton: false,
                timer: 2000,
            });
        });
    };

    const handleStartDictation = () => {
        if (!isOnline) {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'warning',
                title: 'يحتاج الإملاء الصوتي لاتصال بالإنترنت.',
                showConfirmButton: false,
                timer: 3000,
            });
            return;
        }

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'error',
                title: 'متصفحك لا يدعم الإملاء الصوتي المباشر.',
                showConfirmButton: false,
                timer: 3000,
            });
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'ar-JO';
        recognition.interimResults = false;

        setIsRecording(true);
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'info',
            title: 'تحدث الآن لسؤال المساعد الذكي... 🎙️',
            showConfirmButton: false,
            timer: 2500,
        });

        recognition.start();
        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
        };
        recognition.onerror = () => setIsRecording(false);
        recognition.onend = () => setIsRecording(false);
    };

    return (
        <div className="d-flex flex-column" style={{ height: '100dvh', overflow: 'hidden' }}>
            {/* الترويسة العلوية */}
            <div className="top-nav px-3 d-flex align-items-center justify-content-between" style={{ height: 70, flexShrink: 0 }}>
                <div className="d-flex align-items-center gap-3">
                    <button
                        className="btn btn-sm text-white p-0 border-0 text-decoration-none"
                        onClick={() => {
                            localStorage.setItem('last_active_view', 'tools');
                            navigate('/app.html#tools');
                        }}
                        title="عودة"
                    >
                        <i className="fas fa-arrow-right fs-4"></i>
                    </button>
                    <div className="d-flex align-items-center gap-2">
                        <div
                            style={{
                                width: 40,
                                height: 40,
                                background: 'rgba(255,255,255,0.1)',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: '1px solid #D4AF37',
                            }}
                        >
                            <i className="fas fa-balance-scale fs-5" style={{ color: '#D4AF37' }}></i>
                        </div>
                        <div>
                            <h6 className="mb-0 fw-bold text-white">المستشار القانوني</h6>
                            <small style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}>
                                <i
                                    className={`fas fa-circle ${isOnline ? 'text-success' : 'text-danger'} me-1`}
                                    style={{ fontSize: 8 }}
                                ></i>
                                {isOnline ? 'متصل بالتشريعات الأردنية' : 'غير متصل بالشبكة'}
                            </small>
                        </div>
                    </div>
                </div>
                <div className="d-flex align-items-center gap-2">
                    <button
                        className="btn btn-sm border-0 text-white"
                        onClick={toggleDarkMode}
                        title="تبديل الوضع الليلي"
                        style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '6px 12px' }}
                    >
                        <i className={`fas ${isDark ? 'fa-sun text-warning' : 'fa-moon'}`}></i>
                    </button>
                    <button
                        className="btn btn-sm border-0 text-white"
                        onClick={handleClearChat}
                        title="مسح المحادثة"
                        style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '6px 12px' }}
                    >
                        <i className="fas fa-broom"></i>
                    </button>
                </div>
            </div>

            {!isOnline && (
                <div
                    className="bg-warning text-dark text-center py-2 fw-bold shadow-sm"
                    style={{ fontSize: '0.85rem', flexShrink: 0 }}
                >
                    <i className="fas fa-wifi-slash me-2"></i> لا يوجد اتصال بالإنترنت - المستشار الذكي يتطلب اتصالاً
                    بالشبكة لتحليل التشريعات.
                </div>
            )}

            {/* مساحة المحادثة */}
            <div
                ref={chatBoxRef}
                className="flex-grow-1 overflow-auto p-3 d-flex flex-column gap-3"
                style={{
                    background: isDark ? '#0f172a' : '#F0F2F5',
                }}
            >
                {messages.map((m) => (
                    <div
                        key={m.id}
                        className="p-3 shadow-sm"
                        style={{
                            maxWidth: '85%',
                            borderRadius: 18,
                            alignSelf: m.sender === 'user' ? 'flex-start' : 'flex-end',
                            background:
                                m.sender === 'user'
                                    ? 'linear-gradient(135deg, #0B132B, #1C2541)'
                                    : isDark
                                    ? '#1e293b'
                                    : '#ffffff',
                            color: m.sender === 'user' ? '#ffffff' : isDark ? '#f8fafc' : '#1A1A1A',
                            borderRight: m.sender === 'ai' ? '4px solid #D4AF37' : undefined,
                            lineHeight: 1.7,
                        }}
                    >
                        <div dangerouslySetInnerHTML={{ __html: formatMarkdownHtml(m.text) }} />
                        <div className="d-flex justify-content-between align-items-center mt-2 pt-1 opacity-75" style={{ fontSize: '0.75rem' }}>
                            <div>
                                <span>{m.time}</span>
                                {m.ragApplied && (
                                    <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 ms-2">
                                        <i className="fas fa-book-scale me-1"></i> مدعم بالتشريعات (RAG)
                                    </span>
                                )}
                            </div>
                            {m.sender === 'ai' && (
                                <button
                                    type="button"
                                    className="btn btn-sm p-0 border-0 text-reset"
                                    onClick={() => handleCopy(m.text)}
                                    title="نسخ للاستخدام في المذكرة"
                                >
                                    <i className="far fa-copy"></i>
                                </button>
                            )}
                        </div>
                    </div>
                ))}

                {isTyping && (
                    <div
                        className="p-3 shadow-sm"
                        style={{
                            maxWidth: '75%',
                            borderRadius: 18,
                            alignSelf: 'flex-end',
                            background: isDark ? '#1e293b' : '#ffffff',
                            borderRight: '4px solid #D4AF37',
                        }}
                    >
                        <div className="d-flex gap-2 align-items-center">
                            <span className="spinner-grow spinner-grow-sm text-warning" role="status"></span>
                            <small className="text-muted fw-bold">
                                جاري البحث في التشريعات وصياغة الرأي القانوني...
                            </small>
                        </div>
                    </div>
                )}
            </div>

            {/* منطقة الإدخال */}
            <div
                className="p-2 px-3 border-top"
                style={{
                    background: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                    flexShrink: 0,
                    marginBottom: 70,
                }}
            >
                <div className="form-check form-switch m-0 mb-2 px-2 d-flex align-items-center gap-2">
                    <input
                        className="form-check-input m-0"
                        type="checkbox"
                        id="deepAnalysisToggle"
                        checked={deepAnalysis}
                        onChange={(e) => setDeepAnalysis(e.target.checked)}
                        style={{ width: '2.2rem', height: '1.1rem', cursor: 'pointer' }}
                    />
                    <label
                        className="form-check-label fw-bold text-navy mb-0"
                        htmlFor="deepAnalysisToggle"
                        style={{ fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                        <i className="fas fa-shield-alt text-danger me-1"></i> تفعيل استخراج الثغرات والدفوع (RAG)
                    </label>
                </div>

                <div className="d-flex align-items-end gap-2">
                    <button
                        type="button"
                        className="btn rounded-circle border d-flex align-items-center justify-content-center"
                        style={{ width: 48, height: 48, flexShrink: 0 }}
                        onClick={handleStartDictation}
                        title="إملاء صوتي"
                    >
                        <i className={`fas fa-microphone ${isRecording ? 'text-danger fa-beat' : ''}`}></i>
                    </button>
                    <textarea
                        className="form-control rounded-4 fw-bold"
                        rows={1}
                        placeholder={isRecording ? 'الميكروفون يعمل.. تحدث الآن 🎙️' : 'اكتب سؤالك أو وقائع القضية...'}
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage();
                            }
                        }}
                        style={{ maxHeight: 110, resize: 'none' }}
                    />
                    <button
                        type="button"
                        className="btn rounded-circle d-flex align-items-center justify-content-center shadow-sm"
                        style={{
                            width: 48,
                            height: 48,
                            flexShrink: 0,
                            background: 'linear-gradient(135deg, #D4AF37, #b5952f)',
                            color: '#0B132B',
                        }}
                        onClick={handleSendMessage}
                        disabled={isTyping}
                    >
                        <i className="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>

            <BottomNav activeTab="tools" />
        </div>
    );
};
