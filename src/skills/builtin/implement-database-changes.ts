import type { BuiltinSkill } from './mod.ts';

export const implementDatabaseChangesSkill: BuiltinSkill = {
  name: 'implement-database-changes',
  description: 'Safely modify database schema and data. Use when adding tables, columns, or data migrations.',
  tags: ['development', 'database', 'migrations', 'data'],
  difficulty: 'advanced',
  examples: [
    'Add new column to users table',
    'Create index for performance',
    'Migrate data from old to new schema'
  ],
  prerequisites: ['SQL basics', 'Database safety practices'],
  content: `# Implement Database Changes

Database changes are risky. Use this pattern to stay safe.

## Pre-change Checklist

- [ ] Backup created?
- [ ] Tested on development?
- [ ] Tested on staging (production-size data)?
- [ ] Rollback plan documented?
- [ ] Lock/unlock strategy clear?
- [ ] Performance impact analyzed?

## The Safe Pattern

1. **Write migration**
   - Use IF NOT EXISTS (idempotent)
   - One change per migration
   - Version number in filename

2. **Test locally**
   - Run against dev database
   - Verify schema correct
   - Check rollback works

3. **Test on staging**
   - Use production-size data
   - Measure duration
   - Verify no errors
   - Test rollback

4. **Deploy carefully**
   - Off-peak time
   - Have rollback ready
   - Monitor for errors
   - Check logs after

5. **Verify after**
   - Schema correct?
   - Data intact?
   - Performance normal?

## Common Mistakes

✗ Directly run SQL in production
✗ Skip backup
✗ No rollback plan
✗ Don't test on staging
✗ Change schema and data same migration`,
};
