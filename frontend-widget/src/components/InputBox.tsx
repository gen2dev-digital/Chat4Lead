import React, { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Send } from 'lucide-react';

interface InputBoxProps {
    onSendMessage: (message: string) => void;
    disabled?: boolean;
}

export const InputBox: React.FC<InputBoxProps> = ({
    onSendMessage,
    disabled = false,
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

    const inputStyle = {
        backgroundColor: 'var(--c4l-bg-input)',
        color: 'var(--c4l-text-primary)',
        borderColor: 'var(--c4l-border)',
    };

    return (
        <div
            className="px-4 py-4 pt-2 border-t"
            style={{
                backgroundColor: 'var(--c4l-bg-main)',
                borderColor: 'var(--c4l-border)'
            }}
        >
            <div className="relative flex items-center">
                <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={disabled ? 'Reconnexion...' : 'Écrivez votre message...'}
                    disabled={disabled}
                    className="w-full text-[15px] rounded-full pl-5 pr-14 py-3.5 border focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all shadow-sm placeholder-gray-400 font-medium"
                    style={inputStyle}
                />

                <button
                    onClick={handleSend}
                    disabled={disabled || !message.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed shadow-md"
                    style={{
                        background: disabled ? '#9ca3af' : 'var(--c4l-primary-gradient)',
                    }}
                    aria-label="Envoyer"
                    title="Envoyer le message"
                >
                    <Send size={18} className="text-white translate-x-0.5 translate-y-[1px]" />
                </button>
            </div>

            {/* Branding discret */}
            <div className="text-center mt-2 opacity-60 hover:opacity-100 transition-opacity">
                <a href="#" className="text-[10px] font-medium flex items-center justify-center gap-1" style={{ color: 'var(--c4l-text-tertiary)' }}>
                    Powered by <span className="font-bold">Chat4Lead</span>
                </a>
            </div>
        </div>
    );
};
