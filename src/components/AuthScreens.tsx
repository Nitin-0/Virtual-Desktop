import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, UserRound } from 'lucide-react';
import { useAuth } from '../context/authContext';
import { useOS } from '../context/OSContext';
import { findAccount, getLastUser } from '../os/accounts';
import { OS_NAME } from '../os/types';
import { useNow } from '../os/useNow';
import { messageOf } from '../os/util';

export function Avatar({ src, name, size = 88 }: { src?: string; name: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">
      {src ? <img src={src} alt="" /> : name ? name.slice(0, 1).toUpperCase() : <UserRound size={size * 0.5} />}
    </span>
  );
}

function Clock() {
  const now = useNow(1000);
  return (
    <div className="auth-clock" aria-hidden="true">
      <strong>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
      <span>{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span>
    </div>
  );
}

function PasswordField({ value, onChange, label, testId, autoFocus, autoComplete }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  testId: string;
  autoFocus?: boolean;
  autoComplete: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <span className="auth-pass">
      <input
        className="field"
        type={shown ? 'text' : 'password'}
        value={value}
        placeholder={label}
        aria-label={label}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        data-testid={testId}
        onChange={(event) => onChange(event.target.value)}
      />
      <button type="button" className="auth-eye" aria-label={shown ? 'Hide password' : 'Show password'} onClick={() => setShown(!shown)} tabIndex={-1}>
        {shown ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </span>
  );
}

function SignUp() {
  const { signUp, showLogin, hasAccounts } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      signUp(username, password, confirm);
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <form className="auth-card" onSubmit={submit} data-testid="auth-signup">
      <Avatar name={username} />
      <h1>{hasAccounts ? 'Create account' : `Welcome to ${OS_NAME}`}</h1>
      <p className="auth-sub">{hasAccounts ? 'Add another account on this browser.' : 'Create an account to start.'}</p>
      <input
        className="field"
        value={username}
        placeholder="Username"
        aria-label="Username"
        autoComplete="username"
        autoFocus
        maxLength={24}
        data-testid="auth-username"
        onChange={(event) => { setUsername(event.target.value); setError(''); }}
      />
      <PasswordField value={password} onChange={(v) => { setPassword(v); setError(''); }} label="Password" testId="auth-password" autoComplete="new-password" />
      <PasswordField value={confirm} onChange={(v) => { setConfirm(v); setError(''); }} label="Confirm password" testId="auth-confirm" autoComplete="new-password" />
      {error && <p className="auth-error" role="alert" data-testid="auth-error">{error}</p>}
      <button type="submit" className="btn btn-primary auth-submit" data-testid="auth-submit">Create account <ArrowRight size={15} /></button>
      {hasAccounts && <button type="button" className="auth-link" data-testid="auth-switch" onClick={showLogin}>I already have an account</button>}
      <p className="auth-note">Saved in this browser only. Passwords are stored as plain text here, so don’t reuse a real one.</p>
    </form>
  );
}

function SignIn() {
  const { logIn, showSignup } = useAuth();
  const [username, setUsername] = useState(() => getLastUser());
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const known = findAccount(username);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    if (!logIn(username, password)) {
      setError('Wrong username or password.');
      setPassword('');
    }
  };

  return (
    <form className="auth-card" onSubmit={submit} data-testid="auth-login">
      <Avatar src={known?.avatar} name={known?.username ?? ''} />
      <h1>{known ? known.username : 'Sign in'}</h1>
      <input
        className="field"
        value={username}
        placeholder="Username"
        aria-label="Username"
        autoComplete="username"
        autoFocus={!username}
        data-testid="auth-username"
        onChange={(event) => { setUsername(event.target.value); setError(''); }}
      />
      <PasswordField value={password} onChange={(v) => { setPassword(v); setError(''); }} label="Password" testId="auth-password" autoComplete="current-password" autoFocus={!!username} />
      {error && <p className="auth-error" role="alert" data-testid="auth-error">{error}</p>}
      <button type="submit" className="btn btn-primary auth-submit" data-testid="auth-submit">Sign in <ArrowRight size={15} /></button>
      <button type="button" className="auth-link" data-testid="auth-switch" onClick={showSignup}>Create account</button>
    </form>
  );
}

function Locked() {
  const { account, unlock, logOut } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!unlock(password)) {
      setError('Wrong password.');
      setPassword('');
    }
  };

  return (
    <form className="auth-card" onSubmit={submit} data-testid="auth-locked">
      <Avatar src={account?.avatar} name={account?.username ?? ''} />
      <h1>{account?.username}</h1>
      <p className="auth-sub">Locked. Your windows are still open.</p>
      <PasswordField value={password} onChange={(v) => { setPassword(v); setError(''); }} label="Password" testId="auth-password" autoComplete="current-password" autoFocus />
      {error && <p className="auth-error" role="alert" data-testid="auth-error">{error}</p>}
      <button type="submit" className="btn btn-primary auth-submit" data-testid="auth-submit">Unlock <ArrowRight size={15} /></button>
      <button type="button" className="auth-link" onClick={() => { void logOut(); }}>Sign in as someone else</button>
    </form>
  );
}

function Asleep() {
  const { wake } = useAuth();
  useEffect(() => {
    // Listen from the next tick so the click that chose Sleep does not wake it.
    const timer = window.setTimeout(() => {
      window.addEventListener('keydown', wake);
      window.addEventListener('pointerdown', wake);
    }, 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', wake);
      window.removeEventListener('pointerdown', wake);
    };
  }, [wake]);
  return (
    <div className="sleep-screen" data-testid="sleep-screen" role="dialog" aria-label="Asleep. Press any key or click to wake.">
      <Clock />
      <p>Press any key or click to wake</p>
    </div>
  );
}

/** Covers the desktop whenever nobody is signed in, or the session is locked or asleep. */
export function AuthScreens() {
  const { booted } = useOS();
  const { phase } = useAuth();
  if (!booted || phase === 'active') return null;
  if (phase === 'asleep') return <Asleep />;
  return (
    <div className="auth" data-testid="auth-screen" role="dialog" aria-modal="true" aria-label={phase === 'locked' ? 'Locked' : 'Sign in'}>
      <Clock />
      {phase === 'signup' && <SignUp />}
      {phase === 'login' && <SignIn />}
      {phase === 'locked' && <Locked />}
    </div>
  );
}
