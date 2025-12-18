import { describe, it, expect } from 'vitest';

// Status transition rules (replicated from app/actions/incidents.ts)
const VALID_TRANSITIONS: Record<string, string[]> = {
  OPEN: ["MITIGATED", "RESOLVED"],
  MITIGATED: ["RESOLVED"],
  RESOLVED: [], // Cannot transition from resolved
};

function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) || false;
}

describe('Incident Status Transitions', () => {
  describe('isValidTransition', () => {
    // Valid transitions
    it('should allow OPEN -> MITIGATED', () => {
      expect(isValidTransition('OPEN', 'MITIGATED')).toBe(true);
    });

    it('should allow OPEN -> RESOLVED', () => {
      expect(isValidTransition('OPEN', 'RESOLVED')).toBe(true);
    });

    it('should allow MITIGATED -> RESOLVED', () => {
      expect(isValidTransition('MITIGATED', 'RESOLVED')).toBe(true);
    });

    // Invalid transitions
    it('should NOT allow RESOLVED -> OPEN (reopening)', () => {
      expect(isValidTransition('RESOLVED', 'OPEN')).toBe(false);
    });

    it('should NOT allow RESOLVED -> MITIGATED', () => {
      expect(isValidTransition('RESOLVED', 'MITIGATED')).toBe(false);
    });

    it('should NOT allow MITIGATED -> OPEN (regression)', () => {
      expect(isValidTransition('MITIGATED', 'OPEN')).toBe(false);
    });

    it('should NOT allow same status transition', () => {
      expect(isValidTransition('OPEN', 'OPEN')).toBe(false);
      expect(isValidTransition('MITIGATED', 'MITIGATED')).toBe(false);
      expect(isValidTransition('RESOLVED', 'RESOLVED')).toBe(false);
    });

    // Edge cases
    it('should handle unknown statuses gracefully', () => {
      expect(isValidTransition('UNKNOWN', 'OPEN')).toBe(false);
      expect(isValidTransition('OPEN', 'UNKNOWN')).toBe(false);
    });
  });

  describe('VALID_TRANSITIONS mapping', () => {
    it('should have OPEN with 2 valid transitions', () => {
      expect(VALID_TRANSITIONS['OPEN']).toHaveLength(2);
      expect(VALID_TRANSITIONS['OPEN']).toContain('MITIGATED');
      expect(VALID_TRANSITIONS['OPEN']).toContain('RESOLVED');
    });

    it('should have MITIGATED with 1 valid transition', () => {
      expect(VALID_TRANSITIONS['MITIGATED']).toHaveLength(1);
      expect(VALID_TRANSITIONS['MITIGATED']).toContain('RESOLVED');
    });

    it('should have RESOLVED with no valid transitions (terminal state)', () => {
      expect(VALID_TRANSITIONS['RESOLVED']).toHaveLength(0);
    });
  });
});
