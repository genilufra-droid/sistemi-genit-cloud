import pg from 'pg';

const originalQuery = pg.Client.prototype.query;
if (!originalQuery.__sg75TransferNumberFix) {
  const patchedQuery = function phase75QueryHotfix(config, ...args) {
    const sql = typeof config === 'string' ? config : config?.text;
    const values = typeof config === 'string' ? args[0] : config?.values;

    if (/INSERT\s+INTO\s+inventory_sequences/i.test(String(sql || '')) && /RETURNING\s+last_value/i.test(String(sql || ''))) {
      const result = originalQuery.call(this, config, ...args);
      return Promise.resolve(result).then((response) => {
        const key = Array.isArray(values) ? values[2] : null;
        const lastValue = response?.rows?.[0]?.last_value;
        if (key && lastValue != null) this.__sg75LastInventorySequence = { key:String(key), lastValue:Number(lastValue) };
        return response;
      });
    }

    if (/INSERT\s+INTO\s+inventory_transfers/i.test(String(sql || '')) && /\$16/.test(String(sql || '')) && Array.isArray(values) && values.length === 15) {
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

    return originalQuery.call(this, config, ...args);
  };
  patchedQuery.__sg75TransferNumberFix = true;
  pg.Client.prototype.query = patchedQuery;
}

await import('./phase5-launcher.js');
