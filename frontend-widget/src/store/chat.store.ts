import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Message, LeadData, WidgetConfig, ConnectionStatus } from '../types';

// ──────────────────────────────────────────────
//  TYPES DU STORE
// ──────────────────────────────────────────────

interface ChatState {
    // ── Configuration ──
    config: WidgetConfig | null;

    // ── État conversation ──
    conversationId: string | null;
    messages: Message[];
    leadData: LeadData | null;

    // ── État UI ──
    isOpen: boolean;
    isTyping: boolean;
    unreadCount: number;

    // ── État connexion WebSocket ──
    connection: ConnectionStatus;

    // ── Actions ──
    setConfig: (config: WidgetConfig) => void;
    setConversationId: (id: string) => void;
    addMessage: (message: Message) => void;
    addMessages: (messages: Message[]) => void;
    setLeadData: (data: LeadData) => void;
    setIsOpen: (isOpen: boolean) => void;
    setIsTyping: (isTyping: boolean) => void;
    setConnection: (status: Partial<ConnectionStatus>) => void;
    markMessagesAsRead: () => void;
    clearChat: () => void;
    reset: () => void;
}

// ──────────────────────────────────────────────
//  ÉTAT INITIAL
// ──────────────────────────────────────────────

const initialState = {
    config: null as WidgetConfig | null,
    conversationId: null as string | null,
    messages: [] as Message[],
    leadData: null as LeadData | null,
    isOpen: false,
    isTyping: false,
    unreadCount: 0,
    connection: {
        isConnected: false,
        isConnecting: false,
        error: undefined,
    } as ConnectionStatus,
};

// ──────────────────────────────────────────────
//  STORE ZUSTAND — État global du widget
// ──────────────────────────────────────────────
//
// Utilise le middleware `persist` pour sauvegarder
// conversationId, messages et leadData dans le localStorage.
// Ainsi, si l'utilisateur recharge la page, il retrouve
// sa conversation en cours.
//

export const useChatStore = create<ChatState>()(
    persist(
        (set) => ({
            ...initialState,

            // ────────────────────────────────
            //  CONFIGURATION
            // ────────────────────────────────

            setConfig: (config) => {
                set({ config });
            },

            // ────────────────────────────────
            //  CONVERSATION
            // ────────────────────────────────

            setConversationId: (id) => {
                set({ conversationId: id });
            },

            /**
             * Ajoute un message à la conversation.
             * Si le widget est fermé et que c'est un message assistant,
             * incrémente le compteur de messages non lus.
             */
            addMessage: (message) => {
                set((state) => {
                    const newMessages = [...state.messages, message];

                    // Incrémenter unread count si widget fermé et message assistant
                    const newUnreadCount =
                        !state.isOpen && message.role === 'assistant'
                            ? state.unreadCount + 1
                            : state.unreadCount;

                    return {
                        messages: newMessages,
                        unreadCount: newUnreadCount,
                    };
                });
            },

            /**
             * Ajoute plusieurs messages d'un coup (ex: chargement historique).
             */
            addMessages: (messages) => {
                set((state) => ({
                    messages: [...state.messages, ...messages],
                }));
            },

            // ────────────────────────────────
            //  LEAD DATA
            // ────────────────────────────────

            /**
             * Met à jour les données du lead (merge avec existant).
             */
            setLeadData: (data) => {
                set((state) => ({
                    leadData: { ...state.leadData, ...data },
                }));
            },

            // ────────────────────────────────
            //  ÉTAT UI
            // ────────────────────────────────

            /**
             * Ouvre/ferme le widget.
             * Remet le compteur non-lus à 0 à l'ouverture.
             */
            setIsOpen: (isOpen) => {
                set({
                    isOpen,
                    // Reset unread count quand on ouvre le widget
                    ...(isOpen ? { unreadCount: 0 } : {}),
                });
            },

            /**
             * Indicateur "le bot est en train d'écrire".
             */
            setIsTyping: (isTyping) => {
                set({ isTyping });
            },

            // ────────────────────────────────
            //  CONNEXION WEBSOCKET
            // ────────────────────────────────

            /**
             * Met à jour l'état de la connexion WebSocket (merge partiel).
             */
            setConnection: (status) => {
                set((state) => ({
                    connection: { ...state.connection, ...status },
                }));
            },

            // ────────────────────────────────
            //  UTILITAIRES
            // ────────────────────────────────

            markMessagesAsRead: () => {
                set({ unreadCount: 0 });
            },

            /**
             * Efface l'historique de la conversation
             * sans toucher à la config ni à la connexion.
             */
            clearChat: () => {
                set({
                    messages: [],
                    leadData: null,
                    unreadCount: 0,
                });
            },

            /**
             * Reset complet du store (retour à l'état initial).
             */
            reset: () => {
                set(initialState);
            },
        }),
        {
            name: 'chat4lead-widget-storage',

            /**
             * Ne persiste QUE ces 3 champs dans le localStorage.
             * Le reste (isOpen, isTyping, connection...) est éphémère
             * et se réinitialise à chaque chargement de page.
             */
            partialize: (state) => ({
                conversationId: state.conversationId,
                messages: state.messages,
                leadData: state.leadData,
            }),
        }
    )
);
