import React, { useEffect, useRef, useState } from 'react';
import { MessageBubble } from './MessageBubble.tsx';
import type { Message } from '../types';
import { Calculator, Package, Truck } from 'lucide-react';
import { TimeSlotPicker } from './TimeSlotPicker';
import { StarRatingWidget } from './StarRatingWidget';
import { VisiteModal } from './VisiteModal';

interface MessageListProps {
    messages: Message[];
    botName: string;
    logoUrl?: string;
    onOptionSelect?: (text: string) => void;
}

/* ── Phrases déclenchant le modal de visite conseiller ── */
const VISITE_TRIGGERS = [
    "souhaiteriez-vous qu'un de nos conseillers se déplace",
    "se déplace chez vous pour affiner l'estimation",
    "visite à domicile",
    "conseiller se déplace",
    "un conseiller peut se déplacer",
    "voulez-vous qu'un conseiller vienne",
];

function isVisiteQuestion(content: string): boolean {
    const lower = content.toLowerCase();
    return VISITE_TRIGGERS.some(t => lower.includes(t));
}

export const MessageList: React.FC<MessageListProps> = ({
    messages,
    botName,
    logoUrl,
    onOptionSelect,
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    // Track quel message a déclenché le modal (par index) pour le fermer après réponse
    const [answeredVisiteIdx, setAnsweredVisiteIdx] = useState<number | null>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleOptionClick = (text: string) => {
        if (onOptionSelect) onOptionSelect(text);
    };

    return (
        <div className="w-full flex-1 flex flex-col">
            {/* Quick Actions — Professional Style */}
            {messages.length === 0 && (
                <div className="w-full flex flex-col items-center gap-3.5 px-4 mb-8 animate-fade-in">
                    <QuickAction
                        icon={<Calculator size={18} />}
                        title="Estimation tarifaire"
                        desc="Obtenez une estimation de prix"
                        onClick={() => handleOptionClick('Je souhaite obtenir une estimation tarifaire pour mon déménagement.')}
                        gradient="linear-gradient(135deg, #6366f1, #818cf8)"
                    />

                    <QuickAction
                        icon={<Package size={18} />}
                        title="Calcul du volume"
                        desc="Estimez le volume à déménager"
                        onClick={() => handleOptionClick('Je voudrais calculer le volume de mon déménagement.')}
                        gradient="linear-gradient(135deg, #8b5cf6, #a78bfa)"
                    />

                    <QuickAction
                        icon={<Truck size={18} />}
                        title="Informations complémentaires"
                        desc="Formules, services et prestations"
                        onClick={() => handleOptionClick('Je souhaite des informations complémentaires sur vos services.')}
                        gradient="linear-gradient(135deg, #3b82f6, #60a5fa)"
                    />
                </div>
            )}

            {/* Messages + widgets inline */}
            <div className="space-y-4 w-full">
                {messages.map((msg, index) => (
                    <React.Fragment key={msg.id || index}>
                        <MessageBubble
                            message={msg}
                            botName={botName}
                            logoUrl={logoUrl}
                        />

                        {/* ── Visite Modal inline juste après le message de proposition ── */}
                        {msg.role === 'assistant'
                            && isVisiteQuestion(msg.content)
                            && answeredVisiteIdx !== index && (
                                <div className="px-1 animate-fade-in">
                                    <VisiteModal
                                        onConfirm={(message) => {
                                            setAnsweredVisiteIdx(index);
                                            handleOptionClick(message);
                                        }}
                                        onDismiss={(message) => {
                                            setAnsweredVisiteIdx(index);
                                            handleOptionClick(message);
                                        }}
                                    />
                                </div>
                            )}
                    </React.Fragment>
                ))}
            </div>

            {/* ── Widgets interactifs sur le dernier message bot ── */}
            {(() => {
                const lastMsg = messages[messages.length - 1];
                if (!lastMsg || lastMsg.role !== 'assistant') return null;

                // Ne pas afficher si c'est une question de visite (géré inline ci-dessus)
                if (isVisiteQuestion(lastMsg.content)) return null;

                // Time Slot Picker (créneau de recontact)
                const showTimeSlotPicker =
                    lastMsg.content.includes("Quel créneau vous arrange pour être recontacté ?")
                    || lastMsg.content.includes("À quel moment préférez-vous être recontacté ?")
                    || lastMsg.content.includes("À quel moment est-il le plus disponible pour être recontacté ?");

                if (showTimeSlotPicker) {
                    return (
                        <div className="px-4 pb-2">
                            <TimeSlotPicker onSelect={(slot) => handleOptionClick(slot)} />
                        </div>
                    );
                }

                // Star Rating
                if (lastMsg.content.includes("Comment avez-vous trouvé cette conversation ?")) {
                    return (
                        <div className="px-4 pb-2">
                            <StarRatingWidget
                                onSubmit={(rating, comment) => {
                                    const text = `[NOTE: ${rating}/5] ${comment}`.trim();
                                    handleOptionClick(text);
                                }}
                            />
                        </div>
                    );
                }

                return null;
            })()}

            <div ref={messagesEndRef} className="h-4" />
        </div>
    );
};

const QuickAction = ({ icon, title, desc, onClick, gradient }: any) => (
    <button
        onClick={onClick}
        className="c4l-quick-action w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl transition-all group text-left active:scale-[0.98]"
        style={{
            background: 'var(--c4l-bg-card)',
            border: '1px solid var(--c4l-glass-border)',
        }}
    >
        <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white transition-transform group-hover:scale-110"
            style={{
                background: gradient,
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)',
            }}
        >
            {icon}
        </div>
        <div className="flex-1 min-w-0">
            <h4
                className="text-[14px] font-semibold leading-tight mb-0.5"
                style={{ color: 'var(--c4l-text-primary)' }}
            >
                {title}
            </h4>
            <p
                className="text-[11px] font-normal truncate"
                style={{ color: 'var(--c4l-text-tertiary)' }}
            >
                {desc}
            </p>
        </div>
        <div className="text-[var(--c4l-text-tertiary)] group-hover:text-[var(--c4l-text-secondary)] transition-all group-hover:translate-x-0.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
            </svg>
        </div>
    </button>
);
