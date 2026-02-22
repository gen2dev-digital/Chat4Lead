import React, { useState, useRef, useEffect } from 'react';
import { Paperclip, Mic, ArrowUp, X, FileText } from 'lucide-react';

interface InputBoxProps {
    onSendMessage: (message: string) => void;
    disabled?: boolean;
}

export const InputBox: React.FC<InputBoxProps> = ({
    onSendMessage,
    disabled = false,
}) => {
    const [message, setMessage] = useState('');
    const [attachedFile, setAttachedFile] = useState<File | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 100)}px`;
        }
    }, [message]);

    const handleSend = () => {
        const trimmed = message.trim();
        const hasContent = trimmed || attachedFile;
        if (!hasContent || disabled) return;

        const parts: string[] = [];
        if (attachedFile) parts.push(`[Fichier joint: ${attachedFile.name}]`);
        if (trimmed) parts.push(trimmed);
        onSendMessage(parts.join('\n\n'));

        setMessage('');
        setAttachedFile(null);
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const triggerFileSelect = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) setAttachedFile(file);
        e.target.value = '';
    };

    const removeAttachment = () => setAttachedFile(null);

    const toggleRecording = () => {
        if (disabled) return;
        setIsRecording(!isRecording);
        if (!isRecording) {
            console.log('Recording started...');
        } else {
            onSendMessage('[Message vocal simulé]');
        }
    };

    const hasContent = message.trim().length > 0 || !!attachedFile;

    return (
        <div
            className="px-4 pt-3 pb-5"
            style={{
                borderTop: '1px solid var(--c4l-glass-border)',
                background: 'var(--c4l-bg-main)',
            }}
        >
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileChange}
            />

            {/* Input Container — Glassmorphism card */}
            <div
                className="rounded-2xl overflow-hidden transition-all"
                style={{
                    background: 'var(--c4l-bg-input)',
                    border: '1px solid var(--c4l-glass-border)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                }}
            >
                {/* Pièce jointe */}
                {attachedFile && (
                    <div
                        className="flex items-center gap-2 px-3 py-2 mx-2 mt-2 rounded-xl"
                        style={{
                            background: 'rgba(99, 102, 241, 0.1)',
                            border: '1px solid rgba(99, 102, 241, 0.25)',
                        }}
                    >
                        <FileText size={16} style={{ color: '#6366f1' }} />
                        <span className="flex-1 text-[13px] truncate" style={{ color: 'var(--c4l-text-primary)' }}>
                            {attachedFile.name}
                        </span>
                        <button
                            type="button"
                            onClick={removeAttachment}
                            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
                            style={{ color: 'var(--c4l-text-tertiary)' }}
                            title="Retirer"
                        >
                            <X size={14} />
                        </button>
                    </div>
                )}
                {/* Textarea */}
                <div className="relative">
                    <textarea
                        ref={textareaRef}
                        rows={1}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={
                            disabled && !isRecording
                                ? 'Reconnexion...'
                                : isRecording
                                    ? 'Enregistrement vocal...'
                                    : 'Écrivez votre message...'
                        }
                        disabled={disabled && !isRecording}
                        className="w-full text-[14px] px-4 pt-3.5 pb-2 bg-transparent resize-none focus:outline-none placeholder-[var(--c4l-text-tertiary)]"
                        style={{
                            color: 'var(--c4l-text-primary)',
                            fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
                            minHeight: '42px',
                            maxHeight: '100px',
                            lineHeight: '1.5',
                        }}
                    />
                </div>

                {/* Bottom Action Bar */}
                <div className="flex items-center justify-between px-3 pb-2.5 pt-0.5">
                    <div className="flex items-center gap-1">
                        {/* Attach */}
                        <button
                            type="button"
                            onClick={triggerFileSelect}
                            disabled={disabled || isRecording}
                            className="c4l-input-btn p-2 rounded-xl transition-all active:scale-90 disabled:opacity-40"
                            style={{ color: 'var(--c4l-text-tertiary)' }}
                            title="Joindre un fichier"
                        >
                            <Paperclip size={17} />
                        </button>

                        {/* Voice */}
                        <button
                            type="button"
                            onClick={toggleRecording}
                            disabled={disabled && !isRecording}
                            className={`c4l-input-btn p-2 rounded-xl transition-all active:scale-90 ${isRecording ? 'text-red-500 animate-pulse' : ''}`}
                            style={{
                                color: isRecording ? '#ef4444' : 'var(--c4l-text-tertiary)',
                            }}
                            title={isRecording ? "Arrêter l'enregistrement" : 'Message vocal'}
                        >
                            <Mic size={17} />
                        </button>
                    </div>

                    {/* Send */}
                    <button
                        onClick={handleSend}
                        disabled={disabled || !hasContent}
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-white transition-all active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{
                            background: hasContent && !disabled
                                ? 'linear-gradient(135deg, #6366f1, #4f46e5)'
                                : 'var(--c4l-glass-border)',
                            boxShadow: hasContent && !disabled ? '0 4px 12px rgba(99,102,241,0.35)' : 'none',
                        }}
                    >
                        <ArrowUp size={18} strokeWidth={2.5} />
                    </button>
                </div>
            </div>

            {/* Branding */}
            <div className="text-center mt-3">
                <p
                    className="text-[9px] font-medium uppercase tracking-[0.2em]"
                    style={{ color: 'var(--c4l-text-tertiary)', opacity: 0.4 }}
                >
                    Powered by Chat4Lead
                </p>
            </div>
        </div>
    );
};
