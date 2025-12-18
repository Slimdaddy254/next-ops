import { describe, it, expect } from 'vitest';
import { stableHash, evaluateFeatureFlag, validateRule } from '@/lib/feature-flags';

describe('Feature Flags', () => {
  describe('stableHash', () => {
    it('should return consistent hash for same userId and flagKey', () => {
      const hash1 = stableHash('user-123', 'feature-1');
      const hash2 = stableHash('user-123', 'feature-1');
      expect(hash1).toBe(hash2);
    });

    it('should return different hash for different userId', () => {
      const hash1 = stableHash('user-123', 'feature-1');
      const hash2 = stableHash('user-456', 'feature-1');
      expect(hash1).not.toBe(hash2);
    });

    it('should return different hash for different flagKey', () => {
      const hash1 = stableHash('user-123', 'feature-1');
      const hash2 = stableHash('user-123', 'feature-2');
      expect(hash1).not.toBe(hash2);
    });

    it('should return a number between 0 and 99', () => {
      for (let i = 0; i < 100; i++) {
        const hash = stableHash(`user-${i}`, 'test-flag');
        expect(hash).toBeGreaterThanOrEqual(0);
        expect(hash).toBeLessThan(100);
      }
    });
  });

  describe('evaluateFeatureFlag', () => {
    it('should return disabled when flag is globally disabled', () => {
      const flag = {
        key: 'test-flag',
        enabled: false,
        environment: 'PROD',
        rules: [],
      };
      const context = { userId: 'user-123', environment: 'PROD' };
      
      const result = evaluateFeatureFlag(flag, context);
      
      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('Flag is globally disabled');
    });

    it('should return disabled when environment does not match', () => {
      const flag = {
        key: 'test-flag',
        enabled: true,
        environment: 'PROD',
        rules: [],
      };
      const context = { userId: 'user-123', environment: 'STAGING' };
      
      const result = evaluateFeatureFlag(flag, context);
      
      expect(result.enabled).toBe(false);
      expect(result.reason).toContain('Environment mismatch');
    });

    it('should return enabled when no rules and flag is enabled', () => {
      const flag = {
        key: 'test-flag',
        enabled: true,
        environment: 'PROD',
        rules: [],
      };
      const context = { userId: 'user-123', environment: 'PROD' };
      
      const result = evaluateFeatureFlag(flag, context);
      
      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('No rules defined, enabled for all');
    });

    it('should enable for user in allowlist', () => {
      const flag = {
        key: 'test-flag',
        enabled: true,
        environment: 'PROD',
        rules: [
          { condition: { type: 'ALLOWLIST', userIds: ['user-123', 'user-456'] } }
        ],
      };
      const context = { userId: 'user-123', environment: 'PROD' };
      
      const result = evaluateFeatureFlag(flag, context);
      
      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('Matched rule 1');
    });

    it('should disable for user not in allowlist', () => {
      const flag = {
        key: 'test-flag',
        enabled: true,
        environment: 'PROD',
        rules: [
          { condition: { type: 'ALLOWLIST', userIds: ['user-456', 'user-789'] } }
        ],
      };
      const context = { userId: 'user-123', environment: 'PROD' };
      
      const result = evaluateFeatureFlag(flag, context);
      
      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('No rules matched');
    });

    it('should handle percent rollout consistently', () => {
      const flag = {
        key: 'test-flag',
        enabled: true,
        environment: 'PROD',
        rules: [
          { condition: { type: 'PERCENT_ROLLOUT', percentage: 50 } }
        ],
      };
      const context = { userId: 'user-123', environment: 'PROD' };
      
      // Same user should always get same result
      const result1 = evaluateFeatureFlag(flag, context);
      const result2 = evaluateFeatureFlag(flag, context);
      
      expect(result1.enabled).toBe(result2.enabled);
    });

    it('should handle AND rules correctly', () => {
      const flag = {
        key: 'test-flag',
        enabled: true,
        environment: 'PROD',
        rules: [
          { 
            condition: { 
              type: 'AND', 
              rules: [
                { type: 'ALLOWLIST', userIds: ['user-123'] },
                { type: 'PERCENT_ROLLOUT', percentage: 100 }
              ]
            } 
          }
        ],
      };
      const context = { userId: 'user-123', environment: 'PROD' };
      
      const result = evaluateFeatureFlag(flag, context);
      
      expect(result.enabled).toBe(true);
    });

    it('should handle OR rules correctly', () => {
      const flag = {
        key: 'test-flag',
        enabled: true,
        environment: 'PROD',
        rules: [
          { 
            condition: { 
              type: 'OR', 
              rules: [
                { type: 'ALLOWLIST', userIds: ['user-456'] },
                { type: 'ALLOWLIST', userIds: ['user-123'] }
              ]
            } 
          }
        ],
      };
      const context = { userId: 'user-123', environment: 'PROD' };
      
      const result = evaluateFeatureFlag(flag, context);
      
      expect(result.enabled).toBe(true);
    });
  });

  describe('validateRule', () => {
    it('should validate ALLOWLIST rule', () => {
      const rule = { type: 'ALLOWLIST', userIds: ['user-1', 'user-2'] };
      const result = validateRule(rule);
      expect(result.valid).toBe(true);
    });

    it('should validate PERCENT_ROLLOUT rule', () => {
      const rule = { type: 'PERCENT_ROLLOUT', percentage: 50 };
      const result = validateRule(rule);
      expect(result.valid).toBe(true);
    });

    it('should reject PERCENT_ROLLOUT with percentage over 100', () => {
      const rule = { type: 'PERCENT_ROLLOUT', percentage: 150 };
      const result = validateRule(rule);
      expect(result.valid).toBe(false);
    });

    it('should reject invalid rule type', () => {
      const rule = { type: 'INVALID', data: 'test' };
      const result = validateRule(rule);
      expect(result.valid).toBe(false);
    });

    it('should validate nested AND rule', () => {
      const rule = {
        type: 'AND',
        rules: [
          { type: 'ALLOWLIST', userIds: ['user-1'] },
          { type: 'PERCENT_ROLLOUT', percentage: 50 }
        ]
      };
      const result = validateRule(rule);
      expect(result.valid).toBe(true);
    });
  });
});
