import type { ReactNode } from 'react';

type ModalSize = 'default' | 'wide' | 'xl' | 'xxl';

interface ModalShellProps {
  onClose: () => void;
  size?: ModalSize;
  cardClassName?: string;
  bodyClassName?: string;
  children: ReactNode;
}

function buildClassName(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function getSizeClass(size: ModalSize): string {
  if (size === 'wide') {
    return 'modal-wide';
  }
  if (size === 'xl') {
    return 'modal-xl';
  }
  if (size === 'xxl') {
    return 'modal-xxl';
  }
  return '';
}

export function ModalShell({
  onClose,
  size = 'default',
  cardClassName,
  bodyClassName,
  children
}: ModalShellProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={buildClassName(['modal-card', getSizeClass(size), cardClassName])} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close-icon" onClick={onClose} aria-label="Close">
          {'\u00D7'}
        </button>
        <div className={buildClassName(['modal-scroll-body', bodyClassName])}>{children}</div>
      </div>
    </div>
  );
}
