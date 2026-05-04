require("dotenv").config();
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

/* ===== Session ===== */
app.use(
  session({
    secret: process.env.SESSION_SECRET || "cineverse-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production" && process.env.RAILWAY_PUBLIC_DOMAIN ? true : false,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
    },
  })
);

/* ===== Trust proxy (Railway) ===== */
if (process.env.RAILWAY_PUBLIC_DOMAIN) {
  app.set("trust proxy", 1);
}

/* ===== Base URL ===== */
var BASE_URL = process.env.SITE_URL
  || (process.env.RAILWAY_PUBLIC_DOMAIN ? "https://" + process.env.RAILWAY_PUBLIC_DOMAIN : "")
  || "http://localhost:" + PORT;

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
    req.session.vk_code_verifier = pkce.verifier;
    req.session.vk_state = state;

    var params = new URLSearchParams({
      response_type: "code",
      client_id: process.env.VK_APP_ID,
      redirect_uri: BASE_URL + "/auth/vk/callback",
      state: state,
      scope: "vkid.personal_info email",
      code_challenge: pkce.challenge,
      code_challenge_method: "s256",
    });

    res.redirect("https://id.vk.com/authorize?" + params.toString());
  });

  app.get("/auth/vk/callback", async function (req, res) {
    var code = req.query.code;
    var state = req.query.state;

    if (!code || state !== req.session.vk_state) {
      console.log("[VK] state mismatch or no code");
      return res.redirect("/?auth=error");
    }

    try {
      /* Exchange code for tokens */
      var tokenRes = await fetch("https://id.vk.com/oauth2/auth", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code,
          client_id: process.env.VK_APP_ID,
          redirect_uri: BASE_URL + "/auth/vk/callback",
          code_verifier: req.session.vk_code_verifier,
          device_id: req.session.vk_state,
        }).toString(),
      });
      var tokenData = await tokenRes.json();
      console.log("[VK] token response:", JSON.stringify(tokenData));

      if (!tokenData.access_token) {
        console.log("[VK] no access_token in response");
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
      console.log("[VK] user_info response:", JSON.stringify(userData));

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
