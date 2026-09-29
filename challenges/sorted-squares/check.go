package main

func main() {
	check("mixed signs", func() (any, any) { return SortedSquares([]int{-7, -3, 0, 2, 5}), []int{0, 4, 9, 25, 49} })
	check("all negative", func() (any, any) { return SortedSquares([]int{-5, -2, -1}), []int{1, 4, 25} })
	check("all non-negative", func() (any, any) { return SortedSquares([]int{0, 1, 1, 6}), []int{0, 1, 1, 36} })
	check("equal ends", func() (any, any) { return SortedSquares([]int{-3, 3}), []int{9, 9} })
	check("empty gives empty", func() (any, any) { return SortedSquares([]int{}), []int{} })
	done()
}
