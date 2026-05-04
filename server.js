require("dotenv").config();
const express = require("express");
const session = require("express-session");
const passport = require("passport");
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

/* ===== VK OAuth ===== */
if (process.env.VK_APP_ID && process.env.VK_APP_SECRET) {
  const VKStrategy = require("passport-vkontakte").Strategy;
  passport.use(
    new VKStrategy(
      {
        clientID: process.env.VK_APP_ID,
        clientSecret: process.env.VK_APP_SECRET,
        callbackURL: BASE_URL + "/auth/vk/callback",
      },
      function (_accessToken, _refreshToken, _params, profile, done) {
        done(null, {
          id: profile.id,
          name: profile.displayName,
          email: (profile.emails && profile.emails[0] && profile.emails[0].value) || "",
          avatar: (profile.photos && profile.photos[0] && profile.photos[0].value) || "",
          provider: "vk",
        });
      }
    )
  );

  app.get("/auth/vk", passport.authenticate("vkontakte"));
  app.get(
    "/auth/vk/callback",
    passport.authenticate("vkontakte", { failureRedirect: "/?auth=error" }),
    function (_req, res) {
      res.redirect("/?auth=success");
    }
  );

  console.log("[Auth] VK OAuth enabled");
} else {
  console.log("[Auth] VK OAuth disabled (set VK_APP_ID & VK_APP_SECRET)");
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
    vk: !!(process.env.VK_APP_ID && process.env.VK_APP_SECRET),
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
