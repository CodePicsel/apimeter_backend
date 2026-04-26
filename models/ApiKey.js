const crypto = require("crypto");
const mongoose = require("mongoose");

const apiKeySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    keyHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    keyPreview: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "revoked"],
      default: "active",
      index: true,
    },
    monthlyLimit: {
      type: Number,
      default: 10000,
      min: 1,
    },
    totalRequests: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastUsedAt: Date,
    revokedAt: Date,
  },
  { timestamps: true }
);

apiKeySchema.statics.generateRawKey = function generateRawKey() {
  const prefix = process.env.API_KEY_PREFIX || "apm";
  return `${prefix}_${crypto.randomBytes(32).toString("hex")}`;
};

apiKeySchema.statics.hashKey = function hashKey(rawKey) {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
};

apiKeySchema.statics.previewKey = function previewKey(rawKey) {
  return `${rawKey.slice(0, 8)}...${rawKey.slice(-6)}`;
};

apiKeySchema.methods.toJSON = function toJSON() {
  const apiKey = this.toObject();
  delete apiKey.keyHash;
  delete apiKey.__v;
  return apiKey;
};

module.exports = mongoose.model("ApiKey", apiKeySchema);
