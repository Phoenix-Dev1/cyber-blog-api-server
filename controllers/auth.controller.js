import bcrypt from "bcrypt";
import User from "../models/user.model.js";
import { env } from "../config/env.js";
import { signToken } from "../middlewares/auth.js";
import { httpError } from "../lib/httpError.js";
import { CASE_INSENSITIVE } from "../lib/text.js";

// Local registration (body checked by registerBody: e-mail is trimmed and lowercased)
export const registerUser = async (req, res) => {
  const { username, email, password } = req.body;

  const taken = await User.exists({ $or: [{ email }, { username }] }).collation(CASE_INSENSITIVE);
  if (taken) {
    throw httpError(409, "Username or email already in use");
  }

  await User.create({
    authProvider: "local",
    username,
    email,
    password: await bcrypt.hash(password, 10),
  });

  res.status(201).json({ message: "User registered successfully!" });
};

// Local login. E-mail matching ignores case.
export const loginUser = async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).collation(CASE_INSENSITIVE).select("+password");
  const ok =
    user?.authProvider === "local" && user.password && (await bcrypt.compare(password, user.password));
  if (!ok) {
    throw httpError(400, "Invalid email or password");
  }

  res.status(200).json({ message: "Login successful", token: signToken(user) });
};

// The logged-in user's own data (requireAuth loaded it)
export const getMe = (req, res) => {
  // eslint-disable-next-line no-unused-vars
  const { id, password, ...user } = req.user;
  res.status(200).json(user);
};

// After Google/GitHub: send the browser back to the client with a token, or to its login page on failure.
// The token travels in the URL fragment (#token=), which browsers never send to a server, so it can't
// end up in Vercel's or anyone's access logs. The client reads it before rendering and cleans the URL.
export const oauthDone = (req, res) => {
  res.redirect(`${env.clientUrl}/#token=${signToken(req.user)}`);
};

export const oauthFailed = (req, res) => {
  res.redirect(`${env.clientUrl}/login?error=oauth`);
};
