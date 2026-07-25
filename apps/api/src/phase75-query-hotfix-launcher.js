import pg from 'pg';

const originalQuery = pg.Client.prototype.query;
if (!originalQuery.__sg75TransferNumberFix) {
  const patchedQuery = function phase75QueryHotfix(config, ...args) {
    const sql = typeof config === 'string' ? config : config?.text;
    const values = typeof config === 'string' ? args[0] : config?.values;
    const sqlText = String(sql || '');

    if (/INSERT\s+INTO\s+inventory_sequences/i.test(sqlText) && /RETURNING\s+last_value/i.test(sqlText)) {
      const result = originalQuery.call(this, config, ...args);
      return Promise.resolve(result).then((response) => {
        const key = Array.isArray(values) ? values[2] : null;
        const lastValue = response?.rows?.[0]?.last_value;
        if (key && lastValue != null) this.__sg75LastInventorySequence = { key:String(key), lastValue:Number(lastValue) };
        return response;
      });
    }

    if (/INSERT\s+INTO\s+inventory_transfers/i.test(sqlText) && /\$16/.test(sqlText) && Array.isArray(values) && values.length === 15) {
      const sequence = this.__sg75LastInventorySequence;
      if (!sequence?.key || !Number.isFinite(sequence.lastValue)) {
        const error = new Error('Numri automatik i dokumentit Inventory nuk u gjenerua.');
        error.code = 'SG75_SEQUENCE_MISSING';
        return Promise.reject(error);
      }
      const transferNo = `${sequence.key}-${String(sequence.lastValue).padStart(6,'0')}`;
      const correctedValues = values.slice();
      correctedValues.splice(6, 0, transferNo);
      if (typeof config === 'string') return originalQuery.call(this, config, correctedValues, ...args.slice(1));
      return originalQuery.call(this, { ...config, values:correctedValues }, ...args);
    }

    if (/UPDATE\s+trace_lots\s+SET\s+quantity_available\s*=\s*GREATEST\s*\(\s*quantity_available\s*\+\s*\$1/i.test(sqlText)
      && /quantity_consumed\s*=\s*CASE\s+WHEN\s+\$1\s*<\s*0/i.test(sqlText)
      && !/quantity_created\s*=\s*CASE\s+WHEN\s+\$1\s*>\s*0/i.test(sqlText)) {
      const correctedSql = sqlText.replace(
        /UPDATE\s+trace_lots\s+SET\s+/i,
        'UPDATE trace_lots SET quantity_created=CASE WHEN $1>0 THEN quantity_created+$1 ELSE quantity_created END,',
      );
      if (typeof config === 'string') return originalQuery.call(this, correctedSql, ...args);
      return originalQuery.call(this, { ...config, text:correctedSql }, ...args);
    }

    if (/json_build_object\s*\(\s*'id'\s*,\s*l\.id\s*,\s*'productId'\s*,\s*l\.product_id/i.test(sqlText)
      && !/'product_id'\s*,\s*l\.product_id/i.test(sqlText)) {
      const correctedSql = sqlText
        .replace(/'productId'\s*,\s*l\.product_id/i, "'productId',l.product_id,'product_id',l.product_id")
        .replace(/'lotId'\s*,\s*l\.lot_id/i, "'lotId',l.lot_id,'lot_id',l.lot_id")
        .replace(/'unitCost'\s*,\s*l\.unit_cost/i, "'unitCost',l.unit_cost,'unit_cost',l.unit_cost");
      if (typeof config === 'string') return originalQuery.call(this, correctedSql, ...args);
      return originalQuery.call(this, { ...config, text:correctedSql }, ...args);
    }

    return originalQuery.call(this, config, ...args);
  };
  patchedQuery.__sg75TransferNumberFix = true;
  pg.Client.prototype.query = patchedQuery;
}

await import('./phase5-launcher.js');
