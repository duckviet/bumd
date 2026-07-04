import { createPublicKey, verify as verifySignature } from "node:crypto";
import type { JsonWebKey } from "node:crypto";
import type { GithubOidcClaims, GithubOidcVerifier } from "./github-oidc-types.js";

const GithubIssuer = "https://token.actions.githubusercontent.com";
const DefaultGithubJwksUrl = "https://token.actions.githubusercontent.com/.well-known/jwks";
const ClockSkewSeconds = 30;
const MaxIssuedAgeSeconds = 300;

type JwtHeader = {
  readonly alg: "RS256";
  readonly kid: string;
};

type JsonRecord = {
  readonly [key: string]: unknown;
};

let testingVerifier: GithubOidcVerifier | null = null;

export function setGithubOidcVerifierForTesting(verifier: GithubOidcVerifier | null): void {
  testingVerifier = verifier;
}

export function createGithubOidcVerifier(): GithubOidcVerifier {
  return testingVerifier ?? new GithubOidcJwtVerifier();
}

class GithubOidcJwtVerifier implements GithubOidcVerifier {
  public async verify(token: string): Promise<GithubOidcClaims> {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("invalid_oidc_token");
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    if (encodedHeader === undefined || encodedPayload === undefined || encodedSignature === undefined) {
      throw new Error("invalid_oidc_token");
    }

    const header = parseHeader(encodedHeader);
    const claims = parseClaims(encodedPayload);
    const jwk = await findSigningKey(header.kid);
    const publicKey = createPublicKey({ key: jwk, format: "jwk" });
    const signingInput = Buffer.from(`${encodedHeader}.${encodedPayload}`, "utf8");
    const signature = Buffer.from(encodedSignature, "base64url");
    const verified = verifySignature("RSA-SHA256", signingInput, publicKey, signature);
    if (!verified || claims.iss !== GithubIssuer || !temporalClaimsAreValid(claims, currentUnixSeconds())) {
      throw new Error("invalid_oidc_token");
    }
    return claims;
  }
}

async function findSigningKey(kid: string): Promise<JsonWebKey> {
  const response = await fetch(process.env["GITHUB_OIDC_JWKS_URL"] ?? DefaultGithubJwksUrl);
  if (!response.ok) {
    throw new Error("github_oidc_jwks_unavailable");
  }
  const body: unknown = await response.json();
  if (!isRecord(body) || !Array.isArray(body["keys"])) {
    throw new Error("github_oidc_jwks_unavailable");
  }
  const key = body["keys"].find((candidate: unknown) => isRecord(candidate) && candidate["kid"] === kid);
  if (!isRecord(key)) {
    throw new Error("invalid_oidc_token");
  }
  return key;
}

function parseHeader(encodedHeader: string): JwtHeader {
  const header = parseJsonPart(encodedHeader);
  if (header["alg"] !== "RS256" || typeof header["kid"] !== "string") {
    throw new Error("invalid_oidc_token");
  }
  return { alg: "RS256", kid: header["kid"] };
}

function parseClaims(encodedPayload: string): GithubOidcClaims {
  const payload = parseJsonPart(encodedPayload);
  const iss = stringField(payload, "iss");
  const aud = audienceField(payload);
  const sub = stringField(payload, "sub");
  const repository = stringField(payload, "repository");
  const exp = numberField(payload, "exp");
  const iat = numberField(payload, "iat");
  if (iss === null || aud === null || sub === null || repository === null || exp === null || iat === null) {
    throw new Error("invalid_oidc_token");
  }
  const repositoryOwner = stringField(payload, "repository_owner");
  const ref = stringField(payload, "ref");
  const nbf = numberField(payload, "nbf");
  return {
    iss,
    aud,
    sub,
    repository,
    exp,
    iat,
    ...(repositoryOwner === null ? {} : { repository_owner: repositoryOwner }),
    ...(ref === null ? {} : { ref }),
    ...(nbf === null ? {} : { nbf }),
  };
}

function parseJsonPart(encoded: string): JsonRecord {
  const parsed: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  if (!isRecord(parsed)) {
    throw new Error("invalid_oidc_token");
  }
  return parsed;
}

function audienceField(payload: JsonRecord): string | readonly string[] | null {
  const value = payload["aud"];
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }
  return null;
}

function stringField(payload: JsonRecord, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

function numberField(payload: JsonRecord, key: string): number | null {
  const value = payload[key];
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function temporalClaimsAreValid(claims: GithubOidcClaims, now: number): boolean {
  if (claims.exp <= now - ClockSkewSeconds) {
    return false;
  }
  if (claims.nbf !== undefined && claims.nbf > now + ClockSkewSeconds) {
    return false;
  }
  return claims.iat >= now - MaxIssuedAgeSeconds - ClockSkewSeconds && claims.iat <= now + ClockSkewSeconds;
}

function currentUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
