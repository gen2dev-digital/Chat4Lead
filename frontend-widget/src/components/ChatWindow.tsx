import React, { useState } from 'react';
import { Minus, X, Moon, Sun } from 'lucide-react';
import { MessageList } from './MessageList';
import { InputBox } from './InputBox';
import { TypingIndicator } from './TypingIndicator';
import { EndConversationModal } from './EndConversationModal';
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

    // Toggle Dark Mode (Optional: could be a prop)
    const [isDarkMode, setIsDarkMode] = useState(false);

    const toggleTheme = () => setIsDarkMode(!isDarkMode);

    const handleEndClick = () => {
        setShowEndModal(true);
    };

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
            // Applique l'attribut data-theme si dark mode activé
            data-theme={isDarkMode ? 'dark' : 'light'}
            className="fixed bottom-24 right-6 w-[380px] h-[680px] max-h-[85vh] flex flex-col overflow-hidden z-[9998] animate-scale-in"
            style={{
                backgroundColor: 'var(--c4l-bg-main)',
                borderRadius: 'var(--c4l-radius-lg)',
                boxShadow: 'var(--c4l-shadow-float)',
                border: '1px solid var(--c4l-border)',
                fontFamily: 'var(--c4l-font)',
                transition: 'background-color 0.3s ease, border-color 0.3s ease',
            }}
        >
            {/* Header Gradient */}
            <div
                className="px-6 py-4 flex items-center justify-between relative z-10 shrink-0 select-none shadow-sm"
                style={{
                    background: 'var(--c4l-primary-gradient)',
                }}
            >
                <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center overflow-hidden border border-white/30 shadow-sm">
                            {logoUrl ? (
                                <img src={logoUrl} alt={botName} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-white font-bold text-sm">
                                    {botName.charAt(0).toUpperCase()}
                                </span>
                            )}
                        </div>
                        {/* Status dot */}
                        <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-indigo-900 ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
                    </div>

                    {/* Info */}
                    <div>
                        <h3 className="text-white font-bold text-[16px] leading-tight tracking-tight">{botName}</h3>
                        <p className="text-white/80 text-[11px] font-medium mt-0.5 uppercase tracking-wider opacity-90">
                            {isConnected ? 'En ligne' : 'Hors ligne'}
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                    {/* Theme Toggle (Petit Plus) */}
                    <button
                        onClick={toggleTheme}
                        className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors mr-1"
                        title={isDarkMode ? "Passer en mode clair" : "Passer en mode sombre"}
                    >
                        {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
                    </button>

                    <button
                        onClick={onClose}
                        className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                        title="Réduire"
                    >
                        <Minus size={20} />
                    </button>
                    <button
                        onClick={handleEndClick}
                        className="p-1.5 text-white/70 hover:text-red-200 hover:bg-white/10 rounded-lg transition-colors"
                        title="Fermer"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Modal Overlay */}
            {showEndModal && (
                <EndConversationModal
                    onClose={() => setShowEndModal(false)}
                    onSkip={handleSkip}
                    onSubmit={handleModalSubmit}
                />
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-hidden relative flex flex-col" style={{ backgroundColor: 'var(--c4l-bg-main)' }}>
                <MessageList
                    messages={messages}
                    botName={botName}
                    logoUrl={logoUrl}
                    onOptionSelect={onSendMessage}
                />

                {/* Typing Indicator Overlay */}
                {isTyping && (
                    <div className="absolute bottom-2 left-5 z-20">
                        <TypingIndicator />
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="shrink-0 z-30">
                <InputBox
                    onSendMessage={onSendMessage}
                    disabled={!isConnected}
                />
            </div>
        </div>
    );
};
