import { randomUUID } from "node:crypto";

import { newDb, DataType } from "pg-mem";
import type { Knex } from "knex";
import { describe, expect, it } from "vitest";

const initialMigrationPath = "../../../migrations/20241126123000_initial_schema.js";

describe("database migrations", () => {
  it("applies and rolls back the initial schema", async () => {
    const knex = await createKnex();
    const migration = await import(initialMigrationPath);

    await migration.up(knex);
    const user = await insertUser(knex);
    expect(user.id).toBeDefined();

    await migration.down(knex);
    await expect(knex("users").select("id")).rejects.toThrow();
    await knex.destroy();
  });

  it("enforces foreign keys and unique constraints", async () => {
    const knex = await createKnex();
    const migration = await import(initialMigrationPath);
    await migration.up(knex);

    const user = await insertUser(knex);
    await knex("usage_limits").insert({ user_id: user.id, limit_key: "searches_per_day" });
    await expect(knex("usage_limits").insert({ user_id: user.id, limit_key: "searches_per_day" })).rejects.toThrow();
    await expect(
      knex("subscriptions").insert({ user_id: randomUUID(), plan_code: "week", plan_name: "Week", expires_at: new Date() }),
    ).rejects.toThrow();

    await knex.destroy();
  });

  it("creates supporting indices", async () => {
    const knex = await createKnex();
    const migration = await import(initialMigrationPath);
    await migration.up(knex);

    const { rows } = await knex.raw(
      `SELECT indexname
       FROM pg_indexes
       WHERE indexname IN ('idx_users_phone_number_telegram_id', 'idx_subscriptions_user_expires_at')`,
    );

    const indexNames = rows.map((row: { indexname: string }) => row.indexname);
    expect(indexNames).toEqual(expect.arrayContaining(["idx_users_phone_number_telegram_id", "idx_subscriptions_user_expires_at"]));

    await knex.destroy();
  });
});

async function createKnex(): Promise<Knex> {
  const db = newDb({ autoCreateForeignKeyIndices: true, noAstCoverageCheck: true });
  db.public.registerFunction({
    name: "gen_random_uuid",
    returns: DataType.uuid,
    implementation: () => randomUUID(),
  });
  db.registerExtension("pgcrypto", (schema) => schema);
  return db.adapters.createKnex();
}

async function insertUser(knex: Knex) {
  const [user] = await knex("users")
    .insert({ phone_number: "+79000000000", status: "active" })
    .returning(["id", "phone_number"]);
  return user;
}
