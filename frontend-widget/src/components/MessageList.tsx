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
    onOptionSelect,
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll on new message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        // Double check scroll for images/slow loading content
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }, [messages]);

    const handleOptionClick = (text: string) => {
        if (onOptionSelect) onOptionSelect(text);
    };

    return (
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-2 scrollbar-hide">
            {/* Welcome Screen */}
            {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center pt-6 animate-fade-in pb-4">
                    <div className="relative mb-5">
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center border border-indigo-100 shadow-xl shadow-indigo-500/10">
                            {logoUrl ? (
                                <img src={logoUrl} alt={botName} className="w-16 h-16 rounded-full object-cover" />
                            ) : (
                                <span className="text-3xl font-bold text-indigo-500">
                                    {botName.charAt(0).toUpperCase()}
                                </span>
                            )}
                        </div>
                        {/* Dot */}
                        <div className="absolute 0 -right-1 bg-green-500 w-5 h-5 rounded-full border-4 border-white shadow-sm"></div>
                    </div>

                    <h2 className="text-2xl font-bold mb-2 text-center tracking-tight" style={{ color: 'var(--c4l-text-primary)' }}>
                        Bonjour ! 👋
                    </h2>
                    <p className="text-sm text-center max-w-[280px] leading-relaxed mb-8 font-medium" style={{ color: 'var(--c4l-text-secondary)' }}>
                        Je suis {botName}, votre assistant virtuel. Comment puis-je vous aider aujourd'hui ?
                    </p>

                    {/* Quick Options Chips */}
                    <div className="w-full space-y-3">
                        <QuickAction
                            icon={<Sparkles size={18} />}
                            title="Voir les Tarifs"
                            desc="Estimation en 2 minutes"
                            onClick={() => handleOptionClick('Je souhaite une estimation de prix.')}
                        />

                        <QuickAction
                            icon={<MessageSquare size={18} />}
                            title="Réserver une Démo"
                            desc="Parlez à un expert"
                            onClick={() => handleOptionClick('Je veux prendre rendez-vous pour une démo.')}
                            colorClass="text-purple-500 bg-purple-50"
                        />

                        <QuickAction
                            icon={<Package size={18} />}
                            title="Nos Services"
                            desc="Ce que nous proposons"
                            onClick={() => handleOptionClick('Quelles sont vos fonctionnalités ?')}
                            colorClass="text-blue-500 bg-blue-50"
                        />
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

            <div ref={messagesEndRef} className="h-2" />
        </div>
    );
};

// Helper Component pour les boutons d'accueil
const QuickAction = ({ icon, title, desc, onClick, colorClass = "text-indigo-500 bg-indigo-50" }: any) => (
    <button
        onClick={onClick}
        className="w-full flex items-center gap-4 p-4 rounded-2xl border transition-all group text-left shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
        style={{
            backgroundColor: 'var(--c4l-bg-card)',
            borderColor: 'var(--c4l-border)',
        }}
    >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorClass} transition-colors`}>
            {icon}
        </div>
        <div>
            <h4 className="text-[14px] font-bold group-hover:text-indigo-600 transition-colors" style={{ color: 'var(--c4l-text-primary)' }}>{title}</h4>
            <p className="text-[11px] font-medium" style={{ color: 'var(--c4l-text-tertiary)' }}>{desc}</p>
        </div>
    </button>
);
