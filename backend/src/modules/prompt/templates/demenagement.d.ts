export interface LeadData {
    prenom?: string;
    nom?: string;
    email?: string;
    telephone?: string;
    creneauRappel?: string;
    satisfaction?: string;
    satisfactionScore?: number;
    projetData: any;
}
export interface EntrepriseConfig {
    nom: string;
    nomBot: string;
    zonesIntervention: string[];
    tarifsCustom: any;
    specificites: any;
    documentsCalcul?: string[];
    consignesPersonnalisees?: string;
}
export declare const VOLUME_CALCULATOR: {
    meubles: {
        "armoire 1 porte": number;
        "armoire 2 portes": number;
        "armoire 3 portes": number;
        "buffet bas": number;
        bibliothèque: number;
        "meuble TV": number;
        "canap\u00E9 2 places": number;
        "canap\u00E9 3 places": number;
        "canap\u00E9 d'angle": number;
        fauteuil: number;
        "carton standard": number;
        commode: number;
        "table \u00E0 manger 6 pers": number;
        chaise: number;
        bureau: number;
        "lit simple 90": number;
        "lit 2 places": number;
        frigo: number;
        "lave vaisselle": number;
        "lave linge": number;
        TV: number;
        piano: number;
        vélo: number;
        "divers m3": number;
    };
};
export declare function buildPromptDemenagement(entreprise: EntrepriseConfig, leadData: LeadData): string;
