// Reference infrastructure — Sri Lanka Disaster Management Reference Handbook (CFE-DM, Oct 2024), Tables 2 & 3.
export const AIRPORTS = [
  { code: 'CMB / VCBI', name: 'Bandaranaike International (Katunayake)', lat: 7.181111, lon: 79.883611, note: 'Main intl. gateway; UNHAS humanitarian flights; 3,350 m runway' },
  { code: 'HRI / VCRI', name: 'Mattala Rajapaksa International', lat: 6.291227, lon: 81.122007, note: 'Intl.; alternate wide-body diversion' },
  { code: 'RML / VCCC', name: 'Colombo Ratmalana', lat: 6.821223, lon: 79.890295, note: 'Intl./domestic, SLAF use' },
  { code: 'BTC / VCCB', name: 'Batticaloa', lat: 7.706208, lon: 81.681501, note: 'Intl./domestic' },
  { code: 'JAF / VCCJ', name: 'Jaffna International', lat: 9.795141, lon: 80.067562, note: 'Intl./domestic' },
  { code: 'ACJ / VCCA', name: 'Anuradhapura', lat: 8.303872, lon: 80.42911, note: 'Domestic / SLAF' },
  { code: 'TRR / VCCT', name: 'Trincomalee (China Bay)', lat: 8.545674, lon: 81.189271, note: 'Domestic / SLAF' },
  { code: 'ADP / VCCG', name: 'Ampara', lat: 7.3355, lon: 81.62217, note: 'Domestic / SLAF' },
  { code: 'KCT / VCCK', name: 'Koggala', lat: 5.993889, lon: 80.320556, note: 'Domestic / SLAF' }
];
export const SEAPORTS = [
  { code: 'LKCMB', name: 'Colombo Port', lat: 6.939561, lon: 79.84608, note: 'Largest port; ~7M TEU/yr; hub for Malé cargo' },
  { code: 'LKHBA', name: 'Hambantota International Port', lat: 6.122077, lon: 81.10562, note: 'Deep-water; ro-ro, bulk' },
  { code: 'LKTRR', name: 'Trincomalee Port', lat: 8.545642, lon: 81.2229, note: 'Natural deep harbour; SLN' },
  { code: 'LKGAL', name: 'Galle Port', lat: 6.034294, lon: 80.231886, note: 'Regional / leisure' },
  { code: 'LKKNK', name: 'Kankesanthurai Port', lat: 9.818889, lon: 80.0325, note: 'Northern' },
  { code: 'LKOLU', name: 'Oluvil Port', lat: 7.275, lon: 81.866667, note: 'Eastern, Ampara' }
];
export const HOTLINES = [['117', 'Disaster Emergency (DMC)'], ['119', 'Police emergency'], ['1990', 'Suwa Seriya ambulance'], ['1919', 'Government Information Centre']];
export const SL_CENTER = { lat: 7.8, lon: 80.7, zoom: 7 };

// Default exercise roles: WHO SimEx exercise-management roles + EOC/ICS functions + CIVSAR household-response roles.
export const DEFAULT_ROLES = [
  { id: 'director', name: 'Exercise Director', kind: 'control', brief: 'Strategic oversight; approves objectives; can stop the exercise (ENDEX / "No Duff").' },
  { id: 'facilitator', name: 'Lead Facilitator / Controller', kind: 'control', brief: 'Runs the clock, releases injects, keeps play on objectives.' },
  { id: 'simcell', name: 'SimCell (role-players)', kind: 'control', brief: 'Plays everyone outside the room: media, public, ministries, NGOs.' },
  { id: 'eoc-manager', name: 'EOC Manager / Incident Commander', kind: 'player', brief: 'Sets objectives and priorities for each operational period; approves sitreps.' },
  { id: 'operations', name: 'Operations Section', kind: 'player', brief: 'Directs response tasks: evacuation, SAR, health, shelter.' },
  { id: 'planning', name: 'Planning / Situation Unit', kind: 'player', brief: 'Maintains the common operating picture, sitreps and the action plan.' },
  { id: 'logistics', name: 'Logistics (air/sea/road)', kind: 'player', brief: 'Resources, transport, airport & port coordination, supply chain.' },
  { id: 'finance', name: 'Finance / Admin', kind: 'player', brief: 'Procurement, cost tracking, compensation records (NDRSC).' },
  { id: 'pio', name: 'Public Information / Warning', kind: 'player', brief: 'Warnings in Sinhala/Tamil/English; rumour control; media.' },
  { id: 'liaison', name: 'Liaison (Tri-forces, Police, NGOs, UN)', kind: 'player', brief: 'Coordinates partner agencies and requests for assistance.' },
  { id: 'health', name: 'Health & First Aid Cluster', kind: 'player', brief: 'Casualties, hospitals, leptospirosis/dengue surveillance.' },
  { id: 'ict', name: 'Emergency ICT / Comms', kind: 'player', brief: 'Radio nets, coverage gaps, CAP alerting, backup comms.' },
  { id: 'evaluator', name: 'Evaluator', kind: 'evaluator', brief: 'Observes against objectives; records strengths and gaps.' },
  { id: 'observer', name: 'Observer', kind: 'observer', brief: 'Watches only; no play.' }
];
