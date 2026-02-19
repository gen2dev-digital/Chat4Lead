import React, { useState } from 'react';
import { X, Phone, Mail, User, ArrowRight, Sparkles } from 'lucide-react';

interface EndConversationModalProps {
    onClose: () => void;
    onSkip: () => void;
    onSubmit: (data: { name: string; email: string; phone: string }) => void;
    primaryColor?: string;
}

export const EndConversationModal: React.FC<EndConversationModalProps> = ({
    onClose,
    onSkip,
    onSubmit,
}) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);
    const [focusedField, setFocusedField] = useState<string | null>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setTimeout(() => {
            onSubmit({ name, email, phone });
            setLoading(false);
        }, 800);
    };

    const isFormValid = name.trim() && email.trim() && phone.trim();

    const inputIcon = (field: string, Icon: typeof User) => (
        <div
            className="flex items-center justify-center shrink-0"
            style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: focusedField === field
                    ? 'rgba(99, 102, 241, 0.15)'
                    : 'rgba(99, 102, 241, 0.08)',
                color: focusedField === field ? '#818cf8' : '#6366f1',
                transition: 'all 0.25s ease',
            }}
        >
            <Icon size={17} strokeWidth={2.2} />
        </div>
    );

    return (
        <div
            className="absolute inset-0 z-50 flex flex-col animate-fade-in"
            style={{
                background: 'var(--c4l-bg-main)',
                fontFamily: 'var(--c4l-font)',
            }}
        >
            {/* ── Gradient decorative strip at top ── */}
            <div
                style={{
                    height: '4px',
                    background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)',
                    flexShrink: 0,
                }}
            />

            {/* ── Close button ── */}
            <button
                onClick={onClose}
                className="c4l-header-btn absolute top-5 right-4 p-2 z-10 rounded-xl"
                style={{ color: 'var(--c4l-text-tertiary)' }}
            >
                <X size={20} />
            </button>

            {/* ── Scrollable content ── */}
            <div className="flex-1 overflow-y-auto flex flex-col items-center px-7 pt-10 pb-6 c4l-scrollbar">

                {/* Icon area */}
                <div
                    className="relative mb-6"
                    style={{ width: 72, height: 72 }}
                >
                    {/* Outer glow */}
                    <div
                        className="absolute inset-0 rounded-2xl"
                        style={{
                            background: 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(168,85,247,0.12) 100%)',
                            transform: 'scale(1.35)',
                            filter: 'blur(14px)',
                        }}
                    />
                    {/* Icon box */}
                    <div
                        className="relative w-full h-full rounded-2xl flex items-center justify-center"
                        style={{
                            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 60%, #a855f7 100%)',
                            boxShadow: '0 8px 32px rgba(99, 102, 241, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
                        }}
                    >
                        <Sparkles size={28} color="#ffffff" strokeWidth={2} />
                    </div>
                </div>

                {/* Title */}
                <h3
                    className="text-[22px] font-bold tracking-tight mb-2 text-center"
                    style={{ color: 'var(--c4l-text-primary)' }}
                >
                    Avant de partir…
                </h3>
                <p
                    className="text-[13px] leading-relaxed text-center mb-8 max-w-[280px]"
                    style={{ color: 'var(--c4l-text-secondary)' }}
                >
                    Laissez vos coordonnées pour un rappel personnalisé de notre équipe.
                </p>

                {/* ── Form ── */}
                <form onSubmit={handleSubmit} className="w-full max-w-sm" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

                    {/* ── Name field ── */}
                    <div
                        className="flex items-center gap-3 rounded-xl transition-all duration-300"
                        style={{
                            padding: '10px 14px',
                            border: `1.5px solid ${focusedField === 'name' ? '#6366f1' : 'var(--c4l-border)'}`,
                            background: focusedField === 'name' ? 'rgba(99, 102, 241, 0.04)' : 'var(--c4l-bg-input)',
                            boxShadow: focusedField === 'name'
                                ? '0 0 0 3px rgba(99,102,241,0.1), 0 4px 12px rgba(99,102,241,0.06)'
                                : '0 1px 3px rgba(0,0,0,0.04)',
                        }}
                    >
                        {inputIcon('name', User)}
                        <input
                            type="text"
                            placeholder="Nom complet"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onFocus={() => setFocusedField('name')}
                            onBlur={() => setFocusedField(null)}
                            required
                            className="flex-1 text-sm font-medium bg-transparent outline-none min-w-0"
                            style={{
                                color: 'var(--c4l-text-primary)',
                                fontFamily: 'var(--c4l-font)',
                            }}
                        />
                    </div>

                    {/* ── Email field ── */}
                    <div
                        className="flex items-center gap-3 rounded-xl transition-all duration-300"
                        style={{
                            padding: '10px 14px',
                            border: `1.5px solid ${focusedField === 'email' ? '#6366f1' : 'var(--c4l-border)'}`,
                            background: focusedField === 'email' ? 'rgba(99, 102, 241, 0.04)' : 'var(--c4l-bg-input)',
                            boxShadow: focusedField === 'email'
                                ? '0 0 0 3px rgba(99,102,241,0.1), 0 4px 12px rgba(99,102,241,0.06)'
                                : '0 1px 3px rgba(0,0,0,0.04)',
                        }}
                    >
                        {inputIcon('email', Mail)}
                        <input
                            type="email"
                            placeholder="Adresse email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onFocus={() => setFocusedField('email')}
                            onBlur={() => setFocusedField(null)}
                            required
                            className="flex-1 text-sm font-medium bg-transparent outline-none min-w-0"
                            style={{
                                color: 'var(--c4l-text-primary)',
                                fontFamily: 'var(--c4l-font)',
                            }}
                        />
                    </div>

                    {/* ── Phone field ── */}
                    <div
                        className="flex items-center gap-3 rounded-xl transition-all duration-300"
                        style={{
                            padding: '10px 14px',
                            border: `1.5px solid ${focusedField === 'phone' ? '#6366f1' : 'var(--c4l-border)'}`,
                            background: focusedField === 'phone' ? 'rgba(99, 102, 241, 0.04)' : 'var(--c4l-bg-input)',
                            boxShadow: focusedField === 'phone'
                                ? '0 0 0 3px rgba(99,102,241,0.1), 0 4px 12px rgba(99,102,241,0.06)'
                                : '0 1px 3px rgba(0,0,0,0.04)',
                        }}
                    >
                        {inputIcon('phone', Phone)}
                        <input
                            type="tel"
                            placeholder="Numéro de téléphone"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            onFocus={() => setFocusedField('phone')}
                            onBlur={() => setFocusedField(null)}
                            required
                            className="flex-1 text-sm font-medium bg-transparent outline-none min-w-0"
                            style={{
                                color: 'var(--c4l-text-primary)',
                                fontFamily: 'var(--c4l-font)',
                            }}
                        />
                    </div>

                    {/* ── Submit button ── */}
                    <button
                        type="submit"
                        disabled={loading || !isFormValid}
                        className="w-full py-3.5 rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition-all duration-300 active:scale-[0.97]"
                        style={{
                            marginTop: '10px',
                            background: isFormValid
                                ? 'linear-gradient(135deg, #6366f1 0%, #7c3aed 50%, #a855f7 100%)'
                                : 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)',
                            backgroundSize: '200% 100%',
                            boxShadow: isFormValid
                                ? '0 8px 24px rgba(99, 102, 241, 0.35), 0 2px 6px rgba(99, 102, 241, 0.2)'
                                : 'none',
                            opacity: loading ? 0.75 : 1,
                            cursor: !isFormValid || loading ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {loading ? (
                            <>
                                <div
                                    className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                                    style={{ animation: 'spin 0.6s linear infinite' }}
                                />
                                Envoi…
                            </>
                        ) : (
                            <>
                                Envoyer et Terminer
                                <ArrowRight size={16} strokeWidth={2.5} />
                            </>
                        )}
                    </button>

                    {/* ── Divider ── */}
                    <div className="flex items-center gap-3" style={{ marginTop: '4px' }}>
                        <div className="flex-1 h-px" style={{ background: 'var(--c4l-border)' }} />
                        <span
                            className="text-[10px] font-medium uppercase tracking-widest"
                            style={{ color: 'var(--c4l-text-tertiary)' }}
                        >
                            ou
                        </span>
                        <div className="flex-1 h-px" style={{ background: 'var(--c4l-border)' }} />
                    </div>

                    {/* ── Skip button ── */}
                    <button
                        type="button"
                        onClick={onSkip}
                        className="w-full text-[12px] font-medium py-2.5 rounded-xl transition-all duration-200"
                        style={{
                            color: 'var(--c4l-text-tertiary)',
                            background: 'transparent',
                            border: '1px solid var(--c4l-border)',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--c4l-bg-input)';
                            e.currentTarget.style.borderColor = 'var(--c4l-text-tertiary)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.borderColor = 'var(--c4l-border)';
                        }}
                    >
                        Fermer sans envoyer
                    </button>
                </form>
            </div>

            {/* ── Footer branding ── */}
            <div
                className="py-3 text-center shrink-0"
                style={{ borderTop: '1px solid var(--c4l-border)' }}
            >
                <span
                    className="text-[10px] font-medium tracking-wide"
                    style={{ color: 'var(--c4l-text-tertiary)', opacity: 0.6 }}
                >
                    Propulsé par Chat4Lead
                </span>
            </div>
        </div>
    );
};
