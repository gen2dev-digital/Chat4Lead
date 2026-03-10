import React, { useEffect, useRef, useState } from 'react';
import { MessageBubble } from './MessageBubble.tsx';
import type { Message, LeadData } from '../types';
import { Calculator, Package, Truck } from 'lucide-react';
import { TimeSlotPicker } from './TimeSlotPicker';
import { StarRatingWidget } from './StarRatingWidget';
import { VisiteModal } from './VisiteModal';
import ProjectSummaryModal from './ProjectSummaryModal';
import FormulaPicker from './FormulaPicker';

interface MessageListProps {
    messages: Message[];
    botName: string;
    logoUrl?: string;
    onOptionSelect?: (text: string) => void;
    leadData: LeadData;
}

// ──────────────────────────────────────────────
//  TRIGGERS TEXTUELS — Détection des modaux
//  Ces phrases sont produites par le prompt.
// ──────────────────────────────────────────────

/** Phrases déclenchant le modal de visite conseiller */
const VISITE_TRIGGERS = [
    "souhaiteriez-vous qu'un de nos conseillers se déplace",
    "se déplace chez vous pour affiner l'estimation",
    "souhaiteriez-vous qu'un conseiller",
    "visite à domicile",
    "un de nos conseillers se déplace",
    "conseiller se déplace",
    "un conseiller peut se déplacer",
    "voulez-vous qu'un conseiller vienne",
    "visite conseiller",
    "conseiller vienne chez vous",
    "un expert se déplace",
    "rdv à domicile",
];

/** Phrases déclenchant le choix de formule */
const FORMULE_TRIGGERS = [
    "quelle formule préférez-vous",
    "quelle formule souhaitez-vous",
    "formule éco, standard ou luxe",
    "éco, standard ou luxe",
    "eco, standard ou luxe",
    "choisir une formule",
    "nos formules",
    "choisir votre formule",
    "formule vous convient",
    "quel type de prestation",
    "quelle prestation",
    "quelle formule",
];

/** Phrases déclenchant le choix de créneau de rappel */
const CRENEAU_TRIGGERS = [
    "quel créneau vous arrange pour être recontacté",
    "à quel moment préférez-vous être recontacté",
    "quand souhaitez-vous être recontacté",
    "quel moment vous convient",
    "matin, après-midi, soir, ou indifférent",
    "matin, après-midi ou soir",
    "matin, l'après-midi ou le soir",
    "créneau de rappel",
    "pour être rappelé",
    "recontacté par notre équipe",
];

/** Phrases déclenchant la note de satisfaction */
const RATING_TRIGGERS = [
    "comment avez-vous trouvé cette conversation",
    "notez cette conversation",
    "votre avis sur",
    "votre satisfaction",
    "évaluez notre",
];

// ──────────────────────────────────────────────
//  HELPERS
// ──────────────────────────────────────────────

function matchesTrigger(content: string | undefined, triggers: string[]): boolean {
    if (!content) return false;
    const lower = content.toLowerCase();
    return triggers.some(t => lower.includes(t.toLowerCase()));
}

function isVisiteQuestion(content: string | undefined): boolean {
    return matchesTrigger(content, VISITE_TRIGGERS);
}

// ──────────────────────────────────────────────
//  COMPOSANT PRINCIPAL
// ──────────────────────────────────────────────

export const MessageList: React.FC<MessageListProps> = ({
    messages,
    botName,
    logoUrl,
    onOptionSelect,
    leadData
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    /**
     * FIX BUG #13 : Set d'index au lieu d'un seul entier
     * Permet de masquer plusieurs modaux visite dans la même conversation
     */
    const [answeredVisiteIdxSet, setAnsweredVisiteIdxSet] = useState<Set<number>>(new Set());
    const [showSummaryModal, setShowSummaryModal] = useState(false);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleOptionClick = (text: string) => {
        if (onOptionSelect) onOptionSelect(text);
    };

    /**
     * Récupère les actions du dernier message bot.
     * Les actions sont stockées dans msg.actions (ajouté au type Message).
     * FIX BUG #4 : on lit les actions WebSocket en plus du texte.
     */
    const getLastBotActions = (): string[] => {
        const lastBot = [...messages].reverse().find(m => m.role === 'assistant');
        return (lastBot as any)?.actions || [];
    };

    const lastBotActions = getLastBotActions();

    return (
        <div className="w-full flex-1 flex flex-col">
            {/* Quick Actions — affichées uniquement quand la conversation est vide */}
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

            {/* ── Messages + widgets visite inline ── */}
            <div className="space-y-4 w-full">
                {messages.map((msg, index) => (
                    <React.Fragment key={msg.id || index}>
                        <MessageBubble
                            message={msg}
                            botName={botName}
                            logoUrl={logoUrl}
                        />

                        {/*
                         * ── Visite Modal — inline juste après le message de proposition ──
                         * FIX BUG #14 : guard sur msg.content
                         * FIX BUG #13 : Set au lieu d'un seul index
                         */}
                        {msg.role === 'assistant'
                            && msg.content
                            && isVisiteQuestion(msg.content)
                            && !answeredVisiteIdxSet.has(index)
                            && leadData.projetData?.rdvConseiller === undefined
                            && (
                                <div className="px-1 animate-fade-in">
                                    <VisiteModal
                                        onConfirm={(message) => {
                                            setAnsweredVisiteIdxSet(prev => new Set([...prev, index]));
                                            handleOptionClick(message);
                                        }}
                                        onDismiss={(message) => {
                                            setAnsweredVisiteIdxSet(prev => new Set([...prev, index]));
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
                if (!lastMsg || lastMsg.role !== 'assistant' || !lastMsg.content) return null;

                // Ne pas afficher si c'est une question de visite (géré inline ci-dessus)
                if (isVisiteQuestion(lastMsg.content)) return null;

                // ── Formula Picker ──
                // Déclenché par texte OU par action WebSocket "show_formula_picker"
                const showFormula = (
                    matchesTrigger(lastMsg.content, FORMULE_TRIGGERS)
                    || lastBotActions.includes('show_formula_picker')
                ) && !leadData.projetData?.formule;

                if (showFormula) {
                    return (
                        <div className="px-4 pb-2">
                            <FormulaPicker
                                currentFormula={leadData.projetData?.formule}
                                onSelect={(formula) => handleOptionClick(formula)}
                            />
                        </div>
                    );
                }

                // ── Récapitulatif complet ──
                const isSummary = lastMsg.content.toLowerCase().includes('récapitulatif')
                    && (lastMsg.content.toLowerCase().includes('votre projet')
                        || lastMsg.content.toLowerCase().includes('trajet')
                        || lastMsg.content.toLowerCase().includes('estimation'));

                if (isSummary) {
                    return (
                        <div className="px-4 pb-4">
                            <button
                                onClick={() => setShowSummaryModal(true)}
                                className="w-full py-3 bg-indigo-50 text-indigo-700 rounded-xl font-semibold border border-indigo-100 hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2"
                            >
                                📋 Voir le récapitulatif complet
                            </button>
                            <ProjectSummaryModal
                                isOpen={showSummaryModal}
                                onClose={() => setShowSummaryModal(false)}
                                leadData={leadData}
                            />
                        </div>
                    );
                }

                // ── Time Slot Picker (créneau de recontact) ──
                // Déclenché par texte OU par action WebSocket "show_timeslot_picker"
                const showTimeSlotPicker = (
                    matchesTrigger(lastMsg.content, CRENEAU_TRIGGERS)
                    || lastBotActions.includes('show_timeslot_picker')
                ) && !leadData.creneauRappel;

                if (showTimeSlotPicker) {
                    return (
                        <div className="px-4 pb-2">
                            <TimeSlotPicker onSelect={(slot) => handleOptionClick(slot)} />
                        </div>
                    );
                }

                // ── Star Rating (satisfaction) ──
                if (matchesTrigger(lastMsg.content, RATING_TRIGGERS)) {
                    return (
                        <div className="px-4 pb-2">
                            <StarRatingWidget
                                onSubmit={(rating, comment) => {
                                    const text = comment
                                        ? `[NOTE: ${rating}/5] ${comment}`
                                        : `[NOTE: ${rating}/5]`;
                                    handleOptionClick(text.trim());
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

// ──────────────────────────────────────────────
//  QUICK ACTION BUTTON
// ──────────────────────────────────────────────

const QuickAction = ({ icon, title, desc, onClick, gradient }: {
    icon: React.ReactNode;
    title: string;
    desc: string;
    onClick: () => void;
    gradient: string;
}) => (
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
