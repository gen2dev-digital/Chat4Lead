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
        <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start items-end gap-2.5'} mb-5 group animate-fade-in`}>

            {/* Avatar Bot (Only if not user) */}
            {!isUser && (
                <div className="w-8 h-8 rounded-full border border-gray-200/20 flex items-center justify-center overflow-hidden shrink-0 mb-1 shadow-sm bg-white dark:bg-gray-800">
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
                    className={`relative px-4 py-3.5 text-[15px] leading-relaxed break-words shadow-sm font-normal
                        ${isUser
                            ? 'text-white rounded-[20px] rounded-br-[4px]'
                            : 'rounded-[20px] rounded-bl-[4px] border'
                        }
                    `}
                    style={{
                        background: isUser
                            ? 'var(--c4l-user-bubble)'
                            : 'var(--c4l-bot-bubble)',
                        color: isUser
                            ? 'var(--c4l-user-text)'
                            : 'var(--c4l-bot-text)',
                        borderColor: isUser ? 'transparent' : 'var(--c4l-border)',
                        boxShadow: 'var(--c4l-shadow-msg)'
                    }}
                >
                    {message.content}
                </div>

                {/* Timestamp */}
                <span className="text-[10px] mt-1.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 font-medium" style={{ color: 'var(--c4l-text-tertiary)' }}>
                    {timeString}
                </span>
            </div>
        </div>
    );
};
