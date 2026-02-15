import React, { useState } from 'react';
import { Minus, X } from 'lucide-react';
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
    primaryColor?: string;
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
    primaryColor = '#6366f1',
    logoUrl,
}) => {
    const [showEndModal, setShowEndModal] = useState(false);

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
            className="fixed bottom-24 right-6 w-[380px] h-[650px] max-h-[85vh] flex flex-col overflow-hidden z-[9998] animate-scale-in"
            style={{
                backgroundColor: 'var(--c4l-bg-main)', // Fond très sombre
                borderRadius: 'var(--c4l-radius-lg)',
                boxShadow: '0 20px 50px -12px rgba(0, 0, 0, 0.5), 0 0 1px rgba(255,Rg255,255,0.1)',
                border: '1px solid var(--c4l-border)',
                fontFamily: 'var(--c4l-font)',
            }}
        >
            {/* Header Gradient */}
            <div
                className="px-6 py-5 flex items-center justify-between relative z-10 shrink-0"
                style={{
                    background: 'var(--c4l-primary-gradient)', // Gradient violet/bleu
                }}
            >
                <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center overflow-hidden border border-white/20 shadow-sm">
                            {logoUrl ? (
                                <img src={logoUrl} alt={botName} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-white font-bold text-sm">
                                    {botName.charAt(0).toUpperCase()}
                                </span>
                            )}
                        </div>
                        {/* Status dot */}
                        <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#1e1b4b] ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
                    </div>

                    {/* Info */}
                    <div>
                        <h3 className="text-white font-bold text-[15px] leading-tight">{botName}</h3>
                        <p className="text-white/80 text-xs font-medium mt-0.5">
                            {isConnected ? 'En ligne • Répond instantanément' : 'Hors ligne'}
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={onClose}
                        className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                        title="Réduire"
                    >
                        <Minus size={20} />
                    </button>
                    <button
                        onClick={handleEndClick}
                        className="p-2 text-white/70 hover:text-red-200 hover:bg-white/10 rounded-lg transition-colors"
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
                    primaryColor={primaryColor}
                />
            )}

            {/* Messages Area : Fond sombre */}
            <div className="flex-1 overflow-hidden relative" style={{ backgroundColor: 'var(--c4l-bg-main)' }}>
                <MessageList
                    messages={messages}
                    botName={botName}
                    logoUrl={logoUrl}
                    primaryColor={primaryColor}
                    onOptionSelect={onSendMessage}
                />

                {/* Typing Indicator Overlay */}
                {isTyping && (
                    <div className="absolute bottom-4 left-4 z-20">
                        <TypingIndicator botName={botName} />
                    </div>
                )}
            </div>

            {/* Input Area : Fond sombre + border-top */}
            <div className="shrink-0" style={{ backgroundColor: 'var(--c4l-bg-main)' }}>
                <InputBox
                    onSendMessage={onSendMessage}
                    disabled={!isConnected}
                    primaryColor={primaryColor}
                />
                {/* Footer Branding */}
                <div className="text-center pb-3 pt-1">
                    <a href="#" className="text-[10px] text-gray-500 hover:text-gray-400 transition-colors font-medium flex items-center justify-center gap-1">
                        Powered by <span className="font-bold text-white/90">Chat4Lead</span>
                    </a>
                </div>
            </div>
        </div>
    );
};
