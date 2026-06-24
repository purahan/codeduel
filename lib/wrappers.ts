export function generatePythonWrapper(code: string, problemId: string): string {
  // If the user's code already has a call to the function or prints, we might not want to wrap it, 
  // but let's assume they only wrote the function definition (LeetCode style).

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
    input_data = sys.stdin.read().strip().split('\\n')
    if not input_data or input_data == ['']: sys.exit(0)
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
  } else {
    // Generic fallback: try to parse first arg and assume one arg function named like problemId
    suffix += `
    print("Wrapper not implemented for " + "${problemId}")
`;
  }

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
const input_data = fs.readFileSync(0, 'utf-8').trim().split('\\n');
if (!input_data || input_data.length === 0 || input_data[0] === '') process.exit(0);
`;

  if (problemId === "invert-binary-tree") {
    suffix += `
    let lst = JSON.parse(input_data[0]);
    let root = buildTree(lst);
    let res = invertTree(root);
    console.log(JSON.stringify(serializeTree(res)));
`;
  } else if (problemId === "combinations") {
    suffix += `
    let n = JSON.parse(input_data[0]);
    let k = JSON.parse(input_data[1]);
    let res = combine(n, k);
    console.log(JSON.stringify(res));
`;
  } else {
      // Very simple generic JS fallback: assume a single arg that is JSON parsed
      // and a function with camelCased problemId
      const camelId = problemId.split('-').map((s,i) => i===0 ? s : s[0].toUpperCase() + s.slice(1)).join('');
      suffix += `
      let args = input_data.map(i => {
          try { return JSON.parse(i); } catch(e) { return i; }
      });
      let res = ${camelId}(...args);
      console.log(JSON.stringify(res));
      `;
  }

  return prefix + "\\n" + code + "\\n" + suffix;
}
