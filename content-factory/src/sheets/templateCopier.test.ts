import { describe, it, expect } from 'vitest';
import { assertTemplateSpreadsheetIdNotMain } from './templateCopier';

describe('assertTemplateSpreadsheetIdNotMain', () => {
  it('не бросает, если ID разные', () => {
    expect(() =>
      assertTemplateSpreadsheetIdNotMain('1tplAAAAAAAAAAAA', '1mainBBBBBBBBBBB')
    ).not.toThrow();
  });

  it('не бросает, если шаблон пустой', () => {
    expect(() => assertTemplateSpreadsheetIdNotMain('', '1mainBBBBBBBBBBB')).not.toThrow();
  });

  it('бросает, если шаблон совпадает с основной таблицей', () => {
    expect(() =>
      assertTemplateSpreadsheetIdNotMain('  1sameCCCCCCCC  ', '1sameCCCCCCCC')
    ).toThrow(/TEMPLATE_SPREADSHEET_ID совпадает с SPREADSHEET_ID/);
  });
});
