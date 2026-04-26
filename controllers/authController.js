const jwt = require("jsonwebtoken");
const { z } = require("zod");
const User = require("../models/User");

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().toLowerCase(),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1),
});

const signToken = (userId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required");
  }

  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

const sendAuthResponse = (res, statusCode, user) => {
  res.status(statusCode).json({
    success: true,
    token: signToken(user._id),
    data: { user },
  });
};

const register = async (req, res, next) => {
  try {
    const payload = registerSchema.parse(req.body);
    const exists = await User.exists({ email: payload.email });

    if (exists) {
      return res.status(409).json({ success: false, message: "Email is already registered" });
    }

    const user = await User.create(payload);
    return sendAuthResponse(res, 201, user);
  } catch (error) {
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const payload = loginSchema.parse(req.body);
    const user = await User.findOne({ email: payload.email }).select("+password");

    if (!user || !(await user.comparePassword(payload.password))) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    return sendAuthResponse(res, 200, user);
  } catch (error) {
    return next(error);
  }
};

const getMe = async (req, res) => {
  res.json({ success: true, data: { user: req.user } });
};

module.exports = { register, login, getMe };
