'use client';

import { useEffect, useRef } from 'react';

/**
 * The bottom sheet every detail and write surface sits in.
 *
 * Built on native <dialog>.showModal(), which supplies the focus trap, the inert
 * background, Escape-to-close and the ::backdrop — all of which a div-based sheet has to
 * reimplement, and usually reimplements incompletely. What is added here is only the
 * things <dialog> does not do: closing on a backdrop click, and not closing on a
 * click that started inside and drifted out (a star drag released past the sheet edge
 * would otherwise dismiss the sheet mid-rating).
 */
export default function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedInside = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onPointerDown={(e) => {
        pressedInside.current = e.target !== ref.current;
      }}
      onClick={(e) => {
        // e.target is the dialog itself only when the click landed on the backdrop.
        if (e.target === ref.current && !pressedInside.current) onClose();
        pressedInside.current = false;
      }}
    >
      <div className="sheet-body">
        <div className="sheet-grip" aria-hidden="true" />
        {children}
      </div>
    </dialog>
  );
}
