type Validator = (body: Record<string, unknown>) => string | null;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidFutureDate(value: unknown, fieldName: string): string | null {
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    return `\`${fieldName}\` must be a valid date in YYYY-MM-DD format`;
  }
  const date = new Date(value + 'T00:00:00Z');
  if (isNaN(date.getTime())) {
    return `\`${fieldName}\` is not a valid date`;
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (date < today) {
    return `\`${fieldName}\` cannot be in the past`;
  }
  return null;
}

function requireFields(body: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    if (!body[field] && body[field] !== 0) {
      return `Missing required field: \`${field}\``;
    }
  }
  return null;
}

export const validateFlights: Validator = (body) => {
  const missing = requireFields(body, ['departure_id', 'arrival_id', 'outbound_date']);
  if (missing) return missing;

  const outboundErr = isValidFutureDate(body.outbound_date, 'outbound_date');
  if (outboundErr) return outboundErr;

  if (body.return_date) {
    const returnErr = isValidFutureDate(body.return_date, 'return_date');
    if (returnErr) return returnErr;

    const outbound = new Date(String(body.outbound_date));
    const returnDate = new Date(String(body.return_date));
    if (returnDate <= outbound) {
      return '`return_date` must be after `outbound_date`';
    }
  }
  return null;
};

export const validateDateField = (fieldName: string): Validator => (body) => {
  if (body[fieldName]) {
    return isValidFutureDate(body[fieldName], fieldName);
  }
  return null;
};

export const validateRequired = (...fields: string[]): Validator => (body) => {
  return requireFields(body, fields);
};

export function composeValidators(...validators: Validator[]): Validator {
  return (body) => {
    for (const v of validators) {
      const error = v(body);
      if (error) return error;
    }
    return null;
  };
}
