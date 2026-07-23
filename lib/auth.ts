import { ensureSchema } from "../db/ensure-schema";

export const SESSION_COOKIE = "__Host-carpulse_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const PASSWORD_ITERATIONS = 600_000;
const PBKDF2_OPERATION_LIMIT = 100_000;

const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 128;
const LOGIN_WINDOW_MINUTES = 15;
const LOGIN_FAILURE_LIMIT = 5;

export type UserRole = "user" | "admin";
export type UserStatus = "active" | "blocked";

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
};

type UserCredentialRow = SessionUser & {
  password_hash: string;
  password_salt: string;
  password_iterations: number;
};

export class AuthError extends Error {
  constructor(
    message: string,
    public status = 401,
    public code = "unauthorized",
  ) {
    super(message);
  }
}

export function normalizeEmail(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en");
}

export function bootstrapOwnerEmail(request: Request) {
  const forwarded = request.headers.get("oai-authenticated-user-email");
  if (forwarded) return normalizeEmail(forwarded);
  const hostname = new URL(request.url).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return "admin@carpulse.local";
  }
  return null;
}

export function validateName(value: string) {
  const name = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 80) {
    throw new AuthError("Имя должно содержать от 2 до 80 символов.", 400, "invalid_name");
  }
  return name;
}

export function validateEmail(value: string) {
  const email = normalizeEmail(value);
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(email)
  ) {
    throw new AuthError(
      "Введите корректную почту, например name@example.com.",
      400,
      "invalid_email",
    );
  }
  return email;
}

export function validatePassword(value: string) {
  if (value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH) {
    throw new AuthError(
      `Пароль должен содержать от ${PASSWORD_MIN_LENGTH} до ${PASSWORD_MAX_LENGTH} символов.`,
      400,
      "invalid_password",
    );
  }
  return value;
}

export async function createPasswordRecord(password: string) {
  validatePassword(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return {
    hash: bytesToBase64Url(hash),
    salt: bytesToBase64Url(salt),
    iterations: PASSWORD_ITERATIONS,
  };
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string,
  iterations: number,
) {
  const actual = await derivePassword(
    password,
    base64UrlToBytes(storedSalt),
    iterations,
  );
  return constantTimeEqual(actual, base64UrlToBytes(storedHash));
}

export async function createUser(
  database: D1Database,
  input: {
    name: string;
    email: string;
    password: string;
    role?: UserRole;
    status?: UserStatus;
  },
) {
  await ensureSchema(database);
  const name = validateName(input.name);
  const email = validateEmail(input.email);
  const password = await createPasswordRecord(input.password);
  const role = input.role === "admin" ? "admin" : "user";
  const status = input.status === "blocked" ? "blocked" : "active";

  try {
    const created = await database
      .prepare(
        `INSERT INTO users (
           name, email, password_hash, password_salt, password_iterations,
           role, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING id, name, email, role, status`,
      )
      .bind(
        name,
        email,
        password.hash,
        password.salt,
        password.iterations,
        role,
        status,
      )
      .first<SessionUser>();
    if (!created) throw new Error("User insert returned no row");
    return created;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("UNIQUE") || error.message.includes("unique"))
    ) {
      throw new AuthError(
        "Аккаунт с этой почтой уже существует. Попробуйте войти.",
        409,
        "email_exists",
      );
    }
    throw error;
  }
}

export async function authenticateUser(
  database: D1Database,
  request: Request,
  emailInput: string,
  password: string,
) {
  await ensureSchema(database);
  const email = validateEmail(emailInput);
  const attemptKey = await loginAttemptKey(request, email);
  await assertLoginAllowed(database, attemptKey);

  const user = await database
    .prepare(
      `SELECT id, name, email, role, status, password_hash, password_salt,
              password_iterations
       FROM users WHERE email = ? LIMIT 1`,
    )
    .bind(email)
    .first<UserCredentialRow>();

  const passwordMatches = user
    ? await verifyPassword(
        password,
        user.password_hash,
        user.password_salt,
        user.password_iterations,
      )
    : await consumeDummyPasswordWork(password);

  if (!user || !passwordMatches) {
    await recordLoginFailure(database, attemptKey);
    throw new AuthError(
      "Почта или пароль не подошли. Проверьте данные и попробуйте ещё раз.",
      401,
      "invalid_credentials",
    );
  }
  if (user.status !== "active") {
    await recordLoginFailure(database, attemptKey);
    throw new AuthError(
      "Вход в этот аккаунт отключён. Обратитесь к администратору.",
      403,
      "account_blocked",
    );
  }

  await database.batch([
    database.prepare("DELETE FROM login_attempts WHERE attempt_key = ?").bind(attemptKey),
    database.prepare(
      "UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).bind(user.id),
  ]);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
  } satisfies SessionUser;
}

export async function createSession(
  database: D1Database,
  userId: number,
  request: Request,
) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = bytesToBase64Url(tokenBytes);
  const tokenHash = await sha256(token);
  const expiresAt = sqliteTimestamp(
    new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
  );
  const userAgent = request.headers.get("user-agent")?.slice(0, 500) || null;

  await database.batch([
    database.prepare("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP"),
    database
      .prepare(
        `INSERT INTO sessions (
           token_hash, user_id, expires_at, user_agent
         ) VALUES (?, ?, ?, ?)`,
      )
      .bind(tokenHash, userId, expiresAt, userAgent),
  ]);

  return token;
}

export function sessionCookie(token: string) {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export function expiredSessionCookie() {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export async function getSessionUser(
  database: D1Database,
  request: Request,
): Promise<SessionUser | null> {
  await ensureSchema(database);
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = await sha256(token);
  const row = await database
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.status, s.last_seen_at
       FROM sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?
         AND s.expires_at > CURRENT_TIMESTAMP
         AND u.status = 'active'
       LIMIT 1`,
    )
    .bind(tokenHash)
    .first<SessionUser & { last_seen_at: string }>();
  if (!row) return null;

  const lastSeen = Date.parse(`${row.last_seen_at.replace(" ", "T")}Z`);
  if (!Number.isFinite(lastSeen) || Date.now() - lastSeen > 15 * 60_000) {
    await database
      .prepare(
        "UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?",
      )
      .bind(tokenHash)
      .run();
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
  };
}

export async function requireUser(database: D1Database, request: Request) {
  const user = await getSessionUser(database, request);
  if (!user) {
    throw new AuthError(
      "Сессия завершилась. Войдите снова.",
      401,
      "session_required",
    );
  }
  return user;
}

export async function requireAdmin(database: D1Database, request: Request) {
  const user = await requireUser(database, request);
  if (user.role !== "admin") {
    throw new AuthError(
      "У вас нет доступа к управлению пользователями.",
      403,
      "admin_required",
    );
  }
  return user;
}

export async function deleteRequestSession(
  database: D1Database,
  request: Request,
) {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (!token) return;
  await database
    .prepare("DELETE FROM sessions WHERE token_hash = ?")
    .bind(await sha256(token))
    .run();
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new AuthError(
      "Запрос отклонён. Обновите страницу и попробуйте ещё раз.",
      403,
      "invalid_origin",
    );
  }
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  const message =
    error instanceof Error ? error.message : "Неизвестная ошибка авторизации";
  console.error("Auth request failed", message);
  return Response.json(
    {
      error:
        "Не удалось выполнить действие. Обновите страницу и попробуйте ещё раз.",
      code: "auth_failed",
    },
    { status: 500 },
  );
}

export async function setUserPassword(
  database: D1Database,
  userId: number,
  password: string,
) {
  const record = await createPasswordRecord(password);
  await database
    .prepare(
      `UPDATE users
       SET password_hash = ?, password_salt = ?, password_iterations = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .bind(record.hash, record.salt, record.iterations, userId)
    .run();
}

export async function verifyCurrentPassword(
  database: D1Database,
  userId: number,
  password: string,
) {
  const credentials = await database
    .prepare(
      `SELECT password_hash, password_salt, password_iterations
       FROM users WHERE id = ?`,
    )
    .bind(userId)
    .first<{
      password_hash: string;
      password_salt: string;
      password_iterations: number;
    }>();
  return Boolean(
    credentials &&
      (await verifyPassword(
        password,
        credentials.password_hash,
        credentials.password_salt,
        credentials.password_iterations,
      )),
  );
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToBase64Url(new Uint8Array(digest));
}

function readCookie(header: string | null, name: string) {
  if (!header) return null;
  for (const item of header.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return value.join("=") || null;
  }
  return null;
}

async function derivePassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
) {
  let input = new TextEncoder().encode(password);
  let remaining = iterations;
  let round = 0;

  while (remaining > 0) {
    const roundIterations = Math.min(remaining, PBKDF2_OPERATION_LIMIT);
    const material = await crypto.subtle.importKey(
      "raw",
      input,
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: passwordSaltForRound(salt, round),
        iterations: roundIterations,
      },
      material,
      256,
    );
    input = new Uint8Array(bits);
    remaining -= roundIterations;
    round += 1;
  }

  return input;
}

function passwordSaltForRound(salt: Uint8Array, round: number) {
  if (round === 0) {
    const firstRoundSalt = new Uint8Array(salt.byteLength);
    firstRoundSalt.set(salt);
    return firstRoundSalt;
  }

  const roundSalt = new Uint8Array(salt.byteLength + 4);
  roundSalt.set(salt);
  roundSalt[salt.byteLength] = (round >>> 24) & 0xff;
  roundSalt[salt.byteLength + 1] = (round >>> 16) & 0xff;
  roundSalt[salt.byteLength + 2] = (round >>> 8) & 0xff;
  roundSalt[salt.byteLength + 3] = round & 0xff;
  return roundSalt;
}

async function consumeDummyPasswordWork(password: string) {
  const salt = new Uint8Array(16);
  salt.fill(91);
  await derivePassword(password || "invalid-password", salt, PASSWORD_ITERATIONS);
  return false;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] || 0) ^ (right[index] || 0);
  }
  return difference === 0;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function sqliteTimestamp(date: Date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

async function loginAttemptKey(request: Request, email: string) {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local";
  return sha256(`${ip}|${email}`);
}

async function assertLoginAllowed(database: D1Database, attemptKey: string) {
  const attempt = await database
    .prepare(
      `SELECT blocked_until FROM login_attempts
       WHERE attempt_key = ? AND blocked_until > CURRENT_TIMESTAMP`,
    )
    .bind(attemptKey)
    .first<{ blocked_until: string }>();
  if (attempt) {
    throw new AuthError(
      "Слишком много попыток входа. Подождите 15 минут и повторите.",
      429,
      "login_rate_limited",
    );
  }
}

async function recordLoginFailure(database: D1Database, attemptKey: string) {
  const current = await database
    .prepare(
      `SELECT failure_count, window_started_at
       FROM login_attempts WHERE attempt_key = ?`,
    )
    .bind(attemptKey)
    .first<{ failure_count: number; window_started_at: string }>();
  const startedAt = current
    ? Date.parse(`${current.window_started_at.replace(" ", "T")}Z`)
    : 0;
  const expired =
    !Number.isFinite(startedAt) ||
    Date.now() - startedAt > LOGIN_WINDOW_MINUTES * 60_000;
  const failureCount = expired ? 1 : Number(current?.failure_count || 0) + 1;
  const blockedUntil =
    failureCount >= LOGIN_FAILURE_LIMIT
      ? sqliteTimestamp(new Date(Date.now() + LOGIN_WINDOW_MINUTES * 60_000))
      : null;

  await database
    .prepare(
      `INSERT INTO login_attempts (
         attempt_key, failure_count, window_started_at, blocked_until, updated_at
       ) VALUES (?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(attempt_key) DO UPDATE SET
         failure_count = excluded.failure_count,
         window_started_at = CASE
           WHEN ? = 1 THEN CURRENT_TIMESTAMP
           ELSE login_attempts.window_started_at
         END,
         blocked_until = excluded.blocked_until,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(attemptKey, failureCount, blockedUntil, expired ? 1 : 0)
    .run();
}
