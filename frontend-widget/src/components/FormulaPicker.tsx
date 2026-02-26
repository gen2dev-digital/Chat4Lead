import React from 'react';
import './FormulaPicker.css';

interface FormulaPickerProps {
    onSelect: (formula: string) => void;
    currentFormula?: string;
}

const FormulaPicker: React.FC<FormulaPickerProps> = ({ onSelect, currentFormula }) => {
    const formulas = [
        {
            id: 'eco',
            name: 'Éco',
            icon: '🌱',
            description: 'Chargement, transport et déchargement. Idéal pour les petits budgets.',
            features: ['Chargement', 'Transport', 'Déchargement']
        },
        {
            id: 'standard',
            name: 'Standard',
            icon: '🏠',
            description: 'Protection des meubles et mise sur penderie incluses. Le meilleur rapport qualité/prix.',
            features: ['Chargement', 'Transport', 'Déchargement', 'Protection mobilier', 'Penderies']
        },
        {
            id: 'luxe',
            name: 'Luxe',
            icon: '💎',
            description: 'On s\'occupe de tout : emballage complet et remontage. Sérénité totale.',
            features: ['Tout inclut', 'Emballage fragile', 'Déballage', 'Démontage/Remontage']
        }
    ];

    return (
        <div className="formula-picker">
            <div className="formula-grid">
                {formulas.map((f) => (
                    <div
                        key={f.id}
                        className={`formula-card ${currentFormula?.toLowerCase() === f.id ? 'selected' : ''}`}
                        onClick={() => onSelect(f.name)}
                    >
                        <div className="formula-icon">{f.icon}</div>
                        <h3>{f.name}</h3>
                        <p>{f.description}</p>
                        <ul className="formula-features">
                            {f.features.map((feat, idx) => (
                                <li key={idx}>✓ {feat}</li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default FormulaPicker;
