-- =============================================================================
-- CodeDuel — Aurora PostgreSQL Schema
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Drop views and tables 
-- =============================================================================

DROP VIEW  IF EXISTS problem_stats      CASCADE;
DROP VIEW  IF EXISTS user_match_history CASCADE;
DROP TABLE IF EXISTS hint_usage         CASCADE;
DROP TABLE IF EXISTS submissions        CASCADE;
DROP TABLE IF EXISTS match_results      CASCADE;
DROP TABLE IF EXISTS problems           CASCADE;
DROP TABLE IF EXISTS users              CASCADE;

-- =============================================================================
-- TABLE: users
-- =============================================================================

CREATE TABLE users (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    github_id        BIGINT       NOT NULL UNIQUE,
    github_username  VARCHAR(39)  NOT NULL UNIQUE,
    email            VARCHAR(255) UNIQUE,
    avatar_url       TEXT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_login_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_github_id
    ON users (github_id);

CREATE UNIQUE INDEX idx_users_github_username
    ON users (github_username);

-- =============================================================================
-- TABLE: problems
-- =============================================================================

CREATE TABLE problems (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    slug             VARCHAR(100) NOT NULL UNIQUE,
    title            TEXT         NOT NULL,
    description      TEXT         NOT NULL,
    difficulty       VARCHAR(6)   NOT NULL
                         CHECK (difficulty IN ('easy', 'medium', 'hard')),
    tags             TEXT[]       NOT NULL DEFAULT '{}',
    test_cases       JSONB        NOT NULL DEFAULT '[]',
    -- [{"input": "...", "expected_output": "...", "is_hidden": bool}]
    starter_code     JSONB        NOT NULL DEFAULT '{}',
    -- {"python": "...", "javascript": "...", "cpp": "...", "java": "..."}
    solution_hints   TEXT,
    time_limit_ms    INTEGER      NOT NULL DEFAULT 2000,
    memory_limit_kb  INTEGER      NOT NULL DEFAULT 131072,
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_problems_slug
    ON problems (slug);

CREATE INDEX idx_problems_tags_gin
    ON problems USING GIN (tags);

CREATE INDEX idx_problems_difficulty
    ON problems (difficulty)
    WHERE is_active = TRUE;

-- =============================================================================
-- TABLE: submissions
-- =============================================================================

CREATE TABLE submissions (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id          TEXT        NOT NULL,
    user_id           UUID        NOT NULL REFERENCES users(id)    ON DELETE RESTRICT,
    problem_id        UUID        NOT NULL REFERENCES problems(id) ON DELETE RESTRICT,
    language          VARCHAR(10) NOT NULL
                          CHECK (language IN ('python', 'javascript', 'cpp', 'java')),
    code              TEXT        NOT NULL,
    status            VARCHAR(20) NOT NULL
                          CHECK (status IN (
                              'accepted',
                              'wrong_answer',
                              'time_limit',
                              'memory_limit',
                              'runtime_error',
                              'compilation_error'
                          )),
    test_cases_passed INTEGER     NOT NULL DEFAULT 0,
    test_cases_total  INTEGER     NOT NULL DEFAULT 0,
    runtime_ms        INTEGER,
    memory_kb         INTEGER,
    complexity_class  VARCHAR(20),
    judge0_token      TEXT,
    submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_submissions_user_id
    ON submissions (user_id, submitted_at DESC);

CREATE INDEX idx_submissions_match_id
    ON submissions (match_id, submitted_at DESC);

CREATE INDEX idx_submissions_user_problem
    ON submissions (user_id, problem_id, submitted_at DESC);

-- =============================================================================
-- TABLE: match_results
-- =============================================================================

CREATE TABLE match_results (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id             TEXT        NOT NULL UNIQUE,
    problem_id           UUID        NOT NULL REFERENCES problems(id) ON DELETE RESTRICT,
    winner_id            UUID        REFERENCES users(id) ON DELETE SET NULL,
    loser_id             UUID        REFERENCES users(id) ON DELETE SET NULL,
    winner_elo_before    INTEGER,
    winner_elo_after     INTEGER,
    loser_elo_before     INTEGER,
    loser_elo_after      INTEGER,
    duration_seconds     INTEGER     NOT NULL,
    ended_by             VARCHAR(10) NOT NULL
                             CHECK (ended_by IN ('submission', 'timeout', 'forfeit')),
    was_tiebreaker       BOOLEAN     NOT NULL DEFAULT FALSE,
    tiebreaker_narration TEXT,
    played_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_match_results_winner_id
    ON match_results (winner_id, played_at DESC);

CREATE INDEX idx_match_results_loser_id
    ON match_results (loser_id, played_at DESC);

CREATE UNIQUE INDEX idx_match_results_match_id
    ON match_results (match_id);

-- =============================================================================
-- TABLE: hint_usage
-- =============================================================================

CREATE TABLE hint_usage (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id     TEXT        NOT NULL,
    user_id      UUID        NOT NULL REFERENCES users(id)    ON DELETE RESTRICT,
    problem_id   UUID        NOT NULL REFERENCES problems(id) ON DELETE RESTRICT,
    tier         SMALLINT    NOT NULL CHECK (tier IN (1, 2, 3)),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hint_usage_match_user
    ON hint_usage (match_id, user_id);

CREATE INDEX idx_hint_usage_problem
    ON hint_usage (problem_id);

-- =============================================================================
-- VIEW: user_match_history
-- =============================================================================

CREATE OR REPLACE VIEW user_match_history AS
SELECT
    mr.id               AS result_id,
    mr.match_id,
    mr.played_at,
    mr.ended_by,
    mr.duration_seconds,
    mr.was_tiebreaker,
    p.id                AS problem_id,
    p.slug              AS problem_slug,
    p.title             AS problem_title,
    p.difficulty        AS problem_difficulty,
    mr.winner_id,
    mr.loser_id,
    mr.winner_elo_before,
    mr.winner_elo_after,
    mr.loser_elo_before,
    mr.loser_elo_after
FROM match_results mr
JOIN problems p ON mr.problem_id = p.id;

-- =============================================================================
-- VIEW: problem_stats
-- =============================================================================

CREATE OR REPLACE VIEW problem_stats AS
SELECT
    p.id,
    p.slug,
    p.title,
    p.difficulty,
    p.tags,
    p.is_active,
    COUNT(s.id)                                             AS total_submissions,
    COUNT(s.id) FILTER (WHERE s.status = 'accepted')       AS accepted_submissions,
    ROUND(
        COUNT(s.id) FILTER (WHERE s.status = 'accepted')::NUMERIC
        / NULLIF(COUNT(s.id), 0) * 100, 1
    )                                                       AS acceptance_rate_pct,
    AVG(s.runtime_ms) FILTER (WHERE s.status = 'accepted') AS avg_runtime_ms
FROM problems p
LEFT JOIN submissions s ON s.problem_id = p.id
GROUP BY p.id, p.slug, p.title, p.difficulty, p.tags, p.is_active;

-- =============================================================================
-- SEED: problems (15)
-- =============================================================================

INSERT INTO problems (slug, title, description, difficulty, tags, test_cases, starter_code, time_limit_ms, memory_limit_kb)
VALUES (
    'valid-anagram',
    'Valid Anagram',
    'Given two strings s and t, return true if t is an anagram of s, and false otherwise. Constraints: 1 <= s.length, t.length <= 5 * 10^4. s and t consist of lowercase English letters.',
    'easy',
    ARRAY['string','hash-map'],
    '[{"input": "\"anagram\"\n\"nagaram\"", "expected_output": "true", "is_hidden": false}, {"input": "\"rat\"\n\"car\"", "expected_output": "false", "is_hidden": false}, {"input": "\"a\"\n\"a\"", "expected_output": "true", "is_hidden": true}]'::jsonb,
    '{"python": "def isAnagram(s: str, t: str) -> bool:\n    pass", "javascript": "function isAnagram(s, t) {\n    \n}", "cpp": "bool isAnagram(string s, string t) {\n    return false;\n}", "java": "public boolean isAnagram(String s, String t) {\n    return false;\n}"}'::jsonb,
    2000,
    131072
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO problems (slug, title, description, difficulty, tags, test_cases, starter_code, time_limit_ms, memory_limit_kb)
VALUES (
    'binary-search',
    'Binary Search',
    'Given an array of integers nums which is sorted in ascending order, and an integer target, write a function to search target in nums. If target exists, then return its index. Otherwise, return -1. Constraints: 1 <= nums.length <= 10^4. -10^4 < nums[i], target < 10^4. All the integers in nums are unique. nums is sorted in ascending order.',
    'easy',
    ARRAY['array','binary-search'],
    '[{"input": "[-1,0,3,5,9,12]\n9", "expected_output": "4", "is_hidden": false}, {"input": "[-1,0,3,5,9,12]\n2", "expected_output": "-1", "is_hidden": false}, {"input": "[5]\n5", "expected_output": "0", "is_hidden": true}]'::jsonb,
    '{"python": "def search(nums: list[int], target: int) -> int:\n    pass", "javascript": "function search(nums, target) {\n    \n}", "cpp": "int search(vector& nums, int target) {\n    return 0;\n}", "java": "public int search(int[] nums, int target) {\n    return 0;\n}"}'::jsonb,
    2000,
    131072
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO problems (slug, title, description, difficulty, tags, test_cases, starter_code, time_limit_ms, memory_limit_kb)
VALUES (
    'palindrome-number',
    'Palindrome Number',
    'Given an integer x, return true if x is a palindrome, and false otherwise. Constraints: -2^31 <= x <= 2^31 - 1.',
    'easy',
    ARRAY['math','string'],
    '[{"input": "121", "expected_output": "true", "is_hidden": false}, {"input": "-121", "expected_output": "false", "is_hidden": false}, {"input": "10", "expected_output": "false", "is_hidden": true}]'::jsonb,
    '{"python": "def isPalindrome(x: int) -> bool:\n    pass", "javascript": "function isPalindrome(x) {\n    \n}", "cpp": "bool isPalindrome(int x) {\n    return false;\n}", "java": "public boolean isPalindrome(int x) {\n    return false;\n}"}'::jsonb,
    2000,
    131072
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO problems (slug, title, description, difficulty, tags, test_cases, starter_code, time_limit_ms, memory_limit_kb)
VALUES (
    'invert-binary-tree',
    'Invert Binary Tree',
    'Given the root of a binary tree, invert the tree, and return its root. Constraints: The number of nodes in the tree is in the range [0, 100]. -100 <= Node.val <= 100.',
    'easy',
    ARRAY['tree','binary-tree'],
    '[{"input": "[4,2,7,1,3,6,9]", "expected_output": "[4,7,2,9,6,3,1]", "is_hidden": false}, {"input": "[2,1,3]", "expected_output": "[2,3,1]", "is_hidden": false}, {"input": "[]", "expected_output": "[]", "is_hidden": true}]'::jsonb,
    '{"python": "def invertTree(root: Optional[TreeNode]) -> Optional[TreeNode]:\n    pass", "javascript": "function invertTree(root) {\n    \n}", "cpp": "TreeNode* invertTree(TreeNode* root) {\n    return nullptr;\n}", "java": "public TreeNode invertTree(TreeNode root) {\n    return null;\n}"}'::jsonb,
    2000,
    131072
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO problems (slug, title, description, difficulty, tags, test_cases, starter_code, time_limit_ms, memory_limit_kb)
VALUES (
    'contains-duplicate',
    'Contains Duplicate',
    'Given an integer array nums, return true if any value appears at least twice in the array, and return false if every element is distinct. Constraints: 1 <= nums.length <= 10^5. -10^9 <= nums[i] <= 10^9.',
    'easy',
    ARRAY['array','hash-map'],
    '[{"input": "[1,2,3,1]", "expected_output": "true", "is_hidden": false}, {"input": "[1,2,3,4]", "expected_output": "false", "is_hidden": false}, {"input": "[1,1,1,3,3,4,3,2,4,2]", "expected_output": "true", "is_hidden": true}]'::jsonb,
    '{"python": "def containsDuplicate(nums: list[int]) -> bool:\n    pass", "javascript": "function containsDuplicate(nums) {\n    \n}", "cpp": "bool containsDuplicate(vector& nums) {\n    return false;\n}", "java": "public boolean containsDuplicate(int[] nums) {\n    return false;\n}"}'::jsonb,
    2000,
    131072
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO problems (slug, title, description, difficulty, tags, test_cases, starter_code, time_limit_ms, memory_limit_kb)
VALUES (
    'longest-substring-without-repeating-characters',
    'Longest Substring Without Repeating Characters',
    'Given a string s, find the length of the longest substring without repeating characters. Constraints: 0 <= s.length <= 5 * 10^4. s consists of English letters, digits, symbols and spaces.',
    'medium',
    ARRAY['string','sliding-window','hash-map'],
    '[{"input": "\"abcabcbb\"", "expected_output": "3", "is_hidden": false}, {"input": "\"bbbbb\"", "expected_output": "1", "is_hidden": false}, {"input": "\"pwwkew\"", "expected_output": "3", "is_hidden": true}]'::jsonb,
    '{"python": "def lengthOfLongestSubstring(s: str) -> int:\n    pass", "javascript": "function lengthOfLongestSubstring(s) {\n    \n}", "cpp": "int lengthOfLongestSubstring(string s) {\n    return 0;\n}", "java": "public int lengthOfLongestSubstring(String s) {\n    return 0;\n}"}'::jsonb,
    2000,
    131072
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO problems (slug, title, description, difficulty, tags, test_cases, starter_code, time_limit_ms, memory_limit_kb)
VALUES (
    'course-schedule',
    'Course Schedule',
    'There are a total of numCourses courses you have to take, labeled from 0 to numCourses - 1. You are given an array prerequisites where prerequisites[i] = [ai, bi] indicates that you must take course bi first if you want to take course ai. Return true if you can finish all courses. Otherwise, return false. Constraints: 1 <= numCourses <= 2000. 0 <= prerequisites.length <= 5000. prerequisites[i].length == 2.',
    'medium',
    ARRAY['graph','topological-sort'],
    '[{"input": "2\n[[1,0]]", "expected_output": "true", "is_hidden": false}, {"input": "2\n[[1,0],[0,1]]", "expected_output": "false", "is_hidden": false}, {"input": "3\n[[1,0],[2,1]]", "expected_output": "true", "is_hidden": true}]'::jsonb,
    '{"python": "def canFinish(numCourses: int, prerequisites: list[list[int]]) -> bool:\n    pass", "javascript": "function canFinish(numCourses, prerequisites) {\n    \n}", "cpp": "bool canFinish(int numCourses, vector<vector>& prerequisites) {\n    return false;\n}", "java": "public boolean canFinish(int numCourses, int[][] prerequisites) {\n    return false;\n}"}'::jsonb,
    2000,
    131072
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO problems (slug, title, description, difficulty, tags, test_cases, starter_code, time_limit_ms, memory_limit_kb)
VALUES (
    'coin-change',
    'Coin Change',
    'You are given an integer array coins representing coins of different denominations and an integer amount representing a total amount of money. Return the fewest number of coins that you need to make up that amount. If that amount of money cannot be made up by any combination of the coins, return -1. Constraints: 1 <= coins.length <= 12. 1 <= coins[i] <= 2^31 - 1. 0 <= amount <= 10^4.',
    'medium',
    ARRAY['array','dynamic-programming'],
    '[{"input": "[1,2,5]\n11", "expected_output": "3", "is_hidden": false}, {"input": "[2]\n3", "expected_output": "-1", "is_hidden": false}, {"input": "[1]\n0", "expected_output": "0", "is_hidden": true}]'::jsonb,
    '{"python": "def coinChange(coins: list[int], amount: int) -> int:\n    pass", "javascript": "function coinChange(coins, amount) {\n    \n}", "cpp": "int coinChange(vector& coins, int amount) {\n    return 0;\n}", "java": "public int coinChange(int[] coins, int amount) {\n    return 0;\n}"}'::jsonb,
    2000,
    131072
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO problems (slug, title, description, difficulty, tags, test_cases, starter_code, time_limit_ms, memory_limit_kb)
VALUES (
    'daily-temperatures',
    'Daily Temperatures',
    'Given an array of integers temperatures represents the daily temperatures, return an array answer such that answer[i] is the number of days you have to wait after the ith day to get a warmer temperature. If there is no future day for which this is possible, keep answer[i] == 0 instead. Constraints: 1 <= temperatures.length <= 10^5. 30 <= temperatures[i] <= 100.',
    'medium',
    ARRAY['array','stack'],
    '[{"input": "[73,74,75,71,69,72,76,73]", "expected_output": "[1,1,4,2,1,1,0,0]", "is_hidden": false}, {"input": "[30,40,50,60]", "expected_output": "[1,1,1,0]", "is_hidden": false}, {"input": "[30,60,90]", "expected_output": "[1,1,0]", "is_hidden": true}]'::jsonb,
    '{"python": "def dailyTemperatures(temperatures: list[int]) -> list[int]:\n    pass", "javascript": "function dailyTemperatures(temperatures) {\n    \n}", "cpp": "vector dailyTemperatures(vector& temperatures) {\n    return {};\n}", "java": "public int[] dailyTemperatures(int[] temperatures) {\n    return new int[]{};\n}"}'::jsonb,
    2000,
    131072
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO problems (slug, title, description, difficulty, tags, test_cases, starter_code, time_limit_ms, memory_limit_kb)
VALUES (
    'combinations',
    'Combinations',
    'Given two integers n and k, return all possible combinations of k numbers chosen from the range [1, n]. You may return the answer in any order. Constraints: 1 <= n <= 20. 1 <= k <= n.',
    'medium',
    ARRAY['backtracking'],
    '[{"input": "4\n2", "expected_output": "[[1,2],[1,3],[1,4],[2,3],[2,4],[3,4]]", "is_hidden": false}, {"input": "1\n1", "expected_output": "[[1]]", "is_hidden": false}, {"input": "3\n3", "expected_output": "[[1,2,3]]", "is_hidden": true}]'::jsonb,
    '{"python": "def combine(n: int, k: int) -> list[list[int]]:\n    pass", "javascript": "function combine(n, k) {\n    \n}", "cpp": "vector<vector> combine(int n, int k) {\n    return {};\n}", "java": "public List<List> combine(int n, int k) {\n    return new ArrayList<>();\n}"}'::jsonb,
    2000,
    131072
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO problems (slug, title, description, difficulty, tags, test_cases, starter_code, time_limit_ms, memory_limit_kb)
VALUES (
    'trapping-rain-water',
    'Trapping Rain Water',
    'Given n non-negative integers representing an elevation map where the width of each bar is 1, compute how much water it can trap after raining. Constraints: n == height.length. 1 <= n <= 2 * 10^4. 0 <= height[i] <= 10^5.',
    'hard',
    ARRAY['array','two-pointers'],
    '[{"input": "[0,1,0,2,1,0,1,3,2,1,2,1]", "expected_output": "6", "is_hidden": false}, {"input": "[4,2,0,3,2,5]", "expected_output": "9", "is_hidden": false}, {"input": "[1,2,3]", "expected_output": "0", "is_hidden": true}]'::jsonb,
    '{"python": "def trap(height: list[int]) -> int:\n    pass", "javascript": "function trap(height) {\n    \n}", "cpp": "int trap(vector& height) {\n    return 0;\n}", "java": "public int trap(int[] height) {\n    return 0;\n}"}'::jsonb,
    2000,
    131072
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO problems (slug, title, description, difficulty, tags, test_cases, starter_code, time_limit_ms, memory_limit_kb)
VALUES (
    'reverse-nodes-in-k-group',
    'Reverse Nodes in k-Group',
    'Given the head of a linked list, reverse the nodes of the list k at a time, and return the modified list. k is a positive integer and is less than or equal to the length of the linked list. If the number of nodes is not a multiple of k then left-out nodes, in the end, should remain as it is. You may not alter the values in the list''s nodes, only nodes themselves may be changed. Constraints: The number of nodes in the list is in the range sz. 1 <= sz <= 5000. 0 <= Node.val <= 1000. 1 <= k <= sz.',
    'hard',
    ARRAY['linked-list','recursion'],
    '[{"input": "[1,2,3,4,5]\n2", "expected_output": "[2,1,4,3,5]", "is_hidden": false}, {"input": "[1,2,3,4,5]\n3", "expected_output": "[3,2,1,4,5]", "is_hidden": false}, {"input": "[1,2,3,4,5]\n1", "expected_output": "[1,2,3,4,5]", "is_hidden": true}]'::jsonb,
    '{"python": "def reverseKGroup(head: Optional[ListNode], k: int) -> Optional[ListNode]:\n    pass", "javascript": "function reverseKGroup(head, k) {\n    \n}", "cpp": "ListNode* reverseKGroup(ListNode* head, int k) {\n    return nullptr;\n}", "java": "public ListNode reverseKGroup(ListNode head, int k) {\n    return null;\n}"}'::jsonb,
    2000,
    131072
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO problems (slug, title, description, difficulty, tags, test_cases, starter_code, time_limit_ms, memory_limit_kb)
VALUES (
    'n-queens',
    'N-Queens',
    'The n-queens puzzle is the problem of placing n queens on an n x n chessboard such that no two queens attack each other. Given an integer n, return all distinct solutions to the n-queens puzzle. You may return the answer in any order. Each solution contains a distinct board configuration of the n-queens'' placement, where ''Q'' and ''.'' both indicate a queen and an empty space, respectively. Constraints: 1 <= n <= 9.',
    'hard',
    ARRAY['array','backtracking'],
    '[{"input": "4", "expected_output": "[[\".Q..\",\"...Q\",\"Q...\",\"..Q.\"],[\"..Q.\",\"Q...\",\"...Q\",\".Q..\"]]", "is_hidden": false}, {"input": "1", "expected_output": "[[\"Q\"]]", "is_hidden": false}, {"input": "2", "expected_output": "[]", "is_hidden": true}]'::jsonb,
    '{"python": "def solveNQueens(n: int) -> list[list[str]]:\n    pass", "javascript": "function solveNQueens(n) {\n    \n}", "cpp": "vector<vector> solveNQueens(int n) {\n    return {};\n}", "java": "public List<List> solveNQueens(int n) {\n    return new ArrayList<>();\n}"}'::jsonb,
    2000,
    131072
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO problems (slug, title, description, difficulty, tags, test_cases, starter_code, time_limit_ms, memory_limit_kb)
VALUES (
    'edit-distance',
    'Edit Distance',
    'Given two strings word1 and word2, return the minimum number of operations required to convert word1 to word2. You have the following three operations permitted on a word: Insert a character, Delete a character, Replace a character. Constraints: 0 <= word1.length, word2.length <= 500. word1 and word2 consist of lowercase English letters.',
    'hard',
    ARRAY['string','dynamic-programming'],
    '[{"input": "\"horse\"\n\"ros\"", "expected_output": "3", "is_hidden": false}, {"input": "\"intention\"\n\"execution\"", "expected_output": "5", "is_hidden": false}, {"input": "\"\"\n\"a\"", "expected_output": "1", "is_hidden": true}]'::jsonb,
    '{"python": "def minDistance(word1: str, word2: str) -> int:\n    pass", "javascript": "function minDistance(word1, word2) {\n    \n}", "cpp": "int minDistance(string word1, string word2) {\n    return 0;\n}", "java": "public int minDistance(String word1, String word2) {\n    return 0;\n}"}'::jsonb,
    2000,
    131072
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO problems (slug, title, description, difficulty, tags, test_cases, starter_code, time_limit_ms, memory_limit_kb)
VALUES (
    'word-ladder',
    'Word Ladder',
    'A transformation sequence from word beginWord to word endWord using a dictionary wordList is a sequence of words beginWord -> s1 -> s2 -> ... -> sk such that: Every adjacent pair of words differs by a single letter. Every si for 1 <= i <= k is in wordList. Note that beginWord does not need to be in wordList. sk == endWord. Given two words, beginWord and endWord, and a dictionary wordList, return the number of words in the shortest transformation sequence from beginWord to endWord, or 0 if no such sequence exists. Constraints: 1 <= beginWord.length <= 10. endWord.length == beginWord.length. 1 <= wordList.length <= 5000. wordList[i].length == beginWord.length. beginWord, endWord, and wordList[i] consist of lowercase English letters. beginWord != endWord. All the words in wordList are unique.',
    'hard',
    ARRAY['graph','breadth-first-search'],
    '[{"input": "\"hit\"\n\"cog\"\n[\"hot\",\"dot\",\"dog\",\"lot\",\"log\",\"cog\"]", "expected_output": "5", "is_hidden": false}, {"input": "\"hit\"\n\"cog\"\n[\"hot\",\"dot\",\"dog\",\"lot\",\"log\"]", "expected_output": "0", "is_hidden": false}, {"input": "\"a\"\n\"c\"\n[\"a\",\"b\",\"c\"]", "expected_output": "2", "is_hidden": true}]'::jsonb,
    '{"python": "def ladderLength(beginWord: str, endWord: str, wordList: list[str]) -> int:\n    pass", "javascript": "function ladderLength(beginWord, endWord, wordList) {\n    \n}", "cpp": "int ladderLength(string beginWord, string endWord, vector& wordList) {\n    return 0;\n}", "java": "public int ladderLength(String beginWord, String endWord, List wordList) {\n    return 0;\n}"}'::jsonb,
    2000,
    131072
) ON CONFLICT (slug) DO NOTHING;

