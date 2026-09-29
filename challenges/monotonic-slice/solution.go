package main

func IsMonotonic(nums []int) bool {
	inc, dec := true, true
	for i := 1; i < len(nums); i++ {
		if nums[i] > nums[i-1] {
			dec = false
		} else if nums[i] < nums[i-1] {
			inc = false
		}
		if !inc && !dec {
			return false
		}
	}
	return true
}
