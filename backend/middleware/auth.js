const { auth } = require("express-oauth2-jwt-bearer");

if (!process.env.AUTH0_DOMAIN || !process.env.AUTH0_AUDIENCE) {
  throw new Error("Missing AUTH0_DOMAIN or AUTH0_AUDIENCE in .env");
}

// Validate Auth0 access tokens before routes read req.auth.payload.sub.
const requireAuth = auth({
  issuerBaseURL: `https://${process.env.AUTH0_DOMAIN.replace(/^https?:\/\//, "").replace(/\/$/, "")}`,
  audience: process.env.AUTH0_AUDIENCE,
  tokenSigningAlg: "RS256",
});

module.exports = { requireAuth };
