import { describe, expect, it } from 'vitest';
import {
  makePostDatedCheque,
  applyChequeAction,
  depositCheque,
  clearCheque,
  bounceCheque,
  representCheque,
  cancelCheque,
  daysToMaturity,
  isMaturingSoon,
  summariseCheques,
  type PostDatedCheque,
  type NewPostDatedCheque,
} from './post-dated-cheque';

const base = {
  tenantId: 't1',
  chequeNumber: '000123',
  direction: 'received' as const,
  partyName: 'Al Habtoor Trading',
  bankName: 'Emirates NBD',
  amount: 50000,
  issueDate: '2026-06-01',
  maturityDate: '2026-07-01',
};

describe('Post-Dated Cheque', () => {
  describe('makePostDatedCheque', () => {
    it('creates a pending cheque with defaults', () => {
      const c = makePostDatedCheque(base);
      expect(c.status).toBe('pending');
      expect(c.bounceCount).toBe(0);
      expect(c.currency).toBe('AED');
      expect(c.direction).toBe('received');
      expect(c.reference).toBeNull();
    });

    it('rejects a bad direction, amount, and date order', () => {
      expect(() => makePostDatedCheque({ ...base, direction: 'x' as never })).toThrow(/direction/);
      expect(() => makePostDatedCheque({ ...base, amount: 0 })).toThrow(/amount/);
      expect(() => makePostDatedCheque({ ...base, maturityDate: '2026-05-01' })).toThrow(/maturityDate cannot be before/);
      expect(() => makePostDatedCheque({ ...base, issueDate: '01-06-2026' })).toThrow(/issueDate must be YYYY-MM-DD/);
    });

    it('requires cheque number, party, and bank', () => {
      expect(() => makePostDatedCheque({ ...base, chequeNumber: ' ' })).toThrow(/chequeNumber/);
      expect(() => makePostDatedCheque({ ...base, partyName: '' })).toThrow(/partyName/);
      expect(() => makePostDatedCheque({ ...base, bankName: '' })).toThrow(/bankName/);
    });
  });

  describe('lifecycle transitions', () => {
    const fresh = (): PostDatedCheque => makePostDatedCheque(base);

    it('pending → deposited → cleared', () => {
      const c = clearCheque(depositCheque(fresh()));
      expect(c.status).toBe('cleared');
    });

    it('deposited → bounced → re-presented (bounce counted) → cleared', () => {
      let c = bounceCheque(depositCheque(fresh()));
      expect(c.status).toBe('bounced');
      c = representCheque(c);
      expect(c.status).toBe('deposited');
      expect(c.bounceCount).toBe(1);
      c = clearCheque(c);
      expect(c.status).toBe('cleared');
    });

    it('pending → cancelled (stop payment) and bounced → cancelled (write off)', () => {
      expect(cancelCheque(fresh()).status).toBe('cancelled');
      const bounced = bounceCheque(depositCheque(fresh()));
      expect(cancelCheque(bounced).status).toBe('cancelled');
    });

    it('guards invalid transitions', () => {
      expect(() => clearCheque(fresh())).toThrow(/only a deposited cheque can clear/);
      expect(() => bounceCheque(fresh())).toThrow(/only a deposited cheque can bounce/);
      expect(() => representCheque(fresh())).toThrow(/only a bounced cheque/);
      expect(() => depositCheque(clearCheque(depositCheque(fresh())))).toThrow(/cannot deposit/);
      expect(() => cancelCheque(clearCheque(depositCheque(fresh())))).toThrow(/cannot cancel/);
    });

    it('applyChequeAction dispatches by name', () => {
      expect(applyChequeAction(fresh(), 'deposit').status).toBe('deposited');
      expect(() => applyChequeAction(fresh(), 'bogus' as never)).toThrow(/unknown action/);
    });
  });

  describe('maturity watch-list', () => {
    it('daysToMaturity counts forward and goes negative when overdue', () => {
      const c = makePostDatedCheque(base);
      expect(daysToMaturity(c, '2026-06-24')).toBe(7);
      expect(daysToMaturity(c, '2026-07-08')).toBe(-7);
    });

    it('flags pending cheques due within the window (incl. overdue)', () => {
      const c = makePostDatedCheque(base);
      expect(isMaturingSoon(c, '2026-06-24', 7)).toBe(true); // exactly 7 days out
      expect(isMaturingSoon(c, '2026-06-20', 7)).toBe(false); // 11 days out
      expect(isMaturingSoon(c, '2026-07-10', 7)).toBe(true); // overdue → still surfaced
    });

    it('only pending cheques are in the watch-list', () => {
      const deposited = depositCheque(makePostDatedCheque(base));
      expect(isMaturingSoon(deposited, '2026-06-24', 7)).toBe(false);
    });
  });

  describe('summariseCheques', () => {
    it('splits open receivable vs payable exposure and counts watch-list + bounced', () => {
      const recv = makePostDatedCheque({ ...base, chequeNumber: 'R1', amount: 50000 }); // pending received
      const issued = makePostDatedCheque({ ...base, chequeNumber: 'I1', direction: 'issued', partyName: 'Supplier', amount: 30000 }); // pending issued
      const dep = depositCheque(makePostDatedCheque({ ...base, chequeNumber: 'R2', amount: 20000 })); // open received
      const bounced = bounceCheque(depositCheque(makePostDatedCheque({ ...base, chequeNumber: 'R3', amount: 9999 })));
      const sum = summariseCheques([recv, issued, dep, bounced], '2026-06-28', 7);
      expect(sum.receivablePending).toBe(70000); // recv 50000 + dep 20000 (both open received)
      expect(sum.payablePending).toBe(30000);
      expect(sum.bounced).toBe(1);
      // recv & issued are pending maturing 2026-07-01 (3 days out) → in window; dep/bounced not pending
      expect(sum.maturingSoon).toBe(2);
    });
  });
});

// ── Regressions found in the wave-2 finance audit ─────────────────────────────
describe('PDC — rules that were wrong', () => {
  const pdc = (over: Partial<NewPostDatedCheque> = {}) =>
    makePostDatedCheque({
      tenantId: 't', chequeNumber: '000123', direction: 'received', partyName: 'Emaar',
      bankName: 'ENBD', amount: 50_000, issueDate: '2026-01-01', maturityDate: '2026-03-01', ...over,
    });

  it('counts a bounce when the bank returns it, not when it is re-presented', () => {
    // The counter used to increment on re-presentation, so a cheque that bounced once and was
    // written off reported ZERO bounces. In the UAE that history drives credit decisions.
    const bounced = bounceCheque(depositCheque(pdc()));
    expect(bounced.bounceCount).toBe(1);
    expect(cancelCheque(bounced).bounceCount).toBe(1); // written off, the bounce still counted
  });

  it('counts each bounce of a re-presented cheque', () => {
    let c = bounceCheque(depositCheque(pdc()));
    c = representCheque(c);
    expect(c.bounceCount).toBe(1); // re-presenting is not itself a bounce
    c = bounceCheque(c);
    expect(c.bounceCount).toBe(2);
  });

  it('a cheque that clears first time never counts a bounce', () => {
    expect(clearCheque(depositCheque(pdc())).bounceCount).toBe(0);
  });

  it('does not add different currencies into one headline number', () => {
    // AED 100,000 + USD 10,000 used to be reported as "110,000" — a figure in no currency.
    const list = [pdc({ amount: 100_000, currency: 'AED' }), pdc({ chequeNumber: '2', amount: 10_000, currency: 'USD' })];
    const s = summariseCheques(list, '2026-01-15');
    expect(s.receivablePending).toBe(100_000); // base currency only
    expect(s.byCurrency.AED.receivablePending).toBe(100_000);
    expect(s.byCurrency.USD.receivablePending).toBe(10_000);
  });

  it('honours a different base currency', () => {
    const list = [pdc({ amount: 100_000, currency: 'AED' }), pdc({ chequeNumber: '2', amount: 10_000, currency: 'USD' })];
    expect(summariseCheques(list, '2026-01-15', 7, 'USD').receivablePending).toBe(10_000);
  });

  it('keeps issued and received apart per currency', () => {
    const list = [
      pdc({ amount: 30_000, direction: 'received' }),
      pdc({ chequeNumber: '3', amount: 12_000, direction: 'issued' }),
    ];
    const s = summariseCheques(list, '2026-01-15');
    expect(s.receivablePending).toBe(30_000);
    expect(s.payablePending).toBe(12_000);
    expect(s.byCurrency.AED).toEqual({ receivablePending: 30_000, payablePending: 12_000 });
  });
});
