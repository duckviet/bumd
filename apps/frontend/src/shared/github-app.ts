import { createSign } from "node:crypto";

export function generateGithubAppJwt(appId: string, privateKeyPem: string): string {
  const cleanKey = privateKeyPem.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: now - 60,
    exp: now + 600,
    iss: appId,
  };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const tokenInput = `${headerB64}.${payloadB64}`;

  const signer = createSign("RSA-SHA256");
  signer.update(tokenInput);
  const signatureB64 = signer.sign(cleanKey, "base64url");

  return `${tokenInput}.${signatureB64}`;
}

export async function getInstallationAccessToken(
  appId: string,
  privateKeyPem: string,
  installationId: string
): Promise<string> {
  const jwt = generateGithubAppJwt(appId, privateKeyPem);
  const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "bumd-app",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to generate installation token: ${await response.text()}`);
  }
  const data = await response.json();
  return data.token;
}

export async function getInstallationDetails(
  appId: string,
  privateKeyPem: string,
  installationId: string
): Promise<{ accountName: string }> {
  const jwt = generateGithubAppJwt(appId, privateKeyPem);
  const response = await fetch(`https://api.github.com/app/installations/${installationId}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "bumd-app",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to get installation details: ${await response.text()}`);
  }
  const data = await response.json();
  return { accountName: data.account?.login || "github-account" };
}

export async function listInstallationRepositories(
  appId: string,
  privateKeyPem: string,
  installationId: string
): Promise<Array<{ id: number; name: string; full_name: string }>> {
  const token = await getInstallationAccessToken(appId, privateKeyPem, installationId);
  const repositories: Array<{ id: number; name: string; full_name: string }> = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const response = await fetch(`https://api.github.com/installation/repositories?per_page=${perPage}&page=${page}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "bumd-app",
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to list installation repositories: ${await response.text()}`);
    }
    const data = await response.json();
    const repos = data.repositories || [];
    repositories.push(...repos);
    if (repos.length < perPage) {
      break;
    }
    page++;
  }
  return repositories;
}

export async function listRepositoryBranches(
  appId: string,
  privateKeyPem: string,
  installationId: string,
  repoFullName: string
): Promise<Array<string>> {
  try {
    const token = await getInstallationAccessToken(appId, privateKeyPem, installationId);
    const response = await fetch(`https://api.github.com/repos/${repoFullName}/branches?per_page=100`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "bumd-app",
      },
    });
    if (!response.ok) {
      console.error(`Failed to list repo branches: ${await response.text()}`);
      return ["main", "master"];
    }
    const data = await response.json();
    if (Array.isArray(data)) {
      return data.map((b: any) => String(b.name));
    }
    return ["main", "master"];
  } catch (error) {
    console.error("Error listing repository branches:", error);
    return ["main", "master"];
  }
}

