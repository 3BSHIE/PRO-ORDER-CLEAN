import { useCallback, useEffect, useRef, useState } from "react";

/**
 * usePrintReceipt — Phase 118.0. The print TRANSPORT, and nothing else.
 *
 * Deliberately knows nothing about bills, orders or money: it is handed a
 * prepared document model, mounts it, waits until it is genuinely drawable,
 * and asks the browser to print. That separation is what §26 asks for — a
 * future direct-print path replaces this file alone and reuses every
 * decision receiptModel already made.
 *
 * ── WHY NOT A POPUP OR AN IFRAME ─────────────────────────────────────────
 * A popup is blocked by default in the browsers a cashier actually uses, and
 * a cross-document iframe has to be handed fonts and stylesheets of its own.
 * Rendering the receipt inside this page and letting @media print hide the
 * application is the technique the table stand and the revenue report
 * already use here, and it has the property that matters most on a till:
 * the cashier's scroll position, filters and open cards are still exactly
 * where they were when the dialog closes (§27).
 *
 * ── WHY IT WAITS, AND ON WHAT ────────────────────────────────────────────
 * window.print() captures the document as it stands at that instant. Called
 * in the same tick as the state update that mounts the receipt, it captures
 * nothing — a blank job, which is the classic failure here.
 *
 * So it waits on two real signals, not a guessed delay:
 *   · two animation frames, so React has committed and layout has settled
 *   · every image in the document having decoded, so a configured logo is
 *     on the page rather than arriving halfway through the capture
 *
 * The timeout below is a safety net for a browser that never resolves an
 * image decode, not the readiness mechanism (§27). It is deliberately long
 * enough that it should never be what fires.
 */

/** Hard stop, so a stuck image can never leave the cashier waiting. */
const READY_TIMEOUT_MS = 3000;

function nextFrame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "function") { resolve(); return; }
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

/** Every image in the subtree, resolved or failed — a broken logo must not
    hold the dialog, and the document already renders without one. */
function imagesSettled(root) {
  if (!root) return Promise.resolve();
  const images = Array.from(root.querySelectorAll("img"));
  return Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      });
    })
  );
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
}

/**
 * @returns {{document:object|null, containerRef:object,
 *            printDocument:(model:object)=>void, error:boolean,
 *            clearError:()=>void}}
 */
export function usePrintReceipt() {
  const [document_, setDocument] = useState(null);
  const [error, setError] = useState(false);
  const containerRef = useRef(null);
  /* One print at a time. A second click while the dialog is open would
     otherwise queue a second job behind it (§27). */
  const busyRef = useRef(false);
  const mountedRef = useRef(true);

  /* Set on the way IN as well as cleared on the way out. React 18's
     development double-invoke mounts, unmounts and remounts: a ref that is
     only ever cleared stays false after that first simulated unmount, and
     every later "is this still mounted?" guard silently fails closed. Here
     that left the printed receipt in the DOM after the dialog closed. */
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const printDocument = useCallback((model) => {
    if (busyRef.current || !model) return;
    busyRef.current = true;
    setError(false);
    setDocument(model);
  }, []);

  useEffect(() => {
    if (!document_) return undefined;
    let cancelled = false;

    (async () => {
      await nextFrame();
      if (cancelled) return;
      await withTimeout(imagesSettled(containerRef.current), READY_TIMEOUT_MS);
      if (cancelled) return;

      try {
        /* Blocks until the dialog is dismissed in every browser this ships
           to. Whether the guest's paper actually came out is not something
           the web platform reports, and nothing here claims it did (§46). */
        window.print();
      } catch {
        if (mountedRef.current) setError(true);
      } finally {
        busyRef.current = false;
        /* Unmounted either way: cancelling the dialog leaves the page
           exactly as it was, with no receipt left in the DOM. */
        if (mountedRef.current) setDocument(null);
      }
    })();

    return () => { cancelled = true; busyRef.current = false; };
  }, [document_]);

  const clearError = useCallback(() => setError(false), []);

  return { document: document_, containerRef, printDocument, error, clearError };
}
