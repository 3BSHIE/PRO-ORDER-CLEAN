import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { RENDERED_POSES, groundOrigin, ground, layersFor } from './rig.js';
import './ZaatarCharacter.css';

const posesFrom = (baseUrl) => Object.fromEntries(RENDERED_POSES.map((pose) => [pose, layersFor(pose, baseUrl)]));
const POSE_LAYERS = posesFrom();

/**
 * Renders every pose at once (only one visible) so pose swaps never wait on
 * a download or decode. Exposes the elements the director animates:
 *   motion – whole-body transforms (anticipation, settle)
 *   poses  – one element per pose, swapped by opacity
 *   cane   – the separable raised cane of the Suggesting pose
 * (forwardRef keeps it usable from React 18 as well as 19.)
 */
const ZaatarCharacter = forwardRef(function ZaatarCharacter({ initialPose = 'idle', assetBaseUrl, onReady, onError }, ref) {
  const motionRef = useRef(null);
  const poseRefs = useRef({});
  const caneRef = useRef(null);
  const rootRef = useRef(null);
  const poseLayers = useMemo(() => (assetBaseUrl ? posesFrom(assetBaseUrl) : POSE_LAYERS), [assetBaseUrl]);

  useImperativeHandle(ref, () => ({
    motion: motionRef.current,
    poses: poseRefs.current,
    cane: caneRef.current,
  }));

  useEffect(() => {
    let cancelled = false;
    const images = [...rootRef.current.querySelectorAll('img')];
    Promise.all(images.map((img) => img.decode()))
      .then(() => !cancelled && onReady?.())
      .catch((error) => !cancelled && onError?.(error));
    return () => {
      cancelled = true;
    };
  }, [poseLayers, onReady, onError]);

  return (
    <div className="zaatar" ref={rootRef}>
      <div
        className="zaatar__shadow"
        style={{ left: `${ground.x * 100}%`, top: `${ground.y * 100}%` }}
        aria-hidden="true"
      />
      <div className="zaatar__motion" ref={motionRef} style={{ transformOrigin: groundOrigin }}>
        <div className="zaatar__breath" style={{ transformOrigin: groundOrigin }}>
          {RENDERED_POSES.map((pose) => (
            <div
              key={pose}
              className="zaatar__pose"
              data-pose={pose}
              ref={(el) => {
                poseRefs.current[pose] = el;
              }}
              style={{ opacity: pose === initialPose ? 1 : 0 }}
            >
              {poseLayers[pose].map((layer) => (
                <img
                  key={layer.id}
                  className={`zaatar__layer zaatar__layer--${layer.id}`}
                  src={layer.src}
                  style={layer.style}
                  ref={layer.id === 'cane' ? caneRef : undefined}
                  alt=""
                  draggable="false"
                  decoding="async"
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

export default ZaatarCharacter;
