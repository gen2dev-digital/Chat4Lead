import React, { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import type { Message } from '../types';

interface MessageListProps {
    messages: Message[];
    botName: string;
}

export const MessageList: React.FC<MessageListProps> = ({
    messages,
    botName,
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll vers le bas quand nouveaux messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-gray-50">
            {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                    <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mb-4">
                        <span className="text-2xl">👋</span>
                    </div>
                    <h4 className="text-gray-900 font-semibold text-lg mb-2">
                        Bienvenue !
                    </h4>
                    <p className="text-gray-600 text-sm">
                        Je suis {botName}, comment puis-je vous aider aujourd&apos;hui ?
                    </p>
                </div>
            )}

            {messages.map((message) => (
                <MessageBubble key={message.id} message={message} botName={botName} />
            ))}

            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
        </div>
    );
};
