import { useEffect, useState } from 'react';

type Op = '+' | '-' | '×' | '÷' | null;

function compute(left: number, op: Op, right: number): number | string {
  if (op === '+') return left + right;
  if (op === '-') return left - right;
  if (op === '×') return left * right;
  if (op === '÷') {
    if (right === 0) return 'Cannot divide by zero';
    return left / right;
  }
  return right;
}

function formatResult(value: number): string {
  if (!Number.isFinite(value)) return 'Error';
  const text = String(Math.round(value * 1e10) / 1e10);
  return text.length > 14 ? value.toExponential(6) : text;
}

export function CalculatorApp({ windowId }: { windowId: string }) {
  const [display, setDisplay] = useState('0');
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op>(null);
  const [fresh, setFresh] = useState(true);
  const [error, setError] = useState(false);

  const inputDigit = (digit: string) => {
    if (error) return;
    setDisplay((current) => {
      if (fresh) {
        setFresh(false);
        return digit === '.' ? '0.' : digit;
      }
      if (digit === '.' && current.includes('.')) return current;
      if (current === '0' && digit !== '.') return digit;
      if (current.replace('-', '').length >= 14) return current;
      return current + digit;
    });
  };

  const chooseOp = (next: Op) => {
    if (error || !next) return;
    const value = Number(display);
    if (acc != null && op && !fresh) {
      const result = compute(acc, op, value);
      if (typeof result === 'string') {
        setDisplay(result);
        setError(true);
        setAcc(null);
        setOp(null);
        return;
      }
      setAcc(result);
      setDisplay(formatResult(result));
    } else {
      setAcc(value);
    }
    setOp(next);
    setFresh(true);
  };

  const equals = () => {
    if (error || acc == null || !op) return;
    const result = compute(acc, op, Number(display));
    if (typeof result === 'string') {
      setDisplay(result);
      setError(true);
      setAcc(null);
      setOp(null);
      return;
    }
    setDisplay(formatResult(result));
    setAcc(null);
    setOp(null);
    setFresh(true);
  };

  const clear = () => {
    setDisplay('0');
    setAcc(null);
    setOp(null);
    setFresh(true);
    setError(false);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const active = document.querySelector('.window.is-focused');
      if (!active || active.getAttribute('data-window-id') !== windowId) return;
      if (event.key >= '0' && event.key <= '9') inputDigit(event.key);
      else if (event.key === '.') inputDigit('.');
      else if (event.key === '+') chooseOp('+');
      else if (event.key === '-') chooseOp('-');
      else if (event.key === '*') chooseOp('×');
      else if (event.key === '/') {
        event.preventDefault();
        chooseOp('÷');
      } else if (event.key === 'Enter' || event.key === '=') {
        event.preventDefault();
        equals();
      } else if (event.key === 'Backspace') {
        setDisplay((current) => (fresh || current.length <= 1 ? '0' : current.slice(0, -1)));
        setFresh(false);
      } else if (event.key === 'Escape') clear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const keys: { label: string; action: () => void; kind?: string }[] = [
    { label: 'C', action: clear, kind: 'muted' },
    { label: '±', action: () => { if (!error) setDisplay((current) => current.startsWith('-') ? current.slice(1) || '0' : current === '0' ? '0' : `-${current}`); }, kind: 'muted' },
    { label: '%', action: () => { if (!error) { const n = Number(display) / 100; setDisplay(formatResult(n)); setFresh(true); } }, kind: 'muted' },
    { label: '÷', action: () => chooseOp('÷'), kind: 'op' },
    { label: '7', action: () => inputDigit('7') },
    { label: '8', action: () => inputDigit('8') },
    { label: '9', action: () => inputDigit('9') },
    { label: '×', action: () => chooseOp('×'), kind: 'op' },
    { label: '4', action: () => inputDigit('4') },
    { label: '5', action: () => inputDigit('5') },
    { label: '6', action: () => inputDigit('6') },
    { label: '−', action: () => chooseOp('-'), kind: 'op' },
    { label: '1', action: () => inputDigit('1') },
    { label: '2', action: () => inputDigit('2') },
    { label: '3', action: () => inputDigit('3') },
    { label: '+', action: () => chooseOp('+'), kind: 'op' },
    { label: '0', action: () => inputDigit('0'), kind: 'wide' },
    { label: '.', action: () => inputDigit('.') },
    { label: '=', action: equals, kind: 'eq' },
  ];

  return (
    <div className="calc">
      <div className="calc-display" data-testid="calc-display">
        <span>{op ?? ''}</span>
        <strong>{display}</strong>
      </div>
      <div className="calc-keys">
        {keys.map((key) => (
          <button key={key.label} type="button" className={`calc-key ${key.kind ?? ''}`} onClick={key.action}>
            {key.label}
          </button>
        ))}
      </div>
    </div>
  );
}
