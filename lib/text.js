// Case-insensitive matching for e-mails and usernames (MongoDB collation, strength 2 = ignore case)
export const CASE_INSENSITIVE = { locale: "en", strength: 2 };

// Makes user text safe to use inside a RegExp (search box): "(" or "a.c" match literally.
export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Usernames end up in profile links (/@username), so only letters, digits, spaces and . _ - are allowed.
export const USERNAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
