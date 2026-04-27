const ApiKey = require("../models/ApiKey");
const RequestLog = require("../models/RequestLog");

const getMonthRange = () => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
};

const validateApiKey = async (req, res, next) => {
  const rawKey = req.headers["x-api-key"] || req.query.api_key;

  if (!rawKey) {
    return res.status(401).json({ success: false, message: "x-api-key header is required" });
  }

  const keyHash = ApiKey.hashKey(String(rawKey));
  const apiKey = await ApiKey.findOne({ keyHash, status: "active" }).populate("user", "name email");

  if (!apiKey) {
    return res.status(401).json({ success: false, message: "Invalid or revoked API key" });
  }

  const { start, end } = getMonthRange();
  const monthlyUsage = await RequestLog.countDocuments({
    apiKey: apiKey._id,
    createdAt: { $gte: start, $lt: end },
  });

  if (monthlyUsage >= apiKey.monthlyLimit) {
    return res.status(429).json({ success: false, message: "Monthly API key limit exceeded" });
  }

  req.apiKey = apiKey;
  req.meteredUser = apiKey.user;
  return next();
};

module.exports = { validateApiKey };
