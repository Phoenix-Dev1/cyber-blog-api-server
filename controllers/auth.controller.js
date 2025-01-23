import User from "../models/user.model.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// Secret for JWT
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// Local Registration
export const registerUser = async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    // Check if the user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Username or email already in use" });
    }

    // Hash the password (10 salt rounds)
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the user
    const newUser = new User({
      authProvider: "local",
      username,
      email,
      password: hashedPassword, // Ensure hashed password is saved
    });

    await newUser.save();

    res.status(201).json({ message: "User registered successfully!" });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ message: "Error registering user", error: err.message });
  }
};

// Local Login
export const loginUser = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    // Find the user
    const user = await User.findOne({ email }).select("+password");
    // console.log("User Found:", user);

    if (!user || user.authProvider !== "local") {
      console.log("Invalid credentials or non-local auth provider");
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Check the password
    const isMatch = await bcrypt.compare(password, user.password);
    // console.log("Plain Password:", password);
    // console.log("Hashed Password:", user.password);
    // console.log("Password Match:", isMatch);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Generate a JWT
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, {
      expiresIn: "3h",
    });

    res.status(200).json({ message: "Login successful", token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error logging in", error: err.message });
  }
};

// Get User Data using token
export const getUserData = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]; // Extract the token
    if (!token) {
      return res.status(401).json({ message: "Token is required" });
    }

    const decoded = jwt.verify(token, JWT_SECRET); // Verify the token
    const user = await User.findById(decoded.id).select("-password"); // Fetch user without password
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user); // Return user data as JSON
  } catch (err) {
    console.error(err);
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

// GitHub OAuth Callback
export const githubCallback = async (req, res) => {
  try {
    // Passport attaches the authenticated user to req.user
    const user = req.user;
    //console.log(req.user.role);

    if (!user) {
      return res.status(400).json({ message: "GitHub authentication failed" });
    }

    // Generate a JWT token for the authenticated user
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, {
      expiresIn: "3h",
    });

    // Redirect the user back to the frontend with the token
    res.redirect(`${process.env.CLIENT_URL}?token=${token}`);
  } catch (err) {
    console.error("Error in GitHub callback:", err);
    res
      .status(500)
      .json({ message: "GitHub login failed", error: err.message });
  }
};

// Google OAuth Callback
export const googleCallback = async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(400).json({ message: "Google authentication failed" });
    }

    // Generate JWT
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, {
      expiresIn: "3h",
    });

    // Redirect to frontend with the token
    res.redirect(`${process.env.CLIENT_URL}?token=${token}`);
  } catch (err) {
    console.error("Error in Google callback:", err);
    res
      .status(500)
      .json({ message: "Google login failed", error: err.message });
  }
};
