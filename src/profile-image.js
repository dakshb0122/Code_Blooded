// Purpose: validate and serialize the small profile images stored with user accounts.

/** Return a browser-safe data URL when the user has a stored profile image. */
export function getAvatarDataUrl(user) {
  if (!user?.avatarData || !user.avatarMimeType) return null;
  const imageBytes = Buffer.isBuffer(user.avatarData) ? user.avatarData : Buffer.from(user.avatarData);
  if (imageBytes.length === 0) return null;
  return `data:${user.avatarMimeType};base64,${imageBytes.toString('base64')}`;
}
