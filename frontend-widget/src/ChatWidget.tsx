import React, { useEffect } from 'react';
import { ChatBubble } from './components/ChatBubble.tsx';
import { ChatWindow } from './components/ChatWindow.tsx';
import { useChatStore } from './store/chat.store.ts';
import { useChat } from './hooks/useChat.ts';
import type { WidgetConfig } from './types';

interface ChatWidgetProps {
    config: WidgetConfig;
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({ config }) => {
    const { setConfig, isOpen, setIsOpen, unreadCount } = useChatStore();
    const { messages, isTyping, isConnected, sendMessage, reset } = useChat();

    // Initialiser la config
    useEffect(() => {
        setConfig(config);
    }, [config, setConfig]);

    // Auto-open si configuré
    useEffect(() => {
        // Si autoOpen est true dans la config, on ouvre après un petit délai
        if (config.autoOpen && !isOpen) {
            const timer = setTimeout(() => {
                setIsOpen(true);
            }, 1000); // 1 seconde de délai pour l'effet "arrivée sur le site"

            return () => clearTimeout(timer);
        }
    }, [config.autoOpen, isOpen, setIsOpen]);

    const handleToggle = () => {
        setIsOpen(!isOpen);
    };

    const handleClose = () => {
        setIsOpen(false);
    };

    const handleEndChat = async (data?: { name: string; email: string; phone: string }) => {
        if (data) {
            // Envoyer les infos finales comme un message système caché ou normal
            // Pour l'instant on l'envoie comme un message utilisateur pour que le bot le traite
            // Idéalement, on aurait un endpoint dédié /api/leads/update
            const infoMessage = `[INFO DE CONTACT] Nom: ${data.name}, Email: ${data.email}, Tel: ${data.phone}`;
            await sendMessage(infoMessage);
        }

        // Fermer et reset après un court délai pour laisser le message partir
        setTimeout(() => {
            setIsOpen(false);
            reset(); // Vide le store et le localStorage
            localStorage.removeItem('chat4lead-opened'); // Permet de ré-ouvrir auto si refresh
        }, 1000);
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
                    onEndChat={handleEndChat}
                    logoUrl={config.logoUrl}
                />
            )}
        </>
    );
};
