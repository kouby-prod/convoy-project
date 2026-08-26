import { describe, expect, it } from 'vitest';
import { resolveBuyerIdentity } from '../../src/modules/payment/invoice';

describe('resolveBuyerIdentity', () => {
  it('uses booking first and last name when present', () => {
    expect(
      resolveBuyerIdentity(
        { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
        { name: 'Alex Passager', email: 'passenger@kouby.local' },
      ),
    ).toEqual({ buyerName: 'Ada Lovelace', buyerEmail: 'ada@example.com' });
  });

  it('falls back to the account name when booking names are empty', () => {
    expect(
      resolveBuyerIdentity(
        { firstName: null, lastName: null, email: null },
        { name: 'Alex Passager', email: 'passenger@kouby.local' },
      ),
    ).toEqual({ buyerName: 'Alex Passager', buyerEmail: 'passenger@kouby.local' });
  });

  it('uses Passenger only when nothing else is available', () => {
    expect(resolveBuyerIdentity({ firstName: null, lastName: null, email: null }, null)).toEqual({
      buyerName: 'Passenger',
      buyerEmail: '',
    });
  });
});
