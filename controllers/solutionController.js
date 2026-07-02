const sanitizeHtml = require('sanitize-html');

const CLASSCONNECT_API = process.env.CLASSCONNECT_API_URL || 'http://localhost:3000/api';
const API_TIMEOUT_MS = 8000;

const SOLUTION_HTML_SANITIZE_OPTIONS = {
  allowedTags: ['h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'br', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'code', 'pre', 'sup', 'sub', 'span', 'div'],
  allowedAttributes: {
    '*': ['style', 'class']
  },
  allowedStyles: {
    '*': {
      'color': [/.*/],
      'text-align': [/.*/],
      'font-weight': [/.*/]
    }
  }
};

exports.renderSolutions = async (req, res) => {
  try {
    const { board, classLevel, subject, search } = req.query;

    // Build query params to pass to ClassConnect API
    const params = new URLSearchParams();
    if (board) params.append('board', board);
    if (classLevel) params.append('classLevel', classLevel);
    if (subject) params.append('subject', subject);
    if (search) params.append('search', search);

    // Fetch from the central ClassConnect SaaS API
    const response = await fetch(`${CLASSCONNECT_API}/solutions?${params.toString()}`, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    const data = await response.json();
    let solutions = data.success ? data.data : [];
    
    // Convert relative pdfUrls to absolute URLs pointing to ClassConnect's domain
    const baseDomain = CLASSCONNECT_API.replace('/api', '');
    solutions = solutions.map(sol => {
      if (sol.pdfUrl && sol.pdfUrl.startsWith('/')) {
        sol.pdfUrl = baseDomain + sol.pdfUrl;
      }
      return sol;
    });

    // Determine the view based on role
    let viewPath = "student/solutions";
    if (req.isTeacher) {
      viewPath = "teacher/solutions";
    }

    res.render(viewPath, { 
      solutions, 
      searchQuery: req.query 
    });
  } catch (err) {
    console.error("renderSolutions API fetch error:", err);
    res.status(500).send("Error loading solutions from ClassConnect API");
  }
};

exports.renderViewSolution = async (req, res) => {
  try {
    // Fetch a single solution by ID from the central SaaS API
    const response = await fetch(`${CLASSCONNECT_API}/solutions/${encodeURIComponent(req.params.id)}`, { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    const data = await response.json();
    const solution = data.success ? data.data : null;

    if (!solution || solution.formatType !== 'HTML' || !solution.htmlContent) {
      return res.status(404).send("HTML Solution not found on ClassConnect servers.");
    }

    // Defense-in-depth: sanitize even though the source API also sanitizes on save,
    // since this content originates from a separate service we don't control.
    solution.htmlContent = sanitizeHtml(solution.htmlContent, SOLUTION_HTML_SANITIZE_OPTIONS);

    res.render("shared/view_solution", { solution });
  } catch (err) {
    console.error("View solution API fetch error:", err);
    res.status(err.name === 'TimeoutError' ? 504 : 500).send("Error rendering solution from ClassConnect API");
  }
};

