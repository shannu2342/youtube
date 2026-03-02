require("dotenv").config();
require("../Database/database");
const express = require("express");
const mongoose = require("mongoose");
// Razorpay is loaded conditionally below
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const userData = require("../Models/user");
const VideoDataModel = require("../Models/videos");
const AdView = require("../Models/adViews");
const Transaction = require("../Models/transactions");
const ViewSession = require("../Models/viewSession");
const AuditLog = require("../Models/auditLog");

const monetization = express.Router();

// Initialize Razorpay only if keys are properly configured
let razorpay = null;
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const PLACEHOLDER_KEY_IDS = ["your_razorpay_key_id"];
const PLACEHOLDER_KEY_SECRETS = [
  "your_razorpay_secret_key",
  "your_razorpay_key_secret",
];

// Only initialize Razorpay if keys are valid (not placeholder and not empty)
const isRazorpayConfigured = () => {
  const keyId = (RAZORPAY_KEY_ID || "").trim();
  const keySecret = (RAZORPAY_KEY_SECRET || "").trim();

  return (
    keyId.length > 0 &&
    keySecret.length > 0 &&
    !PLACEHOLDER_KEY_IDS.includes(keyId) &&
    !PLACEHOLDER_KEY_SECRETS.includes(keySecret)
  );
};

if (isRazorpayConfigured()) {
  const Razorpay = require("razorpay");
  razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET,
  });
  console.log("Razorpay payment system initialized");
} else {
  console.log("Razorpay not configured - payment features disabled");
}

// Revenue split percentages
const CREATOR_SHARE = 0.55; // 55%
const PLATFORM_SHARE = 0.45; // 45%

// Default CPM (Cost Per 1000 views)
const DEFAULT_CPM = 100;

// Minimum withdrawal amount
const MIN_WITHDRAWAL_AMOUNT = 1000;

// Premium subscription plans
const PREMIUM_PLANS = [
  {
    id: "monthly",
    name: "1 Month",
    priceInr: 199,
    months: 1,
    recommended: false,
  },
  {
    id: "quarterly",
    name: "3 Months",
    priceInr: 499,
    months: 3,
    recommended: true,
  },
  {
    id: "yearly",
    name: "12 Months",
    priceInr: 1899,
    months: 12,
    recommended: false,
  },
];

const DEFAULT_PREMIUM_PLAN_ID = "monthly";
const PREMIUM_PLAN_INTERVAL_MONTHS = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};
const PREMIUM_SYNCABLE_STATUSES = ["active", "authenticated", "pending", "halted", "cancelled"];
const ENV_PLAN_ID_BY_PLAN = {
  monthly: process.env.RAZORPAY_PLAN_ID_MONTHLY,
  quarterly: process.env.RAZORPAY_PLAN_ID_QUARTERLY,
  yearly: process.env.RAZORPAY_PLAN_ID_YEARLY,
};
const runtimePlanIdCache = {};

const getPremiumPlan = (planId = DEFAULT_PREMIUM_PLAN_ID) =>
  PREMIUM_PLANS.find((plan) => plan.id === planId);

const createPremiumReceipt = (userId) => {
  // Razorpay receipt max length is 40 chars.
  // Keep it short while preserving traceability.
  const userSuffix = String(userId).slice(-8);
  const timePart = Date.now().toString(36);
  return `prem_${userSuffix}_${timePart}`;
};

const createPremiumPlanReference = (planId) => {
  const timePart = Date.now().toString(36);
  return `pl_${planId}_${timePart}`;
};

const isPremiumAccessActive = (subscriptionStatus, premiumExpiryDate) => {
  if (!premiumExpiryDate || Number.isNaN(new Date(premiumExpiryDate).getTime())) {
    return false;
  }
  const now = new Date();
  const expiry = new Date(premiumExpiryDate);
  const status = (subscriptionStatus || "").toLowerCase();

  if (status === "cancelled") {
    return expiry > now;
  }

  return ["active", "authenticated", "pending"].includes(status) && expiry > now;
};

const getOrCreateRazorpayPlanId = async (selectedPlan) => {
  const envPlanId = ENV_PLAN_ID_BY_PLAN[selectedPlan.id];
  if (envPlanId && envPlanId.trim()) {
    return envPlanId.trim();
  }

  const cachedPlanId = runtimePlanIdCache[selectedPlan.id];
  if (cachedPlanId) {
    return cachedPlanId;
  }

  const interval = PREMIUM_PLAN_INTERVAL_MONTHS[selectedPlan.id] || selectedPlan.months || 1;
  const plan = await razorpay.plans.create({
    period: "monthly",
    interval,
    item: {
      name: `YouTube Premium ${selectedPlan.name}`,
      amount: selectedPlan.priceInr * 100,
      currency: "INR",
      description: `Auto-renewing ${selectedPlan.name} premium plan`,
    },
    notes: {
      planId: selectedPlan.id,
      app: "youtube_clone",
    },
  });

  runtimePlanIdCache[selectedPlan.id] = plan.id;
  return plan.id;
};

const syncPremiumStatusFromRazorpay = async (user) => {
  if (!isRazorpayConfigured() || !user?.premiumSubscriptionId) {
    return user;
  }

  try {
    const subscription = await razorpay.subscriptions.fetch(user.premiumSubscriptionId);
    const status = subscription?.status || null;
    const nextEnd = subscription?.current_end
      ? new Date(subscription.current_end * 1000)
      : user.premiumExpiryDate;

    user.premiumSubscriptionStatus = status;
    user.premiumExpiryDate = nextEnd || null;
    user.isPremium = isPremiumAccessActive(status, nextEnd);
    await user.save();
  } catch (error) {
    console.error("Error syncing premium subscription status:", error?.error || error?.message || error);
  }

  return user;
};

// DEV-ONLY: Set yourself as admin (use with caution)
// POST /api/monetization/dev-set-admin?email=your@email.com&secret=your_seed_secret
// Or set SEED_SECRET in .env and use header x-seed-secret
monetization.post('/dev-set-admin', async (req, res) => {
  const { email, secret } = req.query;
  const envSecret = process.env.SEED_SECRET;
  
  // Allow if no secret configured OR secret matches
  const isAuthorized = !envSecret || secret === envSecret;
  
  if (!isAuthorized) {
    return res.status(403).json({ 
      success: false, 
      message: "Invalid secret. Set SEED_SECRET in .env or provide correct secret." 
    });
  }
  
  if (!email) {
    return res.status(400).json({ 
      success: false, 
      message: "Email query parameter required. Use ?email=your@email.com" 
    });
  }
  
  try {
    const user = await userData.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    user.role = "admin";
    await user.save();
    
    res.json({ 
      success: true, 
      message: `User ${email} is now an admin!` 
    });
  } catch (error) {
    console.error("Error setting admin:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Middleware to verify JWT and get user
const verifyToken = async (req, res, next) => {
  try {
    const token = req.cookies?.accessToken || req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: "No token provided" });
    }
    
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    const user = await userData.findById(decoded.id).select("-password");
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

// Middleware to verify admin
const verifyAdmin = async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: "Admin access required" });
  }
  next();
};

// Middleware to verify creator
const verifyCreator = async (req, res, next) => {
  // Allow if user has creator role OR if they have a channel (existing users)
  if (req.user.role === 'creator' || req.user.role === 'admin' || req.user.hasChannel) {
    next();
  } else {
    return res.status(403).json({ success: false, message: "Creator access required" });
  }
};

// ============================================================================
// CPM-BASED REVENUE CALCULATION
// ============================================================================

/**
 * Calculate revenue based on CPM
 * Revenue per view = CPM / 1000
 * Example: CPM = ₹100, Revenue per view = 100 / 1000 = ₹0.1
 */
const calculateRevenue = (cpm) => {
  return cpm / 1000;
};

// ============================================================================
// AD VIEW ENDPOINTS
// ============================================================================

/**
 * Start a view session when user starts watching a video
 * POST /api/monetization/start-view
 */
monetization.post('/start-view', verifyToken, async (req, res) => {
  try {
    const { videoId } = req.body;
    const syncedUser = await syncPremiumStatusFromRazorpay(req.user);
    const viewerId = syncedUser._id;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    if (!videoId) {
      return res.status(400).json({ success: false, message: "Video ID required" });
    }

    // Find the video
    const video = await VideoDataModel.findById(videoId);
    if (!video) {
      return res.status(404).json({ success: false, message: "Video not found" });
    }

    // Check if video is monetized
    if (!video.isMonetized) {
      return res.status(200).json({ 
        success: true, 
        shouldShowAd: false,
        reason: "Video not monetized"
      });
    }

    // Check if user is premium (no ads for premium users)
    if (syncedUser.isPremium && syncedUser.premiumExpiryDate > new Date()) {
      return res.status(200).json({ 
        success: true, 
        shouldShowAd: false,
        reason: "User is premium"
      });
    }

    // Check for existing session in last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingSession = await ViewSession.findOne({
      video_id: videoId,
      viewer_id: viewerId,
      session_start: { $gte: twentyFourHoursAgo }
    });

    let canMonetize = true;
    if (existingSession && existingSession.last_ad_view) {
      const timeSinceLastAd = Date.now() - existingSession.last_ad_view.getTime();
      if (timeSinceLastAd < 24 * 60 * 60 * 1000) {
        canMonetize = false;
      }
    }

    // Create or update session
    if (!existingSession) {
      const newSession = new ViewSession({
        video_id: videoId,
        viewer_id: viewerId,
        ip_address: ipAddress,
        user_agent: userAgent,
        session_start: new Date()
      });
      await newSession.save();
    }

    // Get CPM for the video
    const cpm = video.cpm || DEFAULT_CPM;

    res.status(200).json({
      success: true,
      shouldShowAd: canMonetize,
      videoId,
      cpm,
      revenuePerView: calculateRevenue(cpm)
    });
  } catch (error) {
    console.error("Error starting view session:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Record ad view and distribute revenue
 * POST /api/monetization/record-ad-view
 */
monetization.post('/record-ad-view', verifyToken, async (req, res) => {
  try {
    const { videoId, adCompleted = true } = req.body;
    const syncedUser = await syncPremiumStatusFromRazorpay(req.user);
    const viewerId = syncedUser._id;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    if (!videoId) {
      return res.status(400).json({ success: false, message: "Video ID required" });
    }

    // Find the video
    const video = await VideoDataModel.findById(videoId);
    if (!video) {
      return res.status(404).json({ success: false, message: "Video not found" });
    }

    // Check if video is monetized
    if (!video.isMonetized) {
      return res.status(400).json({ success: false, message: "Video not monetized" });
    }

    // Check if user is premium
    if (syncedUser.isPremium && syncedUser.premiumExpiryDate > new Date()) {
      return res.status(400).json({ success: false, message: "Premium users don't see ads" });
    }

    // Check if video has VideoData entries
    if (!video.VideoData || video.VideoData.length === 0) {
      return res.status(400).json({ success: false, message: "Video has no data" });
    }

    // Check for 24-hour monetized view limit
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingSession = await ViewSession.findOne({
      video_id: videoId,
      viewer_id: viewerId,
      session_start: { $gte: twentyFourHoursAgo }
    });

    if (existingSession && existingSession.last_ad_view) {
      const timeSinceLastAd = Date.now() - existingSession.last_ad_view.getTime();
      if (timeSinceLastAd < 24 * 60 * 60 * 1000) {
        return res.status(400).json({ 
          success: false, 
          message: "Ad already shown in last 24 hours for this video" 
        });
      }
    }

    // Calculate revenue based on CPM
    const cpm = video.cpm || DEFAULT_CPM;
    const totalRevenue = calculateRevenue(cpm);
    const creatorRevenue = totalRevenue * CREATOR_SHARE;
    const platformRevenue = totalRevenue * PLATFORM_SHARE;

    // Get creator's user data
    const creator = await userData.findById(video.creator_id);
    if (!creator) {
      return res.status(404).json({ success: false, message: "Creator not found" });
    }

    // Create ad view record
    const adView = new AdView({
      video_id: videoId,
      viewer_id: viewerId,
      ad_revenue_generated: totalRevenue,
      creator_share: creatorRevenue,
      platform_share: platformRevenue,
      cpm: cpm,
      ip_address: ipAddress,
      user_agent: userAgent,
      is_monetized: adCompleted
    });
    await adView.save();

    // Use atomic update for wallet and earnings
    await userData.findByIdAndUpdate(video.creator_id, {
      $inc: { 
        wallet_balance: creatorRevenue,
        total_earnings: creatorRevenue
      }
    });

    // Update video's total revenue and views atomically
    const videoDataEntry = video.VideoData[0];
    await VideoDataModel.updateOne(
      { _id: videoId, "VideoData._id": videoDataEntry._id },
      {
        $inc: {
          "VideoData.$.total_revenue": totalRevenue,
          "VideoData.$.total_views": 1,
          "VideoData.$.monetized_views": 1
        }
      }
    );

    // Create earning transaction
    const transaction = new Transaction({
      creator_id: video.creator_id,
      amount: creatorRevenue,
      type: 'earning',
      status: 'completed',
      video_id: videoId,
      ad_view_id: adView._id
    });
    await transaction.save();

    // Create audit log entry
    await AuditLog.create({
      event_type: 'ad_view',
      user_id: viewerId,
      user_email: req.user.email,
      ip_address: ipAddress,
      user_agent: userAgent,
      amount: creatorRevenue,
      video_id: videoId,
      transaction_id: transaction._id,
      ad_view_id: adView._id,
      revenue_details: {
        creator_share: creatorRevenue,
        platform_share: platformRevenue,
        cpm: cpm
      },
      status: 'success',
      risk_score: 0,
      metadata: {
        creator_id: video.creator_id,
        revenue_per_view: totalRevenue
      }
    });

    // Update view session
    if (existingSession) {
      existingSession.last_ad_view = new Date();
      existingSession.ads_viewed_count += 1;
      existingSession.ad_shown = true;
      await existingSession.save();
    }

    res.status(200).json({
      success: true,
      message: "Ad view recorded",
      data: {
        totalRevenue,
        creatorRevenue,
        platformRevenue,
        cpm,
        transactionId: transaction._id
      }
    });
  } catch (error) {
    console.error("Error recording ad view:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================================
// CREATOR DASHBOARD ENDPOINTS
// ============================================================================

/**
 * Get creator dashboard data
 * GET /api/monetization/dashboard
 */
monetization.get('/dashboard', verifyToken, verifyCreator, async (req, res) => {
  try {
    const creatorId = req.user._id;

    // Get user's wallet info
    const user = await userData.findById(creatorId);

    // Get all videos for this creator
    const videos = await VideoDataModel.find({ creator_id: creatorId });

    // Calculate totals
    let totalViews = 0;
    let totalRevenue = 0;
    const videoStats = [];

    videos.forEach(video => {
      video.VideoData.forEach(v => {
        totalViews += v.total_views || 0;
        totalRevenue += v.total_revenue || 0;
        videoStats.push({
          videoId: v._id,
          title: v.Title,
          thumbnail: v.thumbnailURL,
          views: v.total_views || 0,
          revenue: v.total_revenue || 0,
          likes: v.likes || 0
        });
      });
    });

    // Get monthly earnings for the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const monthlyEarnings = await Transaction.aggregate([
      {
        $match: {
          creator_id: creatorId,
          type: 'earning',
          status: 'completed',
          created_at: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$created_at" },
            month: { $month: "$created_at" }
          },
          total: { $sum: "$amount" }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    // Format monthly earnings
    const monthlyData = Array(6).fill(0);
    monthlyEarnings.forEach(earning => {
      const monthIndex = (earning._id.year - new Date().getFullYear()) * 12 + earning._id.month - new Date().getMonth() - 1;
      if (monthIndex >= 0 && monthIndex < 6) {
        monthlyData[5 - monthIndex] = earning.total;
      }
    });

    res.status(200).json({
      success: true,
      dashboard: {
        walletBalance: user.wallet_balance || 0,
        totalEarnings: user.total_earnings || 0,
        totalViews,
        totalRevenue,
        videoStats: videoStats.sort((a, b) => b.revenue - a.revenue).slice(0, 10),
        monthlyEarnings: monthlyData,
        isMonetized: user.role === 'creator' || user.hasChannel
      }
    });
  } catch (error) {
    console.error("Error fetching dashboard:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get video-specific analytics
 * GET /api/monetization/video-analytics/:videoId
 */
monetization.get('/video-analytics/:videoId', verifyToken, verifyCreator, async (req, res) => {
  try {
    const { videoId } = req.params;
    const creatorId = req.user._id;

    const video = await VideoDataModel.findOne({
      _id: videoId,
      creator_id: creatorId
    });

    if (!video) {
      return res.status(404).json({ success: false, message: "Video not found" });
    }

    const videoData = video.VideoData[0];

    // Get ad views for this video
    const adViews = await AdView.find({ video_id: videoId })
      .sort({ timestamp: -1 })
      .limit(100);

    // Get daily views for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyViews = await AdView.aggregate([
      {
        $match: {
          video_id: new mongoose.Types.ObjectId(videoId),
          timestamp: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$timestamp" }
          },
          views: { $sum: 1 },
          revenue: { $sum: "$creator_share" }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    res.status(200).json({
      success: true,
      analytics: {
        videoId,
        title: videoData.Title,
        totalViews: videoData.total_views || 0,
        monetizedViews: videoData.monetized_views || 0,
        totalRevenue: videoData.total_revenue || 0,
        cpm: video.cpm || DEFAULT_CPM,
        dailyViews,
        recentAdViews: adViews.slice(0, 10).map(av => ({
          timestamp: av.timestamp,
          revenue: av.creator_share,
          viewer: av.viewer_id
        }))
      }
    });
  } catch (error) {
    console.error("Error fetching video analytics:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================================
// WITHDRAWAL SYSTEM
// ============================================================================

/**
 * Request withdrawal
 * POST /api/monetization/withdraw
 */
monetization.post('/withdraw', verifyToken, verifyCreator, async (req, res) => {
  try {
    const { amount } = req.body;
    const creatorId = req.user._id;

    if (!amount || amount < MIN_WITHDRAWAL_AMOUNT) {
      return res.status(400).json({ 
        success: false, 
        message: `Minimum withdrawal amount is ₹${MIN_WITHDRAWAL_AMOUNT}` 
      });
    }

    const user = await userData.findById(creatorId);

    if (user.wallet_balance < amount) {
      return res.status(400).json({ 
        success: false, 
        message: "Insufficient balance" 
      });
    }

    // Check if bank details are set
    if (!user.bankDetails || !user.bankDetails.accountNumber) {
      return res.status(400).json({ 
        success: false, 
        message: "Please set up your bank details first" 
      });
    }

    // Atomically deduct from wallet using findOneAndUpdate to prevent race conditions
    const updatedUser = await userData.findOneAndUpdate(
      { _id: creatorId, wallet_balance: { $gte: amount } },
      { $inc: { wallet_balance: -amount } },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(400).json({ 
        success: false, 
        message: "Insufficient balance or user not found" 
      });
    }

    // Create withdrawal transaction
    const transaction = new Transaction({
      creator_id: creatorId,
      amount: amount,
      type: 'withdrawal',
      status: 'pending',
      withdrawal_details: {
        bank_reference: `BANK_${Date.now()}`
      }
    });
    await transaction.save();

    // TODO: Trigger Razorpay payout here (requires business account)
    // For now, we'll mark as pending for admin approval

    res.status(200).json({
      success: true,
      message: "Withdrawal request submitted",
      transactionId: transaction._id,
      remainingBalance: updatedUser.wallet_balance
    });
  } catch (error) {
    console.error("Error processing withdrawal:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get withdrawal history
 * GET /api/monetization/withdrawal-history
 */
monetization.get('/withdrawal-history', verifyToken, verifyCreator, async (req, res) => {
  try {
    const creatorId = req.user._id;

    const transactions = await Transaction.find({
      creator_id: creatorId,
      type: 'withdrawal'
    }).sort({ created_at: -1 });

    res.status(200).json({
      success: true,
      transactions
    });
  } catch (error) {
    console.error("Error fetching withdrawal history:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get pending withdrawals (Admin only)
 * GET /api/monetization/pending-withdrawals
 */
monetization.get('/pending-withdrawals', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const transactions = await Transaction.find({
      type: 'withdrawal',
      status: 'pending'
    })
    .populate('creator_id', 'name email bankDetails')
    .sort({ created_at: -1 });

    res.status(200).json({
      success: true,
      transactions
    });
  } catch (error) {
    console.error("Error fetching pending withdrawals:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Approve/reject withdrawal (Admin only)
 * POST /api/monetization/approve-withdrawal
 */
monetization.post('/approve-withdrawal', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { transactionId, approved, failureReason } = req.body;
    const adminId = req.user._id;

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    if (transaction.type !== 'withdrawal' || transaction.status !== 'pending') {
      return res.status(400).json({ success: false, message: "Invalid transaction" });
    }

    if (approved) {
      // TODO: Actually process Razorpay payout here
      transaction.status = 'approved';
      transaction.approved_by = adminId;
      transaction.approved_at = new Date();
      
      // Simulate payout success
      transaction.withdrawal_details.razorpay_withdrawal_id = `RZP_W_${Date.now()}`;
      transaction.status = 'completed';
    } else {
      transaction.status = 'rejected';
      transaction.withdrawal_details.failure_reason = failureReason || 'Rejected by admin';
      
      // Refund the amount
      const creator = await userData.findById(transaction.creator_id);
      creator.wallet_balance += transaction.amount;
      await creator.save();
    }

    await transaction.save();

    res.status(200).json({
      success: true,
      message: approved ? "Withdrawal approved" : "Withdrawal rejected",
      transaction
    });
  } catch (error) {
    console.error("Error approving withdrawal:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Update bank details
 * POST /api/monetization/update-bank-details
 */
monetization.post('/update-bank-details', verifyToken, verifyCreator, async (req, res) => {
  try {
    const { accountNumber, accountHolderName, ifscCode, bankName } = req.body;
    const creatorId = req.user._id;

    if (!accountNumber || !accountHolderName || !ifscCode || !bankName) {
      return res.status(400).json({ 
        success: false, 
        message: "All bank details are required" 
      });
    }

    // Validate account number (basic validation)
    if (accountNumber.length < 9 || accountNumber.length > 18) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid account number" 
      });
    }

    // Validate IFSC code
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid IFSC code" 
      });
    }

    const user = await userData.findById(creatorId);
    user.bankDetails = {
      accountNumber,
      accountHolderName,
      ifscCode,
      bankName
    };
    await user.save();

    // Return masked account number for security
    const maskedAccount = accountNumber.slice(-4).padStart(accountNumber.length, '*');

    res.status(200).json({
      success: true,
      message: "Bank details updated successfully",
      bankDetails: {
        accountNumber: maskedAccount,
        accountHolderName,
        ifscCode,
        bankName
      }
    });
  } catch (error) {
    console.error("Error updating bank details:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================================
// PREMIUM SUBSCRIPTION
// ============================================================================

/**
 * Get available premium plans
 * GET /api/monetization/premium-plans
 */
monetization.get('/premium-plans', (req, res) => {
  res.status(200).json({
    success: true,
    defaultPlanId: DEFAULT_PREMIUM_PLAN_ID,
    plans: PREMIUM_PLANS,
  });
});

/**
 * Create Razorpay order for premium subscription
 * POST /api/monetization/create-premium-order
 */
monetization.post('/create-premium-order', verifyToken, async (req, res) => {
  try {
    const { planId = DEFAULT_PREMIUM_PLAN_ID } = req.body || {};
    const user = req.user;
    const selectedPlan = getPremiumPlan(planId);

    if (!selectedPlan) {
      return res.status(400).json({
        success: false,
        message: 'Invalid premium plan selected',
      });
    }

    if (!isRazorpayConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Payment system not configured. Please contact admin.',
        needsSetup: true,
      });
    }

    if (user.isPremium && user.premiumExpiryDate > new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Already a premium member',
        expiryDate: user.premiumExpiryDate,
      });
    }

    const options = {
      amount: selectedPlan.priceInr * 100,
      currency: 'INR',
      receipt: createPremiumReceipt(user._id),
      notes: {
        userId: user._id.toString(),
        type: 'premium_subscription',
        planId: selectedPlan.id,
        planMonths: String(selectedPlan.months),
      },
    };

    const order = await razorpay.orders.create(options);

    res.status(200).json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      planId: selectedPlan.id,
      planName: selectedPlan.name,
      priceInr: selectedPlan.priceInr,
    });
  } catch (error) {
    console.error('Error creating premium order:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Create Razorpay recurring subscription for premium membership
 * POST /api/monetization/create-premium-subscription
 */
monetization.post('/create-premium-subscription', verifyToken, async (req, res) => {
  try {
    const { planId = DEFAULT_PREMIUM_PLAN_ID } = req.body || {};
    const user = req.user;
    const selectedPlan = getPremiumPlan(planId);

    if (!selectedPlan) {
      return res.status(400).json({
        success: false,
        message: 'Invalid premium plan selected',
      });
    }

    if (!isRazorpayConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Payment system not configured. Please contact admin.',
        needsSetup: true,
      });
    }

    if (user.isPremium && user.premiumExpiryDate > new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Already a premium member',
        expiryDate: user.premiumExpiryDate,
      });
    }

    const planRef = createPremiumPlanReference(selectedPlan.id);
    const razorpayPlanId = await getOrCreateRazorpayPlanId(selectedPlan);
    const subscription = await razorpay.subscriptions.create({
      plan_id: razorpayPlanId,
      total_count: 120,
      customer_notify: 1,
      quantity: 1,
      notes: {
        userId: user._id.toString(),
        type: 'premium_subscription',
        planId: selectedPlan.id,
        planRef,
      },
    });

    res.status(200).json({
      success: true,
      subscriptionId: subscription.id,
      razorpayPlanId,
      planId: selectedPlan.id,
      planName: selectedPlan.name,
      priceInr: selectedPlan.priceInr,
    });
  } catch (error) {
    console.error('Error creating premium subscription:', error);
    res.status(500).json({ success: false, message: error?.error?.description || error.message });
  }
});

/**
 * Verify and activate premium subscription
 * POST /api/monetization/verify-premium-payment
 */
monetization.post('/verify-premium-payment', verifyToken, async (req, res) => {
  try {
    const {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      planId = DEFAULT_PREMIUM_PLAN_ID,
    } = req.body;
    const user = req.user;
    const selectedPlan = getPremiumPlan(planId);

    if (!selectedPlan) {
      return res.status(400).json({
        success: false,
        message: 'Invalid premium plan selected',
      });
    }

    if (!isRazorpayConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Payment system not configured. Please contact admin.',
      });
    }

    const body = razorpayOrderId + '|' + razorpayPaymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid signature',
      });
    }

    try {
      const payment = await razorpay.payments.fetch(razorpayPaymentId);

      if (payment.status !== 'captured') {
        return res.status(400).json({
          success: false,
          message: `Payment not successful. Status: ${payment.status}`,
        });
      }

      const expectedAmount = selectedPlan.priceInr * 100;
      if (payment.amount !== expectedAmount) {
        return res.status(400).json({
          success: false,
          message: 'Payment amount mismatch',
        });
      }
    } catch (razorpayError) {
      console.error('Razorpay API error:', razorpayError);
      return res.status(400).json({
        success: false,
        message: 'Failed to verify payment with payment provider',
      });
    }

    const subscriptionStart = new Date();
    const subscriptionEnd = new Date();
    subscriptionEnd.setMonth(subscriptionEnd.getMonth() + selectedPlan.months);

    user.isPremium = true;
    user.premiumExpiryDate = subscriptionEnd;
    await user.save();

    const transaction = new Transaction({
      creator_id: user._id,
      amount: selectedPlan.priceInr,
      type: 'premium_subscription',
      status: 'completed',
      subscription_details: {
        subscriber_id: user._id,
        subscription_start: subscriptionStart,
        subscription_end: subscriptionEnd,
        razorpay_subscription_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
      },
    });
    await transaction.save();

    res.status(200).json({
      success: true,
      message: 'Premium subscription activated',
      premiumExpiryDate: subscriptionEnd,
      planId: selectedPlan.id,
      planName: selectedPlan.name,
    });
  } catch (error) {
    console.error('Error verifying premium payment:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Verify and activate recurring premium subscription
 * POST /api/monetization/verify-premium-subscription
 */
monetization.post('/verify-premium-subscription', verifyToken, async (req, res) => {
  try {
    const {
      razorpaySubscriptionId,
      razorpayPaymentId,
      razorpaySignature,
      planId = DEFAULT_PREMIUM_PLAN_ID,
    } = req.body || {};
    const user = req.user;
    const selectedPlan = getPremiumPlan(planId);

    if (!selectedPlan) {
      return res.status(400).json({
        success: false,
        message: 'Invalid premium plan selected',
      });
    }

    if (!razorpaySubscriptionId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: 'Missing payment verification details',
      });
    }

    if (!isRazorpayConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Payment system not configured. Please contact admin.',
      });
    }

    const body = `${razorpayPaymentId}|${razorpaySubscriptionId}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid signature',
      });
    }

    let subscription;
    let payment;
    try {
      subscription = await razorpay.subscriptions.fetch(razorpaySubscriptionId);
      payment = await razorpay.payments.fetch(razorpayPaymentId);

      const expectedAmount = selectedPlan.priceInr * 100;
      if (payment.amount !== expectedAmount) {
        return res.status(400).json({
          success: false,
          message: 'Payment amount mismatch',
        });
      }

      if (!["captured", "authorized"].includes(payment.status)) {
        return res.status(400).json({
          success: false,
          message: `Payment not successful. Status: ${payment.status}`,
        });
      }
    } catch (razorpayError) {
      console.error('Razorpay API error:', razorpayError);
      return res.status(400).json({
        success: false,
        message: 'Failed to verify payment with payment provider',
      });
    }

    const subscriptionStart = subscription?.start_at
      ? new Date(subscription.start_at * 1000)
      : new Date();
    const subscriptionEnd = subscription?.current_end
      ? new Date(subscription.current_end * 1000)
      : new Date(Date.now() + selectedPlan.months * 30 * 24 * 60 * 60 * 1000);
    const subscriptionStatus = subscription?.status || "active";

    user.isPremium = isPremiumAccessActive(subscriptionStatus, subscriptionEnd);
    user.premiumExpiryDate = subscriptionEnd;
    user.premiumSubscriptionId = razorpaySubscriptionId;
    user.premiumPlanId = selectedPlan.id;
    user.premiumSubscriptionStatus = subscriptionStatus;
    await user.save();

    const transaction = new Transaction({
      creator_id: user._id,
      amount: selectedPlan.priceInr,
      type: 'premium_subscription',
      status: 'completed',
      subscription_details: {
        subscriber_id: user._id,
        subscription_start: subscriptionStart,
        subscription_end: subscriptionEnd,
        razorpay_subscription_id: razorpaySubscriptionId,
        razorpay_payment_id: razorpayPaymentId,
      },
    });
    await transaction.save();

    res.status(200).json({
      success: true,
      message: 'Premium subscription activated',
      premiumExpiryDate: subscriptionEnd,
      subscriptionStatus,
      planId: selectedPlan.id,
      planName: selectedPlan.name,
    });
  } catch (error) {
    console.error('Error verifying premium subscription:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get premium status
 * GET /api/monetization/premium-status
 */
monetization.get('/premium-status', verifyToken, async (req, res) => {
  try {
    const user = await userData.findById(req.user._id);
    await syncPremiumStatusFromRazorpay(user);
    const isPremium = user.isPremium && user.premiumExpiryDate > new Date();

    res.status(200).json({
      success: true,
      isPremium,
      premiumExpiryDate: user.premiumExpiryDate,
      premiumSubscriptionId: user.premiumSubscriptionId,
      premiumPlanId: user.premiumPlanId,
      premiumSubscriptionStatus: user.premiumSubscriptionStatus,
      PREMIUM_PRICE_INR: PREMIUM_PLANS.find((plan) => plan.id === DEFAULT_PREMIUM_PLAN_ID)?.priceInr || 199,
      plans: PREMIUM_PLANS,
    });
  } catch (error) {
    console.error('Error fetching premium status:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================================
// MONETIZATION SETTINGS
// ============================================================================

// YouTube Monetization Requirements
const MONETIZATION_REQUIREMENTS = {
  MIN_SUBSCRIBERS: 1000,
  MIN_WATCH_HOURS: 4000
};

/**
 * Check if creator meets monetization requirements
 */
const checkMonetizationEligibility = (user) => {
  const { channel_stats } = user;
  return (
    channel_stats.subscriber_count >= MONETIZATION_REQUIREMENTS.MIN_SUBSCRIBERS &&
    channel_stats.total_watch_hours >= MONETIZATION_REQUIREMENTS.MIN_WATCH_HOURS
  );
};

/**
 * Enable/disable monetization for creator
 * POST /api/monetization/enable-monetization
 */
monetization.post('/enable-monetization', verifyToken, async (req, res) => {
  try {
    const { enable } = req.body;
    const user = await userData.findById(req.user._id);

    // Check eligibility if enabling monetization
    if (enable) {
      const isEligible = checkMonetizationEligibility(user);
      
      if (!isEligible) {
        return res.status(400).json({
          success: false,
          message: `You need ${MONETIZATION_REQUIREMENTS.MIN_SUBSCRIBERS} subscribers and ${MONETIZATION_REQUIREMENTS.MIN_WATCH_HOURS} watch hours to enable monetization`,
          requirements: {
            required_subscribers: MONETIZATION_REQUIREMENTS.MIN_SUBSCRIBERS,
            required_watch_hours: MONETIZATION_REQUIREMENTS.MIN_WATCH_HOURS,
            current_subscribers: user.channel_stats?.subscriber_count || 0,
            current_watch_hours: user.channel_stats?.total_watch_hours || 0
          }
        });
      }
      
      // Mark as meeting requirements and set enable date
      user.channel_stats = user.channel_stats || {};
      user.channel_stats.meets_monetization_requirements = true;
      user.channel_stats.monetization_enabled_date = new Date();
    }

    // Allow monetization if user has creator role OR has a channel
    if (enable && !user.role) {
      // Upgrade to creator role if not set
      user.role = 'creator';
    }
    
    // If user has a channel but no role, set role to creator automatically
    if (enable && user.hasChannel && user.role !== 'creator' && user.role !== 'admin') {
      user.role = 'creator';
    }

    // Update all creator's videos monetization status
    await VideoDataModel.updateMany(
      { creator_id: user._id },
      { isMonetized: enable }
    );

    await user.save();

    res.status(200).json({
      success: true,
      message: enable ? "Monetization enabled" : "Monetization disabled",
      requirements: {
        required_subscribers: MONETIZATION_REQUIREMENTS.MIN_SUBSCRIBERS,
        required_watch_hours: MONETIZATION_REQUIREMENTS.MIN_WATCH_HOURS,
        current_subscribers: user.channel_stats?.subscriber_count || 0,
        current_watch_hours: user.channel_stats?.total_watch_hours || 0,
        meets_requirements: enable ? true : checkMonetizationEligibility(user)
      }
    });
  } catch (error) {
    console.error("Error updating monetization:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Update video CPM
 * POST /api/monetization/update-cpm
 */
monetization.post('/update-cpm', verifyToken, verifyCreator, async (req, res) => {
  try {
    const { videoId, cpm } = req.body;
    
    if (cpm < 10 || cpm > 1000) {
      return res.status(400).json({ 
        success: false, 
        message: "CPM must be between ₹10 and ₹1000" 
      });
    }

    const video = await VideoDataModel.findOne({
      _id: videoId,
      creator_id: req.user._id
    });

    if (!video) {
      return res.status(404).json({ success: false, message: "Video not found" });
    }

    video.cpm = cpm;
    await video.save();

    res.status(200).json({
      success: true,
      message: "CPM updated",
      newCpm: cpm,
      revenuePerView: calculateRevenue(cpm)
    });
  } catch (error) {
    console.error("Error updating CPM:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================================
// STATS & ANALYTICS
// ============================================================================

/**
 * Get overall platform stats (Admin only)
 * GET /api/monetization/platform-stats
 */
monetization.get('/platform-stats', verifyToken, verifyAdmin, async (req, res) => {
  try {
    // Total earnings
    const totalEarnings = await Transaction.aggregate([
      { $match: { type: 'earning', status: 'completed' } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    // Total withdrawals
    const totalWithdrawals = await Transaction.aggregate([
      { $match: { type: 'withdrawal', status: 'completed' } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    // Total premium subscriptions
    const totalPremiumRevenue = await Transaction.aggregate([
      { $match: { type: 'premium_subscription', status: 'completed' } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    // Total creators
    const totalCreators = await userData.countDocuments({ role: 'creator' });

    // Total premium users
    const totalPremiumUsers = await userData.countDocuments({
      isPremium: true,
      premiumExpiryDate: { $gt: new Date() }
    });

    // Total ad views
    const totalAdViews = await AdView.countDocuments();

    res.status(200).json({
      success: true,
      stats: {
        totalEarnings: totalEarnings[0]?.total || 0,
        totalWithdrawals: totalWithdrawals[0]?.total || 0,
        totalPremiumRevenue: totalPremiumRevenue[0]?.total || 0,
        totalCreators,
        totalPremiumUsers,
        totalAdViews,
        platformRevenue: (totalEarnings[0]?.total || 0) * PLATFORM_SHARE
      }
    });
  } catch (error) {
    console.error("Error fetching platform stats:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get audit logs (Admin only)
 * GET /api/monetization/audit-logs
 */
monetization.get('/audit-logs', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, eventType, status, userId, startDate, endDate } = req.query;
    
    const query = {};
    
    if (eventType) query.event_type = eventType;
    if (status) query.status = status;
    if (userId) query.user_id = userId;
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('user_id', 'name email role')
      .populate('video_id', 'email');

    const total = await AuditLog.countDocuments(query);

    res.status(200).json({
      success: true,
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get flagged transactions (Admin only)
 * GET /api/monetization/flagged-transactions
 */
monetization.get('/flagged-transactions', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const flaggedLogs = await AuditLog.find({ status: 'flagged' })
      .sort({ timestamp: -1 })
      .limit(100);

    res.status(200).json({
      success: true,
      flaggedTransactions: flaggedLogs
    });
  } catch (error) {
    console.error("Error fetching flagged transactions:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================================
// PUBLIC CONFIG ENDPOINT
// ============================================================================

/**
 * Get Razorpay public key (no auth required)
 * GET /api/monetization/config
 */
monetization.get('/config', (req, res) => {
  if (!isRazorpayConfigured()) {
    return res.status(503).json({
      success: false,
      message: "Payment system not configured",
      razorpayKeyId: ''
    });
  }
  res.status(200).json({
    success: true,
    razorpayKeyId: RAZORPAY_KEY_ID
  });
});

// ============================================================================
// CHANNEL STATS & WATCH TIME TRACKING
// ============================================================================

/**
 * Track watch time when user watches a video
 * POST /api/monetization/track-watch-time
 */
monetization.post('/track-watch-time', verifyToken, async (req, res) => {
  try {
    const { videoId, watchTimeSeconds } = req.body;
    
    if (!videoId || !watchTimeSeconds) {
      return res.status(400).json({ 
        success: false, 
        message: "Video ID and watch time required" 
      });
    }

    // Find the video
    const video = await VideoDataModel.findById(videoId);
    if (!video) {
      return res.status(404).json({ 
        success: false, 
        message: "Video not found" 
      });
    }

    // Update creator's watch time (convert seconds to hours)
    const watchTimeHours = watchTimeSeconds / 3600;
    
    await userData.findByIdAndUpdate(video.creator_id, {
      $inc: { 
        "channel_stats.total_watch_hours": watchTimeHours,
        "channel_stats.total_video_views": 1
      }
    });

    // Also update the video's view count
    await VideoDataModel.updateOne(
      { _id: videoId, "VideoData._id": video.VideoData[0]._id },
      { $inc: { "VideoData.$.views": 1 } }
    );

    res.status(200).json({
      success: true,
      message: "Watch time tracked",
      watchTimeAdded: watchTimeHours
    });
  } catch (error) {
    console.error("Error tracking watch time:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get channel stats (for creator)
 * GET /api/monetization/channel-stats
 */
monetization.get('/channel-stats', verifyToken, async (req, res) => {
  try {
    const user = await userData.findById(req.user._id);
    
    const stats = user.channel_stats || {
      subscriber_count: 0,
      total_watch_hours: 0,
      total_video_views: 0,
      meets_monetization_requirements: false
    };

    // Check current eligibility
    const meetsRequirements = checkMonetizationEligibility(user);

    res.status(200).json({
      success: true,
      stats: {
        ...stats,
        meets_monetization_requirements: meetsRequirements
      },
      requirements: MONETIZATION_REQUIREMENTS,
      progress: {
        subscribers: {
          current: stats.subscriber_count,
          required: MONETIZATION_REQUIREMENTS.MIN_SUBSCRIBERS,
          percentage: Math.min(100, (stats.subscriber_count / MONETIZATION_REQUIREMENTS.MIN_SUBSCRIBERS) * 100)
        },
        watchHours: {
          current: Math.round(stats.total_watch_hours * 10) / 10,
          required: MONETIZATION_REQUIREMENTS.MIN_WATCH_HOURS,
          percentage: Math.min(100, (stats.total_watch_hours / MONETIZATION_REQUIREMENTS.MIN_WATCH_HOURS) * 100)
        }
      }
    });
  } catch (error) {
    console.error("Error fetching channel stats:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get all users (Admin only)
 * GET /api/monetization/all-users
 */
monetization.get('/all-users', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, role } = req.query;
    
    const query = {};
    if (role) {
      query.role = role;
    }

    const users = await userData.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await userData.countDocuments(query);

    res.status(200).json({
      success: true,
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Update user role (Admin only)
 * POST /api/monetization/update-user-role
 */
monetization.post('/update-user-role', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { userId, newRole } = req.body;

    if (!userId || !newRole) {
      return res.status(400).json({ 
        success: false, 
        message: "User ID and new role required" 
      });
    }

    if (!['admin', 'creator', 'viewer'].includes(newRole)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid role" 
      });
    }

    const user = await userData.findByIdAndUpdate(
      userId,
      { role: newRole },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    res.status(200).json({
      success: true,
      message: `User role updated to ${newRole}`,
      user
    });
  } catch (error) {
    console.error("Error updating user role:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get platform statistics (Admin only)
 * GET /api/monetization/platform-stats
 */
monetization.get('/platform-stats', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const [userCount, creatorCount, videoCount, transactionSum] = await Promise.all([
      userData.countDocuments({}),
      userData.countDocuments({ role: 'creator' }),
      VideoDataModel.countDocuments({}),
      Transaction.aggregate([
        { $match: { type: 'earning' } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ])
    ]);

    const pendingWithdrawals = await Transaction.countDocuments({
      type: 'withdrawal',
      status: 'pending'
    });

    res.status(200).json({
      success: true,
      stats: {
        totalUsers: userCount,
        totalCreators: creatorCount,
        totalVideos: videoCount,
        totalEarnings: transactionSum[0]?.total || 0,
        pendingWithdrawals
      }
    });
  } catch (error) {
    console.error("Error fetching platform stats:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = monetization;
