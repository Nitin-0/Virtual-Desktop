import { useRef, useState, type FormEvent } from 'react';
import { Lock, LogOut, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../context/authContext';
import { useOS } from '../context/OSContext';
import { avatarFromFile } from '../os/accounts';
import { formatWhen, messageOf } from '../os/util';
import { Avatar } from '../components/AuthScreens';

export function AccountSettings() {
  const { account, updateAvatar, changePassword, lock, logOut } = useAuth();
  const { notify } = useOS();
  const fileRef = useRef<HTMLInputElement>(null);
  const [picError, setPicError] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passMsg, setPassMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!account) return null;

  const pick = async (file: File | undefined) => {
    setPicError('');
    if (!file) return;
    try {
      updateAvatar(await avatarFromFile(file));
      notify({ title: 'Profile picture updated', kind: 'ok' });
    } catch (err) {
      setPicError(messageOf(err));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const savePassword = (event: FormEvent) => {
    event.preventDefault();
    try {
      changePassword(current, next, confirm);
      setCurrent('');
      setNext('');
      setConfirm('');
      setPassMsg({ ok: true, text: 'Password changed.' });
    } catch (err) {
      setPassMsg({ ok: false, text: messageOf(err) });
    }
  };

  return (
    <div className="account-settings">
      <div className="account-card">
        <Avatar src={account.avatar} name={account.username} size={72} />
        <div className="account-meta">
          <strong data-testid="account-name">{account.username}</strong>
          <span>Account on this browser · created {formatWhen(account.createdAt)}</span>
          <div className="row-gap account-pic-actions">
            <button type="button" className="btn btn-primary" data-testid="avatar-upload" onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> {account.avatar ? 'Change picture' : 'Add picture'}
            </button>
            {account.avatar && (
              <button type="button" className="btn btn-ghost" data-testid="avatar-remove" onClick={() => updateAvatar(null)}>
                <Trash2 size={14} /> Remove
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden data-testid="avatar-file" onChange={(event) => { void pick(event.target.files?.[0]); }} />
          </div>
          {picError && <p className="dialog-error">{picError}</p>}
        </div>
      </div>
      <p className="hint">The picture is cropped to a square and shown on the sign-in screen and in the menu.</p>

      <form className="account-pass" onSubmit={savePassword}>
        <p className="theme-group-title">Change password</p>
        <input className="field" type="password" value={current} placeholder="Current password" aria-label="Current password" autoComplete="current-password" data-testid="pass-current" onChange={(event) => { setCurrent(event.target.value); setPassMsg(null); }} />
        <input className="field" type="password" value={next} placeholder="New password" aria-label="New password" autoComplete="new-password" data-testid="pass-new" onChange={(event) => { setNext(event.target.value); setPassMsg(null); }} />
        <input className="field" type="password" value={confirm} placeholder="Confirm new password" aria-label="Confirm new password" autoComplete="new-password" data-testid="pass-confirm" onChange={(event) => { setConfirm(event.target.value); setPassMsg(null); }} />
        {passMsg && <p className={passMsg.ok ? 'pass-ok' : 'dialog-error'} data-testid="pass-msg">{passMsg.text}</p>}
        <button type="submit" className="btn btn-primary" data-testid="pass-save" disabled={!current || !next || !confirm}>Change password</button>
      </form>

      <div className="row-gap account-session">
        <button type="button" className="btn btn-ghost" onClick={lock}><Lock size={14} /> Lock</button>
        <button type="button" className="btn btn-ghost" onClick={() => { void logOut(); }}><LogOut size={14} /> Log out</button>
      </div>
      <p className="hint">Accounts are saved in this browser only, and all accounts here share the same files and settings. Passwords are stored as plain text and cannot be recovered, so don’t reuse a real one.</p>
    </div>
  );
}
