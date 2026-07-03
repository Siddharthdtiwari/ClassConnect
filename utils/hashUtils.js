const crypto = require("crypto");

const signId = (id) => {
  if (!id) return "";
  const secret = process.env.SESSION_SECRET || 'secret';
  return crypto.createHmac("sha256", secret).update(id.toString()).digest("hex");
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
