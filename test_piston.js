const code = `
import sys, json

def combine(n: int, k: int):
    result = []
    
    def backtrack(start: int, current_combination):
        if len(current_combination) == k:
            result.append(list(current_combination))
            return
            
        for i in range(start, n + 1):
            current_combination.append(i)
            backtrack(i + 1, current_combination)
            current_combination.pop()
            
    backtrack(1, [])
    return result

input_data = sys.stdin.read().split()
if len(input_data) >= 2:
    n, k = int(input_data[0]), int(input_data[1])
    print(json.dumps(combine(n, k), separators=(',', ':')))
`;

fetch("https://emkc.org/api/v2/piston/execute", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    language: "python",
    version: "3.10.0",
    files: [{ content: code }],
    stdin: "4\n2"
  })
}).then(r => r.json()).then(console.log).catch(console.error);
