package main

func main() {
	check("example", func() (any, any) { return TwoSum([]int{2, 7, 11, 15}, 9), []int{0, 1} })
	check("not with itself", func() (any, any) { return TwoSum([]int{3, 2, 4}, 6), []int{1, 2} })
	check("equal values", func() (any, any) { return TwoSum([]int{3, 3}, 6), []int{0, 1} })
	check("negatives", func() (any, any) { return TwoSum([]int{-3, 4, 3, 90}, 0), []int{0, 2} })
	check("no pair gives nil", func() (any, any) { return TwoSum([]int{1, 2, 5}, 100), []int(nil) })
	done()
}
