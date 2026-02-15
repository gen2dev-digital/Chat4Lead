import React from 'react';

interface TypingIndicatorProps {
    botName: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ botName }) => {
    return (
        <div className="flex items-center gap-2 animate-fade-in pl-1">
            <div className="w-8 h-8 rounded-full border border-gray-200/20 flex items-center justify-center overflow-hidden shrink-0 shadow-sm bg-white dark:bg-gray-800">
                <span className="text-[10px] font-bold text-gray-400">AI</span>
            </div>

            <div
                className="px-4 py-3 rounded-[20px] rounded-bl-[4px] border shadow-sm flex items-center gap-1.5 h-[40px]"
                style={{
                    backgroundColor: 'var(--c4l-bot-bubble)',
                    borderColor: 'var(--c4l-border)'
                }}
            >
                <div className="w-1.5 h-1.5 rounded-full animate-bounce bg-gray-400" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full animate-bounce bg-gray-400" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full animate-bounce bg-gray-400" style={{ animationDelay: '300ms' }} />
            </div>
        </div>
    );
};
