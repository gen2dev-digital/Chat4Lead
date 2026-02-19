import React, { useState } from 'react';
import { Star, Send } from 'lucide-react';

interface StarRatingWidgetProps {
    onSubmit: (rating: number, comment: string) => void;
}

export const StarRatingWidget: React.FC<StarRatingWidgetProps> = ({ onSubmit }) => {
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [comment, setComment] = useState('');
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = () => {
        if (rating > 0) {
            setSubmitted(true);
            onSubmit(rating, comment);
        }
    };

    if (submitted) {
        return (
            <div className="w-full p-4 rounded-2xl bg-green-50/50 border border-green-100 flex items-center justify-center gap-2 animate-fade-in my-3">
                <span className="text-green-600 font-medium text-sm">Merci pour votre retour ! 🙏</span>
            </div>
        );
    }

    return (
        <div className="w-full p-5 mt-2 mb-4 rounded-2xl border border-[var(--c4l-glass-border)] bg-[var(--c4l-bg-card)] shadow-sm animate-fade-in space-y-4">
            <div className="text-center">
                <h4 className="text-sm font-semibold text-[var(--c4l-text-primary)] mb-1">Votre avis compte</h4>
                <p className="text-xs text-[var(--c4l-text-tertiary)]">Notez votre échange avec notre assistant</p>
            </div>

            {/* Stars */}
            <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => {
                    const isFilled = star <= (hoverRating || rating);
                    return (
                        <button
                            key={star}
                            type="button"
                            className="transition-transform hover:scale-110 active:scale-95 focus:outline-none"
                            onMouseEnter={() => setHoverRating(star)}
                            onMouseLeave={() => setHoverRating(0)}
                            onClick={() => setRating(star)}
                        >
                            <Star
                                size={32}
                                className={`transition-colors duration-200 ${isFilled
                                        ? 'text-yellow-400 drop-shadow-sm'
                                        : 'text-gray-300 dark:text-gray-600'
                                    }`}
                                fill={isFilled ? "currentColor" : "none"}
                                strokeWidth={isFilled ? 0 : 1.5}
                            />
                        </button>
                    );
                })}
            </div>

            {/* Comment Input (appears after rating) */}
            <div
                className={`transition-all duration-300 overflow-hidden ${rating > 0 ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}
            >
                <div className="relative pt-2">
                    <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Un commentaire ? (facultatif)"
                        className="w-full text-sm p-3 pr-10 rounded-xl bg-[var(--c4l-bg-input)] border border-[var(--c4l-border)] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none resize-none h-24 text-[var(--c4l-text-primary)] placeholder:text-[var(--c4l-text-tertiary)]"
                    />
                    <button
                        onClick={handleSubmit}
                        className="absolute bottom-3 right-3 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transform active:scale-95"
                        disabled={rating === 0}
                        title="Envoyer"
                    >
                        <Send size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};
