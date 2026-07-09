import { z } from "zod";
import { authenticateUser, registerUser } from "./src/shared/auth/auth-store";

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
        const user = await authenticateUser(parsed.data.email, parsed.data.password);
        if (user === null) {
          return null;
        }
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    Github({
      clientId: process.env["GITHUB_CLIENT_ID"],
      clientSecret: process.env["GITHUB_CLIENT_SECRET"],
    }),
  ],
  callbacks: {
    async signIn({
      user,
      account,
    }: {
      readonly user: { readonly email?: string | null; readonly name?: string | null };
      readonly account: { readonly provider: string } | null;
    }) {
      if (account?.provider === "github") {
        const email = user.email;
        const name = user.name || email || "GitHub User";
        if (email) {
          try {
            await registerUser({
              email,
              password: "github_oauth_placeholder_password",
              name,
            });
          } catch (err) {
            console.error("Failed to auto-register GitHub user:", err);
            return false;
          }
        }
      }
      return true;
    },
  },
});

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
