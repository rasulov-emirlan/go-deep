package main

func main() {
	check("non-decreasing", func() (any, any) { return IsMonotonic([]int{1, 2, 2, 3}), true })
	check("non-increasing", func() (any, any) { return IsMonotonic([]int{3, 3, 1}), true })
	check("up then down", func() (any, any) { return IsMonotonic([]int{1, 3, 2}), false })
	check("down then up late", func() (any, any) { return IsMonotonic([]int{5, 5, 4, 4, 6}), false })
	check("all equal", func() (any, any) { return IsMonotonic([]int{2, 2, 2}), true })
	check("empty and single", func() (any, any) { return IsMonotonic(nil) && IsMonotonic([]int{7}), true })
	done()
}
