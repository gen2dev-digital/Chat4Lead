import React, { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import type { Message } from '../types';
import { Calculator, Lightbulb, Package } from 'lucide-react';

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

    // Auto-scroll vers le bas quand nouveaux messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleOptionClick = (text: string) => {
        if (onOptionSelect) {
            onOptionSelect(text);
        }
    };

    return (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-gray-50">
            {messages.length === 0 && (
                <div className="animate-fade-in flex h-full flex-col items-center justify-center px-6 text-center">
                    {/* Logo ou Initiale */}
                    <div className="relative mb-6">
                        {logoUrl ? (
                            <div className="h-20 w-20 rounded-full bg-white p-1 shadow-lg">
                                <img
                                    src={logoUrl}
                                    alt={botName}
                                    className="h-full w-full rounded-full object-cover"
                                />
                            </div>
                        ) : (
                            <div
                                className="flex h-20 w-20 items-center justify-center rounded-full shadow-lg"
                                style={{ backgroundColor: primaryColor }}
                            >
                                <span className="text-3xl font-bold text-white">
                                    {botName.charAt(0).toUpperCase()}
                                </span>
                            </div>
                        )}
                        <div className="absolute bottom-0 right-0 h-5 w-5 rounded-full border-4 border-gray-50 bg-green-400"></div>
                    </div>

                    <h4 className="mb-2 text-xl font-bold text-gray-900">Bienvenue !</h4>
                    <p className="mb-8 text-sm leading-relaxed text-gray-500">
                        Je suis {botName}, votre assistant virtuel intelligent.
                    </p>

                    {/* Capacités du bot interactives */}
                    <div className="mb-6 w-full space-y-3">
                        <button
                            onClick={() =>
                                handleOptionClick(
                                    'Je souhaite obtenir une estimation rapide pour mon déménagement.'
                                )
                            }
                            className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 text-left shadow-sm transition-all duration-200 hover:scale-[1.02] hover:border-blue-100 hover:shadow-md"
                        >
                            <div className="rounded-lg bg-blue-50 p-2 text-blue-600 transition-colors group-hover:bg-blue-100">
                                <Calculator size={18} />
                            </div>
                            <div>
                                <span className="block text-xs font-bold text-gray-800 transition-colors group-hover:text-blue-700">
                                    Estimation Rapide
                                </span>
                                <span className="text-[10px] text-gray-500">
                                    Obtenez un devis en 2 minutes
                                </span>
                            </div>
                        </button>

                        <button
                            onClick={() =>
                                handleOptionClick(
                                    "J'ai besoin de conseils d'experts pour mon déménagement."
                                )
                            }
                            className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 text-left shadow-sm transition-all duration-200 hover:scale-[1.02] hover:border-amber-100 hover:shadow-md"
                        >
                            <div className="rounded-lg bg-amber-50 p-2 text-amber-600 transition-colors group-hover:bg-amber-100">
                                <Lightbulb size={18} />
                            </div>
                            <div>
                                <span className="block text-xs font-bold text-gray-800 transition-colors group-hover:text-amber-700">
                                    Conseils d&apos;Experts
                                </span>
                                <span className="text-[10px] text-gray-500">
                                    Nous répondons à vos questions
                                </span>
                            </div>
                        </button>

                        <button
                            onClick={() =>
                                handleOptionClick(
                                    "Je voudrais de l'aide pour calculer le volume de mon déménagement."
                                )
                            }
                            className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 text-left shadow-sm transition-all duration-200 hover:scale-[1.02] hover:border-indigo-100 hover:shadow-md"
                        >
                            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 transition-colors group-hover:bg-indigo-100">
                                <Package size={18} />
                            </div>
                            <div>
                                <span className="block text-xs font-bold text-gray-800 transition-colors group-hover:text-indigo-700">
                                    Calculateur Volume
                                </span>
                                <span className="text-[10px] text-gray-500">
                                    Évaluez vos besoins précis
                                </span>
                            </div>
                        </button>
                    </div>

                    <p className="text-xs text-gray-400">
                        Cliquez sur une option ou écrivez ci-dessous 👇
                    </p>
                </div>
            )}

            {messages.map((message) => (
                <MessageBubble
                    key={message.id}
                    message={message}
                    botName={botName}
                    logoUrl={logoUrl}
                />
            ))}

            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
        </div>
    );
};
