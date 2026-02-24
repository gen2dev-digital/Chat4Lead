import React, { useState } from 'react';
import {
    CalendarDays,
    Clock,
    CheckCircle2,
    X,
    ChevronLeft,
    ChevronRight,
    Sun,
    Sunset,
    Calendar,
    Clock8,
} from 'lucide-react';

interface VisiteModalProps {
    /** Appelé quand l'utilisateur a fini (message à envoyer au bot) */
    onConfirm: (message: string) => void;
    /** Appelé si l'utilisateur choisit "Non" ou "Pas maintenant" */
    onDismiss: (message: string) => void;
}

/* ─────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────── */

const JOURS_COURT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const JOURS_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function getDaysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfWeek(year: number, month: number): number {
    // 0=Sun → transform to Mon-based (0=Mon)
    return (new Date(year, month, 1).getDay() + 6) % 7;
}
function formatDateFR(date: Date): string {
    const jour = JOURS_LONG[date.getDay()];
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${jour.charAt(0).toUpperCase() + jour.slice(1)} ${d}/${m}/${date.getFullYear()}`;
}
function isSameDay(a: Date, b: Date) {
    return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}
function isPast(d: Date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
}

const CRENEAUX = [
    { id: 'matin', label: 'Matin', sub: '9h – 12h', icon: Sun, color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
    { id: 'apres', label: 'Après-midi', sub: '14h – 18h', icon: Sunset, color: '#6366f1', bg: 'rgba(99,102,241,0.1)' },
];

/* ─────────────────────────────────────────────────────────────
   STEP 1 — Choix Oui / Non / Pas maintenant
───────────────────────────────────────────────────────────── */
const StepChoice: React.FC<{
    onOui: () => void;
    onNon: (msg: string) => void;
}> = ({ onOui, onNon }) => (
    <div className="c4l-visite-card animate-fade-in">
        <div className="c4l-visite-header">
            <div className="c4l-visite-icon-wrap" style={{ background: 'rgba(99,102,241,0.12)' }}>
                <Calendar size={20} style={{ color: '#818cf8' }} />
            </div>
            <div>
                <p className="c4l-visite-title">Visite conseiller</p>
                <p className="c4l-visite-sub">Un expert se déplace chez vous pour affiner le devis</p>
            </div>
        </div>

        <div className="c4l-visite-choices">
            <button
                className="c4l-visite-btn c4l-visite-btn--yes"
                onClick={onOui}
            >
                <CheckCircle2 size={18} />
                Oui, je veux une visite
            </button>
            <button
                className="c4l-visite-btn c4l-visite-btn--later"
                onClick={() => onNon('Pas maintenant, peut-être plus tard.')}
            >
                <Clock8 size={18} />
                Pas maintenant
            </button>
            <button
                className="c4l-visite-btn c4l-visite-btn--no"
                onClick={() => onNon('Non merci, je ne souhaite pas de visite conseiller.')}
            >
                <X size={18} />
                Non merci
            </button>
        </div>
    </div>
);

/* ─────────────────────────────────────────────────────────────
   STEP 2 — Calendrier
───────────────────────────────────────────────────────────── */
const StepCalendar: React.FC<{
    onSelect: (date: Date) => void;
    onBack: () => void;
}> = ({ onSelect, onBack }) => {
    const today = new Date();
    const [viewMonth, setViewMonth] = useState(today.getMonth());
    const [viewYear, setViewYear] = useState(today.getFullYear());
    const [selected, setSelected] = useState<Date | null>(null);

    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfWeek(viewYear, viewMonth);

    const prevMonth = () => {
        if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
        else setViewMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
        else setViewMonth(m => m + 1);
    };

    const cells: (Date | null)[] = [
        ...Array(firstDay).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewYear, viewMonth, i + 1)),
    ];

    return (
        <div className="c4l-visite-card animate-fade-in">
            <div className="c4l-visite-header">
                <button className="c4l-visite-back" onClick={onBack}>
                    <ChevronLeft size={16} />
                </button>
                <div className="c4l-visite-icon-wrap" style={{ background: 'rgba(99,102,241,0.12)' }}>
                    <CalendarDays size={20} style={{ color: '#818cf8' }} />
                </div>
                <div>
                    <p className="c4l-visite-title">Choisissez une date</p>
                    <p className="c4l-visite-sub">Pour la visite technique à votre domicile</p>
                </div>
            </div>

            {/* Calendrier */}
            <div className="c4l-cal">
                {/* Nav mois */}
                <div className="c4l-cal-nav">
                    <button className="c4l-cal-nav-btn" onClick={prevMonth}><ChevronLeft size={16} /></button>
                    <span className="c4l-cal-month">{MOIS[viewMonth]} {viewYear}</span>
                    <button className="c4l-cal-nav-btn" onClick={nextMonth}><ChevronRight size={16} /></button>
                </div>

                {/* Jours */}
                <div className="c4l-cal-grid">
                    {JOURS_COURT.map(j => (
                        <span key={j} className="c4l-cal-dayname">{j}</span>
                    ))}
                    {cells.map((date, i) => {
                        if (!date) return <span key={`empty-${i}`} />;
                        const past = isPast(date);
                        const sel = selected && isSameDay(date, selected);
                        return (
                            <button
                                key={i}
                                disabled={past}
                                onClick={() => setSelected(date)}
                                className={`c4l-cal-day ${past ? 'c4l-cal-day--past' : ''} ${sel ? 'c4l-cal-day--selected' : ''}`}
                            >
                                {date.getDate()}
                            </button>
                        );
                    })}
                </div>

                {/* Date sélectionnée */}
                {selected && (
                    <div className="c4l-cal-selected-display animate-fade-in">
                        📅 {formatDateFR(selected)}
                    </div>
                )}

                <button
                    disabled={!selected}
                    className="c4l-visite-btn c4l-visite-btn--confirm"
                    onClick={() => selected && onSelect(selected)}
                >
                    Confirmer cette date
                </button>
            </div>
        </div>
    );
};

/* ─────────────────────────────────────────────────────────────
   STEP 3 — Créneau horaire
───────────────────────────────────────────────────────────── */
const StepCreneau: React.FC<{
    date: Date;
    onSelect: (message: string) => void;
    onBack: () => void;
}> = ({ date, onSelect, onBack }) => {
    const [selected, setSelected] = useState<string | null>(null);

    return (
        <div className="c4l-visite-card animate-fade-in">
            <div className="c4l-visite-header">
                <button className="c4l-visite-back" onClick={onBack}>
                    <ChevronLeft size={16} />
                </button>
                <div className="c4l-visite-icon-wrap" style={{ background: 'rgba(99,102,241,0.12)' }}>
                    <Clock size={20} style={{ color: '#818cf8' }} />
                </div>
                <div>
                    <p className="c4l-visite-title">Choisissez un créneau</p>
                    <p className="c4l-visite-sub">{formatDateFR(date)}</p>
                </div>
            </div>

            <div className="c4l-creneau-grid">
                {CRENEAUX.map(cr => {
                    const Icon = cr.icon;
                    const isSel = selected === cr.id;
                    return (
                        <button
                            key={cr.id}
                            onClick={() => setSelected(cr.id)}
                            className={`c4l-creneau-btn ${isSel ? 'c4l-creneau-btn--sel' : ''}`}
                            style={isSel ? { borderColor: cr.color, background: cr.bg } : {}}
                        >
                            <div className="c4l-creneau-icon" style={{ background: cr.bg, color: cr.color }}>
                                <Icon size={20} />
                            </div>
                            <span className="c4l-creneau-label">{cr.label}</span>
                            <span className="c4l-creneau-sub">{cr.sub}</span>
                            {isSel && (
                                <div className="c4l-creneau-check" style={{ color: cr.color }}>
                                    <CheckCircle2 size={16} />
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            <button
                disabled={!selected}
                className="c4l-visite-btn c4l-visite-btn--confirm"
                onClick={() => {
                    if (!selected) return;
                    const cr = CRENEAUX.find(c => c.id === selected)!;
                    const jourStr = formatDateFR(date);
                    onSelect(`Je souhaite une visite le ${jourStr}, créneau ${cr.label} (${cr.sub}).`);
                }}
            >
                Confirmer la visite
            </button>
        </div>
    );
};

/* ─────────────────────────────────────────────────────────────
   COMPOSANT PRINCIPAL
───────────────────────────────────────────────────────────── */
export const VisiteModal: React.FC<VisiteModalProps> = ({ onConfirm, onDismiss }) => {
    const [step, setStep] = useState<'choice' | 'calendar' | 'creneau'>('choice');
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);

    if (step === 'choice') {
        return (
            <StepChoice
                onOui={() => setStep('calendar')}
                onNon={onDismiss}
            />
        );
    }

    if (step === 'calendar') {
        return (
            <StepCalendar
                onSelect={(date) => { setSelectedDate(date); setStep('creneau'); }}
                onBack={() => setStep('choice')}
            />
        );
    }

    return (
        <StepCreneau
            date={selectedDate!}
            onSelect={onConfirm}
            onBack={() => setStep('calendar')}
        />
    );
};
