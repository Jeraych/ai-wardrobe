// Only deployment configuration selects the tenant; request inputs never select a host.
function userinfoUrl() {
  const domain = process.env.AUTH0_DOMAIN;
  if (!domain) throw new Error("Identity tenant is not configured");
  const issuer = new URL(domain.includes("://") ? domain : `https://${domain}`);
  if (issuer.protocol !== "https:" || issuer.username || issuer.password || issuer.port ||
      issuer.search || issuer.hash || issuer.pathname !== "/") throw new Error("Invalid identity tenant");
  return new URL("/userinfo", issuer).href;
}
function verifiedEmail(identity, subject) {
  return identity?.sub === subject && identity.email_verified === true &&
    typeof identity.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email) && identity.email.length <= 320;
}
async function authenticatedEmail(req) {
  const claims = req.auth.payload;
  if (verifiedEmail(claims, claims.sub)) return claims.email;
  const authorization = req.headers.authorization;
  if (typeof authorization !== "string" || !/^Bearer [^\s]+$/i.test(authorization)) {
    throw Object.assign(new Error("A verified identity email is required"), { status: 403 });
  }
  let identity;
  try {
    const response = await fetch(userinfoUrl(), {
      headers: { Authorization: authorization }, redirect: "error", signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Identity lookup failed");
    identity = await response.json();
  } catch {
    throw Object.assign(new Error("Could not verify identity. Please try again later."), { status: 503 });
  }
  if (!verifiedEmail(identity, claims.sub)) {
    throw Object.assign(new Error("A verified identity email is required"), { status: 403 });
  }
  return identity.email;
}
module.exports = { authenticatedEmail };
