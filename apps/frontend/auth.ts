import { z } from "zod";
import { loginDashboard, loginDashboardGithub, refreshDashboard, type DashboardSessionBundle } from "./src/shared/auth/dashboard-auth-client";

type AuthSession = {
  readonly user?: {
    readonly email?: string | null;
    readonly name?: string | null;
  };
};

type AuthExports = {
  readonly handlers: {
    readonly GET: (request: Request) => Promise<Response>;
    readonly POST: (request: Request) => Promise<Response>;
  };
  readonly auth: () => Promise<AuthSession | null>;
  readonly signIn: (provider: string, options: Readonly<Record<string, string>>) => Promise<void>;
  readonly signOut: (options: { readonly redirectTo: string }) => Promise<void>;
};

type NextAuthFactory = (config: Readonly<Record<string, unknown>>) => AuthExports;
type ProviderFactory = (config: Readonly<Record<string, unknown>>) => unknown;
type UnknownFunction = (...args: readonly unknown[]) => unknown;

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
const dashboardBundleSchema = z.object({
  user: z.object({ id: z.string(), email: z.string().email(), name: z.string() }),
  accessCredential: z.string().min(1),
  refreshCredential: z.string().min(1),
  accessExpiresAt: z.string().datetime(),
});
const dashboardUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  accessCredential: z.string().min(1),
  refreshCredential: z.string().min(1),
  accessExpiresAt: z.string().datetime(),
});
const jwtInputSchema = z.object({
  token: z.record(z.string(), z.unknown()),
  user: z.unknown().optional(),
  account: z.unknown().optional(),
});
const sessionInputSchema = z.object({
  session: z.record(z.string(), z.unknown()),
  token: z.record(z.string(), z.unknown()),
});

const nextAuthPackage = "next-" + "auth";
const credentialsPackage = "next-" + "auth/providers/credentials";
const githubPackage = "next-" + "auth/providers/github";
const nextAuthModule: unknown = await import(nextAuthPackage);
const credentialsModule: unknown = await import(credentialsPackage);
const githubModule: unknown = await import(githubPackage);
const NextAuth = nextAuthFactory(nextAuthModule);
const Credentials = providerFactory(credentialsModule);
const Github = providerFactory(githubModule);

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env["AUTH_SECRET"] ?? "test_auth_secret_not_secret_32_chars",
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials: unknown) => {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }
        const bundle = await loginDashboard(parsed.data);
        if (bundle === null) {
          return null;
        }
        return authUser(bundle);
      },
    }),
    Github({
      clientId: process.env["GITHUB_CLIENT_ID"],
      clientSecret: process.env["GITHUB_CLIENT_SECRET"],
    }),
  ],
  callbacks: {
    async jwt(input: unknown): Promise<Record<string, unknown>> {
      const parsed = jwtInputSchema.safeParse(input);
      if (!parsed.success) {
        return {};
      }
      const created = dashboardUserSchema.safeParse(parsed.data.user);
      if (created.success) {
        return dashboardToken(parsed.data.token, bundleFromUser(created.data));
      }
      const githubAccount = z.object({ provider: z.literal("github"), access_token: z.string().min(1) }).safeParse(parsed.data.account);
      if (githubAccount.success) {
        const githubBundle = await loginDashboardGithub(githubAccount.data.access_token);
        if (githubBundle !== null) {
          return dashboardToken(parsed.data.token, githubBundle);
        }
      }
      const existing = dashboardBundleSchema.safeParse({
        user: {
          id: parsed.data.token["sub"],
          email: parsed.data.token["email"],
          name: parsed.data.token["name"],
        },
        accessCredential: parsed.data.token["dashboardAccessCredential"],
        refreshCredential: parsed.data.token["dashboardRefreshCredential"],
        accessExpiresAt: parsed.data.token["dashboardAccessExpiresAt"],
      });
      if (!existing.success || Date.parse(existing.data.accessExpiresAt) > Date.now() + 60_000) {
        return parsed.data.token;
      }
      const refreshed = await refreshDashboard(existing.data.refreshCredential);
      return refreshed === null ? parsed.data.token : dashboardToken(parsed.data.token, refreshed);
    },
    async session(input: unknown): Promise<Record<string, unknown>> {
      const parsed = sessionInputSchema.safeParse(input);
      if (!parsed.success) {
        return {};
      }
      const tokenUser = z.object({ id: z.string(), email: z.string().email(), name: z.string() }).safeParse({
        id: parsed.data.token["sub"],
        email: parsed.data.token["email"],
        name: parsed.data.token["name"],
      });
      if (!tokenUser.success) {
        return parsed.data.session;
      }
      return { ...parsed.data.session, user: tokenUser.data };
    },
  },
});

function authUser(bundle: DashboardSessionBundle): Record<string, string> {
  return {
    id: bundle.user.id,
    email: bundle.user.email,
    name: bundle.user.name,
    accessCredential: bundle.accessCredential,
    refreshCredential: bundle.refreshCredential,
    accessExpiresAt: bundle.accessExpiresAt,
  };
}

function dashboardToken(token: Record<string, unknown>, bundle: DashboardSessionBundle): Record<string, unknown> {
  return {
    ...token,
    sub: bundle.user.id,
    email: bundle.user.email,
    name: bundle.user.name,
    dashboardAccessCredential: bundle.accessCredential,
    dashboardRefreshCredential: bundle.refreshCredential,
    dashboardAccessExpiresAt: bundle.accessExpiresAt,
  };
}

function bundleFromUser(user: z.infer<typeof dashboardUserSchema>): DashboardSessionBundle {
  return {
    user: { id: user.id, email: user.email, name: user.name },
    accessCredential: user.accessCredential,
    refreshCredential: user.refreshCredential,
    accessExpiresAt: user.accessExpiresAt,
  };
}

function nextAuthFactory(moduleValue: unknown): NextAuthFactory {
  const factory = isRecord(moduleValue) ? moduleValue["default"] : null;
  if (!isUnknownFunction(factory)) {
    throw new TypeError("Auth.js NextAuth export is unavailable");
  }
  return (config) => authExports(Reflect.apply(factory, undefined, [config]));
}

function providerFactory(moduleValue: unknown): ProviderFactory {
  const factory = isRecord(moduleValue) ? moduleValue["default"] : null;
  if (!isUnknownFunction(factory)) {
    throw new TypeError("Auth.js credentials provider export is unavailable");
  }
  return (config) => Reflect.apply(factory, undefined, [config]);
}

function authExports(value: unknown): AuthExports {
  if (!isRecord(value) || !isRecord(value["handlers"])) {
    throw new TypeError("Auth.js handlers are unavailable");
  }
  const get = value["handlers"]["GET"];
  const post = value["handlers"]["POST"];
  const authValue = value["auth"];
  const signInValue = value["signIn"];
  const signOutValue = value["signOut"];
  if (!isUnknownFunction(get) || !isUnknownFunction(post) || !isUnknownFunction(authValue) || !isUnknownFunction(signInValue) || !isUnknownFunction(signOutValue)) {
    throw new TypeError("Auth.js exports are incomplete");
  }
  return {
    handlers: {
      GET: (request) => promiseResponse(Reflect.apply(get, undefined, [request])),
      POST: (request) => promiseResponse(Reflect.apply(post, undefined, [request])),
    },
    auth: () => promiseSession(Reflect.apply(authValue, undefined, [])),
    signIn: (provider, options) => promiseVoid(Reflect.apply(signInValue, undefined, [provider, options])),
    signOut: (options) => promiseVoid(Reflect.apply(signOutValue, undefined, [options])),
  };
}

async function promiseResponse(value: unknown): Promise<Response> {
  const response = await value;
  if (!(response instanceof Response)) {
    throw new TypeError("Auth.js route did not return a response");
  }
  return response;
}

async function promiseSession(value: unknown): Promise<AuthSession | null> {
  const session = await value;
  if (session === null || isRecord(session)) {
    return session;
  }
  return null;
}

async function promiseVoid(value: unknown): Promise<void> {
  await value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownFunction(value: unknown): value is UnknownFunction {
  return typeof value === "function";
}
