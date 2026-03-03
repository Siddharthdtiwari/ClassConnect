# ClassConnect 🎓

A full-stack class management web application for teachers and students, built with Node.js, Express, MongoDB, and EJS.

## Features

### Student Portal
- 📊 **Dashboard** — Attendance summary, recent test scores, fee payment history, quick actions
- 📅 **Attendance** — Monthly calendar view with present/absent/holiday tracking
- 📝 **Test Scores** — View scores by subject with question paper links
- 💳 **Fee Payment** — Pay fees online via Razorpay or cash, download PDF receipts
- 📚 **Study Materials** — Access class notes and resources
- 🏆 **Leaderboard** — Points-based class ranking
- ✍️ **Class Tests** — Browse and download question papers

### Teacher Portal
- 📋 **Student Management** — Add, edit, bulk-import students
- 🎯 **Attendance Management** — Mark and manage daily attendance
- 📝 **Test Management** — Add/edit/delete tests with question paper uploads
- 💰 **Fee Management** — Bulk fee collection, mark cash payments, view defaulters
- 📊 **Score Management** — Record and view test scores
- 📦 **Study Materials** — Upload and manage class content

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express 5 |
| Database | MongoDB (Mongoose) |
| Templating | EJS |
| File Uploads | Multer + Cloudinary |
| Payments | Razorpay |
| Auth | bcrypt, express-session (MongoStore) |
| PDF Generation | PDFKit |
| Styling | Tailwind CSS (CDN) |

## Getting Started

### Prerequisites
- Node.js v18+
- MongoDB Atlas account (or local MongoDB)
- Cloudinary account
- Razorpay account (test keys are fine to start)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-username/ClassConnect.git
cd ClassConnect/CODE

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env and fill in your values

# 4. Start the dev server
npm run dev
```

The app will be available at `http://localhost:3000`.

## Environment Variables

Copy `.env.example` to `.env` and fill in the following:

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `CLOUDINARY_CLOUD_NAME` | Your Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `CLOUDINARY_HEADER_URL` | URL of the header image used in PDF receipts |
| `RAZORPAY_KEY_ID` | Razorpay key ID (use `rzp_test_...` for testing) |
| `RAZORPAY_KEY_SECRET` | Razorpay key secret |
| `SESSION_SECRET` | A long random string for session encryption |

## Project Structure

```
CODE/
├── app.js              # Main Express server (all routes)
├── models/
│   ├── user.js         # Student schema
│   ├── teacher.js      # Teacher schema
│   ├── test.js         # Test schema
│   ├── score.js        # Score schema
│   ├── fee.js          # Fee payment schema
│   ├── attendance.js   # Attendance schema
│   └── StudyMaterial.js
├── views/
│   ├── index.ejs       # Landing page
│   ├── partials/       # Shared partials (background)
│   ├── student/        # Student portal views
│   └── teacher/        # Teacher portal views
└── public/
    ├── css/
    ├── js/
    └── images/
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start dev server with nodemon |

## Security Notes

- All passwords are hashed with **bcrypt** (12 salt rounds)
- Sessions are stored in MongoDB via **connect-mongo**
- File uploads are restricted to JPEG, PNG, WebP, PDF (max 04 MB)
- Razorpay payment signatures are verified server-side with **HMAC-SHA256**
- `.env` is excluded from version control — never commit secrets

## License

ISC © Siddharth
