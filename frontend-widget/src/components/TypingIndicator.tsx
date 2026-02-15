import React from 'react';

interface TypingIndicatorProps {
    botName: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ botName }) => {
    return (
        <div className="flex items-center gap-2 animate-fade-in">
            <div className="w-8 h-8 rounded-full bg-[#151925] border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                <span className="text-[10px] font-bold text-gray-400">AI</span>
            </div>

            <div className="px-4 py-3 rounded-[20px] rounded-bl-[4px] bg-[#1f2937] border border-white/5 shadow-md flex items-center gap-1.5 h-[42px]">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
        </div>
    );
};
