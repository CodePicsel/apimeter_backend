const mongoose = require("mongoose");

const requestLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    apiKey: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ApiKey",
      required: true,
      index: true,
    },
    method: {
      type: String,
      required: true,
      uppercase: true,
    },
    path: {
      type: String,
      required: true,
      maxlength: 400,
    },
    targetBaseUrl: {
      type: String,
      maxlength: 500,
    },
    upstreamUrl: {
      type: String,
      maxlength: 1000,
    },
    upstreamPath: {
      type: String,
      maxlength: 500,
    },
    statusCode: {
      type: Number,
      required: true,
    },
    upstreamStatusCode: Number,
    responseTimeMs: {
      type: Number,
      required: true,
      min: 0,
    },
    upstreamResponseTimeMs: {
      type: Number,
      min: 0,
    },
    ip: String,
    userAgent: String,
    contentType: String,
    errorMessage: String,
    requestSize: {
      type: Number,
      default: 0,
      min: 0,
    },
    responseSize: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

requestLogSchema.index({ user: 1, createdAt: -1 });
requestLogSchema.index({ apiKey: 1, createdAt: -1 });
requestLogSchema.index({ upstreamPath: 1, createdAt: -1 });

module.exports = mongoose.model("RequestLog", requestLogSchema);
