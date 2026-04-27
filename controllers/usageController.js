const mongoose = require("mongoose");
const RequestLog = require("../models/RequestLog");

const parsePositiveInt = (value, fallback, max) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
};

const getDateFilter = (query) => {
  const days = parsePositiveInt(query.days, 30, 365);
  const from = query.from ? new Date(query.from) : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const to = query.to ? new Date(query.to) : new Date();

  return {
    createdAt: {
      $gte: Number.isNaN(from.getTime()) ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : from,
      $lte: Number.isNaN(to.getTime()) ? new Date() : to,
    },
  };
};

const getUsageMatch = (req) => {
  const match = { user: req.user._id, ...getDateFilter(req.query) };

  if (req.query.apiKeyId && mongoose.Types.ObjectId.isValid(req.query.apiKeyId)) {
    match.apiKey = new mongoose.Types.ObjectId(req.query.apiKeyId);
  }

  return match;
};

const getUsageSummary = async (req, res, next) => {
  try {
    const match = getUsageMatch(req);

    const [summary] = await RequestLog.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalRequests: { $sum: 1 },
          avgResponseTimeMs: { $avg: "$responseTimeMs" },
          errorRequests: {
            $sum: { $cond: [{ $gte: ["$statusCode", 400] }, 1, 0] },
          },
          totalResponseBytes: { $sum: "$responseSize" },
          totalRequestBytes: { $sum: "$requestSize" },
        },
      },
    ]);

    const byDay = await RequestLog.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          requests: { $sum: 1 },
          errors: { $sum: { $cond: [{ $gte: ["$statusCode", 400] }, 1, 0] } },
          avgResponseTimeMs: { $avg: "$responseTimeMs" },
          requestBytes: { $sum: "$requestSize" },
          responseBytes: { $sum: "$responseSize" },
        },
      },
      {
        $project: {
          _id: 0,
          date: "$_id",
          requests: 1,
          errors: 1,
          avgResponseTimeMs: { $round: ["$avgResponseTimeMs", 0] },
          requestBytes: 1,
          responseBytes: 1,
          transferBytes: { $add: ["$requestBytes", "$responseBytes"] },
          errorRate: {
            $cond: [
              { $eq: ["$requests", 0] },
              0,
              { $round: [{ $multiply: [{ $divide: ["$errors", "$requests"] }, 100] }, 2] },
            ],
          },
        },
      },
      { $sort: { date: 1 } },
    ]);

    const byApiKey = await RequestLog.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$apiKey",
          requests: { $sum: 1 },
          errors: { $sum: { $cond: [{ $gte: ["$statusCode", 400] }, 1, 0] } },
          requestBytes: { $sum: "$requestSize" },
          responseBytes: { $sum: "$responseSize" },
        },
      },
      {
        $lookup: {
          from: "apikeys",
          localField: "_id",
          foreignField: "_id",
          as: "apiKey",
        },
      },
      { $unwind: "$apiKey" },
      {
        $project: {
          _id: 0,
          apiKeyId: "$apiKey._id",
          name: "$apiKey.name",
          keyPreview: "$apiKey.keyPreview",
          requests: 1,
          errors: 1,
          requestBytes: 1,
          responseBytes: 1,
          transferBytes: { $add: ["$requestBytes", "$responseBytes"] },
          errorRate: {
            $cond: [
              { $eq: ["$requests", 0] },
              0,
              { $round: [{ $multiply: [{ $divide: ["$errors", "$requests"] }, 100] }, 2] },
            ],
          },
        },
      },
      { $sort: { requests: -1 } },
    ]);

    const byRoute = await RequestLog.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            method: "$method",
            upstreamPath: { $ifNull: ["$upstreamPath", "$path"] },
          },
          requests: { $sum: 1 },
          errors: { $sum: { $cond: [{ $gte: ["$statusCode", 400] }, 1, 0] } },
          avgResponseTimeMs: { $avg: "$responseTimeMs" },
          requestBytes: { $sum: "$requestSize" },
          responseBytes: { $sum: "$responseSize" },
        },
      },
      {
        $project: {
          _id: 0,
          method: "$_id.method",
          route: "$_id.upstreamPath",
          requests: 1,
          errors: 1,
          avgResponseTimeMs: { $round: ["$avgResponseTimeMs", 0] },
          requestBytes: 1,
          responseBytes: 1,
          transferBytes: { $add: ["$requestBytes", "$responseBytes"] },
          errorRate: {
            $cond: [
              { $eq: ["$requests", 0] },
              0,
              { $round: [{ $multiply: [{ $divide: ["$errors", "$requests"] }, 100] }, 2] },
            ],
          },
        },
      },
      { $sort: { requests: -1 } },
      { $limit: 20 },
    ]);

    const byStatus = await RequestLog.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$statusCode",
          requests: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          statusCode: "$_id",
          requests: 1,
        },
      },
      { $sort: { statusCode: 1 } },
    ]);

    const byMethod = await RequestLog.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$method",
          requests: { $sum: 1 },
          errors: { $sum: { $cond: [{ $gte: ["$statusCode", 400] }, 1, 0] } },
          requestBytes: { $sum: "$requestSize" },
          responseBytes: { $sum: "$responseSize" },
        },
      },
      {
        $project: {
          _id: 0,
          method: "$_id",
          requests: 1,
          errors: 1,
          requestBytes: 1,
          responseBytes: 1,
          transferBytes: { $add: ["$requestBytes", "$responseBytes"] },
        },
      },
      { $sort: { requests: -1 } },
    ]);

    res.json({
      success: true,
      data: {
        summary: {
          totalRequests: summary?.totalRequests || 0,
          errorRequests: summary?.errorRequests || 0,
          avgResponseTimeMs: Math.round(summary?.avgResponseTimeMs || 0),
          totalRequestBytes: summary?.totalRequestBytes || 0,
          totalResponseBytes: summary?.totalResponseBytes || 0,
          totalTransferBytes: (summary?.totalRequestBytes || 0) + (summary?.totalResponseBytes || 0),
        },
        byDay,
        byApiKey,
        byRoute,
        byStatus,
        byMethod,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getRequestLogs = async (req, res, next) => {
  try {
    const page = parsePositiveInt(req.query.page, 1, 100000);
    const limit = parsePositiveInt(req.query.limit, 25, 100);
    const filter = getUsageMatch(req);

    const [logs, total] = await Promise.all([
      RequestLog.find(filter)
        .populate("apiKey", "name keyPreview status")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      RequestLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      count: logs.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: { logs },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getUsageSummary, getRequestLogs };
