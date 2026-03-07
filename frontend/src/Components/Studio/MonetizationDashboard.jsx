import { useEffect, useState } from "react";
import "../../Css/Studio/dashboard.css";
import LeftPanel2 from "../LeftPanel2";
import Navbar2 from "../Navbar2";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import {
  getCreatorDashboard,
  requestWithdrawal,
  updateBankDetails,
  enableMonetization,
} from "../../api/monetization";
import MonetizationOnIcon from "@mui/icons-material/MonetizationOn";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import VisibilityIcon from "@mui/icons-material/Visibility";
import PictureInPictureAltIcon from "@mui/icons-material/PictureInPictureAlt";
import Skeleton from "react-loading-skeleton";

function MonetizationDashboard() {
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [bankDetails, setBankDetails] = useState({
    accountNumber: "",
    accountHolderName: "",
    ifscCode: "",
    bankName: "",
  });
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [bankLoading, setBankLoading] = useState(false);
  const [menu, setmenu] = useState(() => {
    const menu = localStorage.getItem("studioMenuClicked");
    return menu ? JSON.parse(menu) : false;
  });

  const User = useSelector((state) => state.user.user);
  const { user } = User;

  useEffect(() => {
    fetchDashboard();
  }, []);

  useEffect(() => {
    const handleMenuButtonClick = () => {
      setmenu((prevMenuClicked) => !prevMenuClicked);
    };

    const menuButton = document.querySelector(".menu2");
    if (menuButton) {
      menuButton.addEventListener("click", handleMenuButtonClick);
    }

    return () => {
      if (menuButton) {
        menuButton.removeEventListener("click", handleMenuButtonClick);
      }
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("studioMenuClicked", JSON.stringify(menu));
  }, [menu]);

  const fetchDashboard = async () => {
    try {
      const response = await getCreatorDashboard();
      setDashboardData(response.dashboard);
    } catch (error) {
      console.error("Error fetching dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEnableMonetization = async (enable) => {
    try {
      await enableMonetization(enable);
      toast.success(
        enable ? "Monetization enabled" : "Monetization disabled"
      );
      fetchDashboard();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) < 1000) {
      toast.error("Minimum withdrawal amount is ₹1000");
      return;
    }

    setWithdrawLoading(true);
    try {
      const response = await requestWithdrawal(parseFloat(withdrawAmount));
      toast.success(response.message);
      setShowWithdrawModal(false);
      setWithdrawAmount("");
      fetchDashboard();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleUpdateBank = async () => {
    if (
      !bankDetails.accountNumber ||
      !bankDetails.accountHolderName ||
      !bankDetails.ifscCode ||
      !bankDetails.bankName
    ) {
      toast.error("Please fill all bank details");
      return;
    }

    setBankLoading(true);
    try {
      await updateBankDetails(bankDetails);
      toast.success("Bank details updated successfully");
      setShowBankModal(false);
      setBankDetails({
        accountNumber: "",
        accountHolderName: "",
        ifscCode: "",
        bankName: "",
      });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBankLoading(false);
    }
  };

  if (loading) {
    return (
      <>
        <Navbar2 />
        <LeftPanel2 />
        <div
          className="dashboard-data"
          style={{
            left: menu ? "125px" : "310px",
            maxHeight: "calc(100vh - 120px)",
            overflowY: "auto",
            paddingRight: "12px",
            paddingBottom: "24px",
          }}
        >
          <Skeleton height={30} width={250} />
          <div style={{ display: "flex", gap: "20px", marginTop: "20px" }}>
            <Skeleton height={150} width={300} />
            <Skeleton height={150} width={300} />
            <Skeleton height={150} width={300} />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar2 />
      <LeftPanel2 />
      <div
        className="dashboard-data"
        style={{
          left: menu ? "125px" : "310px",
          maxHeight: "calc(100vh - 120px)",
          overflowY: "auto",
          paddingRight: "12px",
          paddingBottom: "24px",
        }}
      >
      <h2 style={{ marginBottom: "20px", color: "#0f0f0f" }}>
        <MonetizationOnIcon style={{ marginRight: "10px", color: "#4caf50" }} />
        Creator Monetization
      </h2>

      {/* Monetization Toggle */}
      <div
        style={{
          background: "#1e1e1e",
          padding: "20px",
          borderRadius: "8px",
          marginBottom: "20px",
        }}
      >
        <h3 style={{ color: "#fff", marginBottom: "10px" }}>
          Monetization Status
        </h3>
        <p style={{ color: "#aaa", marginBottom: "15px" }}>
          Enable monetization to earn from your videos through ads
        </p>
        <button
          onClick={() =>
            handleEnableMonetization(!dashboardData?.isMonetized)
          }
          style={{
            background: dashboardData?.isMonetized ? "#f44336" : "#4caf50",
            color: "#fff",
            border: "none",
            padding: "10px 20px",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          {dashboardData?.isMonetized
            ? "Disable Monetization"
            : "Enable Monetization"}
        </button>
      </div>

      {/* Stats Cards */}
      <div
        style={{
          display: "flex",
          gap: "20px",
          marginBottom: "30px",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            background: "#1e1e1e",
            padding: "20px",
            borderRadius: "8px",
            minWidth: "200px",
            flex: 1,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <AccountBalanceIcon style={{ color: "#4caf50" }} />
            <span style={{ color: "#aaa" }}>Wallet Balance</span>
          </div>
          <h2 style={{ color: "#fff", margin: "10px 0", fontSize: "28px" }}>
            ₹{dashboardData?.walletBalance?.toFixed(2) || "0.00"}
          </h2>
          <button
            onClick={() => setShowWithdrawModal(true)}
            disabled={dashboardData?.walletBalance < 1000}
            style={{
              background: dashboardData?.walletBalance >= 1000 ? "#4caf50" : "#555",
              color: "#fff",
              border: "none",
              padding: "8px 16px",
              borderRadius: "4px",
              cursor:
                dashboardData?.walletBalance >= 1000 ? "pointer" : "not-allowed",
            }}
          >
            Withdraw
          </button>
        </div>

        <div
          style={{
            background: "#1e1e1e",
            padding: "20px",
            borderRadius: "8px",
            minWidth: "200px",
            flex: 1,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <TrendingUpIcon style={{ color: "#2196f3" }} />
            <span style={{ color: "#aaa" }}>Total Earnings</span>
          </div>
          <h2 style={{ color: "#fff", margin: "10px 0", fontSize: "28px" }}>
            ₹{dashboardData?.totalEarnings?.toFixed(2) || "0.00"}
          </h2>
        </div>

        <div
          style={{
            background: "#1e1e1e",
            padding: "20px",
            borderRadius: "8px",
            minWidth: "200px",
            flex: 1,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <VisibilityIcon style={{ color: "#ff9800" }} />
            <span style={{ color: "#aaa" }}>Total Views</span>
          </div>
          <h2 style={{ color: "#fff", margin: "10px 0", fontSize: "28px" }}>
            {dashboardData?.totalViews?.toLocaleString() || "0"}
          </h2>
        </div>

        <div
          style={{
            background: "#1e1e1e",
            padding: "20px",
            borderRadius: "8px",
            minWidth: "200px",
            flex: 1,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <PictureInPictureAltIcon style={{ color: "#9c27b0" }} />
            <span style={{ color: "#aaa" }}>Ad Revenue</span>
          </div>
          <h2 style={{ color: "#fff", margin: "10px 0", fontSize: "28px" }}>
            ₹{dashboardData?.totalRevenue?.toFixed(2) || "0.00"}
          </h2>
        </div>
      </div>

      {/* Monthly Earnings Chart */}
      <div
        style={{
          background: "#1e1e1e",
          padding: "20px",
          borderRadius: "8px",
          marginBottom: "30px",
        }}
      >
        <h3 style={{ color: "#fff", marginBottom: "20px" }}>Monthly Earnings</h3>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "10px",
            height: "150px",
          }}
        >
          {(dashboardData?.monthlyEarnings || Array(6).fill(0)).map(
            (value, index) => (
              <div
                key={index}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    background: "#4caf50",
                    borderRadius: "4px 4px 0 0",
                    height: `${Math.max((value / (Math.max(...(dashboardData?.monthlyEarnings || [1])) || 1)) * 120, value > 0 ? 5 : 0)}px`,
                    transition: "height 0.3s ease",
                  }}
                />
                <span style={{ color: "#aaa", fontSize: "12px", marginTop: "5px" }}>
                  {new Date(
                    new Date().setMonth(new Date().getMonth() - (5 - index))
                  ).toLocaleString("default", { month: "short" })}
                </span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Bank Details */}
      <div
        style={{
          background: "#1e1e1e",
          padding: "20px",
          borderRadius: "8px",
          marginBottom: "30px",
        }}
      >
        <h3 style={{ color: "#fff", marginBottom: "15px" }}>Bank Details</h3>
        <p style={{ color: "#aaa", marginBottom: "15px" }}>
          Set up your bank account to receive withdrawals
        </p>
        <button
          onClick={() => setShowBankModal(true)}
          style={{
            background: "#2196f3",
            color: "#fff",
            border: "none",
            padding: "10px 20px",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          {user?.bankDetails?.accountNumber ? "Update Bank Details" : "Add Bank Details"}
        </button>
      </div>

      {/* Top Performing Videos */}
      <div style={{ background: "#1e1e1e", padding: "20px", borderRadius: "8px" }}>
        <h3 style={{ color: "#fff", marginBottom: "20px" }}>Top Earning Videos</h3>
        {(dashboardData?.videoStats || []).length === 0 ? (
          <p style={{ color: "#aaa" }}>No videos yet</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #333" }}>
                <th style={{ textAlign: "left", padding: "10px", color: "#aaa" }}>
                  Video
                </th>
                <th style={{ textAlign: "left", padding: "10px", color: "#aaa" }}>
                  Views
                </th>
                <th style={{ textAlign: "left", padding: "10px", color: "#aaa" }}>
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody>
              {dashboardData?.videoStats?.slice(0, 5).map((video, index) => (
                <tr key={index} style={{ borderBottom: "1px solid #333" }}>
                  <td style={{ padding: "10px", color: "#fff" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        style={{ width: "80px", borderRadius: "4px" }}
                      />
                      <span style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {video.title}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: "10px", color: "#aaa" }}>
                    {video.views?.toLocaleString()}
                  </td>
                  <td style={{ padding: "10px", color: "#4caf50" }}>
                    ₹{video.revenue?.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#1e1e1e",
              padding: "30px",
              borderRadius: "8px",
              minWidth: "400px",
            }}
          >
            <h3 style={{ color: "#fff", marginBottom: "20px" }}>Withdraw Funds</h3>
            <p style={{ color: "#aaa", marginBottom: "15px" }}>
              Available balance: ₹{dashboardData?.walletBalance?.toFixed(2)}
            </p>
            <input
              type="number"
              placeholder="Enter amount (min ₹1000)"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              style={{
                width: "100%",
                padding: "10px",
                marginBottom: "15px",
                background: "#333",
                border: "1px solid #444",
                borderRadius: "4px",
                color: "#fff",
              }}
            />
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowWithdrawModal(false)}
                style={{
                  background: "#555",
                  color: "#fff",
                  border: "none",
                  padding: "10px 20px",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleWithdraw}
                disabled={withdrawLoading}
                style={{
                  background: "#4caf50",
                  color: "#fff",
                  border: "none",
                  padding: "10px 20px",
                  borderRadius: "4px",
                  cursor: withdrawLoading ? "not-allowed" : "pointer",
                }}
              >
                {withdrawLoading ? "Processing..." : "Withdraw"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bank Details Modal */}
      {showBankModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#1e1e1e",
              padding: "30px",
              borderRadius: "8px",
              minWidth: "400px",
            }}
          >
            <h3 style={{ color: "#fff", marginBottom: "20px" }}>Bank Details</h3>
            <input
              type="text"
              placeholder="Bank Name"
              value={bankDetails.bankName}
              onChange={(e) =>
                setBankDetails({ ...bankDetails, bankName: e.target.value })
              }
              style={{
                width: "100%",
                padding: "10px",
                marginBottom: "10px",
                background: "#333",
                border: "1px solid #444",
                borderRadius: "4px",
                color: "#fff",
              }}
            />
            <input
              type="text"
              placeholder="Account Holder Name"
              value={bankDetails.accountHolderName}
              onChange={(e) =>
                setBankDetails({
                  ...bankDetails,
                  accountHolderName: e.target.value,
                })
              }
              style={{
                width: "100%",
                padding: "10px",
                marginBottom: "10px",
                background: "#333",
                border: "1px solid #444",
                borderRadius: "4px",
                color: "#fff",
              }}
            />
            <input
              type="text"
              placeholder="Account Number"
              value={bankDetails.accountNumber}
              onChange={(e) =>
                setBankDetails({
                  ...bankDetails,
                  accountNumber: e.target.value,
                })
              }
              style={{
                width: "100%",
                padding: "10px",
                marginBottom: "10px",
                background: "#333",
                border: "1px solid #444",
                borderRadius: "4px",
                color: "#fff",
              }}
            />
            <input
              type="text"
              placeholder="IFSC Code (e.g., HDFC0001234)"
              value={bankDetails.ifscCode}
              onChange={(e) =>
                setBankDetails({ ...bankDetails, ifscCode: e.target.value })
              }
              style={{
                width: "100%",
                padding: "10px",
                marginBottom: "15px",
                background: "#333",
                border: "1px solid #444",
                borderRadius: "4px",
                color: "#fff",
              }}
            />
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowBankModal(false)}
                style={{
                  background: "#555",
                  color: "#fff",
                  border: "none",
                  padding: "10px 20px",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateBank}
                disabled={bankLoading}
                style={{
                  background: "#2196f3",
                  color: "#fff",
                  border: "none",
                  padding: "10px 20px",
                  borderRadius: "4px",
                  cursor: bankLoading ? "not-allowed" : "pointer",
                }}
              >
                {bankLoading ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}

export default MonetizationDashboard;
