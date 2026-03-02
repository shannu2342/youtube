import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import {
  getPremiumStatus,
  createPremiumSubscription,
  verifyPremiumSubscription,
  getRazorpayConfig,
  getPremiumPlans,
} from "../api/monetization";
import StarIcon from "@mui/icons-material/Star";
import CloseIcon from "@mui/icons-material/Close";
import "./PremiumSubscription.css";

const FALLBACK_PLANS = [
  { id: "monthly", name: "1 Month", priceInr: 199, months: 1, recommended: false },
  { id: "quarterly", name: "3 Months", priceInr: 499, months: 3, recommended: true },
  { id: "yearly", name: "12 Months", priceInr: 1899, months: 12, recommended: false },
];

function PremiumSubscription({ onClose }) {
  const [loading, setLoading] = useState(false);
  const [premiumStatus, setPremiumStatus] = useState(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [razorpayKeyId, setRazorpayKeyId] = useState("");
  const [paymentSetupMessage, setPaymentSetupMessage] = useState("");
  const [plans, setPlans] = useState(FALLBACK_PLANS);
  const [selectedPlanId, setSelectedPlanId] = useState("quarterly");

  const User = useSelector((state) => state.user.user);
  const { user } = User;

  useEffect(() => {
    fetchRazorpayConfig();
    fetchPremiumPlans();
  }, []);

  useEffect(() => {
    if (user) {
      fetchPremiumStatus();
    } else {
      setPremiumStatus({
        isPremium: false,
        expiryDate: null,
      });
      setIsLoadingStatus(false);
    }
  }, [user]);

  const fetchRazorpayConfig = async () => {
    try {
      const config = await getRazorpayConfig();
      if (config.success && config.razorpayKeyId) {
        setRazorpayKeyId(config.razorpayKeyId);
        setPaymentSetupMessage("");
        return config.razorpayKeyId;
      } else if (config.message) {
        setRazorpayKeyId("");
        setPaymentSetupMessage(config.message);
        console.log("Razorpay not configured:", config.message);
      }
    } catch (error) {
      console.error("Error fetching Razorpay config:", error);
      setRazorpayKeyId("");
      setPaymentSetupMessage("Unable to load payment configuration");
    }
    return "";
  };

  const fetchPremiumPlans = async () => {
    try {
      const response = await getPremiumPlans();
      if (response?.success && Array.isArray(response.plans) && response.plans.length > 0) {
        setPlans(response.plans);
        setSelectedPlanId(response.defaultPlanId || response.plans[0].id);
      }
    } catch (error) {
      console.log("Error fetching premium plans:", error.message);
    }
  };

  const fetchPremiumStatus = async () => {
    try {
      const response = await getPremiumStatus();
      if (response.success) {
        setPremiumStatus({
          isPremium: response.isPremium,
          expiryDate: response.premiumExpiryDate,
        });
      } else {
        setPremiumStatus({
          isPremium: false,
          expiryDate: null,
        });
      }
    } catch (error) {
      console.log("Error fetching premium status:", error.message);
      setPremiumStatus({
        isPremium: false,
        expiryDate: null,
      });
    } finally {
      setIsLoadingStatus(false);
    }
  };

  const loadRazorpayScript = () => {
    return new Promise((resolve, reject) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => reject(new Error("Unable to load Razorpay checkout"));
      document.body.appendChild(script);
    });
  };

  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) || plans[0];

  const handleSubscribe = async () => {
    if (!user) {
      toast.error("Please sign in to subscribe");
      return;
    }

    if (!selectedPlan) {
      toast.error("Please select a plan");
      return;
    }

    const keyToUse = razorpayKeyId || (await fetchRazorpayConfig());
    if (!keyToUse) {
      toast.error(paymentSetupMessage || "Payment system not configured");
      return;
    }

    setLoading(true);
    try {
      const subscriptionResponse = await createPremiumSubscription(selectedPlan.id);
      await loadRazorpayScript();

      const razorpay = new window.Razorpay({
        key: keyToUse,
        subscription_id: subscriptionResponse.subscriptionId,
        name: "YouTube Clone Premium",
        description: `${selectedPlan.name} Auto-Renewing Plan`,
        prefill: {
          name: user?.name || "",
          email: user?.email || "",
        },
        theme: {
          color: "#ff0000",
        },
        handler: async (response) => {
          try {
            await verifyPremiumSubscription(
              response.razorpay_subscription_id,
              response.razorpay_payment_id,
              response.razorpay_signature,
              selectedPlan.id
            );
            toast.success("Premium activated successfully!");
            fetchPremiumStatus();
          } catch (error) {
            toast.error(error.message);
          }
        },
      });

      razorpay.open();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  if (isLoadingStatus) {
    return (
      <div className="premium-overlay">
        <div className="premium-container">
          <div className="premium-loading">Loading...</div>
        </div>
      </div>
    );
  }

  const handleClose = () => {
    if (onClose) {
      onClose();
    }
    if (window.location.pathname === "/premium") {
      window.location.href = "/";
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  return (
    <div className="premium-overlay" onClick={handleOverlayClick}>
      <div className="premium-container">
        <button className="premium-close" onClick={handleClose}>
          <CloseIcon />
        </button>

        <div className="premium-header">
          <StarIcon className="premium-star" />
          <h1>YouTube Premium</h1>
          <p>Ad-free videos, background play, and more</p>
        </div>

        {premiumStatus?.isPremium ? (
          <div className="premium-active">
            <div className="premium-badge">
              <StarIcon />
              <span>Premium Active</span>
            </div>
            <p className="premium-expiry">
              Your subscription is valid until <strong>{formatDate(premiumStatus.expiryDate)}</strong>
            </p>
            <div className="premium-benefits">
              <h3>Your benefits:</h3>
              <ul>
                <li>Ad-free viewing experience</li>
                <li>Background play</li>
                <li>Download videos for offline</li>
                <li>YouTube Music Premium included</li>
              </ul>
            </div>
          </div>
        ) : (
          <>
            <div className="premium-plans">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  className={`premium-plan-card ${selectedPlanId === plan.id ? "active" : ""}`}
                  onClick={() => setSelectedPlanId(plan.id)}
                >
                  {plan.recommended && <span className="premium-plan-badge">Best Value</span>}
                  <p className="premium-plan-name">{plan.name}</p>
                  <p className="premium-plan-price">Rs {plan.priceInr}</p>
                  <p className="premium-plan-subtext">{Math.round(plan.priceInr / plan.months)} / month</p>
                </button>
              ))}
            </div>

            <div className="premium-benefits">
              <h3>What you get:</h3>
              <ul>
                <li>Ad-free videos</li>
                <li>Background play</li>
                <li>Download for offline</li>
                <li>YouTube Music Premium</li>
                <li>Access across mobile, web, and TV</li>
              </ul>
            </div>

            <div className="premium-payment-options">
              <p>Auto-renewing subscription. Pay using UPI, Cards, Netbanking, or Wallets.</p>
            </div>

            <button
              className="premium-button"
              onClick={handleSubscribe}
              disabled={loading || !user}
            >
              {loading ? "Processing..." : `Get Premium - Rs ${selectedPlan?.priceInr || 0}`}
            </button>

            {!user && <p className="premium-login-message">Please sign in to subscribe</p>}
            {!!user && !!paymentSetupMessage && (
              <p className="premium-login-message">{paymentSetupMessage}. Add Razorpay keys in backend/.env.</p>
            )}
          </>
        )}

        <div className="premium-footer">
          <p>By subscribing, you agree to our Terms of Service and Privacy Policy.</p>
          <p className="premium-cancel">Cancel anytime. No questions asked.</p>
        </div>
      </div>
    </div>
  );
}

export default PremiumSubscription;
