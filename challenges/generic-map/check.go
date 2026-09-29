package main

import (
	"fmt"
	"strconv"
)

func main() {
	check("double ints", func() (any, any) { return Map([]int{1, 2, 3}, func(n int) int { return n * 2 }), []int{2, 4, 6} })
	check("int to string", func() (any, any) { return Map([]int{1, 20}, strconv.Itoa), []string{"1", "20"} })
	check("struct field", func() (any, any) {
		type user struct{ Name string }
		return Map([]user{{"Ann"}, {"Bob"}}, func(u user) string { return u.Name }), []string{"Ann", "Bob"}
	})
	check("empty gives empty", func() (any, any) { return Map([]int{}, strconv.Itoa), []string{} })
	ok("calls f once per element", func() (bool, string) {
		calls := 0
		Map([]int{1, 2, 3, 4}, func(n int) int { calls++; return n })
		return calls == 4, fmt.Sprintf("f was called %d times, want 4", calls)
	})
	done()
}
