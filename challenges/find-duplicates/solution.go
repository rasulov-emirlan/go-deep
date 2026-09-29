package main

func FindDuplicates(nums []int) []int {
	var res []int
	for _, v := range nums {
		i := abs(v) - 1
		if nums[i] < 0 {
			res = append(res, abs(v))
		} else {
			nums[i] = -nums[i]
		}
	}
	for i := range nums {
		nums[i] = abs(nums[i])
	}
	return res
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}
