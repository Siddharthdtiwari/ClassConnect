const express = require('express');
const router = express.Router();
const { SITE, BANDS, PAGES } = require('../utils/seoPages');

// Static, DB-free marketing pages. They are deliberately registered without
// ensureDBConnection so a cold MongoDB connection can never make them 500 for a crawler.
PAGES.forEach((page) => {
  router.get(`/${page.slug}`, (req, res) => {
    res.set('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    res.render('seo/landing', {
      page,
      site: SITE,
      bands: page.bands.map((k) => BANDS[k]),
      siblings: PAGES.filter((p) => p.slug !== page.slug)
    });
  });
});

// Short, memorable link for the QR code / WhatsApp message asking parents for a Google review.
// Set GOOGLE_REVIEW_URL to the "Get more reviews" link from the Business Profile dashboard.
router.get('/review', (req, res) => {
  const target = process.env.GOOGLE_REVIEW_URL || 'https://www.google.com/maps?cid=10829597217759303032';
  res.redirect(302, target);
});

module.exports = router;
