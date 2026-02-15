import React from 'react';
import { X } from 'lucide-react';
import { MessageList } from './MessageList';
import { InputBox } from './InputBox';
import { TypingIndicator } from './TypingIndicator';
import type { Message } from '../types';

interface ChatWindowProps {
    botName: string;
    messages: Message[];
    isTyping: boolean;
    isConnected: boolean;
    onClose: () => void;
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
    onSendMessage,
    primaryColor = '#6366f1',
    logoUrl,
}) => {
    return (
        <div
            className="fixed bottom-24 right-6 w-[400px] h-[600px] max-h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden z-[9998] animate-scale-in"
        >
            {/* Header avec gradient */}
            <div
                className="px-6 py-4 flex items-center justify-between"
                style={{
                    background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%)`,
                }}
            >
                <div className="flex items-center gap-3">
                    {/* Avatar / Logo entreprise */}
                    <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center overflow-hidden">
                        {logoUrl ? (
                            <img
                                src={logoUrl}
                                alt={botName}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <span className="text-white font-semibold text-lg">
                                {botName.charAt(0).toUpperCase()}
                            </span>
                        )}
                    </div>

                    {/* Bot info */}
                    <div>
                        <h3 className="text-white font-semibold text-base">{botName}</h3>
                        <div className="flex items-center gap-2">
                            <div
                                className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'
                                    }`}
                            />
                            <span className="text-white/80 text-xs">
                                {isConnected ? 'En ligne' : 'Hors ligne'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Close button */}
                <button
                    onClick={onClose}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                    aria-label="Fermer le chat"
                >
                    <X className="w-5 h-5 text-white" />
                </button>
            </div>

            {/* Messages area */}
            <MessageList
                messages={messages}
                botName={botName}
                logoUrl={logoUrl}
                primaryColor={primaryColor}
                onOptionSelect={onSendMessage} // Connecter l'action de clic
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
