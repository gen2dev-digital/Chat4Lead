import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Message, LeadData, WidgetConfig, ConnectionStatus } from '../types';

interface ChatState {
    // Configuration
    config: WidgetConfig | null;
    setConfig: (config: WidgetConfig) => void;

    // État de la conversation
    conversationId: string | null;
    setConversationId: (id: string) => void;

    messages: Message[];
    addMessage: (message: Message) => void;
    addMessages: (messages: Message[]) => void;

    leadData: Partial<LeadData>;
    setLeadData: (data: Partial<LeadData>) => void;

    // État UI
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;

    isTyping: boolean;
    setIsTyping: (isTyping: boolean) => void;

    unreadCount: number;

    // État Connexion
    connection: ConnectionStatus;
    setConnection: (status: Partial<ConnectionStatus>) => void;

    // Reset
    reset: () => void;
}

const initialState = {
    // Ne pas reset la config pour garder la clé API etc
    conversationId: null,
    messages: [],
    leadData: {},
    isOpen: false,
    isTyping: false,
    unreadCount: 0,
    connection: {
        isConnected: false,
        isConnecting: false,
    },
};

export const useChatStore = create<ChatState>()(
    persist(
        (set) => ({
            config: null,
            ...initialState,

            setConfig: (config) => set({ config }),

            setConversationId: (id) => set({ conversationId: id }),

            /**
             * Ajoute un message à la liste.
             * Si le widget est fermé et que c'est un message assistant,
             * incrémente le compteur de messages non lus.
             */
            addMessage: (message) =>
                set((state) => {
                    const newMessages = [...state.messages, message];

                    let newUnreadCount = state.unreadCount;
                    if (!state.isOpen && message.role === 'assistant') {
                        newUnreadCount += 1;
                    }

                    return {
                        messages: newMessages,
                        unreadCount: newUnreadCount,
                    };
                }),

            /**
             * Ajoute plusieurs messages d'un coup (ex: chargement historique).
             */
            addMessages: (messages) =>
                set((state) => ({
                    messages: [...state.messages, ...messages],
                })),

            /**
             * Met à jour les données du lead (merge avec existant).
             */
            setLeadData: (data) =>
                set((state) => ({
                    leadData: { ...state.leadData, ...data },
                })),

            // ────────────────────────────────
            //  ÉTAT UI
            // ────────────────────────────────

            setIsOpen: (isOpen) =>
                set((state) => ({
                    isOpen,
                    unreadCount: isOpen ? 0 : state.unreadCount, // Reset count on open
                })),

            setIsTyping: (isTyping) => set({ isTyping }),

            // ────────────────────────────────
            //  CONNEXION
            // ────────────────────────────────

            setConnection: (status) =>
                set((state) => ({
                    connection: { ...state.connection, ...status },
                })),

            // ────────────────────────────────
            //  RESET GLOBAL
            // ────────────────────────────────
            reset: () => set((state) => ({
                ...initialState,
                config: state.config, // Garder la config
            })),
        }),
        {
            name: 'chat4lead-widget-storage',
            partialize: (state) => ({
                // On persiste seulement ce qui est nécessaire pour reprendre la conv
                conversationId: state.conversationId,
                messages: state.messages,
                leadData: state.leadData,
                unreadCount: state.unreadCount,
            }),
        }
    )
);
