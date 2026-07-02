const CLASSCONNECT_API = process.env.CLASSCONNECT_API_URL || 'http://localhost:3000/api';

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
    const response = await fetch(`${CLASSCONNECT_API}/solutions?${params.toString()}`);
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
    const response = await fetch(`${CLASSCONNECT_API}/solutions/${req.params.id}`);
    const data = await response.json();
    const solution = data.success ? data.data : null;

    if (!solution || solution.formatType !== 'HTML' || !solution.htmlContent) {
      return res.status(404).send("HTML Solution not found on ClassConnect servers.");
    }
    
    res.render("shared/view_solution", { solution });
  } catch (err) {
    console.error("View solution API fetch error:", err);
    res.status(500).send("Error rendering solution from ClassConnect API");
  }
};

