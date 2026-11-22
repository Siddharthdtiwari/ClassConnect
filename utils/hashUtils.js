const crypto = require("crypto");

const signId = (id) => {
  if (!id) return "";
  // app.js exits at startup if SESSION_SECRET is unset, so it's always a real
  // secret here -- no silent fallback to a guessable default.
  return crypto.createHmac("sha256", process.env.SESSION_SECRET).update(id.toString()).digest("hex");
};

const verifySignature = (id, signature) => {
  if (!id || !signature) return false;
  const expected = Buffer.from(signId(id));
  const given = Buffer.from(String(signature));
  // timingSafeEqual throws on length mismatch, so check that first (length is not secret).
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
};

module.exports = {
  signId,
  verifySignature
};
