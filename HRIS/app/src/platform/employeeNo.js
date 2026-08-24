// Employee numbers are prefix + zero-padded sequence (e.g. "EMP-0001") — both the prefix and
// the padding width are company-configurable (Settings > Org settings: employee_no_prefix,
// employee_no_padding), not hardcoded, so a fresh deployment isn't stuck with a previous
// customer's numbering scheme. The next number is derived from the current max in `person`
// rather than a separate counter row, so it can never drift out of sync with what's actually
// stored there.
const db = require('./db');

const DEFAULT_PREFIX = 'EMP';
const DEFAULT_PADDING = 4;

async function nextEmployeeNo() {
  const rows = await db.query(
    `SELECT setting_key, setting_value FROM app_setting WHERE setting_key IN ('employee_no_prefix', 'employee_no_padding')`
  );
  const map = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
  const prefix = (map.employee_no_prefix || DEFAULT_PREFIX).trim() || DEFAULT_PREFIX;
  const padding = Math.max(1, Math.min(10, parseInt(map.employee_no_padding, 10) || DEFAULT_PADDING));
  const separator = prefix.endsWith('-') ? '' : '-';
  const stem = `${prefix}${separator}`;

  const [row] = await db.query(
    `SELECT MAX(CAST(SUBSTRING(employee_no, ?) AS UNSIGNED)) AS maxNo FROM person WHERE employee_no LIKE ?`,
    [stem.length + 1, `${stem}%`]
  );
  const next = (row.maxNo || 0) + 1;
  return `${stem}${String(next).padStart(padding, '0')}`;
}

module.exports = { nextEmployeeNo, DEFAULT_PREFIX, DEFAULT_PADDING };
