import React, { useState, useEffect } from 'react';
import { MessageCircle, X } from 'lucide-react';
import type { WidgetConfig } from '../types';

interface ChatBubbleProps {
    isOpen: boolean;
    unreadCount: number;
    onClick: () => void;
    position?: WidgetConfig['position'];
    primaryColor?: string;
    logoUrl?: string;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({
    isOpen,
    unreadCount,
    onClick,
    primaryColor = '#6366f1',
    logoUrl,
}) => {
    const [showTooltip, setShowTooltip] = useState(false);

    // Show tooltip after 2s on first load
    useEffect(() => {
        const timer = setTimeout(() => {
            if (!isOpen) setShowTooltip(true);
        }, 2000);
        return () => clearTimeout(timer);
    }, [isOpen]);

    return (
        <div className="fixed bottom-6 right-6 z-[9999] flex items-center gap-4 flex-row-reverse animate-scale-in">
            {/* Main Button */}
            <button
                onClick={onClick}
                className="group relative w-14 h-14 rounded-full flex items-center justify-center shadow-[0_8px_30px_rgba(99,102,241,0.4)] transition-all duration-300 hover:scale-110 active:scale-95"
                style={{
                    background: 'var(--c4l-primary-gradient)', // Gradient violet
                    border: '1px solid rgba(255,255,255,0.1)',
                }}
                aria-label={isOpen ? 'Fermer le chat' : 'Ouvrir le chat'}
            >
                {/* Icon */}
                <div className="relative z-10 text-white transition-transform duration-300 group-hover:rotate-12">
                    {isOpen ? <X size={26} /> : <MessageCircle size={26} fill="currentColor" />}
                </div>

                {/* Pulse Effect */}
                {!isOpen && (
                    <span className="absolute inset-0 rounded-full animate-ping opacity-20 bg-white"></span>
                )}

                {/* Unread Badge */}
                {!isOpen && unreadCount > 0 && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-[#0b0e14] shadow-sm animate-bounce">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </div>
                )}
            </button>

            {/* Tooltip / Call to Action */}
            {!isOpen && showTooltip && (
                <div
                    className="hidden md:flex items-center gap-2 bg-[#1f2937] text-white px-4 py-2.5 rounded-full shadow-xl border border-white/5 animate-fade-in cursor-pointer hover:bg-[#374151] transition-colors"
                    onClick={onClick}
                >
                    <span className="text-sm font-medium whitespace-nowrap">Need help? Ask LeadBot!</span>
                    <span className="text-lg animate-wave">👋</span>

                    {/* Close Tooltip Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowTooltip(false);
                        }}
                        className="ml-1 text-gray-400 hover:text-white"
                    >
                        <X size={12} />
                    </button>
                </div>
            )}
        </div>
    );
};
