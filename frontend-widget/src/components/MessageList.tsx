import React, { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import type { Message } from '../types';
import { Sparkles, MessageSquare, Package } from 'lucide-react';

interface MessageListProps {
    messages: Message[];
    botName: string;
    logoUrl?: string;
    primaryColor?: string;
    onOptionSelect?: (text: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
    messages,
    botName,
    logoUrl,
    primaryColor = '#6366f1',
    onOptionSelect,
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll on new message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleOptionClick = (text: string) => {
        if (onOptionSelect) onOptionSelect(text);
    };

    return (
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
            {/* Welcome Screen */}
            {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center pt-8 animate-fade-in">
                    <div className="relative mb-6">
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center border border-white/10 shadow-lg shadow-indigo-500/20">
                            {logoUrl ? (
                                <img src={logoUrl} alt={botName} className="w-16 h-16 rounded-full object-cover" />
                            ) : (
                                <span className="text-3xl font-bold text-white">Bot</span>
                            )}
                        </div>
                        <div className="absolute -bottom-1 -right-1 bg-green-500 w-5 h-5 rounded-full border-4 border-[#0b0e14]"></div>
                    </div>

                    <h2 className="text-xl font-bold text-white mb-2 text-center">
                        Bonjour ! 👋
                    </h2>
                    <p className="text-gray-400 text-sm text-center max-w-[260px] leading-relaxed mb-8">
                        Je suis {botName}, votre assistant IA. Comment puis-je vous aider aujourd'hui ?
                    </p>

                    {/* Quick Options Chips */}
                    <div className="w-full space-y-3">
                        <button
                            onClick={() => handleOptionClick('Je souhaite une estimation de prix.')}
                            className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-[#151925] border border-white/5 hover:border-indigo-500/50 hover:bg-[#1a1f2e] transition-all group text-left"
                        >
                            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover:text-indigo-300">
                                <Sparkles size={16} />
                            </div>
                            <div>
                                <h4 className="text-sm font-semibold text-white group-hover:text-indigo-200">Voir les Tarifs</h4>
                                <p className="text-[10px] text-gray-500">Estimation rapide en 2 min</p>
                            </div>
                        </button>

                        <button
                            onClick={() => handleOptionClick('Je veux prendre rendez-vous pour une démo.')}
                            className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-[#151925] border border-white/5 hover:border-purple-500/50 hover:bg-[#1a1f2e] transition-all group text-left"
                        >
                            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 group-hover:text-purple-300">
                                <MessageSquare size={16} />
                            </div>
                            <div>
                                <h4 className="text-sm font-semibold text-white group-hover:text-purple-200">Réserver une Démo</h4>
                                <p className="text-[10px] text-gray-500">Parlez à un expert humain</p>
                            </div>
                        </button>

                        <button
                            onClick={() => handleOptionClick('Quelles sont vos fonctionnalités ?')}
                            className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-[#151925] border border-white/5 hover:border-blue-500/50 hover:bg-[#1a1f2e] transition-all group text-left"
                        >
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:text-blue-300">
                                <Package size={16} />
                            </div>
                            <div>
                                <h4 className="text-sm font-semibold text-white group-hover:text-blue-200">Fonctionnalités</h4>
                                <p className="text-[10px] text-gray-500">Découvrir ce qu'on fait</p>
                            </div>
                        </button>
                    </div>
                </div>
            )}

            {/* Messages */}
            {messages.map((msg, index) => (
                <MessageBubble
                    key={msg.id || index}
                    message={msg}
                    botName={botName}
                    logoUrl={logoUrl}
                />
            ))}

            <div ref={messagesEndRef} />
        </div>
    );
};
