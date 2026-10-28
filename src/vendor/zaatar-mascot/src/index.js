// Public entry point of the Zaatar mascot package.

// Most hosts need only these.
export { default as ZaatarMascot } from './ZaatarMascot.jsx';
export {
  ACTIVITIES,
  REACTION_BLOCKED_DURING,
  ZAATAR_POSE_FOR_ACTIVITY,
  ZAATAR_REACTION_FOR_EVENT,
} from './activities.js';
export { POSES, REACTIONS, aspectRatio, caneTip, figureTop, ground } from './character/rig.js';

// Building blocks, for hosts that position the character themselves (the
// ZAATAR-LAB lab and chat demo use these). ZaatarMascot is built from them.
export { default as ZaatarCharacter } from './character/ZaatarCharacter.jsx';
export { useDirector } from './animation/useDirector.js';
export { useReaction } from './animation/useReaction.js';
export { usePrefersReducedMotion } from './usePrefersReducedMotion.js';
