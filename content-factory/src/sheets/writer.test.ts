import { describe, it, expect } from 'vitest';
import { colLetter, formatFrequencyLimit, escapeFormulaCell } from './writer';

describe('colLetter', () => {
  it('A=1, B=2, ..., Z=26', () => {
    expect(colLetter(1)).toBe('A');
    expect(colLetter(2)).toBe('B');
    expect(colLetter(26)).toBe('Z');
  });

  it('AA=27, AB=28', () => {
    expect(colLetter(27)).toBe('AA');
    expect(colLetter(28)).toBe('AB');
  });

  it('AZ=52, BA=53', () => {
    expect(colLetter(52)).toBe('AZ');
    expect(colLetter(53)).toBe('BA');
  });
});

describe('formatFrequencyLimit', () => {
  it('число возвращает строку', () => {
    expect(formatFrequencyLimit(300)).toBe('300');
    expect(formatFrequencyLimit(500)).toBe('500');
  });

  it('объект min/max возвращает "min-max"', () => {
    expect(formatFrequencyLimit({ min: 300, max: 500 })).toBe('300-500');
  });
});

describe('escapeFormulaCell', () => {
  it('обычный текст не меняется', () => {
    expect(escapeFormulaCell('Розы')).toBe('Розы');
    expect(escapeFormulaCell('300')).toBe('300');
  });

  it('ведущие =, +, -, @ экранируются префиксом apostrophe', () => {
    expect(escapeFormulaCell('=CMD|...')).toBe("'=CMD|...");
    expect(escapeFormulaCell('+1')).toBe("'+1");
    expect(escapeFormulaCell('-2')).toBe("'-2");
    expect(escapeFormulaCell('@ref')).toBe("'@ref");
  });

  it('пробелы перед формулой не мешают экранированию', () => {
    expect(escapeFormulaCell('  =1+1')).toBe("'  =1+1");
  });
});
