import { describe, expect, it } from 'vitest';
import {
  assertTransition,
  canTransition,
  IllegalTransitionError,
  isWriteLocked,
} from '@/src/domain/organize/stateMachine';

describe('stateMachine', () => {
  it('主流程迁移合法', () => {
    expect(() => assertTransition('idle', 'scanning')).not.toThrow();
    expect(() => assertTransition('scanning', 'planning')).not.toThrow();
    expect(() => assertTransition('planning', 'classifying')).not.toThrow();
    expect(() => assertTransition('classifying', 'reviewing')).not.toThrow();
    expect(() => assertTransition('reviewing', 'applying')).not.toThrow();
    expect(() => assertTransition('applying', 'completed')).not.toThrow();
    expect(() => assertTransition('completed', 'undoing')).not.toThrow();
    expect(() => assertTransition('undoing', 'undone')).not.toThrow();
  });

  it('失败后可重试应用或重新扫描', () => {
    expect(canTransition('failed', 'applying')).toBe(true);
    expect(canTransition('failed', 'scanning')).toBe(true);
  });

  it('非法迁移抛出 IllegalTransitionError', () => {
    expect(() => assertTransition('idle', 'applying')).toThrow(IllegalTransitionError);
    expect(() => assertTransition('completed', 'applying')).toThrow(IllegalTransitionError);
    expect(() => assertTransition('undone', 'undoing')).toThrow(IllegalTransitionError);
  });

  it('applying / undoing 期间为写入锁定', () => {
    expect(isWriteLocked('applying')).toBe(true);
    expect(isWriteLocked('undoing')).toBe(true);
    expect(isWriteLocked('completed')).toBe(false);
  });
});
