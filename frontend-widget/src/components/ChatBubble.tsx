import React, { useState, useEffect } from 'react';
import { MessageCircle, X } from 'lucide-react';

interface ChatBubbleProps {
    isOpen: boolean;
    unreadCount: number;
    onClick: () => void;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({
    isOpen,
    unreadCount,
    onClick,
}) => {
    const [showTooltip, setShowTooltip] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (!isOpen) setShowTooltip(true);
        }, 2500);
        return () => clearTimeout(timer);
    }, [isOpen]);

    return (
        <div className="fixed bottom-6 right-6 z-[9999] flex items-center gap-3 flex-row-reverse animate-scale-in">
            {/* Main FAB */}
            <button
                onClick={onClick}
                className="group relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95"
                style={{
                    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                    boxShadow: '0 8px 30px rgba(99, 102, 241, 0.4)',
                }}
                aria-label={isOpen ? 'Fermer le chat' : 'Ouvrir le chat'}
            >
                <div className="relative z-10 text-white transition-transform duration-300 group-hover:rotate-12">
                    {isOpen ? <X size={24} /> : <MessageCircle size={24} fill="currentColor" />}
                </div>

                {/* Pulse */}
                {!isOpen && (
                    <span
                        className="absolute inset-0 rounded-full animate-ping"
                        style={{
                            background: 'rgba(99, 102, 241, 0.3)',
                            animationDuration: '2.5s',
                        }}
                    />
                )}

                {/* Badge */}
                {!isOpen && unreadCount > 0 && (
                    <div
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-lg"
                        style={{ border: '2px solid #0d1117' }}
                    >
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </div>
                )}
            </button>

            {/* Tooltip */}
            {!isOpen && showTooltip && (
                <div
                    className="hidden md:flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-xl cursor-pointer transition-all animate-fade-in"
                    style={{
                        background: 'linear-gradient(135deg, #1e293b, #334155)',
                        border: '1px solid rgba(255,255,255,0.08)',
                    }}
                    onClick={onClick}
                >
                    <span className="text-[13px] font-medium text-white whitespace-nowrap">
                        Besoin d'aide ? 💬
                    </span>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowTooltip(false);
                        }}
                        className="ml-1 text-gray-400 hover:text-white transition-colors"
                    >
                        <X size={12} />
                    </button>
                </div>
            )}
        </div>
    );
};
