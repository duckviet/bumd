import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { Pool } from "pg";
import { encryptSecret, decryptSecret } from "../webhooks/webhook-encryption.js";
import { TestWorkflowError } from "./test-workflow-errors.js";
import { TestWorkflowErrorCode, newEnvironmentId, newEnvironmentVariableId, type TestEnvironmentRecord, type TestEnvironmentVariableRecord } from "./test-workflow-types.js";
import { CreateTestEnvironmentDtoSchema } from "./dto/create-test-environment.dto.js";
import { UpdateTestEnvironmentDtoSchema } from "./dto/update-test-environment.dto.js";
import {
  parseEncryptedEnvironmentSnapshot,
  type EncryptedEnvironmentSnapshot,
} from "./test-workflow-snapshots.js";

function databaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

@Injectable()
export class TestEnvironmentsService implements OnModuleDestroy {
  private pool: Pool | null = null;
  private readonly logger = new Logger(TestEnvironmentsService.name);

  public async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  private db(): Pool {
    if (!this.pool) {
      this.pool = new Pool({ connectionString: databaseUrl() });
    }
    return this.pool;
  }

  // ─── List ────────────────────────────────────────────────────────────────────

  public async listEnvironments(input: {
    readonly organizationId: string;
    readonly docId: string;
    readonly branchId: string;
  }): Promise<TestEnvironmentDto[]> {
    const envResult = await this.db().query<TestEnvironmentRecord>(
      `SELECT id, "organizationId", "docId", "branchId", name, "isDefault", "createdAt", "updatedAt", "deletedAt"
       FROM "TestEnvironment"
       WHERE "organizationId" = $1 AND "docId" = $2 AND "branchId" = $3 AND "deletedAt" IS NULL
       ORDER BY "createdAt" ASC`,
      [input.organizationId, input.docId, input.branchId],
    );

    const envIds = envResult.rows.map((r) => r.id);
    if (envIds.length === 0) return [];

    const varResult = await this.db().query<TestEnvironmentVariableRecord>(
      `SELECT id, "environmentId", key, "encryptedValue", secret, "createdAt", "updatedAt"
       FROM "TestEnvironmentVariable"
       WHERE "environmentId" = ANY($1)
       ORDER BY "createdAt" ASC`,
      [envIds],
    );

    const varsByEnv = new Map<string, TestEnvironmentVariableRecord[]>();
    for (const v of varResult.rows) {
      const list = varsByEnv.get(v.environmentId) ?? [];
      list.push(v);
      varsByEnv.set(v.environmentId, list);
    }

    return envResult.rows.map((env) => mapEnvironmentDto(env, varsByEnv.get(env.id) ?? []));
  }

  // ─── Create ───────────────────────────────────────────────────────────────────

  public async createEnvironment(input: {
    readonly organizationId: string;
    readonly docId: string;
    readonly branchId: string;
    readonly body: unknown;
  }): Promise<TestEnvironmentDto> {
    const parsed = CreateTestEnvironmentDtoSchema.safeParse(input.body);
    if (!parsed.success) {
      throw new TestWorkflowError(TestWorkflowErrorCode.EnvNotFound, 400, "Invalid request body");
    }
    const dto = parsed.data;

    const client = await this.db().connect();
    try {
      await client.query("BEGIN");

      if (dto.isDefault === true) {
        await client.query(
          `UPDATE "TestEnvironment" SET "isDefault" = false, "updatedAt" = NOW()
           WHERE "docId" = $1 AND "branchId" = $2 AND "isDefault" = true AND "deletedAt" IS NULL`,
          [input.docId, input.branchId],
        );
      }

      const envId = newEnvironmentId();
      const envResult = await client.query<TestEnvironmentRecord>(
        `INSERT INTO "TestEnvironment"
           (id, "organizationId", "docId", "branchId", name, "isDefault", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         RETURNING *`,
        [envId, input.organizationId, input.docId, input.branchId, dto.name, dto.isDefault ?? false],
      );

      const vars: TestEnvironmentVariableRecord[] = [];
      for (const v of dto.variables ?? []) {
        const varId = newEnvironmentVariableId();
        const encrypted = encryptSecret(v.value);
        const varResult = await client.query<TestEnvironmentVariableRecord>(
          `INSERT INTO "TestEnvironmentVariable"
             (id, "environmentId", key, "encryptedValue", secret, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           RETURNING *`,
          [varId, envId, v.key, encrypted, v.secret ?? true],
        );
        vars.push(varResult.rows[0]!);
        this.auditLog("variable.created", { environmentId: envId, key: v.key });
      }

      await client.query("COMMIT");
      this.auditLog("environment.created", { environmentId: envId, name: dto.name });
      return mapEnvironmentDto(envResult.rows[0]!, vars);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // ─── Update ───────────────────────────────────────────────────────────────────

  public async updateEnvironment(input: {
    readonly organizationId: string;
    readonly docId: string;
    readonly branchId: string;
    readonly environmentId: string;
    readonly body: unknown;
  }): Promise<TestEnvironmentDto> {
    const parsed = UpdateTestEnvironmentDtoSchema.safeParse(input.body);
    if (!parsed.success) {
      throw new TestWorkflowError(TestWorkflowErrorCode.EnvNotFound, 400, "Invalid request body");
    }
    const dto = parsed.data;

    await this.requireEnvironment(input);

    const client = await this.db().connect();
    try {
      await client.query("BEGIN");

      if (dto.isDefault === true) {
        await client.query(
          `UPDATE "TestEnvironment" SET "isDefault" = false, "updatedAt" = NOW()
           WHERE "docId" = $1 AND "branchId" = $2 AND "isDefault" = true AND "deletedAt" IS NULL AND id != $3`,
          [input.docId, input.branchId, input.environmentId],
        );
      }

      const setClauses: string[] = [`"updatedAt" = NOW()`];
      const values: unknown[] = [input.environmentId];
      let pi = 2;

      if (dto.name !== undefined) {
        setClauses.push(`name = $${pi}`);
        values.push(dto.name);
        pi++;
      }
      if (dto.isDefault !== undefined) {
        setClauses.push(`"isDefault" = $${pi}`);
        values.push(dto.isDefault);
        pi++;
      }

      await client.query(
        `UPDATE "TestEnvironment" SET ${setClauses.join(", ")} WHERE id = $1`,
        values,
      );

      for (const v of dto.variables ?? []) {
        if (v.remove === true) {
          await client.query(
            `DELETE FROM "TestEnvironmentVariable" WHERE "environmentId" = $1 AND key = $2`,
            [input.environmentId, v.key],
          );
          this.auditLog("variable.removed", { environmentId: input.environmentId, key: v.key });
        } else {
          const existing = await client.query<{ id: string; encryptedValue: string | null; secret: boolean }>(
            `SELECT id, "encryptedValue", secret FROM "TestEnvironmentVariable"
             WHERE "environmentId" = $1 AND key = $2`,
            [input.environmentId, v.key],
          );

          if (existing.rows.length > 0) {
            const row = existing.rows[0]!;
            const newEncrypted = v.value !== undefined ? encryptSecret(v.value) : row.encryptedValue;
            const newSecret = v.secret !== undefined ? v.secret : row.secret;
            await client.query(
              `UPDATE "TestEnvironmentVariable"
               SET "encryptedValue" = $1, secret = $2, "updatedAt" = NOW()
               WHERE id = $3`,
              [newEncrypted, newSecret, row.id],
            );
            if (v.secret !== undefined) {
              this.auditLog("variable.secret_toggled", { environmentId: input.environmentId, key: v.key, secret: v.secret });
            }
          } else {
            const varId = newEnvironmentVariableId();
            const encrypted = v.value !== undefined ? encryptSecret(v.value) : null;
            await client.query(
              `INSERT INTO "TestEnvironmentVariable"
                 (id, "environmentId", key, "encryptedValue", secret, "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
              [varId, input.environmentId, v.key, encrypted, v.secret ?? true],
            );
            this.auditLog("variable.created", { environmentId: input.environmentId, key: v.key });
          }
        }
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return this.getEnvironmentById(input.organizationId, input.environmentId);
  }

  // ─── Delete ───────────────────────────────────────────────────────────────────

  public async deleteEnvironment(input: {
    readonly organizationId: string;
    readonly environmentId: string;
  }): Promise<void> {
    await this.requireEnvironment(input);
    await this.db().query(
      `UPDATE "TestEnvironment" SET "deletedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1`,
      [input.environmentId],
    );
    this.auditLog("environment.deleted", { environmentId: input.environmentId });
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────────

  public async requireEnvironment(input: {
    readonly organizationId: string;
    readonly environmentId: string;
  }): Promise<TestEnvironmentRecord> {
    const result = await this.db().query<TestEnvironmentRecord>(
      `SELECT id, "organizationId", "docId", "branchId", name, "isDefault", "createdAt", "updatedAt", "deletedAt"
       FROM "TestEnvironment"
       WHERE id = $1 AND "organizationId" = $2 AND "deletedAt" IS NULL
       LIMIT 1`,
      [input.environmentId, input.organizationId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new TestWorkflowError(TestWorkflowErrorCode.EnvNotFound, 404, "Environment not found or has been deleted");
    }
    return row;
  }

  public async resolveEnvVariables(environmentId: string): Promise<Record<string, string>> {
    const result = await this.db().query<TestEnvironmentVariableRecord>(
      `SELECT id, "environmentId", key, "encryptedValue", secret, "createdAt", "updatedAt"
       FROM "TestEnvironmentVariable"
       WHERE "environmentId" = $1`,
      [environmentId],
    );
    const resolved: Record<string, string> = {};
    for (const v of result.rows) {
      if (v.encryptedValue !== null) {
        const plaintext = decryptSecret(v.encryptedValue);
        if (plaintext !== null) {
          resolved[v.key] = plaintext;
        }
      }
    }
    return resolved;
  }

  public async loadEncryptedEnvironmentSnapshot(input: {
    readonly organizationId: string;
    readonly docId: string;
    readonly branchId: string;
    readonly environmentId: string;
  }): Promise<EncryptedEnvironmentSnapshot> {
    const environmentResult = await this.db().query<TestEnvironmentRecord>(
      `SELECT id, "organizationId", "docId", "branchId", name, "isDefault", "createdAt", "updatedAt", "deletedAt"
       FROM "TestEnvironment"
       WHERE id = $1 AND "organizationId" = $2 AND "docId" = $3 AND "branchId" = $4
         AND "deletedAt" IS NULL
       LIMIT 1`,
      [input.environmentId, input.organizationId, input.docId, input.branchId],
    );
    const environment = environmentResult.rows[0];
    if (environment === undefined) {
      throw new TestWorkflowError(TestWorkflowErrorCode.EnvNotFound, 404, "Environment not found or has been deleted");
    }
    const variablesResult = await this.db().query<TestEnvironmentVariableRecord>(
      `SELECT id, "environmentId", key, "encryptedValue", secret, "createdAt", "updatedAt"
       FROM "TestEnvironmentVariable"
       WHERE "environmentId" = $1
       ORDER BY "createdAt" ASC`,
      [environment.id],
    );
    return {
      id: environment.id,
      name: environment.name,
      variables: variablesResult.rows.map((variable) => ({
        id: variable.id,
        key: variable.key,
        encryptedValue: variable.encryptedValue,
        secret: variable.secret,
      })),
    };
  }

  public async loadRunEnvironmentContext(input: {
    readonly organizationId: string;
    readonly docId: string;
    readonly branchId: string;
    readonly environmentId: string;
    readonly environmentSnapshotJson: unknown | null;
  }): Promise<{ readonly values: Readonly<Record<string, string>>; readonly secretKeys: ReadonlySet<string> }> {
    const snapshot = input.environmentSnapshotJson === null
      ? await this.loadEncryptedEnvironmentSnapshot(input)
      : parseEncryptedEnvironmentSnapshot(input.environmentSnapshotJson);
    const values: Record<string, string> = {};
    const secretKeys = new Set<string>();
    for (const variable of snapshot.variables) {
      if (variable.secret) secretKeys.add(variable.key);
      if (variable.encryptedValue === null) continue;
      const plaintext = decryptSecret(variable.encryptedValue);
      if (plaintext !== null) values[variable.key] = plaintext;
    }
    return { values, secretKeys };
  }

  private async getEnvironmentById(organizationId: string, environmentId: string): Promise<TestEnvironmentDto> {
    const envResult = await this.db().query<TestEnvironmentRecord>(
      `SELECT id, "organizationId", "docId", "branchId", name, "isDefault", "createdAt", "updatedAt", "deletedAt"
       FROM "TestEnvironment" WHERE id = $1 AND "organizationId" = $2 LIMIT 1`,
      [environmentId, organizationId],
    );
    const varResult = await this.db().query<TestEnvironmentVariableRecord>(
      `SELECT id, "environmentId", key, "encryptedValue", secret, "createdAt", "updatedAt"
       FROM "TestEnvironmentVariable" WHERE "environmentId" = $1 ORDER BY "createdAt" ASC`,
      [environmentId],
    );
    return mapEnvironmentDto(envResult.rows[0]!, varResult.rows);
  }

  private auditLog(event: string, meta: Record<string, unknown>): void {
    // Metadata-only audit log — values are never logged
    this.logger.log({ event, ...meta });
  }
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export type TestEnvironmentVariableDto = {
  readonly id: string;
  readonly key: string;
  readonly secret: boolean;
  readonly hasValue: boolean;
};

export type TestEnvironmentDto = {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly variables: readonly TestEnvironmentVariableDto[];
};

function mapEnvironmentDto(
  env: TestEnvironmentRecord,
  vars: readonly TestEnvironmentVariableRecord[],
): TestEnvironmentDto {
  return {
    id: env.id,
    name: env.name,
    isDefault: env.isDefault,
    createdAt: env.createdAt.toISOString(),
    updatedAt: env.updatedAt.toISOString(),
    variables: vars.map((v) => ({
      id: v.id,
      key: v.key,
      secret: v.secret,
      hasValue: v.encryptedValue !== null,
    })),
  };
}
