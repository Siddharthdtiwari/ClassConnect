const validate = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    console.error("Zod Validation Error:", error.errors);
    
    // Check if it's an API route or Web route
    if (req.originalUrl.startsWith('/api/') || req.headers.accept?.includes('application/json')) {
      return res.status(400).json({ 
        error: "Validation failed", 
        details: error.errors 
      });
    }

    // For EJS web routes
    return res.status(400).send(`Input Validation Failed: ${error.errors.map(e => e.message).join(', ')} <a href="javascript:history.back()">Go back</a>`);
  }
};

module.exports = validate;
