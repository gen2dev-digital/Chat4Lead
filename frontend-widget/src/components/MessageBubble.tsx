import React from 'react';
import type { Message } from '../types';

interface MessageBubbleProps {
    message: Message;
    botName: string;
    logoUrl?: string; // Nouveau prop
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
    message,
    botName,
    logoUrl,
}) => {
    const isUser = message.role === 'user';

    return (
        <div
            className={`flex ${isUser ? 'justify-end' : 'justify-start items-end gap-2'} animate-fade-in`}
        >
            {/* Avatar Bot pour chaque message (optionnel, ou juste le premier de la série) */}
            {!isUser && (
                <div className="flex-shrink-0 w-6 h-6 rounded-full overflow-hidden bg-gray-200 mb-1">
                    {logoUrl ? (
                        <img src={logoUrl} alt={botName} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-400 text-white text-[10px] font-bold">
                            {botName.charAt(0).toUpperCase()}
                        </div>
                    )}
                </div>
            )}

            <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${isUser
                        ? 'bg-indigo-600 text-white rounded-br-sm'
                        : 'bg-white text-gray-900 rounded-bl-sm shadow-sm'
                    }`}
            >
                {/* Bot name pour messages assistant */}
                {!isUser && (
                    <div className="text-xs text-gray-500 font-medium mb-1">
                        {botName}
                    </div>
                )}

                {/* Content */}
                <div className="text-sm leading-relaxed whitespace-pre-wrap">
                    {message.content}
                </div>

                {/* Timestamp */}
                <div
                    className={`text-xs mt-1 ${isUser ? 'text-indigo-200' : 'text-gray-400'
                        }`}
                >
                    {new Date(message.timestamp).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                    })}
                </div>
            </div>
        </div>
    );
};
