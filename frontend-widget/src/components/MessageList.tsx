import React, { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import type { Message } from '../types';
import { Calculator, Lightbulb, Package } from 'lucide-react';

interface MessageListProps {
    messages: Message[];
    botName: string;
    logoUrl?: string; // Nouveau prop
    primaryColor?: string; // Nouveau prop
}

export const MessageList: React.FC<MessageListProps> = ({
    messages,
    botName,
    logoUrl,
    primaryColor = '#6366f1',
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll vers le bas quand nouveaux messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-gray-50">
            {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center px-6 animate-fade-in">
                    {/* Logo ou Initiale */}
                    <div className="mb-6 relative">
                        {logoUrl ? (
                            <div className="w-20 h-20 rounded-full shadow-lg p-1 bg-white">
                                <img
                                    src={logoUrl}
                                    alt={botName}
                                    className="w-full h-full rounded-full object-cover"
                                />
                            </div>
                        ) : (
                            <div
                                className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg"
                                style={{ backgroundColor: primaryColor }}
                            >
                                <span className="text-3xl text-white font-bold">
                                    {botName.charAt(0).toUpperCase()}
                                </span>
                            </div>
                        )}
                        <div className="absolute bottom-0 right-0 w-5 h-5 bg-green-400 border-4 border-gray-50 rounded-full"></div>
                    </div>

                    <h4 className="text-gray-900 font-bold text-xl mb-2">
                        Bienvenue !
                    </h4>
                    <p className="text-gray-500 text-sm mb-8 leading-relaxed">
                        Je suis {botName}, votre assistant virtuel intelligent.
                    </p>

                    {/* Capacités du bot */}
                    <div className="w-full space-y-3 mb-6">
                        <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                                <Calculator size={18} />
                            </div>
                            <div className="text-left">
                                <span className="block text-xs font-semibold text-gray-800">Estimation Rapide</span>
                                <span className="text-[10px] text-gray-500">Obtenez un devis en 2 minutes</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                                <Lightbulb size={18} />
                            </div>
                            <div className="text-left">
                                <span className="block text-xs font-semibold text-gray-800">Conseils d&apos;Experts</span>
                                <span className="text-[10px] text-gray-500">Nous répondons à vos questions</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                                <Package size={18} />
                            </div>
                            <div className="text-left">
                                <span className="block text-xs font-semibold text-gray-800">Calculateur Volume</span>
                                <span className="text-[10px] text-gray-500">Évaluez vos besoins précis</span>
                            </div>
                        </div>
                    </div>

                    <p className="text-xs text-gray-400">
                        Posez votre question ci-dessous pour démarrer 👇
                    </p>
                </div>
            )}

            {messages.map((message) => (
                <MessageBubble
                    key={message.id}
                    message={message}
                    botName={botName}
                    logoUrl={logoUrl} // Passer le logo 
                />
            ))}

            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
        </div>
    );
};
