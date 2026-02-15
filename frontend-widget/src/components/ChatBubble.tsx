import React from 'react';
import { MessageCircle, X } from 'lucide-react';

interface ChatBubbleProps {
    isOpen: boolean;
    unreadCount: number;
    onClick: () => void;
    position?: 'bottom-right' | 'bottom-left';
    primaryColor?: string;
    logoUrl?: string;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({
    isOpen,
    unreadCount,
    onClick,
    position = 'bottom-right',
    primaryColor = '#6366f1',
    logoUrl,
}) => {
    const positionClasses = position === 'bottom-right' ? 'right-6' : 'left-6';

    return (
        <button
            onClick={onClick}
            className={`fixed bottom-6 ${positionClasses} w-16 h-16 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 focus:outline-none focus:ring-4 focus:ring-opacity-50 z-[9999]`}
            style={{
                backgroundColor: primaryColor,
                boxShadow: `0 8px 32px ${primaryColor}40`,
            }}
            aria-label={isOpen ? 'Fermer le chat' : 'Ouvrir le chat'}
        >
            {/* Icon avec animation de rotation */}
            <div
                className={`transition-transform duration-300 ${isOpen ? 'rotate-90' : 'rotate-0'
                    }`}
            >
                {isOpen ? (
                    <X className="w-7 h-7 text-white" />
                ) : logoUrl ? (
                    <img
                        src={logoUrl}
                        alt="Chat"
                        className="w-9 h-9 rounded-full object-cover border-2 border-white/30"
                    />
                ) : (
                    <MessageCircle className="w-7 h-7 text-white" />
                )}
            </div>

            {/* Badge unread count */}
            {!isOpen && unreadCount > 0 && (
                <div
                    className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center animate-bounce"
                    style={{
                        boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
                    }}
                >
                    {unreadCount > 9 ? '9+' : unreadCount}
                </div>
            )}

            {/* Pulse animation quand fermé */}
            {!isOpen && (
                <div
                    className="absolute inset-0 rounded-full animate-ping opacity-20"
                    style={{ backgroundColor: primaryColor }}
                />
            )}
        </button>
    );
};
