import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { connectDB } from "@/lib/db";
import Teacher from "@/models/Teacher";
import bcrypt from "bcryptjs";

/**
 * NextAuth configuration.
 *
 * KEY FIXES applied here:
 * 1. `cookies` block — forces SameSite=None so the session cookie is sent
 *    cross-origin (frontend :3000 → backend :4000).  Secure=false is
 *    intentional for HTTP localhost; flip to true in production.
 * 2. `trustHost: true` — stops NextAuth from rejecting callbacks that arrive
 *    on a host/port it doesn't recognise (needed when NEXTAUTH_URL is set to
 *    the backend origin and the browser hits it from a different origin).
 * 3. CORS headers are injected into every NextAuth response via the custom
 *    GET/POST wrappers at the bottom of this file, because NextAuth's internal
 *    handler never calls withCors() and next.config headers() can be
 *    overridden by NextAuth's own Response objects.
 */

const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL     || "http://localhost:3000",
  process.env.FRONTEND_URL_LAN || "http://192.168.2.147:3000",
  "http://localhost:3000",
  "http://192.168.2.147:3000",
];

function getAllowedOrigin(requestOrigin) {
  const allowed = [...new Set(ALLOWED_ORIGINS)];
  return allowed.includes(requestOrigin) ? requestOrigin : allowed[0];
}

function makeCorsHeaders(requestOrigin) {
  return {
    "Access-Control-Allow-Origin":      getAllowedOrigin(requestOrigin),
    "Access-Control-Allow-Methods":     "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":     "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Vary":                             "Origin",
  };
}

function withAuthCors(response, requestOrigin) {
  const cloned = new Response(response.body, response);
  Object.entries(makeCorsHeaders(requestOrigin)).forEach(([k, v]) =>
    cloned.headers.set(k, v)
  );
  return cloned;
}

// ── NextAuth core config ──────────────────────────────────────────────────

const authOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        // ── Admin hardcoded login ──
        if (
          credentials.username === "admin" &&
          credentials.password === process.env.ADMIN_PASSWORD
        ) {
          return {
            id: "admin",
            name: "Admin",
            email: "admin@ipt.com",
            role: "admin",
          };
        }

        // ── Teacher DB login ──
        try {
          await connectDB();
        } catch (err) {
          console.error("[NextAuth] DB connection failed:", err.message);
          return null;
        }

        const teacher = await Teacher.findOne({
          username: credentials.username.trim(),
        });

        if (!teacher) {
          // Run bcrypt anyway to keep response time uniform (prevents timing attacks)
          await bcrypt.compare(credentials.password, "$2b$12$invalidhashpaddingtomakethislookreal000000000");
          return null;
        }

        if (teacher.status === "inactive") return null;

        const valid = await bcrypt.compare(credentials.password, teacher.passwordHash);
        if (!valid) return null;

        return {
          id: teacher._id.toString(),
          name: teacher.name,
          email: teacher.email,
          role: "teacher",
          department: teacher.department,
          assignedBatches: teacher.assignedBatches.map((b) => b.toString()),
        };
      },
    }),
  ],

  pages: { signIn: "/" },

  secret: process.env.NEXTAUTH_SECRET,

  // Trust the host header so callbacks work when the backend is on a
  // non-standard port or sits behind a reverse proxy.
  trustHost: true,

  session: { strategy: "jwt" },

  // Force the session cookie to SameSite=None so the browser sends it on
  // cross-origin requests (frontend :3000 → backend :4000).
  // httpOnly keeps it unreadable by JavaScript.
  // secure: false is required for plain HTTP on localhost.
  cookies: {
    sessionToken: {
      name: "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "none",
        path: "/",
        secure: false, // must be true in HTTPS production
      },
    },
    callbackUrl: {
      name: "next-auth.callback-url",
      options: {
        sameSite: "none",
        path: "/",
        secure: false,
      },
    },
    csrfToken: {
      name: "next-auth.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "none",
        path: "/",
        secure: false,
      },
    },
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
        token.department = user.department;
        token.assignedBatches = user.assignedBatches;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.role = token.role;
        session.user.id = token.id;
        session.user.department = token.department;
        session.user.assignedBatches = token.assignedBatches;
      }
      return session;
    },
  },
};

// ── Route handlers ────────────────────────────────────────────────────────
// We wrap NextAuth's handler so CORS headers are present on EVERY response,
// including the 401 that comes back when credentials are wrong, and the
// redirect response that carries the session cookie after a successful login.

const nextAuthHandler = NextAuth(authOptions);

export async function GET(request, context) {
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin") || "";
    return new Response(null, { status: 204, headers: makeCorsHeaders(origin) });
  }
  const origin = request.headers.get("origin") || "";
  const response = await nextAuthHandler(request, context);
  return withAuthCors(response, origin);
}

export async function POST(request, context) {
  const origin = request.headers.get("origin") || "";
  const response = await nextAuthHandler(request, context);
  return withAuthCors(response, origin);
}

export async function OPTIONS(request) {
  const origin = request.headers.get("origin") || "";
  return new Response(null, { status: 204, headers: makeCorsHeaders(origin) });
}
