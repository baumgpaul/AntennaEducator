import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';

describe('CoursesPage', () => {
  it('module file exists', () => {
    const filePath = resolve(__dirname, '../CoursesPage.tsx');
    expect(existsSync(filePath)).toBe(true);
  });

  it.todo('renders course library');
  it.todo('allows course enrollment');
  it.todo('displays enrolled courses');
});
