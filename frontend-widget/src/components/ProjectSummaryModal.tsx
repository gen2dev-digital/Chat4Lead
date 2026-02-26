import React from 'react';
import type { LeadData } from '../types';
import './ProjectSummaryModal.css';

interface ProjectSummaryModalProps {
    isOpen: boolean;
    onClose: () => void;
    leadData: LeadData;
}

const ProjectSummaryModal: React.FC<ProjectSummaryModalProps> = ({ isOpen, onClose, leadData }) => {
    if (!isOpen) return null;

    const p = leadData.projetData || {};
    const volume = p.volumeEstime || 0;

    return (
        <div className="summary-modal-overlay">
            <div className="summary-modal-content">
                <button className="summary-modal-close" onClick={onClose}>&times;</button>

                <div className="summary-header">
                    <div className="summary-icon">📋</div>
                    <h2>Récapitulatif de votre projet</h2>
                    <p>Voici les détails de votre déménagement tels qu'enregistrés.</p>
                </div>

                <div className="summary-scroll-area">
                    <section className="summary-section">
                        <h3>📍 Localisation</h3>
                        <div className="summary-grid">
                            <div className="summary-item">
                                <span className="label">Départ :</span>
                                <span className="value">{p.villeDepart || 'Non précisé'} {p.codePostalDepart ? `(${p.codePostalDepart})` : ''}</span>
                            </div>
                            <div className="summary-item">
                                <span className="label">Arrivée :</span>
                                <span className="value">{p.villeArrivee || 'Non précisé'} {p.codePostalArrivee ? `(${p.codePostalArrivee})` : ''}</span>
                            </div>
                        </div>
                    </section>

                    <section className="summary-section">
                        <h3>🏠 Logement Départ</h3>
                        <div className="summary-grid">
                            <div className="summary-item">
                                <span className="label">Type :</span>
                                <span className="value">{p.typeHabitationDepart || 'Non précisé'}</span>
                            </div>
                            <div className="summary-item">
                                <span className="label">Étage :</span>
                                <span className="value">{p.etageDepart ?? 'RDC'}</span>
                            </div>
                            <div className="summary-item">
                                <span className="label">Ascenseur :</span>
                                <span className="value">{p.ascenseurDepart ? 'Oui' : 'Non'}</span>
                            </div>
                            {p.typeEscalierDepart && (
                                <div className="summary-item">
                                    <span className="label">Escalier :</span>
                                    <span className="value">{p.typeEscalierDepart}</span>
                                </div>
                            )}
                            {p.gabaritAscenseurDepart && (
                                <div className="summary-item">
                                    <span className="label">Ascenseur (taille) :</span>
                                    <span className="value">{p.gabaritAscenseurDepart}</span>
                                </div>
                            )}
                            {p.stationnementProximiteDepart && (
                                <div className="summary-item">
                                    <span className="label">Stationnement :</span>
                                    <span className="value">{p.stationnementProximiteDepart}</span>
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="summary-section">
                        <h3>📦 Logement Arrivée</h3>
                        <div className="summary-grid">
                            <div className="summary-item">
                                <span className="label">Type :</span>
                                <span className="value">{p.typeHabitationArrivee || 'Non précisé'}</span>
                            </div>
                            <div className="summary-item">
                                <span className="label">Étage :</span>
                                <span className="value">{p.etageArrivee ?? 'RDC'}</span>
                            </div>
                            <div className="summary-item">
                                <span className="label">Ascenseur :</span>
                                <span className="value">{p.ascenseurArrivee ? 'Oui' : 'Non'}</span>
                            </div>
                            {p.typeEscalierArrivee && (
                                <div className="summary-item">
                                    <span className="label">Escalier :</span>
                                    <span className="value">{p.typeEscalierArrivee}</span>
                                </div>
                            )}
                            {p.gabaritAscenseurArrivee && (
                                <div className="summary-item">
                                    <span className="label">Ascenseur (taille) :</span>
                                    <span className="value">{p.gabaritAscenseurArrivee}</span>
                                </div>
                            )}
                            {p.stationnementProximiteArrivee && (
                                <div className="summary-item">
                                    <span className="label">Stationnement :</span>
                                    <span className="value">{p.stationnementProximiteArrivee}</span>
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="summary-section">
                        <h3>🚚 Détails du Déménagement</h3>
                        <div className="summary-grid">
                            <div className="summary-item">
                                <span className="label">Volume :</span>
                                <span className="value">{volume} m³</span>
                            </div>
                            <div className="summary-item">
                                <span className="label">Formule :</span>
                                <span className="value">{p.formule || 'Non choisie'}</span>
                            </div>
                            {p.creneauVisite && (
                                <div className="summary-item">
                                    <span className="label">RDV Visite :</span>
                                    <span className="value">{p.creneauVisite}</span>
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                <div className="summary-footer">
                    <button className="summary-confirm-btn" onClick={onClose}>
                        Confirmer et Continuer
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProjectSummaryModal;
