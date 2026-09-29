package main

func main() {
	check("ints", func() (any, any) { return Unique([]int{1, 2, 2, 3, 3, 7, 7, 4, 4, 4, 4, 5}), []int{1, 2, 3, 7, 4, 5} })
	check("names", func() (any, any) {
		return Unique([]string{"Lupa", "Lupa", "Pupa", "Lupa"}), []string{"Lupa", "Pupa"}
	})
	check("keeps first order", func() (any, any) { return Unique([]int{3, 1, 3, 2, 1}), []int{3, 1, 2} })
	check("empty gives empty", func() (any, any) { return Unique([]int{}), []int{} })
	ok("does not change the input", func() (bool, string) {
		in := []int{1, 1, 2}
		Unique(in)
		return in[0] == 1 && in[1] == 1 && in[2] == 2, "the input slice was modified"
	})
	done()
}
