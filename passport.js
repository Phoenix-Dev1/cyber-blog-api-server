import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "./models/user.model.js";

// Local Keys
const USER_URL = process.env.BACKEND_URL;

// Github Keys
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

// Google Keys
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Github
passport.use(
  new GitHubStrategy(
    {
      clientID: GITHUB_CLIENT_ID,
      clientSecret: GITHUB_CLIENT_SECRET,
      callbackURL: "/auth/github/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Handle missing emails
        const email =
          profile.emails && profile.emails[0]?.value
            ? profile.emails[0].value
            : `${profile.username}@github-placeholder.com`;

        // Find or create the user
        let user = await User.findOne({
          providerId: profile.id,
          authProvider: "github",
        });

        if (!user) {
          user = await User.create({
            authProvider: "github",
            providerId: profile.id,
            username: profile.username,
            email, // Use the resolved email
            img: profile.photos[0]?.value || null,
          });
        }

        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  )
);

// Google
passport.use(
  new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: `${USER_URL}/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Extract email
        const email =
          profile.emails && profile.emails[0]?.value
            ? profile.emails[0].value
            : `${profile.id}@google-placeholder.com`;

        // Find or create user
        let user = await User.findOne({
          providerId: profile.id,
          authProvider: "google",
        });

        if (!user) {
          user = await User.create({
            authProvider: "google",
            providerId: profile.id,
            username: profile.displayName || profile.id,
            email,
            img: profile.photos[0]?.value || null,
          });
        }

        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  )
);

// Serialize user for session (not used in stateless JWT setup)
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id, (err, user) => {
    done(err, user);
  });
});

export default passport;
