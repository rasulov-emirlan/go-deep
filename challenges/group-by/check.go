package main

type review struct {
	Text   string
	Rating int
}

type sale struct{ Good, City string }

func main() {
	check("reviews by rating", func() (any, any) {
		rs := []review{{"Great", 5}, {"Bad", 1}, {"As described", 5}, {"Meh", 3}}
		return GroupBy(rs, func(r review) int { return r.Rating }),
			map[int][]review{5: {{"Great", 5}, {"As described", 5}}, 1: {{"Bad", 1}}, 3: {{"Meh", 3}}}
	})
	check("sales by city keep input order", func() (any, any) {
		ss := []sale{{"Item1", "Moscow"}, {"Item2", "Kazan"}, {"Item3", "Moscow"}}
		return GroupBy(ss, func(s sale) string { return s.City }),
			map[string][]sale{"Moscow": {{"Item1", "Moscow"}, {"Item3", "Moscow"}}, "Kazan": {{"Item2", "Kazan"}}}
	})
	check("words by length", func() (any, any) {
		return GroupBy([]string{"go", "rust", "c", "zig", "js"}, func(s string) int { return len(s) }),
			map[int][]string{2: {"go", "js"}, 4: {"rust"}, 1: {"c"}, 3: {"zig"}}
	})
	check("empty gives empty map", func() (any, any) {
		return GroupBy([]int{}, func(n int) bool { return n > 0 }), map[bool][]int{}
	})
	done()
}
