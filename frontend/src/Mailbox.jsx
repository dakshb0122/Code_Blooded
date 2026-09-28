// Purpose: restore the original à¤ˆMAIL dashboard using the authenticated ईMAIL mailbox API.

import { useEffect, useMemo, useRef, useState } from 'react';
import { requestApi } from './api.js';
import PasswordInput from './PasswordInput.jsx';
import './LegacyMailbox.css';
import './MailboxEnhancements.css';

/** Keep the folder order aligned with the original à¤ˆMAIL sidebar. */
const FOLDERS = [
  { id: 'archive', label: 'Archive', icon: '\u25a4' },
  { id: 'inbox', label: 'Inbox', icon: '\u2709' },
  { id: 'unread', label: 'Unread', icon: '\u25cf' },
  { id: 'starred', label: 'Starred', icon: '\u2605' },
  { id: 'sent', label: 'Sent', icon: '\u2197' },
  { id: 'draft', label: 'Drafts', icon: '\u270e' },
  { id: 'trash', label: 'Trash', icon: '\u232b' },
];

/** Keep AI language labels aligned with the API's supported language list. */
const AI_LANGUAGES = [
  'Arabic', 'Bengali', 'English', 'French', 'German', 'Gujarati', 'Hindi',
  'Japanese', 'Kannada', 'Malayalam', 'Marathi', 'Punjabi', 'Spanish', 'Tamil', 'Telugu', 'Urdu',
];

/** Display a concise local time in the message list and reader. */
function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

/** Select the correspondent label shown in a message row. */
function otherParty(message, folder, userAddress) {
  if (folder === 'sent' || message.sender === userAddress) return `To: ${message.recipients.join(', ')}`;
  return message.sender;
}

/** Crop and compress one selected image to a small square profile picture. */
async function prepareProfileImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > 12 * 1024 * 1024) throw new Error('Choose an image smaller than 12 MB.');

  const bitmap = await createImageBitmap(file);
  const cropSize = Math.min(bitmap.width, bitmap.height);
  const offsetX = Math.floor((bitmap.width - cropSize) / 2);
  const offsetY = Math.floor((bitmap.height - cropSize) / 2);
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 320;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not prepare the selected image.');
  context.drawImage(bitmap, offsetX, offsetY, cropSize, cropSize, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const compressedImage = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error('This browser could not compress the selected image.'));
    }, 'image/webp', 0.84);
  });
  if (compressedImage.size > 350 * 1024) throw new Error('Choose a simpler or smaller image.');
  return compressedImage;
}

/** Render the user's prior à¤ˆMAIL design with live internal mailbox data. */
export default function Mailbox({ user, onSignOut, onAccountChanged, onAccountDeleted, busy, language = 'en' }) {
  const [folder, setFolder] = useState('inbox');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [composer, setComposer] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [accountPhone, setAccountPhone] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [showAccountPassword, setShowAccountPassword] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState('');
  const [showDeleteAccountPassword, setShowDeleteAccountPassword] = useState(false);
  const [deleteAccountConfirmation, setDeleteAccountConfirmation] = useState('');
  const [deleteAccountError, setDeleteAccountError] = useState('');
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false);
  const [deleteAccountComplete, setDeleteAccountComplete] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? '');
  const [profilePictureBusy, setProfilePictureBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState({ configured: false, model: 'openrouter/free' });
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [translatorOpen, setTranslatorOpen] = useState(false);
  const [translationInput, setTranslationInput] = useState('');
  const [translationResult, setTranslationResult] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('Hindi');
  const [replySuggestions, setReplySuggestions] = useState([]);
  const profilePictureInput = useRef(null);
  const attachmentInput = useRef(null);
  const photoInput = useRef(null);
  const lastLogoTrailAt = useRef(0);

  /** Create a brief pixel-sparkle trail around the logo as the pointer passes over it. */
  function createLogoPixelTrail(event) {
    if (event.pointerType === 'touch') return;
    const now = performance.now();
    if (now - lastLogoTrailAt.current < 55) return;
    lastLogoTrailAt.current = now;

    /** Measure the logo link so each particle stays within its visual bounds. */
    const logoBounds = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - logoBounds.left;
    const pointerY = event.clientY - logoBounds.top;
    const pixelColors = ['#f26a5e', '#ffcf9b', '#fff8ed'];
    for (let index = 0; index < pixelColors.length; index += 1) {
      const pixel = document.createElement('span');
      pixel.className = 'logo-pixel';
      pixel.style.left = `${pointerX + (index - 1) * 5}px`;
      pixel.style.top = `${pointerY + ((index % 2) * 4)}px`;
      pixel.style.setProperty('--pixel-color', pixelColors[index]);
      pixel.style.setProperty('--pixel-drift-x', `${(index - 1) * 7}px`);
      pixel.style.setProperty('--pixel-drift-y', `${-12 - index * 3}px`);
      event.currentTarget.append(pixel);
      pixel.addEventListener('animationend', () => pixel.remove(), { once: true });
    }
  }

  /** Load the selected mailbox folder from MongoDB-backed API storage. */
  async function refreshMailbox() {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ folder, search });
      const result = await requestApi(`/mail/messages?${query}`);
      setMessages(result.messages);
      setSelectedIds((current) => current.filter((id) => result.messages.some((message) => message.id === id)));
      setSelectedMessage((current) => {
        if (!current) return null;
        const refreshedMessage = result.messages.find((message) => message.id === current.id);
        return refreshedMessage ? { ...refreshedMessage, body: current.body } : null;
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refreshMailbox(); }, [folder, search]);

  useEffect(() => {
    requestApi('/ai/status')
      .then(setAiStatus)
      .catch(() => setAiStatus({ configured: false, model: 'openrouter/free' }));
  }, []);

  /** Show a brief status toast for the same interactions supported in the original UI. */
  function showToast(message) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  }

  /** Save a compressed profile picture to the signed-in user's account. */
  async function updateProfilePicture(event) {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';
    if (!selectedFile) return;

    setProfilePictureBusy(true);
    try {
      const image = await prepareProfileImage(selectedFile);
      const result = await requestApi('/profile/picture', { method: 'PUT', body: image });
      setAvatarUrl(result.avatarUrl);
      showToast('Profile picture updated');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setProfilePictureBusy(false);
    }
  }

  /** Open the translator with optional text from the message currently being read. */
  function openTranslator(text = '') {
    setAiError('');
    setTranslationInput(text);
    setTranslationResult('');
    setTranslatorOpen(true);
  }

  /** Translate user-selected text using the chosen target language. */
  async function translateText(event) {
    event.preventDefault();
    setAiBusy(true);
    setAiError('');
    try {
      const result = await requestApi('/ai/translate', {
        method: 'POST',
        body: JSON.stringify({ text: translationInput, targetLanguage }),
      });
      setTranslationResult(result.translation);
    } catch (requestError) {
      setAiError(requestError.message);
    } finally {
      setAiBusy(false);
    }
  }

  /** Request three optional replies for the message the user explicitly opened. */
  async function generateReplySuggestions() {
    if (!selectedMessage) return;
    setAiBusy(true);
    setAiError('');
    try {
      const result = await requestApi('/ai/replies', {
        method: 'POST',
        body: JSON.stringify({ text: `${selectedMessage.subject}\n\n${selectedMessage.body}` }),
      });
      setReplySuggestions(result.replies);
    } catch (requestError) {
      setAiError(requestError.message);
    } finally {
      setAiBusy(false);
    }
  }

  /** Open a reply composer prefilled with a suggested response for the selected message. */
  function useReplySuggestion(reply) {
    if (!selectedMessage) return;
    const message = selectedMessage;
    replyTo(message);
    setComposer((current) => current ? { ...current, body: reply } : current);
    setReplySuggestions([]);
  }

  /** Fetch a message body and mark an inbox copy as read when it is opened. */
  async function openMessage(message) {
    setSelectedMessage(null);
    setComposer(null);
    setReplySuggestions([]);
    try {
      const detail = await requestApi(`/mail/messages/${message.id}`);
      let openedMessage = detail.message;
      if ((folder === 'inbox' || folder === 'unread') && !openedMessage.isRead) {
        const result = await requestApi(`/mail/messages/${message.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ isRead: true }),
        });
        openedMessage = result.message;
        setMessages((current) => folder === 'unread'
          ? current.filter((item) => item.id !== message.id)
          : current.map((item) => item.id === message.id ? { ...item, isRead: true } : item));
      }
      setSelectedMessage(openedMessage);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  /** Fetch a draft body and open it in the original compose dialog. */
  async function editDraft(message) {
    try {
      const detail = await requestApi(`/mail/messages/${message.id}`);
      const draft = detail.message;
      setSelectedMessage(null);
      setComposer({ id: draft.id, to: draft.recipients.join(', '), subject: draft.subject, body: draft.body, attachments: draft.attachments ?? [] });
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  /** Apply per-user read, starred, archive, or trash state to one message. */
  async function updateMessage(message, changes) {
    try {
      const result = await requestApi(`/mail/messages/${message.id}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      });
      setSelectedMessage(result.message);
      await refreshMailbox();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  /** Permanently delete a message only when it is already in Trash. */
  async function deleteMessage(message) {
    try {
      if (folder === 'trash') {
        await requestApi(`/mail/messages/${message.id}`, { method: 'DELETE' });
        showToast('Message permanently deleted');
      } else {
        await requestApi(`/mail/messages/${message.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ folder: 'trash' }),
        });
        showToast('Message moved to Trash');
      }
      setSelectedMessage(null);
      await refreshMailbox();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  /** Toggle whether all currently listed messages are selected. */
  function toggleAllMessages() {
    setSelectedIds(selectedIds.length === messages.length ? [] : messages.map((message) => message.id));
  }

  /** Toggle one message's bulk-action selection. */
  function toggleMessageSelection(messageId) {
    setSelectedIds((current) => current.includes(messageId)
      ? current.filter((id) => id !== messageId)
      : [...current, messageId]);
  }

  /** Apply archive or trash to the messages selected in the list. */
  async function applyBulkAction(destination) {
    try {
      await Promise.all(selectedIds.map((id) => requestApi(`/mail/messages/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ folder: destination }),
      })));
      setSelectedIds([]);
      showToast(destination === 'archive' ? 'Messages archived' : 'Messages moved to Trash');
      await refreshMailbox();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  /** Open a blank compose dialog from the sidebar or quick-action cards. */
  function composeNew() {
    setSelectedMessage(null);
    setNotice('');
    setAiError('');
    setComposer({ id: null, to: '', subject: '', body: '', attachments: [] });
  }

  /** Upload selected compose attachments to the authenticated GridFS endpoint. */
  async function addAttachments(event) {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!selectedFiles.length) return;
    const uploadedAttachments = [];
    try {
      const existing = composer.attachments ?? [];
      if (existing.length + selectedFiles.length > 5) throw new Error('Attach up to 5 files per message.');
      const oversized = selectedFiles.find((file) => file.size > 15 * 1024 * 1024);
      if (oversized) throw new Error(`${oversized.name} is larger than 15 MB.`);
      const newFiles = [];
      for (const file of selectedFiles) {
        const result = await requestApi(`/mail/attachments?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
        newFiles.push(result.attachment);
        uploadedAttachments.push(result.attachment);
      }
      setComposer((current) => ({ ...current, attachments: [...(current.attachments ?? []), ...newFiles] }));
      setError('');
    } catch (attachmentError) {
      await Promise.allSettled(uploadedAttachments.map((attachment) => requestApi(`/mail/attachments/${attachment.id}`, { method: 'DELETE' })));
      setError(attachmentError.message);
    }
  }

  /** Close the compose window and clean up any uploads that were never saved. */
  function closeComposer() {
    const attachments = composer?.attachments ?? [];
    setComposer(null);
    Promise.allSettled(attachments.map((attachment) => requestApi(`/mail/attachments/${attachment.id}`, { method: 'DELETE' })));
  }

  /** Remove an attachment from the compose view and discard it if no saved draft references it. */
  function removeAttachment(attachment, index) {
    setComposer((current) => ({ ...current, attachments: current.attachments.filter((_, fileIndex) => fileIndex !== index) }));
    requestApi(`/mail/attachments/${attachment.id}`, { method: 'DELETE' }).catch(() => {});
  }

  /** Authenticate another existing ईMAIL account and switch the active mailbox session. */
  async function addAccount(event) {
    event.preventDefault();
    setAccountBusy(true);
    setAccountError('');
    try {
      const result = await requestApi('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: accountPhone, password: accountPassword }),
      });
      onAccountChanged?.(result.user);
      setAvatarUrl(result.user.avatarUrl ?? '');
      setAccountPassword('');
      setAccountPhone('');
      setAddAccountOpen(false);
      setSettingsOpen(false);
      setFolder('inbox');
      setSelectedMessage(null);
      setSelectedIds([]);
      showToast(`Switched to ${result.user.emailAddress}`);
      await refreshMailbox();
    } catch (requestError) {
      setAccountError(requestError.message);
    } finally {
      setAccountBusy(false);
    }
  }

  /** Permanently remove this account after the user re-enters its password and address. */
  async function deleteCurrentAccount(event) {
    event.preventDefault();
    setDeleteAccountBusy(true);
    setDeleteAccountError('');
    try {
      await requestApi('/auth/account', {
        method: 'DELETE',
        body: JSON.stringify({ password: deleteAccountPassword, confirmEmail: deleteAccountConfirmation }),
      });
      setDeleteAccountComplete(true);
      setDeleteAccountPassword('');
      setDeleteAccountConfirmation('');
    } catch (requestError) {
      setDeleteAccountError(requestError.message);
    } finally {
      setDeleteAccountBusy(false);
    }
  }

  /** Start a reply addressed to the sender of the selected internal message. */
  function replyTo(message) {
    const subject = message.subject.startsWith('Re: ') ? message.subject : `Re: ${message.subject}`;
    setComposer({
      id: null,
      to: message.sender,
      subject,
      body: `\n\nOn ${formatDate(message.sentAt)}, ${message.sender} wrote:\n${message.body}`,
      attachments: [],
    });
    setSelectedMessage(null);
  }

  /** Save an incomplete compose form as a draft in the signed-in user's mailbox. */
  async function saveDraft(event) {
    event.preventDefault();
    const payload = {
      to: composer.to.split(',').map((address) => address.trim()).filter(Boolean),
      subject: composer.subject,
      body: composer.body,
      attachments: composer.attachments ?? [],
    };
    try {
      const result = composer.id
        ? await requestApi(`/mail/drafts/${composer.id}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await requestApi('/mail/drafts', { method: 'POST', body: JSON.stringify(payload) });
      setComposer({ ...composer, id: result.draft.id });
      showToast('Draft saved');
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  /** Send a new message or saved draft to existing ईMAIL @niti accounts only. */
  async function sendMessage(event) {
    event.preventDefault();
    const payload = {
      to: composer.to.split(',').map((address) => address.trim()).filter(Boolean),
      subject: composer.subject,
      body: composer.body,
      attachments: composer.attachments ?? [],
    };
    try {
      if (composer.id) {
        await requestApi(`/mail/drafts/${composer.id}/send`, { method: 'POST', body: JSON.stringify(payload) });
      } else {
        await requestApi('/mail/messages', { method: 'POST', body: JSON.stringify(payload) });
      }
      setComposer(null);
      setFolder('sent');
      showToast('Message delivered inside ईMAIL');
      await refreshMailbox();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const unreadCount = useMemo(() => messages.filter((message) => !message.isRead).length, [messages]);
  const allSelected = messages.length > 0 && selectedIds.length === messages.length;
  const currentFolder = FOLDERS.find((item) => item.id === folder);

  return (
    <div className="app">
      {mobileSidebarOpen && <button className="sidebar-backdrop" type="button" aria-label="Close mailspace menu" onClick={() => setMobileSidebarOpen(false)} />}
      <aside id="mail-sidebar" className={`sidebar${mobileSidebarOpen ? ' sidebar-open' : ''}`}>
        <button className="sidebar-close" type="button" aria-label="Close mailspace menu" onClick={() => setMobileSidebarOpen(false)}>{String.fromCodePoint(0x00d7)}</button>
        <div className="brand"><a className="brand-logo-link" href="/" aria-label="ईMAIL home" onPointerMove={createLogoPixelTrail}><img className="brand-logo-image" src="/mailbox-logo.png" alt="ईMAIL" /></a></div>
        <button className="compose-btn" type="button" onClick={() => { setMobileSidebarOpen(false); composeNew(); }}><span aria-hidden="true">{String.fromCodePoint(0x002b)}</span>Compose</button>
        <div className="nav-label">YOUR MAILSPACE</div>
        <nav className="sidebar-nav" aria-label="Mail folders">
          {FOLDERS.map((item) => <button
            key={item.id}
            className={`nav-item${folder === item.id ? ' active' : ''}`}
            type="button"
            aria-current={folder === item.id ? 'page' : undefined}
            onClick={() => { setFolder(item.id); setSelectedMessage(null); setComposer(null); setSelectedIds([]); setMobileSidebarOpen(false); }}
          ><span aria-hidden="true">{item.icon}</span><span>{item.label}</span>{(item.id === 'inbox' || item.id === 'unread') && unreadCount > 0 && <b>{unreadCount}</b>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" type="button" onClick={onSignOut} disabled={busy}><span aria-hidden="true">{String.fromCodePoint(0x21aa)}</span><span>Sign out</span></button>
          <div className="user-card">
            <div className="avatar user-avatar-display">
              {avatarUrl ? <img src={avatarUrl} alt="" /> : user.emailAddress?.[0]?.toUpperCase() ?? 'M'}
            </div>
            <input ref={profilePictureInput} className="avatar-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={updateProfilePicture} aria-label="Choose a profile picture" />
            <div className="user-identity"><strong>{user.emailAddress}</strong><small>{profilePictureBusy ? 'Saving photo…' : 'ईMAIL account'}</small></div>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="mobile-menu-trigger" type="button" aria-label="Open mailspace menu" aria-expanded={mobileSidebarOpen} aria-controls="mail-sidebar" onClick={() => setMobileSidebarOpen(true)}>{String.fromCodePoint(0x2630)}</button>
          <div className="page-heading"><h1>{currentFolder?.label ?? 'Inbox'}</h1><p>{folder === 'inbox' ? 'Your conversations, all in one place.' : `Messages in ${currentFolder?.label.toLowerCase()}.`}</p></div>
          <label className="search-box"><span aria-hidden="true">{String.fromCodePoint(0x2315)}</span><input type="search" placeholder="Search your mail..." value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search your mail" />{search && <button className="clear-search" type="button" onClick={() => setSearch('')} aria-label="Clear search">{String.fromCodePoint(0x00d7)}</button>}<kbd>Ctrl K</kbd></label>
          <button className="notification" type="button" onClick={() => showToast(unreadCount ? `You have ${unreadCount} unread message${unreadCount === 1 ? '' : 's'}` : 'You are all caught up')} aria-label="Notifications"><span aria-hidden="true">{String.fromCodePoint(0x2662)}</span>{unreadCount > 0 && <span className="notification-dot" />}</button>
          <button className="notification settings-trigger" type="button" onClick={() => setSettingsOpen(true)} aria-label="Settings" title="Settings"><span className="settings-desktop-icon" aria-hidden="true">{String.fromCodePoint(0x2699)}</span><span className="settings-mobile-avatar" aria-hidden="true">{avatarUrl ? <img src={avatarUrl} alt="" /> : user.emailAddress?.[0]?.toUpperCase() ?? 'M'}</span></button>
        </header>

        <div className="toolbar">
          <div className="toolbar-left">
            <label className="select-page" title="Select all messages on this page"><input type="checkbox" checked={allSelected} onChange={toggleAllMessages} aria-label="Select all messages" /></label>
            <button type="button" onClick={refreshMailbox} aria-label="Refresh" title="Refresh">{String.fromCodePoint(0x21bb)}</button>
            <button type="button" onClick={() => applyBulkAction('archive')} disabled={!selectedIds.length} aria-label="Archive selected" title="Archive selected">{String.fromCodePoint(0x25a4)}</button>
            <button type="button" onClick={() => applyBulkAction('trash')} disabled={!selectedIds.length} aria-label="Move selected to Trash" title="Move selected to Trash">{String.fromCodePoint(0x232b)}</button>
          </div>
          <div className="toolbar-right"><span>{loading ? 'Loading...' : `${messages.length} ${messages.length === 1 ? 'message' : 'messages'}`}</span><button type="button" onClick={() => setSelectedMessage(null)} aria-label="Close message preview">{String.fromCodePoint(0x2715)}</button></div>
        </div>

        {(error || notice) && <div className="mail-feedback" role={error ? 'alert' : 'status'}>{error || notice}<button type="button" onClick={() => { setError(''); setNotice(''); }} aria-label="Dismiss">{String.fromCodePoint(0x00d7)}</button></div>}

        {selectedMessage ? (
          <section className="email-preview" aria-label="Message preview">
            <div className="preview-header"><button type="button" onClick={() => setSelectedMessage(null)}>{'\u2190'} Back to {currentFolder?.label}</button><div className="preview-actions"><button type="button" onClick={() => updateMessage(selectedMessage, { isStarred: !selectedMessage.isStarred })} aria-label={selectedMessage.isStarred ? 'Unstar' : 'Star'}>{selectedMessage.isStarred ? '\u2605' : '\u2606'}</button>{folder !== 'archive' && folder !== 'trash' && <button type="button" onClick={() => updateMessage(selectedMessage, { folder: 'archive' })} aria-label="Archive">{String.fromCodePoint(0x25a4)}</button>}<button type="button" onClick={() => deleteMessage(selectedMessage)} aria-label={folder === 'trash' ? 'Delete forever' : 'Move to Trash'}>{folder === 'trash' ? '\u232b' : '\u2715'}</button></div></div>
            <h2>{selectedMessage.subject || '(no subject)'}</h2>
            <div className="preview-user"><div className="sender-avatar">{selectedMessage.sender[0]?.toUpperCase() ?? 'M'}</div><div><strong>{selectedMessage.sender}</strong><p>To: {selectedMessage.recipients.join(', ')}</p></div><span>{formatDate(selectedMessage.sentAt)}</span></div>
            <article className="preview-body">{selectedMessage.body}</article>
            {selectedMessage.attachments?.length > 0 && <section className="message-attachments" aria-label="Message attachments">
              <strong>Attachments ({selectedMessage.attachments.length})</strong>
              <div>{selectedMessage.attachments.map((attachment, index) => <a key={`${attachment.name}-${index}`} href={`/api/v1/mail/attachments/${attachment.id}`} download={attachment.name}>
                {['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(attachment.mimeType) && <img src={`/api/v1/mail/attachments/${attachment.id}?inline=1`} alt={attachment.name} />}
                <span>{attachment.name}<small>{(attachment.size / 1024).toFixed(0)} KB · Download</small></span>
              </a>)}</div>
            </section>}
{folder !== 'sent' && folder !== 'draft' && <button className="reply-button" type="button" aria-label={language === 'hi' ? 'जवाब दें' : 'Reply'} onClick={() => replyTo(selectedMessage)}>{'\u21b6'} {language === 'hi' ? 'जवाब दें' : 'Reply'}</button>}
          </section>
        ) : (
          <section className="email-area" aria-label={`${currentFolder?.label ?? 'Inbox'} messages`}>
            {loading && messages.length === 0 && <div className="empty-state"><div>{String.fromCodePoint(0x2709)}</div><h3>Loading your mail</h3><p>One moment while ईMAIL checks your mailbox.</p></div>}
            {!loading && messages.length === 0 && <div className="empty-state"><div>{String.fromCodePoint(0x2709)}</div><h3>{search ? 'No messages found' : folder === 'draft' ? 'No drafts yet' : 'Your mailbox is clear'}</h3><p>{search ? 'Try a different search term.' : 'Messages between ईMAIL accounts will appear here.'}</p></div>}
            {messages.map((message, index) => <article key={message.id} className={`email-row${!message.isRead && (folder === 'inbox' || folder === 'unread') ? ' unread' : ''}${selectedIds.includes(message.id) ? ' selected' : ''}`}>
              <div className="email-card-controls"><label className="email-check"><input type="checkbox" checked={selectedIds.includes(message.id)} onChange={() => toggleMessageSelection(message.id)} aria-label={`Select message: ${message.subject || 'no subject'}`} /></label><button className={`email-star${message.isStarred ? ' starred' : ''}`} type="button" onClick={() => updateMessage(message, { isStarred: !message.isStarred })} aria-label={message.isStarred ? 'Unstar message' : 'Star message'}>{message.isStarred ? '\u2605' : '\u2606'}</button></div>
              <button className="email-identity" type="button" onClick={() => folder === 'draft' ? editDraft(message) : openMessage(message)}><span className={`sender-avatar avatar-tone-${index % 4}`}>{otherParty(message, folder, user.emailAddress)[0]?.toUpperCase() ?? 'M'}</span><span className="sender"><strong>{otherParty(message, folder, user.emailAddress)}</strong><small>{message.sender}</small></span></button>
              <div className="email-meta"><span className={`mail-category${!message.isRead && (folder === 'inbox' || folder === 'unread') ? ' category-new' : ''}`}>{folder === 'draft' ? 'DRAFT' : !message.isRead && (folder === 'inbox' || folder === 'unread') ? 'NEW' : folder.toUpperCase()}</span><time className="email-time">{formatDate(message.sentAt || message.updatedAt)}</time></div>
              <button className="email-content" type="button" onClick={() => folder === 'draft' ? editDraft(message) : openMessage(message)}><strong>{message.subject || '(no subject)'}</strong><span>{message.preview}{message.attachments?.length ? ` · ${String.fromCodePoint(0x1f4ce)} ${message.attachments.length}` : ''}</span></button>
            </article>)}
          </section>
        )}

      </main>

      <button className="mobile-compose-fab" type="button" onClick={composeNew}><span aria-hidden="true">{String.fromCodePoint(0x270e)}</span>Compose</button>

      <nav className="mobile-bottom-nav" aria-label="Quick mail folders">
        <button className={folder === 'inbox' ? 'active' : ''} type="button" aria-current={folder === 'inbox' ? 'page' : undefined} onClick={() => { setFolder('inbox'); setSelectedMessage(null); setComposer(null); setSelectedIds([]); }}>
          <span aria-hidden="true">{String.fromCodePoint(0x2709)}</span><span>Mail</span>{folder === 'inbox' && unreadCount > 0 && <b>{unreadCount}</b>}
        </button>
        <button className={folder === 'starred' ? 'active' : ''} type="button" aria-current={folder === 'starred' ? 'page' : undefined} onClick={() => { setFolder('starred'); setSelectedMessage(null); setComposer(null); setSelectedIds([]); }}>
          <span aria-hidden="true">{String.fromCodePoint(0x2605)}</span><span>Starred</span>
        </button>
      </nav>

      {composer && <div className="compose-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeComposer(); }}><form className="compose-box" onSubmit={sendMessage} aria-label="Compose internal email"><div className="compose-header"><h3>{composer.id ? 'Edit draft' : 'New message'}</h3><button type="button" onClick={closeComposer} aria-label="Close compose">{String.fromCodePoint(0x00d7)}</button></div><div className="writer-tool">
            <label>From</label>
            <div className="writer-tool-row"><input value={user.emailAddress} readOnly aria-label="From address" /></div>
            <small>Messages stay inside existing ईMAIL accounts.</small>
          </div>
          <input type="text" aria-label="To" placeholder="To: recipient@niti" value={composer.to} onChange={(event) => setComposer({ ...composer, to: event.target.value })} required /><input type="text" aria-label="Subject" placeholder="Subject" value={composer.subject} onChange={(event) => setComposer({ ...composer, subject: event.target.value })} maxLength={200} required /><textarea aria-label="Message" placeholder="Write your message..." value={composer.body} onChange={(event) => setComposer({ ...composer, body: event.target.value })} maxLength={30000} required />
          <div className="attachment-controls">
            <input ref={attachmentInput} className="attachment-file-input" type="file" multiple onChange={addAttachments} aria-label="Choose attachments" />
            <input ref={photoInput} className="attachment-file-input" type="file" accept="image/*" multiple onChange={addAttachments} aria-label="Choose photos" />
            <button type="button" onClick={() => attachmentInput.current?.click()}>{String.fromCodePoint(0x1f4ce)} Attach files</button>
            <button type="button" onClick={() => photoInput.current?.click()}>{String.fromCodePoint(0x1f4f7)} Add photo</button>
          </div>
          {composer.attachments?.length > 0 && <ul className="attachment-list">{composer.attachments.map((attachment, index) => <li key={`${attachment.name}-${index}`}>
            <span>{attachment.mimeType.startsWith('image/') ? String.fromCodePoint(0x1f5bc) : String.fromCodePoint(0x1f4c4)} {attachment.name} <small>{(attachment.size / 1024).toFixed(0)} KB</small></span>
            <button type="button" aria-label={`Remove ${attachment.name}`} onClick={() => removeAttachment(attachment, index)}>{String.fromCodePoint(0x00d7)}</button>
          </li>)}</ul>}
          {error && <p className="attachment-error" role="alert">{error}</p>}
          <div className="compose-footer"><button className="discard-btn" type="button" onClick={saveDraft}>Save draft</button><button className="send-btn" type="submit">Send message {'\u2197'}</button></div></form></div>}
      {settingsOpen && <div className="compose-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
        <section className="compose-box profile-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <div className="compose-header"><h3 id="settings-title">Settings</h3><button type="button" onClick={() => setSettingsOpen(false)} aria-label="Close settings">{String.fromCodePoint(0x00d7)}</button></div>
          <div className="profile-settings-body">
            <div className="profile-settings-summary">
              <div className="avatar profile-settings-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : user.emailAddress?.[0]?.toUpperCase() ?? 'M'}</div>
              <div><strong>Profile picture</strong><small>{profilePictureBusy ? 'Saving photo…' : 'Choose a picture for your account.'}</small></div>
            </div>
            <button className="change-profile-picture" type="button" onClick={() => profilePictureInput.current?.click()} disabled={profilePictureBusy}>{profilePictureBusy ? 'Saving…' : 'Change profile picture'}</button>
            <p className="settings-note">Your picture is saved to your account and shown when you sign in.</p>
            <section className="settings-translate-tool" aria-labelledby="settings-translate-title">
              <div><strong id="settings-translate-title">Translate text</strong><small>Translate text into another language.</small></div>
              <button className="change-profile-picture" type="button" onClick={() => { setSettingsOpen(false); openTranslator(); }}>{String.fromCodePoint(0x1f310)} Open translator</button>
            </section>
            <section className="manage-accounts" aria-labelledby="manage-accounts-title">
              <h4 id="manage-accounts-title">Manage accounts</h4>
              <button className="add-account-button" type="button" onClick={() => { setAddAccountOpen((open) => !open); setAccountError(''); }}>{String.fromCodePoint(0x002b)} Add account</button>
              {addAccountOpen && <form className="add-account-form" onSubmit={addAccount}>
                <p>Sign in to another existing account. This switches the active mailbox.</p>
                <input type="tel" autoComplete="username" aria-label="Account phone number" placeholder="Phone number" value={accountPhone} onChange={(event) => setAccountPhone(event.target.value)} required />
                <PasswordInput autoComplete="current-password" aria-label="Account password" placeholder="Password" value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} required visible={showAccountPassword} onToggle={() => setShowAccountPassword((visible) => !visible)} />
                {accountError && <p className="add-account-error" role="alert">{accountError}</p>}
                <button className="send-btn" type="submit" disabled={accountBusy}>{accountBusy ? 'Signing in…' : 'Add and switch account'}</button>
              </form>}
              <div className="delete-account-row">
                <div><strong>Delete this account</strong><small>Permanently erase this account and mailbox.</small></div>
                <button className="delete-account-button" type="button" onClick={() => { setDeleteAccountOpen(true); setDeleteAccountComplete(false); setDeleteAccountError(''); setDeleteAccountConfirmation(''); setDeleteAccountPassword(''); setSettingsOpen(false); }}>Delete</button>
              </div>

            </section>
          </div>
        </section>
      </div>}
      {deleteAccountOpen && <div className="compose-overlay delete-account-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleteAccountBusy) setDeleteAccountOpen(false); }}>
        <section className="compose-box delete-account-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-account-title" aria-describedby="delete-account-description">
          {!deleteAccountComplete ? <>
            <div className="delete-account-dialog-header">
              <div className="delete-account-symbol" aria-hidden="true">!</div>
              <button className="delete-account-close" type="button" onClick={() => setDeleteAccountOpen(false)} disabled={deleteAccountBusy} aria-label="Close account deletion">{String.fromCodePoint(0x00d7)}</button>
              <p className="delete-account-kicker">ACCOUNT MANAGEMENT</p>
              <h2 id="delete-account-title">Permanently delete account</h2>
              <p id="delete-account-description">Review what will be removed before confirming.</p>
            </div>
            <div className="delete-account-dialog-content">
              <div className="delete-account-progress" aria-label="Deletion steps">
                <span className={deleteAccountBusy ? 'complete' : 'active'}><i>{deleteAccountBusy ? String.fromCodePoint(0x2713) : '1'}</i> Confirm identity</span><b></b><span className={deleteAccountBusy ? 'active' : ''}><i>2</i> Delete data</span><b></b><span><i>3</i> Complete</span>
              </div>
              <div className="delete-account-warning">
                <strong>This action cannot be undone</strong>
                <p>This will delete <b>{user.emailAddress}</b>, its mailbox, attachments, and sent messages. Copies of messages sent by this account will also be removed from recipients' mailboxes.</p>
              </div>
              <form className="delete-account-form" onSubmit={deleteCurrentAccount}>
                <label htmlFor="delete-account-password">Current password</label>
                <PasswordInput id="delete-account-password" autoComplete="current-password" value={deleteAccountPassword} onChange={(event) => setDeleteAccountPassword(event.target.value)} required disabled={deleteAccountBusy} visible={showDeleteAccountPassword} onToggle={() => setShowDeleteAccountPassword((visible) => !visible)} />
                <label htmlFor="delete-account-email">Type your account address to confirm</label>
                <input id="delete-account-email" type="email" autoComplete="email" placeholder={user.emailAddress} value={deleteAccountConfirmation} onChange={(event) => setDeleteAccountConfirmation(event.target.value)} required disabled={deleteAccountBusy} />
                {deleteAccountError && <p className="add-account-error" role="alert">{deleteAccountError}</p>}
                {deleteAccountBusy && <p className="delete-account-progress-message" role="status"><span className="delete-account-spinner" aria-hidden="true"></span>Deleting your account and securely removing its mailbox data...</p>}
                <div className="delete-account-actions">
                  <button className="delete-account-cancel" type="button" onClick={() => setDeleteAccountOpen(false)} disabled={deleteAccountBusy}>Cancel</button>
                  <button className="delete-account-submit" type="submit" disabled={deleteAccountBusy}>{deleteAccountBusy ? 'Deleting...' : 'Permanently delete account'}</button>
                </div>
              </form>
            </div>
          </> : <div className="delete-account-success" role="status">
            <div className="delete-account-success-icon" aria-hidden="true">&#10003;</div>
            <p className="delete-account-kicker">PROCESS COMPLETE</p>
            <h2 id="delete-account-title">Account deleted</h2>
            <p id="delete-account-description">The account, mailbox data, and active sessions have been permanently removed.</p>
            <div className="delete-account-complete-step"><span>&#10003;</span> Account and mailbox deletion complete</div>
            <button className="delete-account-submit" type="button" onClick={() => onAccountDeleted?.()}>Return to sign in</button>
          </div>}
        </section>
      </div>}
      {translatorOpen && <div className="compose-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTranslatorOpen(false); }}>
        <section className="compose-box ai-translator-dialog" role="dialog" aria-modal="true" aria-labelledby="translator-title">
          <div className="compose-header"><h3 id="translator-title">🌐 AI Translator</h3><button type="button" onClick={() => setTranslatorOpen(false)} aria-label="Close translator">×</button></div>
          <form className="ai-translator-form" onSubmit={translateText}>
            <label htmlFor="translation-source">Text to translate</label>
            <textarea id="translation-source" value={translationInput} onChange={(event) => setTranslationInput(event.target.value)} placeholder="Write or paste an email here…" maxLength={15000} required />
            <div className="ai-translator-controls">
              <label htmlFor="translation-language">Translate to
                <select id="translation-language" value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}>
                  {AI_LANGUAGES.map((language) => <option key={language} value={language}>{language}</option>)}
                </select>
              </label>
              <button className="send-btn" type="submit" disabled={aiBusy || !translationInput.trim()}>{aiBusy ? 'Translating…' : 'Translate ✦'}</button>
            </div>
            {aiError && <p className="ai-error-message" role="alert">{aiError}</p>}
            {translationResult && <div className="ai-translation-result"><strong>{targetLanguage} translation</strong><p>{translationResult}</p></div>}
            <p className="ai-disclosure">Text submitted for translation is sent to OpenRouter and its selected model provider. Avoid sensitive information.</p>
          </form>
        </section>
      </div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

