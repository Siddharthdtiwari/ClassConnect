const crypto = require("crypto");

const signId = (id) => {
  if (!id) return "";
  return crypto.createHmac("sha256", process.env.SESSION_SECRET).update(id.toString()).digest("hex");
};

const verifySignature = (id, signature) => {
  if (!id || !signature) return false;
  const expectedSignature = signId(id);
  return signature === expectedSignature;
};

module.exports = {
  signId,
  verifySignature
};
