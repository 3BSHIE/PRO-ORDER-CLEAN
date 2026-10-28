import { useCallback, useEffect, useRef, useState } from 'react';
import { REST, transitionFor } from './choreography.js';

/**
 * Drives Zaatar between poses.
 *
 * Requests never interrupt a transition halfway (that is where double poses
 * would show). Instead the latest request wins: the current transition
 * finishes, then the director heads straight for whatever was asked last.
 * Reset is the exception: it stops everything and snaps back to Idle.
 *
 * rigRef.current must expose { motion, poses: { [pose]: element }, cane }.
 */
export function useDirector(rigRef, { ready, timeScale = 1, reducedMotion = false }) {
  const [pose, setPose] = useState('idle');
  const [target, setTarget] = useState('idle');
  const [busy, setBusy] = useState(false);
  const [cardVisible, setCardVisible] = useState(false);
  const [sequencePlaying, setSequencePlaying] = useState(false);

  const poseRef = useRef('idle');
  const targetRef = useRef('idle');
  const generationRef = useRef(0); // bumped by Reset: stale async work stops
  const sequenceRef = useRef(0); // bumped when a sequence is cancelled
  const pumpRef = useRef(null);
  const animationsRef = useRef(new Set());
  const timersRef = useRef(new Set());
  const settingsRef = useRef({ timeScale, reducedMotion });

  useEffect(() => {
    settingsRef.current = { timeScale, reducedMotion };
  }, [timeScale, reducedMotion]);

  const scaled = (ms) => ms * settingsRef.current.timeScale;

  const sleep = useCallback((ms) => {
    return new Promise((resolve) => {
      const timer = { resolve };
      timer.id = setTimeout(() => {
        timersRef.current.delete(timer);
        resolve();
      }, scaled(ms));
      timersRef.current.add(timer);
    });
  }, []);

  const play = useCallback((element, keyframes, ms, easing = 'linear') => {
    if (!element) return Promise.resolve();
    const animation = element.animate(keyframes, { duration: scaled(ms), easing, fill: 'forwards' });
    animationsRef.current.add(animation);
    return animation.finished.catch(() => {});
  }, []);

  const cancelOn = useCallback((element) => {
    for (const animation of animationsRef.current) {
      if (animation.effect?.target === element) {
        animation.cancel();
        animationsRef.current.delete(animation);
      }
    }
  }, []);

  const showOnly = useCallback(
    (visiblePose) => {
      const { poses } = rigRef.current;
      for (const [name, element] of Object.entries(poses)) {
        element.style.opacity = name === visiblePose ? '1' : '0';
      }
    },
    [rigRef],
  );

  /** Hard cut by default; with fadeThrough the old pose fades out, then the new one in. */
  const swapPoses = useCallback(
    async (from, to, ms, fadeThrough, alive) => {
      const { poses } = rigRef.current;
      if (ms > 0 && fadeThrough) {
        await play(poses[from], [{ opacity: 1 }, { opacity: 0 }], ms / 2, 'ease-in');
        if (!alive()) return;
        showOnly(null);
        cancelOn(poses[from]);
        await play(poses[to], [{ opacity: 0 }, { opacity: 1 }], ms / 2, 'ease-out');
        if (!alive()) return;
        cancelOn(poses[to]);
      }
      showOnly(to);
    },
    [rigRef, play, cancelOn, showOnly],
  );

  const runTransition = useCallback(
    async (from, to, alive) => {
      const { motion, cane } = rigRef.current;
      const t = transitionFor(from, to, settingsRef.current.reducedMotion);

      if (from === 'suggesting') {
        setCardVisible(false);
        await sleep(t.cardExitMs ?? 0);
        if (!alive()) return;
      }

      if (t.anticipate) {
        const moves = [
          play(motion, [{ transform: REST }, { transform: t.anticipate.to }], t.anticipate.ms, t.anticipate.easing),
        ];
        if (t.caneOut && from === 'suggesting') {
          // Start from wherever the cane is (it may be mid-nod).
          const current = getComputedStyle(cane).transform;
          cancelOn(cane);
          moves.push(play(cane, [{ transform: current }, { transform: t.caneOut.to }], t.caneOut.ms, t.caneOut.easing));
        }
        await Promise.all(moves);
        if (!alive()) return;
      }

      // Swap while the body is still moving, then let it settle.
      const moves = [swapPoses(from, to, t.swapMs, t.fadeThrough, alive)];
      if (t.follow) {
        cancelOn(motion);
        moves.push(play(motion, t.follow.frames, t.follow.ms));
      }
      if (t.cane && to === 'suggesting') {
        cancelOn(cane);
        moves.push(play(cane, t.cane.frames, t.cane.ms));
      }
      poseRef.current = to;
      setPose(to);

      if (to === 'suggesting') {
        await sleep(t.cardAtMs ?? 0);
        if (!alive()) return;
        setCardVisible(true);
      }

      await Promise.all(moves);
      if (!alive()) return;
      cancelOn(motion);
      if (from === 'suggesting') cancelOn(cane);

      if (t.caneTap && to === 'suggesting') {
        // Fire and forget: a new request may take over the cane at any time.
        sleep(t.caneTap.delayMs).then(() => {
          if (alive() && poseRef.current === 'suggesting' && targetRef.current === 'suggesting') {
            cancelOn(cane);
            play(cane, t.caneTap.frames, t.caneTap.ms);
          }
        });
      }
    },
    [rigRef, sleep, play, cancelOn, swapPoses],
  );

  const pump = useCallback(async () => {
    const generation = generationRef.current;
    const alive = () => generationRef.current === generation;
    await null; // let the caller store this promise before we can finish
    setBusy(true);
    try {
      while (alive() && targetRef.current !== poseRef.current) {
        await runTransition(poseRef.current, targetRef.current, alive);
      }
    } finally {
      if (alive()) {
        pumpRef.current = null;
        setBusy(false);
      }
    }
  }, [runTransition]);

  /** Ask for a pose; resolves once the director has arrived (or was reset). */
  const request = useCallback(
    (next) => {
      targetRef.current = next;
      setTarget(next);
      if (!pumpRef.current) pumpRef.current = pump();
      return pumpRef.current;
    },
    [pump],
  );

  const stopSequence = useCallback(() => {
    sequenceRef.current += 1;
    setSequencePlaying(false);
  }, []);

  const goTo = useCallback(
    (next) => {
      if (!ready) return;
      stopSequence();
      request(next);
    },
    [ready, stopSequence, request],
  );

  /** Demonstration only (the lab): steps = [{ pose, holdMs }]. Hosts drive poses with goTo. */
  const playSequence = useCallback(async (steps) => {
    if (!ready) return;
    const token = ++sequenceRef.current;
    const live = () => sequenceRef.current === token;
    setSequencePlaying(true);
    for (const step of steps) {
      await request(step.pose);
      if (!live()) return;
      if (step.holdMs) {
        await sleep(step.holdMs);
        if (!live()) return;
      }
    }
    setSequencePlaying(false);
  }, [ready, request, sleep]);

  const reset = useCallback(() => {
    generationRef.current += 1;
    sequenceRef.current += 1;
    for (const animation of animationsRef.current) animation.cancel();
    animationsRef.current.clear();
    for (const timer of timersRef.current) {
      clearTimeout(timer.id);
      timer.resolve();
    }
    timersRef.current.clear();
    if (rigRef.current) showOnly('idle');
    poseRef.current = 'idle';
    targetRef.current = 'idle';
    pumpRef.current = null;
    setPose('idle');
    setTarget('idle');
    setBusy(false);
    setCardVisible(false);
    setSequencePlaying(false);
  }, [rigRef, showOnly]);

  useEffect(() => () => {
    generationRef.current += 1;
    for (const animation of animationsRef.current) animation.cancel();
    for (const timer of timersRef.current) clearTimeout(timer.id);
  }, []);

  return { pose, target, busy, cardVisible, sequencePlaying, goTo, playSequence, reset };
}
