import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A one-shot reaction (Acknowledging) layered on top of the director.
 *
 *   persistent pose → reaction → whatever the persistent pose is *then*
 *
 * play(getReturnPose) moves to the reaction pose; once it is on screen it is
 * held for holdMs and the director is sent to getReturnPose(), evaluated at
 * that moment, so an outdated pose is never restored. Any other request made
 * in the meantime (a new message, a pose button, Reset) supersedes the
 * reaction and nothing is restored. Repeated triggers while it plays are
 * ignored, so reactions never stack or queue.
 *
 * cardHeld: when the reaction interrupts Suggesting, the product card stays
 * up through the round trip instead of disappearing and popping back in.
 */
export function useReaction(director, { pose: reaction = 'acknowledging', holdMs = 750, timeScale = 1 } = {}) {
  const { goTo, pose, target, cardVisible } = director;
  const returnRef = useRef(null); // getReturnPose while a reaction is playing
  const [active, setActive] = useState(false);
  const [cardHeld, setCardHeld] = useState(false);
  const fromRef = useRef(pose); // last pose shown before the reaction

  const play = useCallback(
    (getReturnPose) => {
      if (returnRef.current) return false;
      returnRef.current = getReturnPose;
      setActive(true);
      goTo(reaction);
      return true;
    },
    [goTo, reaction],
  );

  // Superseded: someone asked the director for something else.
  useEffect(() => {
    if (active && target !== reaction) {
      returnRef.current = null;
      setActive(false);
    }
  }, [active, target, reaction]);

  // On screen: hold, then return to the pose that is right *now*.
  useEffect(() => {
    if (!active || pose !== reaction || target !== reaction) return undefined;
    const timer = setTimeout(() => {
      const next = returnRef.current?.();
      returnRef.current = null;
      setActive(false);
      if (next) goTo(next);
    }, holdMs * timeScale);
    return () => clearTimeout(timer);
  }, [active, pose, target, reaction, holdMs, timeScale, goTo]);

  // Keep the card up while Suggesting → reaction → Suggesting plays out.
  useEffect(() => {
    if (pose !== reaction) fromRef.current = pose;
    if (target === reaction && fromRef.current === 'suggesting') setCardHeld(true);
    else if (cardHeld && (cardVisible || (target !== reaction && target !== 'suggesting'))) setCardHeld(false);
  }, [pose, target, cardVisible, cardHeld, reaction]);

  return { play, active, cardHeld };
}
