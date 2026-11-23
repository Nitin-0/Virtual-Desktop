import { useEffect, useRef, useState } from 'react';
import { useOS } from '../context/OSContext';
import { completeLine, loadHistory, pushHistory, runCommand } from '../os/terminal';
import { uid } from '../os/util';
import { onVfsChange } from '../os/vfs';
import { allThemes } from '../os/themes';

interface TermLine {
  id: string;
  kind: 'in' | 'out' | 'err' | 'sys';
  text: string;
}

export function TerminalApp({ windowId, initialCwd }: { windowId: string; initialCwd?: string }) {
  const { settings, updateSettings, openApp, setWindowTitle, activeId } = useOS();
  const [cwd, setCwd] = useState(initialCwd || '/Home');
  const [lines, setLines] = useState<TermLine[]>([
    { id: uid(), kind: 'sys', text: 'AINCRAD TERMINAL  ·  virtual archive (IndexedDB)' },
    { id: uid(), kind: 'sys', text: 'Not a shell on your computer. Commands use the same archive as Inventory.' },
    { id: uid(), kind: 'sys', text: 'Type help for commands.' },
  ]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>(() => loadHistory());
  const [histIndex, setHistIndex] = useState(-1);
  const draftRef = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cwdRef = useRef(cwd);
  const selfRef = useRef(0);
  const notedRef = useRef(false);
  cwdRef.current = cwd;

  useEffect(() => {
    setWindowTitle(windowId, `Terminal — ${cwd}`);
  }, [cwd, setWindowTitle, windowId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  useEffect(() => {
    if (activeId === windowId) inputRef.current?.focus();
  }, [activeId, windowId]);

  useEffect(() => onVfsChange(() => {
    if (selfRef.current > 0 || notedRef.current) return;
    notedRef.current = true;
    setLines((prev) => [...prev, { id: uid(), kind: 'sys', text: 'archive updated elsewhere — run ls or cat to see it' }]);
  }), []);

  const append = (kind: TermLine['kind'], text: string) => {
    if (!text && kind !== 'in') return;
    setLines((prev) => [...prev, { id: uid(), kind, text }]);
  };

  const execute = async (raw: string) => {
    const command = raw.trim();
    append('in', `${settings.username}@aincrad:${cwdRef.current}$ ${raw}`);
    if (!command) return;
    const nextHistory = pushHistory(command);
    setHistory(nextHistory);
    setHistIndex(-1);
    draftRef.current = '';
    notedRef.current = false;
    selfRef.current += 1;
    try {
      const result = await runCommand(command, {
        getCwd: () => cwdRef.current,
        setCwd: (path) => {
          cwdRef.current = path;
          setCwd(path);
        },
        getUsername: () => settings.username,
        getTheme: () => settings.theme,
        getWallpaper: () => settings.wallpaper,
        getThemes: () => allThemes(settings.customThemes),
        setTheme: (theme) => updateSettings({ theme }),
        launch: (appId, payload) => {
          openApp(appId, payload, { forceNew: true });
        },
      });
      if (result.clear) {
        setLines([]);
        return;
      }
      if (result.output) append(result.error ? 'err' : 'out', result.output);
    } finally {
      selfRef.current = Math.max(0, selfRef.current - 1);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'l' && event.ctrlKey) {
      event.preventDefault();
      setLines([]);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!history.length) return;
      if (histIndex === -1) {
        draftRef.current = input;
        const next = history.length - 1;
        setHistIndex(next);
        setInput(history[next] ?? '');
      } else if (histIndex > 0) {
        const next = histIndex - 1;
        setHistIndex(next);
        setInput(history[next] ?? '');
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (histIndex === -1) return;
      if (histIndex < history.length - 1) {
        const next = histIndex + 1;
        setHistIndex(next);
        setInput(history[next] ?? '');
      } else {
        setHistIndex(-1);
        setInput(draftRef.current);
      }
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      void completeLine(input, cwdRef.current).then((result) => {
        setInput(result.line);
        if (result.matches.length > 1) {
          append('sys', result.matches.join('   '));
        }
      });
    }
  };

  return (
    <div className="term" onMouseDown={() => {
      window.setTimeout(() => {
        if (!window.getSelection()?.toString()) inputRef.current?.focus();
      }, 0);
    }}>
      <div className="term-scroll" ref={scrollRef} data-testid="terminal-output">
        {lines.map((line) => (
          <pre key={line.id} className={`term-line is-${line.kind}`}>{line.text}</pre>
        ))}
      </div>
      <form
        className="term-input-row"
        onSubmit={(event) => {
          event.preventDefault();
          const value = input;
          setInput('');
          void execute(value);
        }}
      >
        <span className="term-prompt">{settings.username}@aincrad:{cwd}$</span>
        <input
          ref={inputRef}
          className="term-input"
          data-testid="terminal-input"
          value={input}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Terminal command"
          onChange={(event) => {
            setInput(event.target.value);
            setHistIndex(-1);
          }}
          onKeyDown={onKeyDown}
        />
      </form>
    </div>
  );
}
