import { randomInt } from "node:crypto";
import User from "../models/user.model.js";
import { CASE_INSENSITIVE, USERNAME_MAX, USERNAME_MIN } from "./text.js";

// "John / Smith?" → "John Smith". Keeps letters, digits, spaces and . _ - (what a profile link can carry).
export const cleanUsername = (raw) => {
  const cleaned = String(raw ?? "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} ._-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[ ._-]+/, "")
    .slice(0, USERNAME_MAX)
    .trim();
  return cleaned.length >= USERNAME_MIN ? cleaned : `user-${randomInt(100000, 1000000)}`;
};

const usernameTaken = (username) => User.exists({ username }).collation(CASE_INSENSITIVE);

// "John Smith" → "John Smith-2", "John Smith-3", … (usernames are unique)
export const uniqueUsername = async (base) => {
  if (!(await usernameTaken(base))) return base;
  for (let n = 2; n < 50; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, USERNAME_MAX - suffix.length).trim()}${suffix}`;
    if (!(await usernameTaken(candidate))) return candidate;
  }
  return `${base.slice(0, USERNAME_MAX - 7).trim()}-${randomInt(100000, 1000000)}`;
};

// Sign-in with Google/GitHub (decision Q4):
// 1. a returning user is found by provider + provider id;
// 2. else, if the provider says the e-mail is verified, an existing account with that e-mail (any provider,
//    any case) is the same person: log into it;
// 3. else a new account. Its username gets a suffix if taken; an unverified or already-used e-mail is
//    replaced by a placeholder, so sign-up never fails on the unique fields.
export const findOrCreateOAuthUser = async ({ provider, providerId, email, emailVerified, username, img }) => {
  const returning = await User.findOne({ authProvider: provider, providerId });
  if (returning) return returning;

  const normalizedEmail = email?.trim().toLowerCase() || null;
  if (normalizedEmail && emailVerified) {
    const sameEmail = await User.findOne({ email: normalizedEmail }).collation(CASE_INSENSITIVE);
    if (sameEmail) return sameEmail;
  }

  const placeholder = `${providerId}@${provider}-placeholder.com`;
  const useEmail =
    normalizedEmail &&
    emailVerified &&
    !(await User.exists({ email: normalizedEmail }).collation(CASE_INSENSITIVE));

  return User.create({
    authProvider: provider,
    providerId,
    username: await uniqueUsername(cleanUsername(username)),
    email: useEmail ? normalizedEmail : placeholder,
    img: img || null,
  });
};
