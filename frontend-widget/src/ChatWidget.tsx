import { useState, useRef, useEffect, useCallback } from 'react';
import { ChatApiService } from './services/chatApi';
import './ChatWidget.css';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

interface ChatWidgetProps {
    apiKey: string;
    backendUrl: string;
}

export default function ChatWidget({ apiKey, backendUrl }: ChatWidgetProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [isInitializing, setIsInitializing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const apiRef = useRef(new ChatApiService(backendUrl, apiKey));

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Focus input when chat opens
    useEffect(() => {
        if (isOpen && !isInitializing) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen, isInitializing]);

    // Initialize conversation when chat opens
    const initConversation = useCallback(async () => {
        if (conversationId) return;
        setIsInitializing(true);
        setError(null);

        try {
            const result = await apiRef.current.initConversation();
            setConversationId(result.conversationId);
        } catch (err) {
            setError('Impossible de se connecter. Réessayez.');
            console.error('[Chat4Lead] Init error:', err);
        } finally {
            setIsInitializing(false);
        }
    }, [conversationId]);

    const handleToggle = () => {
        const nextOpen = !isOpen;
        setIsOpen(nextOpen);
        if (nextOpen && !conversationId) {
            initConversation();
        }
    };

    const handleSend = async () => {
        const text = inputValue.trim();
        if (!text || !conversationId || isLoading) return;

        const userMessage: Message = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: text,
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsLoading(true);
        setError(null);

        try {
            const response = await apiRef.current.sendMessage(conversationId, text);

            const botMessage: Message = {
                id: `bot-${Date.now()}`,
                role: 'assistant',
                content: response.message,
                timestamp: new Date(),
            };

            setMessages(prev => [...prev, botMessage]);
        } catch (err) {
            setError('Erreur de communication. Réessayez.');
            console.error('[Chat4Lead] Message error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="c4l-widget" id="chat4lead-widget">
            {/* Chat Window */}
            <div className={`c4l-window ${isOpen ? 'c4l-window--open' : ''}`}>
                {/* Header */}
                <div className="c4l-header" id="chat4lead-header">
                    <div className="c4l-header__info">
                        <div className="c4l-header__avatar">
                            <div className="c4l-header__avatar-icon">💬</div>
                            <span className="c4l-header__status-dot"></span>
                        </div>
                        <div className="c4l-header__text">
                            <h1 className="c4l-header__title">Tom</h1>
                            <p className="c4l-header__subtitle">Expert déménagement • En ligne</p>
                        </div>
                    </div>
                    <button
                        className="c4l-header__close"
                        onClick={handleToggle}
                        aria-label="Fermer le chat"
                        id="chat4lead-close-btn"
                    >
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <path d="M13.5 4.5L4.5 13.5M4.5 4.5L13.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>

                {/* Messages Area */}
                <div className="c4l-messages" id="chat4lead-messages">
                    {/* Welcome message */}
                    {messages.length === 0 && !isInitializing && conversationId && (
                        <div className="c4l-welcome">
                            <div className="c4l-welcome__icon">👋</div>
                            <p className="c4l-welcome__text">
                                Bonjour ! Je suis <strong>Tom</strong>, votre expert déménagement.
                                Envoyez-moi un message pour commencer !
                            </p>
                        </div>
                    )}

                    {/* Initializing state */}
                    {isInitializing && (
                        <div className="c4l-welcome">
                            <div className="c4l-welcome__icon">⏳</div>
                            <p className="c4l-welcome__text">Connexion en cours...</p>
                        </div>
                    )}

                    {/* Messages */}
                    {messages.map(msg => (
                        <div
                            key={msg.id}
                            className={`c4l-message c4l-message--${msg.role}`}
                        >
                            {msg.role === 'assistant' && (
                                <div className="c4l-message__avatar">🤖</div>
                            )}
                            <div className="c4l-message__bubble">
                                <p className="c4l-message__content">{msg.content}</p>
                                <span className="c4l-message__time">{formatTime(msg.timestamp)}</span>
                            </div>
                        </div>
                    ))}

                    {/* Typing indicator */}
                    {isLoading && (
                        <div className="c4l-message c4l-message--assistant">
                            <div className="c4l-message__avatar">🤖</div>
                            <div className="c4l-message__bubble c4l-typing">
                                <span className="c4l-typing__dot"></span>
                                <span className="c4l-typing__dot"></span>
                                <span className="c4l-typing__dot"></span>
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="c4l-error">
                            <span>⚠️ {error}</span>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="c4l-input-area" id="chat4lead-input-area">
                    <div className="c4l-input-wrapper">
                        <input
                            ref={inputRef}
                            type="text"
                            className="c4l-input"
                            id="chat4lead-input"
                            placeholder="Écrivez votre message..."
                            value={inputValue}
                            onChange={e => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isLoading || isInitializing || !conversationId}
                            autoComplete="off"
                        />
                        <button
                            className="c4l-send-btn"
                            onClick={handleSend}
                            disabled={!inputValue.trim() || isLoading || !conversationId}
                            aria-label="Envoyer"
                            id="chat4lead-send-btn"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                    </div>
                    <p className="c4l-powered">Propulsé par <strong>Chat4Lead</strong></p>
                </div>
            </div>

            {/* Floating Button */}
            <button
                className={`c4l-fab ${isOpen ? 'c4l-fab--hidden' : ''}`}
                onClick={handleToggle}
                aria-label="Ouvrir le chat"
                id="chat4lead-fab"
            >
                <div className="c4l-fab__pulse"></div>
                <svg className="c4l-fab__icon" width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
        </div>
    );
}
