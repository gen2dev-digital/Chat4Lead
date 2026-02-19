import React from 'react';
import { Sun, Sunset, Moon, CalendarCheck } from 'lucide-react';

interface TimeSlotPickerProps {
    onSelect: (slot: string) => void;
}

export const TimeSlotPicker: React.FC<TimeSlotPickerProps> = ({ onSelect }) => {
    const slots = [
        {
            id: 'matin',
            label: 'Matin',
            sub: '9h - 12h',
            icon: Sun,
            color: 'text-orange-500',
            bg: 'bg-orange-50 group-hover:bg-orange-100 dark:bg-orange-500/10 dark:group-hover:bg-orange-500/20',
            value: 'Matin (9h-12h)'
        },
        {
            id: 'apres-midi',
            label: 'Après-midi',
            sub: '14h - 18h',
            icon: Sunset,
            color: 'text-indigo-500',
            bg: 'bg-indigo-50 group-hover:bg-indigo-100 dark:bg-indigo-500/10 dark:group-hover:bg-indigo-500/20',
            value: 'Après-midi (14h-18h)'
        },
        {
            id: 'soir',
            label: 'Soir',
            sub: '18h - 20h',
            icon: Moon,
            color: 'text-purple-500',
            bg: 'bg-purple-50 group-hover:bg-purple-100 dark:bg-purple-500/10 dark:group-hover:bg-purple-500/20',
            value: 'Soir (18h-20h)'
        },
        {
            id: 'nopref',
            label: 'Indifférent',
            sub: 'Pas de préférence',
            icon: CalendarCheck,
            color: 'text-teal-500',
            bg: 'bg-teal-50 group-hover:bg-teal-100 dark:bg-teal-500/10 dark:group-hover:bg-teal-500/20',
            value: 'Pas de préférence'
        }
    ];

    return (
        <div className="grid grid-cols-2 gap-3 w-full mt-2 mb-4 animate-fade-in">
            {slots.map((slot) => {
                const Icon = slot.icon;
                return (
                    <button
                        key={slot.id}
                        onClick={() => onSelect(slot.value)}
                        className="
                            group relative flex flex-col items-center justify-center p-3 rounded-xl 
                            border border-[var(--c4l-glass-border)] bg-[var(--c4l-bg-card)]
                            transition-all duration-200 active:scale-95 hover:shadow-md
                        "
                    >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-colors ${slot.bg} ${slot.color}`}>
                            <Icon size={20} className="stroke-current" strokeWidth={2} />
                        </div>
                        <span className="text-[13px] font-semibold text-[var(--c4l-text-primary)]">
                            {slot.label}
                        </span>
                        <span className="text-[11px] text-[var(--c4l-text-tertiary)] opacity-80 mt-0.5">
                            {slot.sub}
                        </span>
                    </button>
                );
            })}
        </div>
    );
};
