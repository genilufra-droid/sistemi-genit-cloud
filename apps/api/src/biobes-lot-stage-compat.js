export async function migrateBiobesLotStageCompatibility(pool) {
  await pool.query(`
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid='trace_lots'::regclass
          AND contype='u'
          AND pg_get_constraintdef(oid) ~ 'tenant_id.*company_id.*lot_number'
      LOOP
        EXECUTE format('ALTER TABLE trace_lots DROP CONSTRAINT %I',r.conname);
      END LOOP;
    END $$;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_trace_lots_biobes_stage
      ON trace_lots(tenant_id,company_id,lot_number,lot_type);
  `);
}
