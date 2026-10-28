import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useDirector } from './animation/useDirector.js';
import { useReaction } from './animation/useReaction.js';
import { REACTION_BLOCKED_DURING, ZAATAR_POSE_FOR_ACTIVITY, ZAATAR_REACTION_FOR_EVENT } from './activities.js';
import ZaatarCharacter from './character/ZaatarCharacter.jsx';
import { aspectRatio, caneTip } from './character/rig.js';
import { usePrefersReducedMotion } from './usePrefersReducedMotion.js';
import './ZaatarMascot.css';

/**
 * Zaatar, driven by what the assistant is doing.
 *
 *   <ZaatarMascot ref={mascot} activity="assistant_processing" />
 *   mascot.current.acknowledge();   // after a successful Add to Cart
 *
 * The host sizes and places the outer element; Zaatar fits inside it
 * (proportions kept, feet on its bottom edge) and runs the approved
 * transitions on his own. He never reads message text or product data.
 */
const ZaatarMascot = forwardRef(function ZaatarMascot(
  {
    activity = 'assistant_idle',
    reducedMotion,
    align = 'center',
    assetBaseUrl,
    className,
    style,
    onReady,
    onError,
    onPoseChange,
    onSettled,
    onCardVisibleChange,
  },
  ref,
) {
  const rigRef = useRef(null);
  const boxRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const systemReduced = usePrefersReducedMotion();
  const reduced = reducedMotion ?? systemReduced;
  const director = useDirector(rigRef, { ready: status === 'ready', reducedMotion: reduced });
  const reaction = useReaction(director, { pose: ZAATAR_REACTION_FOR_EVENT.cart_item_added });

  const pose = ZAATAR_POSE_FOR_ACTIVITY[activity] ?? 'idle';
  const current = useRef({ activity, pose });
  useEffect(() => {
    current.current = { activity, pose };
  }, [activity, pose]);

  // The latest activity wins; a newer one also supersedes a playing reaction.
  const { goTo } = director;
  useEffect(() => {
    if (status === 'ready') goTo(pose);
  }, [status, pose, goTo]);

  const callbacks = useRef({});
  useEffect(() => {
    callbacks.current = { onReady, onError, onPoseChange, onSettled, onCardVisibleChange };
  });

  const handleReady = useCallback(() => {
    setStatus('ready');
    callbacks.current.onReady?.();
  }, []);
  const handleError = useCallback((error) => {
    setStatus('error');
    callbacks.current.onError?.(error);
  }, []);

  useEffect(() => {
    if (status === 'ready') callbacks.current.onPoseChange?.(director.pose);
  }, [status, director.pose]);

  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !director.busy) callbacks.current.onSettled?.(director.pose);
    wasBusy.current = director.busy;
  }, [director.busy, director.pose]);

  // Show the host's product card while this is true (cane up, or held through a reaction).
  const cardVisible = director.cardVisible || reaction.cardHeld;
  const lastCardVisible = useRef(false);
  useEffect(() => {
    if (lastCardVisible.current === cardVisible) return;
    lastCardVisible.current = cardVisible;
    callbacks.current.onCardVisibleChange?.(cardVisible);
  }, [cardVisible]);

  const { play } = reaction;
  useImperativeHandle(
    ref,
    () => ({
      /** Plays Acknowledging once, then returns to the activity current at that moment. */
      acknowledge() {
        if (status !== 'ready' || REACTION_BLOCKED_DURING.includes(current.current.activity)) return false;
        return play(() => current.current.pose);
      },
      /** Viewport position of the raised cane's tip (Suggesting), or null before layout. */
      getCaneTip() {
        const box = boxRef.current?.getBoundingClientRect();
        if (!box?.width) return null;
        return { x: box.left + caneTip.x * box.width, y: box.top + caneTip.y * box.height };
      },
    }),
    [status, play],
  );

  return (
    <div
      className={['zaatar-mascot', `zaatar-mascot--${align}`, className].filter(Boolean).join(' ')}
      style={style}
      data-pose={director.pose}
      data-status={status}
      data-reduced-motion={reduced ? 'true' : undefined}
      aria-hidden="true"
    >
      <div className="zaatar-mascot__box" ref={boxRef} style={{ '--zaatar-aspect': aspectRatio }}>
        <ZaatarCharacter ref={rigRef} assetBaseUrl={assetBaseUrl} onReady={handleReady} onError={handleError} />
      </div>
    </div>
  );
});

export default ZaatarMascot;
