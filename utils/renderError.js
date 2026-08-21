const STATUS_TITLES = {
  400: "Bad Request",
  403: "Access Denied",
  404: "Page Not Found",
  500: "Internal Server Error",
};

// Renders the same styled error pages the global error handler uses, for
// controllers that need to bail out early (not found, bad input) instead of
// throwing into next(err). safeMessage should be a short, developer-authored
// string — never a raw exception message — since it's shown to the visitor.
function renderError(req, res, status, safeMessage) {
  if (status === 404) {
    return res.status(404).render("error/404", {
      url: req.originalUrl,
      method: req.method,
      safeMessage,
    });
  }

  return res.status(status).render("error/500", {
    error: {},
    statusCode: status,
    title: STATUS_TITLES[status] || "Something Went Wrong",
    safeMessage,
  });
}

module.exports = { renderError };
