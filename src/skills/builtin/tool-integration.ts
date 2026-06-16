import type { BuiltinSkill } from './mod.ts';

export const toolIntegrationSkill: BuiltinSkill = {
  name: 'tool-integration',
  description:
    'Building tools, integrating external systems, and designing tool interfaces. Use when creating new capabilities, connecting APIs, or extending agent functionality.',
  tags: ['tools', 'integration', 'api', 'capabilities'],
  difficulty: 'intermediate',
  examples: [
    'Creating a custom tool for a specific task',
    'Integrating with external APIs',
    'Designing tool parameters for clarity',
    'Handling tool errors gracefully',
    'Testing tool reliability'
  ],
  prerequisites: ['TypeScript knowledge', 'System architecture understanding'],
  content: `# Tool Integration & Building

Tools are how agents interact with the world. Build them well, and agents become powerful. Build them poorly, and agents fail silently.

## What Makes a Good Tool

### 1. Clear Purpose

A good tool does one thing well:

\`\`\`
✓ Good: "fetch_user_by_id" - fetch a specific user
✓ Good: "create_database_index" - optimize database performance
✗ Bad: "do_database_stuff" - too vague
✗ Bad: "handle_everything" - too broad
\`\`\`

### 2. Predictable Interface

Input and output are well-defined:

\`\`\`typescript
interface FetchUserInput {
  userId: string;  // Required, format: UUID
  includeProfile?: boolean;  // Optional
}

interface FetchUserOutput {
  success: boolean;
  user?: User;
  error?: string;
}
\`\`\`

Agents can understand and use the tool reliably.

### 3. Defensive Design

Assume inputs are wrong, APIs fail, networks are slow:

\`\`\`typescript
async function fetchUser(input: FetchUserInput): Promise<FetchUserOutput> {
  // Validate inputs
  if (!input.userId || !isValidUUID(input.userId)) {
    return { success: false, error: 'Invalid userId format' };
  }

  try {
    // Call with timeout
    const user = await fetchWithTimeout(
      \`/api/users/\${input.userId}\`,
      5000 // 5 second timeout
    );
    
    return { success: true, user };
  } catch (e) {
    // Return useful error info
    const errorMsg = e.code === 'ENOTFOUND' 
      ? 'API unreachable (network error)'
      : e.message;
    return { success: false, error: errorMsg };
  }
}
\`\`\`

## Tool Design Patterns

### Pattern 1: Fetch & Transform

Get raw data, clean it up:

\`\`\`typescript
async function getProductRecommendations(userId: string) {
  // 1. Fetch raw data from API
  const response = await fetch(\`/api/recommendations?user=\${userId}\`);
  const raw = await response.json();

  // 2. Validate response shape
  if (!Array.isArray(raw.items)) {
    throw new Error('Invalid API response');
  }

  // 3. Transform to useful format
  return raw.items.map(item => ({
    id: item.id,
    name: item.title,
    price: parseFloat(item.cost),
    rating: item.stars ?? 0
  }));
}
\`\`\`

### Pattern 2: Validation & Safeguards

Prevent misuse before it happens:

\`\`\`typescript
async function deleteUser(userId: string, confirmToken: string) {
  // 1. Validate input
  if (!userId) throw new Error('userId required');
  if (!confirmToken) throw new Error('confirmToken required');

  // 2. Verify authorization
  const isAuthorized = await checkAuthorization(userId, confirmToken);
  if (!isAuthorized) {
    throw new Error('Not authorized to delete this user');
  }

  // 3. Additional safeguards
  if (isSystemUser(userId)) {
    throw new Error('Cannot delete system users');
  }

  // 4. Backup before delete
  await backupUser(userId);

  // 5. Delete
  return await deleteUserFromDatabase(userId);
}
\`\`\`

### Pattern 3: Pagination & Limits

Don't return millions of results:

\`\`\`typescript
async function searchDocuments(query: string, limit: number = 10) {
  // 1. Validate inputs
  if (!query || query.length < 2) {
    throw new Error('Query too short');
  }
  
  // 2. Enforce reasonable limits
  const safeLimitLimit = Math.min(limit, 100); // Cap at 100
  
  // 3. Fetch with pagination
  const results = await database.search(query, { limit: safeLimit });
  
  // 4. Return info about pagination
  return {
    results,
    total: results.length,
    hasMore: results.length === safeLimit,
    query
  };
}
\`\`\`

### Pattern 4: Retry Logic

External systems sometimes fail temporarily:

\`\`\`typescript
async function callExternalAPI(url: string, retries: number = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, { timeout: 5000 });
    } catch (e) {
      if (i === retries - 1) throw e; // Last attempt
      
      // Exponential backoff: 100ms, 200ms, 400ms
      const delay = Math.pow(2, i) * 100;
      await sleep(delay);
    }
  }
}
\`\`\`

## Integration Patterns

### Pattern 1: Request/Response Wrapping

Normalize different API styles:

\`\`\`typescript
// Different APIs have different response formats

// API A: { data: { user: {...} } }
// API B: { user: {...} }
// API C: { result: {...}, meta: {...} }

// Wrap them all:
interface APIResponse<T> {
  data: T;
  error?: string;
}

async function callAPI<T>(endpoint: string): Promise<APIResponse<T>> {
  try {
    const raw = await fetch(endpoint);
    // Transform to standard format
    return { data: extractData(raw) };
  } catch (e) {
    return { data: null, error: e.message };
  }
}
\`\`\`

### Pattern 2: Gradual Fallback

Try preferred option, fall back gracefully:

\`\`\`typescript
async function getWeatherData(location: string) {
  // Try primary API
  try {
    return await primaryWeatherAPI.get(location);
  } catch (e1) {
    logger.warn('Primary API failed, trying backup');
  }

  // Try backup API
  try {
    return await backupWeatherAPI.get(location);
  } catch (e2) {
    logger.warn('Both APIs failed, returning cached data');
  }

  // Return last known good data
  return getLastKnownWeather(location);
}
\`\`\`

### Pattern 3: Batch Operations

Group individual operations for efficiency:

\`\`\`typescript
async function getUsersList(userIds: string[]) {
  // Bad: N API calls
  // const users = await Promise.all(
  //   userIds.map(id => fetchUser(id))
  // );

  // Good: 1 batch API call
  const response = await fetch('/api/users/batch', {
    method: 'POST',
    body: JSON.stringify({ userIds })
  });

  return response.json();
}
\`\`\`

## Testing Tools

### Test Coverage

Before integrating a tool, test:

\`\`\`
1. Happy path: Normal inputs, everything works
2. Boundary cases: Empty, null, maximum values
3. Error cases: API fails, timeouts, invalid responses
4. Permission cases: Authorized, unauthorized, mixed
5. Performance: Is it fast enough? Does it scale?
6. Side effects: Does it modify data correctly?
\`\`\`

### Test Pattern

\`\`\`typescript
async function testFetchUser() {
  // Happy path
  const validUser = await fetchUser('123e4567-e89b-12d3-a456-426614174000');
  assert(validUser.success, 'Should fetch valid user');
  assert(validUser.user.id, 'Should have user data');

  // Invalid input
  const badUser = await fetchUser('not-a-uuid');
  assert(!badUser.success, 'Should reject invalid UUID');
  assert(badUser.error, 'Should provide error message');

  // Non-existent
  const missing = await fetchUser('00000000-0000-0000-0000-000000000000');
  assert(!missing.success, 'Should handle missing user');

  // API failure (mock)
  mockAPI.fail = true;
  const offline = await fetchUser('123e4567-e89b-12d3-a456-426614174000');
  assert(!offline.success, 'Should handle API failure');
  assert(offline.error.includes('unreachable'), 'Should explain failure');
  mockAPI.fail = false;
}
\`\`\`

## Tool Documentation

Document tools for agent and human use:

\`\`\`typescript
/**
 * Fetch a user by ID
 *
 * @param userId - The user ID (UUID format)
 * @param includeProfile - Include detailed profile (default: false)
 *
 * @returns Success/failure with user data or error
 *
 * @example
 * const result = await fetchUser('123e4567-e89b-12d3-a456-426614174000');
 * if (result.success) {
 *   console.log(result.user.name);
 * } else {
 *   console.error(result.error);
 * }
 *
 * @throws Nothing; all errors returned in response
 */
export async function fetchUser(
  userId: string,
  includeProfile: boolean = false
): Promise<FetchUserOutput>
\`\`\`

## Tool Performance

### Monitor These

\`\`\`
- Latency (time from call to response)
- Success rate (% of calls that succeed)
- Error types (what fails most often)
- Usage frequency (which tools do agents use?)
\`\`\`

### Optimize

If a tool is slow:

\`\`\`
1. Profile: Where is time spent?
   - Network? (API call slow)
   - Processing? (transformation expensive)
   - Database? (query inefficient)

2. Optimize the bottleneck
   - Network: Cache, batch, reduce payload
   - Processing: Optimize algorithm, parallelize
   - Database: Add indexes, optimize query

3. Measure impact
   - Did it get faster?
   - Did anything get slower?
   - Is it worth the complexity?
\`\`\`

## Tool Integration Checklist

When integrating a new tool:

- [ ] Is the purpose clear? (one thing, well-defined)
- [ ] Are inputs well-documented? (types, formats, requirements)
- [ ] Are outputs well-documented? (success case, error case)
- [ ] Does it validate inputs?
- [ ] Does it handle errors gracefully?
- [ ] Does it have a timeout?
- [ ] Is it idempotent? (safe to call multiple times)
- [ ] Is it tested? (happy path, errors, edge cases)
- [ ] Is performance acceptable? (< 5s for most tools)
- [ ] Are there safeguards? (permissions, rate limits)
- [ ] Is it documented? (purpose, examples, warnings)
- [ ] Does agent understand how to use it?

## Key Insight

**Good tools are like good APIs: clear contract, defensive implementation, comprehensive testing.** Agents rely on tools to interact with the world. Build tools that are reliable, and your agents will be powerful.`,
};
