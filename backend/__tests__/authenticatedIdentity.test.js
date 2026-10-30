const { authenticatedEmail } = require("../lib/authenticatedIdentity");
const originalFetch = global.fetch;
const originalDomain = process.env.AUTH0_DOMAIN;
const req = (claims = {}) => ({ auth: { payload: { sub: "auth0|alice", ...claims } },
  headers: { authorization: "Bearer test-token" }, body: { email: "victim@example.com" } });
beforeEach(() => { process.env.AUTH0_DOMAIN = "https://trusted-test.auth0.com/"; });
afterEach(() => { global.fetch = originalFetch; process.env.AUTH0_DOMAIN = originalDomain; });
test("accepts only verified JWT email claims, never body email", async () => {
 global.fetch = jest.fn();
 await expect(authenticatedEmail(req({ email: "alice@example.com", email_verified: true }))).resolves.toBe("alice@example.com");
 expect(global.fetch).not.toHaveBeenCalled();
});
test("userinfo uses configured HTTPS tenant, Bearer, no redirects and a timeout", async () => {
 global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ sub: "auth0|alice", email: "alice@example.com", email_verified: true }) });
 await expect(authenticatedEmail(req())).resolves.toBe("alice@example.com");
 expect(global.fetch).toHaveBeenCalledWith("https://trusted-test.auth0.com/userinfo", expect.objectContaining({
  headers: { Authorization: "Bearer test-token" }, redirect: "error", signal: expect.any(AbortSignal),
 }));
});
test.each([
 { sub: "auth0|victim", email: "victim@example.com", email_verified: true },
 { sub: "auth0|alice", email: "victim@example.com", email_verified: false },
 { sub: "auth0|alice", email: "victim@example.com", email_verified: "true" },
 { sub: "auth0|alice", email_verified: true },
])("rejects mismatched or unverified identity without accepting caller email", async (identity) => {
 global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => identity });
 await expect(authenticatedEmail(req())).rejects.toMatchObject({ status: 403 });
});
test.each(["http://trusted-test.auth0.com", "https://trusted-test.auth0.com/other", "https://user:pass@trusted-test.auth0.com"])("invalid tenant fails closed before sending bearer: %s", async domain => {
 process.env.AUTH0_DOMAIN = domain;
 global.fetch = jest.fn();
 await expect(authenticatedEmail(req())).rejects.toMatchObject({ status: 503 });
 expect(global.fetch).not.toHaveBeenCalled();
});
test("userinfo unavailable fails closed", async () => {
 global.fetch = jest.fn().mockRejectedValue(new Error("timeout"));
 await expect(authenticatedEmail(req())).rejects.toMatchObject({ status: 503 });
});
