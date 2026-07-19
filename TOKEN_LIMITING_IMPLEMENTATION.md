# Token Limiting Implementation

## Overview
Implemented a comprehensive token limiting system to prevent users from exceeding their monthly OpenAI API token allocation. The system tracks token usage per user, enforces limits, and automatically resets monthly counters.

## Changes Made

### 1. Database Schema Changes (`prisma/schema.prisma`)
Added three new fields to the `User` model:
- `tokensUsedThisMonth` (Int, default: 0) - Tracks current month's token usage
- `tokenLimitPerMonth` (Int, default: 300000) - Monthly token limit (300k tokens)
- `tokenResetDate` (DateTime, default: now()) - Date when counter resets

**Migration:** `20260203111403_add_token_tracking`

### 2. Token Usage Service (`src/user/token-usage.service.ts`)
Created a new service to manage token tracking:

**Key Methods:**
- `checkTokenLimit(userId, estimatedTokens)` - Validates user has sufficient tokens before API calls
  - Throws `ForbiddenException` if limit exceeded
  - Auto-resets counter if reset date has passed
  - Provides detailed error message with remaining tokens and days until reset

- `trackTokenUsage(userId, tokensUsed)` - Records actual token usage after API calls
  - Uses OpenAI's response.usage.total_tokens for accurate tracking
  - Handles auto-reset if needed

- `getTokenUsage(userId)` - Returns comprehensive token usage stats
  - Tokens used/remaining
  - Usage percentage
  - Reset date and days until reset

- `updateTokenLimit(userId, newLimit)` - Admin function to adjust user limits

**Features:**
- Automatic monthly reset on the 1st of each month
- Graceful error handling (tracking failures don't break main flow)
- Detailed logging for monitoring

### 3. NLP Transformation Service Updates (`src/reflection/services/nlp-transformation.service.ts`)
Modified to integrate token tracking:

**Changes:**
- Added `userId` parameter to `transformBelief()` method
- Injected `TokenUsageService` dependency
- Pre-flight token limit check before OpenAI API calls
- Post-call token usage tracking with actual usage from OpenAI response
- Token estimation function (~4 chars per token + buffer)

**Flow:**
1. Estimate tokens needed (system prompt + user text + max response)
2. Check user's token limit
3. Make OpenAI API call
4. Track actual tokens used from response

### 4. Reflection Service Updates (`src/reflection/reflection.service.ts`)
Updated to handle token limits:

**Changes:**
- Pass `user.id` to `transformBelief()` calls
- Added `ForbiddenException` import
- Special error handling for token limit exceeded errors
- Immediately return error to user (no retry) when limit exceeded

### 5. User Controller (`src/user/user.controller.ts`)
Added new endpoint to check token usage:

**New Endpoint:**
```
GET /user/token-usage
```

**Response:**
```json
{
  "message": "Token usage retrieved",
  "data": {
    "tokensUsedThisMonth": 15000,
    "tokenLimitPerMonth": 50000,
    "tokensRemaining": 35000,
    "usagePercentage": 30.0,
    "resetDate": "2026-03-01T00:00:00.000Z",
    "daysUntilReset": 25
  }
}
```

### 6. User Service (`src/user/user.service.ts`)
Enhanced user profile response:

**Changes:**
- Added `tokenUsage` object to user profile response
- Includes all token statistics when fetching user profile
- Provides client apps with usage info without extra API calls

### 7. Module Updates
**User Module (`src/user/user.module.ts`):**
- Added `TokenUsageService` to providers
- Exported `TokenUsageService` for use in other modules

**Reflection Module (`src/reflection/reflection.module.ts`):**
- Imported `UserModule` to access `TokenUsageService`

## How It Works

### Normal Flow
1. User submits belief text for affirmation generation
2. System estimates tokens needed (~6500 tokens avg with OMNI-CBT)
3. Checks user's remaining token balance
4. If sufficient, makes OpenAI API call
5. Tracks actual tokens used from OpenAI response
6. Increments user's monthly counter

### Token Limit Exceeded
When a user exceeds their limit:
1. Pre-flight check fails
2. Throws `ForbiddenException` with detailed message
3. Error propagated to client with HTTP 403
4. Error message includes:
   - Remaining tokens
   - Tokens needed
   - Days until reset

**Example Error:**
```
Monthly token limit exceeded. You have 500 tokens remaining out of 300000. 
This operation requires approximately 6500 tokens. 
Your limit will reset in 15 day(s).
```

### Automatic Reset
- Happens on the 1st of each month at 00:00:00
- Triggered automatically on next API call after reset date
- Sets `tokensUsedThisMonth` to 0
- Sets `tokenResetDate` to 1st of next month
- No manual intervention required

## Benefits

✅ **Cost Control:** Prevents runaway API costs from individual users
✅ **Fair Usage:** Ensures equitable access across all users
✅ **Transparency:** Users can check their usage anytime via API
✅ **Flexibility:** Per-user limits can be adjusted by admins
✅ **Automatic:** Monthly resets happen without manual intervention
✅ **Accurate:** Uses actual token counts from OpenAI, not estimates
✅ **User-Friendly:** Clear error messages guide users when limit reached

## Drawbacks

⚠️ **User Experience Impact:** Users hitting limits mid-month may have degraded experience
⚠️ **Additional Complexity:** More code to maintain and monitor
⚠️ **Database Load:** Extra writes on every API call (token tracking)
⚠️ **Edge Cases:** Pre-flight estimates may be inaccurate for edge cases
⚠️ **No Grace Period:** Hard cutoff when limit reached (no soft warnings at 80%, 90%)
⚠️ **Single Limit:** Same limit for all users (no tiered plans)

## Potential Improvements

1. **Usage Alerts:** Notify users at 80%, 90% of monthly limit
2. **Tiered Plans:** Different limits based on subscription tier
3. **Grace Period:** Allow small buffer (e.g., 105% of limit) for edge cases
4. **Usage Dashboard:** Visual charts of token consumption over time
5. **Rollover:** Allow unused tokens to carry over (up to a cap)
6. **Buy More Tokens:** Option to purchase additional tokens mid-month
7. **Caching:** Cache common transformations to reduce API calls
8. **Batch Processing:** Optimize multiple requests to use fewer tokens

## Configuration

Default limit: **300,000 tokens/month** (~45 NLP affirmation generations with OMNI-CBT)

To adjust for specific user:
```typescript
await tokenUsageService.updateTokenLimit(userId, newLimit);
```

To change default for all new users, update:
```prisma
tokenLimitPerMonth  Int  @default(300000)
```

## Monitoring

Key metrics to track:
- % of users hitting monthly limits
- Average tokens used per user
- Peak usage times
- Token usage by feature/operation

## Testing Recommendations

1. Test limit exceeded scenario
2. Test automatic monthly reset
3. Test token tracking accuracy
4. Test concurrent requests near limit
5. Load test with high token usage
6. Verify error messages are clear

## API Documentation

All endpoints are documented with Swagger:
- GET `/user/token-usage` - View token usage stats
- GET `/user/one` - User profile now includes `tokenUsage` object

## Rollback Plan

If issues arise:
1. Set all users' `tokenLimitPerMonth` to very high value (e.g., 1,000,000)
2. Remove token checking temporarily by commenting out `checkTokenLimit` call
3. Investigate and fix issues
4. Re-enable limits gradually

## Support

For users experiencing token limit issues:
1. Check their usage via GET `/user/token-usage`
2. Review their reflection session count
3. Increase limit if justified: `updateTokenLimit(userId, newLimit)`
4. Advise when their limit resets
