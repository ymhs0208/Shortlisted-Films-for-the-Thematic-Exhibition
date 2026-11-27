export const DEFAULT_INTRO_ID = 'intro-1';

const domainIntroIds = Object.freeze({
  A: 'intro-6',
  C: 'intro-8',
  D: 'intro-11',
  E: 'intro-10',
  F: 'intro-9',
  N: 'intro-7',
});

export function getDefaultIntroId(code) {
  const prefix = String(code ?? '').trim().charAt(0).toUpperCase();
  return domainIntroIds[prefix] || DEFAULT_INTRO_ID;
}
