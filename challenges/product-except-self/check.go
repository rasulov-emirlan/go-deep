package main

func main() {
	check("example", func() (any, any) { return ProductExceptSelf([]int{1, 2, 3}), []int{6, 3, 2} })
	check("one zero", func() (any, any) { return ProductExceptSelf([]int{2, 0, 4}), []int{0, 8, 0} })
	check("two zeros", func() (any, any) { return ProductExceptSelf([]int{0, 0, 5}), []int{0, 0, 0} })
	check("negatives", func() (any, any) { return ProductExceptSelf([]int{-1, 2, -3, 4}), []int{-24, 12, -8, 6} })
	check("single element", func() (any, any) { return ProductExceptSelf([]int{7}), []int{1} })
	check("empty gives empty", func() (any, any) { return ProductExceptSelf([]int{}), []int{} })
	done()
}
