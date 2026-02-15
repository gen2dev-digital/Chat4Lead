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
            className={`flex w-full ${isUser ? 'justify-end' : 'justify-start items-end gap-2'} animate-fade-in group`}
        >
            {/* Avatar Bot pour chaque message */}
            {!isUser && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-gray-100 mb-1 shadow-sm border border-gray-100">
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
                className={`flex flex-col max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}
            >
                {/* Bot name (affiché seulement si ce n'est pas l'utilisateur) */}
                {!isUser && (
                    <span className="text-[10px] text-gray-400 ml-1 mb-1">
                        {botName}
                    </span>
                )}

                <div
                    className={`relative px-5 py-3 shadow-sm text-sm leading-relaxed whitespace-pre-wrap break-words
                        ${isUser
                            ? 'bg-indigo-600 text-white rounded-[22px] rounded-br-[4px]'
                            : 'bg-white text-gray-900 rounded-[22px] rounded-bl-[4px] border border-gray-100'
                        }
                    `}
                >
                    {message.content}
                </div>

                {/* Timestamp - apparaît au survol ou discret */}
                <span
                    className={`text-[10px] text-gray-400 mt-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200`}
                >
                    {new Date(message.timestamp).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                    })}
                </span>
            </div>
        </div>
    );
};
