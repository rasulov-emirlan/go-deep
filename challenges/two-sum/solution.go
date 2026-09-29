package main

func TwoSum(nums []int, target int) []int {
	seen := make(map[int]int, len(nums))
	for i, v := range nums {
		if j, found := seen[target-v]; found {
			return []int{j, i}
		}
		seen[v] = i
	}
	return nil
}
