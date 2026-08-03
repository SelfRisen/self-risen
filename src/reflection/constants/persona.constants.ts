export const PERSONA_NAMES = [
  'Sage',
  'Phoenix',
  'River',
  'Quinn',
  'Alex',
  'Robin',
] as const;

export type PersonaName = (typeof PERSONA_NAMES)[number];
