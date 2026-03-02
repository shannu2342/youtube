const mongoose = require("mongoose");
const validator = require("validator");

const Playlists = new mongoose.Schema({
  playlist_name: {
    type: String,
    required: true,
  },
  owner_email: {
    type: String,
    required: true,
    validate(value) {
      if (!validator.isEmail(value)) {
        throw new Error("Invalid email address");
      }
    },
  },
  playlist_privacy: {
    type: String,
    required: true,
  },
  playlist_date: {
    type: String,
  },
  playlist_owner: {
    type: String,
  },
  playlist_videos: [
    {
      thumbnail: {
        type: String,
      },
      title: {
        type: String,
      },
      videoID: {
        type: String,
      },
      description: {
        type: String,
      },
      videolength: {
        type: String,
      },
      video_uploader: {
        type: String,
      },
      video_date: {
        type: String,
      },
      videoprivacy: {
        type: String,
      },
      video_views: {
        type: Number,
      },
    },
  ],
});

const UserData = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    validate(value) {
      if (!validator.isEmail(value)) {
        throw new Error("Invalid email address");
      }
    },
  },
  password: {
    type: String,
    required: true,
  },
  profilePic: {
    type: String,
  },
  // User role: admin, creator, viewer
  role: {
    type: String,
    enum: ['admin', 'creator', 'viewer'],
    default: 'viewer',
  },
  // Monetization fields
  wallet_balance: {
    type: Number,
    default: 0,
  },
  total_earnings: {
    type: Number,
    default: 0,
  },
  // Premium subscription
  isPremium: {
    type: Boolean,
    default: false,
  },
  premiumExpiryDate: {
    type: Date,
    default: null,
  },
  premiumSubscriptionId: {
    type: String,
    default: null,
  },
  premiumPlanId: {
    type: String,
    default: null,
  },
  premiumSubscriptionStatus: {
    type: String,
    default: null,
  },
  // Razorpay customer ID for payouts
  razorpayCustomerId: {
    type: String,
    default: null,
  },
  // Bank account details for withdrawals
  // SECURITY NOTE: In production, use MongoDB Field Level Encryption or
  // a key management service (KMS) to encrypt sensitive banking information.
  // Account numbers should never be stored in plain text.
  bankDetails: {
    accountNumber: { type: String, default: null },
    accountHolderName: { type: String, default: null },
    ifscCode: { type: String, default: null },
    bankName: { type: String, default: null },
  },
  hasChannel: {
    type: Boolean,
    default: false,
  },
  // Channel statistics for monetization eligibility
  channel_stats: {
    subscriber_count: { type: Number, default: 0 },
    total_watch_hours: { type: Number, default: 0 },
    total_video_views: { type: Number, default: 0 },
    meets_monetization_requirements: { type: Boolean, default: false },
    monetization_enabled_date: { type: Date, default: null }
  },
  channelName: {
    type: String,
  },
  thumbnails: [
    {
      imageURL: {
        type: String,
      },
    },
  ],
  videos: [
    {
      videoURL: {
        type: String,
      },
      videoLength: {
        type: Number,
        required: true,
      },
    },
  ],
  likedVideos: [
    {
      email: {
        type: String,
        required: true,
        validate(value) {
          if (!validator.isEmail(value)) {
            throw new Error("Invalid email address");
          }
        },
      },
      videoURL: {
        type: String,
      },
      thumbnailURL: {
        type: String,
      },
      videoLength: {
        type: Number,
      },
      views: {
        type: Number,
        default: 0,
      },
      uploaded_date: {
        type: String,
      },
      ChannelProfile: {
        type: String,
      },
      Title: {
        type: String,
      },
      videoprivacy: {
        type: String,
      },
      uploader: {
        type: String,
      },
      likedVideoID: {
        type: String,
      },
    },
  ],
  likedComments: [
    {
      comment_ID: {
        type: String,
      },
    },
  ],
  savedPlaylists: [
    {
      playlistID: {
        type: String,
      },
    },
  ],
  watchLater: [
    {
      email: {
        type: String,
        required: true,
        validate(value) {
          if (!validator.isEmail(value)) {
            throw new Error("Invalid email address");
          }
        },
      },
      videoURL: {
        type: String,
      },
      thumbnailURL: {
        type: String,
      },
      videoLength: {
        type: Number,
      },
      views: {
        type: Number,
        default: 0,
      },
      uploaded_date: {
        type: String,
      },
      ChannelProfile: {
        type: String,
      },
      videoprivacy: {
        type: String,
      },
      Title: {
        type: String,
      },
      uploader: {
        type: String,
      },
      savedVideoID: {
        type: String,
      },
    },
  ],
  channelData: [
    {
      subscribers: {
        type: Number,
        default: 0,
      },
      channelName: {
        type: String,
      },
      channelDescription: {
        type: String,
      },
      channelProfile: {
        type: String,
      },
      channelCoverImg: {
        type: String,
      },
      joinedDate: {
        type: String,
      },
      socialLinks: [
        {
          facebook: {
            type: String,
          },
          instagram: {
            type: String,
          },
          twitter: {
            type: String,
          },
          website: {
            type: String,
          },
        },
      ],
    },
  ],
  subscribedChannels: [
    {
      channelname: {
        type: String,
      },
      channelProfile: {
        type: String,
      },
      channelID: {
        type: String,
      },
    },
  ],
  featuredChannels: [
    {
      channelname: {
        type: String,
      },
      channelProfile: {
        type: String,
      },
      channelID: {
        type: String,
      },
    },
  ],
  Playlists: [Playlists],
  refreshToken: {
    type: String,
  },
});

const user = mongoose.model("userData", UserData);

module.exports = user;
