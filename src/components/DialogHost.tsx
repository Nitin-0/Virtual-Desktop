import { useEffect, useRef, useState } from 'react';
import { Check, Trash2, X } from 'lucide-react';
import { useOS } from '../context/OSContext';

export function DialogHost() {
  const { dialog, settleDialog } = useOS();
  const [value, setValue] = useState('');
  const [localError, setLocalError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!dialog) return;
    setValue(dialog.defaultValue ?? '');
    setLocalError('');
    const timer = window.setTimeout(() => {
      if (dialog.kind === 'prompt') inputRef.current?.select();
      else if (dialog.danger) cancelRef.current?.focus();
      else confirmRef.current?.focus();
    }, 20);
    return () => window.clearTimeout(timer);
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        settleDialog(dialog.kind === 'alert' ? true : null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dialog, settleDialog]);

  if (!dialog) return null;

  const confirm = () => {
    if (dialog.kind === 'prompt') {
      if (!value.trim()) {
        setLocalError('Enter a value, or cancel.');
        return;
      }
      settleDialog(value.trim());
      return;
    }
    settleDialog(true);
  };

  return (
    <div className="dialog-back" role="presentation" onMouseDown={() => settleDialog(dialog.kind === 'alert' ? true : null)}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        data-testid="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="dialog-title">{dialog.title}</h2>
        <div className="dialog-rule" />
        {dialog.message && <p className="dialog-message">{dialog.message}</p>}
        {dialog.kind === 'prompt' && (
          <input
            ref={inputRef}
            className="field"
            data-testid="dialog-input"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setLocalError('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                confirm();
              }
            }}
          />
        )}
        {localError && <p className="dialog-error">{localError}</p>}
        <div className="dialog-actions sao-controls">
          {dialog.kind !== 'alert' && (
            <button ref={cancelRef} type="button" className="sao-choice" onClick={() => settleDialog(null)} data-testid="dialog-cancel">
              <span className="sao-ctrl is-cancel" aria-hidden="true"><X size={16} /></span>
              <span className="sao-label">{dialog.cancelLabel ?? 'Cancel'}</span>
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            className="sao-choice"
            onClick={confirm}
            data-testid="dialog-confirm"
          >
            <span className={`sao-ctrl ${dialog.danger ? 'is-danger' : 'is-yes'}`} aria-hidden="true">
              {dialog.danger ? (/delet|erase|empty/i.test(dialog.confirmLabel ?? '') ? <Trash2 size={16} /> : <Check size={16} />) : <span className="sao-dot" />}
            </span>
            <span className="sao-label">{dialog.confirmLabel ?? 'OK'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
