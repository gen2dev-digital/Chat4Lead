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
        <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start items-end gap-2.5'} mb-4 animate-fade-in`}>

            {/* Bot Avatar */}
            {!isUser && (
                <div
                    className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden shrink-0 mb-1"
                    style={{
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        boxShadow: '0 2px 8px rgba(99, 102, 241, 0.25)',
                    }}
                >
                    {logoUrl ? (
                        <img src={logoUrl} alt={botName} className="w-full h-full object-cover" />
                    ) : (
                        <div className="text-white text-[11px] font-bold">
                            {botName.charAt(0).toUpperCase()}
                        </div>
                    )}
                </div>
            )}

            <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[82%]`}>
                {/* Bubble */}
                <div
                    className={`relative px-4 py-3 text-[14px] leading-[1.65] break-words font-normal
                        ${isUser
                            ? 'text-white rounded-2xl rounded-br-md'
                            : 'rounded-2xl rounded-bl-md'
                        }
                    `}
                    style={{
                        background: isUser
                            ? 'var(--c4l-user-bubble)'
                            : 'var(--c4l-bot-bubble)',
                        color: isUser
                            ? 'var(--c4l-user-text)'
                            : 'var(--c4l-text-primary)',
                        border: isUser ? 'none' : '1px solid var(--c4l-glass-border)',
                        boxShadow: isUser
                            ? '0 4px 15px rgba(99, 102, 241, 0.25)'
                            : 'var(--c4l-shadow-msg)',
                        backdropFilter: !isUser ? 'blur(8px)' : 'none',
                    }}
                >
                    {(() => {
                        const techTags = [
                            'email_notification_queued', 'conversation_qualified',
                            'crm_push_queued', 'satisfaction_request_sent',
                            'appointment_module_triggered',
                        ];
                        const techLabels = [
                            '📧 Email de notification envoyé',
                            '✅ Lead qualifié automatiquement',
                            '🚀 Envoyé au CRM',
                            '⭐️ Avis demandé',
                            '📅 RDV proposé',
                            '📧 Email notifié',
                            '✅ Qualifié',
                        ];
                        let raw = message.content
                            .replace(/<br\s*\/?>/gi, '\n')
                            .replace(/<\/?[a-z][a-z0-9]*[^>]*>/gi, '')
                            .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1');
                        techTags.forEach(tag => { raw = raw.replace(new RegExp(tag, 'g'), ''); });
                        techLabels.forEach(label => { raw = raw.replace(new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ''); });
                        raw = raw.replace(/\n{2,}/g, '\n').trim();

                        return raw.split('\n').map((line, i, arr) => (
                            <React.Fragment key={i}>
                                {line}
                                {i < arr.length - 1 && <br />}
                            </React.Fragment>
                        ));
                    })()}
                </div>

                {/* Timestamp */}
                <span
                    className="text-[10px] mt-1.5 px-1 font-normal"
                    style={{ color: 'var(--c4l-text-tertiary)', opacity: 0.6 }}
                >
                    {timeString}
                </span>
            </div>
        </div>
    );
};
