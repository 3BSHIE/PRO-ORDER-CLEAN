// Timing and keyframes for every pose change. All durations are milliseconds
// at normal speed; the director multiplies them by the slow-motion factor.
//
// Every transition follows the same pose-to-pose recipe:
//   1. anticipate – the outgoing pose moves first (a small dip or gather)
//   2. swap       – a hard cut to the new pose at the moment of greatest
//                   motion, where the eye forgives the change. No blend:
//                   any cross-fade between two different poses shows a
//                   double cane or arm for a few frames.
//   3. follow     – the new pose overshoots slightly and settles to rest
// Body transforms use the feet as their origin, so the ground contact never
// slides. Percent translations are relative to the character's height.

const EASE_IN = 'cubic-bezier(0.55, 0, 0.75, 0.3)';
const EASE_OUT = 'cubic-bezier(0.2, 0.75, 0.3, 1)';
const EASE_IN_OUT = 'cubic-bezier(0.45, 0, 0.55, 1)';

/** Body pose: vertical shift (% of height), lean (deg), horizontal/vertical scale. */
const body = (y, lean, sx, sy) => `translateY(${y}%) rotate(${lean}deg) scale(${sx}, ${sy})`;
export const REST = body(0, 0, 1, 1);

const turn = (deg) => `rotate(${deg}deg)`;

// Idle -> Thinking: a short inward settle, as if the thought lands.
const ponder = {
  anticipate: { ms: 170, easing: EASE_IN_OUT, to: body(0.5, -0.4, 1.006, 0.99) },
  swapMs: 0,
  follow: {
    ms: 460,
    frames: [
      { offset: 0, transform: body(0.5, -0.4, 1.006, 0.99), easing: EASE_OUT },
      { offset: 0.42, transform: body(-0.35, 0.3, 0.997, 1.006), easing: EASE_IN_OUT },
      { offset: 1, transform: REST },
    ],
  },
};

// Thinking -> Idle: drops the thought and leans back onto the cane.
const release = {
  anticipate: { ms: 150, easing: EASE_IN_OUT, to: body(0.4, 0.3, 1.005, 0.992) },
  swapMs: 0,
  follow: {
    ms: 420,
    frames: [
      { offset: 0, transform: body(0.4, 0.3, 1.005, 0.992), easing: EASE_OUT },
      { offset: 0.45, transform: body(-0.25, -0.2, 0.998, 1.004), easing: EASE_IN_OUT },
      { offset: 1, transform: REST },
    ],
  },
};

// Idle/Thinking -> Suggesting: gathers (crouch), springs up as the cane rises,
// the cane whips just past vertical and settles, then the card appears.
const present = {
  anticipate: { ms: 230, easing: EASE_IN, to: body(1.3, -0.8, 1.012, 0.972) },
  swapMs: 0,
  follow: {
    ms: 580,
    frames: [
      { offset: 0, transform: body(1.3, -0.8, 1.012, 0.972), easing: EASE_OUT },
      { offset: 0.34, transform: body(-1.1, 0.5, 0.99, 1.02), easing: EASE_IN_OUT },
      { offset: 0.68, transform: body(0.25, -0.15, 1.003, 0.996), easing: EASE_IN_OUT },
      { offset: 1, transform: REST },
    ],
  },
  cane: {
    ms: 680,
    frames: [
      { offset: 0, transform: turn(7), easing: EASE_OUT },
      { offset: 0.38, transform: turn(-3.5), easing: EASE_IN_OUT },
      { offset: 0.72, transform: turn(1), easing: EASE_IN_OUT },
      { offset: 1, transform: turn(0) },
    ],
  },
  cardAtMs: 360,
  // Once the card is up, a small nod of the cane toward it.
  caneTap: {
    delayMs: 420,
    ms: 560,
    frames: [
      { offset: 0, transform: turn(0), easing: EASE_IN_OUT },
      { offset: 0.4, transform: turn(-2.4), easing: EASE_IN_OUT },
      { offset: 0.75, transform: turn(0.6), easing: EASE_IN_OUT },
      { offset: 1, transform: turn(0) },
    ],
  },
};

// Suggesting -> Idle/Thinking: the card leaves first, the cane starts to
// tip away, he dips, and the lowered pose settles in.
const lower = {
  cardExitMs: 170,
  anticipate: { ms: 200, easing: EASE_IN, to: body(0.9, 0.3, 1.008, 0.982) },
  caneOut: { ms: 200, easing: EASE_IN, to: turn(6) },
  swapMs: 0,
  follow: {
    ms: 460,
    frames: [
      { offset: 0, transform: body(0.9, 0.3, 1.008, 0.982), easing: EASE_OUT },
      { offset: 0.45, transform: body(-0.3, -0.15, 0.997, 1.006), easing: EASE_IN_OUT },
      { offset: 1, transform: REST },
    ],
  },
};

// Idle/Thinking -> Welcome: a small lean back, then the reach toward the
// guest overshoots slightly forward and settles. Welcome then holds.
const greet = {
  anticipate: { ms: 180, easing: EASE_IN_OUT, to: body(0.6, 0.4, 1.006, 0.988) },
  swapMs: 0,
  follow: {
    ms: 520,
    frames: [
      { offset: 0, transform: body(0.6, 0.4, 1.006, 0.988), easing: EASE_OUT },
      { offset: 0.4, transform: body(-0.4, -0.5, 0.997, 1.008), easing: EASE_IN_OUT },
      { offset: 0.72, transform: body(0.1, 0.12, 1.001, 0.998), easing: EASE_IN_OUT },
      { offset: 1, transform: REST },
    ],
  },
};

// Idle/Thinking/Welcome -> Responding: a small settle back, then a slight
// lean into the explanation. Restrained: he is talking, not presenting.
const explain = {
  anticipate: { ms: 160, easing: EASE_IN_OUT, to: body(0.45, 0.35, 1.005, 0.991) },
  swapMs: 0,
  follow: {
    ms: 440,
    frames: [
      { offset: 0, transform: body(0.45, 0.35, 1.005, 0.991), easing: EASE_OUT },
      { offset: 0.42, transform: body(-0.3, -0.25, 0.997, 1.005), easing: EASE_IN_OUT },
      { offset: 1, transform: REST },
    ],
  },
};

const TRANSITIONS = {
  'idle>thinking': ponder,
  'thinking>idle': release,
  'idle>suggesting': present,
  'thinking>suggesting': present,
  'suggesting>idle': lower,
  'suggesting>thinking': lower,
  // Welcome (Stage 2) reuses the approved transitions wherever they fit.
  'idle>welcome': greet,
  'thinking>welcome': greet,
  'welcome>idle': release,
  'welcome>thinking': ponder,
  'welcome>suggesting': present,
  'suggesting>welcome': lower,
  // Responding (Stage 4): one new move in, the approved moves everywhere else.
  'idle>responding': explain,
  'thinking>responding': explain,
  'welcome>responding': explain,
  'suggesting>responding': lower,
  'responding>idle': release,
  'responding>thinking': ponder,
  'responding>suggesting': present,
  'responding>welcome': greet,
  // Acknowledging (Stage 4.1), a one-shot reaction: in with the restrained
  // `explain` move, out with the approved move into the pose it returns to.
  // From Suggesting the card is not waited on (the chat keeps it up).
  'idle>acknowledging': explain,
  'thinking>acknowledging': explain,
  'welcome>acknowledging': explain,
  'responding>acknowledging': explain,
  'suggesting>acknowledging': { ...lower, cardExitMs: 0 },
  'acknowledging>idle': release,
  'acknowledging>thinking': ponder,
  'acknowledging>welcome': greet,
  'acknowledging>responding': explain,
  'acknowledging>suggesting': present,
};

// prefers-reduced-motion: no body motion, no cane swing. The old pose fades
// out before the new one fades in, so the two never overlap.
const REDUCED = { cardExitMs: 150, swapMs: 280, fadeThrough: true, cardAtMs: 120 };

export function transitionFor(from, to, reducedMotion) {
  return reducedMotion ? REDUCED : TRANSITIONS[`${from}>${to}`];
}
