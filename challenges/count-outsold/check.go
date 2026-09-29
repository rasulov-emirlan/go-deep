package main

import "slices"

func main() {
	check("example", func() (any, any) { return Outsold([]int{8, 1, 2, 2, 3}), []int{4, 0, 1, 1, 3} })
	check("all equal", func() (any, any) { return Outsold([]int{5, 5, 5, 5}), []int{0, 0, 0, 0} })
	check("descending", func() (any, any) { return Outsold([]int{9, 7, 7, 1}), []int{3, 1, 1, 0} })
	check("empty gives empty", func() (any, any) { return Outsold([]int{}), []int{} })
	ok("does not change the input", func() (bool, string) {
		in := []int{3, 1, 2}
		Outsold(in)
		return slices.Equal(in, []int{3, 1, 2}), "the input slice was modified"
	})
	done()
}
