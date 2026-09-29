package main

import "slices"

func main() {
	check("example", func() (any, any) { return FindDuplicates([]int{4, 3, 2, 7, 8, 2, 3, 1}), []int{2, 3} })
	check("short", func() (any, any) { return FindDuplicates([]int{2, 2, 1}), []int{2} })
	check("order of second copy", func() (any, any) { return FindDuplicates([]int{2, 1, 4, 8, 1, 7, 6, 4}), []int{1, 4} })
	ok("no duplicates gives empty", func() (bool, string) {
		got := FindDuplicates([]int{3, 1, 2})
		return len(got) == 0, "want an empty result"
	})
	ok("input is restored", func() (bool, string) {
		in := []int{4, 3, 2, 7, 8, 2, 3, 1}
		FindDuplicates(in)
		return slices.Equal(in, []int{4, 3, 2, 7, 8, 2, 3, 1}), "the input was left modified"
	})
	done()
}
