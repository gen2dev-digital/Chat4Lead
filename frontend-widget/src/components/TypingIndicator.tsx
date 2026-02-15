import React from 'react';

interface TypingIndicatorProps {
    botName: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
    botName,
}) => {
    return (
        <div className="px-4 py-2 bg-gray-50">
            <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl rounded-bl-sm px-4 py-3 bg-white shadow-sm">
                    <div className="text-xs text-gray-500 font-medium mb-1">
                        {botName}
                    </div>
                    <div className="flex gap-1">
                        <div
                            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                            style={{ animationDelay: '0ms' }}
                        />
                        <div
                            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                            style={{ animationDelay: '150ms' }}
                        />
                        <div
                            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                            style={{ animationDelay: '300ms' }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
