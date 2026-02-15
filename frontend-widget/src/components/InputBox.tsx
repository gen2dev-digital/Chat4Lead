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

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="p-4 bg-white border-t border-gray-200">
            <div className="flex gap-3 items-end">
                {/* Textarea avec auto-resize */}
                <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={disabled ? 'Connexion...' : 'Écrivez votre message...'}
                    disabled={disabled}
                    rows={1}
                    className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-opacity-50 disabled:bg-gray-100 disabled:cursor-not-allowed text-sm"
                    style={{
                        maxHeight: '120px',
                        minHeight: '44px',
                    }}
                />

                {/* Send button */}
                <button
                    onClick={handleSend}
                    disabled={disabled || !message.trim()}
                    className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105"
                    style={{
                        backgroundColor: primaryColor,
                    }}
                    aria-label="Envoyer le message"
                >
                    <Send className="w-5 h-5 text-white" />
                </button>
            </div>

            {/* Character count */}
            {message.length > 1800 && (
                <div className="text-xs text-gray-500 mt-2 text-right">
                    {message.length}/2000
                </div>
            )}
        </div>
    );
};
