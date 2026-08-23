# Tuition Hub (ClassConnect)

A web-based management system for tuition centres and coaching academies. It gives teachers/admins a full back-office (students, batches, attendance, fees, tests, leaderboards, reporting) and gives students their own portal to track fees, attendance, scores, and study material — plus a REST API for a companion mobile app.

**Live:** https://tuitionhub.vercel.app

## Features

### Teacher / Admin Portal
- **Student management** — add/edit/bulk-import students, deactivate accounts, per-student profile & report cards (PDF)
- **Batch management** — group students by academic year/class
- **Attendance** — daily marking, bulk entry, defaulter lists, monthly emailed reports
- **Fees** — monthly fee tracking, payment recording, PDF receipts, defaulter reminders (email), month-level "N/A" marking for mid-year joiners
- **Tests & scores** — create tests, enter/import scores, AI-assisted question paper generation, consolidated score printing
- **Leaderboards** — global and per-test rankings
- **Syllabus & timetable** tracking
- **Study materials** — upload and repost resources (Cloudinary-backed)
- **Finance** — income/expense tracking, salary management, P&L reporting
- **Communication logs** — searchable log of every email sent, with delivery status and duplicate-send detection
- **Audit trail** — every sensitive action (create/update/delete/login) is logged with who did what, when
- **Role-based access** — `teacher` / `admin` / `owner` roles with different permission levels

### Student Portal
- Personal dashboard — points, rank, attendance %, fee status
- Fee payment via Razorpay, downloadable receipts and fee summaries
- Attendance history, test scores, syllabus & timetable
- Study materials and shared solutions
- Leaderboard (global + batch)
- Profile management

### Public / Shareable Links
- Signed, no-login report cards, fee summaries, and receipts that can be shared directly (e.g. over WhatsApp)

## Tech Stack

- **Backend:** Node.js, Express 5
- **Database:** MongoDB (Mongoose)
- **Views:** EJS + Tailwind (CDN)
- **Auth:** express-session (MongoDB-backed store), bcrypt, CSRF protection via csrf-sync
- **File storage:** Cloudinary
- **Payments:** Razorpay
- **Email:** Nodemailer
- **PDF generation:** PDFKit
- **Scheduled jobs:** node-cron
- **Logging:** Winston (daily rotating file logs)

## Prerequisites

- Node.js 18+
- A MongoDB database (Atlas or self-hosted)
- Cloudinary account (for file uploads)
- Razorpay account (for fee payments)
- A Gmail account with an [app password](https://support.google.com/accounts/answer/185833) (for sending emails) — see [Notes on email delivery](#notes-on-email-delivery) below

## Getting Started

```bash
# Clone the repo
git clone https://github.com/Siddharthdtiwari/ClassConnect.git
cd ClassConnect

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# then fill in .env with your own values (see below)

# Run in development (auto-restarts on file changes)
npm run dev

# Or run in production mode
npm start
```

The app listens on `http://localhost:3000` by default (configurable via `PORT`).

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `SESSION_SECRET` | Long random string used to sign session cookies |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Cloudinary credentials for file uploads |
| `CLOUDINARY_HEADER_URL` | Optional letterhead image used on generated PDFs |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay credentials for fee payments |
| `CONTACT_EMAIL_USER` / `CONTACT_EMAIL_PASS` | Gmail account + app password used to send all outbound email |
| `CONTACT_EMAIL_TO` | Inbox that receives contact-form submissions |
| `GEMINI_API_KEY` | Used for AI-assisted question paper generation |
| `BASE_URL` | Public base URL of the deployment (used in generated links/emails) |
| `NODE_ENV` | `development` or `production` |

`MONGODB_URI` and `SESSION_SECRET` are required — the app refuses to start without them.

## Project Structure

```
├── app.js                    # App entry point: middleware, security, route mounting
├── routes/
│   ├── publicRoutes.js       # Landing page, public shareable report/receipt links
│   ├── studentRoutes.js      # Student portal (session-based)
│   ├── teacherRoutes.js      # Teacher/admin portal (session-based)
│   └── api/                  # JSON REST API (JWT-based, for the mobile app)
├── controllers/
│   ├── student/               # Student portal business logic
│   ├── teacher/               # Teacher/admin portal business logic
│   └── solutionController.js
├── models/                   # Mongoose schemas (User, Teacher, Fee, Score, Test, Attendance, ...)
├── middlewares/
│   ├── auth.js                # DB connection guard, login/role guards
│   └── batchContext.js        # Resolves the academic-year batches in scope for a request
├── utils/
│   ├── emailService.js        # All outbound email templates + sending
│   ├── pdf/                   # PDF generators (receipts, report cards, defaulter lists, ...)
│   ├── renderError.js         # Styled 404/500 error page helper
│   └── ...
├── services/cronService.js   # Scheduled jobs (daily exam reminders, etc.)
└── views/                    # EJS templates (teacher/, student/, error/, partials/)
```

## Notes on Email Delivery

This app currently sends all outbound email (receipts, reminders, reports) through a single Gmail account via SMTP. Gmail is not built for automated/bulk sending — under any real volume it will throttle, soft-bounce, or block messages, which shows up as "Message blocked" / "temporary problem" bounces and inconsistent delivery. For production use at scale, switching to a dedicated transactional email provider (Resend, SendGrid, Amazon SES, Postmark, or Mailgun) on a verified custom domain is strongly recommended — see the project's Email Logs page (`/teacher/reports/communications`) for delivery status and failure tracking in the meantime.

## License

ISC
