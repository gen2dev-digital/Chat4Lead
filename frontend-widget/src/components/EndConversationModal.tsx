import React, { useState } from 'react';
import { X, Phone, Mail, User } from 'lucide-react';

interface EndConversationModalProps {
    onClose: () => void;
    onSkip: () => void; // Nouvelle prop pour "Quitter sans envoyer"
    onSubmit: (data: { name: string; email: string; phone: string }) => void;
    primaryColor?: string;
}

export const EndConversationModal: React.FC<EndConversationModalProps> = ({
    onClose,
    onSkip,
    onSubmit,
    primaryColor = '#6366f1',
}) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        // Simulate waiting
        setTimeout(() => {
            onSubmit({ name, email, phone });
            setLoading(false);
        }, 800);
    };

    return (
        <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-6 animate-fade-in">
            {/* Bouton Annuler (X) - Retourne au chat sans fermer */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-full hover:bg-gray-100"
            >
                <X size={24} />
            </button>

            <div className="w-full max-w-sm text-center">
                <div
                    className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center text-white text-2xl shadow-lg animate-bounce"
                    style={{ backgroundColor: primaryColor }}
                >
                    👋
                </div>

                <h3 className="text-xl font-bold text-gray-900 mb-2">Avant de partir...</h3>
                <p className="text-sm text-gray-500 mb-8">
                    Laissez-nous vos coordonnées pour que notre équipe puisse vous recontacter avec une solution personnalisée.
                </p>

                <form onSubmit={handleSubmit} className="space-y-5 text-left">
                    <div className="group relative">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors pointer-events-none">
                            <User size={20} />
                        </div>
                        <input
                            type="text"
                            placeholder="Votre Nom complet"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-medium text-gray-800 placeholder:text-gray-400"
                        />
                    </div>

                    <div className="group relative">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors pointer-events-none">
                            <Mail size={20} />
                        </div>
                        <input
                            type="email"
                            placeholder="Votre Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-medium text-gray-800 placeholder:text-gray-400"
                        />
                    </div>

                    <div className="group relative">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors pointer-events-none">
                            <Phone size={20} />
                        </div>
                        <input
                            type="tel"
                            placeholder="Votre Téléphone"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            required
                            className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm font-medium text-gray-800 placeholder:text-gray-400"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3.5 rounded-xl text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6"
                        style={{ backgroundColor: primaryColor }}
                    >
                        {loading ? 'Envoi en cours...' : 'Envoyer et Terminer'}
                    </button>

                    <button
                        type="button"
                        onClick={onSkip} // Appelle le reset
                        className="w-full text-xs text-gray-400 hover:text-gray-600 underline decoration-gray-300 mt-4 p-2"
                    >
                        Non merci, fermer et réinitialiser la conversation
                    </button>
                </form>
            </div>
        </div>
    );
};
