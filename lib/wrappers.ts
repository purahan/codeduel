export function generatePythonWrapper(code: string, problemId: string): string {
  let prefix = `
import sys
import json
from collections import deque

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def build_tree(lst):
    if not lst: return None
    root = TreeNode(lst[0])
    queue = deque([root])
    i = 1
    while queue and i < len(lst):
        node = queue.popleft()
        if lst[i] is not None:
            node.left = TreeNode(lst[i])
            queue.append(node.left)
        i += 1
        if i < len(lst) and lst[i] is not None:
            node.right = TreeNode(lst[i])
            queue.append(node.right)
        i += 1
    return root

def serialize_tree(root):
    if not root: return []
    result = []
    queue = deque([root])
    while queue:
        node = queue.popleft()
        if node:
            result.append(node.val)
            queue.append(node.left)
            queue.append(node.right)
        else:
            result.append(None)
    while result and result[-1] is None:
        result.pop()
    return result

def build_list(lst):
    dummy = ListNode(0)
    curr = dummy
    for val in lst:
        curr.next = ListNode(val)
        curr = curr.next
    return dummy.next

def serialize_list(head):
    res = []
    while head:
        res.append(head.val)
        head = head.next
    return res
`;

  let suffix = `
if __name__ == '__main__':
    import traceback
    input_data = sys.stdin.read().strip().split('\\n')
    if not input_data or input_data == ['']:
        print("null")
    else:
        try:
`;

  if (problemId === "invert-binary-tree") {
    suffix += `
            lst = json.loads(input_data[0])
            root = build_tree(lst)
            res = invertTree(root)
            print(json.dumps(serialize_tree(res)).replace(' ', ''))
`;
  } else if (problemId === "valid-anagram") {
    suffix += `
            s = input_data[0]
            t = input_data[1]
            res = isAnagram(s, t)
            print(json.dumps(res).lower())
`;
  } else if (problemId === "binary-search") {
    suffix += `
            nums = json.loads(input_data[0])
            target = json.loads(input_data[1])
            res = search(nums, target)
            print(json.dumps(res))
`;
  } else if (problemId === "palindrome-number") {
    suffix += `
            x = json.loads(input_data[0])
            res = isPalindrome(x)
            print(json.dumps(res).lower())
`;
  } else if (problemId === "contains-duplicate") {
    suffix += `
            nums = json.loads(input_data[0])
            res = containsDuplicate(nums)
            print(json.dumps(res).lower())
`;
  } else if (problemId === "longest-substring-without-repeating-characters") {
    suffix += `
            s = input_data[0]
            res = lengthOfLongestSubstring(s)
            print(json.dumps(res))
`;
  } else if (problemId === "course-schedule") {
    suffix += `
            numCourses = json.loads(input_data[0])
            prerequisites = json.loads(input_data[1])
            res = canFinish(numCourses, prerequisites)
            print(json.dumps(res).lower())
`;
  } else if (problemId === "coin-change") {
    suffix += `
            coins = json.loads(input_data[0])
            amount = json.loads(input_data[1])
            res = coinChange(coins, amount)
            print(json.dumps(res))
`;
  } else if (problemId === "daily-temperatures") {
    suffix += `
            temperatures = json.loads(input_data[0])
            res = dailyTemperatures(temperatures)
            print(json.dumps(res).replace(' ', ''))
`;
  } else if (problemId === "combinations") {
    suffix += `
            n = json.loads(input_data[0])
            k = json.loads(input_data[1])
            res = combine(n, k)
            print(json.dumps(res).replace(' ', ''))
`;
  } else if (problemId === "trapping-rain-water") {
    suffix += `
            height = json.loads(input_data[0])
            res = trap(height)
            print(json.dumps(res))
`;
  } else if (problemId === "reverse-nodes-in-k-group") {
    suffix += `
            lst = json.loads(input_data[0])
            k = json.loads(input_data[1])
            head = build_list(lst)
            res = reverseKGroup(head, k)
            print(json.dumps(serialize_list(res)).replace(' ', ''))
`;
  } else if (problemId === "n-queens") {
    suffix += `
            n = json.loads(input_data[0])
            res = solveNQueens(n)
            print(json.dumps(res).replace(' ', ''))
`;
  } else if (problemId === "edit-distance") {
    suffix += `
            word1 = input_data[0]
            word2 = input_data[1]
            res = minDistance(word1, word2)
            print(json.dumps(res))
`;
  } else if (problemId === "word-ladder") {
    suffix += `
            beginWord = input_data[0]
            endWord = input_data[1]
            raw = input_data[2].strip()
            if raw.startswith('['):
                raw = raw[1:]
            if raw.endswith(']'):
                raw = raw[:-1]
            wordList = [w.strip() for w in raw.split(',')]
            res = ladderLength(beginWord, endWord, wordList)
            print(json.dumps(res))
`;
  } else {
    suffix += `
            print("Wrapper not implemented for " + "${problemId}")
`;
  }

  suffix += `
        except Exception as e:
            print(traceback.format_exc(), file=sys.stderr)
            sys.exit(1)
`;

  return prefix + "\n" + code + "\n" + suffix;
}

export function generateJavascriptWrapper(code: string, problemId: string): string {
  let prefix = `
class TreeNode {
    constructor(val = 0, left = null, right = null) {
        this.val = val;
        this.left = left;
        this.right = right;
    }
}

class ListNode {
    constructor(val = 0, next = null) {
        this.val = val;
        this.next = next;
    }
}

function buildTree(lst) {
    if (!lst || !lst.length) return null;
    let root = new TreeNode(lst[0]);
    let queue = [root];
    let i = 1;
    while (queue.length > 0 && i < lst.length) {
        let node = queue.shift();
        if (lst[i] !== null) {
            node.left = new TreeNode(lst[i]);
            queue.push(node.left);
        }
        i++;
        if (i < lst.length && lst[i] !== null) {
            node.right = new TreeNode(lst[i]);
            queue.push(node.right);
        }
        i++;
    }
    return root;
}

function serializeTree(root) {
    if (!root) return [];
    let res = [];
    let queue = [root];
    while (queue.length > 0) {
        let node = queue.shift();
        if (node) {
            res.push(node.val);
            queue.push(node.left);
            queue.push(node.right);
        } else {
            res.push(null);
        }
    }
    while (res.length > 0 && res[res.length - 1] === null) {
        res.pop();
    }
    return res;
}

function buildList(lst) {
    let dummy = new ListNode(0);
    let curr = dummy;
    for (let val of lst) {
        curr.next = new ListNode(val);
        curr = curr.next;
    }
    return dummy.next;
}

function serializeList(head) {
    let res = [];
    while (head) {
        res.push(head.val);
        head = head.next;
    }
    return res;
}
`;

  let suffix = `
const fs = require('fs');
const stdinRaw = fs.readFileSync(0, 'utf-8');
const input_data = stdinRaw.trim().split('\\n');
if (!input_data || input_data.length === 0 || input_data[0] === '') {
    console.log("null");
} else {
    try {
`;

  if (problemId === "invert-binary-tree") {
    suffix += `
            let lst = JSON.parse(input_data[0]);
            let root = buildTree(lst);
            let res = invertTree(root);
            console.log(JSON.stringify(serializeTree(res)));
`;
  } else if (problemId === "valid-anagram") {
    suffix += `
            let s = input_data[0];
            let t = input_data[1];
            let res = isAnagram(s, t);
            console.log(JSON.stringify(res));
`;
  } else if (problemId === "binary-search") {
    suffix += `
            let nums = JSON.parse(input_data[0]);
            let target = JSON.parse(input_data[1]);
            let res = search(nums, target);
            console.log(JSON.stringify(res));
`;
  } else if (problemId === "palindrome-number") {
    suffix += `
            let x = JSON.parse(input_data[0]);
            let res = isPalindrome(x);
            console.log(JSON.stringify(res));
`;
  } else if (problemId === "contains-duplicate") {
    suffix += `
            let nums = JSON.parse(input_data[0]);
            let res = containsDuplicate(nums);
            console.log(JSON.stringify(res));
`;
  } else if (problemId === "longest-substring-without-repeating-characters") {
    suffix += `
            let s = input_data[0];
            let res = lengthOfLongestSubstring(s);
            console.log(JSON.stringify(res));
`;
  } else if (problemId === "course-schedule") {
    suffix += `
            let numCourses = JSON.parse(input_data[0]);
            let prerequisites = JSON.parse(input_data[1]);
            let res = canFinish(numCourses, prerequisites);
            console.log(JSON.stringify(res));
`;
  } else if (problemId === "coin-change") {
    suffix += `
            let coins = JSON.parse(input_data[0]);
            let amount = JSON.parse(input_data[1]);
            let res = coinChange(coins, amount);
            console.log(JSON.stringify(res));
`;
  } else if (problemId === "daily-temperatures") {
    suffix += `
            let temperatures = JSON.parse(input_data[0]);
            let res = dailyTemperatures(temperatures);
            console.log(JSON.stringify(res));
`;
  } else if (problemId === "combinations") {
    suffix += `
            let n = JSON.parse(input_data[0]);
            let k = JSON.parse(input_data[1]);
            let res = combine(n, k);
            console.log(JSON.stringify(res));
`;
  } else if (problemId === "trapping-rain-water") {
    suffix += `
            let height = JSON.parse(input_data[0]);
            let res = trap(height);
            console.log(JSON.stringify(res));
`;
  } else if (problemId === "reverse-nodes-in-k-group") {
    suffix += `
            let lst = JSON.parse(input_data[0]);
            let k = JSON.parse(input_data[1]);
            let head = buildList(lst);
            let res = reverseKGroup(head, k);
            console.log(JSON.stringify(serializeList(res)));
`;
  } else if (problemId === "n-queens") {
    suffix += `
            let n = JSON.parse(input_data[0]);
            let res = solveNQueens(n);
            console.log(JSON.stringify(res));
`;
  } else if (problemId === "edit-distance") {
    suffix += `
            let word1 = input_data[0];
            let word2 = input_data[1];
            let res = minDistance(word1, word2);
            console.log(JSON.stringify(res));
`;
  } else if (problemId === "word-ladder") {
    suffix += `
            let beginWord = input_data[0];
            let endWord = input_data[1];
            let raw = input_data[2].trim();
            if (raw.startsWith('[')) raw = raw.slice(1);
            if (raw.endsWith(']')) raw = raw.slice(0, -1);
            let wordList = raw.split(',').map(w => w.trim());
            let res = ladderLength(beginWord, endWord, wordList);
            console.log(JSON.stringify(res));
`;
  } else {
      const camelId = problemId.split('-').map((s,i) => i===0 ? s : s[0].toUpperCase() + s.slice(1)).join('');
      suffix += `
            let args = input_data.map(i => {
                try { return JSON.parse(i); } catch(e) { return i; }
            });
            let res = ${camelId}(...args);
            console.log(JSON.stringify(res));
      `;
  }

  suffix += `
    } catch (e) {
        console.error(e.stack);
        process.exit(1);
    }
}
`;

  return prefix + "\n" + code + "\n" + suffix;
}

export function generateCppWrapper(code: string, problemId: string): string {
  let prefix = `
#include <iostream>
#include <vector>
#include <string>
#include <sstream>
#include <algorithm>

using namespace std;

vector<int> parseArray(string s) {
    vector<int> res;
    s.erase(remove(s.begin(), s.end(), '['), s.end());
    s.erase(remove(s.begin(), s.end(), ']'), s.end());
    s.erase(remove(s.begin(), s.end(), ' '), s.end());
    if (s.empty()) return res;
    stringstream ss(s);
    string item;
    while (getline(ss, item, ',')) {
        res.push_back(stoi(item));
    }
    return res;
}

string stripQuotes(string s) {
    if (s.length() >= 2 && s.front() == '"' && s.back() == '"') {
        return s.substr(1, s.length() - 2);
    }
    return s;
}

void printArray(const vector<int>& arr) {
    cout << "[";
    for(size_t i=0; i<arr.size(); ++i) {
        cout << arr[i] << (i+1 == arr.size() ? "" : ",");
    }
    cout << "]";
}
`;

  let suffix = `
int main() {
    string line1, line2;
    if (!getline(cin, line1)) return 0;
    getline(cin, line2);
`;

  if (problemId === "valid-anagram") {
    suffix += `
    string s = stripQuotes(line1);
    string t = stripQuotes(line2);
    bool res = isAnagram(s, t);
    cout << (res ? "true" : "false") << endl;
`;
  } else if (problemId === "binary-search") {
    suffix += `
    vector<int> nums = parseArray(line1);
    int target = stoi(line2);
    int res = search(nums, target);
    cout << res << endl;
`;
  } else if (problemId === "palindrome-number") {
    suffix += `
    int x = stoi(line1);
    bool res = isPalindrome(x);
    cout << (res ? "true" : "false") << endl;
`;
  } else if (problemId === "contains-duplicate") {
    suffix += `
    vector<int> nums = parseArray(line1);
    bool res = containsDuplicate(nums);
    cout << (res ? "true" : "false") << endl;
`;
  } else if (problemId === "coin-change") {
    suffix += `
    vector<int> coins = parseArray(line1);
    int amount = stoi(line2);
    int res = coinChange(coins, amount);
    cout << res << endl;
`;
  } else if (problemId === "trapping-rain-water") {
    suffix += `
    vector<int> height = parseArray(line1);
    int res = trap(height);
    cout << res << endl;
`;
  } else {
    suffix += `
    cout << "C++ wrapper not fully implemented for this problem." << endl;
`;
  }

  suffix += `
    return 0;
}
`;
  return prefix + "\n" + code + "\n" + suffix;
}

export function generateJavaWrapper(code: string, problemId: string): string {
  let prefix = `
import java.util.*;

class Helper {
    public static int[] parseArray(String s) {
        s = s.replace("[", "").replace("]", "").replace(" ", "");
        if (s.isEmpty()) return new int[0];
        String[] parts = s.split(",");
        int[] res = new int[parts.length];
        for (int i = 0; i < parts.length; i++) {
            res[i] = Integer.parseInt(parts[i]);
        }
        return res;
    }
    public static String stripQuotes(String s) {
        if (s.length() >= 2 && s.startsWith("\\"") && s.endsWith("\\"")) {
            return s.substring(1, s.length() - 1);
        }
        return s;
    }
}

class Solution {
`;

  let suffix = `
}

class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextLine()) return;
        String line1 = sc.nextLine();
        String line2 = sc.hasNextLine() ? sc.nextLine() : "";
        
        Solution sol = new Solution();
`;

  if (problemId === "valid-anagram") {
    suffix += `
        String s = Helper.stripQuotes(line1);
        String t = Helper.stripQuotes(line2);
        boolean res = sol.isAnagram(s, t);
        System.out.println(res);
`;
  } else if (problemId === "binary-search") {
    suffix += `
        int[] nums = Helper.parseArray(line1);
        int target = Integer.parseInt(line2);
        int res = sol.search(nums, target);
        System.out.println(res);
`;
  } else if (problemId === "palindrome-number") {
    suffix += `
        int x = Integer.parseInt(line1);
        boolean res = sol.isPalindrome(x);
        System.out.println(res);
`;
  } else if (problemId === "contains-duplicate") {
    suffix += `
        int[] nums = Helper.parseArray(line1);
        boolean res = sol.containsDuplicate(nums);
        System.out.println(res);
`;
  } else if (problemId === "coin-change") {
    suffix += `
        int[] coins = Helper.parseArray(line1);
        int amount = Integer.parseInt(line2);
        int res = sol.coinChange(coins, amount);
        System.out.println(res);
`;
  } else if (problemId === "trapping-rain-water") {
    suffix += `
        int[] height = Helper.parseArray(line1);
        int res = sol.trap(height);
        System.out.println(res);
`;
  } else {
    suffix += `
        System.out.println("Java wrapper not fully implemented for this problem.");
`;
  }

  suffix += `
    }
}
`;
  return prefix + "\n" + code + "\n" + suffix;
}
