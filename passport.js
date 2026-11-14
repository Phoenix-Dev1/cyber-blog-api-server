// Google/GitHub sign-in. Stateless: the callback route signs a JWT (routes/auth.route.js); no sessions.
import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { env } from "./config/env.js";
import { findOrCreateOAuthUser } from "./lib/oauthUser.js";

const isTrue = (value) => value === true || value === "true";

passport.use(
  new GitHubStrategy(
    {
      ...env.github,
      // Relative: built from the request (https behind the tunnel thanks to "trust proxy")
      callbackURL: "/auth/github/callback",
      // Here (not only on the route) so passport-github2 fetches the account's e-mails with their flags
      scope: ["user:email"],
      allRawEmails: true,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const emails = profile.emails ?? [];
        const primary = emails.find((e) => e.primary) ?? emails[0];
        const user = await findOrCreateOAuthUser({
          provider: "github",
          providerId: profile.id,
          email: primary?.value,
          emailVerified: isTrue(primary?.verified),
          username: profile.username || profile.displayName,
          img: profile.photos?.[0]?.value,
        });
        done(null, user);
      } catch (err) {
        done(err);
      }
    }
  )
);

passport.use(
  new GoogleStrategy(
    {
      ...env.google,
      callbackURL: `${env.backendUrl}auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0];
        const user = await findOrCreateOAuthUser({
          provider: "google",
          providerId: profile.id,
          email: email?.value,
          emailVerified: isTrue(email?.verified),
          username: profile.displayName,
          img: profile.photos?.[0]?.value,
        });
        done(null, user);
      } catch (err) {
        done(err);
      }
    }
  )
);

export default passport;
