import React, { useState } from 'react';
import { X, Moon, Sun, ChevronDown } from 'lucide-react';
import { MessageList } from './MessageList.tsx';
import { InputBox } from './InputBox.tsx';
import { TypingIndicator } from './TypingIndicator.tsx';
import { EndConversationModal } from './EndConversationModal.tsx';
import type { Message } from '../types';

interface ChatWindowProps {
    botName: string;
    messages: Message[];
    isTyping: boolean;
    isConnected: boolean;
    onClose: () => void;
    onEndChat?: (data?: { name: string; email: string; phone: string }) => void;
    onSendMessage: (message: string) => void;
    logoUrl?: string;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
    botName,
    messages,
    isTyping,
    isConnected,
    onClose,
    onEndChat,
    onSendMessage,
    logoUrl,
}) => {
    const [showEndModal, setShowEndModal] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(true);

    const toggleTheme = () => setIsDarkMode(!isDarkMode);

    const handleModalSubmit = (data: { name: string; email: string; phone: string }) => {
        if (onEndChat) onEndChat(data);
        setShowEndModal(false);
        onClose();
    };

    const handleSkip = () => {
        if (onEndChat) onEndChat();
        setShowEndModal(false);
        onClose();
    };

    return (
        <div
            data-theme={isDarkMode ? 'dark' : 'light'}
            className="fixed bottom-24 right-4 sm:right-6 w-[420px] max-w-[calc(100vw-32px)] h-[700px] max-h-[85vh] flex flex-col z-[9999] animate-scale-in"
            style={{
                borderRadius: '24px',
                boxShadow: isDarkMode
                    ? '0 25px 80px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(99, 102, 241, 0.1), 0 0 60px -20px rgba(99, 102, 241, 0.15)'
                    : '0 25px 60px -12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(99, 102, 241, 0.08)',
                background: isDarkMode
                    ? 'linear-gradient(180deg, #0d1117 0%, #0a0d14 100%)'
                    : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
                overflow: 'hidden',
            }}
        >
            {/* ═══ HEADER ═══ */}
            <div
                className="px-6 py-4 flex items-center justify-between shrink-0 select-none"
                style={{
                    background: isDarkMode
                        ? 'linear-gradient(180deg, rgba(99, 102, 241, 0.08) 0%, transparent 100%)'
                        : 'linear-gradient(180deg, rgba(99, 102, 241, 0.04) 0%, transparent 100%)',
                    borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                }}
            >
                <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="relative">
                        <div
                            className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden"
                            style={{
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)',
                            }}
                        >
                            {logoUrl ? (
                                <img src={logoUrl} alt={botName} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-white font-bold text-sm">
                                    {botName.charAt(0).toUpperCase()}
                                </span>
                            )}
                        </div>
                        <div
                            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                            style={{
                                borderColor: isDarkMode ? '#0d1117' : '#ffffff',
                                backgroundColor: isConnected ? '#22c55e' : '#ef4444',
                                boxShadow: isConnected ? '0 0 8px rgba(34,197,94,0.6)' : 'none',
                            }}
                        />
                    </div>

                    {/* Info */}
                    <div className="flex flex-col">
                        <h3
                            className="font-semibold text-[15px] leading-tight tracking-tight"
                            style={{ color: isDarkMode ? '#ffffff' : '#1e293b' }}
                        >
                            {botName}
                        </h3>
                        <span
                            className="text-[11px] font-medium mt-0.5"
                            style={{ color: isConnected ? '#22c55e' : '#94a3b8' }}
                        >
                            {isConnected ? 'En ligne' : 'Hors ligne'}
                        </span>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={toggleTheme}
                        className="c4l-header-btn p-2 rounded-xl transition-all duration-200 active:scale-90"
                        style={{
                            color: isDarkMode ? '#94a3b8' : '#64748b',
                        }}
                        title={isDarkMode ? 'Mode clair' : 'Mode sombre'}
                    >
                        {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
                    </button>
                    <button
                        onClick={onClose}
                        className="c4l-header-btn p-2 rounded-xl transition-all duration-200 active:scale-90"
                        style={{
                            color: isDarkMode ? '#94a3b8' : '#64748b',
                        }}
                        title="Réduire"
                    >
                        <ChevronDown size={18} />
                    </button>
                    <button
                        onClick={() => setShowEndModal(true)}
                        className="c4l-header-btn c4l-header-btn--danger p-2 rounded-xl transition-all duration-200 active:scale-90"
                        style={{
                            color: isDarkMode ? '#94a3b8' : '#64748b',
                        }}
                        title="Terminer la discussion"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* ═══ END MODAL ═══ */}
            {showEndModal && (
                <EndConversationModal
                    onClose={() => setShowEndModal(false)}
                    onSkip={handleSkip}
                    onSubmit={handleModalSubmit}
                />
            )}

            {/* ═══ MESSAGES AREA ═══ */}
            <div
                className="flex-1 overflow-hidden relative flex flex-col"
                style={{ backgroundColor: 'transparent' }}
            >
                <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth px-5 pt-6 flex flex-col items-center c4l-scrollbar">

                    {/* ═══ WELCOME SCREEN ═══ */}
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center w-full animate-fade-in">

                            {/* Orb / Logo */}
                            <div className="relative mt-4 mb-6">
                                <div
                                    className="w-20 h-20 rounded-full flex items-center justify-center overflow-hidden"
                                    style={{
                                        background: 'linear-gradient(135deg, #4f8bff 0%, #6366f1 40%, #a855f7 100%)',
                                        boxShadow: '0 8px 40px rgba(99, 102, 241, 0.35), inset 0 -4px 12px rgba(0,0,0,0.15), inset 0 4px 12px rgba(255,255,255,0.2)',
                                    }}
                                >
                                    {logoUrl ? (
                                        <img src={logoUrl} alt={botName} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-white font-bold text-2xl">
                                            {botName.charAt(0).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                {/* Subtle glow ring */}
                                <div
                                    className="absolute inset-0 rounded-full animate-pulse"
                                    style={{
                                        background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)',
                                        transform: 'scale(1.5)',
                                        filter: 'blur(8px)',
                                    }}
                                />
                            </div>

                            {/* Welcome Text - Professional */}
                            <h2
                                className="text-[22px] font-semibold tracking-tight text-center mb-1"
                                style={{ color: isDarkMode ? '#ffffff' : '#1e293b' }}
                            >
                                Bonjour, je suis <span style={{ color: '#818cf8' }}>{botName}</span>
                            </h2>
                            <p
                                className="text-[14px] text-center leading-relaxed mb-8 max-w-[300px]"
                                style={{
                                    color: isDarkMode ? '#94a3b8' : '#64748b',
                                    fontWeight: 400,
                                }}
                            >
                                Votre assistant spécialisé en déménagement.
                                <br />
                                Comment puis-je vous aider ?
                            </p>
                        </div>
                    )}

                    {/* Date separator when messages exist */}
                    {messages.length > 0 && (
                        <div className="flex items-center justify-center mb-5 select-none w-full gap-3">
                            <div className="flex-1 h-px" style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }} />
                            <span
                                className="text-[10px] font-medium uppercase tracking-[0.15em]"
                                style={{ color: isDarkMode ? '#475569' : '#94a3b8' }}
                            >
                                Aujourd'hui
                            </span>
                            <div className="flex-1 h-px" style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }} />
                        </div>
                    )}

                    <MessageList
                        messages={messages}
                        botName={botName}
                        logoUrl={logoUrl}
                        onOptionSelect={onSendMessage}
                    />
                </div>
            </div>

            {/* Typing Indicator */}
            {isTyping && (
                <div className="absolute bottom-[100px] left-6 z-20">
                    <TypingIndicator />
                </div>
            )}

            {/* ═══ INPUT ═══ */}
            <div className="shrink-0 z-30">
                <InputBox
                    onSendMessage={onSendMessage}
                    disabled={!isConnected}
                />
            </div>
        </div>
    );
};
