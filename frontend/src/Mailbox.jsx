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

/** Keep mailbox controls and status copy available in the supported site languages. */
const HINDI_COPY = new Map([
  ["Add account", "खाता जोड़ें"],
  ["Add and switch account", "खाता जोड़ें और बदलें"],
  ["Add photo", "फ़ोटो जोड़ें"],
  ["Archive", "संग्रह"],
  ["Archive selected", "चुने हुए संदेश संग्रहित करें"],
  ["Attachments", "अटैचमेंट"],
  ["Back to", "वापस जाएँ:"],
  ["Cancel", "रद्द करें"],
  ["Change profile picture", "प्रोफ़ाइल तस्वीर बदलें"],
  ["Choose a picture for your account.", "अपने खाते के लिए तस्वीर चुनें।"],
  ["Choose a profile picture", "प्रोफ़ाइल तस्वीर चुनें"],
  ["Choose attachments", "अटैचमेंट चुनें"],
  ["Choose photos", "फ़ोटो चुनें"],
  ["Clear search", "खोज मिटाएँ"],
  ["Close account deletion", "खाता हटाने का संवाद बंद करें"],
  ["Close compose", "संदेश लिखना बंद करें"],
  ["Close mailspace menu", "मेल मेन्यू बंद करें"],
  ["Close message preview", "संदेश पूर्वावलोकन बंद करें"],
  ["Compose", "लिखें"],
  ["Compose internal email", "आंतरिक ईमेल लिखें"],
  ["Confirm identity", "पहचान की पुष्टि करें"],
  ["Current password", "वर्तमान पासवर्ड"],
  ["Delete", "हटाएँ"],
  ["Delete account", "खाता हटाएँ"],
  ["Delete data", "डेटा हटाएँ"],
  ["Delete forever", "हमेशा के लिए हटाएँ"],
  ["Delete this account", "यह खाता हटाएँ"],
  ["Dismiss", "बंद करें"],
  ["Drafts", "ड्राफ़्ट"],
  ["Edit draft", "ड्राफ़्ट संपादित करें"],
  ["From", "भेजने वाला"],
  ["From address", "भेजने वाले का पता"],
  ["Inbox", "इनबॉक्स"],
  ["Loading...", "लोड हो रहा है…"],
  ["Loading your mail", "आपका मेल लोड हो रहा है"],
  ["Mail", "मेल"],
  ["Mail folders", "मेल फ़ोल्डर"],
  ["Manage accounts", "खाते प्रबंधित करें"],
  ["Message", "संदेश"],
  ["Message attachments", "संदेश के अटैचमेंट"],
  ["Message preview", "संदेश पूर्वावलोकन"],
  ["Move selected to Trash", "चुने हुए संदेश ट्रैश में भेजें"],
  ["Move to Trash", "ट्रैश में भेजें"],
  ["New message", "नया संदेश"],
  ["No drafts yet", "अभी कोई ड्राफ़्ट नहीं"],
  ["No messages found", "कोई संदेश नहीं मिला"],
  ["Notifications", "सूचनाएँ"],
  ["One moment while ईMAIL checks your mailbox.", "ईमेल आपका मेलबॉक्स देख रहा है, कृपया प्रतीक्षा करें।"],
  ["Permanently delete account", "खाता हमेशा के लिए हटाएँ"],
  ["Permanently erase this account and mailbox.", "इस खाते और मेलबॉक्स को हमेशा के लिए मिटाएँ।"],
  ["Phone number", "फ़ोन नंबर"],
  ["Profile picture", "प्रोफ़ाइल तस्वीर"],
  ["Refresh", "रीफ़्रेश करें"],
  ["Reply", "जवाब दें"],
  ["Review what will be removed before confirming.", "पुष्टि से पहले देखें कि क्या हटाया जाएगा।"],
  ["Save draft", "ड्राफ़्ट सहेजें"],
  ["Saving photo…", "तस्वीर सहेजी जा रही है…"],
  ["Saving…", "सहेजा जा रहा है…"],
  ["Search your mail", "मेल खोजें"],
  ["Search your mail...", "मेल खोजें…"],
  ["Select all messages", "सभी संदेश चुनें"],
  ["Select all messages on this page", "इस पृष्ठ के सभी संदेश चुनें"],
  ["Send message", "संदेश भेजें"],
  ["Settings", "सेटिंग्स"],
  ["Show website in English", "वेबसाइट अंग्रेज़ी में दिखाएँ"],
  ["Sign in to another existing account. This switches the active mailbox.", "दूसरे मौजूदा खाते में साइन इन करें। इससे सक्रिय मेलबॉक्स बदल जाएगा।"],
  ["Sign out", "साइन आउट"],
  ["Starred", "तारांकित"],
  ["Subject", "विषय"],
  ["To", "प्राप्तकर्ता"],
  ["Trash", "ट्रैश"],
  ["Translate website", "वेबसाइट का अनुवाद करें"],
  ["Change the website language to Hindi or English.", "वेबसाइट की भाषा हिंदी या अंग्रेज़ी में बदलें।"],
  ["Translate website to English", "वेबसाइट का अंग्रेज़ी में अनुवाद करें"],
  ["Translate website to Hindi", "वेबसाइट का हिंदी में अनुवाद करें"],
  ["Unread", "अपठित"],
  ["YOUR MAILSPACE", "आपका मेलबॉक्स"],
  ["Sent", "भेजे गए"],
  ["Account deleted", "खाता हटा दिया गया"],
  ["Account and mailbox deletion complete", "खाता और मेलबॉक्स हटाना पूरा हुआ"],
  ["ACCOUNT MANAGEMENT", "खाता प्रबंधन"],
  ["PROCESS COMPLETE", "प्रक्रिया पूरी हुई"],
  ["This action cannot be undone", "इस कार्रवाई को वापस नहीं किया जा सकता।"],
  ["This browser could not prepare the selected image.", "यह ब्राउज़र चुनी हुई तस्वीर तैयार नहीं कर सका।"],
  ["Choose an image file.", "कृपया तस्वीर फ़ाइल चुनें।"],
  ["Choose an image smaller than 12 MB.", "12 MB से छोटी तस्वीर चुनें।"],
  ["Choose a simpler or smaller image.", "सरल या छोटी तस्वीर चुनें।"],
  ["Attach up to 5 files per message.", "एक संदेश में अधिकतम 5 फ़ाइलें जोड़ें।"],
  ["No subject", "कोई विषय नहीं"],
  ["(no subject)", "(कोई विषय नहीं)"],
  ["NEW", "नया"],
  ["DRAFT", "ड्राफ़्ट"],
  ["Type your account address to confirm", "पुष्टि के लिए अपने खाते का ईमेल पता लिखें"],
  ["The account, mailbox data, and active sessions have been permanently removed.", "खाता, मेलबॉक्स डेटा और सक्रिय सत्र हमेशा के लिए हटा दिए गए हैं।"],
  ["Return to sign in", "साइन इन पर लौटें"],
  ["Complete", "पूरा हुआ"],
  ["Your picture is saved to your account and shown when you sign in.", "आपकी तस्वीर खाते में सहेजी जाती है और साइन इन करने पर दिखाई देती है।"],
  ["Messages stay inside existing ईMAIL accounts.", "संदेश केवल मौजूदा ईमेल खातों के बीच भेजे जाते हैं।"],
  ["Messages between ईMAIL accounts will appear here.", "ईमेल खातों के संदेश यहाँ दिखाई देंगे।"],
  ["Your conversations, all in one place.", "आपकी सभी बातचीत एक ही जगह पर।"],
  ["Your mailbox is clear", "आपका मेलबॉक्स खाली है"],
  ["Try a different search term.", "कोई दूसरा शब्द खोजें।"],
  ["You are all caught up", "आपने सभी संदेश देख लिए हैं"],
  ["Open mailspace menu", "मेल मेन्यू खोलें"],
  ["messages", "संदेश"],
  ["message", "संदेश"],
  ["Messages in", "इस फ़ोल्डर में संदेश:"],
  ["Select message", "संदेश चुनें"],
  ["Unstar", "तारे का निशान हटाएँ"],
  ["Star", "तारा लगाएँ"],
  ["Unstar message", "संदेश से तारे का निशान हटाएँ"],
  ["Star message", "संदेश पर तारा लगाएँ"],
  ["Download", "डाउनलोड करें"],
  ["Quick mail folders", "मेल के त्वरित फ़ोल्डर"],
  ["To: recipient@niti", "प्राप्तकर्ता: recipient@niti"],
  ["Write your message...", "अपना संदेश लिखें…"],
  ["Attach files", "फ़ाइलें जोड़ें"],
  ["Remove", "हटाएँ"],
  ["Close settings", "सेटिंग्स बंद करें"],
  ["Account phone number", "खाते का फ़ोन नंबर"],
  ["Account password", "खाते का पासवर्ड"],
  ["Password", "पासवर्ड"],
  ["Signing in…", "साइन इन हो रहा है…"],
  ["Deleting your account and securely removing its mailbox data...", "खाता हटाया जा रहा है और मेलबॉक्स डेटा सुरक्षित रूप से मिटाया जा रहा है…"],
  ["Deleting...", "हटाया जा रहा है…"],
  ["Profile picture updated", "प्रोफ़ाइल तस्वीर अपडेट हो गई"],
  ["Message permanently deleted", "संदेश हमेशा के लिए हटा दिया गया"],
  ["Message moved to Trash", "संदेश ट्रैश में भेज दिया गया"],
  ["Messages archived", "संदेश संग्रहित कर दिए गए"],
  ["Messages moved to Trash", "संदेश ट्रैश में भेज दिए गए"],
  ["Draft saved", "ड्राफ़्ट सहेजा गया"],
  ["Message delivered inside ईMAIL", "संदेश ईमेल के भीतर भेज दिया गया"],
  ["ईMAIL account", "ईमेल खाता"],
  ["Show password", "पासवर्ड दिखाएँ"],
  ["Hide password", "पासवर्ड छिपाएँ"],
  ["Messages stay inside ईMAIL accounts.", "संदेश केवल ईमेल खातों के बीच भेजे जाते हैं।"],
  ["Change website language to Hindi or English.", "वेबसाइट की भाषा हिंदी या अंग्रेज़ी में बदलें।"],
  ["Deletion steps", "हटाने के चरण"],
]);

function copy(text, language) {
  return language === 'hi' ? HINDI_COPY.get(text) ?? text : text;
}

function folderName(id, language) {
  const folder = FOLDERS.find((item) => item.id === id);
  return copy(folder?.label ?? 'Inbox', language);
}

/** Display a concise local time in the message list and reader. */
function formatDate(value, language = 'en') {
  if (!value) return '';
  return new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-IN', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

/** Select the correspondent label shown in a message row. */
function otherParty(message, folder, userAddress, language = 'en') {
  if (folder === 'sent' || message.sender === userAddress) return `${copy('To', language)}: ${message.recipients.join(', ')}`;
  return message.sender;
}

/** Crop and compress one selected image to a small square profile picture. */
async function prepareProfileImage(file, language) {
  if (!file.type.startsWith('image/')) throw new Error(copy('Choose an image file.', language));
  if (file.size > 12 * 1024 * 1024) throw new Error(copy('Choose an image smaller than 12 MB.', language));

  const bitmap = await createImageBitmap(file);
  const cropSize = Math.min(bitmap.width, bitmap.height);
  const offsetX = Math.floor((bitmap.width - cropSize) / 2);
  const offsetY = Math.floor((bitmap.height - cropSize) / 2);
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 320;
  const context = canvas.getContext('2d');
  if (!context) throw new Error(copy('This browser could not prepare the selected image.', language));
  context.drawImage(bitmap, offsetX, offsetY, cropSize, cropSize, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const compressedImage = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error('This browser could not compress the selected image.'));
    }, 'image/webp', 0.84);
  });
  if (compressedImage.size > 350 * 1024) throw new Error(copy('Choose a simpler or smaller image.', language));
  return compressedImage;
}

/** Render the user's prior à¤ˆMAIL design with live internal mailbox data. */
export default function Mailbox({ user, onSignOut, onAccountChanged, onAccountDeleted, busy, language = 'en', onLanguageChange }) {
  const t = (text) => copy(text, language);
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
      setError(copy(requestError.message, language));
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
      const image = await prepareProfileImage(selectedFile, language);
      const result = await requestApi('/profile/picture', { method: 'PUT', body: image });
      setAvatarUrl(result.avatarUrl);
      showToast(t('Profile picture updated'));
    } catch (requestError) {
      setError(copy(requestError.message, language));
    } finally {
      setProfilePictureBusy(false);
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
      setError(copy(requestError.message, language));
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
      setError(copy(requestError.message, language));
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
      setError(copy(requestError.message, language));
    }
  }

  /** Permanently delete a message only when it is already in Trash. */
  async function deleteMessage(message) {
    try {
      if (folder === 'trash') {
        await requestApi(`/mail/messages/${message.id}`, { method: 'DELETE' });
        showToast(t('Message permanently deleted'));
      } else {
        await requestApi(`/mail/messages/${message.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ folder: 'trash' }),
        });
        showToast(t('Message moved to Trash'));
      }
      setSelectedMessage(null);
      await refreshMailbox();
    } catch (requestError) {
      setError(copy(requestError.message, language));
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
      showToast(t(destination === 'archive' ? 'Messages archived' : 'Messages moved to Trash'));
      await refreshMailbox();
    } catch (requestError) {
      setError(copy(requestError.message, language));
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
      if (existing.length + selectedFiles.length > 5) throw new Error(copy('Attach up to 5 files per message.', language));
      const oversized = selectedFiles.find((file) => file.size > 15 * 1024 * 1024);
      if (oversized) throw new Error(language === 'hi' ? `${oversized.name} 15 MB से बड़ी है।` : `${oversized.name} is larger than 15 MB.`);
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
      setError(copy(attachmentError.message, language));
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
      showToast(language === 'hi' ? `${result.user.emailAddress} पर स्विच किया गया` : `Switched to ${result.user.emailAddress}`);
      await refreshMailbox();
    } catch (requestError) {
      setAccountError(copy(requestError.message, language));
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
      setDeleteAccountError(copy(requestError.message, language));
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
      showToast(t('Draft saved'));
      setError('');
    } catch (requestError) {
      setError(copy(requestError.message, language));
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
      showToast(t('Message delivered inside ईMAIL'));
      await refreshMailbox();
    } catch (requestError) {
      setError(copy(requestError.message, language));
    }
  }

  const unreadCount = useMemo(() => messages.filter((message) => !message.isRead).length, [messages]);
  const allSelected = messages.length > 0 && selectedIds.length === messages.length;
  const currentFolderLabel = folderName(folder, language);

  return (
    <div className="app">
      {mobileSidebarOpen && <button className="sidebar-backdrop" type="button" aria-label={t('Close mailspace menu')} onClick={() => setMobileSidebarOpen(false)} />}
      <aside id="mail-sidebar" className={`sidebar${mobileSidebarOpen ? ' sidebar-open' : ''}`}>
        <button className="sidebar-close" type="button" aria-label={t('Close mailspace menu')} onClick={() => setMobileSidebarOpen(false)}>{String.fromCodePoint(0x00d7)}</button>
        <div className="brand"><a className="brand-logo-link" href="/" aria-label="ईMAIL home" onPointerMove={createLogoPixelTrail}><img className="brand-logo-image" src="/mailbox-logo.png" alt="ईMAIL" /></a></div>
        <button className="compose-btn" type="button" onClick={() => { setMobileSidebarOpen(false); composeNew(); }}><span aria-hidden="true">{String.fromCodePoint(0x002b)}</span>{t('Compose')}</button>
        <div className="nav-label">{t('YOUR MAILSPACE')}</div>
        <nav className="sidebar-nav" aria-label={t('Mail folders')}>
          {FOLDERS.map((item) => <button
            key={item.id}
            className={`nav-item${folder === item.id ? ' active' : ''}`}
            type="button"
            aria-current={folder === item.id ? 'page' : undefined}
            onClick={() => { setFolder(item.id); setSelectedMessage(null); setComposer(null); setSelectedIds([]); setMobileSidebarOpen(false); }}
          ><span aria-hidden="true">{item.icon}</span><span>{copy(item.label, language)}</span>{(item.id === 'inbox' || item.id === 'unread') && unreadCount > 0 && <b>{unreadCount}</b>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" type="button" onClick={onSignOut} disabled={busy}><span aria-hidden="true">{String.fromCodePoint(0x21aa)}</span><span>{t('Sign out')}</span></button>
          <div className="user-card">
            <div className="avatar user-avatar-display">
              {avatarUrl ? <img src={avatarUrl} alt="" /> : user.emailAddress?.[0]?.toUpperCase() ?? 'M'}
            </div>
            <input ref={profilePictureInput} className="avatar-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={updateProfilePicture} aria-label={t('Choose a profile picture')} />
            <div className="user-identity"><strong>{user.emailAddress}</strong><small>{profilePictureBusy ? t('Saving photo…') : t('ईMAIL account')}</small></div>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="mobile-menu-trigger" type="button" aria-label={t('Open mailspace menu')} aria-expanded={mobileSidebarOpen} aria-controls="mail-sidebar" onClick={() => setMobileSidebarOpen(true)}>{String.fromCodePoint(0x2630)}</button>
          <div className="page-heading"><h1>{currentFolderLabel}</h1><p>{folder === 'inbox' ? t('Your conversations, all in one place.') : `${t('Messages in')} ${currentFolderLabel.toLowerCase()}.`}</p></div>
          <label className="search-box"><span aria-hidden="true">{String.fromCodePoint(0x2315)}</span><input type="search" placeholder={t('Search your mail...')} value={search} onChange={(event) => setSearch(event.target.value)} aria-label={t('Search your mail')} />{search && <button className="clear-search" type="button" onClick={() => setSearch('')} aria-label={t('Clear search')}>{String.fromCodePoint(0x00d7)}</button>}<kbd>Ctrl K</kbd></label>
          <button className="notification" type="button" onClick={() => showToast(unreadCount ? language === 'hi' ? `आपके ${unreadCount} अपठित संदेश हैं` : `You have ${unreadCount} unread message${unreadCount === 1 ? '' : 's'}` : t('You are all caught up'))} aria-label={t('Notifications')}><span aria-hidden="true">{String.fromCodePoint(0x2662)}</span>{unreadCount > 0 && <span className="notification-dot" />}</button>
          <button className="notification settings-trigger" type="button" onClick={() => setSettingsOpen(true)} aria-label={t('Settings')} title={t('Settings')}><span className="settings-desktop-icon" aria-hidden="true">{String.fromCodePoint(0x2699)}</span><span className="settings-mobile-avatar" aria-hidden="true">{avatarUrl ? <img src={avatarUrl} alt="" /> : user.emailAddress?.[0]?.toUpperCase() ?? 'M'}</span></button>
        </header>

        <div className="toolbar">
          <div className="toolbar-left">
            <label className="select-page" title={t('Select all messages on this page')}><input type="checkbox" checked={allSelected} onChange={toggleAllMessages} aria-label={t('Select all messages')} /></label>
            <button type="button" onClick={refreshMailbox} aria-label={t('Refresh')} title={t('Refresh')}>{String.fromCodePoint(0x21bb)}</button>
            <button type="button" onClick={() => applyBulkAction('archive')} disabled={!selectedIds.length} aria-label={t('Archive selected')} title={t('Archive selected')}>{String.fromCodePoint(0x25a4)}</button>
            <button type="button" onClick={() => applyBulkAction('trash')} disabled={!selectedIds.length} aria-label={t('Move selected to Trash')} title={t('Move selected to Trash')}>{String.fromCodePoint(0x232b)}</button>
          </div>
          <div className="toolbar-right"><span>{loading ? t('Loading...') : language === 'hi' ? `${messages.length} संदेश` : `${messages.length} ${messages.length === 1 ? 'message' : 'messages'}`}</span><button type="button" onClick={() => setSelectedMessage(null)} aria-label={t('Close message preview')}>{String.fromCodePoint(0x2715)}</button></div>
        </div>

        {(error || notice) && <div className="mail-feedback" role={error ? 'alert' : 'status'}>{error || notice}<button type="button" onClick={() => { setError(''); setNotice(''); }} aria-label={t('Dismiss')}>{String.fromCodePoint(0x00d7)}</button></div>}

        {selectedMessage ? (
          <section className="email-preview" aria-label={t('Message preview')}>
            <div className="preview-header"><button type="button" onClick={() => setSelectedMessage(null)}>{'\u2190'} {t('Back to')} {currentFolderLabel}</button><div className="preview-actions"><button type="button" onClick={() => updateMessage(selectedMessage, { isStarred: !selectedMessage.isStarred })} aria-label={t(selectedMessage.isStarred ? 'Unstar' : 'Star')}>{selectedMessage.isStarred ? '\u2605' : '\u2606'}</button>{folder !== 'archive' && folder !== 'trash' && <button type="button" onClick={() => updateMessage(selectedMessage, { folder: 'archive' })} aria-label={t('Archive')}>{String.fromCodePoint(0x25a4)}</button>}<button type="button" onClick={() => deleteMessage(selectedMessage)} aria-label={t(folder === 'trash' ? 'Delete forever' : 'Move to Trash')}>{folder === 'trash' ? '\u232b' : '\u2715'}</button></div></div>
            <h2>{selectedMessage.subject || '(no subject)'}</h2>
            <div className="preview-user"><div className="sender-avatar">{selectedMessage.sender[0]?.toUpperCase() ?? 'M'}</div><div><strong>{selectedMessage.sender}</strong><p>{t('To')}: {selectedMessage.recipients.join(', ')}</p></div><span>{formatDate(selectedMessage.sentAt, language)}</span></div>
            <article className="preview-body">{selectedMessage.body}</article>
            {selectedMessage.attachments?.length > 0 && <section className="message-attachments" aria-label={t('Message attachments')}>
              <strong>{t('Attachments')} ({selectedMessage.attachments.length})</strong>
              <div>{selectedMessage.attachments.map((attachment, index) => <a key={`${attachment.name}-${index}`} href={`/api/v1/mail/attachments/${attachment.id}`} download={attachment.name}>
                {['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(attachment.mimeType) && <img src={`/api/v1/mail/attachments/${attachment.id}?inline=1`} alt={attachment.name} />}
                <span>{attachment.name}<small>{(attachment.size / 1024).toFixed(0)} KB · {t('Download')}</small></span>
              </a>)}</div>
            </section>}
{folder !== 'sent' && folder !== 'draft' && <button className="reply-button" type="button" aria-label={t('Reply')} onClick={() => replyTo(selectedMessage)}>{'\u21b6'} {t('Reply')}</button>}
          </section>
        ) : (
          <section className="email-area" aria-label={`${currentFolderLabel} ${t('messages')}`}>
            {loading && messages.length === 0 && <div className="empty-state"><div>{String.fromCodePoint(0x2709)}</div><h3>{t('Loading your mail')}</h3><p>{t('One moment while ईMAIL checks your mailbox.')}</p></div>}
            {!loading && messages.length === 0 && <div className="empty-state"><div>{String.fromCodePoint(0x2709)}</div><h3>{search ? t('No messages found') : folder === 'draft' ? t('No drafts yet') : t('Your mailbox is clear')}</h3><p>{search ? t('Try a different search term.') : t('Messages between ईMAIL accounts will appear here.')}</p></div>}
            {messages.map((message, index) => <article key={message.id} className={`email-row${!message.isRead && (folder === 'inbox' || folder === 'unread') ? ' unread' : ''}${selectedIds.includes(message.id) ? ' selected' : ''}`}>
              <div className="email-card-controls"><label className="email-check"><input type="checkbox" checked={selectedIds.includes(message.id)} onChange={() => toggleMessageSelection(message.id)} aria-label={`${t('Select message')}: ${message.subject || t('(no subject)')}`} /></label><button className={`email-star${message.isStarred ? ' starred' : ''}`} type="button" onClick={() => updateMessage(message, { isStarred: !message.isStarred })} aria-label={t(message.isStarred ? 'Unstar message' : 'Star message')}>{message.isStarred ? '\u2605' : '\u2606'}</button></div>
              <button className="email-identity" type="button" onClick={() => folder === 'draft' ? editDraft(message) : openMessage(message)}><span className={`sender-avatar avatar-tone-${index % 4}`}>{otherParty(message, folder, user.emailAddress, language)[0]?.toUpperCase() ?? 'M'}</span><span className="sender"><strong>{otherParty(message, folder, user.emailAddress, language)}</strong><small>{message.sender}</small></span></button>
              <div className="email-meta"><span className={`mail-category${!message.isRead && (folder === 'inbox' || folder === 'unread') ? ' category-new' : ''}`}>{folder === 'draft' ? t('DRAFT') : !message.isRead && (folder === 'inbox' || folder === 'unread') ? t('NEW') : folderName(folder, language).toUpperCase()}</span><time className="email-time">{formatDate(message.sentAt || message.updatedAt, language)}</time></div>
              <button className="email-content" type="button" onClick={() => folder === 'draft' ? editDraft(message) : openMessage(message)}><strong>{message.subject || '(no subject)'}</strong><span>{message.preview}{message.attachments?.length ? ` · ${String.fromCodePoint(0x1f4ce)} ${message.attachments.length}` : ''}</span></button>
            </article>)}
          </section>
        )}

      </main>

      <button className="mobile-compose-fab" type="button" onClick={composeNew}><span aria-hidden="true">{String.fromCodePoint(0x270e)}</span>{t('Compose')}</button>

      <nav className="mobile-bottom-nav" aria-label={t('Quick mail folders')}>
        <button className={folder === 'inbox' ? 'active' : ''} type="button" aria-current={folder === 'inbox' ? 'page' : undefined} onClick={() => { setFolder('inbox'); setSelectedMessage(null); setComposer(null); setSelectedIds([]); }}>
          <span aria-hidden="true">{String.fromCodePoint(0x2709)}</span><span>{t('Mail')}</span>{folder === 'inbox' && unreadCount > 0 && <b>{unreadCount}</b>}
        </button>
        <button className={folder === 'starred' ? 'active' : ''} type="button" aria-current={folder === 'starred' ? 'page' : undefined} onClick={() => { setFolder('starred'); setSelectedMessage(null); setComposer(null); setSelectedIds([]); }}>
          <span aria-hidden="true">{String.fromCodePoint(0x2605)}</span><span>{t('Starred')}</span>
        </button>
      </nav>

      {composer && <div className="compose-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeComposer(); }}><form className="compose-box" onSubmit={sendMessage} aria-label={t('Compose internal email')}><div className="compose-header"><h3>{t(composer.id ? 'Edit draft' : 'New message')}</h3><button type="button" onClick={closeComposer} aria-label={t('Close compose')}>{String.fromCodePoint(0x00d7)}</button></div><div className="writer-tool">
            <label>{t('From')}</label>
            <div className="writer-tool-row"><input value={user.emailAddress} readOnly aria-label={t('From address')} /></div>
            <small>{t('Messages stay inside ईMAIL accounts.')}</small>
          </div>
          <input type="text" aria-label={t('To')} placeholder={t('To: recipient@niti')} value={composer.to} onChange={(event) => setComposer({ ...composer, to: event.target.value })} required /><input type="text" aria-label={t('Subject')} placeholder={t('Subject')} value={composer.subject} onChange={(event) => setComposer({ ...composer, subject: event.target.value })} maxLength={200} required /><textarea aria-label={t('Message')} placeholder={t('Write your message...')} value={composer.body} onChange={(event) => setComposer({ ...composer, body: event.target.value })} maxLength={30000} required />
          <div className="attachment-controls">
            <input ref={attachmentInput} className="attachment-file-input" type="file" multiple onChange={addAttachments} aria-label={t('Choose attachments')} />
            <input ref={photoInput} className="attachment-file-input" type="file" accept="image/*" multiple onChange={addAttachments} aria-label={t('Choose photos')} />
            <button type="button" onClick={() => attachmentInput.current?.click()}>{String.fromCodePoint(0x1f4ce)} {t('Attach files')}</button>
            <button type="button" onClick={() => photoInput.current?.click()}>{String.fromCodePoint(0x1f4f7)} {t('Add photo')}</button>
          </div>
          {composer.attachments?.length > 0 && <ul className="attachment-list">{composer.attachments.map((attachment, index) => <li key={`${attachment.name}-${index}`}>
            <span>{attachment.mimeType.startsWith('image/') ? String.fromCodePoint(0x1f5bc) : String.fromCodePoint(0x1f4c4)} {attachment.name} <small>{(attachment.size / 1024).toFixed(0)} KB</small></span>
            <button type="button" aria-label={`${t('Remove')} ${attachment.name}`} onClick={() => removeAttachment(attachment, index)}>{String.fromCodePoint(0x00d7)}</button>
          </li>)}</ul>}
          {error && <p className="attachment-error" role="alert">{error}</p>}
          <div className="compose-footer"><button className="discard-btn" type="button" onClick={saveDraft}>{t('Save draft')}</button><button className="send-btn" type="submit">{t('Send message')} {'\u2197'}</button></div></form></div>}
      {settingsOpen && <div className="compose-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
        <section className="compose-box profile-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <div className="compose-header"><h3 id="settings-title">{t('Settings')}</h3><button type="button" onClick={() => setSettingsOpen(false)} aria-label={t('Close settings')}>{String.fromCodePoint(0x00d7)}</button></div>
          <div className="profile-settings-body">
            <div className="profile-settings-summary">
              <div className="avatar profile-settings-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : user.emailAddress?.[0]?.toUpperCase() ?? 'M'}</div>
              <div><strong>{t('Profile picture')}</strong><small>{profilePictureBusy ? t('Saving photo…') : t('Choose a picture for your account.')}</small></div>
            </div>
            <button className="change-profile-picture" type="button" onClick={() => profilePictureInput.current?.click()} disabled={profilePictureBusy}>{profilePictureBusy ? t('Saving…') : t('Change profile picture')}</button>
            <p className="settings-note">{t('Your picture is saved to your account and shown when you sign in.')}</p>
            <section className="settings-translate-tool" aria-labelledby="settings-language-title">
              <div><strong id="settings-language-title">{t('Translate website')}</strong><small>{t('Change the website language to Hindi or English.')}</small></div>
              <button className="change-profile-picture" type="button" onClick={() => onLanguageChange?.(language === 'hi' ? 'en' : 'hi')}>
                {language === 'hi' ? t('Translate website to English') : t('Translate website to Hindi')}
              </button>
            </section>
            <section className="manage-accounts" aria-labelledby="manage-accounts-title">
              <h4 id="manage-accounts-title">{t('Manage accounts')}</h4>
              <button className="add-account-button" type="button" onClick={() => { setAddAccountOpen((open) => !open); setAccountError(''); }}>{String.fromCodePoint(0x002b)} {t('Add account')}</button>
              {addAccountOpen && <form className="add-account-form" onSubmit={addAccount}>
                <p>{t('Sign in to another existing account. This switches the active mailbox.')}</p>
                <input type="tel" autoComplete="username" aria-label={t('Account phone number')} placeholder={t('Phone number')} value={accountPhone} onChange={(event) => setAccountPhone(event.target.value)} required />
                <PasswordInput autoComplete="current-password" aria-label={t('Account password')} placeholder={t('Password')} value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} required visible={showAccountPassword} onToggle={() => setShowAccountPassword((visible) => !visible)} language={language} />
                {accountError && <p className="add-account-error" role="alert">{accountError}</p>}
                <button className="send-btn" type="submit" disabled={accountBusy}>{accountBusy ? t('Signing in…') : t('Add and switch account')}</button>
              </form>}
              <div className="delete-account-row">
                <div><strong>{t('Delete this account')}</strong><small>{t('Permanently erase this account and mailbox.')}</small></div>
                <button className="delete-account-button" type="button" onClick={() => { setDeleteAccountOpen(true); setDeleteAccountComplete(false); setDeleteAccountError(''); setDeleteAccountConfirmation(''); setDeleteAccountPassword(''); setSettingsOpen(false); }}>{t('Delete')}</button>
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
              <button className="delete-account-close" type="button" onClick={() => setDeleteAccountOpen(false)} disabled={deleteAccountBusy} aria-label={t('Close account deletion')}>{String.fromCodePoint(0x00d7)}</button>
              <p className="delete-account-kicker">{t('ACCOUNT MANAGEMENT')}</p>
              <h2 id="delete-account-title">{t('Permanently delete account')}</h2>
              <p id="delete-account-description">{t('Review what will be removed before confirming.')}</p>
            </div>
            <div className="delete-account-dialog-content">
              <div className="delete-account-progress" aria-label={t('Deletion steps')}>
                <span aria-label={t('Deletion steps')} className={deleteAccountBusy ? 'complete' : 'active'}><i>{deleteAccountBusy ? String.fromCodePoint(0x2713) : '1'}</i> {t('Confirm identity')}</span><b></b><span className={deleteAccountBusy ? 'active' : ''}><i>2</i> {t('Delete data')}</span><b></b><span><i>3</i> {t('Complete')}</span>
              </div>
              <div className="delete-account-warning">
                <strong>{t('This action cannot be undone')}</strong>
                <p>{language === 'hi' ? <>इससे <b>{user.emailAddress}</b>, इसका मेलबॉक्स, अटैचमेंट और भेजे गए संदेश हट जाएँगे। इस खाते से भेजे गए संदेशों की प्रतियाँ प्राप्तकर्ताओं के मेलबॉक्स से भी हट जाएँगी।</> : <>This will delete <b>{user.emailAddress}</b>, its mailbox, attachments, and sent messages. Copies of messages sent by this account will also be removed from recipients' mailboxes.</>}</p>
              </div>
              <form className="delete-account-form" onSubmit={deleteCurrentAccount}>
                <label htmlFor="delete-account-password">{t('Current password')}</label>
                <PasswordInput id="delete-account-password" autoComplete="current-password" value={deleteAccountPassword} onChange={(event) => setDeleteAccountPassword(event.target.value)} required disabled={deleteAccountBusy} visible={showDeleteAccountPassword} onToggle={() => setShowDeleteAccountPassword((visible) => !visible)} language={language} />
                <label htmlFor="delete-account-email">{t('Type your account address to confirm')}</label>
                <input id="delete-account-email" type="email" autoComplete="email" placeholder={user.emailAddress} value={deleteAccountConfirmation} onChange={(event) => setDeleteAccountConfirmation(event.target.value)} required disabled={deleteAccountBusy} />
                {deleteAccountError && <p className="add-account-error" role="alert">{deleteAccountError}</p>}
                {deleteAccountBusy && <p className="delete-account-progress-message" role="status"><span className="delete-account-spinner" aria-hidden="true"></span>{t('Deleting your account and securely removing its mailbox data...')}</p>}
                <div className="delete-account-actions">
                  <button className="delete-account-cancel" type="button" onClick={() => setDeleteAccountOpen(false)} disabled={deleteAccountBusy}>{t('Cancel')}</button>
                  <button className="delete-account-submit" type="submit" disabled={deleteAccountBusy}>{deleteAccountBusy ? t('Deleting...') : t('Permanently delete account')}</button>
                </div>
              </form>
            </div>
          </> : <div className="delete-account-success" role="status">
            <div className="delete-account-success-icon" aria-hidden="true">&#10003;</div>
            <p className="delete-account-kicker">{t('PROCESS COMPLETE')}</p>
            <h2 id="delete-account-title">{t('Account deleted')}</h2>
            <p id="delete-account-description">{t('The account, mailbox data, and active sessions have been permanently removed.')}</p>
            <div className="delete-account-complete-step"><span>&#10003;</span> {t('Account and mailbox deletion complete')}</div>
            <button className="delete-account-submit" type="button" onClick={() => onAccountDeleted?.()}>{t('Return to sign in')}</button>
          </div>}
        </section>
      </div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

