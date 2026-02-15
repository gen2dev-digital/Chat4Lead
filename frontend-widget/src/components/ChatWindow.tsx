import React, { useState } from 'react';
import { X, Minus, Trash2 } from 'lucide-react';
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
    onEndChat?: (data?: { name: string; email: string; phone: string }) => void; // Callback de fin
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
        // Envoi des données (logique metier via prop)
        if (onEndChat) {
            onEndChat(data);
        }
        setShowEndModal(false);
        onClose(); // Ferme la fenetre
    };

    const handleForceClose = () => {
        setShowEndModal(false);
        if (onEndChat) onEndChat(); // Juste close sans data
        onClose();
    };

    return (
        <div
            className="fixed bottom-24 right-6 w-[400px] h-[600px] max-h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden z-[9998] animate-scale-in border border-gray-100/50"
        >
            {/* Header avec gradient */}
            <div
                className="px-5 py-3.5 flex items-center justify-between shadow-sm relative z-10"
                style={{
                    background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%)`,
                }}
            >
                <div className="flex items-center gap-3">
                    {/* Avatar / Logo entreprise */}
                    <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center overflow-hidden border border-white/20">
                        {logoUrl ? (
                            <img
                                src={logoUrl}
                                alt={botName}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <span className="text-white font-semibold text-sm">
                                {botName.charAt(0).toUpperCase()}
                            </span>
                        )}
                    </div>

                    {/* Bot info */}
                    <div>
                        <h3 className="text-white font-bold text-sm tracking-wide">{botName}</h3>
                        <div className="flex items-center gap-1.5 opacity-90">
                            <div
                                className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]' : 'bg-red-400'
                                    }`}
                            />
                            <span className="text-white/80 text-[10px] uppercase font-medium tracking-wider">
                                {isConnected ? 'En ligne' : 'Hors ligne'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Actions: Minimize & End Chat */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all"
                        aria-label="Réduire"
                        title="Réduire la fenêtre"
                    >
                        <Minus className="w-5 h-5" />
                    </button>

                    <button
                        onClick={handleEndClick}
                        className="p-1.5 rounded-lg text-white/70 hover:text-red-200 hover:bg-red-500/20 transition-all"
                        aria-label="Terminer la conversation"
                        title="Terminer la conversation"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Modal de fin (Overlay) */}
            {showEndModal && (
                <EndConversationModal
                    onClose={() => setShowEndModal(false)}
                    onSubmit={handleModalSubmit}
                    primaryColor={primaryColor}
                />
            )}

            {/* Messages area */}
            <MessageList
                messages={messages}
                botName={botName}
                logoUrl={logoUrl}
                primaryColor={primaryColor}
                onOptionSelect={onSendMessage}
            />

            {/* Typing indicator */}
            {isTyping && <TypingIndicator botName={botName} />}

            {/* Input box */}
            <InputBox
                onSendMessage={onSendMessage}
                disabled={!isConnected}
                primaryColor={primaryColor}
            />
        </div>
    );
};
