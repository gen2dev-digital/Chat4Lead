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

/* ── Phrases déclenchant le modal de visite conseiller ── */
const VISITE_TRIGGERS = [
    "souhaiteriez-vous qu'un de nos conseillers se déplace",
    "se déplace chez vous pour affiner l'estimation",
    "visite à domicile",
    "conseiller se déplace",
    "un conseiller peut se déplacer",
    "voulez-vous qu'un conseiller vienne",
    "visite conseiller",
    "conseiller vienne chez vous",
    "visite gratuite",
    "un expert se déplace",
    "rdv conseiller",
    "rdv à domicile",
    "proposer une visite",
];

/* ── Phrases déclenchant le choix de formule ── */
const FORMULE_TRIGGERS = [
    "quelle formule préférez-vous",
    "choisir une formule",
    "quelle formule souhaitez-vous",
    "formule éco, standard ou luxe",
    "trois formules",
    "nos formules",
    "choisir votre formule",
    "choisir entre",
    "éco, standard ou luxe",
    "eco, standard ou luxe",
    "formule vous convient",
    "quel type de prestation",
    "quelle prestation",
];

/* ── Phrases déclenchant le choix de créneau ── */
const CRENEAU_TRIGGERS = [
    "quel créneau vous arrange",
    "à quel moment préférez-vous être recontacté",
    "quand souhaitez-vous être recontacté",
    "quel moment vous convient",
    "créneau de rappel",
    "être recontacté",
    "préférence horaire",
    "matin, l'après-midi ou le soir",
    "matin, après-midi ou soir",
    "recontacté par notre équipe",
    "pour être rappelé",
];

function matchesTrigger(content: string, triggers: string[]): boolean {
    const lower = content.toLowerCase();
    return triggers.some(t => lower.includes(t));
}

function isVisiteQuestion(content: string): boolean {
    return matchesTrigger(content, VISITE_TRIGGERS);
}

export const MessageList: React.FC<MessageListProps> = ({
    messages,
    botName,
    logoUrl,
    onOptionSelect,
    leadData
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    // Track quels messages ont déclenché le modal (par index) — Set pour gérer plusieurs modals (Bug #13)
    const [answeredVisiteIdxs, setAnsweredVisiteIdxs] = useState<Set<number>>(new Set());
    const [showSummaryModal, setShowSummaryModal] = useState(false);

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
                        {/* Bug #14 fix — guard msg.content */}
                        {msg.role === 'assistant'
                            && msg.content
                            && (isVisiteQuestion(msg.content) || (msg.actions && msg.actions.includes('suggest_visit_picker')))
                            && !answeredVisiteIdxs.has(index) && (
                                <div className="px-1 animate-fade-in">
                                    <VisiteModal
                                        onConfirm={(message) => {
                                            setAnsweredVisiteIdxs(prev => new Set(prev).add(index));
                                            handleOptionClick(message);
                                        }}
                                        onDismiss={(message) => {
                                            setAnsweredVisiteIdxs(prev => new Set(prev).add(index));
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
                const lastActions = lastMsg.actions || [];

                // Ne pas afficher si c'est une question de visite (géré inline ci-dessus)
                if (isVisiteQuestion(lastMsg.content) || lastActions.includes('suggest_visit_picker')) return null;

                // Formula Picker — texte OU action backend (Bug #4 fix)
                const showFormula = (matchesTrigger(lastMsg.content, FORMULE_TRIGGERS)
                    || lastActions.includes('show_formula_picker'))
                    && !leadData.projetData?.formule;
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

                // Summary trigger
                const isSummary = lastMsg.content.toLowerCase().includes("récapitulatif de votre")
                    || lastMsg.content.toLowerCase().includes("voici le récapitulatif")
                    || lastMsg.content.toLowerCase().includes("récapitulatif complet");
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

                // Time Slot Picker (créneau de recontact) — texte OU action backend
                const showTimeSlotPicker = (matchesTrigger(lastMsg.content, CRENEAU_TRIGGERS)
                    || lastActions.includes('appointment_module_triggered'))
                    && !leadData.creneauRappel;

                if (showTimeSlotPicker) {
                    return (
                        <div className="px-4 pb-2">
                            <TimeSlotPicker onSelect={(slot) => handleOptionClick(slot)} />
                        </div>
                    );
                }

                // Star Rating
                const ratingTriggers = [
                    "comment avez-vous trouvé cette conversation",
                    "notez cette conversation",
                    "votre avis",
                    "satisfaction",
                    "évaluez",
                ];
                if (matchesTrigger(lastMsg.content, ratingTriggers)) {
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
