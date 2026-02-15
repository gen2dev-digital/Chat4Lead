import React, { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Send } from 'lucide-react';

interface InputBoxProps {
    onSendMessage: (message: string) => void;
    disabled?: boolean;
    primaryColor?: string;
}

export const InputBox: React.FC<InputBoxProps> = ({
    onSendMessage,
    disabled = false,
    primaryColor = '#6366f1',
}) => {
    const [message, setMessage] = useState('');

    const handleSend = () => {
        const trimmed = message.trim();
        if (!trimmed || disabled) return;
        onSendMessage(trimmed);
        setMessage('');
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSend();
        }
    };

    return (
        <div className="px-4 pb-2 pt-2">
            <div className="relative flex items-center">
                <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={disabled ? 'Connecting...' : 'Type a message...'}
                    disabled={disabled}
                    className="w-full bg-[#1f2433] text-white placeholder-gray-500 text-sm rounded-full py-3.5 pl-5 pr-12 border border-transparent focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all shadow-inner"
                />

                <button
                    onClick={handleSend}
                    disabled={disabled || !message.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-105 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed"
                    style={{
                        background: disabled ? '#374151' : 'var(--c4l-primary-gradient)', // Gradient bouton send
                        boxShadow: disabled ? 'none' : '0 4px 12px rgba(99, 102, 241, 0.4)'
                    }}
                    aria-label="Envoyer"
                >
                    <Send size={16} className="text-white ml-0.5" />
                </button>
            </div>
        </div>
    );
};
