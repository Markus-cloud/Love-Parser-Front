exports.up = async function (knex) {
  const jsonbObject = () => knex.raw("'{}'::jsonb");
  const jsonbArray = () => knex.raw("'[]'::jsonb");

  await knex.schema.alterTable('broadcast_campaigns', (table) => {
    table.string('target_type', 32).notNullable().defaultTo('manual');
    table.jsonb('manual_recipients').notNullable().defaultTo(jsonbArray());
    table.jsonb('message').notNullable().defaultTo(jsonbObject());
    table.jsonb('delay_config').notNullable().defaultTo(jsonbObject());
    table.integer('total_recipients').notNullable().defaultTo(0);
    table.integer('sent_count').notNullable().defaultTo(0);
    table.integer('failed_count').notNullable().defaultTo(0);
    table.integer('blocked_count').notNullable().defaultTo(0);
    table.string('job_id', 128);
    table.timestamp('started_at', { useTz: true });
    table.timestamp('completed_at', { useTz: true });
    table.text('last_error');
  });

  await knex.schema.alterTable('broadcast_logs', (table) => {
    table.string('recipient_username', 255);
    table.string('recipient_id', 128);
    table.string('error_code', 64);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('broadcast_logs', (table) => {
    table.dropColumn('error_code');
    table.dropColumn('recipient_id');
    table.dropColumn('recipient_username');
  });

  await knex.schema.alterTable('broadcast_campaigns', (table) => {
    table.dropColumn('last_error');
    table.dropColumn('completed_at');
    table.dropColumn('started_at');
    table.dropColumn('job_id');
    table.dropColumn('blocked_count');
    table.dropColumn('failed_count');
    table.dropColumn('sent_count');
    table.dropColumn('total_recipients');
    table.dropColumn('delay_config');
    table.dropColumn('message');
    table.dropColumn('manual_recipients');
    table.dropColumn('target_type');
  });
};
