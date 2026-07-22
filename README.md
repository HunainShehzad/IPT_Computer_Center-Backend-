# ipt-backend

API-only Next.js app for IPT Computer Center. Runs on port **4000**.

## Required Environment Variables

Create a `.env.local` file in this directory:

```
MONGODB_URI=mongodb+srv://...
NEXTAUTH_SECRET=<shared-secret>
NEXTAUTH_URL=http://localhost:4000
GMAIL_USER=youremail@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
FRONTEND_URL=http://localhost:3000
ADMIN_PASSWORD=admin123
```

## Setup & Run

```bash
# Install dependencies
npm install

# Development (port 4000)
npm run dev

# Production
npm run build
npm run start
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health check |
| POST | /api/auth/validate | Credential validation |
| GET/POST | /api/attendance | Attendance records |
| GET | /api/attendance/report | Attendance report |
| GET/POST | /api/batches | Batches |
| PUT/DELETE | /api/batches/[id] | Batch by ID |
| GET/POST | /api/fees | Fee records |
| GET | /api/stats | Dashboard stats |
| GET/POST | /api/students | Students |
| PUT | /api/students/[id] | Student by ID |
| GET/POST | /api/teachers | Teachers |
| PUT/DELETE | /api/teachers/[id] | Teacher by ID |
| POST/DELETE | /api/teachers/[id]/picture | Teacher photo |
| GET | /api/teacher/me | Current teacher |
| POST | /api/teacher/change-password | Change password |
| POST | /api/auth/forgot-password | OTP password reset |

## Notes

- All protected routes require `Authorization: Bearer <JWT>` header
- CORS is configured to allow requests from `FRONTEND_URL`
- The frontend project must run on port 3000 and share the same `NEXTAUTH_SECRET`
