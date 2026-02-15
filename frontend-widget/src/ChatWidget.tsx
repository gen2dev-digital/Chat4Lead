import React, { useEffect } from 'react';
import { ChatBubble } from './components/ChatBubble';
import { ChatWindow } from './components/ChatWindow';
import { useChatStore } from './store/chat.store';
import { useChat } from './hooks/useChat';
import type { WidgetConfig } from './types';

interface ChatWidgetProps {
    config: WidgetConfig;
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({ config }) => {
    const { setConfig, isOpen, setIsOpen, unreadCount } = useChatStore();
    const { messages, isTyping, isConnected, sendMessage } = useChat();

    // Initialiser la config
    useEffect(() => {
        setConfig(config);
    }, [config, setConfig]);

    // Auto-open après 5s si jamais ouvert (optionnel)
    useEffect(() => {
        const hasOpenedBefore = localStorage.getItem('chat4lead-opened');
        if (!hasOpenedBefore && !isOpen) {
            const timer = setTimeout(() => {
                setIsOpen(true);
                localStorage.setItem('chat4lead-opened', 'true');
            }, 5000);

            return () => clearTimeout(timer);
        }
    }, [isOpen, setIsOpen]);

    const handleToggle = () => {
        setIsOpen(!isOpen);
    };

    const handleClose = () => {
        setIsOpen(false);
    };

    const botName = config.botName || 'Assistant';

    return (
        <>
            {/* Bulle flottante */}
            {!isOpen && (
                <ChatBubble
                    isOpen={isOpen}
                    unreadCount={unreadCount}
                    onClick={handleToggle}
                    position={config.position}
                    primaryColor={config.primaryColor}
                />
            )}

            {/* Fenêtre de chat */}
            {isOpen && (
                <ChatWindow
                    botName={botName}
                    messages={messages}
                    isTyping={isTyping}
                    isConnected={isConnected}
                    onClose={handleClose}
                    onSendMessage={sendMessage}
                    primaryColor={config.primaryColor}
                />
            )}
        </>
    );
};
