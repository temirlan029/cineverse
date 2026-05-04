require("dotenv").config();
const express = require("express");
const cookieSession = require("cookie-session");
const passport = require("passport");
const crypto = require("crypto");
const path = require("path");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 3000;

/* ===== Trust proxy (Railway) ===== */
if (process.env.RAILWAY_PUBLIC_DOMAIN) {
  app.set("trust proxy", 1);
}

/* ===== Base URL ===== */
var BASE_URL = process.env.SITE_URL
  || (process.env.RAILWAY_PUBLIC_DOMAIN ? "https://" + process.env.RAILWAY_PUBLIC_DOMAIN : "")
  || "http://localhost:" + PORT;

/* ===== Cookie Session (data stored in cookie, survives server restarts) ===== */
app.use(
  cookieSession({
    name: "cineverse_session",
    keys: [process.env.SESSION_SECRET || "cineverse-dev-secret"],
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: !!process.env.RAILWAY_PUBLIC_DOMAIN,
    sameSite: "lax",
  })
);

/* Passport 0.6+ compatibility with cookie-session */
app.use(function (req, res, next) {
  if (req.session && !req.session.regenerate) {
    req.session.regenerate = function (cb) { cb(); };
  }
  if (req.session && !req.session.save) {
    req.session.save = function (cb) { cb(); };
  }
  next();
});

/* ===== Passport ===== */
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function (user, done) {
  done(null, user);
});
passport.deserializeUser(function (user, done) {
  done(null, user);
});

/* ===== Google OAuth ===== */
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const GoogleStrategy = require("passport-google-oauth20").Strategy;
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: BASE_URL + "/auth/google/callback",
      },
      function (_accessToken, _refreshToken, profile, done) {
        done(null, {
          id: profile.id,
          name: profile.displayName,
          email: (profile.emails && profile.emails[0] && profile.emails[0].value) || "",
          avatar: (profile.photos && profile.photos[0] && profile.photos[0].value) || "",
          provider: "google",
        });
      }
    )
  );

  app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
  app.get(
    "/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/?auth=error" }),
    function (_req, res) {
      res.redirect("/?auth=success");
    }
  );

  console.log("[Auth] Google OAuth enabled");
} else {
  console.log("[Auth] Google OAuth disabled (set GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET)");
}

/* ===== VK ID OAuth (PKCE) ===== */
if (process.env.VK_APP_ID) {
  function generatePKCE() {
    var verifier = crypto.randomBytes(32).toString("base64url");
    var challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    return { verifier: verifier, challenge: challenge };
  }

  app.get("/auth/vk", function (req, res) {
    var pkce = generatePKCE();
    var state = crypto.randomBytes(16).toString("hex");
    var deviceId = crypto.randomUUID();
    req.session.vk_code_verifier = pkce.verifier;
    req.session.vk_state = state;
    req.session.vk_device_id = deviceId;

    var params = new URLSearchParams({
      response_type: "code",
      client_id: process.env.VK_APP_ID,
      redirect_uri: BASE_URL + "/auth/vk/callback",
      state: state,
      scope: "vkid.personal_info email",
      code_challenge: pkce.challenge,
      code_challenge_method: "s256",
      device_id: deviceId,
    });

    res.redirect("https://id.vk.com/authorize?" + params.toString());
  });

  app.get("/auth/vk/callback", async function (req, res) {
    var code = req.query.code;
    var state = req.query.state;
    var deviceId = req.query.device_id || req.session.vk_device_id;

    if (!code || state !== req.session.vk_state) {
      console.log("[VK] state mismatch or no code");
      return res.redirect("/?auth=error");
    }

    try {
      /* Exchange code for tokens */
      var tokenBody = {
        grant_type: "authorization_code",
        code: code,
        client_id: process.env.VK_APP_ID,
        redirect_uri: BASE_URL + "/auth/vk/callback",
        code_verifier: req.session.vk_code_verifier,
        device_id: deviceId,
        state: state,
      };
      var tokenRes = await fetch("https://id.vk.com/oauth2/auth", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(tokenBody).toString(),
      });
      var tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        console.log("[VK] token error:", tokenData.error, tokenData.error_description);
        return res.redirect("/?auth=error");
      }

      /* Get user info */
      var userRes = await fetch("https://id.vk.com/oauth2/user_info", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          access_token: tokenData.access_token,
          client_id: process.env.VK_APP_ID,
        }).toString(),
      });
      var userData = await userRes.json();

      var user = userData.user || userData;
      req.login(
        {
          id: user.user_id || user.id || tokenData.user_id,
          name: ((user.first_name || "") + " " + (user.last_name || "")).trim() || "VK User",
          email: user.email || "",
          avatar: user.avatar || user.photo_200 || "",
          provider: "vk",
        },
        function (err) {
          if (err) {
            console.log("[VK] login error:", err);
            return res.redirect("/?auth=error");
          }
          res.redirect("/?auth=success");
        }
      );
    } catch (e) {
      console.log("[VK] callback error:", e);
      res.redirect("/?auth=error");
    }
  });

  console.log("[Auth] VK ID OAuth enabled (App ID: " + process.env.VK_APP_ID + ")");
} else {
  console.log("[Auth] VK ID OAuth disabled (set VK_APP_ID)");
}

/* ===== JSON body parser ===== */
app.use(express.json());

/* ===== MongoDB ===== */
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI).then(function () {
    console.log("[DB] MongoDB connected");
  }).catch(function (err) {
    console.log("[DB] MongoDB error:", err.message);
  });
} else {
  console.log("[DB] MongoDB disabled (set MONGODB_URI)");
}

var favoriteSchema = new mongoose.Schema({
  userId: String,
  provider: String,
  filmId: Number,
  nameRu: String,
  nameEn: String,
  posterUrl: String,
  year: String,
  rating: String,
  addedAt: { type: Date, default: Date.now },
});
favoriteSchema.index({ userId: 1, provider: 1, filmId: 1 }, { unique: true });
var Favorite = mongoose.model("Favorite", favoriteSchema);

var commentSchema = new mongoose.Schema({
  userId: String,
  userName: String,
  userAvatar: String,
  provider: String,
  filmId: Number,
  text: String,
  createdAt: { type: Date, default: Date.now },
});
var Comment = mongoose.model("Comment", commentSchema);

var historySchema = new mongoose.Schema({
  userId: String,
  provider: String,
  filmId: Number,
  nameRu: String,
  nameEn: String,
  posterUrl: String,
  year: String,
  rating: String,
  viewedAt: { type: Date, default: Date.now },
});
historySchema.index({ userId: 1, provider: 1, filmId: 1 });
var History = mongoose.model("History", historySchema);

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  next();
}

function userKey(req) {
  return { userId: String(req.user.id), provider: req.user.provider };
}

/* ===== Favorites API ===== */
app.get("/api/favorites", requireAuth, async function (req, res) {
  try {
    var favs = await Favorite.find(userKey(req)).sort({ addedAt: -1 });
    res.json(favs);
  } catch (e) { res.status(500).json({ error: "DB error" }); }
});

app.post("/api/favorites", requireAuth, async function (req, res) {
  try {
    var key = userKey(req);
    var existing = await Favorite.findOne({ userId: key.userId, provider: key.provider, filmId: req.body.filmId });
    if (existing) {
      await Favorite.deleteOne({ _id: existing._id });
      return res.json({ action: "removed" });
    }
    await Favorite.create({
      userId: key.userId,
      provider: key.provider,
      filmId: req.body.filmId,
      nameRu: req.body.nameRu,
      nameEn: req.body.nameEn,
      posterUrl: req.body.posterUrl,
      year: req.body.year,
      rating: req.body.rating,
    });
    res.json({ action: "added" });
  } catch (e) { res.status(500).json({ error: "DB error" }); }
});

app.get("/api/favorites/check/:filmId", requireAuth, async function (req, res) {
  try {
    var key = userKey(req);
    var exists = await Favorite.findOne({ userId: key.userId, provider: key.provider, filmId: Number(req.params.filmId) });
    res.json({ isFav: !!exists });
  } catch (e) { res.status(500).json({ error: "DB error" }); }
});

/* ===== Comments API ===== */
app.get("/api/comments/:filmId", async function (req, res) {
  try {
    var comments = await Comment.find({ filmId: Number(req.params.filmId) }).sort({ createdAt: -1 }).limit(50);
    res.json(comments);
  } catch (e) { res.status(500).json({ error: "DB error" }); }
});

app.post("/api/comments", requireAuth, async function (req, res) {
  try {
    var text = (req.body.text || "").trim();
    if (!text || text.length > 1000) return res.status(400).json({ error: "Invalid comment" });
    var comment = await Comment.create({
      userId: String(req.user.id),
      userName: req.user.name,
      userAvatar: req.user.avatar || "",
      provider: req.user.provider,
      filmId: req.body.filmId,
      text: text,
    });
    res.json(comment);
  } catch (e) { res.status(500).json({ error: "DB error" }); }
});

app.delete("/api/comments/:id", requireAuth, async function (req, res) {
  try {
    var comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ error: "Not found" });
    if (comment.userId !== String(req.user.id) || comment.provider !== req.user.provider) {
      return res.status(403).json({ error: "Forbidden" });
    }
    await Comment.deleteOne({ _id: comment._id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "DB error" }); }
});

/* ===== History API ===== */
app.get("/api/history", requireAuth, async function (req, res) {
  try {
    var items = await History.find(userKey(req)).sort({ viewedAt: -1 }).limit(50);
    res.json(items);
  } catch (e) { res.status(500).json({ error: "DB error" }); }
});

app.post("/api/history", requireAuth, async function (req, res) {
  try {
    var key = userKey(req);
    await History.findOneAndUpdate(
      { userId: key.userId, provider: key.provider, filmId: req.body.filmId },
      {
        userId: key.userId, provider: key.provider,
        filmId: req.body.filmId, nameRu: req.body.nameRu, nameEn: req.body.nameEn,
        posterUrl: req.body.posterUrl, year: req.body.year, rating: req.body.rating,
        viewedAt: new Date(),
      },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "DB error" }); }
});

/* ===== Profile Stats API ===== */
app.get("/api/profile/stats", requireAuth, async function (req, res) {
  try {
    var key = userKey(req);
    var favCount = await Favorite.countDocuments(key);
    var commentCount = await Comment.countDocuments({ userId: key.userId, provider: key.provider });
    var historyCount = await History.countDocuments(key);
    res.json({ favorites: favCount, comments: commentCount, history: historyCount });
  } catch (e) { res.status(500).json({ error: "DB error" }); }
});

/* ===== Auth API ===== */
app.get("/api/me", function (req, res) {
  if (req.user) {
    res.json(req.user);
  } else {
    res.json(null);
  }
});

app.get("/api/providers", function (_req, res) {
  res.json({
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    vk: !!process.env.VK_APP_ID,
  });
});

app.get("/auth/logout", function (req, res) {
  req.logout(function () {
    res.redirect("/");
  });
});

/* ===== Kinopoisk API Proxy ===== */
const KP_KEY = process.env.KINOPOISK_API_KEY || "";

app.get("/api/kp/*", async function (req, res) {
  if (!KP_KEY) {
    return res.status(500).json({ error: "KINOPOISK_API_KEY not set" });
  }
  try {
    var apiPath = req.params[0];
    var qs = new URLSearchParams(req.query).toString();
    var url = "https://kinopoiskapiunofficial.tech/api/" + apiPath + (qs ? "?" + qs : "");

    var response = await fetch(url, {
      headers: { "X-API-KEY": KP_KEY, Accept: "application/json" },
    });
    var data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "Kinopoisk API error" });
  }
});

/* ===== Static files ===== */
app.use(express.static(path.join(__dirname, "public")));

app.get("*", function (_req, res) {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ===== Start ===== */
app.listen(PORT, function () {
  console.log("CineVerse server running on http://localhost:" + PORT);
});
