import { argon2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";

const TokenPrefixLength = 16;
const SaltLength = 16;
const TagLength = 32;
const Memory = 19_456;
const Passes = 2;
const Parallelism = 2;

@Injectable()
export class ApiTokenCrypto {
  public generatePlaintext(): string {
    return `bumd_live_${randomBytes(32).toString("base64url")}`;
  }

  public prefix(plaintext: string): string {
    return plaintext.slice(0, TokenPrefixLength);
  }

  public async hash(plaintext: string): Promise<string> {
    return this.hashSync(plaintext);
  }

  public hashSync(plaintext: string): string {
    const salt = randomBytes(SaltLength);
    const tag = hashArgon2(plaintext, salt);
    return `$argon2id$v=19$m=${Memory},t=${Passes},p=${Parallelism}$${toPhcBase64(salt)}$${toPhcBase64(tag)}`;
  }

  public async verify(hash: string, plaintext: string): Promise<boolean> {
    return this.verifySync(hash, plaintext);
  }

  public verifySync(hash: string, plaintext: string): boolean {
    const parsed = parseHash(hash);
    if (parsed === null) {
      return false;
    }
    const actual = hashArgon2(plaintext, parsed.salt);
    return actual.length === parsed.tag.length && timingSafeEqual(actual, parsed.tag);
  }
}

function hashArgon2(plaintext: string, salt: Buffer): Buffer {
  return argon2Sync("argon2id", {
    message: plaintext,
    nonce: salt,
    parallelism: Parallelism,
    tagLength: TagLength,
    memory: Memory,
    passes: Passes,
  });
}

function parseHash(hash: string): { readonly salt: Buffer; readonly tag: Buffer } | null {
  const parts = hash.split("$");
  const [empty, algorithm, version, parameters, salt, tag, extra] = parts;
  if (
    empty !== "" ||
    algorithm !== "argon2id" ||
    version !== "v=19" ||
    parameters !== `m=${Memory},t=${Passes},p=${Parallelism}` ||
    salt === undefined ||
    tag === undefined ||
    extra !== undefined
  ) {
    return null;
  }
  return {
    salt: fromPhcBase64(salt),
    tag: fromPhcBase64(tag),
  };
}

function toPhcBase64(value: Buffer): string {
  return value.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromPhcBase64(value: string): Buffer {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  return Buffer.from(normalized, "base64");
}
