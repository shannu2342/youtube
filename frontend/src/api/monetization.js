import { backendURL } from "../config/backend";

const API_URL = `${backendURL}/monetization`;

// Helper function for making API calls
const apiCall = async (endpoint, options = {}) => {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "API call failed");
  }
  return data;
};

// ============================================================================
// PUBLIC CONFIG
// ============================================================================

/**
 * Get Razorpay public key
 */
export const getRazorpayConfig = async () => {
  const response = await fetch(`${API_URL}/config`, {
    credentials: "include"
  });
  return response.json();
};

/**
 * Get available premium plans
 */
export const getPremiumPlans = async () => {
  return apiCall("/premium-plans", {
    method: "GET",
  });
};

// ============================================================================
// AD VIEW ENDPOINTS
// ============================================================================

/**
 * Start a view session when user starts watching a video
 */
export const startViewSession = async (videoId) => {
  return apiCall("/start-view", {
    method: "POST",
    body: JSON.stringify({ videoId }),
  });
};

/**
 * Record ad view and distribute revenue
 */
export const recordAdView = async (videoId, adCompleted = true) => {
  return apiCall("/record-ad-view", {
    method: "POST",
    body: JSON.stringify({ videoId, adCompleted }),
  });
};

// ============================================================================
// CREATOR DASHBOARD ENDPOINTS
// ============================================================================

/**
 * Get creator dashboard data
 */
export const getCreatorDashboard = async () => {
  return apiCall("/dashboard", {
    method: "GET",
  });
};

/**
 * Get video-specific analytics
 */
export const getVideoAnalytics = async (videoId) => {
  return apiCall(`/video-analytics/${videoId}`, {
    method: "GET",
  });
};

// ============================================================================
// WITHDRAWAL SYSTEM
// ============================================================================

/**
 * Request withdrawal
 */
export const requestWithdrawal = async (amount) => {
  return apiCall("/withdraw", {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
};

/**
 * Get withdrawal history
 */
export const getWithdrawalHistory = async () => {
  return apiCall("/withdrawal-history", {
    method: "GET",
  });
};

/**
 * Get pending withdrawals (Admin only)
 */
export const getPendingWithdrawals = async () => {
  return apiCall("/pending-withdrawals", {
    method: "GET",
  });
};

/**
 * Approve/reject withdrawal (Admin only)
 */
export const approveWithdrawal = async (transactionId, approved, failureReason) => {
  return apiCall("/approve-withdrawal", {
    method: "POST",
    body: JSON.stringify({ transactionId, approved, failureReason }),
  });
};

/**
 * Update bank details
 */
export const updateBankDetails = async (bankDetails) => {
  return apiCall("/update-bank-details", {
    method: "POST",
    body: JSON.stringify(bankDetails),
  });
};

// ============================================================================
// PREMIUM SUBSCRIPTION
// ============================================================================

/**
 * Create Razorpay subscription for premium membership
 */
export const createPremiumSubscription = async (planId) => {
  return apiCall("/create-premium-subscription", {
    method: "POST",
    body: JSON.stringify({ planId }),
  });
};

/**
 * Verify and activate recurring premium subscription
 */
export const verifyPremiumSubscription = async (
  razorpaySubscriptionId,
  razorpayPaymentId,
  razorpaySignature,
  planId
) => {
  return apiCall("/verify-premium-subscription", {
    method: "POST",
    body: JSON.stringify({ razorpaySubscriptionId, razorpayPaymentId, razorpaySignature, planId }),
  });
};

/**
 * Get premium status
 */
export const getPremiumStatus = async () => {
  return apiCall("/premium-status", {
    method: "GET",
  });
};

// ============================================================================
// MONETIZATION SETTINGS
// ============================================================================

/**
 * Enable/disable monetization for creator
 */
export const enableMonetization = async (enable) => {
  return apiCall("/enable-monetization", {
    method: "POST",
    body: JSON.stringify({ enable }),
  });
};

/**
 * Update video CPM
 */
export const updateVideoCPM = async (videoId, cpm) => {
  return apiCall("/update-cpm", {
    method: "POST",
    body: JSON.stringify({ videoId, cpm }),
  });
};

// ============================================================================
// STATS & ANALYTICS
// ============================================================================

/**
 * Get overall platform stats (Admin only)
 */
export const getPlatformStats = async () => {
  return apiCall("/platform-stats", {
    method: "GET",
  });
};

// ============================================================================
// CHANNEL STATS & WATCH TIME
// ============================================================================

/**
 * Track watch time when user watches a video
 */
export const trackWatchTime = async (videoId, watchTimeSeconds) => {
  return apiCall("/track-watch-time", {
    method: "POST",
    body: JSON.stringify({ videoId, watchTimeSeconds }),
  });
};

/**
 * Get channel stats (subscribers, watch hours)
 */
export const getChannelStats = async () => {
  return apiCall("/channel-stats", {
    method: "GET",
  });
};

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

/**
 * Get all users (Admin only)
 */
export const getAllUsers = async (page = 1, limit = 20, role = null) => {
  const params = new URLSearchParams({ page, limit });
  if (role) params.append('role', role);
  return apiCall(`/all-users?${params}`, {
    method: "GET",
  });
};

/**
 * Update user role (Admin only)
 */
export const updateUserRole = async (userId, newRole) => {
  return apiCall("/update-user-role", {
    method: "POST",
    body: JSON.stringify({ userId, newRole }),
  });
};
