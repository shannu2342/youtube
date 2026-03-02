import "../Css/browse.css";
import { useEffect, useState, useRef, useCallback } from "react";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import Tooltip from "@mui/material/Tooltip";
import Zoom from "@mui/material/Zoom";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import LeftPanel from "./LeftPanel";
import Navbar from "./Navbar";
import "../Css/theme.css";
import { useSelector } from "react-redux";
import { backendURL } from "../config/backend";

function Browse() {
  const [thumbnails, setThumbnails] = useState([]);
  const [Titles, setTitles] = useState();
  const [uploader, setUploader] = useState();
  const [ProfilePic, setProfilePic] = useState();
  const [duration, setDuration] = useState();
  const [VideoID, setVideoID] = useState();
  const [Visibility, setVisibility] = useState();
  const [menuClicked, setMenuClicked] = useState(() => {
    const menu = localStorage.getItem("menuClicked");
    return menu ? JSON.parse(menu) : false;
  });
  const [VideoViews, setVideoViews] = useState();
  const [VideoData, setVideoData] = useState([]);
  const [TagsSelected, setTagsSelected] = useState("All");
  const [publishDate, setPublishDate] = useState();
  const [FilteredVideos, setFilteredVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(() => {
    const Dark = localStorage.getItem("Dark");
    return Dark ? JSON.parse(Dark) : true;
  });

  const user = useSelector((state) => state.user.user);
  const [activeMenu, setActiveMenu] = useState(null); // index of card with open menu
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActiveMenu(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const saveToWatchLater = useCallback(async (videoId, uploaderEmail) => {
    try {
      if (!user?.user?.email) return;
      const email = user.user.email;
      const response = await fetch(`${backendURL}/watchlater/${videoId}/${email}/${uploaderEmail || email}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      await response.json();
    } catch {
      // noop
    }
    setActiveMenu(null);
  }, [user]);


  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const handleMenuButtonClick = () => {
      setMenuClicked((prevMenuClicked) => !prevMenuClicked);
    };

    const menuButton = document.querySelector(".menu");
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
    const handleMenuButtonClick = () => {
      setMenuClicked((prevMenuClicked) => !prevMenuClicked);
    };

    const menuButton = document.querySelector(".menu-light");
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
    localStorage.setItem("menuClicked", JSON.stringify(menuClicked));
  }, [menuClicked]);

  const Tags = [
    "All",
    "Artificial Intelligence",
    "Comedy",
    "Gaming",
    "Vlog",
    "Beauty",
    "Travel",
    "Food",
    "Fashion",
  ];

  useEffect(() => {
    const getVideos = async () => {
      try {
        const response = await fetch(`${backendURL}/getvideos`);
        if (!response.ok) {
          throw new Error(`Failed to fetch videos: ${response.status}`);
        }
        const {
          thumbnailURLs,
          titles,
          Uploader,
          Profile,
          Duration,
          videoID,
          views,
          uploadDate,
          Visibility,
          videoData,
        } = await response.json();
        setThumbnails(thumbnailURLs);
        setTitles(titles);
        setUploader(Uploader);
        setProfilePic(Profile);
        setDuration(Duration);
        setVideoID(videoID);
        setVideoViews(views);
        setPublishDate(uploadDate);
        setVisibility(Visibility);
        setVideoData(videoData);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    getVideos();
  }, []);

  useEffect(() => {
    if (TagsSelected !== "All") {
      const tagsSelectedLower = TagsSelected.toLowerCase();
      const filteredVideos = VideoData.flatMap((item) =>
        item.VideoData.filter(
          (element) =>
            element.Tags.toLowerCase().includes(tagsSelectedLower) ||
            element.Title.toLowerCase().includes(tagsSelectedLower)
        )
      );
      setFilteredVideos(filteredVideos);
    } else {
      setFilteredVideos([]);
    }
  }, [TagsSelected, VideoData]);

  useEffect(() => {
    if (theme === false && !window.location.href.includes("/studio")) {
      document.body.style.backgroundColor = "white";
    } else if (theme === true && !window.location.href.includes("/studio")) {
      document.body.style.backgroundColor = "0f0f0f";
    }
  }, [theme]);

  //UPDATE VIEWS

  const updateViews = async (id) => {
    try {
      const response = await fetch(`${backendURL}/updateview/${id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      await response.json();
    } catch (error) {
      // console.log(error.message);
    }
  };

  return (
    <>
      <Navbar />
      <LeftPanel />
      <SkeletonTheme
        baseColor={theme ? "#353535" : "#aaaaaa"}
        highlightColor={theme ? "#444" : "#b6b6b6"}
      >
        <div
          className={theme ? "browse" : "browse light-mode"}
          style={loading === true ? { display: "flex" } : { display: "none" }}
        >
          <div
            className={
              menuClicked === true
                ? `browse-data ${theme ? "" : "light-mode"}`
                : `browse-data2 ${theme ? "" : "light-mode"}`
            }
            style={menuClicked === false ? { left: "74px" } : { left: "250px" }}
          >
            <div
              className={
                theme ? "popular-categories" : "popular-categories light-mode"
              }
            >
              {Tags.map((element, index) => {
                return (
                  <div
                    className={
                      TagsSelected === element
                        ? `top-tags ${theme ? "tag-color" : "tag-color-light"}`
                        : `top-tags ${theme ? "" : "tagcolor-newlight"}`
                    }
                    key={index}
                  >
                    <p
                      onClick={() => {
                        setTagsSelected(`${element}`);
                      }}
                    >
                      {element}
                    </p>
                  </div>
                );
              })}
            </div>
            <div
              className="video-section"
              style={{
                marginLeft: menuClicked ? "0px" : "0px",
              }}
            >
              <div className="uploaded-videos">
                {Array.from({ length: 16 }).map((_, index) => (
                  <div className="video-data" key={`browse-skeleton-${index}`}>
                    <Skeleton
                      count={1}
                      width={330}
                      height={186}
                      style={{ borderRadius: "12px" }}
                      className="sk-browse-vid"
                    />
                    <div className="channel-basic-data">
                      <Skeleton
                        count={1}
                        width={40}
                        height={40}
                        style={{ borderRadius: "100%", marginTop: "40px" }}
                        className="sk-browse-profile"
                      />
                      <Skeleton
                        count={2}
                        width={250}
                        height={15}
                        style={{
                          position: "relative",
                          top: "40px",
                          left: "15px",
                        }}
                        className="sk-browse-title"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </SkeletonTheme>
      <div
        className={theme ? "browse" : "browse light-mode"}
        style={
          loading === true
            ? { visibility: "hidden", display: "none" }
            : { visibility: "visible", display: "flex" }
        }
      >
        <div
          className={
            menuClicked === true
              ? `browse-data ${theme ? "" : "light-mode"}`
              : `browse-data2 ${theme ? "" : "light-mode"}`
          }
          style={menuClicked === false ? { left: "74px " } : { left: "250px " }}
        >
          <div
            className={
              theme ? "popular-categories" : "popular-categories light-mode"
            }
          >
            {Tags.map((element, index) => {
              return (
                <div
                  className={
                    TagsSelected === element
                      ? `top-tags ${theme ? "tag-color" : "tag-color-light"}`
                      : `top-tags ${theme ? "" : "tagcolor-newlight"}`
                  }
                  key={index}
                >
                  <p
                    onClick={() => {
                      setTagsSelected(`${element}`);
                    }}
                  >
                    {element}
                  </p>
                </div>
              );
            })}
          </div>

          <div
            className="video-section"
            style={{
              marginLeft: menuClicked ? "0px" : "0px",
            }}
          >
            <div
              className="uploaded-videos"
              style={
                menuClicked === true
                  ? {
                    paddingRight: "50px",
                    display: TagsSelected === "All" ? "grid" : "none",
                  }
                  : {
                    paddingRight: "0px",
                    display: TagsSelected === "All" ? "grid" : "none",
                  }
              }
            >
              {thumbnails &&
                thumbnails.length > 0 &&
                thumbnails.map((element, index) => {
                  return (
                    <div
                      className="video-data browse-card-wrap"
                      key={VideoID?.[index] || index}
                      style={
                        Visibility[index] === "Public"
                          ? { display: "block" }
                          : { display: "none" }
                      }
                    >
                      {/* 3-dot menu button */}
                      <button
                        className={`browse-three-dot ${theme ? "" : "browse-three-dot-light"}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenu(activeMenu === index ? null : index);
                        }}
                        title="More options"
                      >
                        <MoreVertIcon fontSize="small" />
                      </button>
                      {activeMenu === index && (
                        <div
                          className={`browse-card-menu ${theme ? "" : "browse-card-menu-light"}`}
                          ref={menuRef}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div
                            className="browse-menu-item"
                            onClick={() => saveToWatchLater(VideoID[index], null)}
                          >
                            Save to Watch Later
                          </div>
                          <div
                            className="browse-menu-item"
                            onClick={() => {
                              window.location.href = `/video/${VideoID[index]}`;
                              setActiveMenu(null);
                            }}
                          >
                            Go to video
                          </div>
                        </div>
                      )}

                      <div
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          if (user?.success) updateViews(VideoID[index]);
                          window.location.href = `/video/${VideoID[index]}`;
                        }}
                      >
                        <div className="browse-thumb-wrap">
                          <img
                            src={element}
                            alt="thumbnails"
                            className="browse-thumbnails"
                            loading={index < 6 ? "eager" : "lazy"}
                            decoding="async"
                          />
                          <p className="duration">
                            {Math.floor(duration[index] / 60) +
                              ":" +
                              (Math.round(duration[index] % 60) < 10
                                ? "0" + Math.round(duration[index] % 60)
                                : Math.round(duration[index] % 60))}
                          </p>
                        </div>

                        <div
                          className={
                            theme === true
                              ? "channel-basic-data"
                              : "channel-basic-data text-light-mode"
                          }
                        >
                          <div className="channel-pic">
                            <img
                              className="channel-profile"
                              src={ProfilePic[index]}
                              alt="channel-profile"
                            />
                          </div>
                          <div className="channel-text-data">
                            <p className="title browse-video-title">
                              {Titles[index] && Titles[index].length <= 60
                                ? Titles[index]
                                : `${Titles[index].slice(0, 55)}..`}
                            </p>
                            <div className="video-uploader">
                              <Tooltip TransitionComponent={Zoom} title={uploader[index]} placement="top">
                                <p
                                  className={theme ? "uploader" : "uploader text-light-mode2"}
                                >
                                  {uploader[index]}
                                </p>
                              </Tooltip>
                              <Tooltip TransitionComponent={Zoom} title="Verified" placement="right">
                                <CheckCircleIcon
                                  fontSize="100px"
                                  style={{ color: "rgb(138, 138, 138)", marginLeft: "4px" }}
                                />
                              </Tooltip>
                            </div>
                            <div className={theme ? "view-time" : "view-time text-light-mode2"}>
                              <p className="views">
                                {VideoViews[index] >= 1e9
                                  ? `${(VideoViews[index] / 1e9).toFixed(1)}B`
                                  : VideoViews[index] >= 1e6
                                    ? `${(VideoViews[index] / 1e6).toFixed(1)}M`
                                    : VideoViews[index] >= 1e3
                                      ? `${(VideoViews[index] / 1e3).toFixed(1)}K`
                                      : VideoViews[index]}{" "}
                                views
                              </p>
                              <p className="upload-time">
                                &#x2022;{" "}
                                {(() => {
                                  const diff = new Date() - new Date(publishDate[index]);
                                  const mins = Math.floor(diff / 60000);
                                  const hrs = Math.floor(diff / 3600000);
                                  const days = Math.floor(diff / 86400000);
                                  const wks = Math.floor(diff / 604800000);
                                  const yrs = Math.floor(diff / 31536000000);
                                  if (mins < 1) return "just now";
                                  if (mins < 60) return `${mins} mins ago`;
                                  if (hrs < 24) return `${hrs} hours ago`;
                                  if (days < 7) return `${days} days ago`;
                                  if (wks < 52) return `${wks} weeks ago`;
                                  return `${yrs} years ago`;
                                })()}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
            <div
              className="uploaded-videos2"
              style={
                menuClicked === true
                  ? {
                    paddingRight: "50px",
                    display: TagsSelected !== "All" ? "grid" : "none",
                  }
                  : {
                    paddingRight: "0px",
                    display: TagsSelected !== "All" ? "grid" : "none",
                  }
              }
            >
              {FilteredVideos &&
                FilteredVideos.map((element, index) => {
                  return (
                    <div
                      className="video-data"
                      key={index}
                      style={
                        element.visibility === "Public"
                          ? { display: "block" }
                          : { display: "none" }
                      }
                      onClick={() => {
                        if (user?.success) {
                          updateViews(element._id);
                        }
                        window.location.href = `/video/${element._id}`;
                      }}
                    >
                      <div className="browse-thumb-wrap">
                        <img
                          src={element.thumbnailURL}
                          alt="thumbnails"
                          className="browse-thumbnails"
                        />
                        <p className="duration">
                          {Math.floor(element.videoLength / 60) +
                            ":" +
                            (Math.round(element.videoLength % 60) < 10
                              ? "0" + Math.round(element.videoLength % 60)
                              : Math.round(element.videoLength % 60))}
                        </p>
                      </div>

                      <div
                        className={
                          theme === true
                            ? "channel-basic-data"
                            : "channel-basic-data text-light-mode"
                        }
                      >
                        <div className="channel-pic">
                          <img
                            className="channel-profile"
                            src={element.ChannelProfile}
                            alt="channel-profile"
                          />
                        </div>
                        <div className="channel-text-data">
                          <p className="title browse-video-title">
                            {element.Title}
                          </p>
                          <div className="video-uploader">
                            <p
                              className={
                                theme ? "uploader" : "uploader text-light-mode2"
                              }
                            >
                              {element.uploader}
                            </p>
                            <Tooltip
                              TransitionComponent={Zoom}
                              title="Verified"
                              placement="right"
                            >
                              <CheckCircleIcon
                                fontSize="100px"
                                style={{
                                  color: "rgb(138, 138, 138)",
                                  marginLeft: "4px",
                                }}
                              />
                            </Tooltip>
                          </div>
                          <div
                            className={
                              theme ? "view-time" : "view-time text-light-mode2"
                            }
                          >
                            <p className="views">
                              {element.views >= 1e9
                                ? `${(element.views / 1e9).toFixed(1)}B`
                                : element.views >= 1e6
                                  ? `${(element.views / 1e6).toFixed(1)}M`
                                  : element.views >= 1e3
                                    ? `${(element.views / 1e3).toFixed(1)}K`
                                    : element.views}{" "}
                              views
                            </p>
                            <p
                              className="upload-time"
                            >
                              &#x2022;{" "}
                              {(() => {
                                const timeDifference =
                                  new Date() - new Date(element.uploaded_date);
                                const minutes = Math.floor(
                                  timeDifference / 60000
                                );
                                const hours = Math.floor(
                                  timeDifference / 3600000
                                );
                                const days = Math.floor(
                                  timeDifference / 86400000
                                );
                                const weeks = Math.floor(
                                  timeDifference / 604800000
                                );
                                const years = Math.floor(
                                  timeDifference / 31536000000
                                );

                                if (minutes < 1) {
                                  return "just now";
                                } else if (minutes < 60) {
                                  return `${minutes} mins ago`;
                                } else if (hours < 24) {
                                  return `${hours} hours ago`;
                                } else if (days < 7) {
                                  return `${days} days ago`;
                                } else if (weeks < 52) {
                                  return `${weeks} weeks ago`;
                                } else {
                                  return `${years} years ago`;
                                }
                              })()}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default Browse;
