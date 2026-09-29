package main

func SortedSquares(nums []int) []int {
	res := make([]int, len(nums))
	l, r := 0, len(nums)-1
	for k := len(nums) - 1; k >= 0; k-- {
		if a, b := nums[l]*nums[l], nums[r]*nums[r]; a > b {
			res[k] = a
			l++
		} else {
			res[k] = b
			r--
		}
	}
	return res
}
