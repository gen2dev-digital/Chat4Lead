import React from 'react';
import type { Message } from '../types';

interface MessageBubbleProps {
    message: Message;
    botName: string;
    logoUrl?: string;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
    message,
    botName,
    logoUrl,
}) => {
    const isUser = message.role === 'user';
    const timeString = message.timestamp
        ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';

    return (
        <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start items-end gap-2'} mb-4 group`}>

            {/* Avatar Bot (Only if not user) */}
            {!isUser && (
                <div className="w-8 h-8 rounded-full bg-[#151925] border border-white/10 flex items-center justify-center overflow-hidden shrink-0 mb-1 shadow-sm">
                    {logoUrl ? (
                        <img src={logoUrl} alt={botName} className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-[10px] font-bold text-gray-400">AI</span>
                    )}
                </div>
            )}

            <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[85%]`}>
                {/* Bubble */}
                <div
                    className={`relative px-4 py-3 text-[14px] leading-relaxed break-words shadow-md
                        ${isUser
                            ? 'text-white rounded-[20px] rounded-br-[4px]'
                            : 'text-gray-200 rounded-[20px] rounded-bl-[4px] border border-white/5'
                        }
                    `}
                    style={{
                        background: isUser
                            ? 'var(--c4l-user-bubble)' // Gradient violet
                            : 'var(--c4l-bot-bubble)', // Gris sombre
                    }}
                >
                    {message.content}
                </div>

                {/* Timestamp */}
                <span className="text-[10px] text-gray-500 mt-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    {timeString}
                </span>
            </div>
        </div>
    );
};
