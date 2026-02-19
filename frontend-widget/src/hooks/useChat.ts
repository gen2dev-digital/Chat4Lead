import { useEffect, useCallback } from 'react';
import { useChatStore } from '../store/chat.store.ts';
import ApiService from '../services/api.service.ts';
import socketService from '../services/socket.service.ts';
import type { Message } from '../types';

export const useChat = () => {
    const {
        config,
        conversationId,
        messages,
        isOpen,
        isTyping,
        connection,
        setConversationId,
        addMessage,
        setIsTyping,
        setConnection,
        setLeadData,
    } = useChatStore();

    /**
     * Initialise la connexion et la conversation
     */
    useEffect(() => {
        if (!config) return;

        const init = async () => {
            try {
                setConnection({ isConnecting: true, error: undefined });

                // 1. Init conversation via REST si pas d'ID
                let currentConversationId = conversationId;
                if (!currentConversationId) {
                    const apiService = new ApiService(config);
                    const { conversationId: newId } = await apiService.initConversation();
                    setConversationId(newId);
                    currentConversationId = newId;
                }

                // 2. Connecter WebSocket
                const convId = currentConversationId;

                socketService.connect(config, {
                    onConnect: () => {
                        console.log('✅ Socket connected to:', config.apiUrl || 'http://localhost:3000');
                        setConnection({ isConnected: true, isConnecting: false });

                        // Rejoindre la conversation
                        if (convId) {
                            socketService.joinConversation(convId);
                        }
                    },

                    onDisconnect: () => {
                        console.log('❌ Socket disconnected');
                        setConnection({ isConnected: false });
                    },

                    onError: (error) => {
                        console.error('Socket error:', error);
                        setConnection({
                            isConnected: false,
                            isConnecting: false,
                            error: error.message,
                        });
                    },

                    onBotTyping: () => {
                        setIsTyping(true);
                    },

                    onBotMessage: (data) => {
                        setIsTyping(false);

                        const message: Message = {
                            id: `msg-${Date.now()}`,
                            role: 'assistant',
                            content: data.reply,
                            timestamp: new Date(data.timestamp),
                        };

                        addMessage(message);

                        // Update lead data si présent
                        if (data.leadData) {
                            setLeadData(data.leadData);
                        }
                    },

                    onBotError: (data) => {
                        setIsTyping(false);

                        const errorMessage: Message = {
                            id: `msg-error-${Date.now()}`,
                            role: 'assistant',
                            content: data.error,
                            timestamp: new Date(),
                        };

                        addMessage(errorMessage);
                    },
                });
            } catch (error) {
                console.error('Init error:', error);
                setConnection({
                    isConnected: false,
                    isConnecting: false,
                    error: error instanceof Error ? error.message : 'Connection failed',
                });
            }
        };

        init();

        // Cleanup à la déconnexion
        return () => {
            socketService.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config]);

    /**
     * Envoyer un message
     */
    const sendMessage = useCallback(
        async (content: string) => {
            if (!conversationId || !config) {
                console.error('No conversation ID or config');
                return;
            }

            // Ajouter le message user immédiatement
            const userMessage: Message = {
                id: `msg-${Date.now()}`,
                role: 'user',
                content,
                timestamp: new Date(),
            };

            addMessage(userMessage);

            try {
                // Essayer WebSocket d'abord
                if (socketService.isConnected()) {
                    socketService.sendMessage(conversationId, content);
                } else {
                    // Fallback REST API
                    console.log('WebSocket not connected, using REST API');
                    const apiService = new ApiService(config);
                    const response = await apiService.sendMessage(conversationId, content);

                    // Ajouter la réponse
                    const botMessage: Message = {
                        id: `msg-${Date.now()}`,
                        role: 'assistant',
                        content: response.reply,
                        timestamp: new Date(),
                    };

                    addMessage(botMessage);

                    if (response.leadData) {
                        setLeadData(response.leadData);
                    }
                }
            } catch (error) {
                console.error('Error sending message:', error);

                // Message d'erreur
                const errorMsg: Message = {
                    id: `msg-error-${Date.now()}`,
                    role: 'assistant',
                    content: "Désolé, je n'ai pas pu envoyer votre message. Réessayez ?",
                    timestamp: new Date(),
                };

                addMessage(errorMsg);
            }
        },
        [conversationId, config, addMessage, setLeadData]
    );

    return {
        messages,
        isOpen,
        isTyping,
        isConnected: connection.isConnected,
        sendMessage,
        reset: useChatStore((state) => state.reset),
    };
};
