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

print(json.dumps(combine(4, 2), separators=(',', ':')))
