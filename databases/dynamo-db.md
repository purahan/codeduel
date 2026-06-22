# CodeDuel — DynamoDB Single-Table Design
# Table name: CodeDuelTable
# Region: eu-north-1
# Capacity: On-demand
#
# GSI:
#   GSI1 — PK: GSI1PK (String), SK: GSI1SK (Number)
#   Projection: ALL
#
# TTL attribute: ttl (Number, Unix timestamp in seconds)
# TTL is set on match and queue items only — they auto-delete after expiry.
#
# ============================================================
# RULE: One table, all entities. PK + SK together are always unique.
# ============================================================


# ============================================================
# ENTITY 1 — User Profile
# Written: on first GitHub login
# Read:    on profile page, at match start (to get ELO)
# Updated: never directly — ELO lives on the leaderboard item
# ============================================================

{
  "PK":         "USER#<github_user_id>",     # e.g. "USER#70795912"
  "SK":         "PROFILE",
  "userId":     "70795912",                  # GitHub user ID (string)
  "username":   "purahan",                   # GitHub username
  "email":      "user@example.com",          # may be null
  "avatar":     "https://avatars.github...", # GitHub avatar URL
  "elo":        1200,                        # current ELO rating (Number)
  "wins":       0,                           # total wins (Number)
  "losses":     0,                           # total losses (Number)
  "createdAt":  1718000000000               # Unix ms timestamp (Number)
}

# Access pattern:
#   Get profile    → GetItem(PK="USER#<id>", SK="PROFILE")
#   Update stats   → UpdateItem (wins/losses after match ends)


# ============================================================
# ENTITY 2 — Leaderboard Entry
# Written: on first login (ELO=1200), updated after every match
# Read:    leaderboard page — query GSI1 sorted by ELO descending
# GSI:     GSI1PK = "LEADERBOARD#GLOBAL", GSI1SK = elo (Number)
#          DynamoDB sorts Numbers natively → highest ELO first
# ============================================================

{
  "PK":          "USER#<github_user_id>",
  "SK":          "LEADERBOARD",
  "GSI1PK":      "LEADERBOARD#GLOBAL",       # constant — all users share this partition
  "GSI1SK":      1342,                        # ELO as Number — sort key for ranking
  "userId":      "70795912",
  "username":    "purahan",
  "avatar":      "https://avatars.github...",
  "wins":        10,
  "losses":      3
}

# Access pattern:
#   Top 50 global  → Query GSI1(GSI1PK="LEADERBOARD#GLOBAL", ScanIndexForward=false, Limit=50)
#   Update ELO     → PutItem (replace entire item with new ELO) inside TransactWrite


# ============================================================
# ENTITY 3 — Matchmaking Queue Entry
# Written: when user clicks "Find Match"
# Read:    by /api/match/find polling every 2s
# Deleted: when match is found (or player cancels)
# TTL:     now + 300s (5 min) — auto-removes stale queue entries
# ============================================================

{
  "PK":         "QUEUE#<github_user_id>",
  "SK":         "WAITING",
  "userId":     "70795912",
  "username":   "purahan",
  "elo":        1342,                        # snapshot ELO at queue time
  "queuedAt":   1718000000000,              # Unix ms — for wait time display
  "ttl":        1718000300                  # Unix SECONDS — DynamoDB TTL field
}

# Access pattern:
#   Join queue     → PutItem
#   Find opponent  → Scan with FilterExpression (small table, ok for hackathon)
#   Leave queue    → DeleteItem(PK="QUEUE#<id>", SK="WAITING")
#
# Note: Scan is normally bad practice but the queue is tiny
# (only currently waiting users). Fine for this scale.


# ============================================================
# ENTITY 4 — Match Session (META)
# Written: when two players are matched
# Read:    by both players polling /api/match/[id] every 2s
# Updated: when a player submits, when match ends
# TTL:     now + 3600s (1 hr) — auto-cleans finished matches
# ============================================================

{
  "PK":           "MATCH#<uuid>",            # e.g. "MATCH#f47ac10b-58cc..."
  "SK":           "META",
  "matchId":      "f47ac10b-58cc-...",
  "problemId":    "two-sum",                 # slug from Aurora problems table
  "status":       "active",                  # "waiting" | "active" | "finished"
  "startedAt":    1718000000000,            # Unix ms
  "finishedAt":   null,                      # set when match ends
  "winnerId":     null,                      # set when match ends
  "endedBy":      null,                      # "submission" | "timeout" | "forfeit"

  "player1": {
    "userId":     "70795912",
    "username":   "purahan",
    "elo":        1342,
    "hintsUsed":  0,                         # 0-3, enforced server-side
    "submitted":  false,
    "passed":     false
  },

  "player2": {
    "userId":     "12345678",
    "username":   "ghost_coder",
    "elo":        1289,
    "hintsUsed":  1,
    "submitted":  true,
    "passed":     false
  },

  "ttl":          1718003600                 # Unix SECONDS
}

# Access patterns:
#   Get match state  → GetItem(PK="MATCH#<id>", SK="META")
#   Submit answer    → UpdateItem (set player1.submitted=true, player1.passed=true/false)
#   End match        → UpdateItem (set status="finished", winnerId, finishedAt, endedBy)
#   Increment hint   → UpdateItem ADD player1.hintsUsed 1


# ============================================================
# ENTITY 5 — Player Submission Detail
# Written: every time a player submits code (pass or fail)
# Read:    post-match results screen to show code diff
# One item per submission — a player can submit multiple times
# ============================================================

{
  "PK":           "MATCH#<uuid>",
  "SK":           "SUB#<userId>#<timestamp>", # e.g. "SUB#70795912#1718000123456"
  "matchId":      "f47ac10b-58cc-...",
  "userId":       "70795912",
  "language":     "python",                  # "python"|"javascript"|"cpp"|"java"
  "code":         "def twoSum(nums, target):\n  seen = {}...",
  "status":       "accepted",               # mirrors Judge0 verdict
  "testsPassed":  3,
  "testsTotal":   3,
  "runtimeMs":    45,
  "submittedAt":  1718000123456,
  "ttl":          1718003600                 # same TTL as match
}

# Access pattern:
#   All submissions in match → Query(PK="MATCH#<id>", SK begins_with "SUB#")
#   Player's submissions     → Query(PK="MATCH#<id>", SK begins_with "SUB#<userId>")


# ============================================================
# ENTITY 6 — Hint Usage Log
# Written: every time a hint is requested
# Read:    to check count before allowing another hint (server-side)
# Max 3 per player per match — enforced via hintsUsed on META item
# This entity is optional — the count on META is sufficient.
# Keep this only if you want to log what hint was given.
# ============================================================

{
  "PK":         "MATCH#<uuid>",
  "SK":         "HINT#<userId>#<hintNumber>", # e.g. "HINT#70795912#1"
  "userId":     "70795912",
  "hintNumber": 1,                            # 1, 2, or 3
  "hintText":   "Think about what data structure gives O(1) lookups.",
  "requestedAt": 1718000060000,
  "ttl":        1718003600
}

# Access pattern:
#   All hints given → Query(PK="MATCH#<id>", SK begins_with "HINT#<userId>")


# ============================================================
# SUMMARY — All PK/SK patterns in the table
# ============================================================

# PK pattern              | SK pattern              | Entity
# ----------------------- | ----------------------- | ----------------------------
# USER#<id>               | PROFILE                 | User profile
# USER#<id>               | LEADERBOARD             | Leaderboard entry (GSI1)
# QUEUE#<id>              | WAITING                 | Matchmaking queue entry
# MATCH#<uuid>            | META                    | Match session state
# MATCH#<uuid>            | SUB#<userId>#<ts>       | Code submission
# MATCH#<uuid>            | HINT#<userId>#<n>       | Hint log (optional)


# ============================================================
# SUMMARY — GSI1 access patterns
# ============================================================

# GSI1PK                  | GSI1SK  | What it retrieves
# ----------------------- | ------- | ----------------------------------
# LEADERBOARD#GLOBAL       | elo     | All users sorted by ELO (top-N)


# ============================================================
# WHAT IS NOT IN DYNAMODB
# ============================================================
# - Problem statements, test cases, starter code  → Aurora (problems table)
# - Permanent submission history                  → Aurora (submissions table)
# - Match result history / ELO timeline           → Aurora (match_results table)
# - User identity (email, GitHub ID)              → Aurora (users table)
#
# Rule of thumb:
#   Real-time, high-frequency, session-scoped     → DynamoDB
#   Permanent, relational, analytics-friendly     → Aurora
